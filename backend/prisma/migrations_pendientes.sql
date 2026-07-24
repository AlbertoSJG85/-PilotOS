-- Migraciones pendientes para aplicar en producción
-- Aplicar via: psql $DATABASE_URL -f migrations_pendientes.sql
-- O bien desde la terminal del contenedor en Coolify

-- ========================================================
-- 2026-05-05 · Bloque fix/tickets-fotos-ocr-cotejo
-- ========================================================

-- Campos de trazabilidad OCR en Documento
ALTER TABLE pilotos.documentos
  ADD COLUMN IF NOT EXISTS ocr_error   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS estado_ocr  VARCHAR(50) DEFAULT 'PENDIENTE';

-- Trazabilidad de Anomalia: FK suave al parte y al documento + estado de ciclo de vida
ALTER TABLE pilotos.anomalias
  ADD COLUMN IF NOT EXISTS parte_diario_id UUID,
  ADD COLUMN IF NOT EXISTS documento_id    UUID,
  ADD COLUMN IF NOT EXISTS estado         VARCHAR(50) NOT NULL DEFAULT 'ACTIVA';

-- Índices de consulta (opcionales pero recomendados)
CREATE INDEX IF NOT EXISTS idx_anomalias_parte ON pilotos.anomalias (parte_diario_id);
CREATE INDEX IF NOT EXISTS idx_anomalias_estado ON pilotos.anomalias (estado);
CREATE INDEX IF NOT EXISTS idx_documentos_estado_ocr ON pilotos.documentos (estado_ocr);

-- ========================================================
-- 2026-07-24 · Fase 4 auditoria seguridad (exactitud economica)
-- ========================================================

-- Separa "neto operativo" (bruto - combustible, siempre) de "base de reparto"
-- (lo que realmente se divide entre conductor y patron, ver calculo.service.ts)
ALTER TABLE pilotos.calculos_partes
  ADD COLUMN IF NOT EXISTS base_reparto DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Evita generar dos cierres para el mismo cliente y el mismo rango de fechas.
-- CREATE UNIQUE INDEX en vez de ADD CONSTRAINT porque Postgres no soporta
-- "ADD CONSTRAINT ... IF NOT EXISTS" (solo columnas e indices lo soportan);
-- un indice unico aplica la misma restriccion a nivel de motor.
CREATE UNIQUE INDEX IF NOT EXISTS cierres_periodo_cliente_periodo_key
  ON pilotos.cierres_periodo (cliente_id, periodo_inicio, periodo_fin);
