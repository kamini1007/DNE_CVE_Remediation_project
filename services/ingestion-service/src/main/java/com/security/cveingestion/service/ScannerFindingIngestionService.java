package com.security.cveingestion.service;

import com.security.cveingestion.dto.RawCveRecord;
import com.security.cveingestion.dto.scanner.TrivyReport;
import com.security.cveingestion.dto.scanner.TrivyResult;
import com.security.cveingestion.dto.scanner.TrivyVulnerability;
import com.security.cveingestion.entity.ScannerFinding;
import com.security.cveingestion.repository.ScannerFindingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Turns external scanner output into rows in the existing pipeline. Each
 * vulnerability becomes a RawCveRecord (source "SCANNER:trivy", deliberately
 * NOT in CveNormalizerService's authoritative-sources set - NVD/MITRE data
 * always wins over a scanner's own description if both exist for the same
 * CVE) fed through the same upsert logic every other connector uses, plus a
 * ScannerFinding row recording which project/package/version/severity it
 * came from.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ScannerFindingIngestionService {

    private static final Pattern GITHUB_URL_PATTERN =
            Pattern.compile("^https://github\\.com/[\\w.-]+/[\\w.-]+(\\.git)?/?$");

    // CHANGED: was 180s (3 min) - too short for a large repo like this
    // platform's own monorepo (many services, many dependencies). Raised
    // to match the new explicit Trivy --timeout below, with headroom so
    // Java doesn't kill the process just before Trivy's own timeout would
    // have let it finish cleanly.
    private static final long SCAN_TIMEOUT_SECONDS = 900; // 15 minutes

    // Trivy's own internal timeout, passed explicitly via --timeout -
    // previously not set at all, so Trivy fell back to its own default,
    // which the "semaphore acquire: context deadline exceeded" error
    // shows getting hit even under 180s for a repo this size (an internal
    // analyzer-concurrency limit, not just overall scan duration).
    private static final String TRIVY_TIMEOUT = "12m";

    private final JsonMapper objectMapper;
    private final CveNormalizerService normalizerService;
    private final ScannerFindingRepository scannerFindingRepository;

    public record ScanIngestResult(int cvesUpserted, int findingsRecorded, int skippedNonCve) {}

    @Transactional
    public ScanIngestResult ingestTrivyReport(String projectName, String rawJson) {
        TrivyReport report;
        try {
            report = objectMapper.readValue(rawJson, TrivyReport.class);
        } catch (Exception e) {
            throw new IllegalArgumentException("Could not parse Trivy JSON: " + e.getMessage(), e);
        }

        int cvesUpserted = 0;
        int findingsRecorded = 0;
        int skippedNonCve = 0;

        if (report.getResults() != null) {
            for (TrivyResult result : report.getResults()) {
                if (result.getVulnerabilities() == null) continue;

                for (TrivyVulnerability vuln : result.getVulnerabilities()) {
                    if (vuln.getVulnerabilityId() == null || !vuln.getVulnerabilityId().startsWith("CVE-")) {
                        skippedNonCve++;
                        continue;
                    }

                    RawCveRecord raw = RawCveRecord.builder()
                            .cveId(vuln.getVulnerabilityId())
                            .sourceName("SCANNER:trivy")
                            .description(vuln.getTitle() != null ? vuln.getTitle() : vuln.getDescription())
                            .vendor(result.getType())
                            .product(vuln.getPkgName())
                            .referenceUrls(buildReferenceUrls(vuln))
                            .rawJson(serializeVulnerability(vuln))
                            .build();

                    normalizerService.upsert(raw);
                    cvesUpserted++;

                    upsertFinding(vuln.getVulnerabilityId(), projectName, vuln.getPkgName(),
                            vuln.getInstalledVersion(), vuln.getFixedVersion(), vuln.getSeverity(), result.getTarget());
                    findingsRecorded++;
                }
            }
        }

        log.info("Scanner ingestion for project '{}': {} CVE(s) upserted, {} finding(s) recorded, {} non-CVE advisor(y/ies) skipped",
                projectName, cvesUpserted, findingsRecorded, skippedNonCve);
        return new ScanIngestResult(cvesUpserted, findingsRecorded, skippedNonCve);
    }

    public ScanIngestResult runTrivyScan(String projectName, String source) {
        List<String> command = buildTrivyCommand(source);
        log.info("Running scan for project '{}': {}", projectName, String.join(" ", command));

        Process process;
        try {
            process = new ProcessBuilder(command).start();
        } catch (IOException e) {
            throw new IllegalArgumentException(
                    "Could not start Trivy - is it installed and on PATH? " + e.getMessage(), e);
        }

        String stdout;
        String stderr;
        boolean finished;
        try {
            stdout = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            stderr = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
            finished = process.waitFor(SCAN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (IOException e) {
            throw new IllegalArgumentException("Failed reading Trivy output: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalArgumentException("Scan was interrupted", e);
        }

        if (!finished) {
            process.destroyForcibly();
            throw new IllegalArgumentException(
                    "Trivy scan timed out after " + SCAN_TIMEOUT_SECONDS + "s for: " + source);
        }
        if (process.exitValue() != 0) {
            throw new IllegalArgumentException("Trivy exited with code " + process.exitValue() + ": " + stderr);
        }

        return ingestTrivyReport(projectName, stdout);
    }

    private List<String> buildTrivyCommand(String source) {
        if (source == null || source.isBlank()) {
            throw new IllegalArgumentException("source is required (a GitHub URL or a local path)");
        }
        if (GITHUB_URL_PATTERN.matcher(source).matches()) {
            return List.of("trivy", "repo", source, "-f", "json", "--quiet", "--timeout", TRIVY_TIMEOUT);
        }
        Path path;
        try {
            path = Path.of(source);
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    "Not a valid GitHub URL (https://github.com/owner/repo) or filesystem path: " + source);
        }
        if (!Files.isDirectory(path)) {
            throw new IllegalArgumentException(
                    "Not a valid GitHub URL, or not an existing local directory on this machine: " + source);
        }
        return List.of("trivy", "fs", source, "-f", "json", "--quiet", "--timeout", TRIVY_TIMEOUT);
    }

    private List<String> buildReferenceUrls(TrivyVulnerability vuln) {
        List<String> urls = new ArrayList<>();
        if (vuln.getPrimaryUrl() != null) {
            urls.add(vuln.getPrimaryUrl());
        }
        if (vuln.getReferences() != null) {
            urls.addAll(vuln.getReferences());
        }
        return urls;
    }

    private String serializeVulnerability(TrivyVulnerability vuln) {
        try {
            return objectMapper.writeValueAsString(vuln);
        } catch (Exception e) {
            log.warn("Could not serialize raw Trivy vulnerability for {}: {}", vuln.getVulnerabilityId(), e.getMessage());
            return null;
        }
    }

    private void upsertFinding(String cveId, String projectName, String packageName,
                                String installedVersion, String fixedVersion, String severity, String target) {
        ScannerFinding finding = scannerFindingRepository
                .findByCveIdAndProjectNameAndPackageName(cveId, projectName, packageName)
                .orElseGet(ScannerFinding::new);

        finding.setCveId(cveId);
        finding.setProjectName(projectName);
        finding.setPackageName(packageName);
        finding.setInstalledVersion(installedVersion);
        finding.setFixedVersion(pickLatestFixedVersion(fixedVersion));
        finding.setSeverity(severity);
        finding.setScannerSource("trivy");
        finding.setTarget(target);
        finding.setScannedAt(OffsetDateTime.now());

        scannerFindingRepository.save(finding);
    }

    /**
     * Trivy often reports several valid fix versions for one CVE+package,
     * comma-separated (e.g. "11.0.25, 10.1.58, 9.0.121" - any of those
     * major/minor lines resolves it). Previously stored verbatim, showing
     * the whole list in Scanner Findings - now picks just the single
     * highest version, same numeric comparison already used in
     * GitHubPrService for consolidating multiple CVEs on one package.
     * Duplicated here rather than shared, since these are genuinely
     * separate concerns in separate classes - this runs at ingestion
     * time, before any PR exists.
     */
    private String pickLatestFixedVersion(String fixedVersion) {
        if (fixedVersion == null || fixedVersion.isBlank()) {
            return fixedVersion;
        }
        String[] candidates = fixedVersion.split(",");
        if (candidates.length <= 1) {
            return fixedVersion.trim();
        }
        String best = candidates[0].trim();
        for (int i = 1; i < candidates.length; i++) {
            String candidate = candidates[i].trim();
            if (compareVersions(candidate, best) > 0) {
                best = candidate;
            }
        }
        return best;
    }

    /** General-purpose numeric version comparison - see GitHubPrService.compareVersions() for the fuller explanation. */
    private int compareVersions(String v1, String v2) {
        String[] parts1 = v1.split("\\.");
        String[] parts2 = v2.split("\\.");
        int maxLen = Math.max(parts1.length, parts2.length);
        for (int i = 0; i < maxLen; i++) {
            long p1 = i < parts1.length ? leadingDigits(parts1[i]) : 0;
            long p2 = i < parts2.length ? leadingDigits(parts2[i]) : 0;
            if (p1 != p2) {
                return Long.compare(p1, p2);
            }
        }
        return 0;
    }

    private long leadingDigits(String s) {
        StringBuilder digits = new StringBuilder();
        for (char c : s.toCharArray()) {
            if (Character.isDigit(c)) {
                digits.append(c);
            } else {
                break;
            }
        }
        return digits.isEmpty() ? 0 : Long.parseLong(digits.toString());
    }
}
