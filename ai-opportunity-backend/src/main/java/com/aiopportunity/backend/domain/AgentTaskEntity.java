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
@Table(name = "agent_task")
public class AgentTaskEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_key", nullable = false, unique = true, length = 128)
    private String taskKey;

    @Column(name = "task_type", nullable = false, length = 64)
    private String taskType;

    @Column(name = "original_task_type", length = 64)
    private String originalTaskType;

    @Column(name = "model_name", length = 128)
    private String modelName;

    @Column(name = "saved_at")
    private Instant savedAt;

    @Lob
    @Column(name = "prompt_text")
    private String promptText;

    @Column(name = "input_file", length = 512)
    private String inputFile;

    @Lob
    @Column(name = "task_message")
    private String taskMessage;

    @Column(name = "attempt_count")
    private Integer attemptCount;

    @Column(name = "stopped_by_user")
    private Boolean stoppedByUser;

    @Column(name = "completed")
    private Boolean completed;

    @Column(name = "task_state", length = 64)
    private String taskState;

    @Column(name = "resumable")
    private Boolean resumable;

    @Column(name = "resume_key", length = 128)
    private String resumeKey;

    @Lob
    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "token_input")
    private Integer tokenInput;

    @Column(name = "token_output")
    private Integer tokenOutput;

    @Column(name = "parsed")
    private Boolean parsed;

    @Lob
    @Column(name = "result_payload_json", nullable = false)
    private String resultPayloadJson;

    @Lob
    @Column(name = "raw_text")
    private String rawText;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Long getId() {
        return id;
    }

    public String getTaskKey() {
        return taskKey;
    }

    public void setTaskKey(String taskKey) {
        this.taskKey = taskKey;
    }

    public String getTaskType() {
        return taskType;
    }

    public void setTaskType(String taskType) {
        this.taskType = taskType;
    }

    public String getOriginalTaskType() {
        return originalTaskType;
    }

    public void setOriginalTaskType(String originalTaskType) {
        this.originalTaskType = originalTaskType;
    }

    public String getModelName() {
        return modelName;
    }

    public void setModelName(String modelName) {
        this.modelName = modelName;
    }

    public Instant getSavedAt() {
        return savedAt;
    }

    public void setSavedAt(Instant savedAt) {
        this.savedAt = savedAt;
    }

    public String getPromptText() {
        return promptText;
    }

    public void setPromptText(String promptText) {
        this.promptText = promptText;
    }

    public String getInputFile() {
        return inputFile;
    }

    public void setInputFile(String inputFile) {
        this.inputFile = inputFile;
    }

    public String getTaskMessage() {
        return taskMessage;
    }

    public void setTaskMessage(String taskMessage) {
        this.taskMessage = taskMessage;
    }

    public Integer getAttemptCount() {
        return attemptCount;
    }

    public void setAttemptCount(Integer attemptCount) {
        this.attemptCount = attemptCount;
    }

    public Boolean getStoppedByUser() {
        return stoppedByUser;
    }

    public void setStoppedByUser(Boolean stoppedByUser) {
        this.stoppedByUser = stoppedByUser;
    }

    public Boolean getCompleted() {
        return completed;
    }

    public void setCompleted(Boolean completed) {
        this.completed = completed;
    }

    public String getTaskState() {
        return taskState;
    }

    public void setTaskState(String taskState) {
        this.taskState = taskState;
    }

    public Boolean getResumable() {
        return resumable;
    }

    public void setResumable(Boolean resumable) {
        this.resumable = resumable;
    }

    public String getResumeKey() {
        return resumeKey;
    }

    public void setResumeKey(String resumeKey) {
        this.resumeKey = resumeKey;
    }

    public String getFailureReason() {
        return failureReason;
    }

    public void setFailureReason(String failureReason) {
        this.failureReason = failureReason;
    }

    public Integer getTokenInput() {
        return tokenInput;
    }

    public void setTokenInput(Integer tokenInput) {
        this.tokenInput = tokenInput;
    }

    public Integer getTokenOutput() {
        return tokenOutput;
    }

    public void setTokenOutput(Integer tokenOutput) {
        this.tokenOutput = tokenOutput;
    }

    public Boolean getParsed() {
        return parsed;
    }

    public void setParsed(Boolean parsed) {
        this.parsed = parsed;
    }

    public String getResultPayloadJson() {
        return resultPayloadJson;
    }

    public void setResultPayloadJson(String resultPayloadJson) {
        this.resultPayloadJson = resultPayloadJson;
    }

    public String getRawText() {
        return rawText;
    }

    public void setRawText(String rawText) {
        this.rawText = rawText;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
