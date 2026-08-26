package com.security.cveingestion.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Marks CVEs older than the retention period as archived (sets
 * archived_at), rather than physically moving or deleting them. Nothing
 * else in the schema is touched - cve_analysis, risk_score,
 * remediation_action, scanner_finding, and fix_pr all keep working
 * unchanged for archived CVEs, since the cve row itself never moves or
 * disappears.
 *
 * Fully reversible: setting archived_at back to NULL un-archives a CVE,
 * since no data was ever deleted.
 *
 * This does not shrink the table's physical size or storage - it makes
 * "active CVEs only" queries fast (via the partial index from the
 * migration) and lets the dashboard filter old CVEs out of default views.
 * If actual storage reduction at real scale is ever needed later, that's
 * a separate, bigger decision (true partitioning or physical archival) -
 * this deliberately isn't that, by design, given the risks discussed.
 */
@Service
@Slf4j
public class CveArchivalService {

    @PersistenceContext
    private EntityManager entityManager;

    @Transactional
    public int archiveOldCves(int retentionYears) {
        int updated = entityManager.createNativeQuery("""
                UPDATE cve
                SET archived_at = now()
                WHERE published_date < now() - (CAST(:years AS text) || ' years')::interval
                  AND archived_at IS NULL
                """)
                .setParameter("years", retentionYears)
                .executeUpdate();

        log.info("[cve-archival] marked {} CVE(s) as archived (older than {} years)", updated, retentionYears);
        return updated;
    }

    /** How many CVEs are currently archived vs. active - for a status check without needing to run a fresh SQL query by hand. */
    public ArchivalStatus getStatus() {
        Object[] row = (Object[]) entityManager.createNativeQuery("""
                SELECT
                  (SELECT COUNT(*) FROM cve WHERE archived_at IS NOT NULL) AS archived,
                  (SELECT COUNT(*) FROM cve WHERE archived_at IS NULL) AS active
                """)
                .getSingleResult();

        long archived = ((Number) row[0]).longValue();
        long active = ((Number) row[1]).longValue();
        return new ArchivalStatus(archived, active);
    }

    public record ArchivalStatus(long archived, long active) {}
}
