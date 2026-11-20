/**
 * Fotos que llegan por WhatsApp: leer, enseñar, verificar y SOLO ENTONCES archivar (2026-11-20).
 *
 * POR QUÉ. Hasta hoy GlorIA subía cualquier foto de un usuario de PilotOS a Documentos antes de que nadie
 * supiera qué era: una captura del banco acabó como "documento del vehículo" con el concepto "Seguro del
 * vehículo" porque ponía "Seguros". Alberto fijó la regla:
 *   - si la factura no dice de qué vehículo es y hay varios en la flota, se pregunta;
 *   - lo leído se le enseña a la persona, porque el OCR se equivoca;
 *   - se corrige hablando, y solo con su "sí" se archiva;
 *   - el borrador es INVISIBLE (no sale en Documentos) y se borra solo a los 7 días.
 *
 * El borrador es una fila de `documentos` en estado `BORRADOR_WHATSAPP`. Ni el listado de la app ni
 * "esperan tu confirmación" lo enseñan (ver documentoVehiculo.routes.ts). Las correcciones viven en
 * `datos_confirmados.cambios` hasta que se confirma; lo que leyó el OCR (`ocr_datos_extraidos`) no se toca.
 *
 * Cada operación llega con el TELÉFONO de quien escribe y se comprueba que el borrador es suyo: un
 * teléfono no puede ver, corregir ni confirmar el borrador de otro.
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { variantesTelefono } from '../lib/telefono';
import { analizarImagen, extraerTextoImagen } from './ocr.service';
import {
    analizarDocumentoVehiculo,
    detectarMantenimientos,
    extraerBaseImponible,
    type PropuestaDocumento,
} from './ocrDocumentoVehiculo.service';
import { aplicarDocumentoConfirmado, parsearFechaEs, type DatosDocumentoConfirmados } from './aplicarDocumento.service';

export const ESTADO_BORRADOR = 'BORRADOR_WHATSAPP';
export const DIAS_BORRADOR = 7;
const CONTEXTO_DOCUMENTO = 'documento de un vehículo: factura de taller, tarjeta de ITV, tarjeta de transporte o póliza de seguro';

// ─────────────────────────────────────────────────────────
// Quién escribe
// ─────────────────────────────────────────────────────────

export interface VehiculoFlota { id: string; matricula: string }

export interface Remitente {
    usuarioId: number;
    clienteId: string;
    esPatron: boolean;
    /** Los vehículos entre los que puede estar la foto: los de la empresa (patrón) o los suyos (conductor). */
    flota: VehiculoFlota[];
}

export type FalloRemitente = 'usuario_no_encontrado' | 'sin_cliente_pilotos' | 'sin_vehiculos';

export async function resolverRemitente(telefono: string): Promise<Remitente | FalloRemitente> {
    const user = await prisma.minosUser.findFirst({ where: { telefono: { in: variantesTelefono(telefono.trim()) } } });
    if (!user) return 'usuario_no_encontrado';

    const conductor = await prisma.conductor.findFirst({
        where: { usuario_id: user.id, activo: true },
        select: { id: true, cliente_id: true, es_patron: true },
    });
    const clientePatron = conductor
        ? null
        : await prisma.cliente.findFirst({ where: { patron_id: user.id, activo: true }, select: { id: true } });
    const clienteId = conductor?.cliente_id ?? clientePatron?.id;
    if (!clienteId) return 'sin_cliente_pilotos';
    const esPatron = clientePatron !== null || conductor?.es_patron === true;

    let flota = await prisma.vehiculo.findMany({
        where: { cliente_id: clienteId, activo: true },
        select: { id: true, matricula: true },
        orderBy: { matricula: 'asc' },
    });
    // Un conductor asalariado solo elige entre los coches que tiene asignados (si tiene alguno).
    if (!esPatron && conductor) {
        const asignados = await prisma.vehiculoConductor.findMany({
            where: { conductor_id: conductor.id, activo: true },
            select: { vehiculo_id: true },
        });
        const ids = new Set(asignados.map((a) => a.vehiculo_id));
        if (ids.size > 0) flota = flota.filter((v) => ids.has(v.id));
    }
    if (flota.length === 0) return 'sin_vehiculos';
    return { usuarioId: user.id, clienteId, esPatron, flota };
}

// ─────────────────────────────────────────────────────────
// La lectura que se le enseña a la persona (función pura)
// ─────────────────────────────────────────────────────────

/** Lo que la persona ha corregido por WhatsApp. Solo estos campos. */
export interface CambiosBorrador {
    fecha?: string;        // DD/MM/YYYY
    importe?: number;
    concepto?: string;
    matricula?: string;    // tiene que ser de su flota
    es_del_taxi?: boolean; // "sí, es un gasto del taxi" cuando el papel no lo parece
}

export type CampoDudoso = 'legible' | 'vehiculo' | 'fecha' | 'importe' | 'valida_hasta' | 'del_taxi';

export interface Dudoso {
    campo: CampoDudoso;
    motivo: string;
    /** true = no se puede archivar hasta resolverlo. false = aviso: la persona lo ve y decide. */
    bloquea: boolean;
}

export interface Lectura {
    estado: 'LEYENDO' | 'LISTO' | 'ARCHIVADO' | 'EN_REVISION' | 'EN_LA_APP' | 'DESCARTADO';
    legible: boolean;
    es_del_vehiculo: boolean;
    tipo: string;
    tipo_legible: string;
    fecha?: string;
    importe?: number;
    base_imponible?: number;
    concepto?: string;
    valida_hasta?: string;
    vehiculo: { id: string; matricula: string; como: 'leido_en_documento' | 'unico_vehiculo' | 'elegido' } | null;
    flota: string[];
    dudosos: Dudoso[];
    duplicado: null | { motivo: 'misma_foto' | 'gasto_parecido'; fecha?: string; importe?: number; descripcion?: string };
    corregido: string[];
    listo_para_confirmar: boolean;
}

const TIPO_LEGIBLE: Record<string, string> = {
    FACTURA_TALLER: 'Factura de taller',
    CERTIFICADO_ITV: 'ITV',
    POLIZA_SEGURO: 'Póliza de seguro',
    TARJETA_TRANSPORTE: 'Tarjeta de transporte',
    DOCUMENTO_VEHICULO_SIN_CLASIFICAR: 'Documento sin clasificar',
};

const TIPOS_CON_VALIDEZ = new Set(['CERTIFICADO_ITV', 'TARJETA_TRANSPORTE', 'POLIZA_SEGURO']);
const TIPOS_SIN_IMPORTE = new Set(['CERTIFICADO_ITV', 'TARJETA_TRANSPORTE']);

export function normalizarMatricula(m: string): string {
    return m.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Todas las matrículas de la flota que aparecen en el texto (no "una matrícula cualquiera": el OCR inventa). */
export function matriculasDeLaFlotaEnTexto(texto: string, flota: VehiculoFlota[]): VehiculoFlota[] {
    const limpio = normalizarMatricula(texto);
    return flota.filter((v) => {
        const m = normalizarMatricula(v.matricula);
        return m.length >= 5 && limpio.includes(m);
    });
}

/** "es del 5678", "el 5678DEF", "5678 def": a qué vehículo de la flota se refiere. Exacto o por las cifras. */
export function vehiculoPorTexto(texto: string, flota: VehiculoFlota[]): VehiculoFlota | null {
    const buscado = normalizarMatricula(texto);
    if (!buscado) return null;
    const exacto = flota.filter((v) => normalizarMatricula(v.matricula) === buscado);
    if (exacto.length === 1) return exacto[0];
    const cifras = buscado.replace(/[^0-9]/g, '');
    if (cifras.length >= 3) {
        const porCifras = flota.filter((v) => normalizarMatricula(v.matricula).includes(cifras));
        if (porCifras.length === 1) return porCifras[0];
    }
    return null;
}

function mesesEntre(a: Date, b: Date): number {
    return (b.getTime() - a.getTime()) / (30.44 * 24 * 3600 * 1000);
}

export interface EntradaLectura {
    estadoDocumento: string;
    estadoOcr: string | null;
    ocrTexto: string | null;
    propuesta: PropuestaDocumento | null;
    vehiculoIdFijado: string | null;
    cambios: CambiosBorrador;
    flota: VehiculoFlota[];
    duplicado: Lectura['duplicado'];
    hoy?: Date;
}

export function construirLectura(e: EntradaLectura): Lectura {
    const hoy = e.hoy ?? new Date();
    const flotaTxt = e.flota.map((v) => v.matricula);
    const base: Lectura = {
        estado: 'LEYENDO', legible: true, es_del_vehiculo: false, tipo: 'DOCUMENTO_VEHICULO_SIN_CLASIFICAR',
        tipo_legible: TIPO_LEGIBLE.DOCUMENTO_VEHICULO_SIN_CLASIFICAR, vehiculo: null, flota: flotaTxt,
        dudosos: [], duplicado: e.duplicado, corregido: [], listo_para_confirmar: false,
    };
    const terminal: Record<string, Lectura['estado']> = { APLICADO: 'ARCHIVADO', PENDIENTE_REVISION: 'EN_REVISION', PENDIENTE_CONFIRMACION: 'EN_LA_APP' };
    if (terminal[e.estadoDocumento]) return { ...base, estado: terminal[e.estadoDocumento] };
    if (e.estadoOcr === 'PENDIENTE' || (!e.propuesta && e.estadoOcr !== 'ERROR' && e.estadoOcr !== 'ILEGIBLE')) return base;

    const p = e.propuesta ?? { tipo: 'DOCUMENTO_VEHICULO_SIN_CLASIFICAR', mantenimientos_detectados: [], faltantes: [] } as PropuestaDocumento;
    const c = e.cambios ?? {};
    const texto = e.ocrTexto ?? '';
    const legible = e.estadoOcr === 'COMPLETADO' && texto.trim().length > 0;
    const dudosos: Dudoso[] = [];
    const corregido: string[] = [];

    if (!legible) {
        dudosos.push({ campo: 'legible', motivo: 'No se ha podido leer la foto (borrosa, cortada o sin texto).', bloquea: true });
        return { ...base, estado: 'LISTO', legible: false, dudosos };
    }

    // ¿Es del taxi? El tipo lo dice; si no, solo vale lo que diga la persona.
    const pareceDelVehiculo = p.tipo !== 'DOCUMENTO_VEHICULO_SIN_CLASIFICAR';
    const esDelVehiculo = pareceDelVehiculo || c.es_del_taxi === true;
    if (!esDelVehiculo) {
        dudosos.push({ campo: 'del_taxi', motivo: 'No parece un documento del taxi.', bloquea: true });
    }

    // Vehículo: elegido > leído en el papel (solo si es de su flota) > único de la flota > preguntar.
    let vehiculo: Lectura['vehiculo'] = null;
    const elegido = c.matricula ? vehiculoPorTexto(c.matricula, e.flota) : null;
    const leidos = matriculasDeLaFlotaEnTexto(texto, e.flota);
    if (elegido) {
        vehiculo = { ...elegido, como: 'elegido' };
    } else if (leidos.length === 1) {
        vehiculo = { ...leidos[0], como: 'leido_en_documento' };
    } else if (e.flota.length === 1) {
        vehiculo = { ...e.flota[0], como: 'unico_vehiculo' };
    } else if (e.vehiculoIdFijado) {
        const v = e.flota.find((x) => x.id === e.vehiculoIdFijado);
        if (v) vehiculo = { ...v, como: 'elegido' };
    }
    if (!vehiculo) {
        dudosos.push({
            campo: 'vehiculo',
            motivo: leidos.length > 1 ? 'Aparecen varias matrículas de tu flota.' : 'El documento no dice de qué vehículo es.',
            bloquea: true,
        });
    }

    // Fecha.
    const fecha = c.fecha ?? p.fecha;
    if (c.fecha && p.fecha && c.fecha !== p.fecha) corregido.push('fecha');
    const fechaDate = parsearFechaEs(fecha);
    if (!fecha || !fechaDate) {
        dudosos.push({ campo: 'fecha', motivo: 'No se ha leído la fecha.', bloquea: true });
    } else if (fechaDate.getTime() > hoy.getTime() + 24 * 3600 * 1000) {
        dudosos.push({ campo: 'fecha', motivo: 'La fecha leída es futura.', bloquea: false });
    } else if (mesesEntre(fechaDate, hoy) > 18) {
        dudosos.push({ campo: 'fecha', motivo: 'La fecha leída es de hace más de año y medio.', bloquea: false });
    }

    // Importe: total etiquetado; se comprueba contra la base imponible si se ha leído.
    const importe = c.importe ?? p.importe;
    if (c.importe !== undefined && p.importe !== undefined && c.importe !== p.importe) corregido.push('importe');
    const baseImponible = extraerBaseImponible(texto);
    if (!TIPOS_SIN_IMPORTE.has(p.tipo)) {
        if (importe === undefined) {
            dudosos.push({ campo: 'importe', motivo: 'No se ha leído el total.', bloquea: true });
        } else if (c.importe === undefined && baseImponible !== undefined && (importe < baseImponible || importe > baseImponible * 1.25)) {
            dudosos.push({ campo: 'importe', motivo: `El total no cuadra con la base imponible (${baseImponible.toFixed(2)} €).`, bloquea: false });
        }
    }

    // Validez (ITV, tarjeta, póliza).
    if (TIPOS_CON_VALIDEZ.has(p.tipo) && !p.valida_hasta) {
        dudosos.push({ campo: 'valida_hasta', motivo: 'No se ha leído hasta cuándo es válido.', bloquea: false });
    }

    const concepto = c.concepto ?? p.concepto;
    if (c.concepto && p.concepto && c.concepto !== p.concepto) corregido.push('concepto');

    return {
        estado: 'LISTO',
        legible: true,
        es_del_vehiculo: esDelVehiculo,
        tipo: p.tipo,
        tipo_legible: TIPO_LEGIBLE[p.tipo] ?? p.tipo,
        fecha,
        importe,
        base_imponible: baseImponible,
        concepto,
        valida_hasta: p.valida_hasta,
        vehiculo,
        flota: flotaTxt,
        dudosos,
        duplicado: e.duplicado,
        corregido,
        listo_para_confirmar: !dudosos.some((d) => d.bloquea),
    };
}

// ─────────────────────────────────────────────────────────
// Operaciones
// ─────────────────────────────────────────────────────────

type Doc = NonNullable<Awaited<ReturnType<typeof prisma.documento.findUnique>>>;

export type FalloBorrador = FalloRemitente | 'borrador_no_encontrado' | 'ya_cerrado' | 'cambio_invalido' | 'no_listo' | 'error_aplicando';

function cambiosDe(doc: Doc): CambiosBorrador {
    const dc = (doc.datos_confirmados ?? {}) as Record<string, unknown>;
    return (dc.cambios ?? {}) as CambiosBorrador;
}

async function duplicadoDe(doc: Doc, clienteId: string, propuesta: PropuestaDocumento | null, cambios: CambiosBorrador): Promise<Lectura['duplicado']> {
    if (doc.hash_sha256) {
        const misma = await prisma.documento.findFirst({
            where: { hash_sha256: doc.hash_sha256, id: { not: doc.id }, NOT: { aplicado_at: null }, vehiculo: { cliente_id: clienteId } },
            select: { id: true },
        });
        if (misma) return { motivo: 'misma_foto' };
    }
    // Un gasto del mismo día con importe parecido: la misma factura apuntada a mano (redondeada) o subida antes.
    // Caso real del 2026-11-19: la ITV leía 49,26 € y ya había un gasto "ITV del vehiculo" de 50 € del mismo día.
    const importe = cambios.importe ?? propuesta?.importe;
    const fechaTxt = cambios.fecha ?? propuesta?.fecha;
    const fecha = parsearFechaEs(fechaTxt);
    if (importe !== undefined && fecha) {
        const delDia = await prisma.gasto.findMany({ where: { cliente_id: clienteId, fecha }, select: { importe: true, descripcion: true } });
        const parecido = delDia.find((g) => importeParecido(importe, Number(g.importe)));
        if (parecido) return { motivo: 'gasto_parecido', fecha: fechaTxt, importe: Number(parecido.importe), descripcion: parecido.descripcion };
    }
    return null;
}

/** Mismo importe con margen de redondeo: 1 € o un 5 %, lo que sea mayor. */
export function importeParecido(a: number, b: number): boolean {
    return Math.abs(a - b) <= Math.max(1, 0.05 * Math.max(a, b));
}

async function cargar(id: string, telefono: string): Promise<{ doc: Doc; quien: Remitente } | FalloBorrador> {
    const quien = await resolverRemitente(telefono);
    if (typeof quien === 'string') return quien;
    const doc = await prisma.documento.findUnique({ where: { id } });
    // Que no sea suyo se contesta igual que si no existiera: no se confirma que exista el borrador de otro.
    if (!doc || doc.subido_por_usuario_id !== quien.usuarioId) return 'borrador_no_encontrado';
    return { doc, quien };
}

export async function lecturaDe(doc: Doc, quien: Remitente): Promise<Lectura> {
    const propuesta = (doc.ocr_datos_extraidos ?? null) as PropuestaDocumento | null;
    const cambios = cambiosDe(doc);
    const leyendo = doc.estado === ESTADO_BORRADOR && doc.estado_ocr === 'PENDIENTE';
    return construirLectura({
        estadoDocumento: doc.estado,
        estadoOcr: doc.estado_ocr,
        ocrTexto: doc.ocr_texto,
        propuesta,
        vehiculoIdFijado: doc.vehiculo_id,
        cambios,
        flota: quien.flota,
        duplicado: leyendo ? null : await duplicadoDe(doc, quien.clienteId, propuesta, cambios),
    });
}

/** Crea el borrador al momento; la lectura (6-27 s) corre detrás. */
export async function crearBorrador(datos: { quien: Remitente; url: string; hashSha256: string }): Promise<{ id: string }> {
    return prisma.documento.create({
        data: {
            tipo: 'DOCUMENTO_VEHICULO_SIN_CLASIFICAR',
            url: datos.url,
            hash_sha256: datos.hashSha256,
            estado: ESTADO_BORRADOR,
            estado_ocr: 'PENDIENTE',
            // Con un solo vehículo se fija ya; con varios, hasta que la persona lo diga o el papel lo traiga.
            vehiculo_id: datos.quien.flota.length === 1 ? datos.quien.flota[0].id : null,
            subido_por_usuario_id: datos.quien.usuarioId,
        },
        select: { id: true },
    });
}

/** Lee la imagen del borrador. Nunca lanza: un fallo deja el borrador como ilegible para pedir otra foto. */
export async function leerBorrador(id: string, rutaLocal: string): Promise<void> {
    try {
        const analisis = await analizarImagen(rutaLocal);
        const ocr = analisis.procesable
            ? await extraerTextoImagen(rutaLocal, CONTEXTO_DOCUMENTO)
            : { texto: '', confianza: 0, legible: false };
        const doc = await prisma.documento.findUnique({ where: { id }, select: { vehiculo: { select: { matricula: true } } } });
        const propuesta = analizarDocumentoVehiculo(ocr.texto, undefined, doc?.vehiculo?.matricula);
        // Por `estado_ocr` y no por estado: si mientras tanto la persona dijo "lo miro en la app", la lectura también tiene que llegar allí.
        await prisma.documento.updateMany({
            where: { id, estado_ocr: 'PENDIENTE' },
            data: {
                tipo: propuesta.tipo,
                estado_ocr: analisis.procesable && ocr.texto ? 'COMPLETADO' : 'ILEGIBLE',
                ocr_texto: ocr.texto || null,
                ocr_confianza: ocr.confianza ?? null,
                ocr_datos_extraidos: propuesta as any,
            },
        });
        console.log(`[BORRADOR-WA] Leído ${id}: ${propuesta.tipo}`);
    } catch (err: any) {
        console.error(`[BORRADOR-WA] Fallo leyendo ${id}:`, err?.message);
        await prisma.documento.updateMany({
            where: { id, estado_ocr: 'PENDIENTE' },
            data: { estado_ocr: 'ERROR', ocr_error: String(err?.message ?? err).slice(0, 500) },
        }).catch(() => undefined);
    }
}

export async function verBorrador(id: string, telefono: string): Promise<Lectura | FalloBorrador> {
    const r = await cargar(id, telefono);
    if (typeof r === 'string') return r;
    return lecturaDe(r.doc, r.quien);
}

/** Valida y guarda lo que la persona corrige. Devuelve la lectura nueva para enseñarla otra vez. */
export async function corregirBorrador(id: string, telefono: string, entrada: Record<string, unknown>): Promise<Lectura | FalloBorrador> {
    const r = await cargar(id, telefono);
    if (typeof r === 'string') return r;
    if (r.doc.estado !== ESTADO_BORRADOR) return 'ya_cerrado';

    const nuevos: CambiosBorrador = {};
    if (entrada.fecha !== undefined) {
        const f = String(entrada.fecha).trim();
        const d = parsearFechaEs(f);
        if (!d) return 'cambio_invalido';
        nuevos.fecha = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    }
    if (entrada.importe !== undefined) {
        const n = typeof entrada.importe === 'number' ? entrada.importe : Number(String(entrada.importe).replace(/\s|€/g, '').replace(',', '.'));
        if (!Number.isFinite(n) || n <= 0 || n > 100000) return 'cambio_invalido';
        nuevos.importe = Math.round(n * 100) / 100;
    }
    if (entrada.concepto !== undefined) {
        const t = String(entrada.concepto).trim().slice(0, 200);
        if (!t) return 'cambio_invalido';
        nuevos.concepto = t;
    }
    if (entrada.matricula !== undefined) {
        const v = vehiculoPorTexto(String(entrada.matricula), r.quien.flota);
        if (!v) return 'cambio_invalido';
        nuevos.matricula = v.matricula;
    }
    if (entrada.es_del_taxi !== undefined) nuevos.es_del_taxi = entrada.es_del_taxi === true;
    if (Object.keys(nuevos).length === 0) return 'cambio_invalido';

    const cambios = { ...cambiosDe(r.doc), ...nuevos };
    const elegido = nuevos.matricula ? r.quien.flota.find((v) => v.matricula === nuevos.matricula) : undefined;
    const doc = await prisma.documento.update({
        where: { id },
        data: {
            datos_confirmados: { cambios } as any,
            ...(elegido ? { vehiculo_id: elegido.id } : {}),
        },
    });
    return lecturaDe(doc, r.quien);
}

export interface ResultadoConfirmar {
    estado: 'ARCHIVADO' | 'EN_REVISION';
    lectura: Lectura;
    mantenimientos_actualizados: string[];
    gasto_id: string | null;
}

/** El "sí" de la persona. Solo archiva si no queda nada que bloquee. */
export async function confirmarBorrador(id: string, telefono: string): Promise<ResultadoConfirmar | FalloBorrador | { fallo: 'no_listo'; lectura: Lectura }> {
    const r = await cargar(id, telefono);
    if (typeof r === 'string') return r;
    if (r.doc.estado !== ESTADO_BORRADOR) return 'ya_cerrado';
    const lectura = await lecturaDe(r.doc, r.quien);
    if (lectura.estado !== 'LISTO' || !lectura.listo_para_confirmar || !lectura.vehiculo) return { fallo: 'no_listo', lectura };

    const propuesta = (r.doc.ocr_datos_extraidos ?? {}) as unknown as PropuestaDocumento;
    const cambios = cambiosDe(r.doc);
    const mantenimientos = cambios.concepto
        ? detectarMantenimientos(cambios.concepto)
        : propuesta.mantenimientos_detectados ?? [];
    const finales: DatosDocumentoConfirmados = {
        fecha: lectura.fecha,
        valida_hasta: lectura.valida_hasta,
        importe: lectura.importe,
        matricula: lectura.vehiculo.matricula,
        km_documento: propuesta.km_documento,
        mantenimientos,
        descripcion: lectura.concepto,
        ...(propuesta.tipo === 'DOCUMENTO_VEHICULO_SIN_CLASIFICAR' ? { tipo_gasto: 'OTRO' } : {}),
    };
    const contradice = lectura.corregido.length > 0;

    // Candado: solo un "sí" pasa del borrador a confirmado.
    const reclamado = await prisma.documento.updateMany({
        where: { id, estado: ESTADO_BORRADOR },
        data: {
            estado: contradice && !r.quien.esPatron ? 'PENDIENTE_REVISION' : 'PENDIENTE_CONFIRMACION',
            vehiculo_id: lectura.vehiculo.id,
            datos_confirmados: finales as any,
            confirmado_por: r.quien.usuarioId,
            confirmado_at: new Date(),
            corregido: contradice,
        },
    });
    if (reclamado.count !== 1) return 'ya_cerrado';

    // Igual que en la app: un asalariado que contradice al papel no aplica; lo revisa el dueño.
    if (contradice && !r.quien.esPatron) {
        return { estado: 'EN_REVISION', lectura: { ...lectura, estado: 'EN_REVISION' }, mantenimientos_actualizados: [], gasto_id: null };
    }
    try {
        const res = await aplicarDocumentoConfirmado(id, finales, r.quien.usuarioId, r.quien.clienteId);
        return { estado: 'ARCHIVADO', lectura: { ...lectura, estado: 'ARCHIVADO' }, ...res };
    } catch (err: any) {
        console.error(`[BORRADOR-WA] Fallo aplicando ${id}:`, err?.message);
        // Se devuelve a borrador para poder reintentar: nada se ha aplicado (transacción).
        await prisma.documento.updateMany({ where: { id, aplicado_at: null }, data: { estado: ESTADO_BORRADOR } }).catch(() => undefined);
        return 'error_aplicando';
    }
}

function borrarFichero(url: string): void {
    const nombre = url.split('?')[0].split('#')[0].split('/').pop() ?? '';
    if (!nombre || nombre.includes('..')) return;
    fs.promises.unlink(path.join(process.cwd(), 'uploads', nombre)).catch(() => undefined);
}

/** "No era para nada": se borra el borrador y su foto. */
export async function descartarBorrador(id: string, telefono: string): Promise<{ ok: true } | FalloBorrador> {
    const r = await cargar(id, telefono);
    if (typeof r === 'string') return r;
    if (r.doc.estado !== ESTADO_BORRADOR) return 'ya_cerrado';
    const borrado = await prisma.documento.deleteMany({ where: { id, estado: ESTADO_BORRADOR } });
    if (borrado.count !== 1) return 'ya_cerrado';
    borrarFichero(r.doc.url);
    return { ok: true };
}

/** "Ya lo miro yo en la app": pasa a Documentos pendiente de confirmar. Necesita saber el vehículo. */
export async function borradorALaApp(id: string, telefono: string): Promise<{ ok: true } | FalloBorrador | { fallo: 'no_listo'; lectura: Lectura }> {
    const r = await cargar(id, telefono);
    if (typeof r === 'string') return r;
    if (r.doc.estado !== ESTADO_BORRADOR) return 'ya_cerrado';
    const lectura = await lecturaDe(r.doc, r.quien);
    if (!lectura.vehiculo) return { fallo: 'no_listo', lectura };
    const movido = await prisma.documento.updateMany({
        where: { id, estado: ESTADO_BORRADOR },
        data: { estado: 'PENDIENTE_CONFIRMACION', vehiculo_id: lectura.vehiculo.id },
    });
    return movido.count === 1 ? { ok: true } : 'ya_cerrado';
}

/** Borradores sin respuesta durante 7 días: se borran con su foto. */
export async function purgarBorradoresWhatsapp(ahora = new Date()): Promise<number> {
    const limite = new Date(ahora.getTime() - DIAS_BORRADOR * 24 * 3600 * 1000);
    const viejos = await prisma.documento.findMany({
        where: { estado: ESTADO_BORRADOR, created_at: { lt: limite } },
        select: { id: true, url: true },
    });
    let n = 0;
    for (const v of viejos) {
        const borrado = await prisma.documento.deleteMany({ where: { id: v.id, estado: ESTADO_BORRADOR } });
        if (borrado.count === 1) { borrarFichero(v.url); n++; }
    }
    return n;
}
