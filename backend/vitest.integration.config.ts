import { defineConfig } from 'vitest/config';

/**
 * Config separada de la de unit tests (vitest.config.ts). Estos tests hablan
 * con una BD real (Postgres local, desechable — NUNCA la compartida de
 * produccion). Se ejecutan con `npm run test:integration`, no con `npm test`,
 * para que la suite rapida de siempre siga sin depender de tener Docker/una
 * BD levantada.
 *
 * Arrancar la BD local antes de correr esto:
 *   docker run -d --name pilotos-test-pg -e POSTGRES_PASSWORD=test \
 *     -e POSTGRES_DB=pilotos_test -p 55433:5432 postgres:16-alpine
 *   DATABASE_URL="postgresql://postgres:test@localhost:55433/pilotos_test?schema=pilotos" \
 *     npx prisma db push --skip-generate
 */
export default defineConfig({
  test: {
    env: {
      JWT_SECRET: 'test-secret-solo-para-tests',
      DATABASE_URL: process.env.DATABASE_URL
        || 'postgresql://postgres:test@localhost:55433/pilotos_test?schema=pilotos',
      NODE_ENV: 'test',
    },
    include: ['tests-integration/**/*.test.ts'],
    testTimeout: 20000,
    // Las pruebas comparten una unica BD; correrlas en serie evita que dos
    // archivos pisen los mismos datos globales (p.ej. mantenimiento_catalogo).
    fileParallelism: false,
  },
});
