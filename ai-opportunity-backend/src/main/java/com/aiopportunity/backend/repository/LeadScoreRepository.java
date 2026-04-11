package com.aiopportunity.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.aiopportunity.backend.domain.LeadScoreEntity;

public interface LeadScoreRepository extends JpaRepository<LeadScoreEntity, Long> {

    Optional<LeadScoreEntity> findByLeadId(Long leadId);

    List<LeadScoreEntity> findAllByLeadIdIn(Collection<Long> leadIds);
}
