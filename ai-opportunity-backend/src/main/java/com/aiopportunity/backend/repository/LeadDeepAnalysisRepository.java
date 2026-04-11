package com.aiopportunity.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.aiopportunity.backend.domain.LeadDeepAnalysisEntity;

public interface LeadDeepAnalysisRepository extends JpaRepository<LeadDeepAnalysisEntity, Long> {

    Optional<LeadDeepAnalysisEntity> findByLeadId(Long leadId);
}
