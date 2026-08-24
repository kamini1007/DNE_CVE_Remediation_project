# Phase 7 - Cloud Deployment & Monitoring

Takes the platform from "manifests exist" to "deployed on EKS with TLS, auth,
logs, metrics, alerts, and security controls."

## What Phase 7 changed

| Area | Change |
|---|---|
| **Ingress** | Single ALB serving everything from one hostname (`k8s/base/ingress.yaml`). `/api/*` routes to the four services, `/` to the dashboard. |
| **CORS** | Resolved structurally, not with headers — because everything is one origin now, the dashboard uses relative paths and CORS never applies. |
| **Auth** | OIDC at the ALB, so no request reaches a pod unauthenticated. |
| **TLS** | ACM certificate on the ALB, HTTP redirected to HTTPS. |
| **Logging** | Fluent Bit DaemonSet → CloudWatch Logs, with pod/namespace metadata attached. |
| **Metrics** | Real endpoints added to every service: Micrometer `/actuator/prometheus` (Java), prom-client `/metrics` (Node), including domain metrics — Bedrock latency/failures, batch sizes, Jira outcomes. |
| **Alerting** | Prometheus rules for both infrastructure and *pipeline* health, plus CloudWatch alarms on RDS → SNS. |
| **Security** | Non-root containers, read-only root filesystems, dropped capabilities, seccomp, and default-deny NetworkPolicies. |

## Prerequisites

Phase 1's infrastructure applied (`infra/terraform`), plus these cluster
add-ons, which are deliberately *not* in Terraform — they're Helm releases
with their own lifecycles, and mixing Helm-managed resources into Terraform
tends to create upgrade friction:

**1. AWS Load Balancer Controller** (provisions the ALB from the Ingress):
```bash
# Fetch the IAM policy document referenced by infra/terraform/alb.tf
curl -o infra/terraform/alb-iam-policy.json \
  https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.8.1/docs/install/iam_policy.json

cd infra/terraform && terraform apply   # creates the IRSA role

helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=cve-remediation-dev-eks \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set-string serviceAccount.annotations."eks\.amazonaws\.com/role-arn"="$(terraform output -raw alb_controller_irsa_role_arn)"
```

**2. kube-prometheus-stack** (Prometheus + Grafana + Alertmanager, and the
`ServiceMonitor`/`PrometheusRule` CRDs the monitoring manifests depend on):
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
kubectl create namespace monitoring
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack -n monitoring
```

**3. A NetworkPolicy-capable CNI.** This one is easy to miss and important:
**EKS's default VPC CNI does not enforce NetworkPolicy.** Applying
`k8s/base/network-policies.yaml` without Calico installed does nothing at all
— which is worse than not applying it, because the cluster looks protected
and isn't.
```bash
kubectl apply -f https://raw.githubusercontent.com/aws/amazon-vpc-cni-k8s/master/config/master/calico-operator.yaml
kubectl apply -f https://raw.githubusercontent.com/aws/amazon-vpc-cni-k8s/master/config/master/calico-crs.yaml
```
Verify enforcement is real before trusting it:
```bash
kubectl run netpol-test --rm -it --image=busybox -n cve-platform -- \
  wget -qO- --timeout=5 http://example.com
# Should hang/fail once the default-deny policy is active.
```

## Deployment steps

**1. Apply Terraform** for the Phase 7 resources (log group, IRSA roles, ACM
cert, SNS topic, RDS alarms):
```bash
cd infra/terraform
terraform apply -var="platform_hostname=cve.example.com"
```
If the ACM certificate is created, `terraform apply` will wait on DNS
validation — add the CNAME records it prints to your DNS provider.

**2. Fill placeholders in the manifests** from Terraform outputs:

| Placeholder | Manifest | Source |
|---|---|---|
| `<FLUENT_BIT_IRSA_ROLE_ARN>` | `k8s/monitoring/fluent-bit.yaml` | `terraform output fluent_bit_irsa_role_arn` |
| `<ACM_CERTIFICATE_ARN>` | `k8s/base/ingress.yaml` | `terraform output acm_certificate_arn` |
| `<PLATFORM_HOSTNAME>` | `k8s/base/ingress.yaml` | your hostname |
| `<OIDC_*>` | `k8s/base/ingress.yaml` | your identity provider |
| `<AI_ANALYSIS_IRSA_ROLE_ARN>` | `k8s/ai-analysis-service/serviceaccount.yaml` | `terraform output ai_analysis_irsa_role_arn` |
| `<ECR_REGISTRY>` | every deployment | your account's ECR registry |

**3. Create the OIDC client secret** the ingress annotation references:
```bash
kubectl create secret generic oidc-client-secret -n cve-platform \
  --from-literal=clientID='<your-client-id>' \
  --from-literal=clientSecret='<your-client-secret>'
```

**4. Rebuild the dashboard image with empty API URLs** so it uses relative,
same-origin paths behind the ingress. This is the step that makes CORS a
non-issue, and it's easy to forget because the image will otherwise build and
deploy perfectly happily while pointing at `localhost`:
```bash
docker build \
  --build-arg VITE_INGESTION_API_URL="" \
  --build-arg VITE_AI_ANALYSIS_API_URL="" \
  --build-arg VITE_RISK_ENGINE_API_URL="" \
  --build-arg VITE_REMEDIATION_API_URL="" \
  --build-arg VITE_LEARNING_API_URL="" \
  -t <ECR_REGISTRY>/cve-remediation/dashboard:latest services/dashboard
```
In CI, set all five `VITE_*` GitLab variables to empty strings.

**5. Apply the manifests:**
```bash
kubectl apply -f k8s/base/           # namespace, secrets, ingress, network policies
kubectl apply -f k8s/monitoring/     # fluent-bit, servicemonitors, alert rules
kubectl apply -f k8s/ingestion-service/
kubectl apply -f k8s/ai-analysis-service/
kubectl apply -f k8s/risk-engine-service/
kubectl apply -f k8s/remediation-service/
kubectl apply -f k8s/dashboard/
```

**6. Verify:**
```bash
kubectl get ingress -n cve-platform          # ADDRESS should populate within ~3 min
kubectl get pods -n cve-platform             # all Running, none restarting
kubectl logs -n logging -l app=fluent-bit --tail=20
curl -s https://cve.example.com/health
```
Check metrics are being scraped — in Grafana, or directly:
```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
# then query: up{namespace="cve-platform"}  -> should show 4 targets at 1
```

## What to watch

The alert rules are in two groups, and the split is intentional. Infrastructure
alerts (`ServiceDown`, `PodCrashLooping`, `HighMemoryUsage`) catch the obvious
failures. The pipeline alerts catch the failure mode this system is actually
prone to: **every pod healthy, pipeline silently doing nothing.** An expired
Bedrock permission, a rotated Jira token, or NVD rate-limiting all produce a
perfectly green cluster that hasn't analyzed a CVE in six hours.
`AnalysisPipelineStalled` and `BedrockInvocationFailureRate` are the ones
worth routing to a real pager.

## Known gaps

- **Authentication, not authorization.** OIDC at the ALB means only known
  users get in, but every authenticated user can still trigger pipeline runs
  and edit asset profiles. Role separation (read-only analyst vs. operator)
  needs real authorization logic inside the services — it can't be done at
  the load balancer, and it isn't built.
- **No pod-to-pod mTLS.** NetworkPolicies restrict *who can connect*, but
  traffic between pods is plaintext HTTP. A service mesh (Istio/Linkerd) would
  close this; it's a significant addition and wasn't in scope.
- **Alertmanager routing isn't configured.** The rules fire, but where they go
  (Slack, PagerDuty, the SNS topic) depends on your setup — configure it in
  the kube-prometheus-stack values.
- **No Grafana dashboards shipped.** The metrics are all there and named
  consistently (`cve_analysis_*`, `cve_remediation_*`), but building dashboards
  on top is left open rather than guessing at what you'd want to see.
- **Secrets rotation**: resolved for the DB password (see below); **not
  resolvable** for the Jira token, since Atlassian has no token-rotation API -
  a reminder Lambda alerts a human instead. Both are covered in
  `infra/terraform/secrets-rotation.tf`.

## Secrets rotation

- **DB password**: fully automated via AWS's maintained RDS PostgreSQL
  single-user rotation Lambda (deployed from the Serverless Application
  Repository). Default schedule: every 30 days
  (`var.db_password_rotation_days`). Nothing to do after `terraform apply` -
  ExternalSecrets' `refreshInterval` (1h) means services pick up the new
  password within an hour of rotation, no restart required.
- **Jira API token**: Atlassian provides no API to create or rotate tokens
  programmatically - they're created interactively at
  `id.atlassian.com/manage-profile/security/api-tokens`. A daily Lambda
  (`infra/lambda/jira-rotation-reminder/`) checks the secret's age and
  publishes to the same SNS topic as the Phase 7 RDS alarms once it exceeds
  `var.jira_token_reminder_days` (default 90), with the exact manual steps in
  the alert body. This is a reminder, not automation - said plainly rather
  than implied otherwise.
