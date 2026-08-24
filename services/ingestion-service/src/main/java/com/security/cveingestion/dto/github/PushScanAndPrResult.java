package com.security.cveingestion.dto.github;

public record PushScanAndPrResult(
        int cvesFound,
        int fixableFindings,
        BatchCreateFixPrResult pr // null if there was nothing fixable to open a PR for
) {}
