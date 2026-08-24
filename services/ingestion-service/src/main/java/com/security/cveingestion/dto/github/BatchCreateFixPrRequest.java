package com.security.cveingestion.dto.github;

import java.util.List;

/**
 * No manifestPath field, unlike CreateFixPrRequest - each finding's own
 * ScannerFinding.target (Trivy's own record of which file it found the
 * dependency in) is used automatically instead of requiring it typed in
 * per finding. newBranchName is optional - if blank/null, an
 * auto-generated name is used instead (fix/batch-<timestamp>).
 */
public record BatchCreateFixPrRequest(
        List<Long> findingIds,
        String owner,
        String repo,
        String baseBranch,
        String newBranchName
) {}
