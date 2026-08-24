package com.security.riskengine.repository;

import com.security.riskengine.entity.Cve;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CveRepository extends JpaRepository<Cve, String> {

    /**
     * CVEs with a successful AI analysis that either have no risk_score yet,
     * a stale one, or one computed under an older scoring model version.
     * Highest CVSS first.
     */
    @Query(value = """
        SELECT c.* FROM cve c
        JOIN cve_analysis a ON a.cve_id = c.cve_id AND a.status = 'SUCCESS'
        LEFT JOIN risk_score r ON r.cve_id = c.cve_id
        WHERE r.cve_id IS NULL
           OR a.analyzed_at > r.computed_at
           OR r.scoring_model_version <> :currentModelVersion
        ORDER BY c.cvss_v3_score DESC NULLS LAST
        LIMIT :limit
        """, nativeQuery = true)
    List<Cve> findCvesNeedingScoring(@Param("currentModelVersion") String currentModelVersion, @Param("limit") int limit);
}
