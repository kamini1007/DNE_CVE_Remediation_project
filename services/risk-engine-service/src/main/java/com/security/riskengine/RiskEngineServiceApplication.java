package com.security.riskengine;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class RiskEngineServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(RiskEngineServiceApplication.class, args);
    }
}
