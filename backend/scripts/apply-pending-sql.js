#!/usr/bin/env node
/**
 * apply-pending-sql.js
 *
 * DEPRECADO (2026-07-25): `npm run db:deploy` ya NO llama a este script —
 * usa `prisma migrate deploy` (migraciones versionadas en prisma/migrations/).
 * Se conserva por si hiciera falta aplicar SQL suelto manualmente alguna vez,
 * pero no forma parte del pipeline de deploy automatico.
 *
 * Aplica prisma/migrations_pendientes.sql si existe.
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
