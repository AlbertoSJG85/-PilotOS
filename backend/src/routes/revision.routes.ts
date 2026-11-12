/**
 * Bandeja de revisiones del patrón (2026-11-12).
 *
 * Hasta hoy una foto en PENDIENTE_REVISION no generaba aviso, ni tarea, ni
 * nada en el panel: solo se veía si el dueño abría ese parte y se fijaba en
 * la etiqueta amarilla. Caso real: el ticket de gasoil de Ruyman (8145KJJ,
 * 10-nov) estuvo dos días sin que la dueña se enterase.
 *
 * Regla: todo lo que espera una decisión del patrón aparece en el Dashboard y
 * se puede VERIFICAR o NO VERIFICAR. Nada se cierra solo ni desaparece sin
 * que alguien lo decida.
 *
 *   GET  /api/revisiones                    fotos en revisión + avisos sin ver
 *   POST /api/revisiones/fotos/:id          { resultado: VERIFICADA | NO_VERIFICADA }
 *   POST /api/revisiones/avisos/:id/visto   marca el aviso como visto
 *
 * Los avisos de tipo ANOMALIA no se listan aquí: ya tienen su propio panel y
 * su propio "marcar revisada" (anomalia.routes.ts).
 */
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePatron, requireClienteContext, isSameTenant, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth, requirePatron, requireClienteContext);

router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const clienteId = req.usuario!.cliente_id!;

        const enlaces = await prisma.documentoEnlace.findMany({
            where: {
                entidad_tipo: 'PARTE_DIARIO',
                documento: { estado: 'PENDIENTE_REVISION' },
                parteDiario: { vehiculo: { cliente_id: clienteId } },
            },
            include: {
                documento: true,
                parteDiario: {
                    select: {
                        id: true,
                        fecha_trabajada: true,
                        vehiculo: { select: { matricula: true } },
                        conductor: { select: { usuario: { select: { nombre: true } } } },
                    },
                },
            },
            orderBy: { created_at: 'desc' },
            take: 50,
        });

        const fotos = enlaces.map((e) => ({
            id: e.documento.id,
            tipo: e.documento.tipo,
            url: e.documento.url,
            created_at: e.documento.created_at,
            parte_id: e.parteDiario.id,
            fecha_trabajada: e.parteDiario.fecha_trabajada,
            matricula: e.parteDiario.vehiculo?.matricula ?? null,
            conductor: e.parteDiario.conductor?.usuario?.nombre ?? null,
        }));

        const avisos = await prisma.aviso.findMany({
            where: { cliente_id: clienteId, leido: false, NOT: { tipo: 'ANOMALIA' } },
            orderBy: { created_at: 'desc' },
            take: 50,
            select: {
                id: true, tipo: true, titulo: true, mensaje: true, entidad_tipo: true,
                entidad_id: true, created_at: true, enviado: true, error_envio: true,
            },
        });

        res.json({ status: 'OK', data: { fotos, avisos } });
    } catch (err: any) {
        console.error('[REVISIONES] Error al listar:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

router.post('/fotos/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { resultado } = req.body as { resultado?: string };
        if (resultado !== 'VERIFICADA' && resultado !== 'NO_VERIFICADA') {
            res.status(400).json({ status: 'FAIL', error: 'resultado_invalido' });
            return;
        }

        const doc = await prisma.documento.findUnique({
            where: { id: req.params.id },
            include: { enlaces: { include: { parteDiario: { include: { vehiculo: { select: { cliente_id: true } } } } } } },
        });
        const enlace = doc?.enlaces.find((e) => e.entidad_tipo === 'PARTE_DIARIO');
        if (!doc || !enlace || !isSameTenant(req, enlace.parteDiario.vehiculo.cliente_id)) {
            res.status(404).json({ status: 'FAIL', error: 'not_found' });
            return;
        }
        if (doc.estado !== 'PENDIENTE_REVISION') {
            res.status(409).json({ status: 'FAIL', error: 'invalid_state', estado_actual: doc.estado });
            return;
        }

        const verificada = resultado === 'VERIFICADA';
        const ahora = new Date();
        await prisma.$transaction(async (tx) => {
            await tx.documento.update({
                where: { id: doc.id },
                data: {
                    // No verificada = la foto no vale: pasa a ILEGIBLE y el
                    // asalariado recibe la tarea de sustituirla, como con
                    // cualquier foto inservible.
                    estado: verificada ? 'VALIDO' : 'ILEGIBLE',
                    revisado_por: req.usuario!.id,
                    revisado_at: ahora,
                },
            });
            if (!verificada) {
                await tx.tareaPendiente.create({
                    data: {
                        tipo: 'FOTO_ILEGIBLE',
                        entidad_tipo: 'DOCUMENTO',
                        entidad_id: doc.id,
                        conductor_id: enlace.parteDiario.conductor_id,
                    },
                });
            }
        });

        res.json({ status: 'OK', estado: verificada ? 'VALIDO' : 'ILEGIBLE' });
    } catch (err: any) {
        console.error('[REVISIONES] Error al verificar foto:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

router.post('/avisos/:id/visto', async (req: AuthRequest, res: Response) => {
    try {
        // El where lleva el cliente de la sesión: marcar un aviso ajeno no
        // revela nada, simplemente no afecta a ninguna fila.
        const r = await prisma.aviso.updateMany({
            where: { id: req.params.id, cliente_id: req.usuario!.cliente_id!, leido: false },
            data: { leido: true },
        });
        res.json({ status: 'OK', marcados: r.count });
    } catch (err: any) {
        console.error('[REVISIONES] Error al marcar aviso:', err.message);
        res.status(500).json({ status: 'FAIL', error: 'server_error' });
    }
});

export default router;
