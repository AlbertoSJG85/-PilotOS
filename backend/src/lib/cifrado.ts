/**
 * Cifrado de secretos en base de datos (2026-08-12).
 *
 * Se usa para los tokens de Google Drive: quien lea la tabla no puede sacar
 * el permiso de acceso al Drive de un cliente.
 *
 * POR QUÉ NO SE COPIA EL DE RENTOS. RentOS cifra sus tokens de Gmail con
 * `aes-256-ctr` (server.js:364). CTR mantiene el secreto pero NO detecta que
 * alguien haya modificado el texto cifrado: un byte cambiado en la base de
 * datos se descifra como basura, en silencio, y el fallo aparece luego en
 * forma de "Google rechaza el token" sin que nadie sepa por qué. GCM añade
 * una etiqueta de autenticación: si el dato se ha tocado, el descifrado falla
 * en el acto y con un error claro. Mismo coste, más información.
 *
 * La clave viene de DRIVE_ENCRYPTION_KEY (32 bytes en hexadecimal). Sin ella
 * no se cifra ni se descifra nada: se lanza. Es deliberado — guardar un token
 * de Google en claro por no tener una variable puesta sería peor que fallar.
 */
import crypto from 'crypto';

const ALGORITMO = 'aes-256-gcm';

function obtenerClave(): Buffer {
    const hex = process.env.DRIVE_ENCRYPTION_KEY;
    if (!hex) {
        throw new Error('DRIVE_ENCRYPTION_KEY no configurada: no se puede cifrar el token de Drive');
    }
    const clave = Buffer.from(hex, 'hex');
    if (clave.length !== 32) {
        throw new Error(`DRIVE_ENCRYPTION_KEY debe tener 32 bytes en hexadecimal (64 caracteres); tiene ${clave.length}`);
    }
    return clave;
}

/** Devuelve "iv:etiqueta:cifrado", todo en hexadecimal. */
export function cifrar(texto: string): string {
    const iv = crypto.randomBytes(12); // 96 bits, el tamaño recomendado para GCM
    const cipher = crypto.createCipheriv(ALGORITMO, obtenerClave(), iv);
    const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    const etiqueta = cipher.getAuthTag();
    return [iv.toString('hex'), etiqueta.toString('hex'), cifrado.toString('hex')].join(':');
}

/** Lanza si el dato ha sido manipulado o la clave no es la que lo cifró. */
export function descifrar(guardado: string): string {
    const partes = guardado.split(':');
    if (partes.length !== 3) throw new Error('Formato de secreto cifrado inválido');
    const [ivHex, etiquetaHex, cifradoHex] = partes;
    const decipher = crypto.createDecipheriv(ALGORITMO, obtenerClave(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(etiquetaHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(cifradoHex, 'hex')), decipher.final()]).toString('utf8');
}

/** true si hay clave configurada. Sirve para apagar la función sin romper nada. */
export function hayClaveDeCifrado(): boolean {
    try {
        obtenerClave();
        return true;
    } catch {
        return false;
    }
}
