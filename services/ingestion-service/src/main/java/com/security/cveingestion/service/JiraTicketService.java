package com.security.cveingestion.service;

import com.security.cveingestion.entity.ScannerFinding;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Creates ONE Jira ticket per project scan, covering every fixable finding
 * together - not one ticket per CVE. This coexists with
 * remediation-service's scheduled per-CVE job for the general risk-scored
 * CVE population (unrelated to scanning).
 *
 * DEDUPLICATION: after creating the ticket, writes a remediation_action
 * row for every included CVE (via RemediationActionUpsertService - a
 * separate bean, deliberately, so its @Transactional actually applies;
 * see that class for why) so remediation-service's scheduled job sees
 * them as already actioned and doesn't create a second, redundant ticket.
 *
 * SECURITY: same posture as GitHubPrService - the Jira token is read only
 * from an environment variable, never accepted as a request parameter,
 * never logged, never returned in any response.
 */
@Service
@Slf4j
public class JiraTicketService {

    private static final Map<String, String> PRIORITY_BY_SEVERITY = Map.of(
            "CRITICAL", "Highest",
            "HIGH", "High",
            "MEDIUM", "Medium",
            "LOW", "Low"
    );
    private static final List<String> SEVERITY_ORDER = List.of("CRITICAL", "HIGH", "MEDIUM", "LOW");

    private final RestTemplate restTemplate;
    private final JsonMapper objectMapper;
    private final String jiraBaseUrl;
    private final String jiraEmail;
    private final String jiraApiToken;
    private final String jiraProjectKey;
    private final String jiraIssueType;
    private final RemediationActionUpsertService remediationActionUpsertService;

    public JiraTicketService(
            RestTemplate restTemplate,
            JsonMapper objectMapper,
            @Value("${JIRA_BASE_URL:https://ashish001007.atlassian.net}") String jiraBaseUrl,
            @Value("${JIRA_EMAIL:kaminirai07@gmail.com}") String jiraEmail,
            @Value("${JIRA_API_TOKEN:ATATT3xFfGF0GSiU-kDwvksAthsxU5-BEePCTsksDdRkdZLhwx7JrQOOGDTboTJxLfZD_VO3xaxe-4ME4-fJJPzs8UP26Bugm-8yWhyq_LSjiuOcJaS-jgIM6D780cP8soKgJxDNhlV7UHqxEW-viCFffEaNHIEj4rECyjsjNo9w1QFcxmox_vM=D7DA8EA7}") String jiraApiToken,
            @Value("${JIRA_PROJECT_KEY:SCRUM}") String jiraProjectKey,
            @Value("${JIRA_ISSUE_TYPE:Task}") String jiraIssueType,
            RemediationActionUpsertService remediationActionUpsertService) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.jiraBaseUrl = jiraBaseUrl;
        this.jiraEmail = jiraEmail;
        this.jiraApiToken = jiraApiToken;
        this.jiraProjectKey = jiraProjectKey;
        this.jiraIssueType = jiraIssueType;
        this.remediationActionUpsertService = remediationActionUpsertService;
    }

    public boolean isConfigured() {
        return notBlank(jiraBaseUrl) && notBlank(jiraEmail) && notBlank(jiraApiToken) && notBlank(jiraProjectKey);
    }

    private boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    public record ProjectTicketResult(String ticketKey, String ticketUrl, boolean dryRun) {}

    /**
     * Creates one ticket covering every finding passed in. Returns a
     * dry-run result (no real ticket) if Jira isn't configured.
     */
    public ProjectTicketResult createProjectTicket(String projectName, List<ScannerFinding> findings) {
        if (!isConfigured()) {
            log.info("[jira] not configured - skipping ticket creation for project '{}'", projectName);
            return new ProjectTicketResult(null, null, true);
        }
        if (findings.isEmpty()) {
            return new ProjectTicketResult(null, null, true);
        }

        String highestSeverity = highestSeverity(findings);
        String priority = PRIORITY_BY_SEVERITY.getOrDefault(highestSeverity, "Medium");

        Map<String, Object> body = Map.of(
                "fields", Map.of(
                        "project", Map.of("key", jiraProjectKey),
                        "summary", "[" + projectName + "] Fix " + findings.size() + " "
                                + (findings.size() == 1 ? "vulnerability" : "vulnerabilities") + " (scan)",
                        "description", buildDescription(projectName, findings),
                        "issuetype", Map.of("name", jiraIssueType),
                        "priority", Map.of("name", priority),
                        "labels", List.of("cve-remediation", "scanner-finding", "severity-" + highestSeverity.toLowerCase())
                )
        );

        Map<?, ?> created;
        try {
            created = restTemplate.exchange(
                    jiraBaseUrl + "/rest/api/3/issue",
                    HttpMethod.POST,
                    jsonEntity(body),
                    Map.class
            ).getBody();
        } catch (HttpClientErrorException e) {
            throw new IllegalArgumentException(translateJiraError(e), e);
        }

        String ticketKey = (String) created.get("key");
        String ticketUrl = jiraBaseUrl + "/browse/" + ticketKey;

        log.info("[jira] created ticket {} ({}) for project '{}' covering {} finding(s)",
                ticketKey, ticketUrl, projectName, findings.size());

        recordRemediationActions(findings, ticketKey, ticketUrl);

        return new ProjectTicketResult(ticketKey, ticketUrl, false);
    }

    /**
     * Best-effort per-CVE bookkeeping: if this fails, the real Jira ticket
     * still exists and is still returned to the caller - a bookkeeping
     * failure here shouldn't be reported as a ticket-creation failure when
     * the ticket itself was created fine.
     */
    private void recordRemediationActions(List<ScannerFinding> findings, String ticketKey, String ticketUrl) {
        for (ScannerFinding f : findings) {
            try {
                remediationActionUpsertService.upsertOneRemediationAction(f, ticketKey, ticketUrl);
            } catch (Exception e) {
                log.warn("[jira] ticket {} was created successfully, but recording remediation_action for {} failed "
                        + "(may cause a duplicate individual ticket later): {}", ticketKey, f.getCveId(), e.getMessage());
            }
        }
    }

    private String highestSeverity(List<ScannerFinding> findings) {
        return findings.stream()
                .map(ScannerFinding::getSeverity)
                .filter(Objects::nonNull)
                .map(String::toUpperCase)
                .min(Comparator.comparingInt(s -> {
                    int idx = SEVERITY_ORDER.indexOf(s);
                    return idx < 0 ? SEVERITY_ORDER.size() : idx;
                }))
                .orElse("MEDIUM");
    }

    /** Jira Cloud's REST API expects descriptions in Atlassian Document Format, not plain text/markdown. */
    private Map<String, Object> buildDescription(String projectName, List<ScannerFinding> findings) {
        List<Map<String, Object>> bulletItems = new ArrayList<>();
        for (ScannerFinding f : findings) {
            String line = f.getCveId() + ": " + f.getPackageName()
                    + " " + nullToDash(f.getInstalledVersion()) + " -> " + nullToDash(f.getFixedVersion())
                    + " (" + nullToDash(f.getSeverity()) + ", " + nullToDash(f.getTarget()) + ")";
            bulletItems.add(Map.of(
                    "type", "listItem",
                    "content", List.of(Map.of(
                            "type", "paragraph",
                            "content", List.of(Map.of("type", "text", "text", line))
                    ))
            ));
        }

        return Map.of(
                "type", "doc",
                "version", 1,
                "content", List.of(
                        Map.of("type", "paragraph", "content", List.of(Map.of(
                                "type", "text",
                                "text", "Trivy found " + findings.size() + " " + (findings.size() == 1 ? "vulnerability" : "vulnerabilities")
                                        + " in " + projectName + " with a known fix. A single PR bumping all of them has been opened alongside this ticket."
                        ))),
                        Map.of("type", "bulletList", "content", bulletItems),
                        Map.of("type", "paragraph", "content", List.of(Map.of(
                                "type", "text",
                                "text", "Review the linked PR and any changelogs before merging - a version bump can include breaking changes beyond the security fix itself."
                        )))
                )
        );
    }

    private String nullToDash(String s) {
        return (s == null || s.isBlank()) ? "-" : s;
    }

    private String translateJiraError(HttpClientErrorException e) {
        int status = e.getStatusCode().value();
        String body = e.getResponseBodyAsString();
        return switch (status) {
            case 401 -> "Jira rejected the token while creating the ticket - check JIRA_API_TOKEN is valid.";
            case 403 -> "Jira denied access while creating the ticket - check the account has permission to create issues in " + jiraProjectKey + ".";
            case 400 -> "Jira rejected the ticket (400): " + body.substring(0, Math.min(body.length(), 500))
                    + " - commonly means JIRA_ISSUE_TYPE isn't a valid type for this project.";
            default -> "Jira API error (" + status + ") while creating the ticket: " + body.substring(0, Math.min(body.length(), 500));
        };
    }

    private HttpEntity<String> jsonEntity(Object body) {
        HttpHeaders headers = new HttpHeaders();
        String auth = Base64.getEncoder().encodeToString((jiraEmail + ":" + jiraApiToken).getBytes(StandardCharsets.UTF_8));
        headers.set("Authorization", "Basic " + auth);
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Accept", "application/json");
        return new HttpEntity<>(objectMapper.writeValueAsString(body), headers);
    }
}
