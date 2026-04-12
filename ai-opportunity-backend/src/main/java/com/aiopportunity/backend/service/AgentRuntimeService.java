package com.aiopportunity.backend.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.concurrent.CompletableFuture;

import org.springframework.stereotype.Service;

import com.aiopportunity.backend.config.AgentRuntimeProperties;
import com.aiopportunity.backend.config.AppStorageProperties;
import com.aiopportunity.backend.exception.BadRequestException;
import com.aiopportunity.backend.exception.ResourceNotFoundException;
import com.aiopportunity.backend.web.dto.AgentConfigItemResponse;
import com.aiopportunity.backend.web.dto.AgentKeywordSubscriptionOptionResponse;
import com.aiopportunity.backend.web.dto.AgentRuntimeConfigResponse;
import com.aiopportunity.backend.web.dto.AgentRuntimeConfigUpdateRequest;
import com.aiopportunity.backend.web.dto.AgentRuntimeLogsResponse;
import com.aiopportunity.backend.web.dto.AgentRuntimeStartRequest;
import com.aiopportunity.backend.web.dto.AgentRuntimeStartResponse;
import com.aiopportunity.backend.web.dto.AgentRuntimeStatusResponse;
import com.aiopportunity.backend.web.dto.AgentRuntimeStopResponse;
import com.aiopportunity.backend.web.dto.AgentSignalSourceOptionResponse;
import com.aiopportunity.backend.web.dto.CreateAgentKeywordSubscriptionRequest;
import com.aiopportunity.backend.web.dto.CreateAgentSignalSourceRequest;
import com.aiopportunity.backend.web.dto.ImportTaskResultRequest;
import com.aiopportunity.backend.web.dto.ImportTaskResultResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class AgentRuntimeService {

    private static final DateTimeFormatter LOG_FILE_TIME_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH-mm-ss-SSS'Z'").withZone(ZoneOffset.UTC);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final Pattern ENV_LINE_PATTERN = Pattern.compile("^\\s*([A-Z0-9_]+)=(.*)$");
    private static final Pattern TARGET_POOL_PATTERN = Pattern.compile("(targetPoolEntryCount\\s*:\\s*)(\\d+)");
    private static final Pattern OPPORTUNITY_MODE_PATTERN = Pattern.compile("(mode\\s*:\\s*\")([^\"]+)(\")");
    private static final Pattern SINGLE_SUBSCRIPTION_PATTERN =
            Pattern.compile("(singleSubscriptionId\\s*:\\s*\")([^\"]*)(\")");
    private static final String AUTO_RUN_INVESTIGATION_AFTER_SCREENING_ENV_KEY =
            "AUTO_RUN_INVESTIGATION_AFTER_SCREENING";
    private static final List<String> ENV_KEYS = List.of(
            "OPENAI_API_KEY",
            "OPENAI_BASE_URL",
            "ANTHROPIC_API_KEY",
            "ANTHROPIC_BASE_URL",
            "TAVILY_API_KEY",
            "MINI_CLAUDE_MODEL"
    );
    private static final String SCREENING_CONFIG_RELATIVE_PATH = "src/config/screening-config.ts";
    private static final String SCREENING_CONFIG_DIST_RELATIVE_PATH = "dist/config/screening-config.js";
    private static final String SIGNAL_CONFIG_RELATIVE_PATH = "src/config/signal-config.ts";
    private static final String SIGNAL_CONFIG_DIST_RELATIVE_PATH = "dist/config/signal-config.js";
    private static final String SIGNAL_SOURCE_PROFILES_CONST = "SIGNAL_SOURCE_PROFILES";
    private static final String KEYWORD_SUBSCRIPTIONS_CONST = "KEYWORD_SUBSCRIPTIONS";
    private static final String SCREENING_OPPORTUNITY_CONST = "SCREENING_OPPORTUNITY_TYPE_CONFIG";
    private static final String SCREENING_SOURCE_PROFILE_CONST = "SCREENING_SOURCE_PROFILE_CONFIG";
    private static final String SCREENING_EXTRA_KEYWORDS_CONST = "SCREENING_EXTRA_KEYWORDS";
    private static final long RUNNING_IMPORT_POLL_INTERVAL_MS = 5_000L;

    private final AgentRuntimeProperties properties;
    private final AppStorageProperties storageProperties;
    private final TaskResultImportService taskResultImportService;

    private final Object processLock = new Object();
    private volatile Process runningProcess;
    private volatile String runningTaskType;
    private volatile String runningPromptPreview;
    private volatile Instant startedAt;
    private volatile Instant finishedAt;
    private volatile Integer exitCode;
    private volatile Path currentLogFile;
    private volatile String lastImportedTaskKey;
    private volatile Instant lastImportedAt;
    private volatile Boolean lastImportSucceeded;
    private volatile String lastImportMessage;
    private volatile Path lastImportedResultFile;
    private volatile Instant lastImportedResultModifiedAt;
    private volatile Boolean autoInvestigationScheduled;
    private volatile RunExecutionContext currentRunContext;

    private record ScreeningSignalConfig(
            String opportunityMode,
            List<String> subscriptionIds,
            List<String> sourceProfileIds,
            List<String> extraKeywords,
            List<AgentSignalSourceOptionResponse> signalSourceOptions,
            List<AgentKeywordSubscriptionOptionResponse> keywordSubscriptionOptions
    ) {
    }

    private record RunExecutionContext(
            String taskType,
            String prompt,
            String inputFile,
            String model,
            Boolean thinking,
            Boolean bypassPermissions,
            boolean runInvestigationAfterScreening
    ) {
    }

    private record TaskImportOutcome(
            String taskKey,
            boolean success,
            String message
    ) {
    }

    private record ScreeningPoolLead(
            String title,
            String url,
            String ownerOrg,
            String poolEntryTier,
            Double compositeScore
    ) {
    }

    public AgentRuntimeService(
            AgentRuntimeProperties properties,
            AppStorageProperties storageProperties,
            TaskResultImportService taskResultImportService
    ) {
        this.properties = properties;
        this.storageProperties = storageProperties;
        this.taskResultImportService = taskResultImportService;
    }

    public AgentRuntimeStatusResponse getStatus() {
        synchronized (processLock) {
            boolean running = runningProcess != null && runningProcess.isAlive();
            Long pid = running ? runningProcess.pid() : null;
            return new AgentRuntimeStatusResponse(
                    running,
                    pid,
                    runningTaskType,
                    runningPromptPreview,
                    fileName(currentLogFile),
                    pathString(currentLogFile),
                    startedAt,
                    finishedAt,
                    exitCode,
                    autoInvestigationScheduled,
                    lastImportedTaskKey,
                    lastImportedAt,
                    lastImportSucceeded,
                    lastImportMessage
            );
        }
    }

    public AgentRuntimeStartResponse start(AgentRuntimeStartRequest request) {
        synchronized (processLock) {
            if (runningProcess != null && runningProcess.isAlive()) {
                throw new BadRequestException("当前已有 Agent 任务在运行，请先停止或等待结束。");
            }

            Path agentDir = resolveAgentDir();
            Path cliPath = agentDir.resolve("dist").resolve("cli.js");
            if (!Files.exists(cliPath)) {
                throw new ResourceNotFoundException("未找到 Agent 运行入口: " + cliPath);
            }

            if ("screening".equalsIgnoreCase(request.taskType())) {
                updateScreeningSignalConfig(
                        request.screeningOpportunityMode(),
                        request.subscriptionIds(),
                        request.sourceProfileIds(),
                        request.extraKeywords()
                );
            }

            Path logDir = resolveLogsDir();
            ensureDirectory(logDir);

            String logFileName = LOG_FILE_TIME_FORMATTER.format(Instant.now()) + "_" + request.taskType() + ".log";
            Path logFile = logDir.resolve(logFileName);
            boolean runInvestigationAfterScreening = isAutoInvestigationEnabled(request);

            try {
                return startProcess(
                        request,
                        logFileName,
                        logFile,
                        runInvestigationAfterScreening,
                        true,
                        runInvestigationAfterScreening
                                ? "初筛运行中，完成后将自动导入，并继续发起深查。"
                                : "任务运行中，等待完成后自动导入数据库。"
                );
            } catch (IOException ex) {
                throw new BadRequestException("启动 Agent 失败: " + ex.getMessage());
            }
        }
    }

    public AgentRuntimeStopResponse stop() {
        synchronized (processLock) {
            if (runningProcess == null || !runningProcess.isAlive()) {
                return new AgentRuntimeStopResponse(false, null);
            }

            long pid = runningProcess.pid();
            autoInvestigationScheduled = false;
            runningProcess.destroy();
            return new AgentRuntimeStopResponse(true, pid);
        }
    }

    public AgentRuntimeConfigResponse getConfig() {
        Path agentDir = resolveAgentDir();
        Path envFile = agentDir.resolve(".env");
        Map<String, String> envMap = readEnvFile(envFile);
        boolean runInvestigationAfterScreening = readAutoInvestigationAfterScreening(envMap);
        Integer targetPoolEntryCount = readTargetPoolEntryCount(agentDir.resolve(SCREENING_CONFIG_RELATIVE_PATH));
        ScreeningSignalConfig screeningSignalConfig = readScreeningSignalConfig();

        List<AgentConfigItemResponse> envItems = ENV_KEYS.stream()
                .map(key -> {
                    String value = envMap.get(key);
                    boolean secret = key.endsWith("_API_KEY");
                    return new AgentConfigItemResponse(
                            key,
                            secret ? maskSecret(value) : value,
                            secret,
                            value != null && !value.isBlank()
                    );
                })
                .toList();

        return new AgentRuntimeConfigResponse(
                agentDir.toAbsolutePath().toString(),
                envFile.toAbsolutePath().toString(),
                resolveLogsDir().toAbsolutePath().toString(),
                nodeCommand(),
                runInvestigationAfterScreening,
                targetPoolEntryCount,
                screeningSignalConfig.opportunityMode(),
                screeningSignalConfig.subscriptionIds(),
                screeningSignalConfig.sourceProfileIds(),
                screeningSignalConfig.extraKeywords(),
                screeningSignalConfig.signalSourceOptions(),
                screeningSignalConfig.keywordSubscriptionOptions(),
                envItems
        );
    }

    public AgentRuntimeConfigResponse updateConfig(AgentRuntimeConfigUpdateRequest request) {
        Path agentDir = resolveAgentDir();
        Map<String, String> envUpdates = new LinkedHashMap<>();
        envUpdates.put("OPENAI_API_KEY", normalizeConfigValue(request.openAiApiKey()));
        envUpdates.put("OPENAI_BASE_URL", normalizeConfigValue(request.openAiBaseUrl()));
        envUpdates.put("ANTHROPIC_API_KEY", normalizeConfigValue(request.anthropicApiKey()));
        envUpdates.put("ANTHROPIC_BASE_URL", normalizeConfigValue(request.anthropicBaseUrl()));
        envUpdates.put("TAVILY_API_KEY", normalizeConfigValue(request.tavilyApiKey()));
        envUpdates.put("MINI_CLAUDE_MODEL", normalizeConfigValue(request.defaultModel()));
        if (request.runInvestigationAfterScreening() != null) {
            envUpdates.put(
                    AUTO_RUN_INVESTIGATION_AFTER_SCREENING_ENV_KEY,
                    String.valueOf(request.runInvestigationAfterScreening())
            );
        }
        updateEnvFile(agentDir.resolve(".env"), envUpdates);

        if (request.targetPoolEntryCount() != null) {
            updateTargetPoolEntryCount(request.targetPoolEntryCount());
        }

        if (request.screeningOpportunityMode() != null
                || request.screeningSubscriptionIds() != null
                || request.screeningSourceProfileIds() != null
                || request.screeningExtraKeywords() != null) {
            updateScreeningSignalConfig(
                    request.screeningOpportunityMode(),
                    request.screeningSubscriptionIds(),
                    request.screeningSourceProfileIds(),
                    request.screeningExtraKeywords()
            );
        }

        return getConfig();
    }

    public AgentRuntimeConfigResponse addSignalSource(CreateAgentSignalSourceRequest request) {
        ScreeningSignalConfig currentConfig = readScreeningSignalConfig();
        String sourceId = resolveCustomId(
                request.id(),
                request.label(),
                "custom_source",
                currentConfig.signalSourceOptions().stream().map(AgentSignalSourceOptionResponse::id).toList()
        );

        appendObjectToSignalConfigArray(
                SIGNAL_SOURCE_PROFILES_CONST,
                buildSignalSourceObjectValue(
                        sourceId,
                        request.label(),
                        request.description(),
                        sanitizeTextList(request.searchScopes()),
                        sanitizeTextList(request.documentTypes()),
                        sanitizeTextList(request.includeDomains()),
                        sanitizeTextList(request.excludeDomains()),
                        sanitizeTextList(request.queryHints())
                )
        );

        return getConfig();
    }

    public AgentRuntimeConfigResponse addKeywordSubscription(CreateAgentKeywordSubscriptionRequest request) {
        ScreeningSignalConfig currentConfig = readScreeningSignalConfig();
        String subscriptionId = resolveCustomId(
                request.id(),
                request.label(),
                "custom_subscription",
                currentConfig.keywordSubscriptionOptions().stream()
                        .map(AgentKeywordSubscriptionOptionResponse::id)
                        .toList()
        );
        List<String> allowedSourceIds = currentConfig.signalSourceOptions().stream()
                .map(AgentSignalSourceOptionResponse::id)
                .toList();
        List<String> keywords = sanitizeTextList(request.keywords());
        if (keywords.isEmpty()) {
            throw new BadRequestException("关键词订阅至少需要 1 个关键词");
        }

        appendObjectToSignalConfigArray(
                KEYWORD_SUBSCRIPTIONS_CONST,
                buildKeywordSubscriptionObjectValue(
                        subscriptionId,
                        request.label(),
                        request.description(),
                        keywords,
                        sanitizeIds(request.preferredSourceProfileIds(), allowedSourceIds)
                )
        );

        return getConfig();
    }

    public AgentRuntimeLogsResponse getLogs(int lines) {
        Path logFile = resolveLatestLogFile();
        if (logFile == null) {
            return new AgentRuntimeLogsResponse(
                    null,
                    resolveLogsDir().toAbsolutePath().toString(),
                    false,
                    null,
                    List.of()
            );
        }

        List<String> allLines = readAllLines(logFile);
        int safeLines = Math.max(1, Math.min(lines, 500));
        int fromIndex = Math.max(0, allLines.size() - safeLines);
        List<String> tail = allLines.subList(fromIndex, allLines.size());

        boolean running = currentLogFile != null
                && currentLogFile.equals(logFile)
                && runningProcess != null
                && runningProcess.isAlive();

        return new AgentRuntimeLogsResponse(
                logFile.getFileName().toString(),
                logFile.toAbsolutePath().toString(),
                running,
                lastModifiedTime(logFile),
                tail
        );
    }

    private TaskImportOutcome importTaskResultFile(Path taskResultFile) {
        String taskKey = stripExtension(taskResultFile.getFileName().toString());

        try {
            ImportTaskResultResponse response = taskResultImportService.importTaskResult(
                    new ImportTaskResultRequest(taskKey, taskResultFile.toString())
            );
            rememberImportedResultFile(taskResultFile);
            return new TaskImportOutcome(
                    response.taskKey(),
                    true,
                    "已自动导入数据库，导入线索 " + response.importedLeadCount() + " 条。"
            );
        } catch (Exception ex) {
            rememberImportedResultFile(taskResultFile);
            return new TaskImportOutcome(taskKey, false, "自动导入失败: " + ex.getMessage());
        }
    }

    private TaskImportOutcome importLatestTaskResultForCompletedRun(String taskType, Instant runStartedAt) {
        Path latestResultFile = resolveLatestTaskResultFile(taskType, runStartedAt);
        if (latestResultFile == null) {
            return new TaskImportOutcome(null, false, "任务已结束，但未找到可导入的结果文件。");
        }

        return importTaskResultFile(latestResultFile);
    }

    private void pollAndImportWhileRunning(Process process, RunExecutionContext context, Instant runStartedAt) {
        while (process.isAlive()) {
            try {
                Path latestResultFile = resolveLatestTaskResultFile(context.taskType(), runStartedAt);
                if (latestResultFile != null && shouldImportUpdatedResultFile(latestResultFile)) {
                    TaskImportOutcome importOutcome = importTaskResultFile(latestResultFile);
                    markImportResult(
                            importOutcome.taskKey(),
                            importOutcome.success(),
                            "运行中增量导入: " + importOutcome.message()
                    );
                }
                Thread.sleep(RUNNING_IMPORT_POLL_INTERVAL_MS);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception ex) {
                markImportResult(lastImportedTaskKey, false, "运行中自动导入失败: " + ex.getMessage());
                try {
                    Thread.sleep(RUNNING_IMPORT_POLL_INTERVAL_MS);
                } catch (InterruptedException interruptedException) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    private boolean shouldImportUpdatedResultFile(Path taskResultFile) {
        Instant modifiedAt = lastModifiedTime(taskResultFile);
        synchronized (processLock) {
            if (lastImportedResultFile == null || lastImportedResultModifiedAt == null) {
                return true;
            }
            if (!lastImportedResultFile.equals(taskResultFile)) {
                return true;
            }
            return modifiedAt.isAfter(lastImportedResultModifiedAt);
        }
    }

    private void rememberImportedResultFile(Path taskResultFile) {
        synchronized (processLock) {
            lastImportedResultFile = taskResultFile;
            lastImportedResultModifiedAt = lastModifiedTime(taskResultFile);
        }
    }

    private void handleProcessExit(Process completed, RunExecutionContext context, Instant runStartedAt) {
        synchronized (processLock) {
            finishedAt = Instant.now();
            exitCode = completed.exitValue();
            if (runningProcess != null && runningProcess.pid() == completed.pid()) {
                runningProcess = null;
            }
            currentRunContext = null;
            autoInvestigationScheduled = false;
        }

        TaskImportOutcome importOutcome = importLatestTaskResultForCompletedRun(context.taskType(), runStartedAt);
        if (importOutcome.success()) {
            String completionMessage = completed.exitValue() == 0
                    ? importOutcome.message()
                    : "任务退出码为 " + completed.exitValue() + "，但已保留并导入最近一次可保存结果。";
            markImportResult(importOutcome.taskKey(), true, completionMessage);
        } else if (completed.exitValue() != 0) {
            if (Boolean.TRUE.equals(lastImportSucceeded) && lastImportedTaskKey != null) {
                markImportResult(
                        lastImportedTaskKey,
                        true,
                        "任务退出码为 " + completed.exitValue() + "，但运行中已导入最近一次可保存结果。"
                );
                return;
            }
            markImportResult(
                    importOutcome.taskKey(),
                    false,
                    "任务退出码为 " + completed.exitValue() + "，且最终导入失败: " + importOutcome.message()
            );
            return;
        } else {
            markImportResult(importOutcome.taskKey(), false, importOutcome.message());
            return;
        }

        if (!importOutcome.success()
                || !"screening".equalsIgnoreCase(context.taskType())
                || !context.runInvestigationAfterScreening()
                || importOutcome.taskKey() == null) {
            return;
        }

        try {
            String prompt = buildAutoInvestigationPrompt(importOutcome.taskKey());
            synchronized (processLock) {
                String logFileName = LOG_FILE_TIME_FORMATTER.format(Instant.now()) + "_investigation.log";
                Path logFile = resolveLogsDir().resolve(logFileName);
                AgentRuntimeStartRequest autoRequest = new AgentRuntimeStartRequest(
                        "investigation",
                        prompt,
                        null,
                        context.model(),
                        false,
                        null,
                        null,
                        null,
                        null,
                        context.thinking(),
                        context.bypassPermissions()
                );
                startProcess(
                        autoRequest,
                        logFileName,
                        logFile,
                        false,
                        false,
                        "自动深查运行中，完成后会自动导入数据库。"
                );
            }
            markImportResult(importOutcome.taskKey(), true, "初筛已导入，自动深查已启动。");
        } catch (Exception ex) {
            markImportResult(
                    importOutcome.taskKey(),
                    true,
                    "初筛已导入，但自动深查未启动成功: " + ex.getMessage()
            );
        }
    }

    private AgentRuntimeStartResponse startProcess(
            AgentRuntimeStartRequest request,
            String logFileName,
            Path logFile,
            boolean runInvestigationAfterScreening,
            boolean clearLastImportState,
            String runningMessage
    ) throws IOException {
        List<String> command = buildCommand(request);
        ProcessBuilder processBuilder = new ProcessBuilder(command)
                .directory(resolveAgentDir().toFile())
                .redirectErrorStream(true)
                .redirectOutput(logFile.toFile());

        Process process = processBuilder.start();
        Instant runStartedAt = Instant.now();
        RunExecutionContext context = new RunExecutionContext(
                request.taskType(),
                request.prompt(),
                request.inputFile(),
                request.model(),
                request.thinking(),
                request.bypassPermissions(),
                runInvestigationAfterScreening
        );

        runningProcess = process;
        runningTaskType = request.taskType();
        runningPromptPreview = buildPromptPreview(request.prompt(), request.inputFile());
        startedAt = runStartedAt;
        finishedAt = null;
        exitCode = null;
        currentLogFile = logFile;
        currentRunContext = context;
        autoInvestigationScheduled = "screening".equalsIgnoreCase(request.taskType()) && runInvestigationAfterScreening;
        lastImportedResultFile = null;
        lastImportedResultModifiedAt = null;
        if (clearLastImportState) {
            lastImportedTaskKey = null;
            lastImportedAt = null;
            lastImportSucceeded = null;
            lastImportMessage = runningMessage;
        }

        CompletableFuture.runAsync(() -> pollAndImportWhileRunning(process, context, runStartedAt));
        process.onExit().thenAccept(completed -> handleProcessExit(completed, context, runStartedAt));

        return new AgentRuntimeStartResponse(
                true,
                process.pid(),
                request.taskType(),
                runningPromptPreview,
                logFileName,
                logFile.toAbsolutePath().toString(),
                startedAt
        );
    }

    private List<String> buildCommand(AgentRuntimeStartRequest request) {
        List<String> command = new ArrayList<>();
        command.add(nodeCommand());
        command.add("dist/cli.js");
        command.add("--dont-ask");
        command.add("--task-type");
        command.add(request.taskType());

        if (Boolean.TRUE.equals(request.bypassPermissions())) {
            command.add("--yolo");
        }
        if (Boolean.TRUE.equals(request.thinking())) {
            command.add("--thinking");
        }
        if (request.model() != null && !request.model().isBlank()) {
            command.add("--model");
            command.add(request.model().trim());
        }
        if (request.inputFile() != null && !request.inputFile().isBlank()) {
            command.add("--input-file");
            command.add(request.inputFile().trim());
        }
        if (request.prompt() != null && !request.prompt().isBlank()) {
            command.add(request.prompt().trim());
        }
        return command;
    }

    private Path resolveLatestTaskResultFile(String taskType, Instant runStartedAt) {
        Path taskResultsDir = resolveTaskResultsDir();
        if (!Files.exists(taskResultsDir)) {
            return null;
        }

        Instant notBefore = runStartedAt == null ? Instant.EPOCH : runStartedAt.minusSeconds(60);
        String suffix = "_" + taskType + ".json";

        try (var stream = Files.list(taskResultsDir)) {
            return stream
                    .filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().endsWith(suffix))
                    .filter(path -> lastModifiedTime(path).compareTo(notBefore) >= 0)
                    .max(Comparator.comparing(this::lastModifiedTime))
                    .orElse(null);
        } catch (IOException ex) {
            throw new BadRequestException("读取任务结果目录失败: " + ex.getMessage());
        }
    }

    private void markImportResult(String taskKey, boolean success, String message) {
        synchronized (processLock) {
            lastImportedTaskKey = taskKey;
            lastImportedAt = Instant.now();
            lastImportSucceeded = success;
            lastImportMessage = message;
        }
    }

    private boolean isAutoInvestigationEnabled(AgentRuntimeStartRequest request) {
        if (!"screening".equalsIgnoreCase(request.taskType())) {
            return false;
        }
        if (request.runInvestigationAfterScreening() != null) {
            return request.runInvestigationAfterScreening();
        }
        return readAutoInvestigationAfterScreening(readEnvFile(resolveAgentDir().resolve(".env")));
    }

    private boolean readAutoInvestigationAfterScreening(Map<String, String> envMap) {
        String rawValue = envMap.get(AUTO_RUN_INVESTIGATION_AFTER_SCREENING_ENV_KEY);
        if (rawValue == null || rawValue.isBlank()) {
            return true;
        }
        if ("false".equalsIgnoreCase(rawValue.trim())) {
            return false;
        }
        return true;
    }

    private String buildAutoInvestigationPrompt(String screeningTaskKey) {
        List<ScreeningPoolLead> leads = readScreeningPoolLeads(screeningTaskKey);
        if (leads.isEmpty()) {
            throw new BadRequestException("当前初筛结果没有可自动深查的入池线索。");
        }

        StringBuilder prompt = new StringBuilder();
        prompt.append("请只对以下已入池线索做深查，不要重新做全网泛化初筛。")
                .append("保留初筛结论，只补充同源连续性、落地案例、政策支持、预算支持、竞争与落地判断，")
                .append("并输出完整 investigation JSON。")
                .append("sourceScreeningTaskId=")
                .append(screeningTaskKey)
                .append("。");

        for (int index = 0; index < leads.size(); index++) {
            ScreeningPoolLead lead = leads.get(index);
            prompt.append("线索")
                    .append(index + 1)
                    .append("：标题=")
                    .append(defaultString(lead.title()))
                    .append("；URL=")
                    .append(defaultString(lead.url()))
                    .append("；主体=")
                    .append(defaultString(lead.ownerOrg()))
                    .append("；初筛判断=")
                    .append(defaultString(lead.poolEntryTier()))
                    .append("。");
        }

        return prompt.toString();
    }

    private List<ScreeningPoolLead> readScreeningPoolLeads(String screeningTaskKey) {
        Path screeningPoolFile = resolveScreeningPoolFile(screeningTaskKey);
        if (!Files.exists(screeningPoolFile)) {
            throw new ResourceNotFoundException("未找到初筛候选池文件: " + screeningPoolFile);
        }

        Integer targetPoolEntryCount = readTargetPoolEntryCount(resolveAgentDir().resolve(SCREENING_CONFIG_RELATIVE_PATH));
        int limit = targetPoolEntryCount == null || targetPoolEntryCount < 1 ? Integer.MAX_VALUE : targetPoolEntryCount;

        try {
            JsonNode root = OBJECT_MAPPER.readTree(readString(screeningPoolFile));
            if (root == null || !root.isArray()) {
                throw new BadRequestException("初筛候选池文件格式不正确: " + screeningPoolFile);
            }

            List<ScreeningPoolLead> leads = new ArrayList<>();
            for (JsonNode item : root) {
                if (!item.path("shouldEnterPool").asBoolean(false)) {
                    continue;
                }

                leads.add(new ScreeningPoolLead(
                        textValue(item, "title"),
                        textValue(item, "url"),
                        firstNonBlank(
                                textValue(item, "ownerOrg"),
                                textValue(item, "organizationName"),
                                textValue(item, "sourceName")
                        ),
                        firstNonBlank(textValue(item, "poolEntryTier"), textValue(item, "followUpAction")),
                        doubleValue(item, "compositeScore")
                ));
            }

            return leads.stream()
                    .sorted(Comparator.comparing(
                            ScreeningPoolLead::compositeScore,
                            Comparator.nullsLast(Comparator.reverseOrder())
                    ))
                    .limit(limit)
                    .toList();
        } catch (IOException ex) {
            throw new BadRequestException("读取初筛候选池失败: " + ex.getMessage());
        }
    }

    private Path resolveAgentDir() {
        return Paths.get(required(properties.agentDir(), "app.agent.agent-dir")).toAbsolutePath().normalize();
    }

    private Path resolveLogsDir() {
        return Paths.get(required(properties.logsDir(), "app.agent.logs-dir")).toAbsolutePath().normalize();
    }

    private Path resolveTaskResultsDir() {
        return Paths.get(required(storageProperties.taskResultsDir(), "app.storage.task-results-dir"))
                .toAbsolutePath()
                .normalize();
    }

    private Path resolveScreeningPoolFile(String screeningTaskKey) {
        return resolveAgentDir()
                .resolve("data")
                .resolve("screening-pool")
                .resolve(screeningTaskKey + ".json");
    }

    private String nodeCommand() {
        return required(properties.nodeCommand(), "app.agent.node-command");
    }

    private String required(String value, String fieldName) {
        if (value == null || value.trim().isEmpty()) {
            throw new BadRequestException("缺少配置: " + fieldName);
        }
        return value.trim();
    }

    private void ensureDirectory(Path directory) {
        try {
            Files.createDirectories(directory);
        } catch (IOException ex) {
            throw new BadRequestException("创建日志目录失败: " + ex.getMessage());
        }
    }

    private Map<String, String> readEnvFile(Path envFile) {
        if (!Files.exists(envFile)) {
            return new LinkedHashMap<>();
        }

        return readAllLines(envFile).stream()
                .map(ENV_LINE_PATTERN::matcher)
                .filter(Matcher::matches)
                .collect(Collectors.toMap(
                        matcher -> matcher.group(1),
                        matcher -> matcher.group(2),
                        (left, right) -> right,
                        LinkedHashMap::new
                ));
    }

    private void updateEnvFile(Path envFile, Map<String, String> updates) {
        List<String> originalLines = Files.exists(envFile) ? readAllLines(envFile) : new ArrayList<>();
        Map<String, String> sanitizedUpdates = updates.entrySet().stream()
                .filter(entry -> entry.getValue() != null)
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

        if (sanitizedUpdates.isEmpty()) {
            return;
        }

        List<String> rewritten = new ArrayList<>();
        Map<String, Boolean> handledKeys = new LinkedHashMap<>();
        sanitizedUpdates.keySet().forEach(key -> handledKeys.put(key, false));

        for (String line : originalLines) {
            Matcher matcher = ENV_LINE_PATTERN.matcher(line);
            if (!matcher.matches()) {
                rewritten.add(line);
                continue;
            }

            String key = matcher.group(1);
            if (!sanitizedUpdates.containsKey(key)) {
                rewritten.add(line);
                continue;
            }

            rewritten.add(key + "=" + sanitizedUpdates.get(key));
            handledKeys.put(key, true);
        }

        handledKeys.forEach((key, handled) -> {
            if (!handled) {
                rewritten.add(key + "=" + sanitizedUpdates.get(key));
            }
        });

        writeLines(envFile, rewritten);
    }

    private ScreeningSignalConfig readScreeningSignalConfig() {
        String content = readPrimarySignalConfig();
        List<AgentSignalSourceOptionResponse> signalSourceOptions = parseSignalSourceOptions(content);
        List<AgentKeywordSubscriptionOptionResponse> keywordSubscriptionOptions =
                parseKeywordSubscriptionOptions(content);
        List<String> allSubscriptionIds = keywordSubscriptionOptions.stream()
                .map(AgentKeywordSubscriptionOptionResponse::id)
                .toList();
        List<String> allSourceProfileIds = signalSourceOptions.stream()
                .map(AgentSignalSourceOptionResponse::id)
                .toList();

        String opportunityBlock = extractConstValue(content, SCREENING_OPPORTUNITY_CONST, '{');
        String opportunityMode = normalizeSelectionMode(matchFirstGroup(opportunityBlock, OPPORTUNITY_MODE_PATTERN, 2));
        List<String> configuredSubscriptionIds = "single".equals(opportunityMode)
                ? sanitizeIds(
                        nullableList(matchFirstGroup(opportunityBlock, SINGLE_SUBSCRIPTION_PATTERN, 2)),
                        allSubscriptionIds
                )
                : sanitizeIds(parseObjectStringArray(opportunityBlock, "subscriptionIds"), allSubscriptionIds);

        if (configuredSubscriptionIds.isEmpty()) {
            configuredSubscriptionIds = allSubscriptionIds;
        }

        String sourceProfileBlock = extractConstValue(content, SCREENING_SOURCE_PROFILE_CONST, '{');
        List<String> sourceProfileIds = sanitizeIds(
                parseObjectStringArray(sourceProfileBlock, "sourceProfileIds"),
                allSourceProfileIds
        );
        List<String> extraKeywords = sanitizeKeywordList(parseConstStringArray(content, SCREENING_EXTRA_KEYWORDS_CONST));

        return new ScreeningSignalConfig(
                opportunityMode,
                configuredSubscriptionIds,
                sourceProfileIds,
                extraKeywords,
                signalSourceOptions,
                keywordSubscriptionOptions
        );
    }

    private Integer readTargetPoolEntryCount(Path screeningConfigFile) {
        if (!Files.exists(screeningConfigFile)) {
            return null;
        }

        String content = readString(screeningConfigFile);
        Matcher matcher = TARGET_POOL_PATTERN.matcher(content);
        if (!matcher.find()) {
            return null;
        }
        return Integer.parseInt(matcher.group(2));
    }

    private void updateTargetPoolEntryCount(Integer targetPoolEntryCount) {
        if (targetPoolEntryCount == null || targetPoolEntryCount < 1) {
            throw new BadRequestException("targetPoolEntryCount 必须大于等于 1");
        }

        for (Path screeningConfigFile : resolveScreeningConfigFiles()) {
            if (!Files.exists(screeningConfigFile)) {
                continue;
            }

            String content = readString(screeningConfigFile);
            Matcher matcher = TARGET_POOL_PATTERN.matcher(content);
            if (!matcher.find()) {
                throw new BadRequestException("未找到 targetPoolEntryCount 配置项");
            }

            String updated = matcher.replaceFirst("$1" + targetPoolEntryCount);
            writeString(screeningConfigFile, updated);
        }
    }

    private void updateScreeningSignalConfig(
            String opportunityModeInput,
            List<String> subscriptionIdsInput,
            List<String> sourceProfileIdsInput,
            List<String> extraKeywordsInput
    ) {
        ScreeningSignalConfig currentConfig = readScreeningSignalConfig();
        List<String> allSubscriptionIds = currentConfig.keywordSubscriptionOptions().stream()
                .map(AgentKeywordSubscriptionOptionResponse::id)
                .toList();
        List<String> allSourceProfileIds = currentConfig.signalSourceOptions().stream()
                .map(AgentSignalSourceOptionResponse::id)
                .toList();

        String opportunityMode = opportunityModeInput == null
                ? currentConfig.opportunityMode()
                : normalizeSelectionMode(opportunityModeInput);

        List<String> subscriptionIds = subscriptionIdsInput == null
                ? currentConfig.subscriptionIds()
                : sanitizeIds(subscriptionIdsInput, allSubscriptionIds);
        if (subscriptionIds.isEmpty()) {
            subscriptionIds = allSubscriptionIds;
        }

        if ("single".equals(opportunityMode) && !subscriptionIds.isEmpty()) {
            subscriptionIds = List.of(subscriptionIds.get(0));
        }

        List<String> sourceProfileIds = sourceProfileIdsInput == null
                ? currentConfig.sourceProfileIds()
                : sanitizeIds(sourceProfileIdsInput, allSourceProfileIds);
        List<String> extraKeywords = extraKeywordsInput == null
                ? currentConfig.extraKeywords()
                : sanitizeKeywordList(extraKeywordsInput);

        String opportunityConfigValue = buildOpportunityConfigValue(opportunityMode, subscriptionIds);
        String sourceProfileConfigValue = buildSourceProfileConfigValue(sourceProfileIds);
        String extraKeywordsValue = buildStringArrayValue(extraKeywords, 0);

        for (Path signalConfigFile : resolveSignalConfigFiles()) {
            if (!Files.exists(signalConfigFile)) {
                continue;
            }

            String content = readString(signalConfigFile);
            content = replaceConstValue(content, SCREENING_OPPORTUNITY_CONST, opportunityConfigValue, '{');
            content = replaceConstValue(content, SCREENING_SOURCE_PROFILE_CONST, sourceProfileConfigValue, '{');
            content = replaceConstValue(content, SCREENING_EXTRA_KEYWORDS_CONST, extraKeywordsValue, '[');
            writeString(signalConfigFile, content);
        }
    }

    private List<Path> resolveScreeningConfigFiles() {
        Path agentDir = resolveAgentDir();
        return List.of(
                agentDir.resolve(SCREENING_CONFIG_RELATIVE_PATH),
                agentDir.resolve(SCREENING_CONFIG_DIST_RELATIVE_PATH)
        );
    }

    private List<Path> resolveSignalConfigFiles() {
        Path agentDir = resolveAgentDir();
        return List.of(
                agentDir.resolve(SIGNAL_CONFIG_RELATIVE_PATH),
                agentDir.resolve(SIGNAL_CONFIG_DIST_RELATIVE_PATH)
        );
    }

    private String readPrimarySignalConfig() {
        for (Path file : resolveSignalConfigFiles()) {
            if (Files.exists(file)) {
                return readString(file);
            }
        }
        throw new ResourceNotFoundException("未找到 signal-config 配置文件");
    }

    private List<AgentSignalSourceOptionResponse> parseSignalSourceOptions(String content) {
        String block = extractConstValue(content, SIGNAL_SOURCE_PROFILES_CONST, '[');
        return extractTopLevelObjects(block).stream()
                .map(item -> new AgentSignalSourceOptionResponse(
                        matchObjectField(item, "id"),
                        matchObjectField(item, "label"),
                        matchObjectField(item, "description")
                ))
                .filter(item -> item.id() != null && item.label() != null)
                .toList();
    }

    private List<AgentKeywordSubscriptionOptionResponse> parseKeywordSubscriptionOptions(String content) {
        String block = extractConstValue(content, KEYWORD_SUBSCRIPTIONS_CONST, '[');
        return extractTopLevelObjects(block).stream()
                .map(item -> new AgentKeywordSubscriptionOptionResponse(
                        matchObjectField(item, "id"),
                        matchObjectField(item, "label"),
                        matchObjectField(item, "description"),
                        sanitizeKeywordList(parseObjectStringArray(item, "keywords")),
                        parseObjectStringArray(item, "preferredSourceProfileIds")
                ))
                .filter(item -> item.id() != null && item.label() != null)
                .toList();
    }

    private String extractConstValue(String content, String constName, char openingChar) {
        String quotedName = Pattern.quote(constName);
        String patternText = openingChar == '{'
                ? "(?s)export\\s+const\\s+" + quotedName + "(?:\\s*:[^=]+)?\\s*=\\s*(\\{[\\s\\S]*?\\})(?=\\s*;)"
                : "(?s)export\\s+const\\s+" + quotedName + "(?:\\s*:[^=]+)?\\s*=\\s*(\\[[\\s\\S]*?\\])(?=\\s*;)";
        Matcher matcher = Pattern.compile(patternText).matcher(content);
        if (!matcher.find()) {
            throw new BadRequestException("未找到配置常量: " + constName);
        }
        return matcher.group(1);
    }

    private String replaceConstValue(String content, String constName, String newValue, char openingChar) {
        String quotedName = Pattern.quote(constName);
        String patternText = openingChar == '{'
                ? "(?s)(export\\s+const\\s+" + quotedName + "(?:\\s*:[^=]+)?\\s*=\\s*)(\\{[\\s\\S]*?\\})(?=\\s*;)"
                : "(?s)(export\\s+const\\s+" + quotedName + "(?:\\s*:[^=]+)?\\s*=\\s*)(\\[[\\s\\S]*?\\])(?=\\s*;)";
        Matcher matcher = Pattern.compile(patternText).matcher(content);
        if (!matcher.find()) {
            throw new BadRequestException("未找到配置常量: " + constName);
        }
        return matcher.replaceFirst(Matcher.quoteReplacement(matcher.group(1) + newValue));
    }

    private void appendObjectToSignalConfigArray(String constName, String objectValue) {
        for (Path signalConfigFile : resolveSignalConfigFiles()) {
            if (!Files.exists(signalConfigFile)) {
                continue;
            }

            String content = readString(signalConfigFile);
            String arrayBlock = extractConstValue(content, constName, '[');
            String trimmed = arrayBlock.trim();
            String updatedArray = "[]".equals(trimmed)
                    ? "[\n" + objectValue + "\n]"
                    : arrayBlock.replaceFirst("\\]\\s*$", ",\n" + Matcher.quoteReplacement(objectValue) + "\n]");
            content = replaceConstValue(content, constName, updatedArray, '[');
            writeString(signalConfigFile, content);
        }
    }

    private List<String> extractTopLevelObjects(String arrayBlock) {
        List<String> objects = new ArrayList<>();
        int depth = 0;
        int start = -1;

        for (int index = 0; index < arrayBlock.length(); index++) {
            char current = arrayBlock.charAt(index);
            if (current == '{') {
                if (depth == 0) {
                    start = index;
                }
                depth++;
            } else if (current == '}') {
                depth--;
                if (depth == 0 && start >= 0) {
                    objects.add(arrayBlock.substring(start, index + 1));
                    start = -1;
                }
            }
        }

        return objects;
    }

    private String matchObjectField(String objectBlock, String fieldName) {
        Pattern pattern = Pattern.compile(fieldName + "\\s*:\\s*\"([^\"]*)\"");
        Matcher matcher = pattern.matcher(objectBlock);
        return matcher.find() ? matcher.group(1) : null;
    }

    private String matchFirstGroup(String content, Pattern pattern, int groupIndex) {
        Matcher matcher = pattern.matcher(content);
        return matcher.find() ? matcher.group(groupIndex) : null;
    }

    private List<String> parseObjectStringArray(String objectBlock, String fieldName) {
        Pattern pattern = Pattern.compile(fieldName + "\\s*:\\s*\\[([\\s\\S]*?)\\]");
        Matcher matcher = pattern.matcher(objectBlock);
        if (!matcher.find()) {
            return List.of();
        }
        return parseQuotedStrings(matcher.group(1));
    }

    private List<String> parseConstStringArray(String content, String constName) {
        String block = extractConstValue(content, constName, '[');
        return parseQuotedStrings(block);
    }

    private List<String> parseQuotedStrings(String text) {
        Matcher matcher = Pattern.compile("\"([^\"]*)\"").matcher(text);
        List<String> values = new ArrayList<>();
        while (matcher.find()) {
            values.add(matcher.group(1));
        }
        return values;
    }

    private List<String> sanitizeIds(List<String> values, List<String> allowedIds) {
        if (values == null) {
            return List.of();
        }

        return values.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(item -> !item.isBlank())
                .filter(allowedIds::contains)
                .distinct()
                .toList();
    }

    private List<String> nullableList(String value) {
        return value == null ? List.of() : List.of(value);
    }

    private List<String> sanitizeKeywordList(List<String> values) {
        if (values == null) {
            return List.of();
        }

        return values.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(item -> !item.isBlank())
                .distinct()
                .toList();
    }

    private List<String> sanitizeTextList(List<String> values) {
        if (values == null) {
            return List.of();
        }

        return values.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(item -> !item.isBlank())
                .distinct()
                .toList();
    }

    private String normalizeSelectionMode(String mode) {
        return "single".equalsIgnoreCase(mode) ? "single" : "all";
    }

    private String resolveCustomId(String rawId, String label, String prefix, List<String> existingIds) {
        String normalized = normalizeCustomId(rawId);
        if (normalized == null || normalized.isBlank()) {
            normalized = normalizeCustomId(label);
        }
        if (normalized == null || normalized.isBlank()) {
            normalized = prefix + "_" + Instant.now().toEpochMilli();
        }
        if (!normalized.startsWith(prefix) && rawId == null) {
            normalized = prefix + "_" + normalized;
        }
        if (existingIds.contains(normalized)) {
            throw new BadRequestException("配置项 id 已存在: " + normalized);
        }
        return normalized;
    }

    private String normalizeCustomId(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim()
                .toLowerCase()
                .replaceAll("[^a-z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
        return normalized.isBlank() ? null : normalized;
    }

    private String buildOpportunityConfigValue(String mode, List<String> subscriptionIds) {
        String singleSubscriptionId = subscriptionIds.isEmpty() ? "" : subscriptionIds.get(0);
        String effectiveMode = normalizeSelectionMode(mode);

        return "{\n"
                + "    mode: \"" + effectiveMode + "\",\n"
                + "    singleSubscriptionId: \"" + singleSubscriptionId + "\",\n"
                + "    subscriptionIds: " + buildStringArrayValue(subscriptionIds, 4) + ",\n"
                + "  }";
    }

    private String buildSourceProfileConfigValue(List<String> sourceProfileIds) {
        return "{\n"
                + "  sourceProfileIds: " + buildStringArrayValue(sourceProfileIds, 2) + ",\n"
                + "}";
    }

    private String buildStringArrayValue(List<String> values, int indentSpaces) {
        if (values == null || values.isEmpty()) {
            return "[]";
        }

        String indent = " ".repeat(Math.max(indentSpaces, 0));
        String innerIndent = indent + "  ";
        return "[\n"
                + values.stream()
                        .map(value -> innerIndent + "\"" + escapeJsString(value) + "\"")
                        .collect(Collectors.joining(",\n"))
                + "\n" + indent + "]";
    }

    private String buildSignalSourceObjectValue(
            String id,
            String label,
            String description,
            List<String> searchScopes,
            List<String> documentTypes,
            List<String> includeDomains,
            List<String> excludeDomains,
            List<String> queryHints
    ) {
        List<String> lines = new ArrayList<>();
        lines.add("  {");
        lines.add("    id: \"" + escapeJsString(id) + "\",");
        lines.add("    label: \"" + escapeJsString(label.trim()) + "\",");
        lines.add("    description: \"" + escapeJsString(defaultString(description)) + "\",");
        lines.add("    searchScopes: " + buildStringArrayValue(searchScopes, 4) + ",");
        if (!documentTypes.isEmpty()) {
            lines.add("    documentTypes: " + buildStringArrayValue(documentTypes, 4) + ",");
        }
        lines.add("    includeDomains: " + buildStringArrayValue(includeDomains, 4) + ",");
        if (!excludeDomains.isEmpty()) {
            lines.add("    excludeDomains: " + buildStringArrayValue(excludeDomains, 4) + ",");
        }
        if (!queryHints.isEmpty()) {
            lines.add("    queryHints: " + buildStringArrayValue(queryHints, 4) + ",");
        }
        lines.add("  }");
        return lines.stream().collect(Collectors.joining("\n"));
    }

    private String buildKeywordSubscriptionObjectValue(
            String id,
            String label,
            String description,
            List<String> keywords,
            List<String> preferredSourceProfileIds
    ) {
        List<String> lines = new ArrayList<>();
        lines.add("  {");
        lines.add("    id: \"" + escapeJsString(id) + "\",");
        lines.add("    label: \"" + escapeJsString(label.trim()) + "\",");
        lines.add("    description: \"" + escapeJsString(defaultString(description)) + "\",");
        lines.add("    keywords: " + buildStringArrayValue(keywords, 4) + ",");
        lines.add("    preferredSourceProfileIds: " + buildStringArrayValue(preferredSourceProfileIds, 4) + ",");
        lines.add("  }");
        return lines.stream().collect(Collectors.joining("\n"));
    }

    private String escapeJsString(String value) {
        return defaultString(value)
                .replace("\\", "\\\\")
                .replace("\"", "\\\"");
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String buildPromptPreview(String prompt, String inputFile) {
        if (prompt != null && !prompt.isBlank()) {
            return abbreviate(prompt.trim(), 120);
        }
        if (inputFile != null && !inputFile.isBlank()) {
            return "inputFile: " + inputFile.trim();
        }
        return null;
    }

    private String textValue(JsonNode node, String fieldName) {
        JsonNode value = node.path(fieldName);
        return value.isMissingNode() || value.isNull() ? null : value.asText(null);
    }

    private Double doubleValue(JsonNode node, String fieldName) {
        JsonNode value = node.path(fieldName);
        return value.isNumber() ? value.asDouble() : null;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private Path resolveLatestLogFile() {
        if (currentLogFile != null && Files.exists(currentLogFile)) {
            return currentLogFile;
        }

        Path logDir = resolveLogsDir();
        if (!Files.exists(logDir)) {
            return null;
        }

        try (var stream = Files.list(logDir)) {
            return stream
                    .filter(Files::isRegularFile)
                    .max(Comparator.comparing(this::lastModifiedTime))
                    .orElse(null);
        } catch (IOException ex) {
            throw new BadRequestException("读取日志目录失败: " + ex.getMessage());
        }
    }

    private List<String> readAllLines(Path path) {
        try {
            return Files.readAllLines(path, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new BadRequestException("读取文件失败: " + path + ", " + ex.getMessage());
        }
    }

    private String readString(Path path) {
        try {
            return Files.readString(path, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new BadRequestException("读取文件失败: " + path + ", " + ex.getMessage());
        }
    }

    private void writeLines(Path path, List<String> lines) {
        try {
            Files.createDirectories(path.getParent());
            Files.write(path, lines, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException ex) {
            throw new BadRequestException("写入文件失败: " + path + ", " + ex.getMessage());
        }
    }

    private void writeString(Path path, String content) {
        try {
            Files.createDirectories(path.getParent());
            Files.writeString(path, content, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException ex) {
            throw new BadRequestException("写入文件失败: " + path + ", " + ex.getMessage());
        }
    }

    private String normalizeConfigValue(String value) {
        return value == null ? null : value.trim();
    }

    private String maskSecret(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }
        if (value.length() <= 6) {
            return "***";
        }
        return value.substring(0, 3) + "***" + value.substring(value.length() - 2);
    }

    private String abbreviate(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return value;
        }
        return value.length() <= maxLength ? value : value.substring(0, maxLength) + "...";
    }

    private Instant lastModifiedTime(Path path) {
        try {
            return Files.getLastModifiedTime(path).toInstant();
        } catch (IOException ex) {
            return Instant.EPOCH;
        }
    }

    private String stripExtension(String fileName) {
        int index = fileName.lastIndexOf('.');
        return index >= 0 ? fileName.substring(0, index) : fileName;
    }

    private String fileName(Path path) {
        return path == null ? null : path.getFileName().toString();
    }

    private String pathString(Path path) {
        return path == null ? null : path.toAbsolutePath().toString();
    }

}
