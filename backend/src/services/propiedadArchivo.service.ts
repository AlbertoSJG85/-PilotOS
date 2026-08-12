/**
 * De quién es un fichero de `/uploads` (extraído de index.ts el 2026-08-12).
 *
 * Es el guardia que impide que un cliente vea las fotos de otro. Nació en la
 * Fase 2 de seguridad (2026-07-24): antes, `/uploads` solo comprobaba que el
 * JWT fuera válido, así que cualquier usuario autenticado podía leer los
 * tickets de otro cliente si acertaba el nombre del fichero.
 *
 * POR QUÉ VIVE AQUÍ Y NO EN `index.ts`. Porque tenía un agujero que ninguna
 * prueba podía ver: seguía la cadena Documento → enlace → ParteDiario →
 * vehículo, que es la de los tickets del parte. Los papeles del vehículo
 * (ITV, factura de taller, póliza) no tienen enlace a ningún parte: cuelgan
 * del vehículo directamente. Así que para ellos no encontraba dueño, devolvía
 * 403, y el navegador enseñaba una pantalla en negro al pulsar "Ver
 * documento" — con la sesión válida y el fichero perfectamente guardado.
 *
 * Metido en index.ts, junto al arranque del servidor, esto no se podía
 * probar. Aquí sí, y hay tests que cubren los dos caminos.
 */
import { prisma } from '../lib/prisma';

/**
 * Devuelve el `cliente_id` dueño del fichero, o `null` si no se puede
 * determinar. `null` significa DENEGAR: ante la duda, no se enseña.
 */
export async function resolverClienteIdDeArchivo(filename: string): Promise<string | null> {
    if (!filename) return null;

    const documento = await prisma.documento.findFirst({
        where: { url: { endsWith: filename } },
        include: {
            vehiculo: { select: { cliente_id: true } },
            enlaces: {
                include: { parteDiario: { include: { vehiculo: { select: { cliente_id: true } } } } },
            },
        },
    });
    if (!documento) return null;

    // Camino directo: los papeles del vehículo. Va primero porque es el más
    // barato y el más fiable — el documento apunta a su vehículo y ya está.
    if (documento.vehiculo?.cliente_id) return documento.vehiculo.cliente_id;

    // Camino por el parte: los tickets del taxímetro y de gasolinera, que
    // llegan enganchados a un parte diario y no traen vehículo propio.
    for (const enlace of documento.enlaces) {
        const clienteId = enlace.parteDiario?.vehiculo?.cliente_id;
        if (clienteId) return clienteId;
    }

    return null;
}
