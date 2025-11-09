# syntax=docker/dockerfile:1.7

# Build the client assets and prepare the workspace
FROM node:20-bookworm AS builder
WORKDIR /app

# Install dependencies (uses npm workspaces)
COPY package*.json ./
COPY client/package*.json client/
COPY server/package*.json server/
RUN npm ci

# Copy source code and build the client bundle
COPY . .
RUN npm run build

# Production image with only runtime dependencies
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy static assets and shared modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/client/dist ./client/dist

# Install server production dependencies without bringing over builder node_modules
WORKDIR /app/server
COPY --from=builder /app/server/package*.json ./
RUN npm ci --omit=dev

# Copy server source excluding prebuilt node_modules so Alpine dependencies remain intact
COPY --from=builder /app/server ./ --exclude=node_modules

EXPOSE 8021
CMD ["node", "app.js"]
