-- 2026-08-11: recuperación de contraseña. Hasta hoy no existía: si olvidabas
-- la contraseña había que editar el hash a mano en la BD (pasó dos veces en
-- cuatro días). El código nunca se guarda en claro, solo su hash.
CREATE TABLE "pilotos"."password_resets" (
    "id" TEXT NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "codigo_hash" TEXT NOT NULL,
    "expira_at" TIMESTAMP(3) NOT NULL,
    "usado_at" TIMESTAMP(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "password_resets_usuario_id_idx" ON "pilotos"."password_resets"("usuario_id");
CREATE INDEX "password_resets_expira_at_idx" ON "pilotos"."password_resets"("expira_at");
