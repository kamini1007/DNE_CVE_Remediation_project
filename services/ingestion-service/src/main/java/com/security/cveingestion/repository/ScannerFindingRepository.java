package com.security.cveingestion.repository;

import com.security.cveingestion.entity.ScannerFinding;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ScannerFindingRepository extends JpaRepository<ScannerFinding, Long> {

    Optional<ScannerFinding> findByCveIdAndProjectNameAndPackageName(String cveId, String projectName, String packageName);

    List<ScannerFinding> findByCveId(String cveId);

    List<ScannerFinding> findByProjectNameOrderByScannedAtDesc(String projectName);

    // Backs the dashboard's Scanner Findings page - lets you browse
    // everything a scan has ever found without first needing to know a
    // specific project name.
    List<ScannerFinding> findAllByOrderByScannedAtDesc();
}
