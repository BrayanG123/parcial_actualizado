# API NestJS para docker compose y Azure Container Apps.
FROM node:24-bookworm-slim AS build
WORKDIR /app

# tsconfig debe existir antes de npm ci: prisma generate (postinstall) lo lee para
# emitir imports .js compatibles con nodenext; sin el, genera imports .ts.
COPY package.json package-lock.json prisma.config.ts tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
# prisma generate solo valida el formato de la URL; no se conecta.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm ci --no-audit --no-fund

COPY src ./src
RUN npx nest build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Se conservan las dependencias de desarrollo: prisma migrate y los seeds (tsx) se ejecutan en el contenedor.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json prisma.config.ts docker-entrypoint.sh ./
COPY --chown=node:node prisma ./prisma
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/'+(process.env.API_PREFIX||'api/v1')).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
