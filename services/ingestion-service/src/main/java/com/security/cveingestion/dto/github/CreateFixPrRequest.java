package com.security.cveingestion.dto.github;

/**
 * owner/repo identify the target GitHub repository - the PAT's own access
 * (see GitHubPrService) is what actually controls whether this succeeds,
 * not any validation here. manifestPath is relative to the repo root, e.g.
 * "package.json" or "services/foo/pom.xml". newBranchName is optional - if
 * blank/null, an auto-generated name is used instead (fix/<cve>-<package>).
 */
public record CreateFixPrRequest(
        String owner,
        String repo,
        String baseBranch,
        String manifestPath,
        String newBranchName
) {}
