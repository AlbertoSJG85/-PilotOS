-- Mantenimientos personalizados por cliente (2026-08-13).
--
-- Hasta hoy `mantenimiento_catalogo` era un unico catalogo GLOBAL: todo
-- vehiculo nuevo heredaba las mismas 25+ obligaciones, sin forma de anadir
-- una propia ni de que un cliente tuviera algo que otro no. Alberto lo
-- detecto con un caso real: el papeleo del taxi varia por ayuntamiento, y lo
-- que le exige el suyo no tiene por que aplicarle a otro cliente.
--
-- `cliente_id` NULL = catalogo global (el seed de siempre, comun a todos).
-- `cliente_id` con valor = mantenimiento propio de ESE cliente, invisible
-- para el resto. La unicidad de `nombre` pasa de global a (nombre, cliente_id)
-- para que dos clientes puedan llamar igual a su mantenimiento propio sin
-- chocar entre si ni con el catalogo global.

ALTER TABLE "pilotos"."mantenimiento_catalogo" ADD COLUMN "cliente_id" TEXT;

DROP INDEX "pilotos"."mantenimiento_catalogo_nombre_key";

CREATE UNIQUE INDEX "mantenimiento_catalogo_nombre_cliente_id_key" ON "pilotos"."mantenimiento_catalogo"("nombre", "cliente_id");

ALTER TABLE "pilotos"."mantenimiento_catalogo" ADD CONSTRAINT "mantenimiento_catalogo_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "pilotos"."clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
