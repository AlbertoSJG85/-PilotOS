/**
 * Candado entre réplicas para tareas programadas.
 *
 * POR QUÉ NO `pg_try_advisory_lock`. Es el patrón que usa RentOS y el que
 * cualquiera copiaría primero, pero sobre Prisma es incorrecto: Prisma reparte
 * las consultas por un pool de conexiones, así que el candado se pide en una
 * conexión y se intenta soltar en otra. El candado se queda puesto hasta que
 * esa conexión se recicle, y el resultado es PEOR que no tener candado: la
 * tarea deja de ejecutarse en TODAS las réplicas, en silencio, y solo se nota
 * al ver que los avisos de mantenimiento no llegan.
 *
 * QUÉ SE HACE EN SU LUGAR. Una lease en tabla. La clave primaria sobre `job`
 * es lo que hace atómica la reclamación: dos réplicas pidiendo el mismo trabajo
 * chocan en el índice y solo una gana. Y `held_until` hace que el candado
 * **caduque solo** si el proceso muere teniéndolo: no hace falta un barrendero
 * que limpie candados, que sería otra cosa más que puede atascarse.
 */
import type { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

/** Quién sostiene el candado. Sirve para diagnosticar, no para decidir. */
const IDENTIDAD = `${process.env.HOSTNAME || 'local'}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;

export interface ResultadoCandado {
  ejecutado: boolean;
  motivo?: string;
}

/**
 * Ejecuta `trabajo` solo si esta réplica consigue el candado de `job`.
 *
 * `ttlSegundos` debe ser MAYOR que lo que la tarea puede tardar en el peor
 * caso. Si fuera menor, el candado caducaría mientras la tarea sigue
 * trabajando, otra réplica entraría y tendríamos justo la duplicación que esto
 * viene a evitar — una protección que falla como si no estuviera.
 */
export async function conCandado(
  prisma: PrismaClient,
  job: string,
  ttlSegundos: number,
  trabajo: () => Promise<void>,
): Promise<ResultadoCandado> {
  let obtenido = false;

  try {
    // Un solo enunciado, atómico. Si la fila no existe se crea; si existe y su
    // lease ya venció, se toma. Si existe y sigue vigente, el WHERE del DO
    // UPDATE es falso y no devuelve nada: otra réplica lo tiene.
    const filas = await prisma.$queryRaw<Array<{ job: string }>>`
      INSERT INTO pilotos."JobLease" (job, held_until, holder, updated_at)
      VALUES (${job}, now() + make_interval(secs => ${ttlSegundos}::double precision), ${IDENTIDAD}, now())
      ON CONFLICT (job) DO UPDATE
        SET held_until = now() + make_interval(secs => ${ttlSegundos}::double precision),
            holder     = ${IDENTIDAD},
            updated_at = now()
        WHERE "JobLease".held_until < now()
      RETURNING job
    `;
    obtenido = filas.length === 1;
  } catch (err: any) {
    // Si el candado no se puede consultar, NO se ejecuta la tarea. Ejecutarla
    // "por si acaso" es exactamente la duplicación que se quiere evitar.
    console.error(`[candado] No se pudo reclamar "${job}": ${err.message}. La tarea NO se ejecuta.`);
    return { ejecutado: false, motivo: 'error_al_reclamar' };
  }

  if (!obtenido) {
    console.log(`[candado] "${job}" lo tiene otra réplica. Esta pasada se salta.`);
    return { ejecutado: false, motivo: 'lo_tiene_otra_replica' };
  }

  try {
    await trabajo();
    return { ejecutado: true };
  } finally {
    // Se suelta explícitamente para que un reintento no tenga que esperar al
    // TTL. Si esto falla —o el proceso muere antes—, el lease caduca solo: por
    // eso soltar es una mejora, no un requisito.
    try {
      await prisma.$executeRaw`
        UPDATE pilotos."JobLease"
           SET held_until = now(), updated_at = now()
         WHERE job = ${job} AND holder = ${IDENTIDAD}
      `;
    } catch (err: any) {
      console.warn(`[candado] No se pudo soltar "${job}": ${err.message}. Caducará solo.`);
    }
  }
}

export { IDENTIDAD as IDENTIDAD_CANDADO };
