# Running the Platform Locally with LocalStack

This guide gets the whole platform running **without a real AWS account** -
useful for development, demos, and CI smoke tests.

## Read this first: what LocalStack can and can't do here

| AWS service | LocalStack Community | What we actually do |
|---|---|---|
| Secrets Manager | Works well | `infra/terraform-localstack/secrets.tf` creates real secrets against it |
| IAM | Works well | `infra/terraform-localstack/iam-bedrock.tf` validates the Bedrock policy JSON |
| RDS (PostgreSQL) | Not practically usable (Pro-only, limited even there) | Run Postgres as a normal Docker container instead (already in `docker-compose.yml`) |
| EKS | No real Kubernetes control plane | Run the services as plain Docker containers via Compose. To test the k8s *manifests* specifically, use `kind` or `minikube` instead - see the note at the bottom |
| ECR | Pro-only, and Compose doesn't need it anyway | Not used in this guide |
| Bedrock | Pro-only, and even then it's mocked, not real inference | Use `infra/localstack/mock-bedrock` instead - a small Express service implementing just enough of Bedrock's HTTP contract for `ai-analysis-service` to run unmodified |

So this guide has two independent parts: **Part A** proves out the Terraform
Secrets Manager/IAM code against LocalStack; **Part B** runs the actual
application stack fully offline via Docker Compose + the mock Bedrock
service. Do either alone, or both.

## Prerequisites

- Docker + Docker Compose
- Terraform >= 1.6 (Part A only)
- `curl`
- Optional: [`awslocal`](https://github.com/localstack/awscli-local) (`pip install awscli-local`) so you don't need `--endpoint-url` on every AWS CLI call

## Part A - Validate the Terraform (Secrets Manager + IAM) against LocalStack

**1. Start LocalStack:**
```bash
docker run -d --name localstack -p 4566:4566 -e SERVICES=secretsmanager,iam,sts localstack/localstack:3.7
curl -s http://localhost:4566/_localstack/health | grep -q running && echo "LocalStack is up"
```

**2. Apply the LocalStack Terraform overlay:**
```bash
cd infra/terraform-localstack
terraform init
terraform apply -auto-approve
```
Creates the same secret/policy shapes as the real `infra/terraform/` config,
against LocalStack's emulated APIs instead of real AWS.

**3. Verify:**
```bash
awslocal secretsmanager list-secrets
awslocal iam list-roles
awslocal iam list-policies --scope Local
```

**4. Optionally fill in a real NVD API key:**
```bash
awslocal secretsmanager put-secret-value \
  --secret-id cve-remediation/local/nvd-api-key \
  --secret-string '{"apiKey":"your-real-nvd-key-or-leave-blank"}'
```

**5. Tear down:**
```bash
cd infra/terraform-localstack
terraform destroy -auto-approve
docker rm -f localstack
```

## Part B - Run the full application stack offline

Runs ingestion-service, ai-analysis-service, and Postgres together, with
**zero AWS access of any kind** - mock-bedrock replaces real Bedrock;
Postgres is a plain container, not RDS.

**1. From the repo root:**
```bash
docker compose -f docker-compose.yml -f docker-compose.localstack.yml up --build
```
Starts, in order: `postgres` -> `localstack` (available if you want to point
something at it, but unused by the running services in this compose) ->
`mock-bedrock` -> `ingestion-service` (runs Flyway migrations, creating `cve`,
`cve_analysis`, `asset_profile`, `risk_score`) -> `ai-analysis-service`
(pointed at `mock-bedrock` instead of real AWS Bedrock via
`BEDROCK_ENDPOINT_URL`) -> `risk-engine-service` (scores whatever
ai-analysis-service has analyzed so far).

**2. Confirm each service is healthy:**
```bash
curl http://localhost:8080/actuator/health   # ingestion-service
curl http://localhost:3000/health            # ai-analysis-service
curl http://localhost:4010/health            # mock-bedrock
```

**3. Trigger the pipeline manually** to see data flow through all three stages:
```bash
curl -X POST http://localhost:8080/api/ingestion/trigger/NVD
curl -X POST http://localhost:3000/api/analysis/trigger
curl -X POST "http://localhost:8081/api/risk/trigger?batchSize=50"
curl http://localhost:3000/api/analysis/cve/CVE-2024-12345   # use a real ID from step 1's logs
curl http://localhost:8081/api/risk/CVE-2024-12345
curl http://localhost:8081/api/risk                          # prioritized list, highest risk first
```
Every field in the analysis response is prefixed `[mock-bedrock]` -
intentional, so mock output can never be mistaken for a real assessment.

**4. Tear down:**
```bash
docker compose -f docker-compose.yml -f docker-compose.localstack.yml down -v
```

## If you want to test the Kubernetes manifests specifically

LocalStack doesn't run real Kubernetes. Use [`kind`](https://kind.sigs.k8s.io/):
```bash
kind create cluster --name cve-platform
kubectl apply -f k8s/base/
kubectl apply -f k8s/ingestion-service/
kubectl apply -f k8s/ai-analysis-service/
kubectl apply -f k8s/risk-engine-service/
```
You'll need to build/push images somewhere `kind` can pull from (e.g. `kind
load docker-image <image>` after a local `docker build`), and swap the
`ExternalSecret`/IRSA pieces in `k8s/base/external-secrets.yaml` and
`k8s/ai-analysis-service/serviceaccount.yaml` for plain `kubectl create
secret` commands, since there's no real Secrets Manager or IRSA in a `kind`
cluster. That's a separate, larger exercise than what LocalStack covers here.
