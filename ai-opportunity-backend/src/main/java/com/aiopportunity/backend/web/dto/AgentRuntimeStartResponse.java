package com.aiopportunity.backend.web.dto;

import java.time.Instant;

public record AgentRuntimeStartResponse(
        boolean running,
        Long pid,
        String taskType,
        String promptPreview,
        String logFileName,
        String logFilePath,
        Instant startedAt
) {
}
