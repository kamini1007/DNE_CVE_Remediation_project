package com.security.cveingestion.repository;

import com.security.cveingestion.entity.IngestionState;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IngestionStateRepository extends JpaRepository<IngestionState, String> {
}
