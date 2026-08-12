-- 2026-08-12: documentación del vehículo (ITV, facturas de taller) con
-- confirmación humana.
--
-- La regla que fijó Alberto: el OCR PROPONE y una persona confirma. Si esa
-- persona acepta lo que dice la imagen, se aplica. Si la contradice, hay que
-- guardar las dos versiones y —cuando quien corrige es el asalariado— que lo
-- revise el dueño. Lo que dispara la revisión es contradecir al documento,
-- no quién lo sube.
--
-- `ocr_datos_extraidos` sigue siendo lo que leyó la máquina, intacto.
-- `datos_confirmados` es lo que vale. Tener los dos separados es el requisito
-- que pidió: si mañana un importe no cuadra, se ve de dónde salió.
ALTER TABLE "pilotos"."documentos" ADD COLUMN IF NOT EXISTS "datos_confirmados" JSONB;
ALTER TABLE "pilotos"."documentos" ADD COLUMN IF NOT EXISTS "confirmado_por" INTEGER;
ALTER TABLE "pilotos"."documentos" ADD COLUMN IF NOT EXISTS "confirmado_at" TIMESTAMP(3);
ALTER TABLE "pilotos"."documentos" ADD COLUMN IF NOT EXISTS "corregido" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pilotos"."documentos" ADD COLUMN IF NOT EXISTS "revisado_por" INTEGER;
ALTER TABLE "pilotos"."documentos" ADD COLUMN IF NOT EXISTS "revisado_at" TIMESTAMP(3);
-- Momento en que los efectos (mantenimiento al día + gasto) se aplicaron.
-- Sirve de candado de idempotencia: un documento no puede reiniciar dos veces
-- el mismo contador ni duplicar el gasto.
ALTER TABLE "pilotos"."documentos" ADD COLUMN IF NOT EXISTS "aplicado_at" TIMESTAMP(3);
ALTER TABLE "pilotos"."documentos" ADD COLUMN IF NOT EXISTS "gasto_id" TEXT;

-- El indice por vehiculo ya lo creo la migracion del 2026-08-11; IF NOT
-- EXISTS para que esta migracion sea reaplicable sin romperse.
CREATE INDEX IF NOT EXISTS "documentos_vehiculo_id_idx" ON "pilotos"."documentos"("vehiculo_id");
CREATE INDEX IF NOT EXISTS "documentos_estado_idx" ON "pilotos"."documentos"("estado");
