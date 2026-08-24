package com.security.cveingestion.dto.github;

public record PushScanAndPrRequest(
        String localPath,
        String projectName,
        String owner,
        String repo,
        String baseBranch,
        String newBranchName, // optional - null/blank means auto-generated
        Boolean forcePush     // optional - null/false means a normal, safe push (default)
) {}
