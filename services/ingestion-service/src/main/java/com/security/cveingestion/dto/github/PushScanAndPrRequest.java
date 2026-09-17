package com.security.cveingestion.dto.github;

public record PushScanAndPrRequest(
        String source, // a real local folder path, OR a GitHub URL (https://github.com/owner/repo) - detected automatically
        String projectName,
        String owner,
        String repo,
        String baseBranch,
        String newBranchName, // optional - null/blank means auto-generated (or the Jira key, if one was created)
        Boolean forcePush     // optional - ignored entirely when source is a GitHub URL, since nothing gets pushed
) {}
