package com.security.cveingestion.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "cve-archival")
@Getter
@Setter
public class CveArchivalProperties {
    private boolean enabled = false;
    private String cron = "0 0 3 * * *"; // daily at 3am by default
    private int retentionYears = 2;
}
