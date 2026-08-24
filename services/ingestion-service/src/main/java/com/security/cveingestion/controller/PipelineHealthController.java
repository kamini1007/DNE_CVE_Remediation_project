package com.security.cveingestion.controller;

import com.security.cveingestion.service.PipelineHealthService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/pipeline")
@RequiredArgsConstructor
public class PipelineHealthController {

    private final PipelineHealthService pipelineHealthService;

    @GetMapping("/health")
    public Map<String, Object> health() {
        return pipelineHealthService.getHealth();
    }
}
