package com.security.cveingestion.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;

@Entity
@Table(name = "ingestion_state")
@Getter
@Setter
public class IngestionState {

    @Id
    @Column(name = "source", length = 50)
    private String source;

    @Column(name = "last_sync_time")
    private OffsetDateTime lastSyncTime;

    @Column(name = "last_run_status", length = 20)
    private String lastRunStatus;

    @Column(name = "last_run_at")
    private OffsetDateTime lastRunAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
