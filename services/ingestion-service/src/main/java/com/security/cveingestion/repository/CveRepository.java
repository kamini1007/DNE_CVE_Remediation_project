package com.security.cveingestion.repository;

import com.security.cveingestion.entity.Cve;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CveRepository extends JpaRepository<Cve, Long> {

    Optional<Cve> findByCveId(String cveId);

    Page<Cve> findByCvssV3SeverityIgnoreCase(String severity, Pageable pageable);

    Page<Cve> findByVendorIgnoreCase(String vendor, Pageable pageable);

    boolean existsByCveId(String cveId);
}
