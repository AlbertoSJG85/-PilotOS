-- 2026-08-12: un parte con discrepancias no puede contar en los globales
-- hasta que el dueño lo mire. Nuevo estado PENDIENTE_VALIDACION (el campo
-- `estado` ya existe y es texto libre, no hace falta tocar el tipo) y traza
-- de quién lo aceptó: sin esa traza, cualquier recálculo posterior volvería
-- a retener un parte que el dueño ya había dado por bueno.
ALTER TABLE "pilotos"."partes_diarios" ADD COLUMN "validado_por" INTEGER;
ALTER TABLE "pilotos"."partes_diarios" ADD COLUMN "validado_at" TIMESTAMP(3);
