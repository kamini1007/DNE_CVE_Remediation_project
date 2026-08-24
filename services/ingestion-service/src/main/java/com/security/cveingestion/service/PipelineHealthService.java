package com.security.cveingestion.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Read-only counts across every stage of the pipeline, for the dashboard's
 * Pipeline Health page. Deliberately implemented as plain COUNT(*) queries
 * via JdbcTemplate rather than JPA repositories, since ingestion-service
 * doesn't (and shouldn't) have mapped entities for cve_analysis,
 * risk_score, or remediation_action - those belong to ai-analysis-service,
 * risk-engine-service, and remediation-service respectively. This is scoped
 * specifically to counting, never writing, to those tables - a narrow,
 * deliberate exception to "each service owns its own tables," justified by
 * ingestion-service already being the schema owner for all of them via its
 * Flyway migrations.
 */
@Service
@RequiredArgsConstructor
public class PipelineHealthService {

    private final JdbcTemplate jdbcTemplate;

    public Map<String, Object> getHealth() {
        long totalCves = count("SELECT COUNT(*) FROM cve");
        long analyzedSuccess = count("SELECT COUNT(*) FROM cve_analysis WHERE status = 'SUCCESS'");
        long analyzedFailed = count("SELECT COUNT(*) FROM cve_analysis WHERE status = 'FAILED'");
        long notYetAnalyzed = Math.max(totalCves - analyzedSuccess - analyzedFailed, 0);

        long critical = count("SELECT COUNT(*) FROM risk_score WHERE risk_level = 'CRITICAL'");
        long high = count("SELECT COUNT(*) FROM risk_score WHERE risk_level = 'HIGH'");
        long medium = count("SELECT COUNT(*) FROM risk_score WHERE risk_level = 'MEDIUM'");
        long low = count("SELECT COUNT(*) FROM risk_score WHERE risk_level = 'LOW'");
        long totalScored = critical + high + medium + low;
        long notYetScored = Math.max(analyzedSuccess - totalScored, 0);

        long remediationActions = count("SELECT COUNT(*) FROM remediation_action");
        long eligibleForRemediation = count("SELECT COUNT(*) FROM risk_score WHERE risk_level IN ('HIGH','CRITICAL')");
        long notYetActioned = Math.max(eligibleForRemediation - remediationActions, 0);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ingestion", Map.of("total", totalCves));
        result.put("analysis", Map.of(
                "success", analyzedSuccess,
                "failed", analyzedFailed,
                "notYetAnalyzed", notYetAnalyzed
        ));
        result.put("riskScoring", Map.of(
                "critical", critical,
                "high", high,
                "medium", medium,
                "low", low,
                "notYetScored", notYetScored
        ));
        result.put("remediation", Map.of(
                "actionsCreated", remediationActions,
                "eligibleNotYetActioned", notYetActioned
        ));
        return result;
    }

    private long count(String sql) {
        Long result = jdbcTemplate.queryForObject(sql, Long.class);
        return result == null ? 0 : result;
    }
}
