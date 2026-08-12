-- 2026-08-12: avisos para el CONDUCTOR.
--
-- Hasta hoy todo lo que el sistema tenía que decir iba dirigido al patrón
-- (tabla `avisos`, que cuelga de cliente_id). Pero cuando el dueño decide
-- sobre un parte retenido, quien tiene que enterarse es el asalariado:
--   · "rehazlo"  -> tiene que volver a registrar ese día
--   · "aceptado" -> su parte ya cuenta, y quién lo aceptó
-- Sin esto, el asalariado veía desaparecer su parte sin saber por qué.
CREATE TABLE "pilotos"."notificaciones_conductor" (
    "id" TEXT NOT NULL,
    "conductor_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    -- Referencia blanda: el parte puede haberse borrado (caso "rehacer"), así
    -- que NO se pone FK. La notificación sobrevive al parte a propósito.
    "entidad_tipo" TEXT,
    "entidad_id" TEXT,
    "leida_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_conductor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notificaciones_conductor_conductor_id_idx" ON "pilotos"."notificaciones_conductor"("conductor_id");
CREATE INDEX "notificaciones_conductor_leida_at_idx" ON "pilotos"."notificaciones_conductor"("leida_at");
