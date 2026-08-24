package com.security.cveingestion.controller;

import com.security.cveingestion.connector.MitreConnector;
import com.security.cveingestion.connector.NvdConnector;
import com.security.cveingestion.connector.VendorAdvisoryConnector;
import com.security.cveingestion.entity.Cve;
import com.security.cveingestion.entity.IngestionLog;
import com.security.cveingestion.repository.CveRepository;
import com.security.cveingestion.repository.IngestionLogRepository;
import com.security.cveingestion.service.CveIngestionService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class IngestionController {

    private final CveIngestionService ingestionService;
    private final NvdConnector nvdConnector;
    private final MitreConnector mitreConnector;
    private final VendorAdvisoryConnector vendorAdvisoryConnector;
    private final CveRepository cveRepository;
    private final IngestionLogRepository ingestionLogRepository;

    private final Executor manualTriggerExecutor = Executors.newSingleThreadExecutor();

    @PostMapping("/ingestion/trigger/{source}")
    public ResponseEntity<?> trigger(@PathVariable String source) {
        var connector = switch (source.toUpperCase()) {
            case "NVD" -> nvdConnector;
            case "MITRE" -> mitreConnector;
            case "VENDOR" -> vendorAdvisoryConnector;
            default -> null;
        };

        if (connector == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Unknown source. Use NVD, MITRE, or VENDOR."));
        }

        // Run async so the HTTP call returns immediately; check status via /ingestion/logs/{source}.
        CompletableFuture.runAsync(() -> ingestionService.runIngestion(connector), manualTriggerExecutor);

        return ResponseEntity.accepted().body(Map.of(
                "message", "Ingestion triggered for " + source,
                "statusEndpoint", "/api/ingestion/logs/" + source.toUpperCase()
        ));
    }

    @GetMapping("/ingestion/logs/{source}")
    public List<IngestionLog> logs(@PathVariable String source) {
        return ingestionLogRepository.findTop20BySourceOrderByStartedAtDesc(source.toUpperCase());
    }

    @GetMapping("/cves/{cveId}")
    public ResponseEntity<Cve> getCve(@PathVariable String cveId) {
        return cveRepository.findByCveId(cveId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/cves")
    public Page<Cve> listCves(
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String vendor,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        PageRequest pageRequest = PageRequest.of(page, Math.min(size, 100));
        if (severity != null) {
            return cveRepository.findByCvssV3SeverityIgnoreCase(severity, pageRequest);
        }
        if (vendor != null) {
            return cveRepository.findByVendorIgnoreCase(vendor, pageRequest);
        }
        return cveRepository.findAll(pageRequest);
    }
}
