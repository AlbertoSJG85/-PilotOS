/**
 * Vuelve a pasar el PARSER sobre el texto OCR ya guardado en cada documento
 * (`documento.ocr_texto`) y actualiza `ocr_datos_extraidos`.
 *
 * Para qué sirve: cuando se corrige el parser (C-043, C-054, C-055, C-056...),
 * los documentos ya subidos siguen con la lectura vieja. Volver a ejecutar
 * Tesseract no hace falta —el texto crudo ya está guardado—, solo hay que
 * reinterpretarlo.
 *
 * IMPORTANTE: al terminar re-lanza la comparación del parte, para que las
 * anomalías del panel correspondan a los datos nuevos. Sin eso quedan alertas
 * fantasma: el documento dice una cosa y la anomalía otra (pasó el 2026-08-11
 * con el combustible: la anomalía seguía diciendo 1,30 € cuando el documento
 * ya leía bien los 28,70 €).
 *
 * Uso:
 *   npx ts-node scripts/reparsear-documentos.ts --parte=<uuid> [--dry]
 *   npx ts-node scripts/reparsear-documentos.ts --fecha=2026-08-10 [--dry]
 */
import { prisma } from '../src/lib/prisma';
import { validarTicketTaximetro, validarTicketGasoil } from '../src/services/ocr.service';
import { compararDocumentosConParte } from '../src/services/ocrComparacion.service';

(async () => {
    const dry = process.argv.includes('--dry');
    const parteArg = process.argv.find((a) => a.startsWith('--parte='));
    const fechaArg = process.argv.find((a) => a.startsWith('--fecha='));

    let partes: { id: string; fecha_trabajada: Date }[] = [];
    if (parteArg) {
        const p = await prisma.parteDiario.findUnique({
            where: { id: parteArg.replace('--parte=', '') },
            select: { id: true, fecha_trabajada: true },
        });
        if (p) partes = [p];
    } else if (fechaArg) {
        partes = await prisma.parteDiario.findMany({
            where: { fecha_trabajada: new Date(fechaArg.replace('--fecha=', '') + 'T00:00:00.000Z') },
            select: { id: true, fecha_trabajada: true },
        });
    } else {
        console.log('Uso: --parte=<uuid> | --fecha=YYYY-MM-DD  [--dry]');
        process.exit(1);
    }

    if (partes.length === 0) {
        console.log('Sin partes coincidentes.');
        await prisma.$disconnect();
        return;
    }

    for (const parte of partes) {
        console.log(`\n=== Parte ${parte.id.slice(0, 8)} (${parte.fecha_trabajada.toISOString().slice(0, 10)})`);
        const enlaces = await prisma.documentoEnlace.findMany({
            where: { entidad_tipo: 'PARTE_DIARIO', entidad_id: parte.id },
            include: { documento: true },
        });

        for (const e of enlaces) {
            const doc = e.documento;
            if (!doc.ocr_texto?.trim()) {
                console.log(`  · ${doc.tipo} ${doc.id.slice(0, 8)}: sin texto OCR guardado, se salta`);
                continue;
            }
            const datos = doc.tipo === 'TICKET_TAXIMETRO'
                ? validarTicketTaximetro(doc.ocr_texto)
                : validarTicketGasoil(doc.ocr_texto);

            console.log(`  · ${doc.tipo} ${doc.id.slice(0, 8)}: valido=${datos.valido}`);
            console.log(`      antes:  ${JSON.stringify(doc.ocr_datos_extraidos)?.slice(0, 300)}`);
            console.log(`      ahora:  ${JSON.stringify(datos).slice(0, 300)}`);

            if (!dry) {
                await prisma.documento.update({
                    where: { id: doc.id },
                    data: { ocr_datos_extraidos: datos as any },
                });
            }
        }

        if (dry) {
            console.log('  (--dry: no se ha escrito nada ni se ha recomparado)');
            continue;
        }

        const r = await compararDocumentosConParte(parte.id);
        console.log(`  Recomparado: ${r.total_discrepancias} discrepancia(s)`);
        for (const [docId, arr] of Object.entries(r.discrepancias_por_doc)) {
            for (const d of arr) console.log(`    · [${d.severidad}] (${docId.slice(0, 8)}) ${d.mensaje}`);
        }
    }

    await prisma.$disconnect();
})().catch(async (e) => {
    console.error('ERROR:', e);
    await prisma.$disconnect();
    process.exit(1);
});
