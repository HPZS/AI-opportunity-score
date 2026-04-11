package com.aiopportunity.backend.web.dto;

import java.util.List;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;

public record AgentRuntimeStartRequest(
        @NotBlank(message = "taskType 不能为空")
        String taskType,
        String prompt,
        String inputFile,
        String model,
        Boolean runInvestigationAfterScreening,
        String screeningOpportunityMode,
        List<String> subscriptionIds,
        List<String> sourceProfileIds,
        List<String> extraKeywords,
        Boolean thinking,
        Boolean bypassPermissions
) {
    @AssertTrue(message = "prompt 和 inputFile 至少需要提供一个")
    public boolean hasPromptOrInputFile() {
        return (prompt != null && !prompt.isBlank()) || (inputFile != null && !inputFile.isBlank());
    }
}
