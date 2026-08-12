/**
 * Vuelve a pasar el OCR sobre la IMAGEN de documentos ya subidos, no sobre el
 * texto guardado (para eso está reparsear-documentos.ts).
 *
 * Hace falta cuando lo que cambia es cómo se lee la foto, no cómo se
 * interpreta el texto: por ejemplo C-060, donde el arreglo fue agrandar la
 * imagen antes de dársela a Tesseract. Los documentos antiguos siguen con el
 * texto malo hasta que se vuelven a leer.
 *
 * Las imágenes viven en el servidor. Este script asume que ya están
 * descargadas en una carpeta local (se le pasa con --imagenes=RUTA), porque
 * bajarlas es cosa de ssh/scp y no de Prisma.
 *
 * Uso:
 *   npx ts-node -T scripts/releer-imagenes.ts --imagenes=./tmp-fotos --fecha=2026-08-10
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { extraerTextoImagen, validarTicketTaximetro, validarTicketGasoil } from '../src/services/ocr.service';
import { compararDocumentosConParte } from '../src/services/ocrComparacion.service';
import { aplicarRetencion } from '../src/services/retencionParte.service';

(async () => {
    const carpetaArg = process.argv.find((a) => a.startsWith('--imagenes='));
    const fechaArg = process.argv.find((a) => a.startsWith('--fecha='));
    if (!carpetaArg) {
        console.log('Falta --imagenes=RUTA (carpeta con las fotos descargadas del servidor)');
        process.exit(1);
    }
    const carpeta = carpetaArg.replace('--imagenes=', '');

    const where: any = {};
    if (fechaArg) where.fecha_trabajada = new Date(fechaArg.replace('--fecha=', '') + 'T00:00:00.000Z');

    const partes = await prisma.parteDiario.findMany({ where, select: { id: true, fecha_trabajada: true } });

    for (const parte of partes) {
        console.log(`\n=== Parte ${parte.id.slice(0, 8)} (${parte.fecha_trabajada.toISOString().slice(0, 10)})`);
        const enlaces = await prisma.documentoEnlace.findMany({
            where: { entidad_tipo: 'PARTE_DIARIO', entidad_id: parte.id },
            include: { documento: true },
        });

        for (const e of enlaces) {
            const doc = e.documento;
            const nombre = doc.url.split('?')[0].split('/').pop() ?? '';
            const ruta = path.join(carpeta, nombre);
            if (!fs.existsSync(ruta)) {
                console.log(`  · ${doc.tipo}: no tengo la imagen (${nombre}), se salta`);
                continue;
            }

            const ocr = await extraerTextoImagen(ruta);
            const datos = doc.tipo === 'TICKET_TAXIMETRO'
                ? validarTicketTaximetro(ocr.texto)
                : validarTicketGasoil(ocr.texto);

            const antes = (doc.ocr_datos_extraidos ?? {}) as any;
            console.log(`  · ${doc.tipo}: borrados ${antes.acum_borrados ?? '—'} -> ${(datos as any).acum_borrados ?? '—'}`
                + ` | importe turno ${antes.parc_total ?? '—'} -> ${(datos as any).parc_total ?? '—'}`);

            await prisma.documento.update({
                where: { id: doc.id },
                data: { ocr_texto: ocr.texto, ocr_confianza: ocr.confianza, ocr_datos_extraidos: datos as any },
            });
        }

        const r = await compararDocumentosConParte(parte.id);
        const efecto = await aplicarRetencion(parte.id, r.total_discrepancias);
        console.log(`  Discrepancias: ${r.total_discrepancias} | retención: ${efecto}`);
        for (const arr of Object.values(r.discrepancias_por_doc)) {
            for (const d of arr) console.log(`    · [${d.severidad}] ${d.mensaje}`);
        }
    }

    await prisma.$disconnect();
})().catch(async (e) => { console.error('ERROR:', e); await prisma.$disconnect(); process.exit(1); });
