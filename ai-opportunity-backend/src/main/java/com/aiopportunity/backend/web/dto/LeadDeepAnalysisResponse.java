package com.aiopportunity.backend.web.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record LeadDeepAnalysisResponse(
        Long leadId,
        String sourceContinuity,
        String similarCaseSummary,
        String landingCaseSummary,
        String policySupportSummary,
        String budgetSupportSummary,
        String competitionAndDeliveryJudgement,
        String deepAnalysisConclusion,
        Double deepAnalysisScore,
        Double evidenceStrengthScore,
        String suggestedAction,
        String aiValueSummary,
        List<String> aiRisks,
        List<Map<String, Object>> timeline,
        List<Map<String, Object>> relatedLinks,
        Map<String, Object> sourceLinksByType,
        Map<String, Object> screeningSnapshot,
        String finalRecommendation,
        Instant analysisTime,
        Instant updatedAt
) {
}
