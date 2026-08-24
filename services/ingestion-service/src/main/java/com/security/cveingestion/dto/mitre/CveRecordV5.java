package com.security.cveingestion.dto.mitre;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class CveRecordV5 {
    private CveMetadata cveMetadata;
    private Containers containers;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CveMetadata {
        private String cveId;
        private String state;
        private String datePublished;
        private String dateUpdated;
        private String dateReserved;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Containers {
        private Cna cna;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Cna {
        private List<Description> descriptions;
        private List<Map<String, Object>> metrics; // keyed by "cvssV3_1", "cvssV2_0" etc - parsed defensively
        private List<Reference> references;
        private List<Affected> affected;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Description {
        private String lang;
        private String value;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Reference {
        private String url;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Affected {
        private String vendor;
        private String product;
    }
}
