package com.aiopportunity.backend.service;

import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aiopportunity.backend.domain.LeadDeepAnalysisEntity;
import com.aiopportunity.backend.domain.LeadEntity;
import com.aiopportunity.backend.domain.LeadScoreEntity;
import com.aiopportunity.backend.exception.ResourceNotFoundException;
import com.aiopportunity.backend.repository.LeadDeepAnalysisRepository;
import com.aiopportunity.backend.repository.LeadRepository;
import com.aiopportunity.backend.repository.LeadScoreRepository;
import com.aiopportunity.backend.web.dto.LeadDeepAnalysisResponse;
import com.aiopportunity.backend.web.dto.LeadDetailResponse;
import com.aiopportunity.backend.web.dto.LeadListItemResponse;
import com.aiopportunity.backend.web.dto.PagedResponse;
import com.aiopportunity.backend.web.dto.ScoreResponse;

import jakarta.persistence.criteria.Predicate;

@Service
public class LeadQueryService {

    private final LeadRepository leadRepository;
    private final LeadScoreRepository leadScoreRepository;
    private final LeadDeepAnalysisRepository leadDeepAnalysisRepository;
    private final JsonSupport jsonSupport;

    public LeadQueryService(
            LeadRepository leadRepository,
            LeadScoreRepository leadScoreRepository,
            LeadDeepAnalysisRepository leadDeepAnalysisRepository,
            JsonSupport jsonSupport
    ) {
        this.leadRepository = leadRepository;
        this.leadScoreRepository = leadScoreRepository;
        this.leadDeepAnalysisRepository = leadDeepAnalysisRepository;
        this.jsonSupport = jsonSupport;
    }

    @Transactional(readOnly = true)
    public PagedResponse<LeadListItemResponse> listLeads(
            String keyword,
            String leadCategory,
            String poolEntryTier,
            String status,
            int page,
            int size
    ) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "updatedAt"));
        Specification<LeadEntity> specification = (root, query, builder) -> {
            List<Predicate> predicates = new java.util.ArrayList<>();
            if (keyword != null && !keyword.isBlank()) {
                String like = "%" + keyword.trim() + "%";
                predicates.add(builder.or(
                        builder.like(root.get("title"), like),
                        builder.like(root.get("organizationName"), like),
                        builder.like(root.get("sourceName"), like)
                ));
            }
            if (leadCategory != null && !leadCategory.isBlank()) {
                predicates.add(builder.equal(root.get("leadCategory"), leadCategory));
            }
            if (poolEntryTier != null && !poolEntryTier.isBlank()) {
                predicates.add(builder.equal(root.get("poolEntryTier"), poolEntryTier));
            }
            if (status != null && !status.isBlank()) {
                predicates.add(builder.equal(root.get("status"), status));
            }
            return builder.and(predicates.toArray(Predicate[]::new));
        };

        Page<LeadEntity> leadPage = leadRepository.findAll(specification, pageable);
        Map<Long, LeadScoreEntity> scoreMap = scoreMap(leadPage.getContent().stream().map(LeadEntity::getId).toList());
        List<LeadListItemResponse> content = leadPage.getContent().stream()
                .map(lead -> toLeadListItem(lead, scoreMap.get(lead.getId())))
                .toList();

        return new PagedResponse<>(
                content,
                leadPage.getTotalElements(),
                leadPage.getTotalPages(),
                leadPage.getNumber(),
                leadPage.getSize()
        );
    }

    @Transactional(readOnly = true)
    public LeadDetailResponse getLeadDetail(Long id) {
        LeadEntity lead = leadRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("线索不存在: " + id));
        LeadScoreEntity score = leadScoreRepository.findByLeadId(id).orElse(null);

        return new LeadDetailResponse(
                lead.getId(),
                lead.getExternalLeadId(),
                lead.getTitle(),
                lead.getNormalizedTitle(),
                lead.getUrl(),
                lead.getSourceName(),
                lead.getSourceDomain(),
                lead.getSourceBucket(),
                lead.getOrganizationName(),
                lead.getLeadCategory(),
                lead.getCurrentStage(),
                lead.getIsActionableNow(),
                lead.getShouldEnterPool(),
                lead.getPoolEntryTier(),
                lead.getOpportunitySignalClass(),
                lead.getCategoryReason(),
                lead.getDescription(),
                lead.getPublishTime(),
                lead.getPublishTimeRaw(),
                lead.getPublishTimeConfidence(),
                lead.getWithinTimeWindow(),
                lead.getTimeWindowStatus(),
                lead.getStatus(),
                lead.getExpiryStatus(),
                jsonSupport.toStringList(lead.getScenarioTagsJson()),
                jsonSupport.toStringList(lead.getEvidenceSummaryJson()),
                jsonSupport.toStringList(lead.getRecommendedTechnologiesJson()),
                jsonSupport.toObjectList(lead.getRelatedLinksJson()),
                toScoreResponse(score),
                lead.getLatestFollowUpAction(),
                lead.getLatestSuggestedAction(),
                lead.getCreatedAt(),
                lead.getUpdatedAt()
        );
    }

    @Transactional(readOnly = true)
    public LeadDeepAnalysisResponse getLeadDeepAnalysis(Long leadId) {
        LeadDeepAnalysisEntity analysis = leadDeepAnalysisRepository.findByLeadId(leadId)
                .orElseThrow(() -> new ResourceNotFoundException("线索深查结果不存在: " + leadId));

        return new LeadDeepAnalysisResponse(
                analysis.getLeadId(),
                analysis.getSourceContinuity(),
                analysis.getSimilarCaseSummary(),
                analysis.getLandingCaseSummary(),
                analysis.getPolicySupportSummary(),
                analysis.getBudgetSupportSummary(),
                analysis.getCompetitionAndDeliveryJudgement(),
                analysis.getDeepAnalysisConclusion(),
                analysis.getDeepAnalysisScore(),
                analysis.getEvidenceStrengthScore(),
                analysis.getSuggestedAction(),
                analysis.getAiValueSummary(),
                jsonSupport.toStringList(analysis.getAiRisksJson()),
                jsonSupport.toObjectList(analysis.getTimelineJson()),
                jsonSupport.toObjectList(analysis.getRelatedLinksJson()),
                jsonSupport.toObjectMap(analysis.getSourceLinksByTypeJson()),
                jsonSupport.toObjectMap(analysis.getScreeningSnapshotJson()),
                analysis.getFinalRecommendation(),
                analysis.getAnalysisTime(),
                analysis.getUpdatedAt()
        );
    }

    @Transactional
    public void updateLeadStatus(Long id, String status) {
        LeadEntity lead = leadRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("线索不存在: " + id));
        lead.setStatus(status);
        leadRepository.save(lead);
    }

    private LeadListItemResponse toLeadListItem(LeadEntity lead, LeadScoreEntity score) {
        return new LeadListItemResponse(
                lead.getId(),
                lead.getTitle(),
                lead.getOrganizationName(),
                lead.getSourceName(),
                lead.getSourceDomain(),
                lead.getLeadCategory(),
                lead.getCurrentStage(),
                lead.getPoolEntryTier(),
                lead.getStatus(),
                lead.getExpiryStatus(),
                lead.getShouldEnterPool(),
                lead.getPublishTime(),
                score == null ? null : score.getCompositeScore(),
                jsonSupport.toStringList(lead.getScenarioTagsJson()),
                lead.getUpdatedAt()
        );
    }

    private ScoreResponse toScoreResponse(LeadScoreEntity score) {
        if (score == null) {
            return null;
        }
        return new ScoreResponse(
                score.getScenarioFitScore(),
                score.getAiFitScore(),
                score.getOpportunityMaturityScore(),
                score.getScreeningScore(),
                score.getTotalScore(),
                score.getDeepAnalysisScore(),
                score.getEvidenceStrengthScore(),
                score.getRawCompositeScore(),
                score.getCompositeScore(),
                score.getScoreReason(),
                score.getSuggestedAction(),
                score.getScoreTime()
        );
    }

    private Map<Long, LeadScoreEntity> scoreMap(Collection<Long> leadIds) {
        if (leadIds.isEmpty()) {
            return Collections.emptyMap();
        }
        return leadScoreRepository.findAllByLeadIdIn(leadIds).stream()
                .collect(Collectors.toMap(LeadScoreEntity::getLeadId, Function.identity()));
    }
}
