package com.security.cveingestion.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "cve")
@Getter
@Setter
public class Cve {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "cve_id", nullable = false, unique = true, length = 30)
    private String cveId;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "cvss_v3_score")
    private BigDecimal cvssV3Score;

    @Column(name = "cvss_v3_severity", length = 20)
    private String cvssV3Severity;

    @Column(name = "cvss_v2_score")
    private BigDecimal cvssV2Score;

    @Column(name = "cvss_v2_severity", length = 20)
    private String cvssV2Severity;

    @Column(name = "published_date")
    private OffsetDateTime publishedDate;

    @Column(name = "last_modified_date")
    private OffsetDateTime lastModifiedDate;

    @Column(name = "vuln_status", length = 50)
    private String vulnStatus;

    @Column(name = "primary_source", nullable = false, length = 50)
    private String primarySource;

    @Column(name = "contributing_sources", length = 255)
    private String contributingSources;

    @Column(name = "vendor", length = 255)
    private String vendor;

    @Column(name = "product", length = 255)
    private String product;

    @Column(name = "cwe_ids", length = 255)
    private String cweIds;

    @Column(name = "reference_urls", columnDefinition = "TEXT")
    private String referenceUrls; // JSON array serialized as text

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_data", columnDefinition = "jsonb")
    private String rawData;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
