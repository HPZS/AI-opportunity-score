package com.aiopportunity.backend.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

@Component
public class JsonSupport {

    private final ObjectMapper objectMapper;

    public JsonSupport(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public JsonNode readTree(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    public String write(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("JSON 序列化失败", ex);
        }
    }

    public String writeNode(JsonNode node) {
        return node == null ? "null" : write(node);
    }

    public List<String> toStringList(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyList();
        }
        JsonNode node = readTree(json);
        if (!(node instanceof ArrayNode)) {
            return Collections.emptyList();
        }
        return objectMapper.convertValue(node, objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
    }

    public List<Map<String, Object>> toObjectList(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyList();
        }
        JsonNode node = readTree(json);
        if (!(node instanceof ArrayNode)) {
            return Collections.emptyList();
        }
        return objectMapper.convertValue(node, objectMapper.getTypeFactory().constructCollectionType(List.class, Map.class));
    }

    public Map<String, Object> toObjectMap(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyMap();
        }
        JsonNode node = readTree(json);
        if (!(node instanceof ObjectNode)) {
            return Collections.emptyMap();
        }
        return objectMapper.convertValue(node, objectMapper.getTypeFactory().constructMapType(Map.class, String.class, Object.class));
    }
}
