FROM node:20-alpine AS base
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
RUN npm install

COPY . .
RUN npm --workspace apps/dashboard run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app /app
EXPOSE 3000
CMD ["npm", "--workspace", "apps/dashboard", "run", "start"]
