package com.aiopportunity.backend.web.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record LeadDetailResponse(
        Long id,
        String externalLeadId,
        String title,
        String normalizedTitle,
        String url,
        String sourceName,
        String sourceDomain,
        String sourceBucket,
        String organizationName,
        String leadCategory,
        String currentStage,
        Boolean isActionableNow,
        Boolean shouldEnterPool,
        String poolEntryTier,
        String opportunitySignalClass,
        String categoryReason,
        String description,
        Instant publishTime,
        String publishTimeRaw,
        Double publishTimeConfidence,
        Boolean withinTimeWindow,
        String timeWindowStatus,
        String status,
        String expiryStatus,
        List<String> scenarioTags,
        List<String> evidenceSummary,
        List<String> recommendedTechnologies,
        List<Map<String, Object>> relatedLinks,
        ScoreResponse score,
        String latestFollowUpAction,
        String latestSuggestedAction,
        Instant createdAt,
        Instant updatedAt
) {
}
