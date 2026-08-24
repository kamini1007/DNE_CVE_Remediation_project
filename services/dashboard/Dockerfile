# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY index.html vite.config.js ./
COPY src ./src

# Vite inlines VITE_* env vars at build time, so the API URLs must be passed
# as build args - they can't be changed at container runtime the way a
# server-side service's env vars can.
#
# Deployed behind the Phase 7 ingress, these are set to EMPTY strings, making
# the dashboard use relative same-origin paths (no CORS). For a standalone
# deployment where the services live on other origins, pass absolute URLs.
ARG VITE_INGESTION_API_URL
ARG VITE_AI_ANALYSIS_API_URL
ARG VITE_RISK_ENGINE_API_URL
ARG VITE_REMEDIATION_API_URL
ARG VITE_LEARNING_API_URL
RUN npm run build

# --- Runtime stage ---
# nginx-unprivileged (not the standard nginx image): runs as UID 101 non-root
# and listens on 8080, so the pod can enforce runAsNonRoot without needing
# CAP_NET_BIND_SERVICE to bind a privileged port.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
