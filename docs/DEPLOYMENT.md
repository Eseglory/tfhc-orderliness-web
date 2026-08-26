# Docker & Container Security Deployment Guide — TFHC Orderliness Tracker

## 1. Container Security Architecture

The application is fully containerized using **Docker** and **Docker Compose**, adhering to enterprise container security best practices:

- **Lightweight Images (`node:20-alpine`):** Multi-stage builds produce minimal production runner images (~120MB for Next.js standalone and ~150MB for NestJS API).
- **Non-Root Execution (`USER node` / `USER nextjs`):** Process runs with unprivileged UID/GID to prevent container breakout vulnerabilities.
- **Healthchecks:** Automated container health checks verify database readiness, API responsiveness, and web app availability.
- **Bridge Network Isolation:** Containers communicate over a private bridge network (`tfhc_network`).

---

## 2. Docker Compose Commands

### Start All Services in Background

```bash
docker-compose up -d --build
```

### Check Container Status & Health

```bash
docker-compose ps
```

### View Application Logs

```bash
# Backend API logs
docker-compose logs -f api

# Frontend Web logs
docker-compose logs -f web

# PostgreSQL Database logs
docker-compose logs -f db
```

### Stop Services

```bash
docker-compose down
```
