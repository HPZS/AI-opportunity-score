package com.aiopportunity.backend.web.dto;

public record AgentConfigItemResponse(
        String key,
        String value,
        boolean secret,
        boolean configured
) {
}
