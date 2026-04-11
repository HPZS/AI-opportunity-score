package com.aiopportunity.backend.web.dto;

import java.util.Map;

public record AgentTaskResultItemResponse(
        Long id,
        Long leadId,
        String resultType,
        String sourceBucket,
        Integer rankOrder,
        String title,
        Map<String, Object> payload
) {
}
