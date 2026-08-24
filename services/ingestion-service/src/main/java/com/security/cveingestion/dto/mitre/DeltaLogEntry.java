package com.security.cveingestion.dto.mitre;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.List;

/**
 * Shape of an entry in the CVE Program's cvelistV5 deltaLog.json.
 * NOTE: this is a best-effort mapping of the public delta log schema; the CVE
 * Program has changed field names before, so {@code @JsonIgnoreProperties(ignoreUnknown = true)}
 * is used everywhere and the connector degrades gracefully if fields are missing.
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class DeltaLogEntry {
    private String fetchTime;
    private int numberOfChanges;
    private List<ChangedRecord> newRecords;
    private List<ChangedRecord> updatedRecords;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ChangedRecord {
        private String cveId;
        private String githubLink; // relative or absolute path to the CVE JSON file
    }
}
