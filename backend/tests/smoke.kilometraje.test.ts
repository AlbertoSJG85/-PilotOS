/**
 * Tests de humo — Fase 5 (kilometraje maestro no retrocede).
 *
 * Cubren actualizarKmSiAvanza con un cliente de transaccion Prisma simulado
 * (mock), sin base de datos real: verifica que un parte con km_fin menor o
 * igual al oficial NUNCA actualiza vehiculo.km_actuales, y que un retroceso
 * real queda registrado como Anomalia (R-AN-001: se acumulan).
 */
import { describe, it, expect, vi } from 'vitest';
import { actualizarKmSiAvanza } from '../src/routes/parteDiario.routes';

function mockTx(kmActuales: number) {
    return {
        vehiculo: {
            findUnique: vi.fn().mockResolvedValue({ km_actuales: kmActuales }),
            update: vi.fn().mockResolvedValue({}),
        },
        anomalia: {
            create: vi.fn().mockResolvedValue({}),
        },
    } as any;
}

describe('actualizarKmSiAvanza', () => {
    it('km_fin mayor que el oficial → actualiza km_actuales, sin anomalia', async () => {
        const tx = mockTx(10000);
        await actualizarKmSiAvanza(tx, 'vehiculo-1', 10050, 'parte-1', 'conductor-1');
        expect(tx.vehiculo.update).toHaveBeenCalledWith({ where: { id: 'vehiculo-1' }, data: { km_actuales: 10050 } });
        expect(tx.anomalia.create).not.toHaveBeenCalled();
    });

    it('CRITICO: km_fin menor que el oficial (parte atrasado) → NO retrocede km_actuales, crea anomalia', async () => {
        const tx = mockTx(10000);
        await actualizarKmSiAvanza(tx, 'vehiculo-1', 9500, 'parte-1', 'conductor-1');
        expect(tx.vehiculo.update).not.toHaveBeenCalled();
        expect(tx.anomalia.create).toHaveBeenCalledOnce();
        const args = tx.anomalia.create.mock.calls[0][0];
        expect(args.data.tipo).toBe('KM_RETROCESO');
        expect(args.data.conductor_id).toBe('conductor-1');
        expect(args.data.parte_diario_id).toBe('parte-1');
    });

    it('km_fin igual al oficial → no actualiza ni crea anomalia', async () => {
        const tx = mockTx(10000);
        await actualizarKmSiAvanza(tx, 'vehiculo-1', 10000, 'parte-1', 'conductor-1');
        expect(tx.vehiculo.update).not.toHaveBeenCalled();
        expect(tx.anomalia.create).not.toHaveBeenCalled();
    });

    it('vehiculo inexistente → no hace nada (no lanza)', async () => {
        const tx = mockTx(0);
        tx.vehiculo.findUnique = vi.fn().mockResolvedValue(null);
        await expect(actualizarKmSiAvanza(tx, 'vehiculo-fantasma', 500, 'parte-1', 'conductor-1')).resolves.toBeUndefined();
        expect(tx.vehiculo.update).not.toHaveBeenCalled();
        expect(tx.anomalia.create).not.toHaveBeenCalled();
    });
});
