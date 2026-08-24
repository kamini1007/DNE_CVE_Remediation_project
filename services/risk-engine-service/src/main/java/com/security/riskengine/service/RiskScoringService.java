package com.security.riskengine.service;

import com.security.riskengine.config.RiskScoringProperties;
import com.security.riskengine.entity.AssetProfile;
import com.security.riskengine.entity.Cve;
import com.security.riskengine.entity.CveAnalysis;
import com.security.riskengine.entity.RiskScore;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.Map;

/**
 * Combines five weighted components into a single 0-100 risk score: CVSS,
 * exploitability (from ai-analysis-service), and asset criticality/network
 * exposure/business impact (from the matched AssetProfile). Each categorical
 * level maps to a 0-100 numeric value before weighting, so every component
 * is on the same scale and the configured weights directly control each
 * factor's influence on the final score.
 */
@Service
@RequiredArgsConstructor
public class RiskScoringService {

    private final RiskScoringProperties properties;

    private static final Map<String, Double> LEVEL_SCALE = Map.of(
            "LOW", 25.0,
            "MEDIUM", 50.0,
            "HIGH", 75.0,
            "CRITICAL", 100.0,
            "UNKNOWN", 50.0 // neutral - don't let missing/ambiguous AI analysis dominate the score either way
    );

    private static final Map<String, Double> EXPOSURE_SCALE = Map.of(
            "INTERNAL", 25.0,
            "DMZ", 60.0,
            "PUBLIC_INTERNET", 100.0
    );

    @PostConstruct
    void validateWeights() {
        RiskScoringProperties.Weights w = properties.getWeights();
        double sum = w.getCvss() + w.getExploitability() + w.getAssetCriticality()
                + w.getNetworkExposure() + w.getBusinessImpact();
        if (Math.abs(sum - 1.0) > 0.001) {
            throw new IllegalStateException(
                    "risk-engine.weights must sum to 1.0, but sum to " + sum +
                    " (cvss=" + w.getCvss() + ", exploitability=" + w.getExploitability() +
                    ", assetCriticality=" + w.getAssetCriticality() +
                    ", networkExposure=" + w.getNetworkExposure() +
                    ", businessImpact=" + w.getBusinessImpact() + ")");
        }
    }

    public RiskScore score(Cve cve, CveAnalysis analysis, AssetProfile profile) {
        RiskScoringProperties.Weights w = properties.getWeights();

        BigDecimal cvssComponent = bd(cvssToScale(cve) * w.getCvss());
        BigDecimal exploitabilityComponent = bd(levelToScale(analysis.getExploitabilityLevel()) * w.getExploitability());
        BigDecimal assetCriticalityComponent = bd(levelToScale(profile.getCriticality()) * w.getAssetCriticality());
        BigDecimal networkExposureComponent = bd(exposureToScale(profile.getNetworkExposure()) * w.getNetworkExposure());
        BigDecimal businessImpactComponent = bd(levelToScale(profile.getBusinessImpact()) * w.getBusinessImpact());

        BigDecimal total = cvssComponent
                .add(exploitabilityComponent)
                .add(assetCriticalityComponent)
                .add(networkExposureComponent)
                .add(businessImpactComponent)
                .setScale(2, RoundingMode.HALF_UP);

        RiskScore riskScore = new RiskScore();
        riskScore.setCveId(cve.getCveId());
        riskScore.setRiskScore(total);
        riskScore.setRiskLevel(bucket(total.doubleValue()));
        riskScore.setCvssComponent(cvssComponent);
        riskScore.setExploitabilityComponent(exploitabilityComponent);
        riskScore.setAssetCriticalityComponent(assetCriticalityComponent);
        riskScore.setNetworkExposureComponent(networkExposureComponent);
        riskScore.setBusinessImpactComponent(businessImpactComponent);
        riskScore.setMatchedAssetProfileId(profile.getId());
        riskScore.setScoringModelVersion(properties.getModelVersion());
        riskScore.setComputedAt(OffsetDateTime.now());
        return riskScore;
    }

    /** CVSS is already 0-10; scale to 0-100. Prefers v3, falls back to v2, then a neutral midpoint if neither is present. */
    private double cvssToScale(Cve cve) {
        if (cve.getCvssV3Score() != null) {
            return cve.getCvssV3Score().doubleValue() * 10.0;
        }
        if (cve.getCvssV2Score() != null) {
            return cve.getCvssV2Score().doubleValue() * 10.0;
        }
        return 50.0;
    }

    private double levelToScale(String level) {
        if (level == null) return LEVEL_SCALE.get("UNKNOWN");
        return LEVEL_SCALE.getOrDefault(level.toUpperCase(), LEVEL_SCALE.get("UNKNOWN"));
    }

    private double exposureToScale(String exposure) {
        if (exposure == null) return EXPOSURE_SCALE.get("INTERNAL");
        return EXPOSURE_SCALE.getOrDefault(exposure.toUpperCase(), EXPOSURE_SCALE.get("INTERNAL"));
    }

    private String bucket(double score) {
        RiskScoringProperties.Thresholds t = properties.getThresholds();
        if (score >= t.getCritical()) return "CRITICAL";
        if (score >= t.getHigh()) return "HIGH";
        if (score >= t.getMedium()) return "MEDIUM";
        return "LOW";
    }

    private BigDecimal bd(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP);
    }
}
