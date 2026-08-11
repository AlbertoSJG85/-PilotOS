/**
 * Tests de humo — sombra de envío (Fase E, 2026-08-11).
 *
 * construirPayloadMeta debe replicar EXACTAMENTE el nodo "Build Meta
 * Payload" del worker n8n para los tres tipos que PilotOS envía. Si algún
 * día ese nodo cambia, este test es la señal de que la sombra se
 * desincronizó de la realidad.
 */
import { describe, it, expect, vi } from 'vitest';
import { construirPayloadMeta, registrarSombraEnvio } from '../src/services/metaPayload.service';

describe('construirPayloadMeta', () => {
    it('mantenimiento_proximo: payload con los 3 params en orden', () => {
        const r = construirPayloadMeta('mantenimiento_proximo', '+34600111222', {
            matricula: '1234ABC', mantenimiento: 'Cambio de aceite', motivo: 'Quedan 500 km o menos',
        });
        expect(r.ok).toBe(true);
        expect(r.meta_payload).toEqual({
            messaging_product: 'whatsapp',
            to: '+34600111222',
            type: 'template',
            template: {
                name: 'mantenimiento_proximo',
                language: { code: 'es' },
                components: [{
                    type: 'body',
                    parameters: [
                        { type: 'text', text: '1234ABC' },
                        { type: 'text', text: 'Cambio de aceite' },
                        { type: 'text', text: 'Quedan 500 km o menos' },
                    ],
                }],
            },
        });
    });

    it('anomalia_taximetro: solo 2 params (matricula, motivo)', () => {
        const r = construirPayloadMeta('anomalia_taximetro', '+34600111222', {
            matricula: '1234ABC', motivo: '40 km sin declarar',
        });
        expect(r.meta_payload?.template.components[0].parameters).toHaveLength(2);
        expect(r.meta_payload?.template.name).toBe('anomalia_taximetro');
    });

    it('parámetro faltante en el objeto → cadena vacía, no revienta', () => {
        const r = construirPayloadMeta('mantenimiento_vencido', '+34600111222', { matricula: '1234ABC' });
        expect(r.ok).toBe(true);
        expect(r.meta_payload?.template.components[0].parameters[2].text).toBe('');
    });

    it('tipo fuera del catálogo de PilotOS → ok:false, no revienta', () => {
        const r = construirPayloadMeta('nueva_entrada', '+34600111222', {});
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/desconocido/i);
    });
});

describe('registrarSombraEnvio', () => {
    it('inserta un registro con la entrada y el payload construido', async () => {
        const create = vi.fn().mockResolvedValue({});
        const prisma = { sombraEnvio: { create } };

        await registrarSombraEnvio(prisma as any, 'aviso-1', '+34600111222', 'mantenimiento_proximo', {
            matricula: '1234ABC', mantenimiento: 'ITV', motivo: 'Vencido',
        });

        expect(create).toHaveBeenCalledTimes(1);
        const data = create.mock.calls[0][0].data;
        expect(data.aviso_id).toBe('aviso-1');
        expect(data.entrada.tipo).toBe('mantenimiento_proximo');
        expect(data.decision_backend.template.name).toBe('mantenimiento_proximo');
        expect(data.alerta).toBeNull();
    });

    it('tipo desconocido → igualmente registra, con la alerta como motivo', async () => {
        const create = vi.fn().mockResolvedValue({});
        const prisma = { sombraEnvio: { create } };

        await registrarSombraEnvio(prisma as any, undefined, '+34600111222', 'tipo_raro', {});

        expect(create).toHaveBeenCalledTimes(1);
        expect(create.mock.calls[0][0].data.alerta).toMatch(/desconocido/i);
    });

    it('si la BD falla al insertar, no lanza (nunca debe romper el envío real)', async () => {
        const create = vi.fn().mockRejectedValue(new Error('BD caida'));
        const prisma = { sombraEnvio: { create } };

        await expect(
            registrarSombraEnvio(prisma as any, 'aviso-1', '+34600111222', 'mantenimiento_proximo', { matricula: 'x' }),
        ).resolves.toBeUndefined();
    });
});
