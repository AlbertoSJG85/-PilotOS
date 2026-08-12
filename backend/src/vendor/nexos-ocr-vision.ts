/**
 * ⚠️  COPIA DE UN MÓDULO COMPARTIDO — NO EDITAR AQUÍ.
 *
 * El original vive en `NexOS/core/ocr-vision` (paquete `@nexos/ocr-vision`),
 * con sus propios tests. Cualquier cambio se hace allí y se vuelve a copiar.
 *
 * POR QUÉ HAY UNA COPIA. PilotOS se despliega en Coolify construyendo su
 * propio repositorio dentro de un Docker: en ese contexto no existe la carpeta
 * `NexOS/core`, y todavía no hay un registro npm privado del ecosistema desde
 * el que instalarlo. Copiarlo es lo que hace que funcione hoy sin montar
 * infraestructura nueva.
 *
 * ES DEUDA, Y ESTÁ DECLARADA. La regla de NexOS dice que esto debe vivir en la
 * capa compartida, y vive: el original es el de NexOS/core. Lo que falta es la
 * forma de consumirlo (registro privado o dependencia de git). Mientras tanto,
 * el segundo producto que necesite leer papeles debe partir del original, no
 * de esta copia.
 *
 * Copiado el 2026-08-13 desde @nexos/ocr-vision v0.1.0.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Leer un papel con un modelo de visión (2026-08-13).
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────
 * Durante meses PilotOS leyó los tickets del taxímetro con Tesseract, un OCR
 * clásico. Tesseract reconoce formas: compara manchas de tinta con plantillas
 * de letras. No sabe qué está mirando. Por eso leía "2938" donde el papel
 * ponía "298", una y otra vez, y cada arreglo tapaba el siguiente:
 *
 *   C-043, C-054, C-055  ajustes del parser contra el texto ya roto
 *   C-056                una lectura mala acusó a un conductor
 *   C-060                el problema no era el parser, era la resolución
 *   C-064                una factura A4 necesitó una tubería entera aparte
 *
 * Cinco correcciones para el mismo síntoma. La conclusión, que llegó tarde:
 * el problema no se arregla afinando el OCR, se arregla cambiándolo. Un
 * modelo de visión entiende lo que ve — sabe que "Borrados" lleva detrás un
 * contador que sube de uno en uno, y que un 2938 después de un 297 de ayer
 * es imposible.
 *
 * ── POR QUÉ ESTÁ EN LA CAPA COMPARTIDA ───────────────────────────────────
 * Leer papeles no es un problema de PilotOS. RentOS lee facturas, ClinicOS
 * documentos de pacientes, IngresOS facturas de autónomos. Esto vive aquí
 * para que el sexto producto no vuelva a escribir su propio lector y repita
 * los cinco errores de arriba desde cero.
 *
 * ── LO QUE NO HACE, Y ES DELIBERADO ──────────────────────────────────────
 * NO interpreta el documento ni decide nada: devuelve una TRANSCRIPCIÓN fiel.
 * Cada producto sigue aplicando sus propias reglas al texto — las de PilotOS
 * llevan meses de correcciones encima y no se tiran a la basura por cambiar
 * de OCR. Y sobre todo: quien decide sigue siendo una persona.
 *
 * ── NUNCA ROMPE AL QUE LLAMA ─────────────────────────────────────────────
 * Sin clave, sin red, con el proveedor caído o con una respuesta rara:
 * devuelve `null`. El producto sigue con el OCR que tuviera antes. Un fallo
 * del lector no puede impedir que un ticket entre en el sistema.
 */

export interface Transcripcion {
    /** El texto del documento, tal cual se lee en el papel. */
    texto: string;
    /**
     * Si el modelo dice haberlo leído con seguridad. NO es un porcentaje
     * calculado: es lo que el propio modelo declara. Un `false` significa
     * "esto hay que mirarlo a mano", no "no hay texto".
     */
    legible: boolean;
    /** Trozos concretos que el modelo no ha visto claros. Vacío si ninguno. */
    dudas: string[];
    /** Qué modelo lo leyó. Para poder rastrear una lectura mala hasta su origen. */
    modelo: string;
}

export interface OpcionesLector {
    apiKey: string;
    /** Por defecto el mismo modelo que usa el resto del ecosistema (LucIA). */
    modelo?: string;
    /** Inyectable para los tests: aquí nunca se llama a la red de verdad. */
    fetchImpl?: typeof fetch;
    /** Corte duro. Un lector lento no puede colgar una petición del producto. */
    timeoutMs?: number;
}

const MODELO_POR_DEFECTO = 'gpt-4.1-mini';
const TIMEOUT_POR_DEFECTO_MS = 30_000;

/**
 * Las instrucciones importan tanto como el modelo.
 *
 * Cada línea de aquí abajo está puesta contra un fallo real y documentado:
 *
 * - "transcribe, no interpretes"  → el lector no puede empezar a deducir
 *   importes; eso lo hace el producto, con sus reglas y su historial.
 * - "los números, dígito a dígito" → C-056 y C-060: el 297 que se leyó 2937.
 * - "no rellenes lo que no veas"  → un campo vacío se lo preguntamos a la
 *   persona; un campo inventado se le cuela en la contabilidad (C-064).
 * - "di lo que no ves claro"      → una duda declarada vale más que una
 *   lectura segura y equivocada. Es toda la lección de este módulo.
 */
const INSTRUCCIONES = [
    'Eres un transcriptor de documentos. Transcribe EXACTAMENTE lo que se ve en la imagen.',
    '',
    'Reglas:',
    '1. Transcribe, no interpretes. No resumas, no ordenes, no corrijas lo que pone el papel.',
    '2. Los números son lo más importante: cópialos dígito a dígito, con sus separadores tal y como aparecen. Si una cifra tiene un dígito que no ves con seguridad, NO la adivines: ponla en "dudas".',
    '3. No rellenes lo que no veas. Un campo ilegible se deja fuera; no se inventa.',
    '4. Conserva las etiquetas junto a sus valores y respeta los saltos de línea del documento.',
    '5. En "dudas" enumera cada trozo concreto que no hayas leído con seguridad. Si lo has leído todo con claridad, deja la lista vacía.',
    '6. "legible" es false si el documento está tan mal que quien lo reciba debería mirarlo a mano.',
].join('\n');

/** El esquema de la respuesta. Sin esto habría que parsear prosa, que es justo el problema que venimos a resolver. */
const ESQUEMA = {
    type: 'object',
    properties: {
        texto: { type: 'string', description: 'La transcripción literal del documento.' },
        legible: { type: 'boolean', description: 'true si se ha leído con seguridad.' },
        dudas: {
            type: 'array',
            items: { type: 'string' },
            description: 'Trozos concretos que no se han leído con seguridad.',
        },
    },
    required: ['texto', 'legible', 'dudas'],
    additionalProperties: false,
} as const;

/**
 * Saca el texto de la respuesta del proveedor.
 *
 * POR QUÉ NO ES UNA LÍNEA. `output_text` es un atajo que ponen los SDK
 * oficiales, no un campo de la API. Llamando por HTTP —que es como llama todo
 * el ecosistema, igual que LucIA— lo que llega es `output[].content[].text`.
 *
 * Esto se escribió mal la primera vez y los tests no lo vieron, porque los
 * tests simulaban la respuesta que yo creía en vez de la que devuelve el
 * proveedor. Lo cazó una llamada real. Se aceptan las dos formas: si algún
 * día se pasa al SDK, sigue funcionando.
 */
function extraerTextoDeRespuesta(cuerpo: unknown): string | null {
    const c = cuerpo as {
        output_text?: string;
        output?: { content?: { type?: string; text?: string }[] }[];
    };

    if (typeof c?.output_text === 'string' && c.output_text.trim() !== '') return c.output_text;

    for (const bloque of c?.output ?? []) {
        for (const parte of bloque?.content ?? []) {
            if (typeof parte?.text === 'string' && parte.text.trim() !== '') return parte.text;
        }
    }
    return null;
}

/**
 * Transcribe una imagen. Nunca lanza: devuelve `null` si no ha podido.
 *
 * @param imagenBase64 la imagen ya codificada, sin el prefijo `data:`
 * @param mimeType     `image/jpeg`, `image/png`...
 * @param contexto     una línea sobre qué papel es. Ayuda al modelo a saber
 *                     qué esperar ("ticket de taxímetro", "factura de taller").
 */
export async function transcribirImagen(
    imagenBase64: string,
    mimeType: string,
    contexto: string,
    opciones: OpcionesLector,
): Promise<Transcripcion | null> {
    if (!opciones.apiKey) return null;
    if (!imagenBase64) return null;

    const modelo = opciones.modelo ?? MODELO_POR_DEFECTO;
    const hacerFetch = opciones.fetchImpl ?? fetch;
    const timeoutMs = opciones.timeoutMs ?? TIMEOUT_POR_DEFECTO_MS;

    const corte = new AbortController();
    const temporizador = setTimeout(() => corte.abort(), timeoutMs);

    try {
        const respuesta = await hacerFetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${opciones.apiKey}`,
                'Content-Type': 'application/json',
            },
            signal: corte.signal,
            body: JSON.stringify({
                model: modelo,
                instructions: INSTRUCCIONES,
                input: [
                    {
                        role: 'user',
                        content: [
                            { type: 'input_text', text: `Documento: ${contexto}. Transcríbelo.` },
                            { type: 'input_image', image_url: `data:${mimeType};base64,${imagenBase64}` },
                        ],
                    },
                ],
                text: {
                    format: {
                        type: 'json_schema',
                        name: 'transcripcion',
                        schema: ESQUEMA,
                        strict: true,
                    },
                },
            }),
        });

        if (!respuesta.ok) {
            const detalle = await respuesta.text().catch(() => '');
            console.warn(`[OCR-VISION] ${respuesta.status}: ${detalle.slice(0, 300)}`);
            return null;
        }

        const crudo = extraerTextoDeRespuesta(await respuesta.json());
        if (!crudo) {
            console.warn('[OCR-VISION] Respuesta sin texto reconocible');
            return null;
        }

        const datos = JSON.parse(crudo) as { texto?: string; legible?: boolean; dudas?: string[] };
        if (typeof datos.texto !== 'string' || datos.texto.trim() === '') return null;

        return {
            texto: datos.texto,
            legible: datos.legible !== false,
            dudas: Array.isArray(datos.dudas) ? datos.dudas : [],
            modelo,
        };
    } catch (err: any) {
        // Incluye el abort del timeout. Nunca se propaga: el producto sigue
        // con su lector de siempre.
        console.warn('[OCR-VISION] No se pudo transcribir:', err?.message ?? err);
        return null;
    } finally {
        clearTimeout(temporizador);
    }
}

/** ¿Está el lector configurado? Para que el producto sepa si puede contar con él. */
export function lectorDisponible(apiKey?: string): boolean {
    return typeof apiKey === 'string' && apiKey.trim().length > 0;
}
