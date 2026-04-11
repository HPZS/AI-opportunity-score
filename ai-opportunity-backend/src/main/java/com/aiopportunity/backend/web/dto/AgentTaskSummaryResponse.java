package com.aiopportunity.backend.web.dto;

import java.time.Instant;

public record AgentTaskSummaryResponse(
        Long id,
        String taskKey,
        String taskType,
        String originalTaskType,
        String modelName,
        Instant savedAt,
        Boolean parsed,
        Boolean completed,
        String taskState,
        Integer attemptCount,
        Integer tokenInput,
        Integer tokenOutput,
        Instant createdAt
) {
}
