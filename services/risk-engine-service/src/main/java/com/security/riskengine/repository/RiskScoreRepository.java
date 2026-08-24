package com.security.riskengine.repository;

import com.security.riskengine.entity.RiskScore;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RiskScoreRepository extends JpaRepository<RiskScore, String> {

    Optional<RiskScore> findByCveId(String cveId);

    Page<RiskScore> findByRiskLevelIgnoreCaseOrderByRiskScoreDesc(String riskLevel, Pageable pageable);

    Page<RiskScore> findAllByOrderByRiskScoreDesc(Pageable pageable);
}
