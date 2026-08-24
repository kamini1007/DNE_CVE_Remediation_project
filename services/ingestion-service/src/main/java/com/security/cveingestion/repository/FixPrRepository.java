package com.security.cveingestion.repository;

import com.security.cveingestion.entity.FixPr;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FixPrRepository extends JpaRepository<FixPr, Long> {
    List<FixPr> findAllByOrderByCreatedAtDesc();

    // Most recent prior PR for this exact CVE+package+repo, if any - used
    // to check for duplicates before creating a new PR.
    Optional<FixPr> findFirstByCveIdAndPackageNameAndOwnerAndRepoOrderByCreatedAtDesc(
            String cveId, String packageName, String owner, String repo);
}
