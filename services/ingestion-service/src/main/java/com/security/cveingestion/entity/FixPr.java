package com.security.cveingestion.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Entity
@Table(name = "fix_pr")
@Getter
@Setter
public class FixPr {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "scanner_finding_id")
    private Long scannerFindingId;

    @Column(name = "cve_id", nullable = false)
    private String cveId;

    @Column(name = "package_name", nullable = false)
    private String packageName;

    @Column(name = "old_version")
    private String oldVersion;

    @Column(name = "new_version")
    private String newVersion;

    @Column(nullable = false)
    private String owner;

    @Column(nullable = false)
    private String repo;

    @Column(name = "branch_name", nullable = false)
    private String branchName;

    @Column(name = "pr_url", nullable = false)
    private String prUrl;

    @Column(name = "pr_number", nullable = false)
    private Integer prNumber;

    @Column(columnDefinition = "TEXT")
    private String explanation;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    // Null if this PR has no linked Jira ticket - either it predates this
    // column, or Jira wasn't configured when it was created.
    @Column(name = "jira_ticket_key")
    private String jiraTicketKey;

    @Column(name = "jira_ticket_url")
    private String jiraTicketUrl;
}
