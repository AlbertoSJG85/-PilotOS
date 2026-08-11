-- 2026-08-11: el patrón puede marcar una anomalía como revisada desde el
-- panel. `estado` ya existía en el schema (default 'ACTIVA') pero ningún
-- endpoint lo actualizaba nunca. Se añaden columnas de trazabilidad.
ALTER TABLE "pilotos"."anomalias"
  ADD COLUMN "revisada_at" TIMESTAMP(3),
  ADD COLUMN "revisada_por" INTEGER;
