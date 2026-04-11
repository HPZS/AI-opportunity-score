package com.aiopportunity.backend.web.dto;

import java.time.Instant;
import java.util.List;

public record LeadListItemResponse(
        Long id,
        String title,
        String organizationName,
        String sourceName,
        String sourceDomain,
        String leadCategory,
        String currentStage,
        String poolEntryTier,
        String status,
        String expiryStatus,
        Boolean shouldEnterPool,
        Instant publishTime,
        Double compositeScore,
        List<String> scenarioTags,
        Instant updatedAt
) {
}
