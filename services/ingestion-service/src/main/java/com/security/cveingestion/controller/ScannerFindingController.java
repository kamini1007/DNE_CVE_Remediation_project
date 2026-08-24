package com.security.cveingestion.controller;

import com.security.cveingestion.dto.scanner.ScanRequest;
import com.security.cveingestion.entity.ScannerFinding;
import com.security.cveingestion.repository.ScannerFindingRepository;
import com.security.cveingestion.service.ScannerFindingIngestionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ingestion/scanner-findings")
@RequiredArgsConstructor
public class ScannerFindingController {

    private final ScannerFindingIngestionService scannerFindingIngestionService;
    private final ScannerFindingRepository scannerFindingRepository;

    /**
     * Accepts a scanner's raw report body directly (not a wrapper object) -
     * point curl/Invoke-RestMethod's -InFile or -Body straight at a Trivy
     * JSON output file. Only "trivy" is supported today.
     */
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> ingest(
            @RequestParam String projectName,
            @RequestParam(defaultValue = "trivy") String format,
            @RequestBody String rawJson) {

        if (!"trivy".equalsIgnoreCase(format)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Unsupported format '" + format + "' - only 'trivy' is currently supported"));
        }

        try {
            ScannerFindingIngestionService.ScanIngestResult result =
                    scannerFindingIngestionService.ingestTrivyReport(projectName, rawJson);
            return ResponseEntity.ok(Map.of(
                    "projectName", projectName,
                    "cvesUpserted", result.cvesUpserted(),
                    "findingsRecorded", result.findingsRecorded(),
                    "skippedNonCve", result.skippedNonCve()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Runs Trivy itself against a GitHub URL or local path - see the
     * security notes on ScannerFindingIngestionService.runTrivyScan(). This
     * blocks for the scan's duration (up to ~3 minutes for a large repo).
     */
    @PostMapping(path = "/scan", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> scan(@RequestBody ScanRequest request) {
        if (request.projectName() == null || request.projectName().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "projectName is required"));
        }
        if (request.source() == null || request.source().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "source (GitHub URL or local path) is required"));
        }

        try {
            ScannerFindingIngestionService.ScanIngestResult result =
                    scannerFindingIngestionService.runTrivyScan(request.projectName(), request.source());
            return ResponseEntity.ok(Map.of(
                    "projectName", request.projectName(),
                    "source", request.source(),
                    "cvesUpserted", result.cvesUpserted(),
                    "findingsRecorded", result.findingsRecorded(),
                    "skippedNonCve", result.skippedNonCve()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping
    public List<ScannerFinding> allFindings() {
        return scannerFindingRepository.findAllByOrderByScannedAtDesc();
    }

    @GetMapping("/cve/{cveId}")
    public List<ScannerFinding> findingsForCve(@PathVariable String cveId) {
        return scannerFindingRepository.findByCveId(cveId);
    }

    @GetMapping("/project/{projectName}")
    public List<ScannerFinding> findingsForProject(@PathVariable String projectName) {
        return scannerFindingRepository.findByProjectNameOrderByScannedAtDesc(projectName);
    }
}
