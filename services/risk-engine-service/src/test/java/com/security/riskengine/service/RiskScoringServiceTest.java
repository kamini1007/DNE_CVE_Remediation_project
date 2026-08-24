package com.security.riskengine.service;

import com.security.riskengine.config.RiskScoringProperties;
import com.security.riskengine.entity.AssetProfile;
import com.security.riskengine.entity.Cve;
import com.security.riskengine.entity.CveAnalysis;
import com.security.riskengine.entity.RiskScore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RiskScoringServiceTest {

    private RiskScoringProperties properties;
    private RiskScoringService service;

    @BeforeEach
    void setUp() {
        properties = new RiskScoringProperties();
        service = new RiskScoringService(properties);
        service.validateWeights(); // normally called by @PostConstruct
    }

    private Cve cve(String id, Double cvssV3) {
        Cve cve = new Cve();
        cve.setCveId(id);
        cve.setCvssV3Score(cvssV3 == null ? null : BigDecimal.valueOf(cvssV3));
        cve.setVendor("ExampleCorp");
        cve.setProduct("Widget");
        return cve;
    }

    private CveAnalysis analysis(String level) {
        CveAnalysis a = new CveAnalysis();
        a.setExploitabilityLevel(level);
        a.setStatus("SUCCESS");
        return a;
    }

    private AssetProfile profile(String criticality, String exposure, String impact) {
        AssetProfile p = new AssetProfile();
        p.setId(1L);
        p.setCriticality(criticality);
        p.setNetworkExposure(exposure);
        p.setBusinessImpact(impact);
        return p;
    }

    @Test
    void maximalInputsProduceTheHighestScoreAndCriticalBucket() {
        RiskScore result = service.score(
                cve("CVE-2024-0001", 10.0),
                analysis("CRITICAL"),
                profile("CRITICAL", "PUBLIC_INTERNET", "CRITICAL"));

        assertThat(result.getRiskScore()).isEqualByComparingTo(BigDecimal.valueOf(100.00));
        assertThat(result.getRiskLevel()).isEqualTo("CRITICAL");
    }

    @Test
    void minimalInputsProduceTheLowestScoreAndLowBucket() {
        RiskScore result = service.score(
                cve("CVE-2024-0002", 0.0),
                analysis("LOW"),
                profile("LOW", "INTERNAL", "LOW"));

        // cvss=0*0.35=0, exploitability(LOW=25)*0.25=6.25, assetCriticality(LOW=25)*0.20=5,
        // networkExposure(INTERNAL=25)*0.10=2.5, businessImpact(LOW=25)*0.10=2.5 -> 16.25
        assertThat(result.getRiskScore()).isEqualByComparingTo(BigDecimal.valueOf(16.25));
        assertThat(result.getRiskLevel()).isEqualTo("LOW");
    }

    @Test
    void missingCvssScoreFallsBackToNeutralFiftyRatherThanZero() {
        RiskScore withNoCvss = service.score(
                cve("CVE-2024-0003", null),
                analysis("MEDIUM"),
                profile("MEDIUM", "INTERNAL", "MEDIUM"));

        // cvss falls back to neutral 50*0.35=17.5, exploitability(MEDIUM=50)*0.25=12.5,
        // assetCriticality(MEDIUM=50)*0.20=10, networkExposure(INTERNAL=25)*0.10=2.5,
        // businessImpact(MEDIUM=50)*0.10=5 -> 47.5. Note INTERNAL's own scale point is
        // 25, not 50, so this isn't "everything at 50" - just confirms missing CVSS
        // doesn't fall back to 0 (which would drag the total well below MEDIUM).
        assertThat(withNoCvss.getRiskScore()).isEqualByComparingTo(BigDecimal.valueOf(47.5));
        assertThat(withNoCvss.getRiskLevel()).isEqualTo("MEDIUM");
    }

    @Test
    void unknownExploitabilityLevelIsTreatedAsNeutralNotZero() {
        RiskScore result = service.score(
                cve("CVE-2024-0004", 8.0),
                analysis("SOME_UNRECOGNIZED_VALUE"),
                profile("MEDIUM", "INTERNAL", "MEDIUM"));

        // cvss=8*10=80*0.35=28, exploitability falls back to neutral 50*0.25=12.5,
        // assetCriticality(MEDIUM=50)*0.20=10, networkExposure(INTERNAL=25)*0.10=2.5,
        // businessImpact(MEDIUM=50)*0.10=5 -> 58.0 (MEDIUM bucket, since HIGH starts at 60)
        assertThat(result.getRiskScore()).isEqualByComparingTo(BigDecimal.valueOf(58.0));
        assertThat(result.getRiskLevel()).isEqualTo("MEDIUM");
    }

    @Test
    void higherCvssAlwaysProducesAHigherOrEqualScoreAllElseEqual() {
        RiskScore lower = service.score(cve("CVE-A", 3.0), analysis("MEDIUM"), profile("MEDIUM", "INTERNAL", "MEDIUM"));
        RiskScore higher = service.score(cve("CVE-B", 9.0), analysis("MEDIUM"), profile("MEDIUM", "INTERNAL", "MEDIUM"));

        assertThat(higher.getRiskScore()).isGreaterThan(lower.getRiskScore());
    }

    @Test
    void weightsNotSummingToOneFailFastAtStartup() {
        RiskScoringProperties badProperties = new RiskScoringProperties();
        badProperties.getWeights().setCvss(0.9); // now sums to way more than 1.0
        RiskScoringService badService = new RiskScoringService(badProperties);

        assertThatThrownBy(badService::validateWeights)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must sum to 1.0");
    }
}
