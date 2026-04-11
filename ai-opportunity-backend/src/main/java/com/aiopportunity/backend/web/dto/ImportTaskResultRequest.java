package com.aiopportunity.backend.web.dto;

import jakarta.validation.constraints.AssertTrue;

public record ImportTaskResultRequest(
        String taskKey,
        String filePath
) {

    @AssertTrue(message = "taskKey 和 filePath 至少提供一个")
    public boolean isValid() {
        return notBlank(taskKey) || notBlank(filePath);
    }

    private boolean notBlank(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
