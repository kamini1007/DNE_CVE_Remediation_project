package com.security.cveingestion.repository;

import com.security.cveingestion.entity.IngestionLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface IngestionLogRepository extends JpaRepository<IngestionLog, Long> {
    List<IngestionLog> findTop20BySourceOrderByStartedAtDesc(String source);
}
