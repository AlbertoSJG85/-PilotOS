/**
 * OCR Comparacion Service — Compara datos del OCR con los declarados en el parte.
 *
 * Reglas Fase 2 (no bloquean envío del parte; solo registran trazabilidad):
 *   - Taxímetro: si el OCR detectó importe, comparar con ingreso_bruto. Tolerancia ±3 €.
 *   - Combustible: suma de importes OCR de todos los TICKET_GASOIL/TICKET_COMBUSTIBLE
 *     vinculados al parte vs combustible declarado. Tolerancia ±0.50 €.
 *   - Combustible fecha: aceptar fecha del parte o del día siguiente (madrugada). No se
 *     genera anomalía por fecha en esta fase, solo se traza si el OCR la trajo.
 *
 * Si la diferencia supera la tolerancia, crea una Anomalia tipo NORMAL con detalle.
 * Una diferencia simple no bloquea ni paraliza el flujo.
 */
import { prisma } from '../lib/prisma';

const TOLERANCIA_TAXIMETRO_EUR = 3;
const TOLERANCIA_GASOIL_EUR = 0.5;

interface DatosOcr {
    importe?: number;
    litros?: number;
    valido?: boolean;
}

function leerDatosOcr(json: unknown): DatosOcr | null {
    if (!json || typeof json !== 'object') return null;
    const j = json as any;
    const importe = typeof j.importe === 'number' ? j.importe : undefined;
    const litros = typeof j.litros === 'number' ? j.litros : undefined;
    return { importe, litros, valido: !!j.valido };
}

export async function compararDocumentosConParte(parte_diario_id: string): Promise<void> {
    const parte = await prisma.parteDiario.findUnique({
        where: { id: parte_diario_id },
        include: { documentos: { include: { documento: true } } },
    });
    if (!parte) return;

    const ingresoDeclarado = Number(parte.ingreso_bruto || 0);
    const combustibleDeclarado = parte.combustible ? Number(parte.combustible) : 0;

    const docsTaxi = parte.documentos
        .map((e) => e.documento)
        .filter((d) => d.tipo === 'TICKET_TAXIMETRO' && d.estado !== 'BLOQUEADO');
    const docsGasoil = parte.documentos
        .map((e) => e.documento)
        .filter((d) => (d.tipo === 'TICKET_GASOIL' || d.tipo === 'TICKET_COMBUSTIBLE') && d.estado !== 'BLOQUEADO');

    // 1. Taxímetro: si hay algún ticket con importe leído, comparar contra el bruto.
    for (const doc of docsTaxi) {
        const datos = leerDatosOcr(doc.ocr_datos_extraidos);
        if (!datos?.importe) continue;
        const diff = Math.abs(datos.importe - ingresoDeclarado);
        if (diff > TOLERANCIA_TAXIMETRO_EUR) {
            await crearAnomalia(parte.conductor_id,
                `Discrepancia ticket taxímetro: declarado ${ingresoDeclarado.toFixed(2)} € vs OCR ${datos.importe.toFixed(2)} € (diff ${diff.toFixed(2)} €)`
            );
        }
    }

    // 2. Combustible: suma de importes OCR vs declarado.
    if (combustibleDeclarado > 0 && docsGasoil.length > 0) {
        let sumaOcr = 0;
        let alMenosUnoConImporte = false;
        for (const doc of docsGasoil) {
            const datos = leerDatosOcr(doc.ocr_datos_extraidos);
            if (datos?.importe) {
                sumaOcr += datos.importe;
                alMenosUnoConImporte = true;
            }
        }
        if (alMenosUnoConImporte) {
            const diff = Math.abs(sumaOcr - combustibleDeclarado);
            if (diff > TOLERANCIA_GASOIL_EUR) {
                await crearAnomalia(parte.conductor_id,
                    `Discrepancia combustible: declarado ${combustibleDeclarado.toFixed(2)} € vs suma OCR ${sumaOcr.toFixed(2)} € (${docsGasoil.length} ticket(s))`
                );
            }
        }
    }
}

async function crearAnomalia(conductor_id: string, descripcion: string): Promise<void> {
    await prisma.anomalia.create({
        data: { conductor_id, tipo: 'NORMAL', descripcion },
    });
}
