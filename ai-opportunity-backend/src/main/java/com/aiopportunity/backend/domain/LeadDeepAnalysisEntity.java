package com.aiopportunity.backend.domain;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "lead_deep_analysis")
public class LeadDeepAnalysisEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "lead_id", nullable = false, unique = true)
    private Long leadId;

    @Lob
    @Column(name = "source_continuity")
    private String sourceContinuity;

    @Lob
    @Column(name = "similar_case_summary")
    private String similarCaseSummary;

    @Lob
    @Column(name = "landing_case_summary")
    private String landingCaseSummary;

    @Lob
    @Column(name = "policy_support_summary")
    private String policySupportSummary;

    @Lob
    @Column(name = "budget_support_summary")
    private String budgetSupportSummary;

    @Lob
    @Column(name = "competition_and_delivery_judgement")
    private String competitionAndDeliveryJudgement;

    @Lob
    @Column(name = "deep_analysis_conclusion")
    private String deepAnalysisConclusion;

    @Column(name = "deep_analysis_score")
    private Double deepAnalysisScore;

    @Column(name = "evidence_strength_score")
    private Double evidenceStrengthScore;

    @Lob
    @Column(name = "suggested_action")
    private String suggestedAction;

    @Lob
    @Column(name = "ai_value_summary")
    private String aiValueSummary;

    @Lob
    @Column(name = "ai_risks_json")
    private String aiRisksJson;

    @Lob
    @Column(name = "timeline_json")
    private String timelineJson;

    @Lob
    @Column(name = "related_links_json")
    private String relatedLinksJson;

    @Lob
    @Column(name = "source_links_by_type_json")
    private String sourceLinksByTypeJson;

    @Lob
    @Column(name = "screening_snapshot_json")
    private String screeningSnapshotJson;

    @Lob
    @Column(name = "final_recommendation")
    private String finalRecommendation;

    @Column(name = "analysis_time")
    private Instant analysisTime;

    @Column(name = "last_task_key", length = 128)
    private String lastTaskKey;

    @Lob
    @Column(name = "raw_payload_json")
    private String rawPayloadJson;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Long getId() {
        return id;
    }

    public Long getLeadId() {
        return leadId;
    }

    public void setLeadId(Long leadId) {
        this.leadId = leadId;
    }

    public String getSourceContinuity() {
        return sourceContinuity;
    }

    public void setSourceContinuity(String sourceContinuity) {
        this.sourceContinuity = sourceContinuity;
    }

    public String getSimilarCaseSummary() {
        return similarCaseSummary;
    }

    public void setSimilarCaseSummary(String similarCaseSummary) {
        this.similarCaseSummary = similarCaseSummary;
    }

    public String getLandingCaseSummary() {
        return landingCaseSummary;
    }

    public void setLandingCaseSummary(String landingCaseSummary) {
        this.landingCaseSummary = landingCaseSummary;
    }

    public String getPolicySupportSummary() {
        return policySupportSummary;
    }

    public void setPolicySupportSummary(String policySupportSummary) {
        this.policySupportSummary = policySupportSummary;
    }

    public String getBudgetSupportSummary() {
        return budgetSupportSummary;
    }

    public void setBudgetSupportSummary(String budgetSupportSummary) {
        this.budgetSupportSummary = budgetSupportSummary;
    }

    public String getCompetitionAndDeliveryJudgement() {
        return competitionAndDeliveryJudgement;
    }

    public void setCompetitionAndDeliveryJudgement(String competitionAndDeliveryJudgement) {
        this.competitionAndDeliveryJudgement = competitionAndDeliveryJudgement;
    }

    public String getDeepAnalysisConclusion() {
        return deepAnalysisConclusion;
    }

    public void setDeepAnalysisConclusion(String deepAnalysisConclusion) {
        this.deepAnalysisConclusion = deepAnalysisConclusion;
    }

    public Double getDeepAnalysisScore() {
        return deepAnalysisScore;
    }

    public void setDeepAnalysisScore(Double deepAnalysisScore) {
        this.deepAnalysisScore = deepAnalysisScore;
    }

    public Double getEvidenceStrengthScore() {
        return evidenceStrengthScore;
    }

    public void setEvidenceStrengthScore(Double evidenceStrengthScore) {
        this.evidenceStrengthScore = evidenceStrengthScore;
    }

    public String getSuggestedAction() {
        return suggestedAction;
    }

    public void setSuggestedAction(String suggestedAction) {
        this.suggestedAction = suggestedAction;
    }

    public String getAiValueSummary() {
        return aiValueSummary;
    }

    public void setAiValueSummary(String aiValueSummary) {
        this.aiValueSummary = aiValueSummary;
    }

    public String getAiRisksJson() {
        return aiRisksJson;
    }

    public void setAiRisksJson(String aiRisksJson) {
        this.aiRisksJson = aiRisksJson;
    }

    public String getTimelineJson() {
        return timelineJson;
    }

    public void setTimelineJson(String timelineJson) {
        this.timelineJson = timelineJson;
    }

    public String getRelatedLinksJson() {
        return relatedLinksJson;
    }

    public void setRelatedLinksJson(String relatedLinksJson) {
        this.relatedLinksJson = relatedLinksJson;
    }

    public String getSourceLinksByTypeJson() {
        return sourceLinksByTypeJson;
    }

    public void setSourceLinksByTypeJson(String sourceLinksByTypeJson) {
        this.sourceLinksByTypeJson = sourceLinksByTypeJson;
    }

    public String getScreeningSnapshotJson() {
        return screeningSnapshotJson;
    }

    public void setScreeningSnapshotJson(String screeningSnapshotJson) {
        this.screeningSnapshotJson = screeningSnapshotJson;
    }

    public String getFinalRecommendation() {
        return finalRecommendation;
    }

    public void setFinalRecommendation(String finalRecommendation) {
        this.finalRecommendation = finalRecommendation;
    }

    public Instant getAnalysisTime() {
        return analysisTime;
    }

    public void setAnalysisTime(Instant analysisTime) {
        this.analysisTime = analysisTime;
    }

    public String getLastTaskKey() {
        return lastTaskKey;
    }

    public void setLastTaskKey(String lastTaskKey) {
        this.lastTaskKey = lastTaskKey;
    }

    public String getRawPayloadJson() {
        return rawPayloadJson;
    }

    public void setRawPayloadJson(String rawPayloadJson) {
        this.rawPayloadJson = rawPayloadJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
