/**
 * Re-ejecuta la comparación parte↔ticket sobre un parte ya enviado.
 * Útil para que partes creados con la lógica vieja se actualicen sin
 * tener que rehacer la prueba.
 *
 * Uso:
 *   npx ts-node scripts/recomparar-parte.ts --fecha=2026-05-18
 *   npx ts-node scripts/recomparar-parte.ts --id=<parte_id>
 */
import { prisma } from '../src/lib/prisma';
import { compararDocumentosConParte } from '../src/services/ocrComparacion.service';

(async () => {
    const fechaArg = process.argv.find(a => a.startsWith('--fecha='));
    const idArg = process.argv.find(a => a.startsWith('--id='));
    let partes: { id: string; fecha_trabajada: Date }[] = [];

    if (idArg) {
        const id = idArg.replace('--id=', '');
        const p = await prisma.parteDiario.findUnique({ where: { id }, select: { id: true, fecha_trabajada: true } });
        if (p) partes = [p];
    } else if (fechaArg) {
        const fecha = new Date(fechaArg.replace('--fecha=', '') + 'T00:00:00.000Z');
        partes = await prisma.parteDiario.findMany({
            where: { fecha_trabajada: fecha },
            select: { id: true, fecha_trabajada: true },
        });
    } else {
        console.log('Uso: --fecha=YYYY-MM-DD  o  --id=<uuid>');
        process.exit(1);
    }

    if (partes.length === 0) {
        console.log('Sin partes coincidentes.');
        await prisma.$disconnect();
        return;
    }

    for (const p of partes) {
        const fecha = p.fecha_trabajada.toISOString().slice(0, 10);
        console.log(`\nRe-comparando parte ${p.id.slice(0, 8)} (${fecha})...`);
        const r = await compararDocumentosConParte(p.id);
        console.log(`  total_discrepancias: ${r.total_discrepancias}`);
        for (const [docId, arr] of Object.entries(r.discrepancias_por_doc)) {
            console.log(`  doc ${docId.slice(0, 8)}:`);
            for (const d of arr) {
                console.log(`    · [${d.severidad}] ${d.mensaje}`);
            }
        }
    }

    await prisma.$disconnect();
})().catch(async (e) => {
    console.error('ERROR:', e);
    await prisma.$disconnect();
    process.exit(1);
});
