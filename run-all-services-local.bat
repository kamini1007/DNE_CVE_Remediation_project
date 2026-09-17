@echo off
REM ============================================================
REM  cve-remediation-platform - build, install, and run ALL
REM  services locally.
REM
REM  Stages:
REM    [1] Prerequisite check (docker, java, maven, node, npm, curl)
REM    [2] Compile ingestion-service   (mvn clean package -DskipTests)
REM    [3] Compile risk-engine-service (mvn clean package -DskipTests)
REM    [4] Install ai-analysis-service, remediation-service,
REM        learning-service (npm install + syntax check)
REM    [5] Install + build dashboard   (npm install && npm run build)
REM    [6] docker compose up --build -d, then health-check every service
REM
REM  Any compilation/install failure in [2]-[5] stops the script
REM  immediately with a clear error - nothing gets deployed on a
REM  broken build. This mirrors each service's own Dockerfile build
REM  stage, so problems surface here in seconds/minutes rather than
REM  after a slow "docker compose up --build".
REM
REM  Run this from the repo root: cve-remediation-platform\
REM ============================================================
setlocal enabledelayedexpansion

echo.
echo ==================================================
echo  [1/6] Checking prerequisites
echo ==================================================
REM call :require docker "Docker (Docker Desktop or Rancher Desktop)"
REM if errorlevel 1 exit /b 1
REM call :require java "Java JDK (needed to compile ingestion-service / risk-engine-service)"
REM if errorlevel 1 exit /b 1
REM call :require mvn "Apache Maven"
REM if errorlevel 1 exit /b 1
REM call :require node "Node.js"
REM if errorlevel 1 exit /b 1
REM call :require npm.cmd "npm.cmd"
REM if errorlevel 1 exit /b 1
REM call :require curl "curl"
REM if errorlevel 1 exit /b 1
REM docker info >nul 2>nul
REM if errorlevel 1 (
    REM echo ERROR: Docker is installed but not responding. Start Docker Desktop / Rancher Desktop and try again.
    REM exit /b 1
REM )
REM echo All prerequisites found.

echo.
echo ==================================================
echo        GitHub Token Configuration
echo ==================================================

if defined GITHUB_TOKEN (
    echo GITHUB_TOKEN is already configured.
) else (
    set /p "GITHUB_TOKEN=Enter GitHub Personal Access Token: "
)

if not defined GITHUB_TOKEN (
    echo.
    echo ERROR: GITHUB_TOKEN is not configured.
    echo Stopping deployment.
    exit /b 1
)

echo GitHub token configured for this deployment.

echo.
echo ==================================================
echo        Starting CVE Remediation Platform
echo ==================================================

set "ROOT=%~dp0"

echo ==================================================
echo  [2/6] Compiling ingestion-service (Maven)
echo ==================================================
pushd "%ROOT%services\ingestion-service"

call mvn -B clean package -DskipTests
if errorlevel 1 (
    echo.
    echo ERROR: ingestion-service failed to compile.
    echo Scroll up for the Maven error. Stopping - nothing was deployed.
    popd
    exit /b 1
)

popd

echo ingestion-service compiled OK.

echo.
echo Starting ingestion-service in separate CMD window...

start "ingestion-service" cmd /k "cd /d ""%ROOT%services\ingestion-service"" && call mvn spring-boot:run"

echo.
echo ==================================================
echo  [3/6] Compiling mock bedrock  and running
echo ==================================================
pushd "%ROOT%infra\localstack\mock-bedrock"
echo Starting mock bedrock in separate CMD window...
start "mock-bedrock" cmd /k "cd /d ""%ROOT%infra\localstack\mock-bedrock"" && call npm.cmd start"
popd
echo Mock bedrock started OK.

echo.
echo ==================================================
echo  [4/6] Compiling risk-engine-service (Maven)
echo ==================================================
pushd "%ROOT%services\risk-engine-service"

call mvn -B clean package -DskipTests
if errorlevel 1 (
    echo.
    echo ERROR: risk-engine-service failed to compile.
    echo Scroll up for the Maven error. Stopping - nothing was deployed.
    popd
    exit /b 1
)

popd
echo risk-engine-service compiled OK.

echo.
echo Starting risk-engine-service in separate CMD window...
start "risk-engine-service" cmd /k "cd /d ""%ROOT%services\risk-engine-service"" && call mvn spring-boot:run"


echo.
echo ==================================================
echo  [5/6] Installing Node services
echo       ai-analysis, remediation, learning
echo ==================================================

for %%S in (ai-analysis-service remediation-service learning-service) do (

    echo.
    echo --- %%S ---

    pushd "%ROOT%services\%%S"

    call npm.cmd install --omit=dev
    if errorlevel 1 (
        echo.
        echo ERROR: %%S failed "npm install".
        echo Scroll up for the npm error. Stopping - nothing was deployed.
        popd
        exit /b 1
    )

    call node --check src\index.js
    if errorlevel 1 (
        echo.
        echo ERROR: %%S has a JavaScript syntax error in src\index.js
        echo ^(or a file it requires^). Stopping - nothing was deployed.
        popd
        exit /b 1
    )

    popd

    echo %%S installed OK.

    echo Starting %%S in separate CMD window...
    set "NODE_TLS_REJECT_UNAUTHORIZED=0"
    start "%%S" cmd /k "cd /d ""%ROOT%services\%%S"" && call npm.cmd start"
)


echo.
echo ==================================================
echo  [6/6] Installing and building dashboard
echo       (Vite/React)
echo ==================================================

pushd "%ROOT%services\dashboard"

call npm.cmd install
if errorlevel 1 (
    echo.
    echo ERROR: dashboard failed "npm install".
    echo Scroll up for the npm error. Stopping - nothing was deployed.
    popd
    exit /b 1
)

call npm.cmd run build
if errorlevel 1 (
    echo.
    echo ERROR: dashboard failed to build ^(vite build^).
    echo Scroll up for the build error. Stopping - nothing was deployed.
    popd
    exit /b 1
)

popd

echo dashboard compiled OK.

echo.
echo Starting dashboard in separate CMD window...

start "dashboard" cmd /k "cd /d ""%ROOT%services\dashboard"" && call npm.cmd run dev"


echo.
echo ==================================================
echo  All services started
echo ==================================================
echo.
echo Services running in separate CMD windows:
echo.
echo   - risk-engine-service
echo   - ai-analysis-service
echo   - remediation-service
echo   - learning-service
echo   - dashboard
echo.

REM echo.
REM echo ==================================================
REM echo  [6/6] Starting all services with Docker Compose
REM echo ==================================================
REM echo Checking for an already-running LocalStack on localhost:4566...
REM curl -s http://localhost:4566/_localstack/health 2>nul | findstr /C:"running" >nul
REM if errorlevel 1 (
    REM echo No LocalStack found - docker compose will start its own ^(see docker-compose.localstack.yml^).
    REM set COMPOSE_FILES=-f docker-compose.yml -f docker-compose.localstack.yml
REM ) else (
    REM echo LocalStack is already running externally - reusing it, skipping the bundled one to avoid a port 4566 conflict.
    REM set COMPOSE_FILES=-f docker-compose.yml -f docker-compose.mock-bedrock-only.yml
REM )

REM docker compose %COMPOSE_FILES% up --build -d
REM if errorlevel 1 (
    REM echo ERROR: docker compose up failed. Scroll up for the failing service's build/start error.
    REM exit /b 1
REM )

REM echo.
REM echo Waiting for services to come up, then checking health...
REM timeout /t 15 >nul

call :check "ingestion-service  " "http://localhost:8080/actuator/health"
call :check "ai-analysis-service" "http://localhost:3000/health"
call :check "risk-engine-service" "http://localhost:8083/actuator/health"
call :check "remediation-service" "http://localhost:3001/health"
call :check "learning-service   " "http://localhost:3002/health"
call :check "mock-bedrock       " "http://localhost:4010/health"
call :check "dashboard          " "http://localhost:5173"

echo.
echo ==================================================
echo  Dashboard:  http://localhost:5173
echo ==================================================
echo.
echo Services are starting in the background - if any check above shows
echo NOT READY, give it another 10-20s and re-run this script, or check:
REM echo   docker compose %COMPOSE_FILES% logs -f ^<service-name^>
REM echo.
REM echo To stop everything:
REM echo   docker compose %COMPOSE_FILES% down -v
endlocal
exit /b 0

:require
where %~1 >nul 2>nul
if errorlevel 1 (
    echo ERROR: "%~1" not found on PATH - %~2 is required. Install it and try again.
    exit /b 1
)
exit /b 0

:check
set NAME=%~1
set URL=%~2
curl -sf -o nul --max-time 3 "%URL%" >nul 2>nul
if errorlevel 1 (
    echo   [NOT READY] %NAME%  %URL%
) else (
    echo   [OK]        %NAME%  %URL%
)
exit /b 0
