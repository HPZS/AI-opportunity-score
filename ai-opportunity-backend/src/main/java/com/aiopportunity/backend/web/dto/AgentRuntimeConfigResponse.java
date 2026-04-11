package com.aiopportunity.backend.web.dto;

import java.util.List;

public record AgentRuntimeConfigResponse(
        String agentDir,
        String envFilePath,
        String logsDir,
        String nodeCommand,
        Boolean runInvestigationAfterScreening,
        Integer screeningTargetPoolEntryCount,
        String screeningOpportunityMode,
        List<String> screeningSubscriptionIds,
        List<String> screeningSourceProfileIds,
        List<String> screeningExtraKeywords,
        List<AgentSignalSourceOptionResponse> signalSourceOptions,
        List<AgentKeywordSubscriptionOptionResponse> keywordSubscriptionOptions,
        List<AgentConfigItemResponse> envItems
) {
}
