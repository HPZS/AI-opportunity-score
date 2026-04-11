package com.aiopportunity.backend.web.dto;

import java.util.List;

public record AgentKeywordSubscriptionOptionResponse(
        String id,
        String label,
        String description,
        List<String> keywords,
        List<String> preferredSourceProfileIds
) {
}
