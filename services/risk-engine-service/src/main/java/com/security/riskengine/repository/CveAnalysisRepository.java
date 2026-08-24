package com.security.riskengine.repository;

import com.security.riskengine.entity.CveAnalysis;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CveAnalysisRepository extends JpaRepository<CveAnalysis, String> {
    Optional<CveAnalysis> findByCveId(String cveId);
}
