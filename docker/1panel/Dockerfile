FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html metadata.json server.ts ./
COPY server ./server
COPY src ./src
COPY public ./public
COPY assets ./assets

RUN npm run build \
    && npm prune --omit=dev \
    && npm cache clean --force

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=1888 \
    APP_VERSION=3.0.6 \
    DATABASE_PATH=/var/lib/xui-assistant/app.db

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN mkdir -p /var/lib/xui-assistant \
    && chown -R node:node /app /var/lib/xui-assistant

USER node

EXPOSE 1888
VOLUME ["/var/lib/xui-assistant"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "const request=require('http').get('http://127.0.0.1:1888/api/health',response=>process.exit(response.statusCode===200?0:1));request.on('error',()=>process.exit(1));request.setTimeout(4000,()=>{request.destroy();process.exit(1)})"

CMD ["node", "dist/server.cjs"]

