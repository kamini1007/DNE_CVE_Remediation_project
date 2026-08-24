package com.security.cveingestion.controller;

import com.security.cveingestion.entity.FixPr;
import com.security.cveingestion.repository.FixPrRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/ingestion/fix-prs")
@RequiredArgsConstructor
public class FixPrController {

    private final FixPrRepository fixPrRepository;

    @GetMapping
    public List<FixPr> allFixPrs() {
        return fixPrRepository.findAllByOrderByCreatedAtDesc();
    }
}
