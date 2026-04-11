package com.aiopportunity.backend.repository;

import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.aiopportunity.backend.domain.AgentTaskEntity;

public interface AgentTaskRepository extends JpaRepository<AgentTaskEntity, Long> {

    Optional<AgentTaskEntity> findByTaskKey(String taskKey);

    Page<AgentTaskEntity> findAllByOrderBySavedAtDesc(Pageable pageable);
}
