package com.security.cveingestion.service;

// Spring Boot 4 auto-configures a Jackson 3 JsonMapper bean by default, not a
// com.fasterxml.jackson.databind.ObjectMapper - that's now a separate,
// explicitly deprecated "spring-boot-jackson2" compatibility module. Using
// JsonMapper directly here rather than pulling in the deprecated shim.
import tools.jackson.databind.json.JsonMapper;
import com.security.cveingestion.dto.RawCveRecord;
import com.security.cveingestion.entity.Cve;
import com.security.cveingestion.repository.CveRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Converts RawCveRecord (source-specific intermediate form) into the
 * normalized Cve entity, upserting by cve_id. When the same CVE arrives from
 * multiple sources, fields are merged rather than overwritten wholesale:
 * - description/cvss/dates: first non-null value wins per field, but a later
 *   NVD/MITRE record with a newer lastModifiedDate takes precedence over
 *   older data (NVD/MITRE are treated as more authoritative than vendor feeds).
 * - contributing_sources accumulates every source that has ever reported the CVE.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CveNormalizerService {

    private static final Set<String> AUTHORITATIVE_SOURCES = Set.of("NVD", "MITRE");

    private final CveRepository cveRepository;
    private final JsonMapper objectMapper;

    public static class UpsertResult {
        public int inserted = 0;
        public int updated = 0;
    }

    @Transactional
    public UpsertResult upsert(RawCveRecord raw) {
        UpsertResult result = new UpsertResult();
        if (raw.getCveId() == null || raw.getCveId().isBlank()) {
            log.warn("Skipping record with no CVE ID from source {}", raw.getSourceName());
            return result;
        }

        Cve entity = cveRepository.findByCveId(raw.getCveId()).orElse(null);
        boolean isNew = entity == null;
        if (isNew) {
            entity = new Cve();
            entity.setCveId(raw.getCveId());
            entity.setPrimarySource(raw.getSourceName());
        }

        boolean incomingIsAuthoritative = isAuthoritative(raw.getSourceName());
        boolean existingWasAuthoritative = !isNew && isAuthoritative(entity.getPrimarySource());

        // Only let a non-authoritative (vendor) record overwrite core fields if
        // there's nothing there yet, or the existing data also came from a vendor feed.
        boolean allowCoreFieldOverwrite = isNew || incomingIsAuthoritative || !existingWasAuthoritative;

        if (allowCoreFieldOverwrite) {
            setIfPresent(raw.getDescription(), entity::setDescription);
            setIfPresent(raw.getCvssV3Score(), entity::setCvssV3Score);
            setIfPresent(raw.getCvssV3Severity(), entity::setCvssV3Severity);
            setIfPresent(raw.getCvssV2Score(), entity::setCvssV2Score);
            setIfPresent(raw.getCvssV2Severity(), entity::setCvssV2Severity);
            setIfPresent(raw.getVulnStatus(), entity::setVulnStatus);
            setIfPresent(raw.getCweIds(), entity::setCweIds);
            if (incomingIsAuthoritative) {
                entity.setPrimarySource(raw.getSourceName());
            }
        }

        setIfPresent(raw.getPublishedDate(), entity::setPublishedDate);
        if (raw.getLastModifiedDate() != null &&
                (entity.getLastModifiedDate() == null || raw.getLastModifiedDate().isAfter(entity.getLastModifiedDate()))) {
            entity.setLastModifiedDate(raw.getLastModifiedDate());
        }
        setIfPresent(raw.getVendor(), entity::setVendor);
        setIfPresent(raw.getProduct(), entity::setProduct);

        if (raw.getReferenceUrls() != null && !raw.getReferenceUrls().isEmpty()) {
            mergeReferenceUrls(entity, raw.getReferenceUrls());
        }

        entity.setContributingSources(mergeSources(entity.getContributingSources(), raw.getSourceName()));

        if (raw.getRawJson() != null) {
            entity.setRawData(raw.getRawJson());
        }

        cveRepository.save(entity);

        if (isNew) {
            result.inserted = 1;
        } else {
            result.updated = 1;
        }
        return result;
    }

    private boolean isAuthoritative(String source) {
        if (source == null) return false;
        return AUTHORITATIVE_SOURCES.contains(source);
    }

    private <T> void setIfPresent(T value, java.util.function.Consumer<T> setter) {
        if (value != null && !(value instanceof String s && s.isBlank())) {
            setter.accept(value);
        }
    }

    private void mergeReferenceUrls(Cve entity, java.util.List<String> newUrls) {
        try {
            Set<String> existing = new LinkedHashSet<>();
            if (entity.getReferenceUrls() != null && !entity.getReferenceUrls().isBlank()) {
                existing.addAll(Arrays.asList(objectMapper.readValue(entity.getReferenceUrls(), String[].class)));
            }
            existing.addAll(newUrls);
            entity.setReferenceUrls(objectMapper.writeValueAsString(existing));
        } catch (Exception e) {
            log.warn("Failed merging reference URLs for {}: {}", entity.getCveId(), e.getMessage());
        }
    }

    private String mergeSources(String existingCsv, String newSource) {
        Set<String> sources = new LinkedHashSet<>();
        if (existingCsv != null && !existingCsv.isBlank()) {
            sources.addAll(Arrays.asList(existingCsv.split(",")));
        }
        sources.add(newSource);
        return String.join(",", sources);
    }
}
