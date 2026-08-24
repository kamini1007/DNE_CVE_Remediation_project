package com.security.cveingestion.controller;

import com.security.cveingestion.scheduler.ScannerAutoScanScheduler;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/ingestion/scanner-findings/auto-scan")
@RequiredArgsConstructor
public class ScannerAutoScanController {

    private final ScannerAutoScanScheduler scheduler;

    /** Runs the configured auto-scan targets right now, without waiting for the cron. Useful for testing config changes. */
    @PostMapping("/trigger")
    public ResponseEntity<?> trigger() {
        scheduler.runNow();
        return ResponseEntity.accepted().body(Map.of(
                "message", "Auto-scan triggered - check ingestion-service's logs and the Scanner Findings page for results"));
    }
}
