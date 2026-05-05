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
