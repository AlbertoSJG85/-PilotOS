import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // ============================================
    // CATÁLOGO DE MANTENIMIENTOS
    // ============================================

    const mantenimientosPorKm = [
        { nombre: 'Cambio de aceite y filtro', frecuenciaKm: 12000 },
        { nombre: 'Filtro de aire', frecuenciaKm: 12000 },
        { nombre: 'Filtro de combustible (gasolina)', frecuenciaKm: 15000 },
        { nombre: 'Filtro de combustible (diésel)', frecuenciaKm: 50000 },
        { nombre: 'Filtro de habitáculo / polen', frecuenciaKm: 30000 },
        { nombre: 'Aceite de transmisión automática', frecuenciaKm: 40000 },
        { nombre: 'Aceite de transmisión manual', frecuenciaKm: 80000 },
        { nombre: 'Transmisión automática (revisión)', frecuenciaKm: 60000 },
        { nombre: 'Correa de distribución', frecuenciaKm: 90000 },
        { nombre: 'Líquido refrigerante', frecuenciaKm: 100000 },
        { nombre: 'Líquido de frenos', frecuenciaKm: 45000 },
    ];

    const mantenimientosSegunUso = [
        { nombre: 'Pastillas de freno' },
        { nombre: 'Discos de freno' },
        { nombre: 'Neumáticos' },
        { nombre: 'Embrague' },
        { nombre: 'Batería 12V' },
        { nombre: 'Amortiguadores' },
    ];

    const mantenimientosPorFecha = [
        { nombre: 'Seguro del vehículo', frecuenciaMeses: 12 },
        { nombre: 'ITV del vehículo', frecuenciaMeses: 12 },
        { nombre: 'ITV / verificación del taxímetro', frecuenciaMeses: 12 },
        { nombre: 'Revisión sanitaria anual', frecuenciaMeses: 12 },
        { nombre: 'Impuestos trimestrales (IGIC/IRPF)', frecuenciaMeses: 3 },
        { nombre: 'Presentación de renta anual', frecuenciaMeses: 12 },
        { nombre: 'Inspecciones municipales', frecuenciaMeses: null },
    ];

    // Insertar mantenimientos por kilometraje
    for (const m of mantenimientosPorKm) {
        await prisma.mantenimientoCatalogo.upsert({
            where: { nombre: m.nombre },
            update: {},
            create: {
                nombre: m.nombre,
                tipo: 'POR_KILOMETRAJE',
                frecuenciaKm: m.frecuenciaKm,
            },
        });
    }

    // Insertar mantenimientos según uso
    for (const m of mantenimientosSegunUso) {
        await prisma.mantenimientoCatalogo.upsert({
            where: { nombre: m.nombre },
            update: {},
            create: {
                nombre: m.nombre,
                tipo: 'SEGUN_USO',
            },
        });
    }

    // Insertar mantenimientos por fecha
    for (const m of mantenimientosPorFecha) {
        await prisma.mantenimientoCatalogo.upsert({
            where: { nombre: m.nombre },
            update: {},
            create: {
                nombre: m.nombre,
                tipo: 'POR_FECHA',
                frecuenciaMeses: m.frecuenciaMeses,
            },
        });
    }

    console.log('✅ Catálogo de mantenimientos creado');
    console.log(`   - ${mantenimientosPorKm.length} por kilometraje`);
    console.log(`   - ${mantenimientosSegunUso.length} según uso`);
    console.log(`   - ${mantenimientosPorFecha.length} por fecha`);

    console.log('🌱 Seeding completed!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
