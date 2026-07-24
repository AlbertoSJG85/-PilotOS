-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ledger";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "minos";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "pilotos";

-- CreateTable
CREATE TABLE "minos"."Users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) DEFAULT 'user',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "google_access_token" TEXT,
    "google_refresh_token" TEXT,
    "google_token_expiry" BIGINT,
    "google_email" VARCHAR(255),
    "gmail_connected" BOOLEAN DEFAULT false,
    "forwarding_verified" BOOLEAN DEFAULT false,
    "nombre" VARCHAR(255),
    "nif_cif" VARCHAR(50),
    "stripe_customer_id" VARCHAR(100),
    "stripe_subscription_id" VARCHAR(100),
    "cuota_mensual" DECIMAL(10,2) DEFAULT 0.00,
    "estado_pago" VARCHAR(20) DEFAULT 'AL DIA',
    "fecha_bloqueo" TIMESTAMP(6),
    "telefono" VARCHAR(50),
    "gmail_last_scan" TIMESTAMPTZ(6),

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger"."Eventos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo_evento" VARCHAR(100) NOT NULL,
    "dedupe_key" VARCHAR(500) NOT NULL,
    "timestamp" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "datos" JSONB NOT NULL,
    "estado" VARCHAR(20) DEFAULT 'OK',
    "source" VARCHAR(50) DEFAULT 'UNKNOWN',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."clientes" (
    "id" TEXT NOT NULL,
    "patron_id" INTEGER NOT NULL,
    "nombre_comercial" TEXT,
    "tipo_actividad" TEXT NOT NULL DEFAULT 'TAXI',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "preferencias_avisos" JSONB,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."conductores" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "es_patron" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conductores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."vehiculos" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "fecha_matriculacion" TIMESTAMP(3) NOT NULL,
    "tipo_combustible" TEXT NOT NULL,
    "tipo_transmision" TEXT NOT NULL,
    "km_actuales" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehiculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."vehiculo_conductores" (
    "id" TEXT NOT NULL,
    "vehiculo_id" TEXT NOT NULL,
    "conductor_id" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehiculo_conductores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."configuracion_economica" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "modelo_reparto" TEXT NOT NULL DEFAULT 'PORCENTAJE',
    "porcentaje_conductor" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "porcentaje_patron" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "cuota_pilotos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "incluye_combustible_en_reparto" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "conductor_id" TEXT,
    "fecha_inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_fin" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_economica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."partes_diarios" (
    "id" TEXT NOT NULL,
    "fecha_trabajada" DATE NOT NULL,
    "fecha_envio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehiculo_id" TEXT NOT NULL,
    "conductor_id" TEXT NOT NULL,
    "km_inicio" INTEGER NOT NULL,
    "km_fin" INTEGER NOT NULL,
    "ingreso_bruto" DECIMAL(10,2) NOT NULL,
    "ingreso_datafono" DECIMAL(10,2) NOT NULL,
    "combustible" DECIMAL(10,2),
    "varios" DECIMAL(10,2),
    "concepto_varios" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'ENVIADO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partes_diarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."calculos_partes" (
    "id" TEXT NOT NULL,
    "parte_diario_id" TEXT NOT NULL,
    "configuracion_id" TEXT NOT NULL,
    "bruto_diario" DECIMAL(10,2) NOT NULL,
    "combustible" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "neto_diario" DECIMAL(10,2) NOT NULL,
    "varios" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "parte_conductor" DECIMAL(10,2) NOT NULL,
    "parte_patron" DECIMAL(10,2) NOT NULL,
    "modelo_reparto_aplicado" TEXT NOT NULL,
    "porcentaje_conductor_aplicado" DECIMAL(5,2) NOT NULL,
    "porcentaje_patron_aplicado" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "base_reparto" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "calculos_partes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."documentos" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "drive_file_id" TEXT,
    "hash_sha256" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'RECIBIDO',
    "ocr_texto" TEXT,
    "ocr_confianza" DOUBLE PRECISION,
    "ocr_datos_extraidos" JSONB,
    "intentos_reemplazo" INTEGER NOT NULL DEFAULT 0,
    "subido_por_usuario_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ocr_error" VARCHAR(100),
    "estado_ocr" VARCHAR(50) DEFAULT 'PENDIENTE',

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."documento_enlaces" (
    "id" TEXT NOT NULL,
    "documento_id" TEXT NOT NULL,
    "entidad_tipo" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_enlaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."documento_historial" (
    "id" TEXT NOT NULL,
    "documento_id" TEXT NOT NULL,
    "url_anterior" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_historial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."tareas_pendientes" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "entidad_tipo" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "conductor_id" TEXT NOT NULL,
    "resuelta" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "tareas_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."anomalias" (
    "id" TEXT NOT NULL,
    "conductor_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "notificada" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parte_diario_id" UUID,
    "documento_id" UUID,
    "estado" VARCHAR(50) NOT NULL DEFAULT 'ACTIVA',

    CONSTRAINT "anomalias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."incidencias" (
    "id" TEXT NOT NULL,
    "parte_diario_id" TEXT NOT NULL,
    "que_ocurrio" TEXT NOT NULL,
    "decision_tomada" TEXT NOT NULL,
    "justificacion" TEXT NOT NULL,
    "autorizador_id" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'CREADA',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "incidencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."gastos" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "vehiculo_id" TEXT,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "importe" DECIMAL(10,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "forma_pago" TEXT,
    "url_factura" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'REGISTRADO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."gastos_fijos" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "vehiculo_id" TEXT,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "importe" DECIMAL(10,2) NOT NULL,
    "periodicidad" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gastos_fijos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."mantenimiento_catalogo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "frecuencia_km" INTEGER,
    "frecuencia_meses" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mantenimiento_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."mantenimientos_vehiculos" (
    "id" TEXT NOT NULL,
    "vehiculo_id" TEXT NOT NULL,
    "catalogo_id" TEXT NOT NULL,
    "ultima_ejecucion_km" INTEGER,
    "ultima_ejecucion_fecha" TIMESTAMP(3),
    "proximo_km" INTEGER,
    "proxima_fecha" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "frecuencia_aprendida" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "frecuencia_km_personalizada" INTEGER,
    "frecuencia_meses_personalizada" INTEGER,
    "ultimo_nivel_aviso_km" INTEGER,
    "ultimo_nivel_aviso_dias" INTEGER,

    CONSTRAINT "mantenimientos_vehiculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."seguimiento_mantenimiento" (
    "id" TEXT NOT NULL,
    "mantenimiento_vehiculo_id" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" TEXT,
    "km_en_momento" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seguimiento_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."avisos" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "entidad_tipo" TEXT,
    "entidad_id" TEXT,
    "leido" BOOLEAN NOT NULL DEFAULT false,
    "enviado" BOOLEAN NOT NULL DEFAULT false,
    "enviado_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canal" VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error_envio" VARCHAR(500),

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."cierres_periodo" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "periodo_inicio" DATE NOT NULL,
    "periodo_fin" DATE NOT NULL,
    "total_bruto" DECIMAL(10,2) NOT NULL,
    "total_combustible" DECIMAL(10,2) NOT NULL,
    "total_neto" DECIMAL(10,2) NOT NULL,
    "total_gastos_fijos" DECIMAL(10,2) NOT NULL,
    "total_gastos_variables" DECIMAL(10,2) NOT NULL,
    "total_conductor" DECIMAL(10,2) NOT NULL,
    "total_patron" DECIMAL(10,2) NOT NULL,
    "cuota_pilotos" DECIMAL(10,2) NOT NULL,
    "num_partes" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cierres_periodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilotos"."onboarding" (
    "id" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "nombre_patron" TEXT,
    "email_patron" TEXT,
    "nif_cif" TEXT,
    "nombre_comercial" TEXT,
    "tipo_actividad" TEXT,
    "asalariados" JSONB,
    "gastos_fijos" JSONB,
    "matricula" TEXT,
    "marca_modelo" TEXT,
    "fecha_matriculacion" TIMESTAMP(3),
    "tipo_combustible" TEXT,
    "tipo_transmision" TEXT,
    "km_actuales" INTEGER,
    "seguro_vigencia" TIMESTAMP(3),
    "preferencias_avisos" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "minos"."LegalAcceptances" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "product_key" VARCHAR NOT NULL,
    "accepted_pilot_terms" BOOLEAN NOT NULL DEFAULT false,
    "accepted_privacy_policy" BOOLEAN NOT NULL DEFAULT false,
    "accepted_marketing" BOOLEAN NOT NULL DEFAULT false,
    "ip_address" VARCHAR,
    "user_agent" TEXT,
    "accepted_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAcceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "minos"."Users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Eventos_dedupe_key_key" ON "ledger"."Eventos"("dedupe_key");

-- CreateIndex
CREATE INDEX "idx_eventos_dedupe" ON "ledger"."Eventos"("dedupe_key");

-- CreateIndex
CREATE INDEX "idx_eventos_timestamp" ON "ledger"."Eventos"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "idx_eventos_tipo" ON "ledger"."Eventos"("tipo_evento");

-- CreateIndex
CREATE UNIQUE INDEX "conductores_cliente_id_usuario_id_key" ON "pilotos"."conductores"("cliente_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_matricula_key" ON "pilotos"."vehiculos"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculo_conductores_vehiculo_id_conductor_id_key" ON "pilotos"."vehiculo_conductores"("vehiculo_id", "conductor_id");

-- CreateIndex
CREATE UNIQUE INDEX "partes_diarios_vehiculo_id_fecha_trabajada_key" ON "pilotos"."partes_diarios"("vehiculo_id", "fecha_trabajada");

-- CreateIndex
CREATE UNIQUE INDEX "calculos_partes_parte_diario_id_key" ON "pilotos"."calculos_partes"("parte_diario_id");

-- CreateIndex
CREATE INDEX "idx_documentos_estado_ocr" ON "pilotos"."documentos"("estado_ocr");

-- CreateIndex
CREATE UNIQUE INDEX "documento_enlaces_documento_id_entidad_tipo_entidad_id_key" ON "pilotos"."documento_enlaces"("documento_id", "entidad_tipo", "entidad_id");

-- CreateIndex
CREATE INDEX "idx_anomalias_estado" ON "pilotos"."anomalias"("estado");

-- CreateIndex
CREATE INDEX "idx_anomalias_parte" ON "pilotos"."anomalias"("parte_diario_id");

-- CreateIndex
CREATE UNIQUE INDEX "mantenimiento_catalogo_nombre_key" ON "pilotos"."mantenimiento_catalogo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "mantenimientos_vehiculos_vehiculo_id_catalogo_id_key" ON "pilotos"."mantenimientos_vehiculos"("vehiculo_id", "catalogo_id");

-- CreateIndex
CREATE UNIQUE INDEX "cierres_periodo_cliente_periodo_key" ON "pilotos"."cierres_periodo"("cliente_id", "periodo_inicio", "periodo_fin");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_telefono_key" ON "pilotos"."onboarding"("telefono");

-- CreateIndex
CREATE INDEX "idx_legal_acceptances_user" ON "minos"."LegalAcceptances"("user_id");

-- AddForeignKey
ALTER TABLE "pilotos"."clientes" ADD CONSTRAINT "clientes_patron_id_fkey" FOREIGN KEY ("patron_id") REFERENCES "minos"."Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."conductores" ADD CONSTRAINT "conductores_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "pilotos"."clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."conductores" ADD CONSTRAINT "conductores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "minos"."Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."vehiculos" ADD CONSTRAINT "vehiculos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "pilotos"."clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."vehiculo_conductores" ADD CONSTRAINT "vehiculo_conductores_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "pilotos"."conductores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."vehiculo_conductores" ADD CONSTRAINT "vehiculo_conductores_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "pilotos"."vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."configuracion_economica" ADD CONSTRAINT "configuracion_economica_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "pilotos"."clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."configuracion_economica" ADD CONSTRAINT "configuracion_economica_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "pilotos"."conductores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."partes_diarios" ADD CONSTRAINT "partes_diarios_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "pilotos"."conductores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."partes_diarios" ADD CONSTRAINT "partes_diarios_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "pilotos"."vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."calculos_partes" ADD CONSTRAINT "calculos_partes_configuracion_id_fkey" FOREIGN KEY ("configuracion_id") REFERENCES "pilotos"."configuracion_economica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."calculos_partes" ADD CONSTRAINT "calculos_partes_parte_diario_id_fkey" FOREIGN KEY ("parte_diario_id") REFERENCES "pilotos"."partes_diarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."documento_enlaces" ADD CONSTRAINT "doc_enlace_parte_fk" FOREIGN KEY ("entidad_id") REFERENCES "pilotos"."partes_diarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."documento_enlaces" ADD CONSTRAINT "documento_enlaces_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "pilotos"."documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."documento_historial" ADD CONSTRAINT "documento_historial_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "pilotos"."documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."anomalias" ADD CONSTRAINT "anomalias_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "pilotos"."conductores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."incidencias" ADD CONSTRAINT "incidencias_parte_diario_id_fkey" FOREIGN KEY ("parte_diario_id") REFERENCES "pilotos"."partes_diarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."gastos_fijos" ADD CONSTRAINT "gastos_fijos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "pilotos"."clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."gastos_fijos" ADD CONSTRAINT "gastos_fijos_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "pilotos"."vehiculos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."mantenimientos_vehiculos" ADD CONSTRAINT "mantenimientos_vehiculos_catalogo_id_fkey" FOREIGN KEY ("catalogo_id") REFERENCES "pilotos"."mantenimiento_catalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."mantenimientos_vehiculos" ADD CONSTRAINT "mantenimientos_vehiculos_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "pilotos"."vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."seguimiento_mantenimiento" ADD CONSTRAINT "seguimiento_mantenimiento_mantenimiento_vehiculo_id_fkey" FOREIGN KEY ("mantenimiento_vehiculo_id") REFERENCES "pilotos"."mantenimientos_vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilotos"."cierres_periodo" ADD CONSTRAINT "cierres_periodo_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "pilotos"."clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minos"."LegalAcceptances" ADD CONSTRAINT "LegalAcceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "minos"."Users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

