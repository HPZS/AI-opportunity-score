package com.aiopportunity.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import com.aiopportunity.backend.domain.LeadEntity;

public interface LeadRepository extends JpaRepository<LeadEntity, Long>, JpaSpecificationExecutor<LeadEntity> {

    Optional<LeadEntity> findByDedupeKey(String dedupeKey);

    Optional<LeadEntity> findByExternalLeadId(String externalLeadId);

    Optional<LeadEntity> findFirstByUrl(String url);

    Optional<LeadEntity> findFirstByNormalizedTitleAndOrganizationName(String normalizedTitle, String organizationName);

    Optional<LeadEntity> findFirstByNormalizedTitle(String normalizedTitle);

    List<LeadEntity> findAllByIdIn(Collection<Long> ids);
}
