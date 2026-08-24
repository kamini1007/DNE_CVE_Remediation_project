package com.security.cveingestion;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class CveIngestionServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(CveIngestionServiceApplication.class, args);
    }
}
