package com.aiopportunity.backend.service;

import java.util.List;
import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aiopportunity.backend.domain.AgentTaskEntity;
import com.aiopportunity.backend.domain.AgentTaskResultEntity;
import com.aiopportunity.backend.exception.ResourceNotFoundException;
import com.aiopportunity.backend.repository.AgentTaskRepository;
import com.aiopportunity.backend.repository.AgentTaskResultRepository;
import com.aiopportunity.backend.web.dto.AgentTaskDetailResponse;
import com.aiopportunity.backend.web.dto.AgentTaskResultItemResponse;
import com.aiopportunity.backend.web.dto.AgentTaskSummaryResponse;
import com.aiopportunity.backend.web.dto.PagedResponse;

@Service
public class AgentTaskQueryService {

    private final AgentTaskRepository agentTaskRepository;
    private final AgentTaskResultRepository agentTaskResultRepository;
    private final JsonSupport jsonSupport;

    public AgentTaskQueryService(
            AgentTaskRepository agentTaskRepository,
            AgentTaskResultRepository agentTaskResultRepository,
            JsonSupport jsonSupport
    ) {
        this.agentTaskRepository = agentTaskRepository;
        this.agentTaskResultRepository = agentTaskResultRepository;
        this.jsonSupport = jsonSupport;
    }

    @Transactional(readOnly = true)
    public PagedResponse<AgentTaskSummaryResponse> listTasks(int page, int size) {
        var result = agentTaskRepository.findAllByOrderBySavedAtDesc(
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "savedAt"))
        );
        List<AgentTaskSummaryResponse> content = result.getContent().stream()
                .map(this::toSummary)
                .toList();
        return new PagedResponse<>(content, result.getTotalElements(), result.getTotalPages(), result.getNumber(), result.getSize());
    }

    @Transactional(readOnly = true)
    public AgentTaskDetailResponse getTaskDetail(Long id) {
        AgentTaskEntity task = agentTaskRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("任务不存在: " + id));
        List<AgentTaskResultItemResponse> items = agentTaskResultRepository.findAllByAgentTaskIdOrderByIdAsc(id).stream()
                .map(this::toItem)
                .toList();

        return new AgentTaskDetailResponse(
                task.getId(),
                task.getTaskKey(),
                task.getTaskType(),
                task.getOriginalTaskType(),
                task.getModelName(),
                task.getSavedAt(),
                task.getPromptText(),
                task.getInputFile(),
                task.getTaskMessage(),
                task.getAttemptCount(),
                task.getStoppedByUser(),
                task.getCompleted(),
                task.getTaskState(),
                task.getResumable(),
                task.getResumeKey(),
                task.getFailureReason(),
                task.getTokenInput(),
                task.getTokenOutput(),
                task.getParsed(),
                jsonSupport.toObjectMap(task.getResultPayloadJson()),
                items,
                task.getCreatedAt(),
                task.getUpdatedAt()
        );
    }

    private AgentTaskSummaryResponse toSummary(AgentTaskEntity task) {
        return new AgentTaskSummaryResponse(
                task.getId(),
                task.getTaskKey(),
                task.getTaskType(),
                task.getOriginalTaskType(),
                task.getModelName(),
                task.getSavedAt(),
                task.getParsed(),
                task.getCompleted(),
                task.getTaskState(),
                task.getAttemptCount(),
                task.getTokenInput(),
                task.getTokenOutput(),
                task.getCreatedAt()
        );
    }

    private AgentTaskResultItemResponse toItem(AgentTaskResultEntity entity) {
        Map<String, Object> payload = jsonSupport.toObjectMap(entity.getPayloadJson());
        if (payload.isEmpty() && entity.getPayloadJson() != null && entity.getPayloadJson().trim().startsWith("[")) {
            payload = Map.of("items", jsonSupport.toObjectList(entity.getPayloadJson()));
        }
        return new AgentTaskResultItemResponse(
                entity.getId(),
                entity.getLeadId(),
                entity.getResultType(),
                entity.getSourceBucket(),
                entity.getRankOrder(),
                entity.getTitle(),
                payload
        );
    }
}
