/**
 * completar-onboarding.ts — Ejecuta el completar de onboarding directamente.
 * Útil cuando el backend no ha recargado el código actualizado.
 * Ejecutar: npx tsx prisma/completar-onboarding.ts <telefono>
 *
 * Ejemplo: npx tsx prisma/completar-onboarding.ts 615380646
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

const telefono = process.argv[2];
if (!telefono) {
  console.error('Uso: npx tsx prisma/completar-onboarding.ts <telefono>');
  process.exit(1);
}

async function main() {
  console.log(`\n▶ Completando onboarding para teléfono: ${telefono}\n`);

  // 1. Cargar onboarding
  const onboarding = await prisma.onboarding.findUnique({ where: { telefono } });
  if (!onboarding) { console.error('ERROR: No existe onboarding con ese teléfono'); process.exit(1); }
  if (onboarding.completado) { console.error('ERROR: Ya estaba completado. Usa el login.'); process.exit(1); }
  if (!onboarding.email_patron) { console.error('ERROR: Falta email_patron en onboarding'); process.exit(1); }

  const email = onboarding.email_patron.trim().toLowerCase();
  console.log(`  email normalizado:  "${email}"`);
  console.log(`  telefono:           "${onboarding.telefono}"`);

  // 2. Buscar usuario existente en minos por email
  const existingUser = await prisma.minosUser.findUnique({ where: { email } });
  console.log(`  minosUser por email: ${existingUser ? `ENCONTRADO id=${existingUser.id} (${existingUser.email})` : 'NO ENCONTRADO'}`);

  let caso: 'A' | 'B' | 'C' = 'A';

  if (existingUser) {
    const yaEsPatron   = await prisma.cliente.findFirst({ where: { patron_id: existingUser.id } });
    const yaEsConductor = await prisma.conductor.findFirst({ where: { usuario_id: existingUser.id } });
    console.log(`  yaEsPatron=${!!yaEsPatron}  yaEsConductor=${!!yaEsConductor}`);

    if (yaEsPatron || yaEsConductor) {
      caso = 'C';
    } else {
      caso = 'B';
    }
  }

  console.log(`  → CASO ${caso}: ${{ A: 'usuario nuevo', B: 'reutilizar NexOS existente', C: 'ya tiene PilotOS' }[caso]}\n`);

  if (caso === 'C') {
    console.log('  Ya tiene PilotOS. Usa el login con tu teléfono.');
    process.exit(0);
  }

  // 3. Transacción
  const result = await prisma.$transaction(async (tx) => {
    // Paso 1: Usuario patrón
    let patronUser;
    if (caso === 'B' && existingUser) {
      patronUser = existingUser;
      console.log(`  [1] Reutilizando minosUser id=${patronUser.id}`);
    } else {
      patronUser = await tx.minosUser.create({
        data: {
          email,
          nombre: onboarding.nombre_patron || 'Propietario',
          telefono: onboarding.telefono,
          password_hash: 'ONBOARDING_INITIAL_STEP',
          role: 'user',
          estado_pago: 'AL DIA',
        },
      });
      console.log(`  [1] Creado minosUser id=${patronUser.id}`);
    }

    // Paso 2: Cliente
    const cliente = await tx.cliente.create({
      data: {
        patron_id: patronUser.id,
        nombre_comercial: onboarding.nombre_comercial,
        tipo_actividad: onboarding.tipo_actividad || 'TAXI',
      },
    });
    console.log(`  [2] Cliente id=${cliente.id}`);

    // Paso 3: Conductor patrón
    const conductorPatron = await tx.conductor.create({
      data: { cliente_id: cliente.id, usuario_id: patronUser.id, es_patron: true },
    });
    console.log(`  [3] Conductor patrón id=${conductorPatron.id}`);

    // Paso 4: Asalariados (vacío en este caso)
    const asalariados = (onboarding.asalariados as any[]) || [];
    const conductoresAsalariados: any[] = [];
    for (const asala of asalariados) {
      if (!asala.telefono) continue;
      const asalaEmail = `${asala.telefono}@pilotos.app`;
      const asalariadoUser = await tx.minosUser.upsert({
        where: { email: asalaEmail },
        update: { nombre: asala.nombre || undefined, telefono: asala.telefono },
        create: { nombre: asala.nombre || 'Conductor', telefono: asala.telefono, email: asalaEmail, password_hash: 'ONBOARDING_ASALARIADO_INITIAL', role: 'user', estado_pago: 'AL DIA' },
      });
      const cond = await tx.conductor.create({ data: { cliente_id: cliente.id, usuario_id: asalariadoUser.id, es_patron: false } });
      conductoresAsalariados.push(cond);
      await tx.configuracionEconomica.create({ data: { cliente_id: cliente.id, conductor_id: cond.id, modelo_reparto: asala.modelo_reparto || 'PORCENTAJE', porcentaje_conductor: asala.porcentaje_conductor ?? 50, porcentaje_patron: 100 - (asala.porcentaje_conductor ?? 50), cuota_pilotos: 0, incluye_combustible_en_reparto: true } });
    }
    console.log(`  [4] Asalariados: ${conductoresAsalariados.length}`);

    // Paso 5: Vehículo
    const vehiculo = await tx.vehiculo.create({
      data: {
        cliente_id: cliente.id,
        matricula: onboarding.matricula || '',
        marca: onboarding.marca_modelo?.split(' ')[0] || '',
        modelo: onboarding.marca_modelo?.split(' ').slice(1).join(' ') || '',
        fecha_matriculacion: onboarding.fecha_matriculacion || new Date(),
        tipo_combustible: onboarding.tipo_combustible || 'DIESEL',
        tipo_transmision: onboarding.tipo_transmision || 'MANUAL',
        km_actuales: onboarding.km_actuales || 0,
      },
    });
    console.log(`  [5] Vehículo id=${vehiculo.id} matricula=${vehiculo.matricula}`);

    // Paso 6: Asignaciones vehículo-conductor
    await tx.vehiculoConductor.create({ data: { vehiculo_id: vehiculo.id, conductor_id: conductorPatron.id } });
    for (const cond of conductoresAsalariados) {
      await tx.vehiculoConductor.create({ data: { vehiculo_id: vehiculo.id, conductor_id: cond.id } });
    }
    console.log(`  [6] Asignaciones vehículo-conductor: OK`);

    // Paso 7: ConfiguracionEconomica patrón
    await tx.configuracionEconomica.create({ data: { cliente_id: cliente.id, conductor_id: conductorPatron.id, modelo_reparto: 'PORCENTAJE', porcentaje_conductor: 0, porcentaje_patron: 100, cuota_pilotos: 0, incluye_combustible_en_reparto: true } });
    console.log(`  [7] ConfiguracionEconomica patrón: OK`);

    // Paso 8: Gastos fijos
    const gastosFijos = (onboarding.gastos_fijos as any[]) || [];
    for (const gf of gastosFijos) {
      await tx.gastoFijo.create({ data: { cliente_id: cliente.id, vehiculo_id: vehiculo.id, tipo: gf.tipo || 'OTRO', descripcion: gf.descripcion || 'Gasto onboarding', importe: gf.importe || 0, periodicidad: gf.periodicidad || 'MENSUAL' } });
    }
    console.log(`  [8] Gastos fijos: ${gastosFijos.length} creados`);

    // Paso 9: Mantenimientos
    const catalogo = await tx.mantenimientoCatalogo.findMany();
    for (const item of catalogo) {
      await tx.mantenimientoVehiculo.create({ data: { vehiculo_id: vehiculo.id, catalogo_id: item.id, proximo_km: item.frecuencia_km ? vehiculo.km_actuales + item.frecuencia_km : null, proxima_fecha: item.frecuencia_meses ? new Date(Date.now() + item.frecuencia_meses * 30 * 24 * 60 * 60 * 1000) : null } });
    }
    console.log(`  [9] Mantenimientos: ${catalogo.length} inicializados`);

    // Paso 10: Marcar onboarding completado
    await tx.onboarding.update({ where: { telefono }, data: { completado: true } });
    console.log(`  [10] Onboarding marcado completado`);

    // Paso 11: Evento ledger
    await tx.ledgerEvento.create({ data: { tipo_evento: 'ONBOARDING_COMPLETADO', source: 'PILOTOS', dedupe_key: `onboarding-${cliente.id}`, datos: { cliente_id: cliente.id, patron_id: patronUser.id } } });
    console.log(`  [11] Evento ledger registrado`);

    return { patronUser, cliente, conductorPatron, vehiculo };
  });

  console.log(`\n✅ Onboarding completado correctamente.`);
  console.log(`   patron_id:  ${result.patronUser.id}`);
  console.log(`   cliente_id: ${result.cliente.id}`);
  console.log(`   vehiculo_id: ${result.vehiculo.id}`);
  console.log(`\n   → Ahora ve a http://localhost:3000/login`);
  console.log(`     e inicia sesión con el teléfono: ${telefono}\n`);
}

main()
  .catch((e) => { console.error('\n❌ ERROR:', e.message); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
