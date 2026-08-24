package com.security.cveingestion.connector;

import com.rometools.rome.feed.synd.SyndEntry;
import com.rometools.rome.feed.synd.SyndFeed;
import com.rometools.rome.io.SyndFeedInput;
import com.rometools.rome.io.XmlReader;
import com.security.cveingestion.config.IngestionProperties;
import com.security.cveingestion.dto.RawCveRecord;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.net.URL;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Generic connector for vendor security-advisory RSS/Atom feeds (Red Hat, Debian,
 * and any additional feed added to ingestion.vendor.feeds in application.yml).
 * Each advisory entry is scanned for embedded CVE IDs (CVE-YYYY-NNNN+); entries
 * with no recognizable CVE ID are skipped since Phase 1 stores CVE-centric records.
 *
 * This is intentionally pluggable: adding a new vendor is a config change, not
 * a code change, as long as the vendor publishes a standard RSS/Atom feed. Vendors
 * with bespoke JSON/CSAF APIs (e.g. Cisco openVuln, MSRC CVRF) should get their
 * own connector class implementing CveSourceConnector in a later phase.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class VendorAdvisoryConnector implements CveSourceConnector {

    private static final Pattern CVE_PATTERN = Pattern.compile("CVE-\\d{4}-\\d{4,7}");

    private final IngestionProperties properties;
    private final JsonMapper objectMapper;

    @Override
    public String sourceKey() {
        return "VENDOR";
    }

    @Override
    public List<RawCveRecord> fetchSince(OffsetDateTime since) {
        List<RawCveRecord> results = new ArrayList<>();

        for (IngestionProperties.VendorFeed feed : properties.getVendor().getFeeds()) {
            try {
                results.addAll(fetchFeed(feed, since));
            } catch (Exception e) {
                // One bad feed shouldn't kill ingestion for the rest - log and continue.
                log.error("Vendor feed '{}' ({}) failed: {}", feed.getKey(), feed.getUrl(), e.getMessage());
            }
        }

        log.info("Vendor connector produced {} CVE-linked advisory records across {} feeds",
                results.size(), properties.getVendor().getFeeds().size());
        return results;
    }

    private List<RawCveRecord> fetchFeed(IngestionProperties.VendorFeed feed, OffsetDateTime since) throws Exception {
        List<RawCveRecord> records = new ArrayList<>();

        SyndFeedInput input = new SyndFeedInput();
        SyndFeed syndFeed = input.build(new XmlReader(new URL(feed.getUrl())));

        for (SyndEntry entry : syndFeed.getEntries()) {
            OffsetDateTime published = entry.getPublishedDate() != null
                    ? entry.getPublishedDate().toInstant().atOffset(ZoneOffset.UTC)
                    : null;
            OffsetDateTime updated = entry.getUpdatedDate() != null
                    ? entry.getUpdatedDate().toInstant().atOffset(ZoneOffset.UTC)
                    : published;

            if (since != null && updated != null && updated.isBefore(since)) {
                continue;
            }

            String text = entry.getTitle() + " " + (entry.getDescription() != null ? entry.getDescription().getValue() : "");
            Matcher matcher = CVE_PATTERN.matcher(text);
            List<String> cveIds = new ArrayList<>();
            while (matcher.find()) {
                cveIds.add(matcher.group());
            }

            if (cveIds.isEmpty()) {
                continue; // Phase 1 is CVE-centric; advisories without a CVE reference are skipped.
            }

            String rawJson = serializeEntry(entry);

            for (String cveId : cveIds) {
                records.add(RawCveRecord.builder()
                        .cveId(cveId)
                        .sourceName("VENDOR:" + feed.getKey())
                        .description(entry.getTitle())
                        .publishedDate(published)
                        .lastModifiedDate(updated)
                        .vendor(feed.getDisplayName())
                        .referenceUrls(List.of(entry.getLink()))
                        .rawJson(rawJson)
                        .build());
            }
        }
        return records;
    }

    /**
     * Builds an actual JSON representation of the feed entry's relevant fields.
     * The Rome library's SyndEntry.toString() produces its own internal debug
     * text (starts with "SyndEntryImpl...") - NOT JSON - which was previously
     * being written directly into cve.raw_data (a jsonb column), causing every
     * vendor-sourced upsert to fail with "invalid input syntax for type json"
     * the moment an entry actually matched an existing CVE. This builds a
     * genuinely valid JSON object from the fields worth keeping instead.
     */
    private String serializeEntry(SyndEntry entry) {
        try {
            Map<String, Object> raw = new LinkedHashMap<>();
            raw.put("title", entry.getTitle());
            raw.put("link", entry.getLink());
            raw.put("publishedDate", entry.getPublishedDate() != null ? entry.getPublishedDate().toInstant().toString() : null);
            raw.put("updatedDate", entry.getUpdatedDate() != null ? entry.getUpdatedDate().toInstant().toString() : null);
            raw.put("description", entry.getDescription() != null ? entry.getDescription().getValue() : null);
            return objectMapper.writeValueAsString(raw);
        } catch (Exception e) {
            log.warn("Could not serialize vendor advisory entry '{}' for raw_data: {}", entry.getTitle(), e.getMessage());
            return null;
        }
    }
}
