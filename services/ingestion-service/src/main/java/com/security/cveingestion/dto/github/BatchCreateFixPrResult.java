package com.security.cveingestion.dto.github;

import java.util.List;

public record BatchCreateFixPrResult(
        String prUrl,
        int prNumber,
        String branchName,
        List<BatchFixItem> included,
        List<String> skipped // findings that couldn't be included, with why
) {}
