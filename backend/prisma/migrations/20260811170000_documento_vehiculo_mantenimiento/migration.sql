-- 2026-08-11: terreno para el reconocimiento de documentos (factura de
-- taller, ITV, seguro...) enviados por el propietario. Un Documento puede
-- ahora nacer sin ParteDiario y enlazarse directamente a un Vehiculo y,
-- cuando se sepa, a un MantenimientoVehiculo concreto. Deliberadamente NO
-- se toca DocumentoEnlace (FK físico a partes_diarios, ver comentario en
-- schema.prisma) — es la vía aditiva y segura, sin tocar los ~10 sitios que
-- ya consultan esa tabla.
ALTER TABLE "pilotos"."documentos"
  ADD COLUMN "vehiculo_id" TEXT,
  ADD COLUMN "mantenimiento_vehiculo_id" TEXT;

ALTER TABLE "pilotos"."documentos"
  ADD CONSTRAINT "documentos_vehiculo_id_fkey"
  FOREIGN KEY ("vehiculo_id") REFERENCES "pilotos"."vehiculos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pilotos"."documentos"
  ADD CONSTRAINT "documentos_mantenimiento_vehiculo_id_fkey"
  FOREIGN KEY ("mantenimiento_vehiculo_id") REFERENCES "pilotos"."mantenimientos_vehiculos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "documentos_vehiculo_id_idx" ON "pilotos"."documentos"("vehiculo_id");
CREATE INDEX "documentos_mantenimiento_vehiculo_id_idx" ON "pilotos"."documentos"("mantenimiento_vehiculo_id");
