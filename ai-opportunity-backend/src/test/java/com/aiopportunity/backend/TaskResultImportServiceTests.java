package com.aiopportunity.backend;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import com.aiopportunity.backend.repository.AgentTaskRepository;
import com.aiopportunity.backend.repository.LeadDeepAnalysisRepository;
import com.aiopportunity.backend.repository.LeadRepository;
import com.aiopportunity.backend.repository.LeadScoreRepository;
import com.aiopportunity.backend.service.TaskResultImportService;
import com.aiopportunity.backend.web.dto.ImportTaskResultRequest;

@SpringBootTest
@Transactional
class TaskResultImportServiceTests {

    @Autowired
    private TaskResultImportService taskResultImportService;

    @Autowired
    private AgentTaskRepository agentTaskRepository;

    @Autowired
    private LeadRepository leadRepository;

    @Autowired
    private LeadScoreRepository leadScoreRepository;

    @Autowired
    private LeadDeepAnalysisRepository leadDeepAnalysisRepository;

    @Test
    void shouldImportScreeningTaskResult() {
        var response = taskResultImportService.importTaskResult(
                new ImportTaskResultRequest("2026-04-11T04-28-54-981Z_screening", null)
        );

        assertThat(response.taskType()).isEqualTo("screening");
        assertThat(response.importedLeadCount()).isGreaterThan(0);
        assertThat(agentTaskRepository.findByTaskKey("2026-04-11T04-28-54-981Z_screening")).isPresent();
        assertThat(leadRepository.count()).isGreaterThan(0);
        assertThat(leadScoreRepository.count()).isGreaterThan(0);
    }

    @Test
    void shouldImportInvestigationTaskResultAfterScreening() {
        taskResultImportService.importTaskResult(
                new ImportTaskResultRequest("2026-04-11T04-28-54-981Z_screening", null)
        );

        var response = taskResultImportService.importTaskResult(
                new ImportTaskResultRequest("2026-04-11T04-54-20-377Z_investigation", null)
        );

        assertThat(response.taskType()).isEqualTo("investigation");
        assertThat(response.updatedDeepAnalysisCount()).isGreaterThan(0);
        assertThat(leadDeepAnalysisRepository.count()).isGreaterThan(0);
        assertThat(leadRepository.count()).isEqualTo(5);
        assertThat(leadScoreRepository.findAll())
                .anyMatch(item -> item.getCompositeScore() != null && item.getCompositeScore() >= 80);
    }

    @Test
    void shouldMergeLeadWhenScreeningImportedAfterInvestigation() {
        taskResultImportService.importTaskResult(
                new ImportTaskResultRequest("2026-04-11T04-54-20-377Z_investigation", null)
        );

        taskResultImportService.importTaskResult(
                new ImportTaskResultRequest("2026-04-11T04-28-54-981Z_screening", null)
        );

        assertThat(leadRepository.count()).isEqualTo(5);
    }
}
