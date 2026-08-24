package com.security.cveingestion.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Configures which local projects get auto-scanned on a schedule. Scanning
 * only - PR creation is deliberately NOT automated here (see
 * ScannerAutoScanScheduler's class comment for why).
 *
 * @Component + @ConfigurationProperties self-registers without needing
 * @ConfigurationPropertiesScan or a manual @Bean method - this avoids the
 * SpEL bean-name issue hit earlier in this project (fixed via an explicit
 * PropertiesConfig.java for ingestion/risk properties), since this class
 * uses property-placeholder syntax (${scanner.scheduling.cron}) for its
 * cron expression, not a SpEL bean reference.
 */
@Component
@ConfigurationProperties(prefix = "scanner")
@Getter
@Setter
public class ScannerAutoScanProperties {

    private Scheduling scheduling = new Scheduling();
    private List<ScanTarget> targets = new ArrayList<>();

    @Getter
    @Setter
    public static class Scheduling {
        private boolean enabled = false;
        private String cron = "0 0 */6 * * *"; // every 6 hours by default
    }

    @Getter
    @Setter
    public static class ScanTarget {
        private String projectName;
        private String source; // local path or GitHub URL, same as the manual scan form
    }
}
