/**
 * Entorno de prueba ficticio — dueño y asalariado conectados (2026-08-12).
 *
 * PARA QUÉ. Alberto trabaja solo: no tiene asalariado, así que no puede
 * comprobar el flujo que de verdad importa —el asalariado registra un parte
 * con diferencias, el parte NO cuenta, y el dueño decide si lo acepta o pide
 * que lo rehaga—. Esto crea una empresa ficticia con las dos personas, para
 * poder abrir las dos sesiones a la vez y ver que lo que pasa en una se
 * refleja en la otra.
 *
 * DÓNDE VIVE. En una base de datos APARTE (`pilotos_demo`), en el mismo
 * servidor pero sin ninguna relación con `nexos`. Nada de lo que se toque
 * aquí afecta a los datos reales.
 *
 * Uso (desde backend/):
 *   DATABASE_URL="postgresql://.../pilotos_demo?schema=pilotos" npx ts-node -T scripts/seed-demo.ts
 *
 * Es idempotente: se puede volver a lanzar para dejar el escenario como al
 * principio (borra y recrea los datos de la empresa ficticia).
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

const PASSWORD_DEMO = 'PilotOS2026';
const TEL_DUENO = '+34700000001';
const TEL_ASALARIADO = '+34700000002';
const EMAIL_DUENO = 'dueno.demo@pilotos.test';
const EMAIL_ASALARIADO = 'asalariado.demo@pilotos.test';

/** Fecha a medianoche UTC, que es como se guardan las fechas trabajadas. */
function dia(offsetDias: number): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + offsetDias);
    return d;
}

async function limpiar() {
    // Orden inverso a las dependencias. Solo toca la BD demo.
    // El orden importa y ha costado un error: el seguimiento de mantenimiento
    // y los documentos del vehículo apuntan a filas que se borran después.
    await prisma.notificacionConductor.deleteMany({});
    await prisma.seguimientoMantenimiento.deleteMany({});
    await prisma.gasto.deleteMany({});
    await prisma.anomalia.deleteMany({});
    await prisma.calculoParte.deleteMany({});
    await prisma.documentoEnlace.deleteMany({});
    await prisma.documento.deleteMany({});
    await prisma.parteDiario.deleteMany({});
    await prisma.aviso.deleteMany({});
    await prisma.mantenimientoVehiculo.deleteMany({});
    await prisma.configuracionEconomica.deleteMany({});
    await prisma.vehiculo.deleteMany({});
    await prisma.conductor.deleteMany({});
    await prisma.cliente.deleteMany({});
    await prisma.minosUser.deleteMany({});
}

async function main() {
    console.log('Limpiando el escenario anterior...');
    await limpiar();

    const hash = await hashPassword(PASSWORD_DEMO);

    const dueno = await prisma.minosUser.create({
        data: {
            nombre: 'Manuel Ficticio (dueño)',
            email: EMAIL_DUENO,
            telefono: TEL_DUENO,
            password_hash: hash,
            role: 'user',
            estado_pago: 'AL DIA',
        },
    });

    const asalariado = await prisma.minosUser.create({
        data: {
            nombre: 'Carlos Ficticio (asalariado)',
            email: EMAIL_ASALARIADO,
            telefono: TEL_ASALARIADO,
            password_hash: hash,
            role: 'user',
            estado_pago: 'AL DIA',
        },
    });

    const cliente = await prisma.cliente.create({
        data: {
            patron_id: dueno.id,
            nombre_comercial: 'Taxis Ficticios S.L.',
            tipo_actividad: 'TAXI',
        },
    });

    const condDueno = await prisma.conductor.create({
        data: { cliente_id: cliente.id, usuario_id: dueno.id, es_patron: true },
    });
    const condAsalariado = await prisma.conductor.create({
        data: { cliente_id: cliente.id, usuario_id: asalariado.id, es_patron: false },
    });

    // Reparto 50/50 para el asalariado; el dueño se lleva todo lo suyo.
    await prisma.configuracionEconomica.create({
        data: { cliente_id: cliente.id, conductor_id: condAsalariado.id, modelo_reparto: 'PORCENTAJE', porcentaje_conductor: 50, porcentaje_patron: 50 },
    });
    await prisma.configuracionEconomica.create({
        data: { cliente_id: cliente.id, conductor_id: condDueno.id, modelo_reparto: 'PORCENTAJE', porcentaje_conductor: 100, porcentaje_patron: 0 },
    });

    const vehiculo = await prisma.vehiculo.create({
        data: {
            cliente_id: cliente.id,
            matricula: '0000DMO',
            marca: 'Toyota',
            modelo: 'Prius',
            fecha_matriculacion: new Date('2022-01-15'),
            tipo_combustible: 'HIBRIDO',
            tipo_transmision: 'AUTOMATICO',
            km_actuales: 120340,
        },
    });

    const configAsalariado = await prisma.configuracionEconomica.findFirstOrThrow({ where: { conductor_id: condAsalariado.id } });

    // ── Un mes de trabajo de verdad ───────────────────────────────────────
    // Sin varios días no se puede juzgar el panel del asalariado: las medias
    // por km y por día, y la forma del mes, necesitan un mes.
    // Cifras variadas a propósito (días buenos, días flojos, un día sin
    // repostar) para que las estadísticas digan algo.
    const jornadas = [
        { dias: 14, km: 210, bruto: 168.30, datafono: 61.20, combustible: 24.10 },
        { dias: 13, km: 155, bruto: 121.75, datafono: 30.00, combustible: 18.40 },
        { dias: 12, km: 288, bruto: 231.60, datafono: 118.90, combustible: 31.20 },
        { dias: 11, km: 96,  bruto: 74.50,  datafono: 0,      combustible: 0 },
        { dias: 10, km: 245, bruto: 203.15, datafono: 88.40,  combustible: 27.60 },
        { dias: 9,  km: 176, bruto: 142.80, datafono: 45.10,  combustible: 21.30 },
        { dias: 8,  km: 262, bruto: 218.40, datafono: 96.75,  combustible: 29.90 },
        { dias: 7,  km: 134, bruto: 112.60, datafono: 38.20,  combustible: 16.80 },
        { dias: 6,  km: 301, bruto: 254.90, datafono: 141.30, combustible: 34.50 },
        { dias: 5,  km: 188, bruto: 151.20, datafono: 52.60,  combustible: 22.70 },
    ];

    let kmCursor = 118000;
    for (const j of jornadas) {
        const inicio = kmCursor;
        const fin = kmCursor + j.km;
        kmCursor = fin;
        const parte = await prisma.parteDiario.create({
            data: {
                fecha_trabajada: dia(-j.dias),
                vehiculo_id: vehiculo.id,
                conductor_id: condAsalariado.id,
                km_inicio: inicio,
                km_fin: fin,
                ingreso_bruto: j.bruto,
                ingreso_datafono: j.datafono,
                combustible: j.combustible || null,
                estado: 'ENVIADO',
            },
        });
        const neto = j.bruto - j.combustible;
        await prisma.calculoParte.create({
            data: {
                parte_diario_id: parte.id,
                configuracion_id: configAsalariado.id,
                bruto_diario: j.bruto,
                combustible: j.combustible,
                neto_diario: neto,
                parte_conductor: neto / 2,
                parte_patron: neto / 2,
                modelo_reparto_aplicado: 'PORCENTAJE',
                porcentaje_conductor_aplicado: 50,
                porcentaje_patron_aplicado: 50,
            },
        });
    }

    // ── Parte limpio: cuenta en los globales ──────────────────────────────
    const parteLimpio = await prisma.parteDiario.create({
        data: {
            fecha_trabajada: dia(-2),
            vehiculo_id: vehiculo.id,
            conductor_id: condAsalariado.id,
            km_inicio: 120100,
            km_fin: 120240,
            ingreso_bruto: 186.40,
            ingreso_datafono: 64.20,
            combustible: 22.50,
            estado: 'ENVIADO',
        },
    });
    await prisma.calculoParte.create({
        data: {
            parte_diario_id: parteLimpio.id,
            configuracion_id: configAsalariado.id,
            bruto_diario: 186.40,
            combustible: 22.50,
            neto_diario: 163.90,
            parte_conductor: 81.95,
            parte_patron: 81.95,
            modelo_reparto_aplicado: 'PORCENTAJE',
            porcentaje_conductor_aplicado: 50,
            porcentaje_patron_aplicado: 50,
        },
    });

    // ── Parte RETENIDO: tiene diferencias y NO cuenta ─────────────────────
    // Es el escenario que hay que poder ver sin tener un asalariado real:
    // declaró menos dinero y menos km de los que dice su ticket.
    const parteRetenido = await prisma.parteDiario.create({
        data: {
            fecha_trabajada: dia(-1),
            vehiculo_id: vehiculo.id,
            conductor_id: condAsalariado.id,
            km_inicio: 120240,
            km_fin: 120340,
            ingreso_bruto: 95.00,
            ingreso_datafono: 30.00,
            combustible: 18.00,
            estado: 'PENDIENTE_VALIDACION',
        },
    });
    await prisma.calculoParte.create({
        data: {
            parte_diario_id: parteRetenido.id,
            configuracion_id: configAsalariado.id,
            bruto_diario: 95.00,
            combustible: 18.00,
            neto_diario: 77.00,
            parte_conductor: 38.50,
            parte_patron: 38.50,
            modelo_reparto_aplicado: 'PORCENTAJE',
            porcentaje_conductor_aplicado: 50,
            porcentaje_patron_aplicado: 50,
        },
    });

    // Ticket del taxímetro con las discrepancias ya calculadas, en el mismo
    // formato que deja el OCR real (así la pantalla de detalle las pinta igual).
    const ticket = await prisma.documento.create({
        data: {
            tipo: 'TICKET_TAXIMETRO',
            url: '/uploads/demo-ticket-taximetro.jpg',
            estado: 'VALIDO',
            estado_ocr: 'COMPLETADO',
            ocr_confianza: 82,
            vehiculo_id: vehiculo.id,
            ocr_texto: 'TICKET DE DEMOSTRACION\nP Total: 148,60\nP Dist. Total: 143,2\nBorrados: 812',
            ocr_datos_extraidos: {
                fecha: `${String(dia(-1).getUTCDate()).padStart(2, '0')}/${String(dia(-1).getUTCMonth() + 1).padStart(2, '0')}/${dia(-1).getUTCFullYear()}`,
                parc_total: 148.60,
                parc_dist_total: 143.2,
                acum_borrados: 812,
                valido: true,
                errores: [],
                discrepancias: [
                    {
                        campo: 'total',
                        severidad: 'NORMAL',
                        declarado: 95,
                        detectado: 148.6,
                        diff: 53.6,
                        mensaje: 'El total del parte (95.00 €) no coincide con el P Total del ticket (148.60 €). Diferencia: 53.60 €.',
                    },
                    {
                        campo: 'km',
                        severidad: 'NORMAL',
                        declarado: 100,
                        detectado: 143.2,
                        diff: 43.2,
                        mensaje: 'Los km del parte (100 km) no coinciden con la P Dist.Total del ticket (143.2 km). Diferencia: 43.2 km.',
                    },
                ],
            },
        },
    });
    await prisma.documentoEnlace.create({
        data: { documento_id: ticket.id, entidad_tipo: 'PARTE_DIARIO', entidad_id: parteRetenido.id },
    });

    for (const mensaje of [
        'El total del parte (95.00 €) no coincide con el P Total del ticket (148.60 €). Diferencia: 53.60 €.',
        'Los km del parte (100 km) no coinciden con la P Dist.Total del ticket (143.2 km). Diferencia: 43.2 km.',
    ]) {
        await prisma.anomalia.create({
            data: {
                conductor_id: condAsalariado.id,
                tipo: 'NORMAL',
                descripcion: mensaje,
                parte_diario_id: parteRetenido.id,
                documento_id: ticket.id,
            },
        });
    }

    console.log(`
Escenario listo — empresa ficticia "Taxis Ficticios S.L." (vehículo 0000DMO)

  DUEÑO       teléfono ${TEL_DUENO}   contraseña ${PASSWORD_DEMO}
  ASALARIADO  teléfono ${TEL_ASALARIADO}   contraseña ${PASSWORD_DEMO}

  · ${jornadas.length + 1} partes limpios repartidos por el mes (para que el panel del asalariado tenga qué enseñar)
  · Parte del ${dia(-1).toISOString().slice(0, 10)} — RETENIDO, 95,00 € declarados frente a
    148,60 € del ticket y 100 km frente a 143,2 km (NO cuenta hasta que el dueño decida)
`);

    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error('ERROR:', e);
    await prisma.$disconnect();
    process.exit(1);
});
