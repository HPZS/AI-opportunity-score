package com.aiopportunity.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.agent")
public record AgentRuntimeProperties(
        String agentDir,
        String logsDir,
        String nodeCommand
) {
}
