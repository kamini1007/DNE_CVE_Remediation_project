package com.security.cveingestion.connector;

// Spring Boot 4 auto-configures a Jackson 3 JsonMapper bean by default, not a
// com.fasterxml.jackson.databind.ObjectMapper - that's now a separate,
// explicitly deprecated "spring-boot-jackson2" compatibility module. Using
// JsonMapper directly here rather than pulling in the deprecated shim.
import tools.jackson.databind.json.JsonMapper;
import com.security.cveingestion.config.IngestionProperties;
import com.security.cveingestion.dto.RawCveRecord;
import com.security.cveingestion.dto.nvd.NvdApiResponse;
import com.security.cveingestion.dto.nvd.NvdCveItem;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Pulls CVE records from the NVD API 2.0 (https://services.nvd.nist.gov/rest/json/cves/2.0).
 * NVD requires the modification window (start/end) to span no more than 120 days,
 * and rate-limits requests (5 req/30s without an API key, 50/30s with one) - this
 * connector paginates via startIndex and sleeps between calls accordingly.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class NvdConnector implements CveSourceConnector {

    private static final DateTimeFormatter NVD_DATE_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");

    private final RestTemplate restTemplate;
    private final IngestionProperties properties;
    private final JsonMapper objectMapper;

    @Override
    public String sourceKey() {
        return "NVD";
    }

    @Override
    public List<RawCveRecord> fetchSince(OffsetDateTime since) {
        IngestionProperties.Nvd cfg = properties.getNvd();

        OffsetDateTime end = OffsetDateTime.now(ZoneOffset.UTC);
        OffsetDateTime start = since != null
                ? since
                : end.minusDays(cfg.getInitialBackfillDays());

        List<RawCveRecord> results = new ArrayList<>();
        int startIndex = 0;
        int totalResults = Integer.MAX_VALUE;

        while (startIndex < totalResults) {
            // fromHttpUrl(String) was deprecated in Spring Framework 6.2 and
            // removed entirely in 7.0 (used by Spring Boot 4.1). fromUriString
            // is the direct replacement - behaves identically for our https://
            // base URL, just without fromHttpUrl's extra restriction to
            // http/https schemes specifically.
            String url = UriComponentsBuilder.fromUriString(cfg.getBaseUrl())
                    .queryParam("lastModStartDate", start.format(NVD_DATE_FORMAT))
                    .queryParam("lastModEndDate", end.format(NVD_DATE_FORMAT))
                    .queryParam("resultsPerPage", cfg.getResultsPerPage())
                    .queryParam("startIndex", startIndex)
                    .build()
                    .toUriString();

            HttpHeaders headers = new HttpHeaders();
            if (cfg.getApiKey() != null && !cfg.getApiKey().isBlank()) {
                headers.set("apiKey", cfg.getApiKey());
            }

            try {
                NvdApiResponse response = restTemplate
                        .exchange(url, HttpMethod.GET, new HttpEntity<>(headers), NvdApiResponse.class)
                        .getBody();

                if (response == null || response.getVulnerabilities() == null) {
                    break;
                }

                totalResults = response.getTotalResults();
                results.addAll(response.getVulnerabilities().stream()
                        .map(NvdApiResponse.VulnerabilityWrapper::getCve)
                        .map(this::toRawRecord)
                        .collect(Collectors.toList()));

                startIndex += response.getResultsPerPage();

                if (startIndex < totalResults) {
                    Thread.sleep(cfg.getRequestDelayMs());
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new RuntimeException("NVD ingestion interrupted", e);
            } catch (Exception e) {
                log.error("NVD fetch failed at startIndex={}: {}", startIndex, e.getMessage(), e);
                throw new RuntimeException("NVD ingestion failed: " + e.getMessage(), e);
            }
        }

        log.info("NVD connector fetched {} records for window {} -> {}", results.size(), start, end);
        return results;
    }

    private RawCveRecord toRawRecord(NvdCveItem item) {
        RawCveRecord.RawCveRecordBuilder builder = RawCveRecord.builder()
                .cveId(item.getId())
                .sourceName(sourceKey())
                .vulnStatus(item.getVulnStatus());

        if (item.getDescriptions() != null) {
            item.getDescriptions().stream()
                    .filter(d -> "en".equalsIgnoreCase(d.getLang()))
                    .findFirst()
                    .ifPresent(d -> builder.description(d.getValue()));
        }

        if (item.getPublished() != null) {
            builder.publishedDate(parseNvdDate(item.getPublished()));
        }
        if (item.getLastModified() != null) {
            builder.lastModifiedDate(parseNvdDate(item.getLastModified()));
        }

        applyCvss(item, builder);

        if (item.getReferences() != null) {
            builder.referenceUrls(item.getReferences().stream()
                    .map(NvdCveItem.Reference::getUrl)
                    .collect(Collectors.toList()));
        }

        if (item.getWeaknesses() != null && !item.getWeaknesses().isEmpty()) {
            String cwes = item.getWeaknesses().stream()
                    .flatMap(w -> w.getDescription() == null ? List.<NvdCveItem.Description>of().stream() : w.getDescription().stream())
                    .map(NvdCveItem.Description::getValue)
                    .distinct()
                    .collect(Collectors.joining(","));
            builder.cweIds(cwes);
        }

        try {
            builder.rawJson(objectMapper.writeValueAsString(item));
        } catch (Exception e) {
            log.warn("Could not serialize raw NVD payload for {}: {}", item.getId(), e.getMessage());
        }

        return builder.build();
    }

    private void applyCvss(NvdCveItem item, RawCveRecord.RawCveRecordBuilder builder) {
        if (item.getMetrics() == null) {
            return;
        }
        // Prefer v3.1, then v3.0, then v2 - the same precedence NVD's own UI uses.
        if (item.getMetrics().getCvssMetricV31() != null && !item.getMetrics().getCvssMetricV31().isEmpty()) {
            var m = item.getMetrics().getCvssMetricV31().get(0);
            builder.cvssV3Score(BigDecimal.valueOf(m.getCvssData().getBaseScore()));
            builder.cvssV3Severity(m.getBaseSeverity() != null ? m.getBaseSeverity() : m.getCvssData().getBaseSeverity());
        } else if (item.getMetrics().getCvssMetricV30() != null && !item.getMetrics().getCvssMetricV30().isEmpty()) {
            var m = item.getMetrics().getCvssMetricV30().get(0);
            builder.cvssV3Score(BigDecimal.valueOf(m.getCvssData().getBaseScore()));
            builder.cvssV3Severity(m.getBaseSeverity() != null ? m.getBaseSeverity() : m.getCvssData().getBaseSeverity());
        }

        if (item.getMetrics().getCvssMetricV2() != null && !item.getMetrics().getCvssMetricV2().isEmpty()) {
            var m = item.getMetrics().getCvssMetricV2().get(0);
            builder.cvssV2Score(BigDecimal.valueOf(m.getCvssData().getBaseScore()));
            builder.cvssV2Severity(m.getBaseSeverity());
        }
    }

    private OffsetDateTime parseNvdDate(String value) {
        // NVD returns e.g. "2024-01-15T10:30:00.000" (no zone) - treat as UTC.
        String normalized = value.endsWith("Z") ? value : value + "Z";
        try {
            return OffsetDateTime.parse(normalized);
        } catch (Exception e) {
            return java.time.LocalDateTime.parse(value).atOffset(ZoneOffset.UTC);
        }
    }
}
