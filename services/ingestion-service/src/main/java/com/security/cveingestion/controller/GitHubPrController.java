package com.security.cveingestion.controller;

import com.security.cveingestion.dto.github.BatchCreateFixPrRequest;
import com.security.cveingestion.dto.github.BatchCreateFixPrResult;
import com.security.cveingestion.dto.github.CreateFixPrRequest;
import com.security.cveingestion.dto.github.CreateFixPrResult;
import com.security.cveingestion.service.GitHubPrService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ingestion/scanner-findings")
@RequiredArgsConstructor
public class GitHubPrController {

    private final GitHubPrService gitHubPrService;

    @PostMapping(path = "/{id}/create-pr", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> createPr(@PathVariable Long id, @RequestBody CreateFixPrRequest request) {
        try {
            CreateFixPrResult result = gitHubPrService.createFixPr(
                    id, request.owner(), request.repo(), request.baseBranch(), request.manifestPath(), request.newBranchName());
            return ResponseEntity.ok(result);
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping(path = "/batch-create-pr", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> batchCreatePr(@RequestBody BatchCreateFixPrRequest request) {
        try {
            BatchCreateFixPrResult result = gitHubPrService.createBatchFixPr(
                    request.findingIds(), request.owner(), request.repo(), request.baseBranch(), request.newBranchName());
            return ResponseEntity.ok(result);
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
