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
@Table(name = "lead_info")
public class LeadEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "external_lead_id", length = 128)
    private String externalLeadId;

    @Column(name = "dedupe_key", nullable = false, unique = true, length = 64)
    private String dedupeKey;

    @Column(name = "title", nullable = false, length = 512)
    private String title;

    @Column(name = "normalized_title", length = 512)
    private String normalizedTitle;

    @Column(name = "url", length = 1000)
    private String url;

    @Column(name = "source_name", length = 255)
    private String sourceName;

    @Column(name = "source_domain", length = 255)
    private String sourceDomain;

    @Column(name = "source_bucket", length = 64)
    private String sourceBucket;

    @Column(name = "organization_name", length = 255)
    private String organizationName;

    @Column(name = "lead_category", length = 64)
    private String leadCategory;

    @Column(name = "current_stage", length = 128)
    private String currentStage;

    @Column(name = "is_actionable_now")
    private Boolean isActionableNow;

    @Column(name = "should_enter_pool")
    private Boolean shouldEnterPool;

    @Column(name = "pool_entry_tier", length = 64)
    private String poolEntryTier;

    @Column(name = "opportunity_signal_class", length = 128)
    private String opportunitySignalClass;

    @Lob
    @Column(name = "category_reason")
    private String categoryReason;

    @Lob
    @Column(name = "description")
    private String description;

    @Column(name = "publish_time")
    private Instant publishTime;

    @Column(name = "publish_time_raw", length = 128)
    private String publishTimeRaw;

    @Column(name = "publish_time_confidence")
    private Double publishTimeConfidence;

    @Column(name = "within_time_window")
    private Boolean withinTimeWindow;

    @Column(name = "time_window_status", length = 64)
    private String timeWindowStatus;

    @Lob
    @Column(name = "scenario_tags_json")
    private String scenarioTagsJson;

    @Lob
    @Column(name = "evidence_summary_json")
    private String evidenceSummaryJson;

    @Lob
    @Column(name = "recommended_technologies_json")
    private String recommendedTechnologiesJson;

    @Lob
    @Column(name = "related_links_json")
    private String relatedLinksJson;

    @Lob
    @Column(name = "latest_follow_up_action")
    private String latestFollowUpAction;

    @Lob
    @Column(name = "latest_suggested_action")
    private String latestSuggestedAction;

    @Column(name = "status", length = 64)
    private String status;

    @Column(name = "expiry_status", length = 64)
    private String expiryStatus;

    @Column(name = "latest_screening_task_key", length = 128)
    private String latestScreeningTaskKey;

    @Column(name = "latest_investigation_task_key", length = 128)
    private String latestInvestigationTaskKey;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Long getId() {
        return id;
    }

    public String getExternalLeadId() {
        return externalLeadId;
    }

    public void setExternalLeadId(String externalLeadId) {
        this.externalLeadId = externalLeadId;
    }

    public String getDedupeKey() {
        return dedupeKey;
    }

    public void setDedupeKey(String dedupeKey) {
        this.dedupeKey = dedupeKey;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getNormalizedTitle() {
        return normalizedTitle;
    }

    public void setNormalizedTitle(String normalizedTitle) {
        this.normalizedTitle = normalizedTitle;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getSourceName() {
        return sourceName;
    }

    public void setSourceName(String sourceName) {
        this.sourceName = sourceName;
    }

    public String getSourceDomain() {
        return sourceDomain;
    }

    public void setSourceDomain(String sourceDomain) {
        this.sourceDomain = sourceDomain;
    }

    public String getSourceBucket() {
        return sourceBucket;
    }

    public void setSourceBucket(String sourceBucket) {
        this.sourceBucket = sourceBucket;
    }

    public String getOrganizationName() {
        return organizationName;
    }

    public void setOrganizationName(String organizationName) {
        this.organizationName = organizationName;
    }

    public String getLeadCategory() {
        return leadCategory;
    }

    public void setLeadCategory(String leadCategory) {
        this.leadCategory = leadCategory;
    }

    public String getCurrentStage() {
        return currentStage;
    }

    public void setCurrentStage(String currentStage) {
        this.currentStage = currentStage;
    }

    public Boolean getIsActionableNow() {
        return isActionableNow;
    }

    public void setIsActionableNow(Boolean isActionableNow) {
        this.isActionableNow = isActionableNow;
    }

    public Boolean getShouldEnterPool() {
        return shouldEnterPool;
    }

    public void setShouldEnterPool(Boolean shouldEnterPool) {
        this.shouldEnterPool = shouldEnterPool;
    }

    public String getPoolEntryTier() {
        return poolEntryTier;
    }

    public void setPoolEntryTier(String poolEntryTier) {
        this.poolEntryTier = poolEntryTier;
    }

    public String getOpportunitySignalClass() {
        return opportunitySignalClass;
    }

    public void setOpportunitySignalClass(String opportunitySignalClass) {
        this.opportunitySignalClass = opportunitySignalClass;
    }

    public String getCategoryReason() {
        return categoryReason;
    }

    public void setCategoryReason(String categoryReason) {
        this.categoryReason = categoryReason;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Instant getPublishTime() {
        return publishTime;
    }

    public void setPublishTime(Instant publishTime) {
        this.publishTime = publishTime;
    }

    public String getPublishTimeRaw() {
        return publishTimeRaw;
    }

    public void setPublishTimeRaw(String publishTimeRaw) {
        this.publishTimeRaw = publishTimeRaw;
    }

    public Double getPublishTimeConfidence() {
        return publishTimeConfidence;
    }

    public void setPublishTimeConfidence(Double publishTimeConfidence) {
        this.publishTimeConfidence = publishTimeConfidence;
    }

    public Boolean getWithinTimeWindow() {
        return withinTimeWindow;
    }

    public void setWithinTimeWindow(Boolean withinTimeWindow) {
        this.withinTimeWindow = withinTimeWindow;
    }

    public String getTimeWindowStatus() {
        return timeWindowStatus;
    }

    public void setTimeWindowStatus(String timeWindowStatus) {
        this.timeWindowStatus = timeWindowStatus;
    }

    public String getScenarioTagsJson() {
        return scenarioTagsJson;
    }

    public void setScenarioTagsJson(String scenarioTagsJson) {
        this.scenarioTagsJson = scenarioTagsJson;
    }

    public String getEvidenceSummaryJson() {
        return evidenceSummaryJson;
    }

    public void setEvidenceSummaryJson(String evidenceSummaryJson) {
        this.evidenceSummaryJson = evidenceSummaryJson;
    }

    public String getRecommendedTechnologiesJson() {
        return recommendedTechnologiesJson;
    }

    public void setRecommendedTechnologiesJson(String recommendedTechnologiesJson) {
        this.recommendedTechnologiesJson = recommendedTechnologiesJson;
    }

    public String getRelatedLinksJson() {
        return relatedLinksJson;
    }

    public void setRelatedLinksJson(String relatedLinksJson) {
        this.relatedLinksJson = relatedLinksJson;
    }

    public String getLatestFollowUpAction() {
        return latestFollowUpAction;
    }

    public void setLatestFollowUpAction(String latestFollowUpAction) {
        this.latestFollowUpAction = latestFollowUpAction;
    }

    public String getLatestSuggestedAction() {
        return latestSuggestedAction;
    }

    public void setLatestSuggestedAction(String latestSuggestedAction) {
        this.latestSuggestedAction = latestSuggestedAction;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getExpiryStatus() {
        return expiryStatus;
    }

    public void setExpiryStatus(String expiryStatus) {
        this.expiryStatus = expiryStatus;
    }

    public String getLatestScreeningTaskKey() {
        return latestScreeningTaskKey;
    }

    public void setLatestScreeningTaskKey(String latestScreeningTaskKey) {
        this.latestScreeningTaskKey = latestScreeningTaskKey;
    }

    public String getLatestInvestigationTaskKey() {
        return latestInvestigationTaskKey;
    }

    public void setLatestInvestigationTaskKey(String latestInvestigationTaskKey) {
        this.latestInvestigationTaskKey = latestInvestigationTaskKey;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
