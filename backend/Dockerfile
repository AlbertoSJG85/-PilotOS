# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# OpenSSL required by Prisma client generation
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --include=dev

COPY . .

RUN npm run build
RUN npx prisma generate

# Production stage
FROM node:20-slim

WORKDIR /app

# OpenSSL required by Prisma client at runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001

CMD ["npm", "start"]
