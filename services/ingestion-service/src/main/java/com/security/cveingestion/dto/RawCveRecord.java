package com.security.cveingestion.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Common intermediate representation that every source connector (NVD, MITRE,
 * vendor advisory feeds) must produce. The normalizer service turns this into
 * a persisted {@link com.security.cveingestion.entity.Cve} row.
 */
@Data
@Builder
public class RawCveRecord {
    private String cveId;                 // e.g. CVE-2024-12345
    private String sourceName;            // NVD / MITRE / VENDOR:redhat etc.
    private String description;
    private BigDecimal cvssV3Score;
    private String cvssV3Severity;
    private BigDecimal cvssV2Score;
    private String cvssV2Severity;
    private OffsetDateTime publishedDate;
    private OffsetDateTime lastModifiedDate;
    private String vulnStatus;
    private String vendor;
    private String product;
    private String cweIds;                // comma separated
    private List<String> referenceUrls;
    private String rawJson;               // original payload, for traceability
}
