package com.security.cveingestion.dto.github;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/** GitHub's Pulls API single-PR response (GET /repos/{owner}/{repo}/pulls/{number}) - just the fields needed to check if it's still open. */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class GitHubPullRequestStatus {
    private String state; // "open" or "closed"
    private boolean merged;
}
