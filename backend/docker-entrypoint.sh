#!/bin/sh
set -e

# RUN_MIGRATIONS=true aplica las migraciones pendientes antes de iniciar la API.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "Aplicando migraciones de Prisma..."
  npx prisma migrate deploy
fi

exec node dist/main.js
