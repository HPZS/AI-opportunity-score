package com.aiopportunity.backend.web.dto;

import java.time.Instant;

public record ScoreResponse(
        Double scenarioFitScore,
        Double aiFitScore,
        Double opportunityMaturityScore,
        Double screeningScore,
        Double totalScore,
        Double deepAnalysisScore,
        Double evidenceStrengthScore,
        Double rawCompositeScore,
        Double compositeScore,
        String scoreReason,
        String suggestedAction,
        Instant scoreTime
) {
}
