package com.security.cveingestion.dto.github;

public record PushScanAndPrResult(
        int cvesFound,
        int fixableFindings,
        JiraTicketInfo jiraTicket, // null if nothing fixable, or Jira isn't configured
        BatchCreateFixPrResult pr  // null if there was nothing fixable to open a PR for
) {
    public record JiraTicketInfo(String ticketKey, String ticketUrl, boolean dryRun) {}
}
