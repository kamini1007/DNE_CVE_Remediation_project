package com.security.cveingestion.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Entity
@Table(name = "scanner_finding")
@Getter
@Setter
public class ScannerFinding {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "cve_id", nullable = false)
    private String cveId;

    @Column(name = "project_name", nullable = false)
    private String projectName;

    @Column(name = "package_name", nullable = false)
    private String packageName;

    @Column(name = "installed_version")
    private String installedVersion;

    @Column(name = "fixed_version")
    private String fixedVersion;

    // Trivy's own severity rating for this vulnerability - CRITICAL/HIGH/
    // MEDIUM/LOW/UNKNOWN, matching the same strings used elsewhere in the
    // dashboard's severity badges.
    @Column(name = "severity")
    private String severity;

    @Column(name = "scanner_source", nullable = false)
    private String scannerSource;

    @Column(name = "target")
    private String target;

    @Column(name = "scanned_at", nullable = false)
    private OffsetDateTime scannedAt;
}
