package com.security.cveingestion.dto.github;

/** What the dashboard actually shows after a PR is created - the "explain the changes" part. */
public record CreateFixPrResult(
        String prUrl,
        int prNumber,
        String branchName,
        String manifestPath,
        String packageName,
        String oldVersion,
        String newVersion,
        String cveId,
        String explanation
) {}
