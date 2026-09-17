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
 * Orchestrates: (optionally push a local project to GitHub), scan it,
 * create ONE Jira ticket covering everything fixable, then open ONE PR
 * that references that ticket - in that order, deliberately. Jira comes
 * first so its ticket key exists before the PR is built, letting the
 * PR's branch name, title, and body all reference it (the standard way
 * tools like Jira Smart Commits link a PR back to its ticket).
 *
 * SOURCE FLEXIBILITY: `source` accepts either a real local folder path
 * (gets pushed to GitHub first, same as always) or a GitHub URL
 * (`https://github.com/...`) - detected by a simple prefix check, same
 * convention "Scan a project (scan only)" already uses. When a GitHub URL
 * is given, the push step is skipped entirely (the code is already
 * there), and the scan reads directly from that URL -
 * ScannerFindingIngestionService.runTrivyScan() already supports both
 * forms, so no scanning-side change was needed for this.
 *
 * See GitPushService, ScannerFindingIngestionService.runTrivyScan(),
 * JiraTicketService, and GitHubPrService for the security/portability
 * notes specific to each step.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PushScanAndPrService {

    private final GitPushService gitPushService;
    private final ScannerFindingIngestionService scannerFindingIngestionService;
    private final ScannerFindingRepository scannerFindingRepository;
    private final JiraTicketService jiraTicketService;
    private final GitHubPrService gitHubPrService;

    public PushScanAndPrResult run(String source, String projectName, String owner, String repo,
                                    String baseBranch, String requestedBranchName, boolean forcePush) {
        String branch = baseBranch == null || baseBranch.isBlank() ? "main" : baseBranch;
        boolean sourceIsGitHubUrl = source != null && source.trim().toLowerCase().startsWith("http");

        if (sourceIsGitHubUrl) {
            log.info("[push-scan-pr] step 1/3: source is already a GitHub URL ({}) - skipping the push step", source);
        } else {
            log.info("[push-scan-pr] step 1/3: pushing {} to {}/{}{}", source, owner, repo, forcePush ? " (force)" : "");
            gitPushService.pushToGitHub(source, owner, repo, branch, forcePush);
        }

        log.info("[push-scan-pr] step 2/3: scanning {}", source);
        ScannerFindingIngestionService.ScanIngestResult scanResult =
                scannerFindingIngestionService.runTrivyScan(projectName, source);

        if (scanResult.cvesUpserted() == 0) {
            log.info("[push-scan-pr] no CVEs found - stopping before ticket/PR creation");
            return new PushScanAndPrResult(0, 0, null, null);
        }

        List<ScannerFinding> findings = scannerFindingRepository.findByProjectNameOrderByScannedAtDesc(projectName);
        List<ScannerFinding> fixable = findings.stream()
                .filter(f -> f.getFixedVersion() != null && !f.getFixedVersion().isBlank())
                .toList();

        if (fixable.isEmpty()) {
            log.info("[push-scan-pr] {} CVE(s) found but none have a known fix version - stopping before ticket/PR creation",
                    scanResult.cvesUpserted());
            return new PushScanAndPrResult(scanResult.cvesUpserted(), 0, null, null);
        }

        log.info("[push-scan-pr] step 3/3: creating one Jira ticket for {} fixable finding(s), then a PR referencing it", fixable.size());
        JiraTicketService.ProjectTicketResult ticket = jiraTicketService.createProjectTicket(projectName, fixable);
        PushScanAndPrResult.JiraTicketInfo jiraInfo = new PushScanAndPrResult.JiraTicketInfo(
                ticket.ticketKey(), ticket.ticketUrl(), ticket.dryRun());

        List<Long> fixableIds = fixable.stream().map(ScannerFinding::getId).toList();
        BatchCreateFixPrResult prResult = gitHubPrService.createBatchFixPr(
                fixableIds, owner, repo, branch, requestedBranchName, ticket.ticketKey(), ticket.ticketUrl());

        return new PushScanAndPrResult(scanResult.cvesUpserted(), fixableIds.size(), jiraInfo, prResult);
    }
}
