package com.security.riskengine.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Maps to the `cve` table, owned (schema + writes) by ingestion-service.
 * This service only reads it - fields not needed for risk scoring are
 * deliberately omitted rather than kept in lockstep with every column.
 */
@Entity
@Table(name = "cve")
@Getter
@Setter
public class Cve {

    @Id
    @Column(name = "cve_id")
    private String cveId;

    @Column(name = "cvss_v3_score")
    private BigDecimal cvssV3Score;

    @Column(name = "cvss_v2_score")
    private BigDecimal cvssV2Score;

    @Column(name = "vendor")
    private String vendor;

    @Column(name = "product")
    private String product;

    @Column(name = "last_modified_date")
    private OffsetDateTime lastModifiedDate;
}
