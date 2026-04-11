package com.aiopportunity.backend.web.dto;

import java.time.Instant;
import java.util.List;

public record AgentRuntimeLogsResponse(
        String logFileName,
        String logFilePath,
        boolean running,
        Instant updatedAt,
        List<String> lines
) {
}
