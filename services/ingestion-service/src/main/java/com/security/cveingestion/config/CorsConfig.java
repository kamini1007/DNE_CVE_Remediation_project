package com.security.cveingestion.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Allows the dashboard (a separate origin in local dev - localhost:5173 vs
 * this service's localhost:8080) to call this API from the browser. Without
 * this, every fetch from the dashboard fails with "Failed to fetch" / a CORS
 * policy error in the browser console, even though the service itself is up
 * and reachable via curl/Postman - browsers enforce CORS, not servers or
 * command-line tools, which is why this only shows up in the dashboard.
 *
 * In the real AWS deployment (Phase 7) this becomes moot - everything is
 * served from one hostname behind the ALB, so requests are same-origin and
 * CORS never applies. This is specifically for local/dev, where each service
 * runs on its own port.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${cors.allowed-origin:http://localhost:5173}")
    private String allowedOrigin;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigin)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*");
    }
}
