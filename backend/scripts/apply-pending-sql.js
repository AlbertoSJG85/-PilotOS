#!/usr/bin/env node
/**
 * apply-pending-sql.js
 *
 * Aplica prisma/migrations_pendientes.sql si existe.
 * Ejecutado automáticamente en cada deploy via `npm run start:prod`.
 *
 * Comportamiento:
 *   - Si el archivo no existe → continúa silenciosamente (exit 0).
 *   - Si existe → lo aplica con prisma db execute.
 *   - Si falla → corta el deploy (exit 1).
 *
 * El SQL debe ser idempotente (ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SQL_FILE = path.join(ROOT, 'prisma', 'migrations_pendientes.sql');

if (!fs.existsSync(SQL_FILE)) {
  console.log('[db:deploy] No hay migraciones pendientes.');
  process.exit(0);
}

console.log('[db:deploy] Aplicando migraciones pendientes…');

try {
  execSync(
    'npx prisma db execute --file prisma/migrations_pendientes.sql --schema prisma/schema.prisma',
    { stdio: 'inherit', cwd: ROOT }
  );
  console.log('[db:deploy] Migraciones aplicadas correctamente.');
} catch {
  console.error('[db:deploy] ERROR aplicando migraciones. Deploy abortado.');
  process.exit(1);
}
