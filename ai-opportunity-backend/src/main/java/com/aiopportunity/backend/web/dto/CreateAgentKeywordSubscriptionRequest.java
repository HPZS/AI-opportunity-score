package com.aiopportunity.backend.web.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;

public record CreateAgentKeywordSubscriptionRequest(
        String id,
        @NotBlank(message = "label 不能为空")
        String label,
        String description,
        List<String> keywords,
        List<String> preferredSourceProfileIds
) {
}
