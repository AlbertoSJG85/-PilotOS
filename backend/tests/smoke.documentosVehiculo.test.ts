/**
 * Tests de humo — POST /internal/documentos-vehiculo (2026-08-11, actualizado
 * el 2026-08-12 en C-061).
 *
 * El propietario (o el asalariado) manda una foto por WhatsApp y el sistema
 * la encaja sola. Hasta el 2026-08-12 este endpoint SOLO guardaba la imagen
 * y dejaba el documento en RECIBIDO — nada volvía a tocarlo nunca, así que
 * una factura mandada por GlorIA desaparecía en la práctica. Ahora corre el
 * MISMO análisis que la subida desde la app (`analizarYRegistrarDocumento`,
 * mockeado aquí porque su lógica ya está probada en
 * smoke.documentoVehiculo.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const prismaMock = {
    vehiculo: { findUnique: vi.fn(), findMany: vi.fn() },
    documento: { create: vi.fn() },
    minosUser: { findFirst: vi.fn() },
    conductor: { findFirst: vi.fn() },
    cliente: { findFirst: vi.fn() },
};
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

const procesarYGuardarImagenMock = vi.fn();
vi.mock('../src/services/storage.service', () => ({ procesarYGuardarImagen: procesarYGuardarImagenMock }));

const analizarYRegistrarDocumentoMock = vi.fn();
vi.mock('../src/services/ocrDocumentoVehiculo.service', () => ({
    analizarYRegistrarDocumento: analizarYRegistrarDocumentoMock,
    hashDeBuffer: vi.fn().mockReturnValue('hash-de-prueba'),
}));

vi.mock('../src/middleware/billing-access.middleware', () => ({ clienteTieneFeaturePro: vi.fn().mockResolvedValue(true) }));

const { default: internalRoutes } = await import('../src/routes/internal.routes');

function manejadorDe(metodo: string, ruta: string) {
    const capa = (internalRoutes as any).stack.find(
        (c: any) => c.route?.path === ruta && c.route?.methods?.[metodo]
    );
    if (!capa) throw new Error(`no existe ${metodo.toUpperCase()} ${ruta}`);
    const stack = capa.route.stack;
    return stack[stack.length - 1].handle as (req: Request, res: Response) => Promise<void>;
}

function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { json: any; status: any };
}

function mockReq(body: any) {
    return { body, protocol: 'https', get: () => 'api.pilotos.nexostudios.digital' } as unknown as Request;
}

describe('POST /internal/documentos-vehiculo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        procesarYGuardarImagenMock.mockResolvedValue({ filename: 'foto-123.jpg', size: 500000, path: '/app/uploads/foto-123.jpg' });
        analizarYRegistrarDocumentoMock.mockResolvedValue({
            documento: { id: 'doc-1', tipo: 'FACTURA_TALLER', estado: 'PENDIENTE_CONFIRMACION' },
            propuesta: { tipo: 'FACTURA_TALLER', mantenimientos_detectados: [], faltantes: [] },
        });
    });

    it('sin vehiculo_id o imagen_base64 → 400', async () => {
        const res = mockRes();
        await manejadorDe('post', '/documentos-vehiculo')(mockReq({ vehiculo_id: 'v1' }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(prismaMock.documento.create).not.toHaveBeenCalled();
    });

    it('vehiculo inexistente → 404, no guarda nada', async () => {
        prismaMock.vehiculo.findUnique.mockResolvedValue(null);
        const res = mockRes();
        await manejadorDe('post', '/documentos-vehiculo')(mockReq({ vehiculo_id: 'no-existe', imagen_base64: 'aGVsbG8=' }), res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(procesarYGuardarImagenMock).not.toHaveBeenCalled();
    });

    it('caso feliz: guarda la imagen, la ANALIZA y crea el Documento listo para confirmar', async () => {
        prismaMock.vehiculo.findUnique.mockResolvedValue({ id: 'v1' });
        const res = mockRes();

        await manejadorDe('post', '/documentos-vehiculo')(
            mockReq({ vehiculo_id: 'v1', imagen_base64: 'aGVsbG8gbXVuZG8=', subido_por_telefono: '+34600111222' }),
            res,
        );

        expect(procesarYGuardarImagenMock).toHaveBeenCalledTimes(1);
        // CLAVE (C-061): ya no basta con guardar el fichero — tiene que
        // analizarse, o el documento no aparece nunca para confirmar.
        expect(analizarYRegistrarDocumentoMock).toHaveBeenCalledTimes(1);
        expect(analizarYRegistrarDocumentoMock).toHaveBeenCalledWith(expect.objectContaining({
            rutaLocal: '/app/uploads/foto-123.jpg',
            vehiculoId: 'v1',
            hashSha256: 'hash-de-prueba',
        }));
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            status: 'OK',
            data: expect.objectContaining({ documento_id: 'doc-1', tipo: 'FACTURA_TALLER' }),
        }));
    });

    it('imagen_base64 vacía o corrupta → 400, no llega a analizar nada', async () => {
        prismaMock.vehiculo.findUnique.mockResolvedValue({ id: 'v1' });
        const res = mockRes();
        await manejadorDe('post', '/documentos-vehiculo')(mockReq({ vehiculo_id: 'v1', imagen_base64: '' }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(analizarYRegistrarDocumentoMock).not.toHaveBeenCalled();
    });

    it('si Sharp no puede procesar la imagen → 415, no llega a analizar nada', async () => {
        prismaMock.vehiculo.findUnique.mockResolvedValue({ id: 'v1' });
        procesarYGuardarImagenMock.mockRejectedValue(new Error('formato no soportado'));
        const res = mockRes();
        await manejadorDe('post', '/documentos-vehiculo')(mockReq({ vehiculo_id: 'v1', imagen_base64: 'aGVsbG8=' }), res);
        expect(res.status).toHaveBeenCalledWith(415);
        expect(analizarYRegistrarDocumentoMock).not.toHaveBeenCalled();
    });
});

/**
 * Resolución por teléfono (2026-08-11): GlorIA solo sabe de teléfonos; qué
 * coche tiene cada persona es dominio de PilotOS y se decide aquí.
 */
describe('POST /internal/documentos-vehiculo — resolución por teléfono', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        procesarYGuardarImagenMock.mockResolvedValue({ filename: 'f.jpg', size: 1000, path: '/app/uploads/f.jpg' });
        analizarYRegistrarDocumentoMock.mockResolvedValue({
            documento: { id: 'doc-1', tipo: 'DOCUMENTO_VEHICULO_SIN_CLASIFICAR', estado: 'PENDIENTE_CONFIRMACION' },
            propuesta: { tipo: 'DOCUMENTO_VEHICULO_SIN_CLASIFICAR', mantenimientos_detectados: [], faltantes: [] },
        });
    });

    it('un solo vehículo → lo resuelve, lo analiza y deja quién lo mandó', async () => {
        prismaMock.minosUser.findFirst.mockResolvedValue({ id: 42 });
        prismaMock.conductor.findFirst.mockResolvedValue({ cliente_id: 'cli-1' });
        prismaMock.vehiculo.findMany.mockResolvedValue([{ id: 'v1', matricula: '1234ABC' }]);
        const res = mockRes();

        await manejadorDe('post', '/documentos-vehiculo')(
            mockReq({ subido_por_telefono: '+34600111222', imagen_base64: 'aGVsbG8=' }), res,
        );

        expect(analizarYRegistrarDocumentoMock).toHaveBeenCalledWith(expect.objectContaining({
            vehiculoId: 'v1',
            subidoPorUsuarioId: 42,
        }));
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('el teléfono llega sin + → lo prueba en las dos formas', async () => {
        prismaMock.minosUser.findFirst.mockResolvedValue({ id: 42 });
        prismaMock.conductor.findFirst.mockResolvedValue({ cliente_id: 'cli-1' });
        prismaMock.vehiculo.findMany.mockResolvedValue([{ id: 'v1', matricula: '1234ABC' }]);
        const res = mockRes();

        await manejadorDe('post', '/documentos-vehiculo')(
            mockReq({ subido_por_telefono: '34600111222', imagen_base64: 'aGVsbG8=' }), res,
        );

        expect(prismaMock.minosUser.findFirst).toHaveBeenCalledWith({
            where: { telefono: { in: ['34600111222', '+34600111222'] } },
        });
    });

    it('CRITICO: varios vehículos → 409 y NO adivina cuál (adjudicar mal es peor que no adjudicar)', async () => {
        prismaMock.minosUser.findFirst.mockResolvedValue({ id: 42 });
        prismaMock.conductor.findFirst.mockResolvedValue({ cliente_id: 'cli-1' });
        prismaMock.vehiculo.findMany.mockResolvedValue([
            { id: 'v1', matricula: '1111AAA' }, { id: 'v2', matricula: '2222BBB' },
        ]);
        const res = mockRes();

        await manejadorDe('post', '/documentos-vehiculo')(
            mockReq({ subido_por_telefono: '+34600111222', imagen_base64: 'aGVsbG8=' }), res,
        );

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0].vehiculos).toHaveLength(2);
        expect(prismaMock.documento.create).not.toHaveBeenCalled();
    });

    it('teléfono que no es de PilotOS → 404, no guarda nada (una foto de un huésped de RentOS no acaba aquí)', async () => {
        prismaMock.minosUser.findFirst.mockResolvedValue(null);
        const res = mockRes();

        await manejadorDe('post', '/documentos-vehiculo')(
            mockReq({ subido_por_telefono: '+34600999999', imagen_base64: 'aGVsbG8=' }), res,
        );

        expect(res.status).toHaveBeenCalledWith(404);
        expect(procesarYGuardarImagenMock).not.toHaveBeenCalled();
    });

    it('usuario sin vehículos → 404', async () => {
        prismaMock.minosUser.findFirst.mockResolvedValue({ id: 42 });
        prismaMock.conductor.findFirst.mockResolvedValue(null);
        prismaMock.cliente.findFirst.mockResolvedValue({ id: 'cli-1' });
        prismaMock.vehiculo.findMany.mockResolvedValue([]);
        const res = mockRes();

        await manejadorDe('post', '/documentos-vehiculo')(
            mockReq({ subido_por_telefono: '+34600111222', imagen_base64: 'aGVsbG8=' }), res,
        );

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('sin vehiculo_id ni teléfono → 400', async () => {
        const res = mockRes();
        await manejadorDe('post', '/documentos-vehiculo')(mockReq({ imagen_base64: 'aGVsbG8=' }), res);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
