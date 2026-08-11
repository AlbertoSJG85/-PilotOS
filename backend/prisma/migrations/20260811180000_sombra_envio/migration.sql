-- 2026-08-11: sombra de envío (Fase E del plan). Registra qué mandaría el
-- backend a Meta directamente, sin mandarlo nunca -- observación en
-- paralelo al envío real vía GlorIA/n8n, molde: core."Sombra_Reconciliacion"
-- de RentOS.
CREATE TABLE "pilotos"."sombra_envios" (
    "id" TEXT NOT NULL,
    "ejecutado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aviso_id" TEXT,
    "entrada" JSONB NOT NULL,
    "decision_backend" JSONB NOT NULL,
    "resultado_n8n" JSONB,
    "coincide" BOOLEAN,
    "alerta" TEXT,

    CONSTRAINT "sombra_envios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sombra_envios_ejecutado_en_idx" ON "pilotos"."sombra_envios"("ejecutado_en");
