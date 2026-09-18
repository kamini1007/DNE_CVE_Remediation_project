package com.security.cveingestion.service;

import com.security.cveingestion.dto.github.*;
import com.security.cveingestion.entity.FixPr;
import com.security.cveingestion.entity.ScannerFinding;
import com.security.cveingestion.repository.FixPrRepository;
import com.security.cveingestion.repository.ScannerFindingRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns scanner findings into real GitHub pull requests bumping vulnerable
 * dependencies to their fixed versions.
 *
 * - createFixPr(): one finding, one PR.
 * - createBatchFixPr(): many findings, ONE PR, grouped by
 *   ScannerFinding.target. Accepts an OPTIONAL Jira ticket reference
 *   (key + url) - when present, it's woven into the branch name, PR
 *   title, and PR body.
 *
 * VERSION CONSOLIDATION: when multiple CVEs affect the SAME package within
 * the same file (common - e.g. log4j-core often has several CVEs, each
 * with its own suggested fix version), findings are grouped by package
 * and bumped ONCE to the highest version among them, rather than bumped
 * once per CVE. Bumping sequentially per-CVE would silently overwrite
 * each earlier bump - the file would only ever reflect whichever CVE was
 * processed last, while the recorded history claimed each CVE's own
 * (different, no-longer-true) target version was actually applied.
 *
 * Checks fix_pr history for a prior still-open PR before including a
 * finding, to avoid duplicates.
 *
 * ORPHANED BRANCH CLEANUP: if the commit or PR-open step fails after the
 * branch was created, that branch is deleted automatically.
 *
 * SECURITY: the GitHub token is read from an environment variable only,
 * never accepted as a request parameter, never logged, never returned.
 */
@Service
@Slf4j
public class GitHubPrService {

    private static final String GITHUB_API = "https://api.github.com";

    private final RestTemplate restTemplate;
    private final JsonMapper objectMapper;
    private final ScannerFindingRepository scannerFindingRepository;
    private final FixPrRepository fixPrRepository;
    private final String githubToken;

    public GitHubPrService(
            RestTemplate restTemplate,
            JsonMapper objectMapper,
            ScannerFindingRepository scannerFindingRepository,
            FixPrRepository fixPrRepository,
            @Value("${GITHUB_TOKEN:}") String githubToken) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.scannerFindingRepository = scannerFindingRepository;
        this.fixPrRepository = fixPrRepository;
        this.githubToken = githubToken;
    }

    // ============================================================
    // Single-finding flow
    // ============================================================

    public CreateFixPrResult createFixPr(Long scannerFindingId, String owner, String repo,
                                          String baseBranch, String manifestPath, String requestedBranchName) {
        requireToken();

        ScannerFinding finding = scannerFindingRepository.findById(scannerFindingId)
                .orElseThrow(() -> new IllegalArgumentException("No scanner finding with id " + scannerFindingId));

        if (finding.getFixedVersion() == null || finding.getFixedVersion().isBlank()) {
            throw new IllegalArgumentException(
                    "Scanner finding for " + finding.getCveId() + " has no fixedVersion - Trivy didn't report one, so there's no known-good version to bump to");
        }

        Optional<String> existingPr = findExistingOpenPr(finding.getCveId(), finding.getPackageName(), owner, repo);
        if (existingPr.isPresent()) {
            throw new IllegalArgumentException(
                    finding.getCveId() + " (" + finding.getPackageName() + ") already has an open PR: " + existingPr.get());
        }

        String branch = baseBranch == null || baseBranch.isBlank() ? "main" : baseBranch;

        GitHubFileContent original = callGitHub(
                "fetching " + manifestPath + " from " + owner + "/" + repo + " (branch '" + branch + "')",
                () -> getFileContent(owner, repo, manifestPath, branch));
        String originalText = new String(Base64.getMimeDecoder().decode(original.getContent()), StandardCharsets.UTF_8);

        String updatedText = bumpVersion(originalText, manifestPath, finding.getPackageName(), finding.getFixedVersion());
        if (updatedText.equals(originalText)) {
            throw new IllegalArgumentException(
                    "Could not find '" + finding.getPackageName() + "' at version '" + finding.getInstalledVersion()
                            + "' in " + manifestPath + " - check the package name and manifest path are correct");
        }

        String autoName = "fix/" + sanitizeForBranchName(finding.getCveId()) + "-" + sanitizeForBranchName(finding.getPackageName());
        String newBranchName = resolveBranchName(requestedBranchName, autoName);

        String baseSha = callGitHub(
                "looking up base branch '" + branch + "' in " + owner + "/" + repo,
                () -> getRefSha(owner, repo, branch));
        callGitHubVoid("creating branch '" + newBranchName + "'",
                () -> createBranch(owner, repo, newBranchName, baseSha));

        try {
            String commitMessage = "Fix " + finding.getCveId() + ": bump " + finding.getPackageName()
                    + " to " + finding.getFixedVersion();
            callGitHubVoid("committing the updated " + manifestPath + " to '" + newBranchName + "'",
                    () -> updateFile(owner, repo, manifestPath, commitMessage, updatedText, original.getSha(), newBranchName));

            String explanation = buildExplanation(finding, manifestPath);
            GitHubPullRequest pr = callGitHub("opening the pull request",
                    () -> createPullRequest(owner, repo, newBranchName, branch, commitMessage, explanation));

            log.info("Opened PR #{} ({}) for {} in {}/{}", pr.getNumber(), pr.getHtmlUrl(), finding.getCveId(), owner, repo);

            saveFixPrRecordAt(finding.getId(), finding.getCveId(), finding.getPackageName(), finding.getInstalledVersion(),
                    finding.getFixedVersion(), owner, repo, newBranchName, pr, explanation, OffsetDateTime.now(), null, null);

            return new CreateFixPrResult(
                    pr.getHtmlUrl(), pr.getNumber(), newBranchName, manifestPath,
                    finding.getPackageName(), finding.getInstalledVersion(), finding.getFixedVersion(),
                    finding.getCveId(), explanation);
        } catch (RuntimeException e) {
            cleanupOrphanedBranch(owner, repo, newBranchName);
            throw e;
        }
    }

    // ============================================================
    // Batch flow - many findings, one PR
    // ============================================================

    public BatchCreateFixPrResult createBatchFixPr(List<Long> findingIds, String owner, String repo,
                                                     String baseBranch, String requestedBranchName) {
        return createBatchFixPr(findingIds, owner, repo, baseBranch, requestedBranchName, null, null);
    }

    /**
     * @param jiraTicketKey optional (e.g. "SCRUM-123") - when present, woven
     *                      into the branch name (if requestedBranchName is
     *                      blank), the PR title, and the PR body.
     * @param jiraTicketUrl optional - included as a link in the PR body if
     *                      jiraTicketKey is also present.
     */
    public BatchCreateFixPrResult createBatchFixPr(List<Long> findingIds, String owner, String repo,
                                                     String baseBranch, String requestedBranchName,
                                                     String jiraTicketKey, String jiraTicketUrl) {
        requireToken();

        if (findingIds == null || findingIds.isEmpty()) {
            throw new IllegalArgumentException("No findings selected");
        }

        String branch = baseBranch == null || baseBranch.isBlank() ? "main" : baseBranch;
        List<ScannerFinding> findings = scannerFindingRepository.findAllById(findingIds);

        List<String> skipped = new ArrayList<>();
        Map<String, List<ScannerFinding>> byFile = new LinkedHashMap<>();
        for (ScannerFinding f : findings) {
            if (f.getFixedVersion() == null || f.getFixedVersion().isBlank()) {
                skipped.add(f.getCveId() + " (" + f.getPackageName() + "): scanner didn't report a fixed version");
                continue;
            }
            if (f.getTarget() == null || f.getTarget().isBlank()) {
                skipped.add(f.getCveId() + " (" + f.getPackageName() + "): scanner didn't record which file it came from");
                continue;
            }

            Optional<String> existingPr = findExistingOpenPr(f.getCveId(), f.getPackageName(), owner, repo);
            if (existingPr.isPresent()) {
                skipped.add(f.getCveId() + " (" + f.getPackageName() + "): already has an open PR - " + existingPr.get());
                continue;
            }

            byFile.computeIfAbsent(f.getTarget(), k -> new ArrayList<>()).add(f);
        }

        if (byFile.isEmpty()) {
            throw new IllegalArgumentException(
                    "None of the selected findings could be included - " + String.join("; ", skipped));
        }

        String autoName = (jiraTicketKey != null && !jiraTicketKey.isBlank())
                ? "fix/" + sanitizeForBranchName(jiraTicketKey)
                : "fix/batch-" + System.currentTimeMillis();
        String newBranchName = resolveBranchName(requestedBranchName, autoName);

        String baseSha = callGitHub("looking up base branch '" + branch + "' in " + owner + "/" + repo,
                () -> getRefSha(owner, repo, branch));
        callGitHubVoid("creating branch '" + newBranchName + "'",
                () -> createBranch(owner, repo, newBranchName, baseSha));

        try {
            List<BatchFixItem> included = new ArrayList<>();

            for (Map.Entry<String, List<ScannerFinding>> entry : byFile.entrySet()) {
                String manifestPath = entry.getKey();
                List<ScannerFinding> fileFindings = entry.getValue();

                GitHubFileContent original = callGitHub(
                        "fetching " + manifestPath + " from " + owner + "/" + repo,
                        () -> getFileContent(owner, repo, manifestPath, branch));
                String originalContent = new String(Base64.getMimeDecoder().decode(original.getContent()), StandardCharsets.UTF_8);
                String content = originalContent;

                // Group by package WITHIN this file - several CVEs can share
                // one package, each suggesting a different fix version. Bump
                // once per package, to the single highest version among them,
                // not once per CVE (which would silently overwrite itself).
                Map<String, List<ScannerFinding>> byPackage = new LinkedHashMap<>();
                for (ScannerFinding f : fileFindings) {
                    byPackage.computeIfAbsent(f.getPackageName(), k -> new ArrayList<>()).add(f);
                }

                for (Map.Entry<String, List<ScannerFinding>> pkgEntry : byPackage.entrySet()) {
                    List<ScannerFinding> pkgFindings = pkgEntry.getValue();
                    String resolvedVersion = pkgFindings.stream()
                            .map(ScannerFinding::getFixedVersion)
                            .max(this::compareVersions)
                            .orElseThrow();

                    String updated = bumpVersion(content, manifestPath, pkgEntry.getKey(), resolvedVersion);
                    if (updated.equals(content)) {
                        for (ScannerFinding f : pkgFindings) {
                            skipped.add(f.getCveId() + " (" + f.getPackageName() + "): couldn't find it at the expected version in " + manifestPath);
                        }
                        continue;
                    }
                    content = updated;

                    // Every CVE covered by this package gets the SAME resolved
                    // version recorded - that's genuinely what ends up in the
                    // file, regardless of which lower version any individual
                    // CVE originally suggested.
                    for (ScannerFinding f : pkgFindings) {
                        included.add(new BatchFixItem(f.getId(), f.getCveId(), f.getPackageName(),
                                f.getInstalledVersion(), resolvedVersion, manifestPath));
                    }
                }

                if (!content.equals(originalContent)) {
                    String commitMessage = buildCommitMessage(fileFindings.size(), manifestPath, jiraTicketKey);
                    String finalContent = content;
                    callGitHubVoid("committing the updated " + manifestPath + " to '" + newBranchName + "'",
                            () -> updateFile(owner, repo, manifestPath, commitMessage, finalContent, original.getSha(), newBranchName));
                }
            }

            if (included.isEmpty()) {
                throw new IllegalArgumentException(
                        "None of the selected findings could actually be applied - " + String.join("; ", skipped));
            }

            String title = buildPrTitle(included.size(), jiraTicketKey);
            String body = buildBatchExplanation(included, skipped, jiraTicketKey, jiraTicketUrl);
            GitHubPullRequest pr = callGitHub("opening the pull request",
                    () -> createPullRequest(owner, repo, newBranchName, branch, title, body));

            log.info("Opened batch PR #{} ({}) with {} fix(es) in {}/{}{}", pr.getNumber(), pr.getHtmlUrl(), included.size(), owner, repo,
                    jiraTicketKey != null ? " (linked to " + jiraTicketKey + ")" : "");

            OffsetDateTime now = OffsetDateTime.now();
            for (BatchFixItem item : included) {
                saveFixPrRecordAt(item.findingId(), item.cveId(), item.packageName(), item.oldVersion(),
                        item.newVersion(), owner, repo, newBranchName, pr, body, now, jiraTicketKey, jiraTicketUrl);
            }

            return new BatchCreateFixPrResult(pr.getHtmlUrl(), pr.getNumber(), newBranchName, included, skipped);
        } catch (RuntimeException e) {
            cleanupOrphanedBranch(owner, repo, newBranchName);
            throw e;
        }
    }

    /**
     * Compares two version strings numerically component-by-component
     * (e.g. "2.17.1" > "2.3.2" even though "2" < "3" as plain text) -
     * general-purpose, not tied to any specific ecosystem's version
     * scheme, since findings span npm/pip/Maven packages with different
     * conventions. Falls back to 0 for any non-numeric leading part of a
     * component (handles suffixes like "1.0.0-beta" reasonably, though
     * exact pre-release ordering isn't attempted - not needed here, since
     * Trivy's own fixedVersion values are release versions, not pre-releases).
     */
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

    private String buildCommitMessage(int count, String manifestPath, String jiraTicketKey) {
        String base = "Fix " + count + " " + (count == 1 ? "vulnerability" : "vulnerabilities") + " in " + manifestPath;
        return (jiraTicketKey != null && !jiraTicketKey.isBlank()) ? base + " (" + jiraTicketKey + ")" : base;
    }

    private String buildPrTitle(int count, String jiraTicketKey) {
        String base = "Fix " + count + " " + (count == 1 ? "vulnerability" : "vulnerabilities") + " (batch)";
        return (jiraTicketKey != null && !jiraTicketKey.isBlank()) ? "[" + jiraTicketKey + "] " + base : base;
    }

    private String buildBatchExplanation(List<BatchFixItem> included, List<String> skipped, String jiraTicketKey, String jiraTicketUrl) {
        StringBuilder sb = new StringBuilder();
        if (jiraTicketKey != null && !jiraTicketKey.isBlank()) {
            sb.append("Jira: ").append(jiraTicketKey);
            if (jiraTicketUrl != null && !jiraTicketUrl.isBlank()) {
                sb.append(" (").append(jiraTicketUrl).append(")");
            }
            sb.append("\n\n");
        }
        sb.append("This PR bumps ").append(included.size()).append(" ")
                .append(included.size() == 1 ? "dependency" : "dependencies")
                .append(" to their fixed versions, as reported by Trivy:\n\n");
        for (BatchFixItem item : included) {
            sb.append("- ").append(item.cveId()).append(": ").append(item.packageName())
                    .append(" ").append(item.oldVersion()).append(" -> ").append(item.newVersion())
                    .append(" (").append(item.manifestPath()).append(")\n");
        }
        if (!skipped.isEmpty()) {
            sb.append("\nNot included (couldn't be applied automatically):\n");
            for (String s : skipped) {
                sb.append("- ").append(s).append("\n");
            }
        }
        sb.append("\nReview each change and any changelogs before merging - a version bump can include breaking changes beyond the security fix itself.");
        return sb.toString();
    }

    // ============================================================
    // Branch listing - for the dashboard's base-branch dropdown
    // ============================================================

    /** Lists real branch names for a repo, most-recently-relevant first (GitHub's own default ordering). */
    public List<String> listBranches(String owner, String repo) {
        requireToken();
        List<Map<String, Object>> branches = callGitHub(
                "listing branches for " + owner + "/" + repo,
                () -> restTemplate.exchange(
                        GITHUB_API + "/repos/" + owner + "/" + repo + "/branches?per_page=100",
                        HttpMethod.GET, new HttpEntity<>(authHeaders()), List.class
                ).getBody());
        return branches.stream().map(b -> (String) b.get("name")).toList();
    }

    // ============================================================
    // Duplicate-PR check
    // ============================================================

    private Optional<String> findExistingOpenPr(String cveId, String packageName, String owner, String repo) {
        Optional<FixPr> prior = fixPrRepository
                .findFirstByCveIdAndPackageNameAndOwnerAndRepoOrderByCreatedAtDesc(cveId, packageName, owner, repo);
        if (prior.isEmpty()) {
            return Optional.empty();
        }

        FixPr priorPr = prior.get();
        try {
            GitHubPullRequestStatus status = getPullRequestStatus(owner, repo, priorPr.getPrNumber());
            if ("open".equalsIgnoreCase(status.getState())) {
                return Optional.of(priorPr.getPrUrl());
            }
        } catch (Exception e) {
            log.warn("Could not check status of existing PR #{} for {} ({}) - proceeding as if it's not open: {}",
                    priorPr.getPrNumber(), cveId, packageName, e.getMessage());
        }
        return Optional.empty();
    }

    // ============================================================
    // Shared helpers
    // ============================================================

    private void requireToken() {
        if (githubToken == null || githubToken.isBlank()) {
            throw new IllegalStateException(
                    "GITHUB_TOKEN is not configured - set it as an environment variable before using this feature");
        }
    }

    private String resolveBranchName(String requested, String autoGenerated) {
        if (requested == null || requested.isBlank()) {
            return autoGenerated;
        }
        String sanitized = requested.trim().replaceAll("[^A-Za-z0-9/_.-]+", "-").replaceAll("(^-+|-+$)", "");
        return sanitized.isEmpty() ? autoGenerated : sanitized;
    }

    /** Deletes a branch that was created but never ended up with a PR - best-effort. */
    private void cleanupOrphanedBranch(String owner, String repo, String branchName) {
        try {
            restTemplate.exchange(
                    GITHUB_API + "/repos/" + owner + "/" + repo + "/git/refs/heads/" + branchName,
                    HttpMethod.DELETE, new HttpEntity<>(authHeaders()), Void.class);
            log.info("[github-pr] cleaned up orphaned branch '{}' in {}/{} after a failure", branchName, owner, repo);
        } catch (Exception cleanupError) {
            log.warn("[github-pr] failed to clean up orphaned branch '{}' in {}/{} - you may need to delete it manually on GitHub: {}",
                    branchName, owner, repo, cleanupError.getMessage());
        }
    }

    private void saveFixPrRecordAt(Long findingId, String cveId, String packageName, String oldVersion, String newVersion,
                                    String owner, String repo, String branchName, GitHubPullRequest pr, String explanation,
                                    OffsetDateTime createdAt, String jiraTicketKey, String jiraTicketUrl) {
        FixPr record = new FixPr();
        record.setScannerFindingId(findingId);
        record.setCveId(cveId);
        record.setPackageName(packageName);
        record.setOldVersion(oldVersion);
        record.setNewVersion(newVersion);
        record.setOwner(owner);
        record.setRepo(repo);
        record.setBranchName(branchName);
        record.setPrUrl(pr.getHtmlUrl());
        record.setPrNumber(pr.getNumber());
        record.setExplanation(explanation);
        record.setCreatedAt(createdAt);
        record.setJiraTicketKey(jiraTicketKey);
        record.setJiraTicketUrl(jiraTicketUrl);
        try {
            fixPrRepository.save(record);
        } catch (Exception e) {
            log.warn("PR #{} was created successfully on GitHub, but saving history for {} failed: {}",
                    pr.getNumber(), cveId, e.getMessage());
        }
    }

    private String buildExplanation(ScannerFinding finding, String manifestPath) {
        return finding.getCveId() + " was found in " + finding.getPackageName()
                + " " + finding.getInstalledVersion() + " (project: " + finding.getProjectName() + "). "
                + "This PR bumps it to " + finding.getFixedVersion() + " in " + manifestPath
                + ", the version Trivy reported as fixed. Review the diff and any changelog for "
                + finding.getPackageName() + " before merging - a version bump can include breaking changes "
                + "beyond the security fix itself.";
    }

    private String bumpVersion(String content, String manifestPath, String packageName, String fixedVersion) {
        String lowerPath = manifestPath.toLowerCase();
        String safeVersion = Matcher.quoteReplacement(fixedVersion);

        if (lowerPath.endsWith("package-lock.json")) {
            return bumpPackageLockVersion(content, packageName, fixedVersion);
        }
        if (lowerPath.endsWith("package.json")) {
            String escapedPkg = Pattern.quote(packageName);
            Pattern p = Pattern.compile("(\"" + escapedPkg + "\"\\s*:\\s*\")[^\"]+(\")");
            Matcher m = p.matcher(content);
            return m.find() ? m.replaceFirst("$1" + safeVersion + "$2") : content;
        }
        if (lowerPath.endsWith("requirements.txt")) {
            String escapedPkg = Pattern.quote(packageName);
            Pattern p = Pattern.compile("(?m)^(" + escapedPkg + "\\s*==?\\s*)[^\\s]+");
            Matcher m = p.matcher(content);
            return m.find() ? m.replaceFirst("$1" + safeVersion) : content;
        }
        if (lowerPath.endsWith("pom.xml")) {
            String artifactIdOnly = packageName.contains(":")
                    ? packageName.substring(packageName.lastIndexOf(':') + 1)
                    : packageName;
            String escapedArtifactId = Pattern.quote(artifactIdOnly);
            Pattern p = Pattern.compile(
                    "(<artifactId>" + escapedArtifactId + "</artifactId>\\s*<version>)[^<]+(</version>)");
            Matcher m = p.matcher(content);
            return m.find() ? m.replaceFirst("$1" + safeVersion + "$2") : content;
        }

        throw new IllegalArgumentException(
                "Unsupported manifest type: " + manifestPath + " - supported: package.json, package-lock.json, requirements.txt, pom.xml");
    }

    /**
     * package-lock.json has a nested JSON structure, not the simple flat
     * map package.json has - a regex substitution here would be fragile
     * and risk corrupting the file, so this parses it as real JSON and
     * edits the matching node's "version" field directly, using the
     * JsonMapper already injected into this class for GitHub API calls.
     *
     * Handles both lockfile formats currently in use: npm 7+
     * (lockfileVersion 2/3, a flat "packages" map keyed by paths like
     * "node_modules/<pkg>") and the older npm 5/6 format (lockfileVersion
     * 1, a nested "dependencies" map). Both are checked and updated if
     * present, since some lockfiles retain both for backward compatibility.
     *
     * HONEST TRADEOFF: re-serializes the whole file rather than doing a
     * targeted text edit, so the resulting PR diff may show whitespace/
     * formatting differences beyond just the touched version line - the
     * value itself is correct, but the diff isn't as minimal as the other
     * manifest types' regex-based edits.
     */
    private String bumpPackageLockVersion(String content, String packageName, String fixedVersion) {
        try {
            JsonNode root = objectMapper.readTree(content);
            boolean changed = false;

            JsonNode packages = root.get("packages");
            if (packages != null && packages.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> fields = packages.properties().iterator();
                while (fields.hasNext()) {
                    Map.Entry<String, JsonNode> entry = fields.next();
                    String path = entry.getKey();
                    if (path.equals("node_modules/" + packageName) || path.endsWith("/node_modules/" + packageName)) {
                        JsonNode pkgNode = entry.getValue();
                        if (pkgNode.isObject() && pkgNode.has("version")) {
                            ((ObjectNode) pkgNode).put("version", fixedVersion);
                            changed = true;
                        }
                    }
                }
            }

            JsonNode dependencies = root.get("dependencies");
            if (dependencies != null && dependencies.isObject() && dependencies.has(packageName)) {
                JsonNode pkgNode = dependencies.get(packageName);
                if (pkgNode.isObject() && pkgNode.has("version")) {
                    ((ObjectNode) pkgNode).put("version", fixedVersion);
                    changed = true;
                }
            }

            if (!changed) {
                return content;
            }
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root);
        } catch (Exception e) {
            log.warn("[github-pr] failed to parse/edit package-lock.json for {}: {}", packageName, e.getMessage());
            return content;
        }
    }

    private String sanitizeForBranchName(String value) {
        return value.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
    }

    private <T> T callGitHub(String description, Supplier<T> call) {
        try {
            return call.get();
        } catch (HttpClientErrorException e) {
            throw new IllegalArgumentException(translateGitHubError(description, e), e);
        }
    }

    private void callGitHubVoid(String description, Runnable call) {
        try {
            call.run();
        } catch (HttpClientErrorException e) {
            throw new IllegalArgumentException(translateGitHubError(description, e), e);
        }
    }

    private String translateGitHubError(String description, HttpClientErrorException e) {
        int status = e.getStatusCode().value();
        return switch (status) {
            case 401 -> "GitHub rejected the token while " + description
                    + " - check GITHUB_TOKEN is valid and hasn't expired.";
            case 403 -> "GitHub denied access while " + description
                    + " - check the token has Contents and Pull Requests read/write permission, "
                    + "specifically scoped to include this repo.";
            case 404 -> "GitHub couldn't find what was needed while " + description
                    + " - double check the owner, repo, base branch name, and manifest path are all "
                    + "correct and actually exist.";
            case 422 -> "GitHub rejected the request while " + description
                    + " - a branch with that name may already exist. Delete it on GitHub first, or "
                    + "choose a different new-branch name.";
            default -> "GitHub API error (" + status + ") while " + description + ": " + e.getMessage();
        };
    }

    private HttpHeaders authHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + githubToken);
        headers.set("Accept", "application/vnd.github+json");
        headers.set("X-GitHub-Api-Version", "2022-11-28");
        return headers;
    }

    private GitHubFileContent getFileContent(String owner, String repo, String path, String branch) {
        String url = GITHUB_API + "/repos/" + owner + "/" + repo + "/contents/" + path + "?ref=" + branch;
        return restTemplate.exchange(url, HttpMethod.GET, new HttpEntity<>(authHeaders()), GitHubFileContent.class).getBody();
    }

    private String getRefSha(String owner, String repo, String branch) {
        String url = GITHUB_API + "/repos/" + owner + "/" + repo + "/git/ref/heads/" + branch;
        GitHubRef ref = restTemplate.exchange(url, HttpMethod.GET, new HttpEntity<>(authHeaders()), GitHubRef.class).getBody();
        return ref.getObject().getSha();
    }

    private GitHubPullRequestStatus getPullRequestStatus(String owner, String repo, int prNumber) {
        String url = GITHUB_API + "/repos/" + owner + "/" + repo + "/pulls/" + prNumber;
        return restTemplate.exchange(url, HttpMethod.GET, new HttpEntity<>(authHeaders()), GitHubPullRequestStatus.class).getBody();
    }

    private void createBranch(String owner, String repo, String newBranchName, String baseSha) {
        String url = GITHUB_API + "/repos/" + owner + "/" + repo + "/git/refs";
        Map<String, String> body = Map.of("ref", "refs/heads/" + newBranchName, "sha", baseSha);
        restTemplate.exchange(url, HttpMethod.POST, jsonEntity(body), GitHubRef.class);
    }

    private void updateFile(String owner, String repo, String path, String message,
                             String newContent, String originalSha, String branch) {
        String url = GITHUB_API + "/repos/" + owner + "/" + repo + "/contents/" + path;
        String encoded = Base64.getEncoder().encodeToString(newContent.getBytes(StandardCharsets.UTF_8));
        Map<String, String> body = Map.of(
                "message", message, "content", encoded, "sha", originalSha, "branch", branch);
        restTemplate.exchange(url, HttpMethod.PUT, jsonEntity(body), Map.class);
    }

    private GitHubPullRequest createPullRequest(String owner, String repo, String head, String base,
                                                 String title, String body) {
        String url = GITHUB_API + "/repos/" + owner + "/" + repo + "/pulls";
        Map<String, String> requestBody = Map.of("title", title, "body", body, "head", head, "base", base);
        return restTemplate.exchange(url, HttpMethod.POST, jsonEntity(requestBody), GitHubPullRequest.class).getBody();
    }

    private HttpEntity<String> jsonEntity(Object body) {
        HttpHeaders headers = authHeaders();
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
        return new HttpEntity<>(objectMapper.writeValueAsString(body), headers);
    }
}
