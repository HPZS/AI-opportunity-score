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
@Table(name = "lead_score")
public class LeadScoreEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "lead_id", nullable = false, unique = true)
    private Long leadId;

    @Column(name = "scenario_fit_score")
    private Double scenarioFitScore;

    @Column(name = "ai_fit_score")
    private Double aiFitScore;

    @Column(name = "opportunity_maturity_score")
    private Double opportunityMaturityScore;

    @Column(name = "screening_score")
    private Double screeningScore;

    @Column(name = "total_score")
    private Double totalScore;

    @Column(name = "deep_analysis_score")
    private Double deepAnalysisScore;

    @Column(name = "evidence_strength_score")
    private Double evidenceStrengthScore;

    @Column(name = "raw_composite_score")
    private Double rawCompositeScore;

    @Column(name = "composite_score")
    private Double compositeScore;

    @Lob
    @Column(name = "score_reason")
    private String scoreReason;

    @Lob
    @Column(name = "suggested_action")
    private String suggestedAction;

    @Column(name = "score_time")
    private Instant scoreTime;

    @Column(name = "last_task_key", length = 128)
    private String lastTaskKey;

    @Lob
    @Column(name = "score_payload_json")
    private String scorePayloadJson;

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

    public Double getScenarioFitScore() {
        return scenarioFitScore;
    }

    public void setScenarioFitScore(Double scenarioFitScore) {
        this.scenarioFitScore = scenarioFitScore;
    }

    public Double getAiFitScore() {
        return aiFitScore;
    }

    public void setAiFitScore(Double aiFitScore) {
        this.aiFitScore = aiFitScore;
    }

    public Double getOpportunityMaturityScore() {
        return opportunityMaturityScore;
    }

    public void setOpportunityMaturityScore(Double opportunityMaturityScore) {
        this.opportunityMaturityScore = opportunityMaturityScore;
    }

    public Double getScreeningScore() {
        return screeningScore;
    }

    public void setScreeningScore(Double screeningScore) {
        this.screeningScore = screeningScore;
    }

    public Double getTotalScore() {
        return totalScore;
    }

    public void setTotalScore(Double totalScore) {
        this.totalScore = totalScore;
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

    public Double getRawCompositeScore() {
        return rawCompositeScore;
    }

    public void setRawCompositeScore(Double rawCompositeScore) {
        this.rawCompositeScore = rawCompositeScore;
    }

    public Double getCompositeScore() {
        return compositeScore;
    }

    public void setCompositeScore(Double compositeScore) {
        this.compositeScore = compositeScore;
    }

    public String getScoreReason() {
        return scoreReason;
    }

    public void setScoreReason(String scoreReason) {
        this.scoreReason = scoreReason;
    }

    public String getSuggestedAction() {
        return suggestedAction;
    }

    public void setSuggestedAction(String suggestedAction) {
        this.suggestedAction = suggestedAction;
    }

    public Instant getScoreTime() {
        return scoreTime;
    }

    public void setScoreTime(Instant scoreTime) {
        this.scoreTime = scoreTime;
    }

    public String getLastTaskKey() {
        return lastTaskKey;
    }

    public void setLastTaskKey(String lastTaskKey) {
        this.lastTaskKey = lastTaskKey;
    }

    public String getScorePayloadJson() {
        return scorePayloadJson;
    }

    public void setScorePayloadJson(String scorePayloadJson) {
        this.scorePayloadJson = scorePayloadJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
