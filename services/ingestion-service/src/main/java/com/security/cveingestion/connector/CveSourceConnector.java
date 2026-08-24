package com.security.cveingestion.connector;

import com.security.cveingestion.dto.RawCveRecord;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Contract for any CVE data source. Each connector is responsible for talking
 * to its upstream API/feed and returning normalized-ish intermediate records;
 * the CveNormalizerService does the final mapping into the Cve entity.
 */
public interface CveSourceConnector {

    /** Unique key used in ingestion_state / ingestion_log, e.g. "NVD", "MITRE", "VENDOR:redhat" */
    String sourceKey();

    /**
     * Fetch records changed since the given timestamp (inclusive). Implementations
     * should page through their upstream API as needed and respect rate limits.
     *
     * @param since null means "first run" - connector should apply its own backfill window.
     */
    List<RawCveRecord> fetchSince(OffsetDateTime since);
}
