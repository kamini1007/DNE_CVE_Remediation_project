package com.security.riskengine.controller;

import com.security.riskengine.entity.RiskScore;
import com.security.riskengine.repository.RiskScoreRepository;
import com.security.riskengine.service.RiskEngineService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/risk")
@RequiredArgsConstructor
public class RiskController {

    private final RiskEngineService riskEngineService;
    private final RiskScoreRepository riskScoreRepository;

    @GetMapping("/{cveId}")
    public ResponseEntity<RiskScore> getRiskScore(@PathVariable String cveId) {
        return riskScoreRepository.findByCveId(cveId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** Prioritized vulnerability list - the primary output of Phase 4, highest risk first. */
    @GetMapping
    public Page<RiskScore> listPrioritized(
            @RequestParam(required = false) String level,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        PageRequest pageRequest = PageRequest.of(page, Math.min(size, 100));
        if (level != null) {
            return riskScoreRepository.findByRiskLevelIgnoreCaseOrderByRiskScoreDesc(level, pageRequest);
        }
        return riskScoreRepository.findAllByOrderByRiskScoreDesc(pageRequest);
    }

    @PostMapping("/trigger")
    public ResponseEntity<?> trigger(@RequestParam(defaultValue = "200") int batchSize) {
        CompletableFuture.runAsync(() -> riskEngineService.runBatch(batchSize));
        return ResponseEntity.accepted().body(Map.of("message", "Risk scoring batch triggered", "batchSize", batchSize));
    }

    @PostMapping("/{cveId}")
    public ResponseEntity<?> scoreOne(@PathVariable String cveId) {
        try {
            return ResponseEntity.ok(riskEngineService.scoreCveById(cveId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        }
    }
}
