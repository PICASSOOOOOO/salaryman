FROM node:24-bookworm-slim AS build

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/interview-helper run build
RUN pnpm --filter @workspace/api-server run build

FROM node:24-bookworm-slim AS runtime

WORKDIR /workspace

ENV NODE_ENV=production \
    PORT=8080 \
    NODE_PATH=/workspace/artifacts/api-server/dist/runtime/node_modules

COPY --from=build /workspace/artifacts/api-server/dist /workspace/artifacts/api-server/dist
COPY --from=build /workspace/artifacts/interview-helper/dist/public /workspace/artifacts/interview-helper/dist/public

EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.cjs"]
