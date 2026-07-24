/**
 * Integracion con Postgres real — Fase 6 (mantenimientos e2e) + M8 (preferencias).
 *
 * procesarMantenimientos() nunca se habia probado contra una BD real: lee y
 * escribe MantenimientoVehiculo/Aviso/Cliente con condiciones WHERE que
 * dependen de como Postgres compara valores (incluido el update optimista de
 * dedupe, M7). Esta suite cubre exactamente eso: creacion de Aviso, dedupe en
 * una segunda pasada, y el silenciado por preferencias_avisos (M8).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { procesarMantenimientos } from '../src/services/mantenimientoAlertas.service';
import { crearClienteConVehiculo, obtenerOcrearCatalogoAceite } from './helpers/fixtures';

afterAll(async () => {
    await prisma.$disconnect();
});

async function crearMantenimientoProximo(vehiculoId: string, kmActuales: number) {
    const catalogo = await obtenerOcrearCatalogoAceite();
    return prisma.mantenimientoVehiculo.create({
        data: {
            vehiculo_id: vehiculoId,
            catalogo_id: catalogo.id,
            proximo_km: kmActuales + 500, // delta=500 -> nivel 500
            estado: 'PENDIENTE',
        },
    });
}

describe('procesarMantenimientos contra Postgres real', () => {
    it('crea un Aviso la primera vez que se cruza un umbral, y NO lo duplica en una segunda pasada (dedupe real)', async () => {
        const { cliente, vehiculo } = await crearClienteConVehiculo({ kmActuales: 9000 });
        const mant = await crearMantenimientoProximo(vehiculo.id, 9000);

        const primeraPasada = await procesarMantenimientos(prisma);
        expect(primeraPasada.avisosCreados).toBeGreaterThanOrEqual(1);

        const avisosTrasPrimera = await prisma.aviso.count({ where: { cliente_id: cliente.id, entidad_id: mant.id } });
        expect(avisosTrasPrimera).toBe(1);

        const mantActualizado = await prisma.mantenimientoVehiculo.findUniqueOrThrow({ where: { id: mant.id } });
        expect(mantActualizado.ultimo_nivel_aviso_km).toBe(500);

        // CRITICO: segunda pasada, mismo estado del mundo → no debe crear otro Aviso.
        const segundaPasada = await procesarMantenimientos(prisma);
        const avisosTrasSegunda = await prisma.aviso.count({ where: { cliente_id: cliente.id, entidad_id: mant.id } });
        expect(avisosTrasSegunda).toBe(1);
        expect(segundaPasada.avisosCreados).toBe(0);
    });

    it('CRITICO (M8): canal "ninguno" silencia el envio pero registra el nivel igualmente', async () => {
        const { cliente, vehiculo } = await crearClienteConVehiculo({ kmActuales: 9200 });
        await prisma.cliente.update({ where: { id: cliente.id }, data: { preferencias_avisos: { canal: 'ninguno' } as any } });
        const mant = await crearMantenimientoProximo(vehiculo.id, 9200);

        const resultado = await procesarMantenimientos(prisma);
        expect(resultado.avisosSilenciados).toBeGreaterThanOrEqual(1);

        const avisos = await prisma.aviso.count({ where: { entidad_id: mant.id } });
        expect(avisos).toBe(0);

        const mantActualizado = await prisma.mantenimientoVehiculo.findUniqueOrThrow({ where: { id: mant.id } });
        expect(mantActualizado.ultimo_nivel_aviso_km).toBe(500);
    });

    it('un umbral personalizado por cliente (M8) cambia cuando se dispara el primer aviso', async () => {
        const { cliente, vehiculo } = await crearClienteConVehiculo({ kmActuales: 9700 });
        // Con el default [1000,500,250], a 300km de margen tocaria nivel 500.
        // Con umbralesKmProximo:[300], a 300km de margen debe ser el PRIMER aviso (nivel 300), no null.
        await prisma.cliente.update({ where: { id: cliente.id }, data: { preferencias_avisos: { umbralesKmProximo: [300] } as any } });
        const mant = await prisma.mantenimientoVehiculo.create({
            data: {
                vehiculo_id: vehiculo.id,
                catalogo_id: (await obtenerOcrearCatalogoAceite()).id,
                proximo_km: 9700 + 300,
                estado: 'PENDIENTE',
            },
        });

        await procesarMantenimientos(prisma);

        const mantActualizado = await prisma.mantenimientoVehiculo.findUniqueOrThrow({ where: { id: mant.id } });
        expect(mantActualizado.ultimo_nivel_aviso_km).toBe(300);
    });
});
