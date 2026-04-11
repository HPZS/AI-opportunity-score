package com.aiopportunity.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.aiopportunity.backend.domain.AgentTaskResultEntity;

public interface AgentTaskResultRepository extends JpaRepository<AgentTaskResultEntity, Long> {

    void deleteByAgentTaskId(Long agentTaskId);

    List<AgentTaskResultEntity> findAllByAgentTaskIdOrderByIdAsc(Long agentTaskId);
}
