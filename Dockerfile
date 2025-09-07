# Multi-stage Dockerfile for Railway deployment - Playwright MCP Server
FROM node:18-slim AS base

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libgtk-3-0 \
    libgbm-dev \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_ENV=production

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install production dependencies
FROM base AS dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Install Playwright browsers
RUN npx playwright install --with-deps chromium firefox webkit

# Development stage
FROM base AS development
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM base AS production

# Copy production dependencies and browsers from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /ms-playwright /ms-playwright

# Copy built application
COPY --from=development /app/dist ./dist
COPY --from=development /app/package.json ./

# Create non-root user for security
RUN groupadd -g 1001 -r nodejs && \
    useradd -r -g nodejs -u 1001 nodejs

# Set ownership and permissions
RUN chown -R nodejs:nodejs /app
USER nodejs

# Railway-specific environment variables
ENV RAILWAY_DEPLOYMENT=true
ENV NODE_ENV=production

# Health check for Railway
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "const http = require('http'); \
        const req = http.request({hostname:'0.0.0.0',port:process.env.PORT||3001,path:'/status'}, \
        (res) => process.exit(res.statusCode === 200 ? 0 : 1)); \
        req.on('error', () => process.exit(1)); req.end();"

# Expose dynamic port for Railway
EXPOSE $PORT

# Start the HTTP server (Railway-compatible)
CMD ["node", "dist/http-server.js"]

# Labels for container metadata
LABEL maintainer="Playwright MCP Server Team"
LABEL version="1.0.0"
LABEL description="Railway-optimized MCP server for Playwright automation with ChatGPT Desktop support"
LABEL platform="Railway"
LABEL transport="HTTPS + SSE"