/**
 * OCR Comparacion Service — Compara datos del OCR con los declarados en el parte.
 *
 * Reglas (no bloquean envío del parte; solo registran trazabilidad):
 *   1. Taxímetro: P Total vs ingreso_bruto. Tolerancia ±3 €.
 *      Si no hay P Total (OCR no concluyente): sin anomalía.
 *   2. Distancia: P Dist.Total vs km_fin-km_inicio. Tolerancia ±6 km.
 *   3. Borrados: acum_borrados actual vs ticket anterior del mismo vehículo.
 *      Incremento > 1 → Anomalía CRITICA.
 *      Decremento → Anomalía CRITICA (posible reset del taxímetro).
 *   4. Combustible: suma OCR de tickets vs combustible declarado. Tolerancia ±0.50 €.
 *
 * Anomalías se almacenan con parte_diario_id y documento_id para trazabilidad.
 */
import { prisma } from '../lib/prisma';
import type { DatosTaximetro } from './ocr.service';

const TOLERANCIA_TAXIMETRO_EUR = 3;
const TOLERANCIA_KM = 6;
const TOLERANCIA_GASOIL_EUR = 0.5;

// ─────────────────────────────────────────────────────────
// Helpers de lectura de datos OCR
// ─────────────────────────────────────────────────────────

function leerDatosTaximetro(json: unknown): DatosTaximetro | null {
    if (!json || typeof json !== 'object') return null;
    return json as DatosTaximetro;
}

interface DatosGasoil {
    importe?: number;
    valido?: boolean;
}

function leerDatosGasoil(json: unknown): DatosGasoil | null {
    if (!json || typeof json !== 'object') return null;
    const j = json as any;
    return { importe: typeof j.importe === 'number' ? j.importe : undefined, valido: !!j.valido };
}

// ─────────────────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────────────────

export async function compararDocumentosConParte(parte_diario_id: string): Promise<void> {
    const parte = await prisma.parteDiario.findUnique({
        where: { id: parte_diario_id },
        include: { documentos: { include: { documento: true } } },
    });
    if (!parte) return;

    const ingresoDeclarado = Number(parte.ingreso_bruto || 0);
    const combustibleDeclarado = parte.combustible ? Number(parte.combustible) : 0;
    const kmDiario = parte.km_fin - parte.km_inicio;

    const docsTaxi = parte.documentos
        .map((e) => e.documento)
        .filter((d) => d.tipo === 'TICKET_TAXIMETRO' && d.estado !== 'BLOQUEADO');

    const docsGasoil = parte.documentos
        .map((e) => e.documento)
        .filter((d) => (d.tipo === 'TICKET_GASOIL' || d.tipo === 'TICKET_COMBUSTIBLE') && d.estado !== 'BLOQUEADO');

    // 1 + 2 + 3. Taxímetro
    for (const doc of docsTaxi) {
        const datos = leerDatosTaximetro(doc.ocr_datos_extraidos);
        if (!datos) continue;

        const pTotal = datos.parc_total ?? datos.importe;

        // 1. Ingreso vs P Total
        if (pTotal !== undefined && datos.valido) {
            const diff = Math.abs(pTotal - ingresoDeclarado);
            if (diff > TOLERANCIA_TAXIMETRO_EUR) {
                await crearAnomalia(
                    parte.conductor_id,
                    `Discrepancia ticket taxímetro: declarado ${ingresoDeclarado.toFixed(2)} € vs OCR ${pTotal.toFixed(2)} € (diff ${diff.toFixed(2)} €)`,
                    parte.id,
                    doc.id,
                    'NORMAL',
                );
            }
        }

        // 2. Km vs P Dist.Total
        if (datos.parc_dist_total !== undefined) {
            const diff = Math.abs(datos.parc_dist_total - kmDiario);
            if (diff > TOLERANCIA_KM) {
                await crearAnomalia(
                    parte.conductor_id,
                    `Discrepancia km: declarado ${kmDiario} km vs OCR ${datos.parc_dist_total} km (diff ${diff.toFixed(1)} km)`,
                    parte.id,
                    doc.id,
                    'NORMAL',
                );
            }
        }

        // 3. Borrados vs ticket anterior
        if (datos.acum_borrados !== undefined) {
            await compararBorrados(parte, doc.id, datos.acum_borrados);
        }
    }

    // 4. Combustible
    if (combustibleDeclarado > 0 && docsGasoil.length > 0) {
        let sumaOcr = 0;
        let tieneAlguno = false;
        for (const doc of docsGasoil) {
            const datos = leerDatosGasoil(doc.ocr_datos_extraidos);
            if (datos?.importe) { sumaOcr += datos.importe; tieneAlguno = true; }
        }
        if (tieneAlguno) {
            const diff = Math.abs(sumaOcr - combustibleDeclarado);
            if (diff > TOLERANCIA_GASOIL_EUR) {
                await crearAnomalia(
                    parte.conductor_id,
                    `Discrepancia combustible: declarado ${combustibleDeclarado.toFixed(2)} € vs suma OCR ${sumaOcr.toFixed(2)} € (${docsGasoil.length} ticket(s), diff ${diff.toFixed(2)} €)`,
                    parte.id,
                    undefined,
                    'NORMAL',
                );
            }
        }
    }
}

// ─────────────────────────────────────────────────────────
// Comparación de Borrados con el ticket anterior
// ─────────────────────────────────────────────────────────

async function compararBorrados(
    parte: { id: string; vehiculo_id: string; fecha_trabajada: Date; conductor_id: string },
    docId: string,
    borradosActual: number,
): Promise<void> {
    const parteAnterior = await prisma.parteDiario.findFirst({
        where: {
            vehiculo_id: parte.vehiculo_id,
            fecha_trabajada: { lt: parte.fecha_trabajada },
            estado: { in: ['ENVIADO', 'FOTO_SUSTITUIDA'] },
        },
        orderBy: { fecha_trabajada: 'desc' },
        include: { documentos: { include: { documento: true } } },
    });

    if (!parteAnterior) return;

    const docAnterior = parteAnterior.documentos
        .map((e) => e.documento)
        .find((d) => d.tipo === 'TICKET_TAXIMETRO' && d.estado !== 'BLOQUEADO');

    if (!docAnterior) return;

    const datosAnt = leerDatosTaximetro(docAnterior.ocr_datos_extraidos);
    if (datosAnt?.acum_borrados === undefined) return;

    const diff = borradosActual - datosAnt.acum_borrados;

    if (diff < 0) {
        await crearAnomalia(
            parte.conductor_id,
            `Borrados disminuyó: anterior ${datosAnt.acum_borrados} → actual ${borradosActual}. Posible reinicio del taxímetro.`,
            parte.id,
            docId,
            'CRITICA',
        );
    } else if (diff > 1) {
        await crearAnomalia(
            parte.conductor_id,
            `Borrados aumentó ${diff} en un turno (anterior ${datosAnt.acum_borrados} → actual ${borradosActual}). Máximo esperado: +1.`,
            parte.id,
            docId,
            'CRITICA',
        );
    }
    // diff = 0 or 1 → normal
}

// ─────────────────────────────────────────────────────────
// Creación de Anomalia con trazabilidad completa
// ─────────────────────────────────────────────────────────

async function crearAnomalia(
    conductor_id: string,
    descripcion: string,
    parte_diario_id?: string,
    documento_id?: string,
    tipo: 'NORMAL' | 'CRITICA' = 'NORMAL',
): Promise<void> {
    await prisma.anomalia.create({
        data: {
            conductor_id,
            tipo,
            descripcion,
            parte_diario_id: parte_diario_id ?? null,
            documento_id: documento_id ?? null,
        },
    });
}
