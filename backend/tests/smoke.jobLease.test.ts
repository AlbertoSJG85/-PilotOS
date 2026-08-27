/**
 * Fase 5 — Candado entre réplicas para las tareas programadas.
 *
 * QUÉ ESTABA MAL. Las dos tareas de `scheduler.service` corrían sin candado.
 * Con una sola réplica no se nota; con dos, ambas avisarían de los mismos
 * mantenimientos —avisos duplicados a los patrones— y ambas purgarían los
 * mismos borradores, borrando partes diarios a la vez. El momento de
 * descubrirlo no puede ser el día en que se escale.
 *
 * POR QUÉ NO SE ARREGLÓ CON `pg_try_advisory_lock`. Es el patrón de RentOS y
 * el que cualquiera copiaría, pero sobre Prisma es incorrecto: el pool reparte
 * las consultas, el candado se pide en una conexión y se suelta en otra, y se
 * queda puesto. Eso es peor que no tener candado, porque la tarea deja de
 * ejecutarse en TODAS las réplicas y en silencio.
 *
 * Aquí se prueba el contrato con un Prisma falso que imita lo que hace
 * PostgreSQL con el `ON CONFLICT ... WHERE held_until < now()`: devuelve fila
 * si el candado estaba libre, y nada si lo tiene otro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { conCandado } from '../src/services/job-lease.service';

/** Prisma falso que simula la tabla de leases en memoria. */
function prismaFalso(opciones: { ocupadoHasta?: Date; falla?: boolean } = {}) {
  const estado: { held_until: Date | null } = { held_until: opciones.ocupadoHasta ?? null };
  const consultas: string[] = [];

  const prisma = {
    $queryRaw: vi.fn(async (trozos: TemplateStringsArray) => {
      consultas.push(trozos.join('?'));
      if (opciones.falla) throw new Error('conexión caída');
      const libre = estado.held_until === null || estado.held_until < new Date();
      if (!libre) return [];
      estado.held_until = new Date(Date.now() + 60_000);
      return [{ job: 'x' }];
    }),
    $executeRaw: vi.fn(async (trozos: TemplateStringsArray) => {
      consultas.push(trozos.join('?'));
      estado.held_until = new Date();
      return 1;
    }),
  } as never;

  return { prisma, consultas, estado };
}

describe('Fase 5 — candado entre réplicas de las tareas programadas', () => {
  let trabajo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    trabajo = vi.fn(async () => {});
  });

  it('con el candado libre, la tarea se ejecuta', async () => {
    const { prisma } = prismaFalso();

    const r = await conCandado(prisma, 'mantenimientos', 1800, trabajo);

    expect(r.ejecutado).toBe(true);
    expect(trabajo).toHaveBeenCalledTimes(1);
  });

  it('si lo tiene otra réplica, la tarea NO se ejecuta', async () => {
    // Este es el caso que evita los avisos duplicados a los patrones.
    const { prisma } = prismaFalso({ ocupadoHasta: new Date(Date.now() + 60_000) });

    const r = await conCandado(prisma, 'mantenimientos', 1800, trabajo);

    expect(r.ejecutado).toBe(false);
    expect(r.motivo).toBe('lo_tiene_otra_replica');
    expect(trabajo).not.toHaveBeenCalled();
  });

  it('si el lease ya venció, otra réplica puede tomarlo', async () => {
    // Un proceso que muere con el candado cogido no puede bloquear la tarea
    // para siempre. Es la diferencia entre un lease y un candado olvidado, y
    // es exactamente el fallo que se encontró en NexOS Meta.
    const { prisma } = prismaFalso({ ocupadoHasta: new Date(Date.now() - 1000) });

    const r = await conCandado(prisma, 'purga-borradores', 1800, trabajo);

    expect(r.ejecutado).toBe(true);
    expect(trabajo).toHaveBeenCalledTimes(1);
  });

  it('si no se puede consultar el candado, la tarea NO se ejecuta', async () => {
    // Ejecutar "por si acaso" cuando no se sabe si otra réplica lo tiene es
    // precisamente la duplicación que esto viene a evitar. Ante la duda, no.
    const { prisma } = prismaFalso({ falla: true });

    const r = await conCandado(prisma, 'mantenimientos', 1800, trabajo);

    expect(r.ejecutado).toBe(false);
    expect(r.motivo).toBe('error_al_reclamar');
    expect(trabajo).not.toHaveBeenCalled();
  });

  it('el candado se suelta aunque la tarea reviente', async () => {
    // Si un fallo dejara el candado puesto, la tarea no volvería a ejecutarse
    // hasta que venciera el TTL: un error puntual se convertiría en 30 minutos
    // de parada.
    const { prisma } = prismaFalso();
    const revienta = vi.fn(async () => { throw new Error('boom'); });

    await expect(conCandado(prisma, 'mantenimientos', 1800, revienta)).rejects.toThrow('boom');
    expect((prisma as any).$executeRaw).toHaveBeenCalled();
  });

  it('NO usa pg_advisory_lock — el patrón incorrecto sobre Prisma', async () => {
    // Control de regresión: si alguien "simplifica" esto copiando el patrón de
    // RentOS, la tarea dejaría de ejecutarse en todas las réplicas en silencio.
    const { prisma, consultas } = prismaFalso();

    await conCandado(prisma, 'mantenimientos', 1800, trabajo);

    expect(consultas.join(' ')).not.toMatch(/advisory_lock/i);
    expect(consultas.join(' ')).toMatch(/JobLease/);
    expect(consultas.join(' ')).toMatch(/held_until < now\(\)/);
  });
});
