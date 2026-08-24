package com.security.riskengine.dto;

import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class AssetProfileRequest {

    private String vendor;   // null/omitted = matches any vendor
    private String product;  // null/omitted = matches any product

    @Pattern(regexp = "LOW|MEDIUM|HIGH|CRITICAL", message = "must be one of LOW, MEDIUM, HIGH, CRITICAL")
    private String criticality = "MEDIUM";

    @Pattern(regexp = "INTERNAL|DMZ|PUBLIC_INTERNET", message = "must be one of INTERNAL, DMZ, PUBLIC_INTERNET")
    private String networkExposure = "INTERNAL";

    @Pattern(regexp = "LOW|MEDIUM|HIGH|CRITICAL", message = "must be one of LOW, MEDIUM, HIGH, CRITICAL")
    private String businessImpact = "MEDIUM";

    private String notes;
}
