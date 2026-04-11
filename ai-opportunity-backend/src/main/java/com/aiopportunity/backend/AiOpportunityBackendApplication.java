package com.aiopportunity.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class AiOpportunityBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(AiOpportunityBackendApplication.class, args);
	}

}
