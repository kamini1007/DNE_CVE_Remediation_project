package com.security.cveingestion.scheduler;

import com.security.cveingestion.config.ScannerAutoScanProperties;
import com.security.cveingestion.service.ScannerFindingIngestionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Runs Trivy scans on a schedule against a configured list of local
 * projects (scanner.targets in application.yml) - findings land in the
 * database exactly like a manual scan, visible immediately on Scanner
 * Findings.
 *
 * DELIBERATELY SCAN-ONLY. This does not create any PRs. Opening a PR is a
 * real commit + a real, visible pull request on someone's GitHub account -
 * that stays a person clicking "Create PR" after reviewing what a scan
 * found, never something that happens unattended on a timer. If that
 * boundary ever needs to move, it should be a deliberate, separate
 * decision - not a side effect of turning scanning on.
 *
 * requires @EnableScheduling on the main application class, which is
 * already present (the NVD/MITRE/VENDOR ingestion schedulers depend on it
 * too).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ScannerAutoScanScheduler {

    private final ScannerAutoScanProperties properties;
    private final ScannerFindingIngestionService scannerFindingIngestionService;

    @Scheduled(cron = "${scanner.scheduling.cron:0 0 */6 * * *}")
    public void runScheduledScans() {
        runNow();
    }

    /** Also called directly by the manual trigger endpoint, for testing without waiting on the cron. */
    public void runNow() {
        if (!properties.getScheduling().isEnabled()) {
            log.debug("[scanner] auto-scan is disabled (scanner.scheduling.enabled=false) - skipping");
            return;
        }
        if (properties.getTargets().isEmpty()) {
            log.info("[scanner] auto-scan is enabled but no targets are configured (scanner.targets) - nothing to do");
            return;
        }

        log.info("[scanner] running scheduled auto-scan for {} target(s)", properties.getTargets().size());
        for (ScannerAutoScanProperties.ScanTarget target : properties.getTargets()) {
            try {
                ScannerFindingIngestionService.ScanIngestResult result =
                        scannerFindingIngestionService.runTrivyScan(target.getProjectName(), target.getSource());
                log.info("[scanner] auto-scan for '{}' complete: {} CVE(s) upserted, {} finding(s), {} non-CVE skipped",
                        target.getProjectName(), result.cvesUpserted(), result.findingsRecorded(), result.skippedNonCve());
            } catch (Exception e) {
                // One target failing (e.g. a path that no longer exists) shouldn't
                // stop the rest of the batch from running.
                log.warn("[scanner] auto-scan for '{}' failed: {}", target.getProjectName(), e.getMessage());
            }
        }
    }
}
