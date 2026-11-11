/**
 * Copia la foto elegida a memoria y la reduce antes de subirla.
 *
 * Por qué: un `File` de un `<input type="file">` es solo una referencia al
 * archivo del móvil. Si el teléfono deja de dar acceso entre que se elige la
 * foto y se envía el parte (el envío llega pasos después), el navegador manda
 * el formulario sin los bytes de la imagen y el backend responde
 * "Unexpected end of form". Pasó con un asalariado el 2026-11-10: 24 intentos,
 * ninguna foto. Leyendo los bytes al elegirla, el envío ya no depende del móvil.
 *
 * De paso la foto sale como JPEG de 2400 px como máximo (lo mismo que hace el
 * backend con Sharp), así que nunca roza el límite de 10 MB del proxy de Next.
 */

const LADO_MAX = 2400;
const CALIDAD_JPEG = 0.85;

const preparadas = new WeakSet<File>();

export class FotoIlegibleError extends Error {
  constructor() {
    super('No se pudo leer la foto. Vuelve a hacerla o elige otra.');
    this.name = 'FotoIlegibleError';
  }
}

export async function prepararFoto(file: File): Promise<File> {
  if (preparadas.has(file)) return file;

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new FotoIlegibleError();
  }
  if (bytes.byteLength === 0) throw new FotoIlegibleError();

  // Copia en memoria: ya no apunta al archivo del móvil.
  const copia = new File([bytes], file.name || 'foto.jpg', { type: file.type || 'image/jpeg' });

  let resultado = copia;
  try {
    const reducida = await reducirAJpeg(copia);
    if (reducida.size < copia.size) resultado = reducida;
  } catch {
    // El navegador no sabe decodificarla (p. ej. HEIC en Android): se sube la
    // copia tal cual y la convierte el backend.
  }

  preparadas.add(resultado);
  return resultado;
}

async function reducirAJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('sin contexto 2d');
    ctx.drawImage(bitmap, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', CALIDAD_JPEG));
    if (!blob || blob.size === 0) throw new Error('toBlob vacío');

    const nombre = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
