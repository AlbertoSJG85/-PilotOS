-- 2026-08-12: Seguridad Social del asalariado (F4 del plan de acción,
-- regla cerrada por Alberto el 2026-08-11).
--
--   · Importe POR CONDUCTOR, no por cliente: cada asalariado tiene su cuota.
--     null = a ese conductor no se le aplica descuento de SS.
--   · Modo de descuento POR CLIENTE: el patrón elige, para todos sus
--     asalariados, si se descuenta en cada parte o en el cierre de periodo.
--   · Mes incompleto: SIN PRORRATEO. Si estuvo activo un solo día del mes,
--     se descuenta la cuota completa. No hay cálculo por días.
ALTER TABLE "pilotos"."conductores" ADD COLUMN "cuota_ss_mensual" DECIMAL(10,2);
ALTER TABLE "pilotos"."clientes" ADD COLUMN "ss_modo_descuento" TEXT NOT NULL DEFAULT 'cierre';

-- Línea de SS en el cierre de periodo (modo 'cierre').
ALTER TABLE "pilotos"."cierres_periodo" ADD COLUMN "descuento_ss" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Traza en el parte: qué cuota se descontó ahí (modo 'parte'). Sin esto no se
-- puede explicar por qué la liquidación de un día es menor que las demás.
ALTER TABLE "pilotos"."calculos_partes" ADD COLUMN "descuento_ss" DECIMAL(10,2) NOT NULL DEFAULT 0;
