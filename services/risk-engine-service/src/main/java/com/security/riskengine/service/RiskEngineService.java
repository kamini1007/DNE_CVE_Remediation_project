package com.security.riskengine.service;

import com.security.riskengine.config.RiskScoringProperties;
import com.security.riskengine.entity.AssetProfile;
import com.security.riskengine.entity.Cve;
import com.security.riskengine.entity.CveAnalysis;
import com.security.riskengine.entity.RiskScore;
import com.security.riskengine.repository.AssetProfileRepository;
import com.security.riskengine.repository.CveAnalysisRepository;
import com.security.riskengine.repository.CveRepository;
import com.security.riskengine.repository.RiskScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class RiskEngineService {

    private final CveRepository cveRepository;
    private final CveAnalysisRepository cveAnalysisRepository;
    private final AssetProfileRepository assetProfileRepository;
    private final RiskScoreRepository riskScoreRepository;
    private final RiskScoringService riskScoringService;
    private final RiskScoringProperties properties;

    public static class BatchResult {
        public int candidates = 0;
        public int scored = 0;
        public int skipped = 0;
    }

    @Transactional
    public BatchResult runBatch(int batchSize) {
        BatchResult result = new BatchResult();

        List<Cve> candidates = cveRepository.findCvesNeedingScoring(properties.getModelVersion(), batchSize);
        result.candidates = candidates.size();

        for (Cve cve : candidates) {
            try {
                scoreOne(cve);
                result.scored++;
            } catch (Exception e) {
                log.error("[risk-engine] failed to score {}: {}", cve.getCveId(), e.getMessage(), e);
                result.skipped++;
            }
        }

        log.info("[risk-engine] batch complete: candidates={} scored={} skipped={}",
                result.candidates, result.scored, result.skipped);
        return result;
    }

    /** Scores (or re-scores) a single CVE by ID on demand - used by the manual API route. */
    @Transactional
    public RiskScore scoreCveById(String cveId) {
        Cve cve = cveRepository.findById(cveId)
                .orElseThrow(() -> new IllegalArgumentException("CVE " + cveId + " not found"));
        return scoreOne(cve);
    }

    private RiskScore scoreOne(Cve cve) {
        CveAnalysis analysis = cveAnalysisRepository.findByCveId(cve.getCveId())
                .filter(a -> "SUCCESS".equals(a.getStatus()))
                .orElseThrow(() -> new IllegalStateException(
                        "No successful AI analysis for " + cve.getCveId() + " yet - ai-analysis-service must analyze it first"));

        AssetProfile profile = assetProfileRepository.findBestMatch(cve.getVendor(), cve.getProduct())
                .orElseThrow(() -> new IllegalStateException(
                        "No matching asset profile for " + cve.getCveId() +
                        " (vendor=" + cve.getVendor() + ", product=" + cve.getProduct() +
                        ") - the global default profile should always match; check it hasn't been deleted"));

        RiskScore riskScore = riskScoringService.score(cve, analysis, profile);
        return riskScoreRepository.save(riskScore);
    }
}
