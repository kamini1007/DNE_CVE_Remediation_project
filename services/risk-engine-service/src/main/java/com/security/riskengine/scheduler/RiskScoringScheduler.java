package com.security.riskengine.scheduler;

import com.security.riskengine.config.RiskScoringProperties;
import com.security.riskengine.service.RiskEngineService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class RiskScoringScheduler {

    private final RiskEngineService riskEngineService;
    private final RiskScoringProperties properties;

    @Scheduled(cron = "#{@riskScoringProperties.scheduling.cron}")
    public void runScheduledScoring() {
        if (!properties.getScheduling().isEnabled()) return;
        log.info("Triggering scheduled risk scoring batch");
        riskEngineService.runBatch(properties.getScheduling().getBatchSize());
    }
}
