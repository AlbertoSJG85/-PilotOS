/**
 * Tests de humo — de quién es un fichero de /uploads (2026-08-12, C-065).
 *
 * Este guardia tiene que acertar en las dos direcciones y las dos duelen:
 *
 *   · Si dice que NO cuando debería decir que sí, el dueño pulsa "Ver
 *     documento" y le sale una pantalla en negro sobre su propia factura.
 *     Eso es lo que pasó con los papeles del vehículo, que no tienen enlace
 *     a ningún parte diario y por eso no se les encontraba dueño.
 *   · Si dice que SÍ cuando debería decir que no, un cliente ve las fotos de
 *     otro. Es el agujero que cerró la Fase 2 de seguridad.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock: any = { documento: { findFirst: vi.fn() } };
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

const { resolverClienteIdDeArchivo } = await import('../src/services/propiedadArchivo.service');

beforeEach(() => {
    vi.clearAllMocks();
});

describe('resolver el dueño de un fichero de /uploads', () => {
    it('CLAVE: un papel del vehículo (factura de taller, ITV) tiene dueño por su vehículo', async () => {
        // Este es el caso que devolvía 403 y pintaba la pantalla en negro.
        prismaMock.documento.findFirst.mockResolvedValue({
            vehiculo: { cliente_id: 'cli-1' },
            enlaces: [],
        });

        expect(await resolverClienteIdDeArchivo('foto-123.jpg')).toBe('cli-1');
    });

    it('un ticket del parte diario tiene dueño por su parte', async () => {
        prismaMock.documento.findFirst.mockResolvedValue({
            vehiculo: null,
            enlaces: [{ parteDiario: { vehiculo: { cliente_id: 'cli-2' } } }],
        });

        expect(await resolverClienteIdDeArchivo('ticket-9.jpg')).toBe('cli-2');
    });

    it('un fichero que no es de ningún documento no tiene dueño (se deniega)', async () => {
        prismaMock.documento.findFirst.mockResolvedValue(null);
        expect(await resolverClienteIdDeArchivo('lo-que-sea.jpg')).toBeNull();
    });

    it('un documento sin vehículo y sin parte tampoco lo tiene: ante la duda, no se enseña', async () => {
        prismaMock.documento.findFirst.mockResolvedValue({ vehiculo: null, enlaces: [] });
        expect(await resolverClienteIdDeArchivo('huerfano.jpg')).toBeNull();
    });

    it('sin nombre de fichero no se consulta ni la base de datos', async () => {
        expect(await resolverClienteIdDeArchivo('')).toBeNull();
        expect(prismaMock.documento.findFirst).not.toHaveBeenCalled();
    });

    it('el dueño se busca por el NOMBRE del fichero, no por la URL entera', async () => {
        // Las URLs guardadas son absolutas y cambian de host entre entornos;
        // el nombre del fichero es lo único estable.
        prismaMock.documento.findFirst.mockResolvedValue({ vehiculo: { cliente_id: 'cli-1' }, enlaces: [] });
        await resolverClienteIdDeArchivo('foto-123.jpg');

        expect(prismaMock.documento.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { url: { endsWith: 'foto-123.jpg' } } }),
        );
    });
});
