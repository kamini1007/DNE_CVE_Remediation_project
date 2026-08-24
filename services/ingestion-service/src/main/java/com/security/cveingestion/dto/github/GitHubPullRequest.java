package com.security.cveingestion.dto.github;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/** GitHub's Pulls API response (POST /repos/{owner}/{repo}/pulls). */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class GitHubPullRequest {
    private int number;

    @JsonProperty("html_url")
    private String htmlUrl;
}
