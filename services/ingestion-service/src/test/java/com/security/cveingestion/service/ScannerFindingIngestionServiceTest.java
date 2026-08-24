package com.security.cveingestion.service;

import com.security.cveingestion.dto.RawCveRecord;
import com.security.cveingestion.entity.ScannerFinding;
import com.security.cveingestion.repository.ScannerFindingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.json.JsonMapper;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ScannerFindingIngestionServiceTest {

    private CveNormalizerService normalizerService;
    private ScannerFindingRepository scannerFindingRepository;
    private ScannerFindingIngestionService service;

    @BeforeEach
    void setUp() {
        normalizerService = mock(CveNormalizerService.class);
        scannerFindingRepository = mock(ScannerFindingRepository.class);
        when(scannerFindingRepository.findByCveIdAndProjectNameAndPackageName(any(), any(), any()))
                .thenReturn(Optional.empty());

        // A real JsonMapper, not mocked - the whole point of these tests is
        // catching Trivy's PascalCase JSON not actually mapping correctly.
        service = new ScannerFindingIngestionService(JsonMapper.builder().build(), normalizerService, scannerFindingRepository);
    }

    private static final String VALID_TRIVY_JSON = """
        {
          "Results": [
            {
              "Target": "package-lock.json",
              "Type": "npm",
              "Vulnerabilities": [
                {
                  "VulnerabilityID": "CVE-2021-23337",
                  "PkgName": "lodash",
                  "InstalledVersion": "4.17.15",
                  "FixedVersion": "4.17.21",
                  "Title": "lodash: command injection",
                  "Severity": "HIGH",
                  "PrimaryURL": "https://avd.aquasec.com/nvd/cve-2021-23337",
                  "References": ["https://example.com/advisory"]
                },
                {
                  "VulnerabilityID": "GHSA-29mw-wpgm-hmr9",
                  "PkgName": "some-other-package",
                  "InstalledVersion": "1.0.0"
                }
              ]
            }
          ]
        }
        """;

    @Test
    void parsesValidTrivyJsonAndUpsertsOnlyRealCves() {
        ScannerFindingIngestionService.ScanIngestResult result = service.ingestTrivyReport("my-other-project", VALID_TRIVY_JSON);

        assertThat(result.cvesUpserted()).isEqualTo(1);
        assertThat(result.findingsRecorded()).isEqualTo(1);
        assertThat(result.skippedNonCve()).isEqualTo(1); // the GHSA-only entry

        ArgumentCaptor<RawCveRecord> captor = ArgumentCaptor.forClass(RawCveRecord.class);
        verify(normalizerService, times(1)).upsert(captor.capture());

        RawCveRecord captured = captor.getValue();
        assertThat(captured.getCveId()).isEqualTo("CVE-2021-23337");
        assertThat(captured.getSourceName()).isEqualTo("SCANNER:trivy");
        assertThat(captured.getVendor()).isEqualTo("npm");
        assertThat(captured.getProduct()).isEqualTo("lodash");
        assertThat(captured.getDescription()).isEqualTo("lodash: command injection");
        assertThat(captured.getReferenceUrls()).contains("https://avd.aquasec.com/nvd/cve-2021-23337", "https://example.com/advisory");
    }

    @Test
    void recordsAScannerFindingWithProjectAndVersionInfo() {
        service.ingestTrivyReport("my-other-project", VALID_TRIVY_JSON);

        ArgumentCaptor<ScannerFinding> captor = ArgumentCaptor.forClass(ScannerFinding.class);
        verify(scannerFindingRepository, times(1)).save(captor.capture());

        ScannerFinding saved = captor.getValue();
        assertThat(saved.getCveId()).isEqualTo("CVE-2021-23337");
        assertThat(saved.getProjectName()).isEqualTo("my-other-project");
        assertThat(saved.getPackageName()).isEqualTo("lodash");
        assertThat(saved.getInstalledVersion()).isEqualTo("4.17.15");
        assertThat(saved.getFixedVersion()).isEqualTo("4.17.21");
        assertThat(saved.getScannerSource()).isEqualTo("trivy");
        assertThat(saved.getTarget()).isEqualTo("package-lock.json");
    }

    @Test
    void throwsAClearErrorOnMalformedJsonRatherThanACrypticStackTrace() {
        assertThatThrownBy(() -> service.ingestTrivyReport("my-project", "not valid json at all"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Could not parse Trivy JSON");

        verifyNoInteractions(normalizerService);
    }

    @Test
    void handlesAReportWithNoResultsWithoutError() {
        ScannerFindingIngestionService.ScanIngestResult result = service.ingestTrivyReport("my-project", "{\"Results\": []}");

        assertThat(result.cvesUpserted()).isZero();
        assertThat(result.findingsRecorded()).isZero();
        verifyNoInteractions(normalizerService);
    }

    @Test
    void reUpsertsExistingFindingInPlaceRatherThanDuplicating() {
        ScannerFinding existing = new ScannerFinding();
        existing.setId(42L);
        when(scannerFindingRepository.findByCveIdAndProjectNameAndPackageName("CVE-2021-23337", "my-other-project", "lodash"))
                .thenReturn(Optional.of(existing));

        service.ingestTrivyReport("my-other-project", VALID_TRIVY_JSON);

        ArgumentCaptor<ScannerFinding> captor = ArgumentCaptor.forClass(ScannerFinding.class);
        verify(scannerFindingRepository).save(captor.capture());
        assertThat(captor.getValue().getId()).isEqualTo(42L); // updated the existing row, not a new one
    }
}
