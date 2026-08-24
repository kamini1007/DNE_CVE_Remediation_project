package com.security.riskengine.controller;

import com.security.riskengine.dto.AssetProfileRequest;
import com.security.riskengine.entity.AssetProfile;
import com.security.riskengine.repository.AssetProfileRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/asset-profiles")
@RequiredArgsConstructor
public class AssetProfileController {

    private final AssetProfileRepository assetProfileRepository;

    @GetMapping
    public List<AssetProfile> list() {
        return assetProfileRepository.findAllByOrderByVendorAscProductAsc();
    }

    @GetMapping("/{id}")
    public ResponseEntity<AssetProfile> get(@PathVariable Long id) {
        return assetProfileRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<AssetProfile> create(@Valid @RequestBody AssetProfileRequest request) {
        AssetProfile profile = toEntity(new AssetProfile(), request);
        AssetProfile saved = assetProfileRepository.save(profile);
        return ResponseEntity.status(201).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<AssetProfile> update(@PathVariable Long id, @Valid @RequestBody AssetProfileRequest request) {
        return assetProfileRepository.findById(id)
                .map(existing -> ResponseEntity.ok(assetProfileRepository.save(toEntity(existing, request))))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        if (!assetProfileRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        assetProfileRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private AssetProfile toEntity(AssetProfile profile, AssetProfileRequest request) {
        profile.setVendor(request.getVendor());
        profile.setProduct(request.getProduct());
        profile.setCriticality(request.getCriticality());
        profile.setNetworkExposure(request.getNetworkExposure());
        profile.setBusinessImpact(request.getBusinessImpact());
        profile.setNotes(request.getNotes());
        return profile;
    }
}
