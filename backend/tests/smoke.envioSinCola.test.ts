/**
 * Tests de humo — las dos protecciones que sustituyen a la cola de n8n
 * (2026-08-11, decisión de Alberto: enviar directo a Meta desde ya).
 *
 * La cola de RentOS nos daba gratis dos cosas que ahora son nuestras:
 *   1. REINTENTO: si el envío falla, el escalón NO se da por avisado y la
 *      pasada de mañana lo vuelve a intentar. Sin esto, un fallo puntual de
 *      red perdía el aviso de ese escalón para siempre.
 *   2. NO DUPLICADOS: `Aviso.dedupe_key` por hecho avisado (no por fecha),
 *      así que un reintento reutiliza la fila en vez de mandar dos veces.
 *
 * Si alguno de estos tests se cae, hemos vuelto a quedarnos sin red.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const avisarPatronMock = vi.fn();
// Desde el 2026-08-12 el motor avisa por los DOS canales (WhatsApp + email)
// a traves de avisarPatron: el WhatsApp depende de una plantilla que Meta no
// ha aprobado, el correo no depende de nadie.
vi.mock('../src/services/notificacion.service', () => ({ avisarPatron: avisarPatronMock }));

const { procesarMantenimientos } = await import('../src/services/mantenimientoAlertas.service');

const NIVEL_PREVIO = null;

function prismaMock(avisoPrevio: any = null) {
    return {
        vehiculo: {
            findMany: vi.fn().mockResolvedValue([{
                id: 'v1', matricula: '1234ABC', km_actuales: 9000, cliente_id: 'cli-1',
                cliente: { id: 'cli-1', preferencias_avisos: null, patron: { id: 42, telefono: '+34600111222' } },
                mantenimientos: [{
                    id: 'mant-1', estado: 'PENDIENTE',
                    ultimo_nivel_aviso_km: NIVEL_PREVIO, ultimo_nivel_aviso_dias: null,
                    proximo_km: 9500, proxima_fecha: null,
                    catalogo: { nombre: 'Cambio de aceite' },
                }],
            }]),
        },
        mantenimientoVehiculo: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        aviso: {
            findUnique: vi.fn().mockResolvedValue(avisoPrevio),
            create: vi.fn().mockResolvedValue({ id: 'aviso-1' }),
            update: vi.fn().mockResolvedValue({}),
        },
    };
}

describe('reintento: el escalón no se quema si el envío falla', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.GLORIA_API_URL = 'https://gloria.test';
        process.env.GLORIA_INTERNAL_TOKEN = 'token-de-prueba';
    });

    it('envío OK → el escalón avanza y NO se revierte', async () => {
        avisarPatronMock.mockResolvedValue({ ok: true, estado: 'ENVIADO', message_id: 'wamid.X' });
        const prisma = prismaMock();

        await procesarMantenimientos(prisma as any);

        // Solo la reserva optimista inicial, sin reversión posterior.
        expect(prisma.mantenimientoVehiculo.updateMany).toHaveBeenCalledTimes(1);
    });

    it('CRITICO: envío falla → el escalón vuelve a su valor anterior (mañana reintenta)', async () => {
        avisarPatronMock.mockResolvedValue({ ok: false, error: 'timeout' });
        const prisma = prismaMock();

        const resultado = await procesarMantenimientos(prisma as any);

        // Dos llamadas: la reserva y la reversión.
        expect(prisma.mantenimientoVehiculo.updateMany).toHaveBeenCalledTimes(2);
        const reversion = prisma.mantenimientoVehiculo.updateMany.mock.calls[1][0];
        expect(reversion.data.ultimo_nivel_aviso_km).toBe(NIVEL_PREVIO);
        expect(resultado.avisosFallidos).toBe(1);
    });

    it('el fallo queda con su motivo real y suma un intento', async () => {
        avisarPatronMock.mockResolvedValue({ ok: false, error: 'plantilla no aprobada (meta:132001)' });
        const prisma = prismaMock();

        await procesarMantenimientos(prisma as any);

        expect(prisma.aviso.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                error_envio: expect.stringContaining('132001'),
                intentos: { increment: 1 },
            }),
        }));
    });
});

describe('no duplicados: dedupe por hecho avisado', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.GLORIA_API_URL = 'https://gloria.test';
        process.env.GLORIA_INTERNAL_TOKEN = 'token-de-prueba';
    });

    it('la clave es por mantenimiento + escalón, no por fecha', async () => {
        avisarPatronMock.mockResolvedValue({ ok: true });
        const prisma = prismaMock();

        await procesarMantenimientos(prisma as any);

        expect(prisma.aviso.findUnique).toHaveBeenCalledWith({
            where: { dedupe_key: 'pilotos:mant:mant-1:km500' },
        });
        expect(prisma.aviso.create.mock.calls[0][0].data.dedupe_key).toBe('pilotos:mant:mant-1:km500');
    });

    it('ya se avisó de este escalón → no se reenvía nada', async () => {
        const prisma = prismaMock({ id: 'aviso-viejo', enviado: true });

        const resultado = await procesarMantenimientos(prisma as any);

        expect(avisarPatronMock).not.toHaveBeenCalled();
        expect(prisma.aviso.create).not.toHaveBeenCalled();
        expect(resultado.avisosEnviados).toBe(0);
    });

    it('intento anterior fallido → reutiliza la fila, no crea otra', async () => {
        avisarPatronMock.mockResolvedValue({ ok: true });
        const prisma = prismaMock({ id: 'aviso-fallido', enviado: false });

        await procesarMantenimientos(prisma as any);

        expect(prisma.aviso.create).not.toHaveBeenCalled();
        expect(avisarPatronMock).toHaveBeenCalledTimes(1);
        expect(prisma.aviso.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'aviso-fallido' },
        }));
    });
});

describe('sin configuración de GlorIA no se procesa nada', () => {
    it('sin las variables, no recorre la flota ni quema escalones', async () => {
        vi.clearAllMocks();
        delete process.env.GLORIA_API_URL;
        delete process.env.GLORIA_INTERNAL_TOKEN;
        const prisma = prismaMock();

        const resultado = await procesarMantenimientos(prisma as any);

        expect(prisma.vehiculo.findMany).not.toHaveBeenCalled();
        expect(prisma.mantenimientoVehiculo.updateMany).not.toHaveBeenCalled();
        expect(resultado.evaluados).toBe(0);
    });
});
