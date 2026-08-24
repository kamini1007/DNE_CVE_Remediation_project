package com.security.riskengine.repository;

import com.security.riskengine.entity.AssetProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AssetProfileRepository extends JpaRepository<AssetProfile, Long> {

    /**
     * Most specific matching profile for a (vendor, product) pair: exact
     * vendor+product ranks highest, then vendor-only, then the global
     * default (vendor AND product both NULL).
     */
    @Query(value = """
        SELECT * FROM asset_profile
        WHERE (vendor IS NULL OR lower(vendor) = lower(:vendor))
          AND (product IS NULL OR lower(product) = lower(:product))
        ORDER BY (vendor IS NOT NULL)::int + (product IS NOT NULL)::int DESC
        LIMIT 1
        """, nativeQuery = true)
    Optional<AssetProfile> findBestMatch(@Param("vendor") String vendor, @Param("product") String product);

    List<AssetProfile> findAllByOrderByVendorAscProductAsc();
}
