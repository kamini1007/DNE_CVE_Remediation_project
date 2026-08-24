package com.security.cveingestion.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Pushes a local project folder to a GitHub repo, using GITHUB_TOKEN for
 * authentication - the same token already configured for the PR-creation
 * feature.
 *
 * SECURITY:
 * - The token is passed via `git -c http.extraheader=...`, applying ONLY
 *   to that one command - never written to .git/config or any other file.
 * - Every git command uses ProcessBuilder with an argument array, never a
 *   concatenated shell string.
 * - force is OFF by default and must be explicitly requested. A normal
 *   push fails safely (with a clear explanation) if the remote has
 *   commits the local repo doesn't - force overwrites the remote to match
 *   local exactly, discarding whatever was there. Appropriate for a fresh
 *   personal repo with nothing valuable on it yet (e.g. one GitHub
 *   auto-initialized with just a README); NOT something to default to,
 *   since it can silently discard real work on a repo that has any.
 */
@Service
@Slf4j
public class GitPushService {

    private static final long GIT_TIMEOUT_SECONDS = 60;

    private final String githubToken;

    public GitPushService(@Value("${GITHUB_TOKEN:}") String githubToken) {
        this.githubToken = githubToken;
    }

    public void pushToGitHub(String localPath, String owner, String repo, String branch, boolean force) {
        if (githubToken == null || githubToken.isBlank()) {
            throw new IllegalStateException(
                    "GITHUB_TOKEN is not configured - set it as an environment variable before using this feature");
        }

        Path projectPath = Path.of(localPath);
        if (!Files.isDirectory(projectPath)) {
            throw new IllegalArgumentException("Not an existing local directory: " + localPath);
        }

        if (!Files.isDirectory(projectPath.resolve(".git"))) {
            runGit(List.of("git", "init"), localPath, "initializing git repo");
            runGit(List.of("git", "branch", "-M", branch), localPath, "setting branch name");
        }

        runGit(List.of("git", "add", "."), localPath, "staging changes");

        String status = runGit(List.of("git", "status", "--porcelain"), localPath, "checking for changes");
        if (!status.isBlank()) {
            runGit(List.of("git", "commit", "-m", "Update project"), localPath, "committing changes");
        } else {
            log.info("[git-push] nothing to commit in {}", localPath);
        }

        String remoteUrl = "https://github.com/" + owner + "/" + repo + ".git";
        String authHeader = "AUTHORIZATION: Basic " + Base64.getEncoder().encodeToString(
                ("x-access-token:" + githubToken).getBytes(StandardCharsets.UTF_8));

        List<String> pushCommand = new ArrayList<>(List.of(
                "git", "-c", "http.extraheader=" + authHeader, "push"));
        if (force) {
            pushCommand.add("--force");
        }
        pushCommand.add(remoteUrl);
        pushCommand.add("HEAD:" + branch);

        runGit(pushCommand, localPath, "pushing to " + owner + "/" + repo);

        log.info("[git-push] pushed {} to {}/{} (branch '{}'{})", localPath, owner, repo, branch,
                force ? ", force" : "");
    }

    private String runGit(List<String> command, String workingDir, String description) {
        Process process;
        try {
            process = new ProcessBuilder(command)
                    .directory(new File(workingDir))
                    .start();
        } catch (IOException e) {
            throw new IllegalArgumentException(
                    "Could not start git while " + description + " - is git installed and on PATH? " + e.getMessage(), e);
        }

        String stdout;
        String stderr;
        boolean finished;
        try {
            stdout = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            stderr = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
            finished = process.waitFor(GIT_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (IOException e) {
            throw new IllegalArgumentException("Failed reading git output while " + description + ": " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalArgumentException("Git command was interrupted while " + description, e);
        }

        if (!finished) {
            process.destroyForcibly();
            throw new IllegalArgumentException("git timed out after " + GIT_TIMEOUT_SECONDS + "s while " + description);
        }
        if (process.exitValue() != 0) {
            if (stderr.contains("rejected") && stderr.contains("fetch first")) {
                throw new IllegalArgumentException(
                        "Push rejected while " + description + " - the remote repo already has commits "
                                + "this local copy doesn't (often just an auto-generated README from when "
                                + "the repo was created on GitHub). If you're sure it's safe to overwrite "
                                + "the remote (e.g. a fresh repo with nothing valuable on it), retry with "
                                + "\"Force push\" checked. Raw error: " + stderr.trim());
            }
            throw new IllegalArgumentException("git failed while " + description + ": " + stderr.trim());
        }

        return stdout;
    }
}
