package com.aiopportunity.backend.web.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateLeadStatusRequest(
        @NotBlank(message = "status 不能为空")
        String status
) {
}
