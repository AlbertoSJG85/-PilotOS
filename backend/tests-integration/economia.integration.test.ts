/**
 * Integracion con Postgres real — Fase 4 (exactitud economica).
 *
 * El bug que motivo esta suite solo se manifiesta contra Postgres de verdad:
 * `ORDER BY conductor_id DESC` pone los NULL primero (NULLS FIRST es el
 * default de Postgres en DESC), asi que la config generica ganaba sobre la
 * especifica del conductor. Un mock de Prisma nunca habria detectado esto —
 * hace falta el motor real.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { calcularParte } from '../src/services/calculo.service';
import { crearClienteConVehiculo, crearParteDiario } from './helpers/fixtures';

afterAll(async () => {
    await prisma.$disconnect();
});

describe('calcularParte contra Postgres real', () => {
    it('CRITICO: prioriza la configuracion especifica del conductor sobre la generica del cliente', async () => {
        const { cliente, conductor, vehiculo } = await crearClienteConVehiculo();

        // Config generica del cliente: 50/50.
        await prisma.configuracionEconomica.create({
            data: {
                cliente_id: cliente.id, conductor_id: null,
                modelo_reparto: 'PORCENTAJE', porcentaje_conductor: 50, porcentaje_patron: 50,
                incluye_combustible_en_reparto: true, activo: true,
            },
        });
        // Config especifica de ESTE conductor: 70/30. Debe ganar sobre la generica.
        await prisma.configuracionEconomica.create({
            data: {
                cliente_id: cliente.id, conductor_id: conductor.id,
                modelo_reparto: 'PORCENTAJE', porcentaje_conductor: 70, porcentaje_patron: 30,
                incluye_combustible_en_reparto: true, activo: true,
            },
        });

        const parte = await crearParteDiario({
            vehiculoId: vehiculo.id, conductorId: conductor.id, fecha: new Date('2026-01-15'),
            kmInicio: 100, kmFin: 200, bruto: 100, datafono: 0,
        });

        const resultado = await calcularParte({ parte_diario_id: parte.id, cliente_id: cliente.id });

        expect(resultado.porcentaje_conductor_aplicado.toString()).toBe('70');
        expect(resultado.parte_conductor.toNumber()).toBe(70);
        expect(resultado.parte_patron.toNumber()).toBe(30);
    });

    it('sin config especifica, cae a la generica del cliente', async () => {
        const { cliente, conductor, vehiculo } = await crearClienteConVehiculo();

        await prisma.configuracionEconomica.create({
            data: {
                cliente_id: cliente.id, conductor_id: null,
                modelo_reparto: 'PORCENTAJE', porcentaje_conductor: 40, porcentaje_patron: 60,
                incluye_combustible_en_reparto: true, activo: true,
            },
        });

        const parte = await crearParteDiario({
            vehiculoId: vehiculo.id, conductorId: conductor.id, fecha: new Date('2026-01-16'),
            kmInicio: 200, kmFin: 300, bruto: 200, datafono: 0,
        });

        const resultado = await calcularParte({ parte_diario_id: parte.id, cliente_id: cliente.id });
        expect(resultado.porcentaje_conductor_aplicado.toString()).toBe('40');
    });

    it('separa neto operativo (bruto-combustible) de la base de reparto cuando la config excluye el combustible', async () => {
        const { cliente, conductor, vehiculo } = await crearClienteConVehiculo();

        await prisma.configuracionEconomica.create({
            data: {
                cliente_id: cliente.id, conductor_id: null,
                modelo_reparto: 'PORCENTAJE', porcentaje_conductor: 50, porcentaje_patron: 50,
                incluye_combustible_en_reparto: false, activo: true,
            },
        });

        const parte = await crearParteDiario({
            vehiculoId: vehiculo.id, conductorId: conductor.id, fecha: new Date('2026-01-17'),
            kmInicio: 300, kmFin: 400, bruto: 100, datafono: 0, combustible: 20,
        });

        const resultado = await calcularParte({ parte_diario_id: parte.id, cliente_id: cliente.id });

        // neto_diario SIEMPRE es bruto-combustible, independientemente del reparto.
        expect(resultado.neto_diario.toNumber()).toBe(80);
        // base_reparto usa el bruto completo porque la config excluye el combustible del reparto.
        expect(resultado.base_reparto.toNumber()).toBe(100);
        expect(resultado.parte_conductor.toNumber()).toBe(50);
    });
});
