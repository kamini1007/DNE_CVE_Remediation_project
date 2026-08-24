package com.security.cveingestion.dto.nvd;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class NvdApiResponse {
    private int resultsPerPage;
    private int startIndex;
    private int totalResults;
    private List<VulnerabilityWrapper> vulnerabilities;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class VulnerabilityWrapper {
        private NvdCveItem cve;
    }
}
