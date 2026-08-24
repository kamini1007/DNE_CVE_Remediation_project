package com.security.riskengine.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/** Maps to `cve_analysis`, populated by ai-analysis-service. Read-only here. */
@Entity
@Table(name = "cve_analysis")
@Getter
@Setter
public class CveAnalysis {

    @Id
    @Column(name = "cve_id")
    private String cveId;

    @Column(name = "exploitability_level")
    private String exploitabilityLevel; // LOW / MEDIUM / HIGH / CRITICAL / UNKNOWN

    @Column(name = "status")
    private String status; // SUCCESS / FAILED / PENDING

    @Column(name = "analyzed_at")
    private OffsetDateTime analyzedAt;
}
