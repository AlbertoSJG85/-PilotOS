import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/lib/prisma';

/** Crea un patron + cliente + conductor(patron) + vehiculo, todo aislado por UUID aleatorio. */
export async function crearClienteConVehiculo(overrides: { kmActuales?: number } = {}) {
    const suffix = randomUUID();
    const patron = await prisma.minosUser.create({
        data: {
            email: `patron-${suffix}@test.local`,
            password_hash: 'test-hash-no-usado',
            nombre: 'Patron Test',
            telefono: `+34${suffix.replace(/-/g, '').slice(0, 9)}`,
            role: 'user',
        },
    });
    const cliente = await prisma.cliente.create({
        data: { patron_id: patron.id, nombre_comercial: `Cliente Test ${suffix.slice(0, 8)}`, tipo_actividad: 'TAXI' },
    });
    const conductor = await prisma.conductor.create({
        data: { cliente_id: cliente.id, usuario_id: patron.id, es_patron: true, activo: true },
    });
    const vehiculo = await prisma.vehiculo.create({
        data: {
            cliente_id: cliente.id,
            matricula: `T-${suffix.slice(0, 6).toUpperCase()}`,
            marca: 'Test', modelo: 'Test',
            fecha_matriculacion: new Date('2020-01-01'),
            tipo_combustible: 'DIESEL', tipo_transmision: 'MANUAL',
            km_actuales: overrides.kmActuales ?? 10000,
        },
    });
    return { patron, cliente, conductor, vehiculo };
}

/** Anade un conductor asalariado (no patron) al mismo cliente/vehiculo. */
export async function crearConductorAsalariado(clienteId: string, vehiculoId: string) {
    const suffix = randomUUID();
    const usuario = await prisma.minosUser.create({
        data: {
            email: `asalariado-${suffix}@test.local`,
            password_hash: 'test-hash-no-usado',
            nombre: 'Asalariado Test',
            telefono: `+34${suffix.replace(/-/g, '').slice(0, 9)}`,
            role: 'user',
        },
    });
    const conductor = await prisma.conductor.create({
        data: { cliente_id: clienteId, usuario_id: usuario.id, es_patron: false, activo: true },
    });
    await prisma.vehiculoConductor.create({ data: { vehiculo_id: vehiculoId, conductor_id: conductor.id, activo: true } });
    return { usuario, conductor };
}

export async function crearParteDiario(params: {
    vehiculoId: string; conductorId: string; fecha: Date;
    kmInicio: number; kmFin: number; bruto: number; datafono: number; combustible?: number;
}) {
    return prisma.parteDiario.create({
        data: {
            vehiculo_id: params.vehiculoId,
            conductor_id: params.conductorId,
            fecha_trabajada: params.fecha,
            km_inicio: params.kmInicio,
            km_fin: params.kmFin,
            ingreso_bruto: params.bruto,
            ingreso_datafono: params.datafono,
            combustible: params.combustible ?? null,
            estado: 'ENVIADO',
        },
    });
}

/** Devuelve o crea el item de catalogo de mantenimiento "Cambio de aceite" (compartido entre tests, idempotente). */
export async function obtenerOcrearCatalogoAceite() {
    const nombre = 'Cambio de aceite (test)';
    const existente = await prisma.mantenimientoCatalogo.findUnique({ where: { nombre } });
    if (existente) return existente;
    return prisma.mantenimientoCatalogo.create({
        data: { nombre, tipo: 'POR_KM', frecuencia_km: 10000, frecuencia_meses: null, activo: true },
    });
}
