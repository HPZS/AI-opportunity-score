package com.aiopportunity.backend.web.dto;

import java.time.Instant;

public record AgentRuntimeStatusResponse(
        boolean running,
        Long pid,
        String taskType,
        String promptPreview,
        String logFileName,
        String logFilePath,
        Instant startedAt,
        Instant finishedAt,
        Integer exitCode,
        Boolean autoInvestigationScheduled,
        String lastImportedTaskKey,
        Instant lastImportedAt,
        Boolean lastImportSucceeded,
        String lastImportMessage
) {
}
