-- PilotOS Partners (DT-041): acceso de las asociaciones a su panel.
-- Una cuenta por asociación. Migración ADITIVA: tabla nueva, nada existente cambia.
CREATE TABLE IF NOT EXISTS "pilotos"."partner_cuentas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "usuario" TEXT,
    "password_hash" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "token_hash" TEXT,
    "token_tipo" TEXT,
    "token_expira" TIMESTAMP(3),
    "invitacion_enviada_at" TIMESTAMP(3),
    "invitacion_error" TEXT,
    "sesiones_validas_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_acceso" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "partner_cuentas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "partner_cuentas_codigo_key" ON "pilotos"."partner_cuentas"("codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "partner_cuentas_usuario_key" ON "pilotos"."partner_cuentas"("usuario");
CREATE UNIQUE INDEX IF NOT EXISTS "partner_cuentas_token_hash_key" ON "pilotos"."partner_cuentas"("token_hash");
