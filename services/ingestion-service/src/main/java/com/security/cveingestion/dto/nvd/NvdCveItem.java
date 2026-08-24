package com.security.cveingestion.dto.nvd;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class NvdCveItem {
    private String id;
    private String sourceIdentifier;
    private String published;
    private String lastModified;
    private String vulnStatus;
    private List<Description> descriptions;
    private Metrics metrics;
    private List<Reference> references;
    private List<Weakness> weaknesses;

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
        private String source;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Weakness {
        private String source;
        private List<Description> description;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Metrics {
        private List<CvssV31Metric> cvssMetricV31;
        private List<CvssV30Metric> cvssMetricV30;
        private List<CvssV2Metric> cvssMetricV2;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CvssV31Metric {
        private CvssData cvssData;
        private String baseSeverity;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CvssV30Metric {
        private CvssData cvssData;
        private String baseSeverity;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CvssV2Metric {
        private CvssData cvssData;
        private String baseSeverity;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CvssData {
        private Double baseScore;
        private String baseSeverity; // present on v3 cvssData too
    }
}
