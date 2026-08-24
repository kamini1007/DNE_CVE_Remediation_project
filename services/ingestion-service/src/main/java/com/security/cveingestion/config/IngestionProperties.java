package com.security.cveingestion.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Binds the "ingestion.*" tree in application.yml.
 * Each source (nvd / mitre / vendor) is independently configurable:
 * enabled flag, cron expression, and source-specific settings.
 */
@Data
@ConfigurationProperties(prefix = "ingestion")
public class IngestionProperties {

    private Nvd nvd = new Nvd();
    private Mitre mitre = new Mitre();
    private Vendor vendor = new Vendor();

    @Data
    public static class Nvd {
        private boolean enabled = true;
        private String cron = "0 */30 * * * *"; // every 30 min
        private String baseUrl = "https://services.nvd.nist.gov/rest/json/cves/2.0";
        /** Optional - increases rate limit from 5/30s to 50/30s. Leave blank if none. */
        private String apiKey = "";
        private int resultsPerPage = 200;
        /** Delay between paginated calls, required by NVD rate limits when no API key is set. */
        private long requestDelayMs = 6000;
        /** First-ever run window when there is no ingestion_state row yet. */
        private int initialBackfillDays = 7;
    }

    @Data
    public static class Mitre {
        private boolean enabled = true;
        private String cron = "0 15 */1 * * *"; // hourly at :15
        /**
         * MITRE's legacy cve.mitre.org feeds are retired. CVE authority now sits with
         * the CVE Program (cve.org). The cvelistV5 GitHub repo publishes a public,
         * no-auth delta log of newly added/updated CVE JSON records - that is what
         * this connector polls.
         */
        private String deltaLogUrl = "https://raw.githubusercontent.com/CVEProject/cvelistV5/main/cves/deltaLog.json";
        private String rawContentBaseUrl = "https://raw.githubusercontent.com/CVEProject/cvelistV5/main/";
        private int maxRecordsPerRun = 500;
    }

    @Data
    public static class Vendor {
        private boolean enabled = true;
        private String cron = "0 45 */2 * * *"; // every 2 hours at :45
        /** List of vendor advisory RSS/Atom feeds to poll. Add more as needed. */
        private List<VendorFeed> feeds = List.of(
                new VendorFeed("redhat", "Red Hat Security Advisories",
                        "https://access.redhat.com/security/data/metrics/rhsa.rss"),
                new VendorFeed("debian", "Debian Security Advisories",
                        "https://www.debian.org/security/dsa-long")
        );
    }

    @Data
    public static class VendorFeed {
        private String key;
        private String displayName;
        private String url;

        public VendorFeed() {}

        public VendorFeed(String key, String displayName, String url) {
            this.key = key;
            this.displayName = displayName;
            this.url = url;
        }
    }
}
