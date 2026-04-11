package com.aiopportunity.backend.web.dto;

import java.util.List;

public record ImportTaskResultResponse(
        Long agentTaskId,
        String taskKey,
        String taskType,
        int importedLeadCount,
        int updatedScoreCount,
        int updatedDeepAnalysisCount,
        List<String> warnings
) {
}
