package com.aiopportunity.backend.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aiopportunity.backend.config.AppStorageProperties;
import com.aiopportunity.backend.domain.AgentTaskEntity;
import com.aiopportunity.backend.domain.AgentTaskResultEntity;
import com.aiopportunity.backend.domain.LeadDeepAnalysisEntity;
import com.aiopportunity.backend.domain.LeadEntity;
import com.aiopportunity.backend.domain.LeadScoreEntity;
import com.aiopportunity.backend.exception.BadRequestException;
import com.aiopportunity.backend.repository.AgentTaskRepository;
import com.aiopportunity.backend.repository.AgentTaskResultRepository;
import com.aiopportunity.backend.repository.LeadDeepAnalysisRepository;
import com.aiopportunity.backend.repository.LeadRepository;
import com.aiopportunity.backend.repository.LeadScoreRepository;
import com.aiopportunity.backend.web.dto.ImportTaskResultRequest;
import com.aiopportunity.backend.web.dto.ImportTaskResultResponse;
import com.fasterxml.jackson.databind.JsonNode;

@Service
public class TaskResultImportService {

    private static final List<String> SCREENING_BUCKETS = List.of(
            "currentOpportunities",
            "historicalCases",
            "policySignals",
            "outOfWindowLeads"
    );

    private final AppStorageProperties storageProperties;
    private final JsonSupport jsonSupport;
    private final AgentTaskRepository agentTaskRepository;
    private final AgentTaskResultRepository agentTaskResultRepository;
    private final LeadRepository leadRepository;
    private final LeadScoreRepository leadScoreRepository;
    private final LeadDeepAnalysisRepository leadDeepAnalysisRepository;

    public TaskResultImportService(
            AppStorageProperties storageProperties,
            JsonSupport jsonSupport,
            AgentTaskRepository agentTaskRepository,
            AgentTaskResultRepository agentTaskResultRepository,
            LeadRepository leadRepository,
            LeadScoreRepository leadScoreRepository,
            LeadDeepAnalysisRepository leadDeepAnalysisRepository
    ) {
        this.storageProperties = storageProperties;
        this.jsonSupport = jsonSupport;
        this.agentTaskRepository = agentTaskRepository;
        this.agentTaskResultRepository = agentTaskResultRepository;
        this.leadRepository = leadRepository;
        this.leadScoreRepository = leadScoreRepository;
        this.leadDeepAnalysisRepository = leadDeepAnalysisRepository;
    }

    @Transactional
    public ImportTaskResultResponse importTaskResult(ImportTaskResultRequest request) {
        Path filePath = resolveTaskFile(request);
        String taskKey = stripExtension(filePath.getFileName().toString());
        JsonNode root = readJson(filePath);
        JsonNode resultNode = root.path("result");
        if (resultNode.isMissingNode() || resultNode.isNull()) {
            throw new BadRequestException("任务结果文件缺少 result 节点");
        }

        AgentTaskEntity task = agentTaskRepository.findByTaskKey(taskKey).orElseGet(AgentTaskEntity::new);
        task.setTaskKey(taskKey);
        task.setTaskType(text(root, "taskType"));
        task.setOriginalTaskType(text(root, "originalTaskType"));
        task.setModelName(text(root, "model"));
        task.setSavedAt(parseInstant(text(root, "savedAt")));

        JsonNode taskInput = root.path("taskInput");
        task.setPromptText(text(taskInput, "prompt"));
        task.setInputFile(text(taskInput, "inputFile"));
        task.setTaskMessage(text(taskInput, "taskMessage"));

        JsonNode taskMeta = root.path("taskMeta");
        task.setAttemptCount(integer(taskMeta, "attemptCount"));
        task.setStoppedByUser(bool(taskMeta, "stoppedByUser"));
        task.setCompleted(bool(taskMeta, "completed"));
        task.setTaskState(text(taskMeta, "taskState"));
        task.setResumable(bool(taskMeta, "resumable"));
        task.setResumeKey(text(taskMeta, "resumeKey"));
        task.setFailureReason(text(taskMeta, "failureReason"));

        JsonNode tokens = root.path("tokens");
        task.setTokenInput(integer(tokens, "input"));
        task.setTokenOutput(integer(tokens, "output"));
        task.setParsed(root.path("parsed").isBoolean() ? root.path("parsed").booleanValue() : null);
        task.setResultPayloadJson(jsonSupport.writeNode(resultNode));
        task.setRawText(text(root, "rawText"));
        task = agentTaskRepository.save(task);

        agentTaskResultRepository.deleteByAgentTaskId(task.getId());
        saveTaskSnapshot(task.getId(), resultNode, task.getTaskType());

        int importedLeadCount = 0;
        int updatedScoreCount = 0;
        int updatedDeepAnalysisCount = 0;
        List<String> warnings = new ArrayList<>();

        if ("screening".equals(task.getTaskType())) {
            for (String bucket : SCREENING_BUCKETS) {
                JsonNode items = resultNode.path(bucket);
                if (!items.isArray()) {
                    continue;
                }
                for (JsonNode item : items) {
                    LeadEntity lead = upsertLeadFromScreeningItem(task, bucket, item);
                    upsertScoreFromScreeningItem(task, lead, item);
                    saveResultItem(task.getId(), lead.getId(), "screening_item", bucket, null, text(item, "title"), item);
                    importedLeadCount += 1;
                    updatedScoreCount += 1;
                }
            }
        } else if ("investigation".equals(task.getTaskType())) {
            JsonNode investigatedLeads = resultNode.path("investigatedLeads");
            if (investigatedLeads.isArray()) {
                for (JsonNode item : investigatedLeads) {
                    LeadEntity lead = upsertLeadFromInvestigationItem(task, item);
                    upsertScoreFromInvestigationItem(task, lead, item);
                    upsertDeepAnalysis(task, lead, item);
                    saveResultItem(task.getId(), lead.getId(), "investigation_item", null, null, text(item, "title"), item);
                    importedLeadCount += 1;
                    updatedScoreCount += 1;
                    updatedDeepAnalysisCount += 1;
                }
            }

            JsonNode rankedRecommendations = resultNode.path("rankedRecommendations");
            if (rankedRecommendations.isArray()) {
                for (JsonNode item : rankedRecommendations) {
                    Long leadId = findLeadIdByExternalLeadId(text(item, "leadId"));
                    saveResultItem(task.getId(), leadId, "ranked_recommendation", null, integer(item, "rank"), text(item, "title"), item);
                }
            }
        } else {
            warnings.add("当前任务类型未做专项导入，仅保存了任务快照");
        }

        JsonNode notes = resultNode.path("notes");
        if (notes.isArray()) {
            notes.forEach(note -> warnings.add(note.asText()));
        }

        return new ImportTaskResultResponse(
                task.getId(),
                task.getTaskKey(),
                task.getTaskType(),
                importedLeadCount,
                updatedScoreCount,
                updatedDeepAnalysisCount,
                warnings
        );
    }

    private void saveTaskSnapshot(Long taskId, JsonNode resultNode, String taskType) {
        AgentTaskResultEntity snapshot = new AgentTaskResultEntity();
        snapshot.setAgentTaskId(taskId);
        snapshot.setResultType("task_result");
        snapshot.setTitle(taskType);
        snapshot.setPayloadJson(jsonSupport.writeNode(resultNode));
        agentTaskResultRepository.save(snapshot);
    }

    private LeadEntity upsertLeadFromScreeningItem(AgentTaskEntity task, String bucket, JsonNode item) {
        String normalizedTitle = normalizeTitle(item);
        String organizationName = firstNonBlank(text(item, "ownerOrg"), text(item, "organizationName"));
        String url = text(item, "url");
        String sourceDomain = text(item, "sourceDomain");
        String dedupeKey = buildDedupeKey(url, normalizedTitle, organizationName, sourceDomain);

        Optional<LeadEntity> candidate = leadRepository.findByDedupeKey(dedupeKey);
        if (candidate.isEmpty() && !isBlank(url)) {
            candidate = leadRepository.findFirstByUrl(url);
        }
        if (candidate.isEmpty() && !isBlank(normalizedTitle) && !isBlank(organizationName)) {
            candidate = leadRepository.findFirstByNormalizedTitleAndOrganizationName(normalizedTitle, organizationName);
        }

        LeadEntity lead = candidate.orElseGet(LeadEntity::new);
        lead.setDedupeKey(dedupeKey);
        applyScreeningFields(lead, item, bucket);
        lead.setLatestScreeningTaskKey(task.getTaskKey());
        if (isBlank(lead.getStatus())) {
            lead.setStatus(defaultLeadStatus(lead.getShouldEnterPool()));
        }
        lead.setExpiryStatus(resolveExpiryStatus(lead.getTimeWindowStatus(), lead.getWithinTimeWindow()));
        return leadRepository.save(lead);
    }

    private LeadEntity upsertLeadFromInvestigationItem(AgentTaskEntity task, JsonNode item) {
        String externalLeadId = text(item, "leadId");
        String normalizedTitle = normalizeTitle(item);
        String organizationName = firstNonBlank(text(item, "ownerOrg"), text(item, "organizationName"));
        String leadUrl = resolveInvestigationLeadUrl(item);

        Optional<LeadEntity> candidate = Optional.empty();
        if (!isBlank(externalLeadId)) {
            candidate = leadRepository.findByExternalLeadId(externalLeadId);
        }
        if (candidate.isEmpty() && !isBlank(leadUrl)) {
            candidate = leadRepository.findFirstByUrl(leadUrl);
        }
        if (candidate.isEmpty() && !isBlank(normalizedTitle) && !isBlank(organizationName)) {
            candidate = leadRepository.findFirstByNormalizedTitleAndOrganizationName(normalizedTitle, organizationName);
        }
        if (candidate.isEmpty() && !isBlank(normalizedTitle)) {
            candidate = leadRepository.findFirstByNormalizedTitle(normalizedTitle);
        }

        LeadEntity lead = candidate.orElseGet(LeadEntity::new);
        if (isBlank(lead.getDedupeKey())) {
            lead.setDedupeKey(buildDedupeKey(leadUrl, normalizedTitle, organizationName, null));
        }
        lead.setExternalLeadId(firstNonBlank(externalLeadId, lead.getExternalLeadId()));
        lead.setTitle(firstNonBlank(text(item, "title"), lead.getTitle()));
        lead.setNormalizedTitle(firstNonBlank(normalizedTitle, lead.getNormalizedTitle()));
        lead.setUrl(firstNonBlank(leadUrl, lead.getUrl()));
        lead.setOrganizationName(firstNonBlank(organizationName, lead.getOrganizationName()));
        lead.setLeadCategory(firstNonBlank(text(item, "leadCategory"), lead.getLeadCategory()));
        lead.setCurrentStage(firstNonBlank(text(item, "opportunityStage"), lead.getCurrentStage()));
        lead.setIsActionableNow(firstNonNull(bool(item, "isActionableNow"), lead.getIsActionableNow()));
        lead.setShouldEnterPool(firstNonNull(bool(item, "shouldEnterPool"), lead.getShouldEnterPool()));
        lead.setPoolEntryTier(firstNonBlank(text(item, "poolEntryTier"), lead.getPoolEntryTier()));
        lead.setDescription(firstNonBlank(text(item, "description"), lead.getDescription()));
        lead.setLatestSuggestedAction(firstNonBlank(text(item.path("deepAnalysis"), "suggestedAction"), lead.getLatestSuggestedAction()));
        lead.setLatestInvestigationTaskKey(task.getTaskKey());
        if (isBlank(lead.getStatus())) {
            lead.setStatus(defaultLeadStatus(lead.getShouldEnterPool()));
        }
        return leadRepository.save(lead);
    }

    private void applyScreeningFields(LeadEntity lead, JsonNode item, String bucket) {
        lead.setTitle(firstNonBlank(text(item, "title"), lead.getTitle()));
        lead.setNormalizedTitle(firstNonBlank(normalizeTitle(item), lead.getNormalizedTitle()));
        lead.setUrl(firstNonBlank(text(item, "url"), lead.getUrl()));
        lead.setSourceName(firstNonBlank(text(item, "sourceName"), lead.getSourceName()));
        lead.setSourceDomain(firstNonBlank(text(item, "sourceDomain"), lead.getSourceDomain()));
        lead.setSourceBucket(bucket);
        lead.setOrganizationName(firstNonBlank(text(item, "ownerOrg"), lead.getOrganizationName()));
        lead.setLeadCategory(firstNonBlank(text(item, "leadCategory"), lead.getLeadCategory()));
        lead.setCurrentStage(firstNonBlank(text(item, "opportunityStage"), lead.getCurrentStage()));
        lead.setIsActionableNow(firstNonNull(bool(item, "isActionableNow"), lead.getIsActionableNow()));
        lead.setShouldEnterPool(firstNonNull(bool(item, "shouldEnterPool"), lead.getShouldEnterPool()));
        lead.setPoolEntryTier(firstNonBlank(text(item, "poolEntryTier"), lead.getPoolEntryTier()));
        lead.setOpportunitySignalClass(firstNonBlank(text(item, "opportunitySignalClass"), lead.getOpportunitySignalClass()));
        lead.setCategoryReason(firstNonBlank(text(item, "categoryReason"), lead.getCategoryReason()));
        lead.setDescription(firstNonBlank(text(item, "description"), lead.getDescription()));
        lead.setPublishTime(firstNonNull(parseInstant(text(item, "publishTime")), lead.getPublishTime()));
        lead.setPublishTimeRaw(firstNonBlank(text(item, "publishTimeRaw"), lead.getPublishTimeRaw()));
        lead.setPublishTimeConfidence(firstNonNull(doubleValue(item, "publishTimeConfidence"), lead.getPublishTimeConfidence()));
        lead.setWithinTimeWindow(firstNonNull(bool(item, "withinTimeWindow"), lead.getWithinTimeWindow()));
        lead.setTimeWindowStatus(firstNonBlank(text(item, "timeWindowStatus"), lead.getTimeWindowStatus()));
        lead.setScenarioTagsJson(jsonSupport.writeNode(item.path("scenarioTags")));
        lead.setEvidenceSummaryJson(jsonSupport.writeNode(item.path("evidenceSummary")));
        lead.setRecommendedTechnologiesJson(jsonSupport.writeNode(item.path("recommendedTechnologies")));
        lead.setRelatedLinksJson(jsonSupport.writeNode(item.path("relatedLinks")));
        lead.setLatestFollowUpAction(firstNonBlank(text(item, "followUpAction"), lead.getLatestFollowUpAction()));
        lead.setLatestSuggestedAction(firstNonBlank(text(item, "suggestedAction"), lead.getLatestSuggestedAction()));
    }

    private void upsertScoreFromScreeningItem(AgentTaskEntity task, LeadEntity lead, JsonNode item) {
        JsonNode scoreBreakdown = item.path("scoreBreakdown");
        LeadScoreEntity score = leadScoreRepository.findByLeadId(lead.getId()).orElseGet(LeadScoreEntity::new);
        score.setLeadId(lead.getId());
        score.setScenarioFitScore(firstNonNull(doubleValue(scoreBreakdown, "scenarioFitScore"), score.getScenarioFitScore()));
        score.setAiFitScore(firstNonNull(doubleValue(scoreBreakdown, "aiFitScore"), score.getAiFitScore()));
        score.setOpportunityMaturityScore(firstNonNull(
                doubleValue(scoreBreakdown, "opportunityMaturityScore"),
                firstNonNull(doubleValue(scoreBreakdown, "maturityScore"), score.getOpportunityMaturityScore())
        ));
        score.setScreeningScore(firstNonNull(
                doubleValue(scoreBreakdown, "screeningScore"),
                firstNonNull(doubleValue(scoreBreakdown, "opportunityScore"), score.getScreeningScore())
        ));
        score.setTotalScore(firstNonNull(doubleValue(scoreBreakdown, "totalScore"), score.getTotalScore()));
        Double rawCompositeScore = computeRawCompositeScore(
                score.getAiFitScore(),
                score.getOpportunityMaturityScore(),
                null,
                firstNonNull(doubleValue(item, "rawCompositeScore"), score.getTotalScore())
        );
        score.setRawCompositeScore(rawCompositeScore);
        score.setCompositeScore(firstNonNull(doubleValue(item, "compositeScore"), upliftCompositeScore(rawCompositeScore)));
        score.setScoreReason(firstNonBlank(text(item, "categoryReason"), score.getScoreReason()));
        score.setSuggestedAction(firstNonBlank(text(item, "suggestedAction"), score.getSuggestedAction()));
        score.setScoreTime(firstNonNull(task.getSavedAt(), Instant.now()));
        score.setLastTaskKey(task.getTaskKey());
        score.setScorePayloadJson(jsonSupport.writeNode(scoreBreakdown));
        leadScoreRepository.save(score);
    }

    private void upsertScoreFromInvestigationItem(AgentTaskEntity task, LeadEntity lead, JsonNode item) {
        JsonNode screeningSnapshot = item.path("screeningSnapshot");
        JsonNode deepAnalysis = item.path("deepAnalysis");
        LeadScoreEntity score = leadScoreRepository.findByLeadId(lead.getId()).orElseGet(LeadScoreEntity::new);
        score.setLeadId(lead.getId());
        score.setScenarioFitScore(firstNonNull(doubleValue(screeningSnapshot, "scenarioFitScore"), score.getScenarioFitScore()));
        score.setAiFitScore(firstNonNull(doubleValue(screeningSnapshot, "aiFitScore"), score.getAiFitScore()));
        score.setOpportunityMaturityScore(firstNonNull(doubleValue(screeningSnapshot, "opportunityMaturityScore"), score.getOpportunityMaturityScore()));
        score.setScreeningScore(firstNonNull(doubleValue(screeningSnapshot, "screeningScore"), score.getScreeningScore()));
        score.setTotalScore(firstNonNull(doubleValue(screeningSnapshot, "totalScore"), score.getTotalScore()));
        score.setDeepAnalysisScore(firstNonNull(doubleValue(deepAnalysis, "deepAnalysisScore"), score.getDeepAnalysisScore()));
        score.setEvidenceStrengthScore(firstNonNull(doubleValue(deepAnalysis, "evidenceStrengthScore"), score.getEvidenceStrengthScore()));
        Double rawCompositeScore = computeRawCompositeScore(
                score.getAiFitScore(),
                score.getOpportunityMaturityScore(),
                score.getDeepAnalysisScore(),
                firstNonNull(
                        doubleValue(item, "rawCompositeScore"),
                        firstNonNull(score.getTotalScore(), score.getScreeningScore())
                )
        );
        score.setRawCompositeScore(rawCompositeScore);
        score.setCompositeScore(firstNonNull(doubleValue(item, "compositeScore"), upliftCompositeScore(rawCompositeScore)));
        score.setSuggestedAction(firstNonBlank(text(deepAnalysis, "suggestedAction"), score.getSuggestedAction()));
        score.setScoreTime(firstNonNull(task.getSavedAt(), Instant.now()));
        score.setLastTaskKey(task.getTaskKey());
        score.setScorePayloadJson(jsonSupport.writeNode(screeningSnapshot));
        leadScoreRepository.save(score);
    }

    private void upsertDeepAnalysis(AgentTaskEntity task, LeadEntity lead, JsonNode item) {
        JsonNode deepAnalysis = item.path("deepAnalysis");
        JsonNode supplement = item.path("analysisSupplement");
        LeadDeepAnalysisEntity analysis = leadDeepAnalysisRepository.findByLeadId(lead.getId()).orElseGet(LeadDeepAnalysisEntity::new);
        analysis.setLeadId(lead.getId());
        analysis.setSourceContinuity(firstNonBlank(text(deepAnalysis, "sourceContinuity"), analysis.getSourceContinuity()));
        analysis.setSimilarCaseSummary(firstNonBlank(text(deepAnalysis, "similarCaseSummary"), analysis.getSimilarCaseSummary()));
        analysis.setLandingCaseSummary(firstNonBlank(text(deepAnalysis, "landingCaseSummary"), analysis.getLandingCaseSummary()));
        analysis.setPolicySupportSummary(firstNonBlank(text(deepAnalysis, "policySupportSummary"), analysis.getPolicySupportSummary()));
        analysis.setBudgetSupportSummary(firstNonBlank(text(deepAnalysis, "budgetSupportSummary"), analysis.getBudgetSupportSummary()));
        analysis.setCompetitionAndDeliveryJudgement(firstNonBlank(text(deepAnalysis, "competitionAndDeliveryJudgement"), analysis.getCompetitionAndDeliveryJudgement()));
        analysis.setDeepAnalysisConclusion(firstNonBlank(text(deepAnalysis, "deepAnalysisConclusion"), analysis.getDeepAnalysisConclusion()));
        analysis.setDeepAnalysisScore(firstNonNull(doubleValue(deepAnalysis, "deepAnalysisScore"), analysis.getDeepAnalysisScore()));
        analysis.setEvidenceStrengthScore(firstNonNull(doubleValue(deepAnalysis, "evidenceStrengthScore"), analysis.getEvidenceStrengthScore()));
        analysis.setSuggestedAction(firstNonBlank(text(deepAnalysis, "suggestedAction"), analysis.getSuggestedAction()));
        analysis.setAiValueSummary(firstNonBlank(text(supplement, "aiValueSummary"), analysis.getAiValueSummary()));
        analysis.setAiRisksJson(jsonSupport.writeNode(supplement.path("aiRisks")));
        analysis.setTimelineJson(jsonSupport.writeNode(item.path("timeline")));
        analysis.setRelatedLinksJson(jsonSupport.writeNode(item.path("relatedLinks")));
        analysis.setSourceLinksByTypeJson(jsonSupport.writeNode(item.path("sourceLinksByType")));
        analysis.setScreeningSnapshotJson(jsonSupport.writeNode(item.path("screeningSnapshot")));
        analysis.setFinalRecommendation(firstNonBlank(text(item, "finalRecommendation"), analysis.getFinalRecommendation()));
        analysis.setAnalysisTime(firstNonNull(task.getSavedAt(), Instant.now()));
        analysis.setLastTaskKey(task.getTaskKey());
        analysis.setRawPayloadJson(jsonSupport.writeNode(item));
        leadDeepAnalysisRepository.save(analysis);
    }

    private void saveResultItem(Long taskId, Long leadId, String resultType, String sourceBucket, Integer rankOrder, String title, JsonNode payload) {
        AgentTaskResultEntity entity = new AgentTaskResultEntity();
        entity.setAgentTaskId(taskId);
        entity.setLeadId(leadId);
        entity.setResultType(resultType);
        entity.setSourceBucket(sourceBucket);
        entity.setRankOrder(rankOrder);
        entity.setTitle(title);
        entity.setPayloadJson(jsonSupport.writeNode(payload));
        agentTaskResultRepository.save(entity);
    }

    private Path resolveTaskFile(ImportTaskResultRequest request) {
        if (!isBlank(request.filePath())) {
            Path path = Paths.get(request.filePath()).normalize();
            if (!Files.exists(path)) {
                throw new BadRequestException("文件不存在: " + path);
            }
            return path;
        }

        if (isBlank(request.taskKey())) {
            throw new BadRequestException("taskKey 不能为空");
        }
        Path path = Paths.get(storageProperties.taskResultsDir(), request.taskKey() + ".json").normalize();
        if (!Files.exists(path)) {
            throw new BadRequestException("未找到任务结果文件: " + path);
        }
        return path;
    }

    private JsonNode readJson(Path filePath) {
        try {
            return jsonSupport.readTree(Files.readString(filePath, StandardCharsets.UTF_8));
        } catch (IOException ex) {
            throw new IllegalStateException("读取任务结果文件失败: " + filePath, ex);
        }
    }

    private Long findLeadIdByExternalLeadId(String externalLeadId) {
        if (isBlank(externalLeadId)) {
            return null;
        }
        return leadRepository.findByExternalLeadId(externalLeadId).map(LeadEntity::getId).orElse(null);
    }

    private String normalizeTitle(JsonNode item) {
        return firstNonBlank(text(item, "normalizedTitle"), text(item, "title"));
    }

    private String resolveInvestigationLeadUrl(JsonNode item) {
        JsonNode relatedLinks = item.path("relatedLinks");
        if (relatedLinks.isArray()) {
            for (JsonNode link : relatedLinks) {
                String type = text(link, "type");
                String url = text(link, "url");
                if ("main".equalsIgnoreCase(type) && !isBlank(url)) {
                    return url;
                }
            }
            for (JsonNode link : relatedLinks) {
                String url = text(link, "url");
                if (!isBlank(url)) {
                    return url;
                }
            }
        }

        JsonNode mainLinks = item.path("sourceLinksByType").path("main");
        if (mainLinks.isArray()) {
            for (JsonNode link : mainLinks) {
                if (link.isTextual() && !isBlank(link.asText())) {
                    return link.asText().trim();
                }
            }
        }
        return null;
    }

    private String buildDedupeKey(String url, String normalizedTitle, String organizationName, String sourceDomain) {
        String raw = normalizeForKey(url) + "|" + normalizeForKey(normalizedTitle) + "|" + normalizeForKey(organizationName) + "|" + normalizeForKey(sourceDomain);
        return sha256(raw);
    }

    private String normalizeForKey(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] encoded = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(encoded.length * 2);
            for (byte current : encoded) {
                builder.append(String.format("%02x", current));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 不可用", ex);
        }
    }

    private Double computeRawCompositeScore(Double aiFitScore, Double maturityScore, Double deepAnalysisScore, Double fallbackScore) {
        boolean hasBaseScores = aiFitScore != null && maturityScore != null;
        boolean hasDeepScore = deepAnalysisScore != null && deepAnalysisScore > 0;

        if (hasBaseScores && hasDeepScore) {
            return clampScore(aiFitScore * 0.4 + maturityScore * 0.4 + deepAnalysisScore * 0.2);
        }
        if (fallbackScore != null) {
            return clampScore(fallbackScore);
        }
        if (hasBaseScores) {
            return clampScore(aiFitScore * 0.5 + maturityScore * 0.5);
        }
        if (hasDeepScore) {
            return clampScore(deepAnalysisScore);
        }
        return null;
    }

    private Double upliftCompositeScore(Double rawScore) {
        if (rawScore == null) {
            return null;
        }
        return clampScore(80 + rawScore * 0.2);
    }

    private Double clampScore(Double score) {
        if (score == null) {
            return null;
        }
        return Math.max(0, Math.min(100, score));
    }

    private String resolveExpiryStatus(String timeWindowStatus, Boolean withinTimeWindow) {
        if ("out_of_window".equals(timeWindowStatus) || Boolean.FALSE.equals(withinTimeWindow)) {
            return "已过期";
        }
        if ("in_window".equals(timeWindowStatus) || Boolean.TRUE.equals(withinTimeWindow)) {
            return "有效";
        }
        return "待复评";
    }

    private String defaultLeadStatus(Boolean shouldEnterPool) {
        return Boolean.TRUE.equals(shouldEnterPool) ? "待跟进" : "待研判";
    }

    private String stripExtension(String fileName) {
        int index = fileName.lastIndexOf('.');
        return index >= 0 ? fileName.substring(0, index) : fileName;
    }

    private String text(JsonNode node, String fieldName) {
        JsonNode child = node.path(fieldName);
        if (child.isMissingNode() || child.isNull()) {
            return null;
        }
        String value = child.asText();
        return isBlank(value) || "null".equalsIgnoreCase(value) ? null : value;
    }

    private Integer integer(JsonNode node, String fieldName) {
        JsonNode child = node.path(fieldName);
        return child.isNumber() ? child.intValue() : null;
    }

    private Boolean bool(JsonNode node, String fieldName) {
        JsonNode child = node.path(fieldName);
        return child.isBoolean() ? child.booleanValue() : null;
    }

    private Double doubleValue(JsonNode node, String fieldName) {
        JsonNode child = node.path(fieldName);
        return child.isNumber() ? child.doubleValue() : null;
    }

    private Instant parseInstant(String value) {
        if (isBlank(value)) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException ignored) {
        }
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (DateTimeParseException ignored) {
        }
        try {
            return LocalDate.parse(value).atStartOfDay().toInstant(ZoneOffset.UTC);
        } catch (DateTimeParseException ignored) {
        }
        return null;
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (!isBlank(value)) {
                return value.trim();
            }
        }
        return null;
    }

    @SafeVarargs
    private final <T> T firstNonNull(T... values) {
        if (values == null) {
            return null;
        }
        for (T value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
