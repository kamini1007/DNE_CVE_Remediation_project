package com.security.riskengine.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;

/**
 * Org-configurable criticality/exposure/impact for a given vendor+product.
 * Table is defined in ingestion-service's Flyway migrations (single schema
 * authority), but this service owns all reads/writes to it.
 */
@Entity
@Table(name = "asset_profile")
@Getter
@Setter
public class AssetProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "vendor")
    private String vendor; // null = matches any vendor

    @Column(name = "product")
    private String product; // null = matches any product

    @Column(name = "criticality", nullable = false, length = 20)
    private String criticality = "MEDIUM"; // LOW / MEDIUM / HIGH / CRITICAL

    @Column(name = "network_exposure", nullable = false, length = 20)
    private String networkExposure = "INTERNAL"; // INTERNAL / DMZ / PUBLIC_INTERNET

    @Column(name = "business_impact", nullable = false, length = 20)
    private String businessImpact = "MEDIUM"; // LOW / MEDIUM / HIGH / CRITICAL

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
