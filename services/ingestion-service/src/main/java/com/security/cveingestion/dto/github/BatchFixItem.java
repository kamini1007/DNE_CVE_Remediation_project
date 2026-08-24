package com.security.cveingestion.dto.github;

/** One included fix within a batch PR result - what actually changed. */
public record BatchFixItem(
        Long findingId,
        String cveId,
        String packageName,
        String oldVersion,
        String newVersion,
        String manifestPath
) {}
