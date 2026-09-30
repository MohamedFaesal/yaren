FROM node:24-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-kernel/package.json packages/shared-kernel/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/identity/package.json packages/identity/package.json
COPY packages/organization/package.json packages/organization/package.json
COPY packages/patient-registry/package.json packages/patient-registry/package.json
COPY packages/scheduling/package.json packages/scheduling/package.json
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 3000
CMD ["pnpm", "--filter", "@yaren/api", "start"]
