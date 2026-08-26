-- PIL-01: un código de posesión sirve para un solo propósito.
--
-- Hasta ahora `password_resets` solo cubría "he olvidado la contraseña". Al
-- exigir código también para fijar la PRIMERA contraseña (bootstrap), los dos
-- flujos comparten tabla; sin este campo, un código pedido para recuperar
-- valdría para el bootstrap y al revés.
--
-- Aditiva y con default: las filas existentes conservan su significado y
-- ningún código vivo se invalida al desplegar.
ALTER TABLE "password_resets"
  ADD COLUMN "proposito" TEXT NOT NULL DEFAULT 'RECUPERACION';

-- Las consultas siempre filtran por usuario + propósito + no usado.
CREATE INDEX "password_resets_usuario_id_proposito_idx"
  ON "password_resets" ("usuario_id", "proposito");
