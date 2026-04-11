package com.aiopportunity.backend.web.dto;

import java.util.List;

public record AgentRuntimeConfigUpdateRequest(
        String openAiApiKey,
        String openAiBaseUrl,
        String anthropicApiKey,
        String anthropicBaseUrl,
        String tavilyApiKey,
        String defaultModel,
        Boolean runInvestigationAfterScreening,
        Integer targetPoolEntryCount,
        String screeningOpportunityMode,
        List<String> screeningSubscriptionIds,
        List<String> screeningSourceProfileIds,
        List<String> screeningExtraKeywords
) {
}
