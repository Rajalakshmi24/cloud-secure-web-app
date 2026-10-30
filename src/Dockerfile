# Stage 1: Build & Dependencies
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Minimal Runtime
FROM node:20-alpine
WORKDIR /app

# Run as non-root user for security
USER node

COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node . .

EXPOSE 3000

ENV NODE_ENV=production
CMD ["node", "server.js"]