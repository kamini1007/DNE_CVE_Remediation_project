package com.security.cveingestion.service;

import com.security.cveingestion.entity.ScannerFinding;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

/**
 * Split into its own bean specifically so @Transactional actually takes
 * effect - Spring's proxy-based transaction management doesn't apply when
 * a method calls another method on itself within the same class, only
 * across a real bean boundary. This was previously a method inside
 * JiraTicketService itself, called via self-invocation, which is exactly
 * why it failed with "No active transaction for update or delete query"
 * on every single write - the same class of bug already fixed once before
 * in CveMainDbDeleteService, reintroduced here by not applying the same
 * pattern consistently.
 */
@Service
public class RemediationActionUpsertService {

    @PersistenceContext
    private EntityManager entityManager;

    @Transactional
    public void upsertOneRemediationAction(ScannerFinding f, String ticketKey, String ticketUrl) {
        OffsetDateTime now = OffsetDateTime.now();
        String minimalPlaybookJson = "{\"summary\":\"Covered by project-level ticket " + ticketKey
                + "\",\"urgency\":null,\"dueByHours\":null,\"steps\":[]}";

        Number existing = (Number) entityManager.createNativeQuery(
                        "SELECT COUNT(*) FROM remediation_action WHERE cve_id = :cveId")
                .setParameter("cveId", f.getCveId())
                .getSingleResult();

        if (existing.longValue() > 0) {
            entityManager.createNativeQuery("""
                    UPDATE remediation_action SET
                        risk_level_snapshot = :riskLevel,
                        playbook = CAST(:playbook AS jsonb),
                        jira_ticket_key = :ticketKey,
                        jira_ticket_url = :ticketUrl,
                        status = 'TICKET_CREATED',
                        updated_at = :now
                    WHERE cve_id = :cveId
                    """)
                    .setParameter("riskLevel", f.getSeverity())
                    .setParameter("playbook", minimalPlaybookJson)
                    .setParameter("ticketKey", ticketKey)
                    .setParameter("ticketUrl", ticketUrl)
                    .setParameter("now", now)
                    .setParameter("cveId", f.getCveId())
                    .executeUpdate();
        } else {
            entityManager.createNativeQuery("""
                    INSERT INTO remediation_action
                        (cve_id, risk_score_snapshot, risk_level_snapshot, playbook,
                         jira_ticket_key, jira_ticket_url, status, created_at, updated_at)
                    VALUES (:cveId, NULL, :riskLevel, CAST(:playbook AS jsonb),
                            :ticketKey, :ticketUrl, 'TICKET_CREATED', :now, :now)
                    """)
                    .setParameter("cveId", f.getCveId())
                    .setParameter("riskLevel", f.getSeverity())
                    .setParameter("playbook", minimalPlaybookJson)
                    .setParameter("ticketKey", ticketKey)
                    .setParameter("ticketUrl", ticketUrl)
                    .setParameter("now", now)
                    .executeUpdate();
        }
    }
}
