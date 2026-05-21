/**
 * Limpieza de partes de prueba (días 18-21 mayo 2026).
 *
 * Borra ÚNICAMENTE:
 *   - partes_diarios de esas fechas
 *   - calculos_partes asociados
 *   - documento_enlaces que apuntan a esos partes
 *   - anomalias e incidencias asociadas
 *   - tareas_pendientes derivadas de los documentos enlazados
 *   - documentos ILEGIBLE huérfanos (sin enlaces restantes)
 *
 * No toca: ficheros físicos en uploads/, minos.Users, ledger.Eventos,
 * configuracion_economica, conductores, clientes, vehiculos.
 *
 * Modo: si se pasa --dry-run, solo lista. Sin flag, ejecuta DELETE.
 *
 * Uso:
 *   npx ts-node scripts/limpiar-partes-prueba.ts --dry-run
 *   npx ts-node scripts/limpiar-partes-prueba.ts
 *   npx ts-node scripts/limpiar-partes-prueba.ts --fecha=2026-05-18
 *   npx ts-node scripts/limpiar-partes-prueba.ts --fecha=2026-05-18,2026-05-19
 */
import { prisma } from '../src/lib/prisma';

const DEFAULT_FECHAS = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21'];
const fechaArg = process.argv.find(a => a.startsWith('--fecha='));
const fechasStr = fechaArg ? fechaArg.replace('--fecha=', '').split(',') : DEFAULT_FECHAS;
const FECHAS = fechasStr.map(s => new Date(s.trim() + 'T00:00:00.000Z'));
const dryRun = process.argv.includes('--dry-run');

(async () => {
    console.log(`\n=== Limpieza partes 18-21 mayo 2026 ===`);
    console.log(`Modo: ${dryRun ? 'DRY-RUN (solo lista)' : 'EJECUTAR DELETE'}\n`);

    // 1. Localizar partes en esas fechas
    const partes = await prisma.parteDiario.findMany({
        where: { fecha_trabajada: { in: FECHAS } },
        include: {
            vehiculo: { select: { id: true, matricula: true, cliente_id: true } },
            calculo: true,
        },
    });
    console.log(`Partes encontrados: ${partes.length}`);
    for (const p of partes) {
        console.log(`  · ${p.fecha_trabajada.toISOString().slice(0, 10)}  parte=${p.id.slice(0, 8)}  veh=${p.vehiculo?.matricula}  estado=${p.estado}  ingreso=${p.ingreso_bruto}`);
    }
    if (partes.length === 0) {
        console.log('Nada que limpiar. Saliendo.');
        await prisma.$disconnect();
        return;
    }

    const parteIds = partes.map(p => p.id);

    // 2. Enlaces de documento → parte
    const enlaces = await prisma.documentoEnlace.findMany({
        where: { entidad_tipo: 'PARTE_DIARIO', entidad_id: { in: parteIds } },
    });
    const docIds = [...new Set(enlaces.map(e => e.documento_id))];
    console.log(`\nEnlaces documento↔parte: ${enlaces.length}`);
    console.log(`Documentos únicos vinculados: ${docIds.length}`);

    const docs = await prisma.documento.findMany({
        where: { id: { in: docIds } },
        include: { enlaces: true },
    });
    for (const d of docs) {
        console.log(`  · doc=${d.id.slice(0, 8)}  tipo=${d.tipo}  estado=${d.estado}  enlaces=${d.enlaces.length}  url=${d.url.slice(-40)}`);
    }

    // 3. Anomalías e incidencias
    const anomalias = await prisma.anomalia.findMany({
        where: { parte_diario_id: { in: parteIds } },
    });
    const incidencias = await prisma.incidencia.findMany({
        where: { parte_diario_id: { in: parteIds } },
    });
    console.log(`\nAnomalías asociadas: ${anomalias.length}`);
    console.log(`Incidencias asociadas: ${incidencias.length}`);

    // 4. Tareas pendientes derivadas de documentos enlazados
    const tareas = await prisma.tareaPendiente.findMany({
        where: {
            OR: [
                { entidad_tipo: 'DOCUMENTO', entidad_id: { in: docIds } },
                { entidad_tipo: 'PARTE_DIARIO', entidad_id: { in: parteIds } },
            ],
        },
    });
    console.log(`Tareas pendientes a cerrar: ${tareas.length}`);

    if (dryRun) {
        console.log('\n--dry-run: no se borra nada.');
        await prisma.$disconnect();
        return;
    }

    // 5. EJECUTAR en transacción
    const resultado = await prisma.$transaction(async (tx) => {
        const delAnoms = await tx.anomalia.deleteMany({ where: { parte_diario_id: { in: parteIds } } });
        const delInc = await tx.incidencia.deleteMany({ where: { parte_diario_id: { in: parteIds } } });
        const delTar = await tx.tareaPendiente.deleteMany({
            where: {
                OR: [
                    { entidad_tipo: 'DOCUMENTO', entidad_id: { in: docIds } },
                    { entidad_tipo: 'PARTE_DIARIO', entidad_id: { in: parteIds } },
                ],
            },
        });
        const delEnl = await tx.documentoEnlace.deleteMany({
            where: { entidad_tipo: 'PARTE_DIARIO', entidad_id: { in: parteIds } },
        });
        const delCalc = await tx.calculoParte.deleteMany({ where: { parte_diario_id: { in: parteIds } } });
        const delPart = await tx.parteDiario.deleteMany({ where: { id: { in: parteIds } } });

        // Documentos que quedaron huérfanos: si no tienen ningún enlace restante, borrarlos.
        // (No borramos ficheros físicos — los usaremos para verificar logs si hace falta.)
        const restos = await tx.documentoEnlace.findMany({
            where: { documento_id: { in: docIds } },
            select: { documento_id: true },
        });
        const conEnlaces = new Set(restos.map(r => r.documento_id));
        const huerfanos = docIds.filter(id => !conEnlaces.has(id));
        let delDocs = { count: 0 };
        if (huerfanos.length > 0) {
            // Historial primero (FK)
            await tx.documentoHistorial.deleteMany({ where: { documento_id: { in: huerfanos } } });
            delDocs = await tx.documento.deleteMany({ where: { id: { in: huerfanos } } });
        }

        return {
            anomalias: delAnoms.count,
            incidencias: delInc.count,
            tareas: delTar.count,
            enlaces: delEnl.count,
            calculos: delCalc.count,
            partes: delPart.count,
            docs_huerfanos: delDocs.count,
            docs_huerfanos_ids: huerfanos,
        };
    });

    console.log(`\n=== RESULTADO ===`);
    console.log(JSON.stringify(resultado, null, 2));

    await prisma.$disconnect();
})().catch(async (e) => {
    console.error('ERROR:', e);
    await prisma.$disconnect();
    process.exit(1);
});
