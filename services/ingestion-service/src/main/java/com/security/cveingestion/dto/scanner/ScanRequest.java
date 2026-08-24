package com.security.cveingestion.dto.scanner;

/**
 * source is either a GitHub repo URL (Trivy's native "trivy repo" mode,
 * which clones and scans without needing a separate git clone step) or a
 * local filesystem path already checked out on the machine running
 * ingestion-service (Trivy's "trivy fs" mode).
 */
public record ScanRequest(String projectName, String source) {}
