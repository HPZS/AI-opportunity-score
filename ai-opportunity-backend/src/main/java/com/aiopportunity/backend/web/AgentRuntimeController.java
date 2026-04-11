package com.aiopportunity.backend.web;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aiopportunity.backend.service.AgentRuntimeService;
import com.aiopportunity.backend.web.dto.AgentRuntimeConfigResponse;
import com.aiopportunity.backend.web.dto.AgentRuntimeConfigUpdateRequest;
import com.aiopportunity.backend.web.dto.AgentRuntimeLogsResponse;
import com.aiopportunity.backend.web.dto.AgentRuntimeStartRequest;
import com.aiopportunity.backend.web.dto.AgentRuntimeStartResponse;
import com.aiopportunity.backend.web.dto.AgentRuntimeStatusResponse;
import com.aiopportunity.backend.web.dto.AgentRuntimeStopResponse;
import com.aiopportunity.backend.web.dto.CreateAgentKeywordSubscriptionRequest;
import com.aiopportunity.backend.web.dto.CreateAgentSignalSourceRequest;

import jakarta.validation.Valid;

@Validated
@RestController
@RequestMapping("/api/agent/runtime")
public class AgentRuntimeController {

    private final AgentRuntimeService agentRuntimeService;

    public AgentRuntimeController(AgentRuntimeService agentRuntimeService) {
        this.agentRuntimeService = agentRuntimeService;
    }

    @GetMapping("/status")
    public AgentRuntimeStatusResponse getStatus() {
        return agentRuntimeService.getStatus();
    }

    @PostMapping("/start")
    public AgentRuntimeStartResponse start(@Valid @RequestBody AgentRuntimeStartRequest request) {
        return agentRuntimeService.start(request);
    }

    @PostMapping("/stop")
    public AgentRuntimeStopResponse stop() {
        return agentRuntimeService.stop();
    }

    @GetMapping("/config")
    public AgentRuntimeConfigResponse getConfig() {
        return agentRuntimeService.getConfig();
    }

    @PatchMapping("/config")
    public AgentRuntimeConfigResponse updateConfig(@RequestBody AgentRuntimeConfigUpdateRequest request) {
        return agentRuntimeService.updateConfig(request);
    }

    @PostMapping("/config/signal-sources")
    public AgentRuntimeConfigResponse addSignalSource(@Valid @RequestBody CreateAgentSignalSourceRequest request) {
        return agentRuntimeService.addSignalSource(request);
    }

    @PostMapping("/config/keyword-subscriptions")
    public AgentRuntimeConfigResponse addKeywordSubscription(@Valid @RequestBody CreateAgentKeywordSubscriptionRequest request) {
        return agentRuntimeService.addKeywordSubscription(request);
    }

    @GetMapping("/logs")
    public AgentRuntimeLogsResponse getLogs(@RequestParam(defaultValue = "200") int lines) {
        return agentRuntimeService.getLogs(lines);
    }
}
