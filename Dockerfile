# --- STAGE 1: Build Next.js ---
FROM node:18-slim AS builder
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
# Make sure you have the .crt file in your repo root
# COPY ./ldap_ca.crt /usr/local/share/ca-certificates/ldap_ca.crt
# RUN update-ca-certificates

# 2. Install Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Copy static export from builder
COPY --from=builder /app/frontend/out ./frontend_build

# 4. Copy configs
# Note: Use 'cp' or specific paths if your nginx.conf is at the root
COPY nginx.conf /etc/nginx/sites-available/default
COPY supervisord.conf /etc/supervisord.conf

# 5. Copy backend source
COPY backend/ ./backend/

# Ensure Python can find the 'backend' folder as a package
ENV PYTHONPATH=/app
# Set environment variables (or rely on .env file via docker-compose)
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]