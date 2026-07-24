import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Env necesario para importar módulos que lo leen al cargarse
    // (auth.middleware lee JWT_SECRET; lib/prisma construye PrismaClient).
    env: {
      JWT_SECRET: 'test-secret-solo-para-tests',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/test?schema=pilotos',
      NODE_ENV: 'test',
    },
    include: ['tests/**/*.test.ts'],
    // Tests de humo puros: sin BD real. Los de integración cross-tenant
    // (Fase 2) necesitarán una BD de test dedicada.
    testTimeout: 10000,
  },
});
