-- PIL-03 — Poder cortar una sesión de verdad.
--
-- El JWT de PilotOS dura 30 días y no habia forma de invalidarlo. Un móvil
-- robado, un conductor despedido o una contraseña cambiada porque sospechas que
-- alguien entró: en los tres casos el token seguía funcionando un mes entero.
-- Cambiar la contraseña no echaba al intruso.
--
-- Este campo es el corte: todo JWT emitido antes de este instante deja de valer.
-- Se compara contra el `iat` que ya lleva cada token, así que no hace falta
-- guardar ni una lista de tokens ni un registro por sesión.
--
-- Aditiva y nullable: las filas existentes quedan sin revocación, que es
-- exactamente el comportamiento de hoy. Nadie pierde la sesión al desplegar.
ALTER TABLE minos."Users"
  ADD COLUMN IF NOT EXISTS "sesiones_validas_desde" TIMESTAMPTZ;
