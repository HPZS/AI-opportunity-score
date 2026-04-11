package com.aiopportunity.backend.web.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;

public record CreateAgentSignalSourceRequest(
        String id,
        @NotBlank(message = "label 不能为空")
        String label,
        String description,
        List<String> searchScopes,
        List<String> documentTypes,
        List<String> includeDomains,
        List<String> excludeDomains,
        List<String> queryHints
) {
}
