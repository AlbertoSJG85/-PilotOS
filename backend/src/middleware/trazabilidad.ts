/**
 * Trazabilidad: identificador de petición y registro en JSON.
 *
 * Mismo contrato que `lib/trazabilidad.js` de RentOS, para que el identificador
 * sobreviva al salto entre servicios. Si cada producto usara una cabecera o un
 * formato distinto, la cadena se rompería justo donde hace falta seguirla.
 *
* Mismo contrato en todos los productos: si cada uno usara una cabecera o un
 * petición suya se abre en llamadas a RentOS, a Pay, a PilotOS y a OpenAI.
 * Sin un identificador común, un fallo deja cinco logs inconexos y ninguna
 * forma de afirmar que hablan de lo mismo.
 *
 * OJO CON EL NOMBRE. `requestId` ya existía en este repositorio, pero es otra
 * cosa: el identificador que **OpenAI** devuelve en sus respuestas
 * (`openai.client.ts`). Aquí se trata del identificador de la petición
 * **entrante**. Son dos conceptos distintos y conviene no confundirlos.
 */
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export const CABECERA = 'x-request-id';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      idPeticion?: string;
    }
  }
}

export function nuevoId(): string {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Rutas que no se registran: el orquestador sonda las de salud cada pocos
 * segundos y llenar el log de ruido esconde lo que importa.
 */
export function esRuido(ruta: string): boolean {
  return ruta === '/health'
      || ruta === '/ready'
      || /\.(css|js|png|jpg|jpeg|svg|ico|woff2?|map)$/i.test(ruta);
}

interface Opciones {
  servicio?: string;
  escribir?: (linea: string) => void;
}

export function trazabilidad(opciones: Opciones = {}) {
  const escribir = opciones.escribir ?? ((l: string) => console.log(l));
  const servicio = opciones.servicio ?? 'pilotos';

  return function (req: Request, res: Response, next: NextFunction): void {
    const entrante = req.headers[CABECERA];
    const id = (typeof entrante === 'string' && entrante.trim() && entrante.length <= 200)
      ? entrante.trim()
      : nuevoId();

    req.idPeticion = id;
    res.setHeader(CABECERA, id);

    if (esRuido(req.path)) { next(); return; }

    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
      escribir(JSON.stringify({
        ts: new Date().toISOString(),
        nivel: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'aviso' : 'info',
        servicio,
        request_id: id,
        metodo: req.method,
        ruta: req.route ? req.baseUrl + req.route.path : req.path,
        status: res.statusCode,
        ms: Math.round(ms),
      }));
    });

    next();
  };
}

/**
 * Cabeceras para una llamada saliente. Sin esto la cadena se corta en cuanto
 * GlorIA llama a otro producto, que es justo el salto que se quiere seguir.
 */
export function cabecerasSalientes(
  req: Pick<Request, 'idPeticion'> | undefined,
  extra: Record<string, string> = {},
): Record<string, string> {
  const id = req?.idPeticion;
  return id ? { ...extra, [CABECERA]: id } : { ...extra };
}
