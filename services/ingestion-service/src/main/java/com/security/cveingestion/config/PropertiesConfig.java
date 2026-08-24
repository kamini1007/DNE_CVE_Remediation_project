package com.security.cveingestion.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers IngestionProperties explicitly, rather than via
 * @ConfigurationPropertiesScan, specifically so it gets a predictable bean
 * name ("ingestionProperties" - the method name) that IngestionScheduler's
 * SpEL expressions (#{@ingestionProperties.nvd.cron}, etc.) can reference.
 * @ConfigurationPropertiesScan's auto-generated name is not usable in SpEL -
 * see https://github.com/spring-projects/spring-boot/issues/19390.
 *
 * IngestionProperties itself needs no changes - it already carries
 * @ConfigurationProperties(prefix = "ingestion") at the class level, which is
 * what the binding post-processor actually uses regardless of how the bean
 * got registered.
 */
@Configuration
public class PropertiesConfig {

    @Bean
    public IngestionProperties ingestionProperties() {
        return new IngestionProperties();
    }
}
