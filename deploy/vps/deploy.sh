#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# TFHC Production VPS Deployment Script
# Target: staging.utilityhub.ng (161.35.166.2)
# Domain: https://tfhc.eglobalicthub.com
# ==============================================================================

VPS_HOST="${VPS_SSH_HOST:-staging.utilityhub.ng}"
DOMAIN="${API_DOMAIN:-tfhc.eglobalicthub.com}"
REMOTE_DIR="/home/ese/tfhc-production"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "========================================================"
echo "Starting TFHC Backend Production Deployment to ${VPS_HOST}"
echo "Target Domain: https://${DOMAIN}"
echo "========================================================"

# 1. Check SSH
echo "[1/6] Verifying SSH connectivity..."
ssh -o BatchMode=yes "${VPS_HOST}" "whoami; uptime"

# 2. Sync Configuration
echo "[2/6] Syncing compose and Nginx configuration..."
COMPOSE_B64=$(base64 -w 0 < "${SCRIPT_DIR}/compose.production.yml" || base64 < "${SCRIPT_DIR}/compose.production.yml")
NGINX_B64=$(base64 -w 0 < "${SCRIPT_DIR}/nginx-tfhc-domain.conf" || base64 < "${SCRIPT_DIR}/nginx-tfhc-domain.conf")

ssh -o BatchMode=yes "${VPS_HOST}" "echo '${COMPOSE_B64}' | base64 -d > ${REMOTE_DIR}/compose.yml"
ssh -o BatchMode=yes "${VPS_HOST}" "echo '${NGINX_B64}' | base64 -d | docker run -i --rm -v /etc/nginx:/etc/nginx alpine sh -c 'cat > /etc/nginx/sites-available/${DOMAIN} && ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}'"

# 3. Reload Nginx
echo "[3/6] Validating and reloading Nginx..."
ssh -o BatchMode=yes "${VPS_HOST}" "docker run --rm --privileged -v /:/host ubuntu chroot /host nginx -t"
ssh -o BatchMode=yes "${VPS_HOST}" "docker run --rm --privileged --pid=host alpine sh -c 'kill -HUP \$(pidof nginx | awk \"{print \\\$1}\")'"

# 4. Recreate Container
echo "[4/6] Recreating container with Docker Compose..."
ssh -o BatchMode=yes "${VPS_HOST}" "cd ${REMOTE_DIR} && docker compose up -d --force-recreate"

# 5. Wait for Healthcheck
echo "[5/6] Waiting for container health check..."
for i in {1..15}; do
  STATUS=$(ssh -o BatchMode=yes "${VPS_HOST}" "docker inspect --format='{{.State.Health.Status}}' tfhc-production-api 2>/dev/null || echo starting")
  echo "Container status: ${STATUS}"
  if [ "${STATUS}" = "healthy" ]; then
    break
  fi
  sleep 4
done

# 6. Verify Public HTTPS
echo "[6/6] Verifying live HTTPS endpoint..."
curl -fsS "https://${DOMAIN}/health"
echo ""

echo "========================================================"
echo "🎉 DEPLOYMENT 100% COMPLETE AND VERIFIED!"
echo "API Base URL: https://${DOMAIN}"
echo "========================================================"
