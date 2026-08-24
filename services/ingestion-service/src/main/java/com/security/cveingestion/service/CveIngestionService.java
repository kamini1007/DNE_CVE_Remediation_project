package com.security.cveingestion.service;

import com.security.cveingestion.connector.CveSourceConnector;
import com.security.cveingestion.dto.RawCveRecord;
import com.security.cveingestion.entity.IngestionLog;
import com.security.cveingestion.entity.IngestionState;
import com.security.cveingestion.repository.IngestionLogRepository;
import com.security.cveingestion.repository.IngestionStateRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Drives a single ingestion run for a given connector: reads the watermark
 * from ingestion_state, fetches + normalizes + upserts records, then records
 * the outcome in ingestion_log and advances the watermark on success.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CveIngestionService {

    private final IngestionStateRepository stateRepository;
    private final IngestionLogRepository logRepository;
    private final CveNormalizerService normalizerService;

    public void runIngestion(CveSourceConnector connector) {
        String source = connector.sourceKey();
        OffsetDateTime runStart = OffsetDateTime.now();

        IngestionLog runLog = new IngestionLog();
        runLog.setSource(source);
        runLog.setStartedAt(runStart);
        runLog.setStatus("RUNNING");
        runLog = logRepository.save(runLog);

        IngestionState state = stateRepository.findById(source).orElseGet(() -> {
            IngestionState s = new IngestionState();
            s.setSource(source);
            return s;
        });

        try {
            List<RawCveRecord> records = connector.fetchSince(state.getLastSyncTime());

            int inserted = 0, updated = 0;
            for (RawCveRecord record : records) {
                CveNormalizerService.UpsertResult r = normalizerService.upsert(record);
                inserted += r.inserted;
                updated += r.updated;
            }

            runLog.setRecordsFetched(records.size());
            runLog.setRecordsInserted(inserted);
            runLog.setRecordsUpdated(updated);
            runLog.setStatus("SUCCESS");
            runLog.setFinishedAt(OffsetDateTime.now());

            state.setLastSyncTime(runStart);
            state.setLastRunStatus("SUCCESS");
            state.setLastRunAt(runLog.getFinishedAt());

            log.info("[{}] ingestion run complete: fetched={} inserted={} updated={}",
                    source, records.size(), inserted, updated);

        } catch (Exception e) {
            log.error("[{}] ingestion run failed: {}", source, e.getMessage(), e);
            runLog.setStatus("FAILED");
            runLog.setFinishedAt(OffsetDateTime.now());
            runLog.setErrorMessage(truncate(e.getMessage(), 2000));

            state.setLastRunStatus("FAILED");
            state.setLastRunAt(runLog.getFinishedAt());
            // Deliberately do NOT advance lastSyncTime on failure, so the next run retries the same window.
        } finally {
            logRepository.save(runLog);
            stateRepository.save(state);
        }
    }

    private String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() > max ? s.substring(0, max) : s;
    }
}
