# Multi-stage build
# Stage 1 uses Node to turn the React code into static files.
# Stage 2 is a small Nginx image that only serves those files - no Node, no source code.

# ---------- Stage 1: build the static files ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG APP_VERSION=dev
ENV VITE_APP_VERSION=${APP_VERSION}
RUN npm run build   # output goes to /app/dist

# ---------- Stage 2: serve them with Nginx (runs as a non-root user) ----------
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime

USER root
RUN apk upgrade --no-cache
USER 101

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080