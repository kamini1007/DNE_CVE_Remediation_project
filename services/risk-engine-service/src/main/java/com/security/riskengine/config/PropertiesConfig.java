package com.security.riskengine.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers RiskScoringProperties explicitly, rather than via
 * @ConfigurationPropertiesScan, specifically so it gets a predictable bean
 * name ("riskScoringProperties" - the method name) that
 * RiskScoringScheduler's SpEL expression
 * (#{@riskScoringProperties.scheduling.cron}) can reference.
 *
 * RiskScoringProperties itself needs no changes - it already carries
 * @ConfigurationProperties(prefix = "risk-engine") at the class level, which
 * is what the binding post-processor actually uses regardless of how the
 * bean got registered.
 */
@Configuration
public class PropertiesConfig {

    @Bean
    public RiskScoringProperties riskScoringProperties() {
        return new RiskScoringProperties();
    }
}
