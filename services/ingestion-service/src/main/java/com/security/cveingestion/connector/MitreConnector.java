package com.security.cveingestion.connector;

// Spring Boot 4 auto-configures a Jackson 3 JsonMapper bean by default, not a
// com.fasterxml.jackson.databind.ObjectMapper - that's now a separate,
// explicitly deprecated "spring-boot-jackson2" compatibility module. Using
// JsonMapper directly here rather than pulling in the deprecated shim.
import tools.jackson.databind.json.JsonMapper;
import com.security.cveingestion.config.IngestionProperties;
import com.security.cveingestion.dto.RawCveRecord;
import com.security.cveingestion.dto.mitre.CveRecordV5;
import com.security.cveingestion.dto.mitre.DeltaLogEntry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

/**
 * MITRE's legacy cve.mitre.org bulk feeds have been retired; CVE authority now
 * sits with the CVE Program (cve.org). This connector polls the public,
 * no-auth cvelistV5 GitHub repo's deltaLog.json for newly added/updated CVE
 * JSON records and fetches each changed record's raw file.
 *
 * If MITRE/CVE Program credentials become available later (services.cve.org),
 * swap this out for the authenticated CVE Services API for higher fidelity
 * and lower latency - this connector is the no-auth fallback appropriate for
 * Phase 1.
 *
 * IMPORTANT: raw.githubusercontent.com serves every file with
 * "Content-Type: text/plain", regardless of extension - even .json files.
 * RestTemplate's automatic message-converter-based deserialization requires
 * "application/json" and throws UnknownContentTypeException otherwise, so
 * every fetch here is pulled as a raw String and parsed manually via
 * JsonMapper instead of restTemplate.getForObject(url, SomeClass.class).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class MitreConnector implements CveSourceConnector {

    private final RestTemplate restTemplate;
    private final IngestionProperties properties;
    private final JsonMapper objectMapper;

    @Override
    public String sourceKey() {
        return "MITRE";
    }

    @Override
    public List<RawCveRecord> fetchSince(OffsetDateTime since) {
        IngestionProperties.Mitre cfg = properties.getMitre();
        List<RawCveRecord> results = new ArrayList<>();

        List<DeltaLogEntry> deltaLog;
        try {
            String deltaLogJson = restTemplate.getForObject(cfg.getDeltaLogUrl(), String.class);
            DeltaLogEntry[] entries = deltaLogJson == null ? null : objectMapper.readValue(deltaLogJson, DeltaLogEntry[].class);
            deltaLog = entries == null ? List.of() : Arrays.asList(entries);
        } catch (Exception e) {
            log.error("Failed to fetch MITRE deltaLog.json: {}", e.getMessage(), e);
            throw new RuntimeException("MITRE ingestion failed fetching delta log: " + e.getMessage(), e);
        }

        // Collect unique changed records whose fetchTime is after our watermark, newest first.
        LinkedHashMap<String, String> changedIdToPath = new LinkedHashMap<>();
        for (DeltaLogEntry entry : deltaLog) {
            if (since != null && entry.getFetchTime() != null) {
                Instant fetchInstant = parseInstantSafe(entry.getFetchTime());
                if (fetchInstant != null && fetchInstant.isBefore(since.toInstant())) {
                    continue;
                }
            }
            addAll(changedIdToPath, entry.getNewRecords());
            addAll(changedIdToPath, entry.getUpdatedRecords());
            if (changedIdToPath.size() >= cfg.getMaxRecordsPerRun()) {
                break;
            }
        }

        int count = 0;
        for (Map.Entry<String, String> e : changedIdToPath.entrySet()) {
            if (count++ >= cfg.getMaxRecordsPerRun()) break;
            try {
                String fileUrl = resolveUrl(cfg.getRawContentBaseUrl(), e.getValue());
                String recordJson = restTemplate.getForObject(fileUrl, String.class);
                CveRecordV5 record = recordJson == null ? null : objectMapper.readValue(recordJson, CveRecordV5.class);
                if (record != null) {
                    results.add(toRawRecord(record));
                }
            } catch (Exception ex) {
                log.warn("Skipping MITRE record {} due to fetch/parse error: {}", e.getKey(), ex.getMessage());
            }
        }

        log.info("MITRE connector fetched {} changed records", results.size());
        return results;
    }

    private void addAll(Map<String, String> target, List<DeltaLogEntry.ChangedRecord> records) {
        if (records == null) return;
        for (DeltaLogEntry.ChangedRecord r : records) {
            if (r.getCveId() != null) {
                target.put(r.getCveId(), r.getGithubLink());
            }
        }
    }

    private String resolveUrl(String base, String path) {
        if (path == null) return null;
        if (path.startsWith("http")) return path;
        return base + (path.startsWith("/") ? path.substring(1) : path);
    }

    private RawCveRecord toRawRecord(CveRecordV5 record) {
        RawCveRecord.RawCveRecordBuilder builder = RawCveRecord.builder()
                .cveId(record.getCveMetadata() != null ? record.getCveMetadata().getCveId() : null)
                .sourceName(sourceKey())
                .vulnStatus(record.getCveMetadata() != null ? record.getCveMetadata().getState() : null);

        if (record.getCveMetadata() != null) {
            if (record.getCveMetadata().getDatePublished() != null) {
                builder.publishedDate(parseDateSafe(record.getCveMetadata().getDatePublished()));
            }
            if (record.getCveMetadata().getDateUpdated() != null) {
                builder.lastModifiedDate(parseDateSafe(record.getCveMetadata().getDateUpdated()));
            }
        }

        CveRecordV5.Cna cna = record.getContainers() != null ? record.getContainers().getCna() : null;
        if (cna != null) {
            if (cna.getDescriptions() != null) {
                cna.getDescriptions().stream()
                        .filter(d -> "en".equalsIgnoreCase(d.getLang()))
                        .findFirst()
                        .ifPresent(d -> builder.description(d.getValue()));
            }
            if (cna.getReferences() != null) {
                builder.referenceUrls(cna.getReferences().stream()
                        .map(CveRecordV5.Reference::getUrl)
                        .filter(Objects::nonNull)
                        .collect(Collectors.toList()));
            }
            if (cna.getAffected() != null && !cna.getAffected().isEmpty()) {
                var affected = cna.getAffected().get(0);
                builder.vendor(affected.getVendor());
                builder.product(affected.getProduct());
            }
            applyCvssFromMetrics(cna.getMetrics(), builder);
        }

        try {
            builder.rawJson(objectMapper.writeValueAsString(record));
        } catch (Exception e) {
            log.warn("Could not serialize raw MITRE payload: {}", e.getMessage());
        }

        return builder.build();
    }

    @SuppressWarnings("unchecked")
    private void applyCvssFromMetrics(List<Map<String, Object>> metrics, RawCveRecord.RawCveRecordBuilder builder) {
        if (metrics == null) return;
        for (Map<String, Object> metric : metrics) {
            for (String key : List.of("cvssV3_1", "cvssV3_0")) {
                if (metric.containsKey(key)) {
                    Map<String, Object> data = (Map<String, Object>) metric.get(key);
                    Object score = data.get("baseScore");
                    if (score != null) {
                        builder.cvssV3Score(new BigDecimal(score.toString()));
                        builder.cvssV3Severity((String) data.get("baseSeverity"));
                    }
                }
            }
            if (metric.containsKey("cvssV2_0")) {
                Map<String, Object> data = (Map<String, Object>) metric.get("cvssV2_0");
                Object score = data.get("baseScore");
                if (score != null) {
                    builder.cvssV2Score(new BigDecimal(score.toString()));
                }
            }
        }
    }

    private OffsetDateTime parseDateSafe(String value) {
        try {
            return OffsetDateTime.parse(value);
        } catch (Exception e) {
            try {
                return java.time.LocalDateTime.parse(value).atOffset(ZoneOffset.UTC);
            } catch (Exception ex) {
                return null;
            }
        }
    }

    private Instant parseInstantSafe(String value) {
        try {
            return Instant.parse(value);
        } catch (Exception e) {
            OffsetDateTime dt = parseDateSafe(value);
            return dt != null ? dt.toInstant() : null;
        }
    }
}
