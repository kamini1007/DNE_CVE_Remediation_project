package com.security.cveingestion.scheduler;

import com.security.cveingestion.connector.MitreConnector;
import com.security.cveingestion.connector.NvdConnector;
import com.security.cveingestion.connector.VendorAdvisoryConnector;
import com.security.cveingestion.config.IngestionProperties;
import com.security.cveingestion.service.CveIngestionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class IngestionScheduler {

    private final CveIngestionService ingestionService;
    private final NvdConnector nvdConnector;
    private final MitreConnector mitreConnector;
    private final VendorAdvisoryConnector vendorAdvisoryConnector;
    private final IngestionProperties properties;

    @Scheduled(cron = "#{@ingestionProperties.nvd.cron}")
    public void runNvdIngestion() {
        if (!properties.getNvd().isEnabled()) return;
        log.info("Triggering scheduled NVD ingestion");
        ingestionService.runIngestion(nvdConnector);
    }

    @Scheduled(cron = "#{@ingestionProperties.mitre.cron}")
    public void runMitreIngestion() {
        if (!properties.getMitre().isEnabled()) return;
        log.info("Triggering scheduled MITRE ingestion");
        ingestionService.runIngestion(mitreConnector);
    }

    @Scheduled(cron = "#{@ingestionProperties.vendor.cron}")
    public void runVendorIngestion() {
        if (!properties.getVendor().isEnabled()) return;
        log.info("Triggering scheduled vendor advisory ingestion");
        ingestionService.runIngestion(vendorAdvisoryConnector);
    }
}
