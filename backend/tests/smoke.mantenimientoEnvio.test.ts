/**
 * Tests de humo — que `procesarMantenimientos` de verdad llame a GlorIA.
 *
 * `smoke.mantenimientoAlertas.test.ts` cubre la lógica pura de escalones
 * (calcularNivelKm/Dias, esMasUrgente) pero, por diseño, no toca la
 * orquestación completa ("toca BD real, pendiente de test de integración").
 * Este archivo cierra ese hueco con un prisma mockeado: verifica que cuando
 * un mantenimiento cruza un escalón, `procesarMantenimientos` de verdad
 * llama a `enviarAvisoGloria` (el único camino real hacia WhatsApp) con el
 * teléfono del patrón y el `tipo` correcto — no solo que actualiza estado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const avisarPatronMock = vi.fn();
// Desde el 2026-08-12 el motor avisa por los DOS canales (WhatsApp + email)
// a traves de avisarPatron: el WhatsApp depende de una plantilla que Meta no
// ha aprobado, el correo no depende de nadie.
vi.mock('../src/services/notificacion.service', () => ({ avisarPatron: avisarPatronMock }));

const { procesarMantenimientos } = await import('../src/services/mantenimientoAlertas.service');

function prismaMockCon(mantenimiento: Record<string, unknown>) {
    return {
        vehiculo: {
            findMany: vi.fn().mockResolvedValue([{
                id: 'v1',
                matricula: '1234ABC',
                km_actuales: 9000,
                cliente_id: 'cli-1',
                cliente: {
                    id: 'cli-1',
                    preferencias_avisos: null,
                    patron: { id: 42, telefono: '+34600111222' },
                },
                mantenimientos: [{
                    id: 'mant-1',
                    estado: 'PENDIENTE',
                    ultimo_nivel_aviso_km: null,
                    ultimo_nivel_aviso_dias: null,
                    proximo_km: 9500, // faltan 500 km → cruza el escalón 500
                    proxima_fecha: null,
                    catalogo: { nombre: 'Cambio de aceite' },
                    ...mantenimiento,
                }],
            }]),
        },
        mantenimientoVehiculo: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        aviso: {
            create: vi.fn().mockResolvedValue({ id: 'aviso-1' }),
            update: vi.fn().mockResolvedValue({}),
            findUnique: vi.fn().mockResolvedValue(null), // sin aviso previo -> se crea
        },
    };
}

describe('procesarMantenimientos → enviarAvisoGloria (llamada real, no solo estado)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Sin estas variables el motor sale antes de recorrer nada (es un
        // fallo de despliegue que debe verse, no procesarse a medias).
        process.env.GLORIA_API_URL = 'https://gloria.test';
        process.env.GLORIA_INTERNAL_TOKEN = 'token-de-prueba';
    });

    it('mantenimiento próximo cruza escalón → llama a GlorIA con el teléfono del patrón y tipo correcto', async () => {
        avisarPatronMock.mockResolvedValue({ ok: true });
        const prisma = prismaMockCon({});

        const resultado = await procesarMantenimientos(prisma as any);

        expect(avisarPatronMock).toHaveBeenCalledTimes(1);
        expect(avisarPatronMock).toHaveBeenCalledWith(
            expect.objectContaining({ telefono: '+34600111222' }),
            expect.objectContaining({
                tipo: 'mantenimiento_proximo',
                template_params: expect.objectContaining({ matricula: '1234ABC', mantenimiento: 'Cambio de aceite' }),
                asunto: expect.stringContaining('PilotOS'),
            }),
        );
        expect(prisma.aviso.create).toHaveBeenCalledTimes(1);
        expect(prisma.aviso.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ enviado: true }),
        }));
        expect(resultado.avisosEnviados).toBe(1);
        expect(resultado.avisosFallidos).toBe(0);
    });

    it('mantenimiento vencido → tipo mantenimiento_vencido', async () => {
        avisarPatronMock.mockResolvedValue({ ok: true });
        const prisma = prismaMockCon({ proximo_km: 8500 }); // ya pasado (km_actuales 9000)

        await procesarMantenimientos(prisma as any);

        expect(avisarPatronMock).toHaveBeenCalledWith(
            expect.objectContaining({ telefono: '+34600111222' }),
            expect.objectContaining({ tipo: 'mantenimiento_vencido' }),
        );
    });

    it('si GlorIA falla, el Aviso queda con error_envio y el resultado lo cuenta como fallido', async () => {
        avisarPatronMock.mockResolvedValue({ ok: false, error: 'GLORIA_API_URL/GLORIA_INTERNAL_TOKEN no configurados' });
        const prisma = prismaMockCon({});

        const resultado = await procesarMantenimientos(prisma as any);

        expect(prisma.aviso.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ error_envio: expect.stringContaining('no configurados') }),
        }));
        expect(resultado.avisosFallidos).toBe(1);
        expect(resultado.avisosEnviados).toBe(0);
    });

    it('sin patrón con teléfono → no llama a GlorIA (nada que hacer, sin reventar)', async () => {
        const prisma = prismaMockCon({});
        prisma.vehiculo.findMany.mockResolvedValue([{
            id: 'v1', matricula: '1234ABC', km_actuales: 9000, cliente_id: 'cli-1',
            cliente: { id: 'cli-1', preferencias_avisos: null, patron: { id: 42, telefono: null } },
            mantenimientos: [{
                id: 'mant-1', estado: 'PENDIENTE', ultimo_nivel_aviso_km: null, ultimo_nivel_aviso_dias: null,
                proximo_km: 9500, proxima_fecha: null, catalogo: { nombre: 'Cambio de aceite' },
            }],
        }]);

        await procesarMantenimientos(prisma as any);

        expect(avisarPatronMock).not.toHaveBeenCalled();
    });
});
