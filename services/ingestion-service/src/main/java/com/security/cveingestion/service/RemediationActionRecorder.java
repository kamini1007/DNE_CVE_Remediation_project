package com.security.cveingestion.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes a remediation_action row for each CVE covered by a project-level
 * Jira ticket, so remediation-service's own scheduled batch job (which
 * processes CVEs one at a time, unrelated to project scans) correctly
 * recognizes these CVEs as already ticketed and never creates a second,
 * individual ticket for them - see the matching safety condition added to
 * remediation-service/src/repository/riskScoreRepository.js.
 *
 * Deliberately plain, targeted native SQL via EntityManager rather than a
 * new JPA entity - remediation_action is owned by remediation-service
 * (Node), this is a narrow, single-purpose write into a table this Java
 * service doesn't otherwise manage, matching the same
 * EntityManager-native-query pattern already used elsewhere in this
 * codebase for similar cross-cutting writes (e.g. CveArchivalService).
 *
 * risk_score_snapshot/risk_level_snapshot here are a rough estimate
 * derived from Trivy's own severity, NOT the AI-driven risk-engine-service
 * score - real risk scoring runs independently and may refine these later;
 * this snapshot exists so the row is meaningful even before that happens.
 */
@Service
@Slf4j
public class RemediationActionRecorder {

    @PersistenceContext
    private EntityManager entityManager;

    @Transactional
    public void recordProjectTicket(String cveId, String severity, String jiraTicketKey, String jiraTicketUrl,
                                     String projectName) {
        double scoreSnapshot = switch (severity == null ? "UNKNOWN" : severity.toUpperCase()) {
            case "CRITICAL" -> 95.0;
            case "HIGH" -> 80.0;
            case "MEDIUM" -> 50.0;
            case "LOW" -> 25.0;
            default -> 40.0;
        };
        String levelSnapshot = severity == null ? "MEDIUM" : severity.toUpperCase();
        String playbookJson = "{\"summary\": \"Covered by project-level Jira ticket " + jiraTicketKey
                + " for " + escapeJson(projectName) + "\", \"urgency\": \"" + levelSnapshot
                + "\", \"dueByHours\": null, \"steps\": []}";

        entityManager.createNativeQuery("""
                INSERT INTO remediation_action
                    (cve_id, risk_score_snapshot, risk_level_snapshot, playbook,
                     jira_ticket_key, jira_ticket_url, status, updated_at)
                VALUES (:cveId, :score, :level, CAST(:playbook AS jsonb),
                        :ticketKey, :ticketUrl, 'TICKET_CREATED', now())
                ON CONFLICT (cve_id) DO UPDATE SET
                    risk_score_snapshot = EXCLUDED.risk_score_snapshot,
                    risk_level_snapshot = EXCLUDED.risk_level_snapshot,
                    playbook             = EXCLUDED.playbook,
                    jira_ticket_key      = EXCLUDED.jira_ticket_key,
                    jira_ticket_url      = EXCLUDED.jira_ticket_url,
                    status                = 'TICKET_CREATED',
                    updated_at            = now()
                """)
                .setParameter("cveId", cveId)
                .setParameter("score", scoreSnapshot)
                .setParameter("level", levelSnapshot)
                .setParameter("playbook", playbookJson)
                .setParameter("ticketKey", jiraTicketKey)
                .setParameter("ticketUrl", jiraTicketUrl)
                .executeUpdate();
    }

    private String escapeJson(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
