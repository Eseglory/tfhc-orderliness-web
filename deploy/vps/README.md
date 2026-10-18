# TFHC Production VPS Deployment

## Overview
The TFHC backend API is deployed on the UtilityHub VPS (`staging.utilityhub.ng` / `161.35.166.2`) under the dedicated domain:
**`https://tfhc.eglobalicthub.com`**

The backend connects directly to the **Supabase PostgreSQL** central database, using the persistent production environment and real-time Socket.IO WebSocket support.

---

## Architecture & Configuration

* **Server:** `ubuntu-s-1vcpu-1gb-lon1-01` (DigitalOcean Droplet `161.35.166.2`)
* **Service Directory:** `/home/ese/tfhc-production`
* **Docker Service:** `tfhc-production-api`
* **Port Mapping:** `127.0.0.1:14001:4000` (internal loopback only)
* **Reverse Proxy:** Nginx with HTTP/2 and Let's Encrypt SSL/TLS
* **Domain:** `tfhc.eglobalicthub.com`
* **Database:** Central Supabase PostgreSQL (`DATABASE_URL`)
* **Realtime Chat Hot Store:** `/var/data/chat-cache.db` (WAL mode SQLite buffer for sub-millisecond local messaging, synchronizing to Supabase)

---

## Endpoints

* **Base API:** `https://tfhc.eglobalicthub.com`
* **Health Check:** `https://tfhc.eglobalicthub.com/health` -> `{"status":"ok"}`
* **Socket.IO:** `https://tfhc.eglobalicthub.com/socket.io/` (supports WebSocket and polling upgrades)

---

## Deployment & Operation

### 1-Command Automated Deploy (from repository)

Run via Yarn / NPM:
```bash
yarn deploy:vps
```

Or run directly via Node:
```bash
node scripts/deploy-to-vps.cjs
```

Or via Bash:
```bash
./deploy/vps/deploy.sh
```

### Manual VPS Inspection

To check status and logs on the VPS:
```bash
ssh staging.utilityhub.ng "docker ps --filter name=tfhc-production-api"
ssh staging.utilityhub.ng "docker logs --tail 50 tfhc-production-api"
```

To test public health:
```bash
curl -i https://tfhc.eglobalicthub.com/health
```
