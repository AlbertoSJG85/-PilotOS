-- 2026-08-12: conexión con el Drive DEL CLIENTE.
--
-- Los archivos NO se guardan en un Drive nuestro: van al Drive del propio
-- taxista, en su cuenta de Google. Aquí solo se guarda el permiso que él nos
-- da (el token de Google) para poder dejarle los documentos en su carpeta.
--
-- Tabla propia de PilotOS y NO las columnas google_* de minos."Users" a
-- propósito: RentOS usa esas columnas para su conexión de Gmail, y un cliente
-- que use los dos productos se desconectaría de uno al conectar el otro, sin
-- avisar. Son permisos distintos (Gmail de lectura vs Drive de escritura).
CREATE TABLE "pilotos"."conexiones_drive" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "google_email" TEXT,
    -- Tokens cifrados con AES-256-GCM (ver lib/cifrado.ts). Nunca en claro.
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expira_at" TIMESTAMP(3),
    -- Id de la carpeta "PilotOS" creada en su Drive, para no buscarla cada vez.
    "carpeta_raiz_id" TEXT,
    "conectado_por" INTEGER,
    "conectado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocado_at" TIMESTAMP(3),
    "ultimo_error" TEXT,

    CONSTRAINT "conexiones_drive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conexiones_drive_cliente_id_key" ON "pilotos"."conexiones_drive"("cliente_id");

ALTER TABLE "pilotos"."conexiones_drive"
  ADD CONSTRAINT "conexiones_drive_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "pilotos"."clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dónde acabó cada documento en su Drive, para poder enlazarlo desde la app.
ALTER TABLE "pilotos"."documentos" ADD COLUMN IF NOT EXISTS "drive_web_link" TEXT;
