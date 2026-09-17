package com.security.riskengine.repository;

import com.security.riskengine.entity.RiskScore;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RiskScoreRepository extends JpaRepository<RiskScore, String> {

    Optional<RiskScore> findByCveId(String cveId);

    // Original highest-risk-first sort - kept in place in case anything
    // else in the codebase still calls these, even though the controller
    // no longer uses them as the default.
    Page<RiskScore> findByRiskLevelIgnoreCaseOrderByRiskScoreDesc(String riskLevel, Pageable pageable);

    Page<RiskScore> findAllByOrderByRiskScoreDesc(Pageable pageable);

    // NEW - most-recently-scored first, now the controller's actual default.
    Page<RiskScore> findByRiskLevelIgnoreCaseOrderByComputedAtDesc(String riskLevel, Pageable pageable);

    Page<RiskScore> findAllByOrderByComputedAtDesc(Pageable pageable);
}
