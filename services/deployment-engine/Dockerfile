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

# Install Docker CLI + BuildKit (buildx) for cached, fast builds
RUN apk add --no-cache docker-cli docker-cli-buildx

COPY --from=base /app /app
EXPOSE 9102
CMD ["npm", "--workspace", "services/deployment-engine", "run", "start"]
