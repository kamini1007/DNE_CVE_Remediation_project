package com.security.cveingestion.controller;

import com.security.cveingestion.scheduler.CveArchivalScheduler;
import com.security.cveingestion.service.CveArchivalService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/ingestion/cve-archival")
@RequiredArgsConstructor
public class CveArchivalController {

    private final CveArchivalScheduler scheduler;
    private final CveArchivalService cveArchivalService;

    /** Runs archival right now, without waiting for the cron - useful for testing config changes. */
    @PostMapping("/trigger")
    public ResponseEntity<?> trigger() {
        scheduler.runNow();
        return ResponseEntity.accepted().body(Map.of(
                "message", "Archival triggered - check ingestion-service's logs, and /status below, for results"));
    }

    /** How many CVEs are currently archived vs. active. */
    @GetMapping("/status")
    public CveArchivalService.ArchivalStatus status() {
        return cveArchivalService.getStatus();
    }
}
