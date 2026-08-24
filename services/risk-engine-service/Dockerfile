# --- Build stage ---
# No official "maven:3.9.9-eclipse-temurin-25" image exists - Maven 3.9.9 was
# only ever published paired with JDK 17-and-earlier; the official image
# pairs JDK 25 with the newer Maven 3.9.16 patch instead. Since the exact
# Maven 3.9.9 + Java 25 combination was requested, it's installed explicitly
# here rather than silently substituting a different Maven patch version.
FROM eclipse-temurin:25-jdk-alpine AS build
ENV MAVEN_VERSION=3.9.9
RUN apk add --no-cache curl \
    && curl -fsSL "https://archive.apache.org/dist/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz" -o /tmp/maven.tar.gz \
    && tar -xzf /tmp/maven.tar.gz -C /opt \
    && ln -s "/opt/apache-maven-${MAVEN_VERSION}" /opt/maven \
    && rm /tmp/maven.tar.gz \
    && apk del curl
ENV PATH="/opt/maven/bin:${PATH}"

WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B clean package -DskipTests

# --- Runtime stage ---
FROM eclipse-temurin:25-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8083
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
