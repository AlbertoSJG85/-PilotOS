/**
 * reset-data.ts — Limpieza de datos propios de PilotOS.
 * Preserva MantenimientoCatalogo.
 *
 * ⚠️  minos.Users NO se borra: es identidad global compartida entre todos los
 *     productos NexOS (PilotOS, RentOS, GlorIA...). Un usuario de PilotOS puede
 *     ser también usuario de RentOS con la misma cuenta. Borrar aquí destruiría
 *     su acceso a otros productos. Si necesitas borrar un usuario concreto,
 *     hazlo manualmente desde Prisma Studio.
 *
 * ⚠️  ledger.Eventos se limpia SOLO con source='PILOTOS'. Los eventos de
 *     otros productos (source='RENTOS', etc.) no se tocan.
 *
 * Ejecutar: npx tsx prisma/reset-data.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  Limpiando datos propios de PilotOS...\n');
  console.log('   (minos.Users y eventos de otros productos NO se tocan)\n');

  // ── Hijos más profundos primero (respetar FK) ─────────────────────────────

  const seg = await prisma.seguimientoMantenimiento.deleteMany();
  console.log(`  seguimiento_mantenimiento: ${seg.count}`);

  const calc = await prisma.calculoParte.deleteMany();
  console.log(`  calculos_partes:           ${calc.count}`);

  const docHist = await prisma.documentoHistorial.deleteMany();
  console.log(`  documento_historial:       ${docHist.count}`);

  const docEnlace = await prisma.documentoEnlace.deleteMany();
  console.log(`  documento_enlaces:         ${docEnlace.count}`);

  const docs = await prisma.documento.deleteMany();
  console.log(`  documentos:                ${docs.count}`);

  const tareas = await prisma.tareaPendiente.deleteMany();
  console.log(`  tareas_pendientes:         ${tareas.count}`);

  const incidencias = await prisma.incidencia.deleteMany();
  console.log(`  incidencias:               ${incidencias.count}`);

  const anomalias = await prisma.anomalia.deleteMany();
  console.log(`  anomalias:                 ${anomalias.count}`);

  const partes = await prisma.parteDiario.deleteMany();
  console.log(`  partes_diarios:            ${partes.count}`);

  const vcond = await prisma.vehiculoConductor.deleteMany();
  console.log(`  vehiculo_conductores:      ${vcond.count}`);

  const mantsVeh = await prisma.mantenimientoVehiculo.deleteMany();
  console.log(`  mantenimientos_vehiculos:  ${mantsVeh.count}`);

  const avisos = await prisma.aviso.deleteMany();
  console.log(`  avisos:                    ${avisos.count}`);

  const cierres = await prisma.cierrePeriodo.deleteMany();
  console.log(`  cierres_periodo:           ${cierres.count}`);

  const gastosFijos = await prisma.gastoFijo.deleteMany();
  console.log(`  gastos_fijos:              ${gastosFijos.count}`);

  const gastos = await prisma.gasto.deleteMany();
  console.log(`  gastos:                    ${gastos.count}`);

  const configs = await prisma.configuracionEconomica.deleteMany();
  console.log(`  configuracion_economica:   ${configs.count}`);

  const vehiculos = await prisma.vehiculo.deleteMany();
  console.log(`  vehiculos:                 ${vehiculos.count}`);

  const conductores = await prisma.conductor.deleteMany();
  console.log(`  conductores:               ${conductores.count}`);

  const clientes = await prisma.cliente.deleteMany();
  console.log(`  clientes:                  ${clientes.count}`);

  const onboarding = await prisma.onboarding.deleteMany();
  console.log(`  onboarding:                ${onboarding.count}`);

  // Solo eventos propios de PilotOS — los de otros productos no se tocan
  const eventos = await prisma.ledgerEvento.deleteMany({
    where: { source: 'PILOTOS' },
  });
  console.log(`  ledger.Eventos (PILOTOS):  ${eventos.count}`);

  console.log('\n✅ Limpieza completada.');
  console.log('   Catálogo de mantenimientos conservado.');
  console.log('   minos.Users intacto (identidad global NexOS).');
  console.log('   Ve a http://localhost:3000 para empezar el onboarding real.\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Error durante la limpieza:', e.message);
    process.exit(1);
  })
  .finally(async () => { await prisma.$disconnect(); });
