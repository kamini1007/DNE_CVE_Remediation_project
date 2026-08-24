package com.security.cveingestion.dto.scanner;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

/**
 * Subset of Trivy's JSON output (`trivy fs/image/repo -f json`) - only the
 * fields this pipeline actually uses. Trivy's JSON keys are PascalCase
 * (Results, VulnerabilityID, etc.) - Jackson's default binding is
 * case-sensitive, so every field here needs an explicit @JsonProperty
 * rather than relying on name matching. Trivy's schema has also changed
 * across major versions before, so ignoreUnknown = true throughout, same
 * convention as the NVD/MITRE DTOs.
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class TrivyReport {
    @JsonProperty("Results")
    private List<TrivyResult> results;
}
