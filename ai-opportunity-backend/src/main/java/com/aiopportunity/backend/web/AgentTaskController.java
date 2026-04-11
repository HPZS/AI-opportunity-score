package com.aiopportunity.backend.web;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aiopportunity.backend.service.AgentTaskQueryService;
import com.aiopportunity.backend.service.TaskResultImportService;
import com.aiopportunity.backend.web.dto.AgentTaskDetailResponse;
import com.aiopportunity.backend.web.dto.AgentTaskSummaryResponse;
import com.aiopportunity.backend.web.dto.ImportTaskResultRequest;
import com.aiopportunity.backend.web.dto.ImportTaskResultResponse;
import com.aiopportunity.backend.web.dto.PagedResponse;

import jakarta.validation.Valid;

@Validated
@RestController
@RequestMapping("/api/agent/tasks")
public class AgentTaskController {

    private final TaskResultImportService taskResultImportService;
    private final AgentTaskQueryService agentTaskQueryService;

    public AgentTaskController(
            TaskResultImportService taskResultImportService,
            AgentTaskQueryService agentTaskQueryService
    ) {
        this.taskResultImportService = taskResultImportService;
        this.agentTaskQueryService = agentTaskQueryService;
    }

    @PostMapping("/import")
    public ImportTaskResultResponse importTaskResult(@Valid @RequestBody ImportTaskResultRequest request) {
        return taskResultImportService.importTaskResult(request);
    }

    @GetMapping
    public PagedResponse<AgentTaskSummaryResponse> listTasks(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return agentTaskQueryService.listTasks(page, size);
    }

    @GetMapping("/{id}")
    public AgentTaskDetailResponse getTask(@PathVariable Long id) {
        return agentTaskQueryService.getTaskDetail(id);
    }
}
