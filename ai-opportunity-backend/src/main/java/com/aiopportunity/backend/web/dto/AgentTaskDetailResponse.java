package com.aiopportunity.backend.web.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record AgentTaskDetailResponse(
        Long id,
        String taskKey,
        String taskType,
        String originalTaskType,
        String modelName,
        Instant savedAt,
        String promptText,
        String inputFile,
        String taskMessage,
        Integer attemptCount,
        Boolean stoppedByUser,
        Boolean completed,
        String taskState,
        Boolean resumable,
        String resumeKey,
        String failureReason,
        Integer tokenInput,
        Integer tokenOutput,
        Boolean parsed,
        Map<String, Object> resultPayload,
        List<AgentTaskResultItemResponse> items,
        Instant createdAt,
        Instant updatedAt
) {
}
