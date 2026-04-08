/**
 * Seed de PilotOS — Catalogo de mantenimientos.
 * Adaptado al nuevo schema PostgreSQL (pilotos.*).
 * Los upserts usan campo `nombre` como key unica.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding PilotOS database...');

    const mantenimientosPorKm = [
        { nombre: 'Cambio de aceite y filtro', frecuencia_km: 12000 },
        { nombre: 'Filtro de aire', frecuencia_km: 12000 },
        { nombre: 'Filtro de combustible (gasolina)', frecuencia_km: 15000 },
        { nombre: 'Filtro de combustible (diesel)', frecuencia_km: 50000 },
        { nombre: 'Filtro de habitaculo / polen', frecuencia_km: 30000 },
        { nombre: 'Aceite de transmision automatica', frecuencia_km: 40000 },
        { nombre: 'Aceite de transmision manual', frecuencia_km: 80000 },
        { nombre: 'Transmision automatica (revision)', frecuencia_km: 60000 },
        { nombre: 'Correa de distribucion', frecuencia_km: 90000 },
        { nombre: 'Liquido refrigerante', frecuencia_km: 100000 },
        { nombre: 'Liquido de frenos', frecuencia_km: 45000 },
    ];

    const mantenimientosSegunUso = [
        { nombre: 'Pastillas de freno' },
        { nombre: 'Discos de freno' },
        { nombre: 'Neumaticos' },
        { nombre: 'Embrague' },
        { nombre: 'Bateria 12V' },
        { nombre: 'Amortiguadores' },
    ];

    const mantenimientosPorFecha = [
        { nombre: 'Seguro del vehiculo', frecuencia_meses: 12 },
        { nombre: 'ITV del vehiculo', frecuencia_meses: 12 },
        { nombre: 'ITV / verificacion del taximetro', frecuencia_meses: 12 },
        { nombre: 'Revision sanitaria anual', frecuencia_meses: 12 },
        { nombre: 'Impuestos trimestrales (IGIC/IRPF)', frecuencia_meses: 3 },
        { nombre: 'Presentacion de renta anual', frecuencia_meses: 12 },
        { nombre: 'Inspecciones municipales', frecuencia_meses: null },
    ];

    for (const m of mantenimientosPorKm) {
        await prisma.mantenimientoCatalogo.upsert({
            where: { nombre: m.nombre },
            update: {},
            create: { nombre: m.nombre, tipo: 'POR_KILOMETRAJE', frecuencia_km: m.frecuencia_km },
        });
    }

    for (const m of mantenimientosSegunUso) {
        await prisma.mantenimientoCatalogo.upsert({
            where: { nombre: m.nombre },
            update: {},
            create: { nombre: m.nombre, tipo: 'SEGUN_USO' },
        });
    }

    for (const m of mantenimientosPorFecha) {
        await prisma.mantenimientoCatalogo.upsert({
            where: { nombre: m.nombre },
            update: {},
            create: { nombre: m.nombre, tipo: 'POR_FECHA', frecuencia_meses: m.frecuencia_meses },
        });
    }

    console.log(`Catalogo creado: ${mantenimientosPorKm.length} por km, ${mantenimientosSegunUso.length} por uso, ${mantenimientosPorFecha.length} por fecha`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
