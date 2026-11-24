-- PilotOS Partners: código de la asociación que recomendó PilotOS, recogido en el
-- alta. Se transporta a NexOS Pay para atribuir al cliente; no es un descuento.
-- Migración ADITIVA: columna nula, sin efecto sobre los altas existentes.
ALTER TABLE "pilotos"."onboarding" ADD COLUMN IF NOT EXISTS "codigo_asociacion" TEXT;
