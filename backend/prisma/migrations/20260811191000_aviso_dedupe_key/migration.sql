-- 2026-08-11: PilotOS envía directo a Meta (sin la cola de n8n), así que la
-- deduplicación pasa a ser responsabilidad nuestra. Clave estable por hecho
-- avisado, no por fecha, para que un reintento al día siguiente reutilice la
-- misma fila en vez de duplicar el aviso.
ALTER TABLE "pilotos"."avisos" ADD COLUMN "dedupe_key" TEXT;
CREATE UNIQUE INDEX "avisos_dedupe_key_key" ON "pilotos"."avisos"("dedupe_key");
