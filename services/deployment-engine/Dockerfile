FROM node:20-alpine AS base
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/deployment-engine/package.json services/deployment-engine/package.json
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
RUN npm install

COPY . .
RUN npx prisma generate --schema=apps/control-plane/prisma/schema.prisma
RUN npm --workspace packages/shared run build && npm --workspace services/deployment-engine run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install Docker CLI and buildx for managing deployments
RUN apk add --no-cache docker-cli curl && \
    mkdir -p /root/.docker/cli-plugins && \
    curl -fsSL "https://github.com/docker/buildx/releases/download/v0.12.0/buildx-v0.12.0.linux-amd64" \
      -o /root/.docker/cli-plugins/docker-buildx && \
    chmod +x /root/.docker/cli-plugins/docker-buildx && \
    docker buildx install && \
    apk del curl

COPY --from=base /app /app
EXPOSE 9102
CMD ["npm", "--workspace", "services/deployment-engine", "run", "start"]
