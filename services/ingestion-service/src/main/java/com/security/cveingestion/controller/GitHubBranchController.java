package com.security.cveingestion.controller;

import com.security.cveingestion.service.GitHubPrService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ingestion/github")
@RequiredArgsConstructor
@Slf4j
public class GitHubBranchController {

    private final GitHubPrService gitHubPrService;

    /**
     * For the dashboard's base-branch dropdown - real branches, not a
     * guess at "main"/"master".
     *
     * CHANGED: previously only caught IllegalStateException/
     * IllegalArgumentException, matching GitHubPrService's other
     * GitHub-error translation. Any OTHER exception (a deserialization
     * issue, a null pointer, etc.) fell through uncaught and Spring
     * turned it into a generic 500 with no useful detail - widened to
     * catch everything and log+return the real exception type and
     * message, so a genuine bug here is diagnosable from the response
     * alone instead of needing server log access every time.
     */
    @GetMapping("/branches")
    public ResponseEntity<?> listBranches(@RequestParam String owner, @RequestParam String repo) {
        try {
            List<String> branches = gitHubPrService.listBranches(owner, repo);
            return ResponseEntity.ok(Map.of("branches", branches));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("[github-branches] unexpected {} listing branches for {}/{}: {}",
                    e.getClass().getSimpleName(), owner, repo, e.getMessage(), e);
            return ResponseEntity.internalServerError().body(Map.of(
                    "error", "Unexpected " + e.getClass().getSimpleName() + " while listing branches: " + e.getMessage()));
        }
    }
}
