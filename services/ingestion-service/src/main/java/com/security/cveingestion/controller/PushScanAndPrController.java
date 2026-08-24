package com.security.cveingestion.controller;

import com.security.cveingestion.dto.github.PushScanAndPrRequest;
import com.security.cveingestion.dto.github.PushScanAndPrResult;
import com.security.cveingestion.service.PushScanAndPrService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/ingestion/scanner-findings")
@RequiredArgsConstructor
public class PushScanAndPrController {

    private final PushScanAndPrService pushScanAndPrService;

    @PostMapping(path = "/push-scan-and-pr", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> pushScanAndPr(@RequestBody PushScanAndPrRequest request) {
        try {
            boolean forcePush = Boolean.TRUE.equals(request.forcePush());
            PushScanAndPrResult result = pushScanAndPrService.run(
                    request.localPath(), request.projectName(), request.owner(), request.repo(),
                    request.baseBranch(), request.newBranchName(), forcePush);
            return ResponseEntity.ok(result);
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
