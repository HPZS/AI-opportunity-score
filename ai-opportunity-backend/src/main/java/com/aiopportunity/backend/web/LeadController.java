package com.aiopportunity.backend.web;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.aiopportunity.backend.service.LeadQueryService;
import com.aiopportunity.backend.web.dto.LeadDeepAnalysisResponse;
import com.aiopportunity.backend.web.dto.LeadDetailResponse;
import com.aiopportunity.backend.web.dto.LeadListItemResponse;
import com.aiopportunity.backend.web.dto.PagedResponse;
import com.aiopportunity.backend.web.dto.UpdateLeadStatusRequest;

import jakarta.validation.Valid;

@Validated
@RestController
@RequestMapping("/api/leads")
public class LeadController {

    private final LeadQueryService leadQueryService;

    public LeadController(LeadQueryService leadQueryService) {
        this.leadQueryService = leadQueryService;
    }

    @GetMapping
    public PagedResponse<LeadListItemResponse> listLeads(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String leadCategory,
            @RequestParam(required = false) String poolEntryTier,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return leadQueryService.listLeads(keyword, leadCategory, poolEntryTier, status, page, size);
    }

    @GetMapping("/{id}")
    public LeadDetailResponse getLead(@PathVariable Long id) {
        return leadQueryService.getLeadDetail(id);
    }

    @GetMapping("/{id}/deep-analysis")
    public LeadDeepAnalysisResponse getLeadDeepAnalysis(@PathVariable Long id) {
        return leadQueryService.getLeadDeepAnalysis(id);
    }

    @PatchMapping("/{id}/status")
    public void updateLeadStatus(@PathVariable Long id, @Valid @RequestBody UpdateLeadStatusRequest request) {
        leadQueryService.updateLeadStatus(id, request.status());
    }
}
