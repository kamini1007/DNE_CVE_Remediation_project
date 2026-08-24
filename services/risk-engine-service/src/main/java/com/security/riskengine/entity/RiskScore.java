package com.security.riskengine.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "risk_score")
@Getter
@Setter
public class RiskScore {

    @Id
    @Column(name = "cve_id")
    private String cveId;

    @Column(name = "risk_score", nullable = false)
    private BigDecimal riskScore;

    @Column(name = "risk_level", nullable = false, length = 20)
    private String riskLevel; // LOW / MEDIUM / HIGH / CRITICAL

    @Column(name = "cvss_component")
    private BigDecimal cvssComponent;

    @Column(name = "exploitability_component")
    private BigDecimal exploitabilityComponent;

    @Column(name = "asset_criticality_component")
    private BigDecimal assetCriticalityComponent;

    @Column(name = "network_exposure_component")
    private BigDecimal networkExposureComponent;

    @Column(name = "business_impact_component")
    private BigDecimal businessImpactComponent;

    @Column(name = "matched_asset_profile_id")
    private Long matchedAssetProfileId;

    @Column(name = "scoring_model_version", nullable = false, length = 20)
    private String scoringModelVersion;

    @Column(name = "computed_at", nullable = false)
    private OffsetDateTime computedAt;
}
