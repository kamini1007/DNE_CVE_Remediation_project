package com.security.cveingestion.service;

import com.security.cveingestion.dto.github.BatchCreateFixPrResult;
import com.security.cveingestion.dto.github.PushScanAndPrResult;
import com.security.cveingestion.entity.ScannerFinding;
import com.security.cveingestion.repository.ScannerFindingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Orchestrates: push a local project to GitHub, scan it with Trivy, open
 * one PR covering every fixable finding. See GitPushService,
 * ScannerFindingIngestionService.runTrivyScan(), and
 * GitHubPrService.createBatchFixPr() for the security notes specific to
 * each step.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PushScanAndPrService {

    private final GitPushService gitPushService;
    private final ScannerFindingIngestionService scannerFindingIngestionService;
    private final ScannerFindingRepository scannerFindingRepository;
    private final GitHubPrService gitHubPrService;

    public PushScanAndPrResult run(String localPath, String projectName, String owner, String repo,
                                    String baseBranch, String requestedBranchName, boolean forcePush) {
        String branch = baseBranch == null || baseBranch.isBlank() ? "main" : baseBranch;

        log.info("[push-scan-pr] step 1/3: pushing {} to {}/{}{}", localPath, owner, repo, forcePush ? " (force)" : "");
        gitPushService.pushToGitHub(localPath, owner, repo, branch, forcePush);

        log.info("[push-scan-pr] step 2/3: scanning {}", localPath);
        ScannerFindingIngestionService.ScanIngestResult scanResult =
                scannerFindingIngestionService.runTrivyScan(projectName, localPath);

        if (scanResult.cvesUpserted() == 0) {
            log.info("[push-scan-pr] no CVEs found - stopping before PR creation");
            return new PushScanAndPrResult(0, 0, null);
        }

        List<ScannerFinding> findings = scannerFindingRepository.findByProjectNameOrderByScannedAtDesc(projectName);
        List<Long> fixableIds = findings.stream()
                .filter(f -> f.getFixedVersion() != null && !f.getFixedVersion().isBlank())
                .map(ScannerFinding::getId)
                .toList();

        if (fixableIds.isEmpty()) {
            log.info("[push-scan-pr] {} CVE(s) found but none have a known fix version - stopping before PR creation",
                    scanResult.cvesUpserted());
            return new PushScanAndPrResult(scanResult.cvesUpserted(), 0, null);
        }

        log.info("[push-scan-pr] step 3/3: opening PR for {} fixable finding(s)", fixableIds.size());
        BatchCreateFixPrResult prResult = gitHubPrService.createBatchFixPr(fixableIds, owner, repo, branch, requestedBranchName);

        return new PushScanAndPrResult(scanResult.cvesUpserted(), fixableIds.size(), prResult);
    }
}
