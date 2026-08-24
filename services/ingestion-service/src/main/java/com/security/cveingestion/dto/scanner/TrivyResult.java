package com.security.cveingestion.dto.scanner;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class TrivyResult {
    @JsonProperty("Target")
    private String target; // e.g. "package-lock.json", or a Docker image layer

    @JsonProperty("Type")
    private String type; // e.g. "npm", "maven", "pip" - the ecosystem, used as `vendor` downstream

    @JsonProperty("Vulnerabilities")
    private List<TrivyVulnerability> vulnerabilities;
}
