package com.security.cveingestion.dto.github;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/** GitHub's Git References API response (GET/POST .../git/ref[s]/...). */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class GitHubRef {
    private String ref;
    private GitHubRefObject object;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GitHubRefObject {
        private String sha;
    }
}
