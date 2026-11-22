# Multi-stage build: only the last stage becomes the image you push.

# ---------- Stage 1: production dependencies ----------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# ---------- Stage 2: tests (run with: docker build --target test .) ----------
FROM node:24-alpine AS test
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm test

# ---------- Stage 3: final runtime image ----------
FROM node:24-alpine AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PORT=3000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json app.js server.js ./

# Apply the latest OS security patches, then remove package managers
# the app doesn't need at runtime (it starts with "node", not "npm").
# Done before USER node, because both need root.
RUN apk upgrade --no-cache && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

USER 1000
EXPOSE 3000
CMD ["node", "server.js"]