package com.aiopportunity.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.storage")
public record AppStorageProperties(String taskResultsDir) {
}
