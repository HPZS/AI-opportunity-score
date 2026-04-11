package com.aiopportunity.backend.web.dto;

public record AgentRuntimeStopResponse(
        boolean stopped,
        Long pid
) {
}
