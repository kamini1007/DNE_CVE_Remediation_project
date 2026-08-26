package com.security.cveingestion.scheduler;

import com.security.cveingestion.config.CveArchivalProperties;
import com.security.cveingestion.service.CveArchivalService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class CveArchivalScheduler {

    private final CveArchivalProperties properties;
    private final CveArchivalService cveArchivalService;

    @Scheduled(cron = "${cve-archival.cron:0 0 3 * * *}")
    public void runScheduledArchival() {
        runNow();
    }

    /** Also called by the manual trigger endpoint, for testing without waiting on the cron. */
    public void runNow() {
        if (!properties.isEnabled()) {
            log.debug("[cve-archival] disabled (cve-archival.enabled=false) - skipping");
            return;
        }
        cveArchivalService.archiveOldCves(properties.getRetentionYears());
    }
}
