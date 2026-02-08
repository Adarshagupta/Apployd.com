FROM node:20-alpine AS base
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/control-plane/package.json apps/control-plane/package.json
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
RUN npm install

COPY . .
RUN npx prisma generate --schema=apps/control-plane/prisma/schema.prisma
RUN npm --workspace packages/shared run build && npm --workspace apps/control-plane run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app /app
EXPOSE 4000
CMD ["npm", "--workspace", "apps/control-plane", "run", "start"]
