package com.security.cveingestion.dto.github;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/**
 * GitHub's Contents API response (GET /repos/{owner}/{repo}/contents/{path}).
 * Field names already match GitHub's own JSON keys (camelCase where GitHub
 * uses camelCase) except where noted - unlike Trivy's PascalCase schema
 * from the scanner-findings feature, GitHub's API is genuinely camelCase/
 * snake_case-lowercase, so most fields bind without @JsonProperty.
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class GitHubFileContent {
    private String content; // base64-encoded, with embedded newlines GitHub inserts every 60 chars
    private String encoding;
    private String sha;
    private String path;
}
