package com.security.riskengine.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "risk-engine")
public class RiskScoringProperties {

    private Scheduling scheduling = new Scheduling();
    private Weights weights = new Weights();
    private Thresholds thresholds = new Thresholds();

    /** Bumped whenever the weights/formula change materially, so risk_score.scoring_model_version stays meaningful. */
    private String modelVersion = "v1";

    @Data
    public static class Scheduling {
        private boolean enabled = true;
        private String cron = "0 30 */1 * * *"; // hourly at :30
        private int batchSize = 200;
    }

    /** Must sum to 1.0 (validated at startup) so the final score stays on a 0-100 scale. */
    @Data
    public static class Weights {
        private double cvss = 0.35;
        private double exploitability = 0.25;
        private double assetCriticality = 0.20;
        private double networkExposure = 0.10;
        private double businessImpact = 0.10;
    }

    /** Score (0-100) cutoffs for bucketing into LOW/MEDIUM/HIGH/CRITICAL. */
    @Data
    public static class Thresholds {
        private double critical = 80;
        private double high = 60;
        private double medium = 35;
    }
}
