# --- STAGE 1: Build Next.js ---
# Bumped to 20-slim to support Next.js 16 requirements
FROM node:20-slim AS builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- STAGE 2: Monolith ---
FROM python:3.11-slim

# Install Nginx, Supervisor, and CA-Certificates for SSL
RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Trust your LDAP SSL Certificate (If using a private CA)
# COPY ./ldap_ca.crt /usr/local/share/ca-certificates/ldap_ca.crt
# RUN update-ca-certificates

# 2. Install Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Copy static export from builder
COPY --from=builder /app/frontend/out ./frontend_build

# 4. Copy configs
COPY nginx.conf /etc/nginx/sites-available/default
COPY supervisord.conf /etc/supervisord.conf

# 5. Copy backend source
COPY backend/ ./backend/

# Environment setup
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]