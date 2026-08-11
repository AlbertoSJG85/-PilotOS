# Plan de acción PilotOS — verificación de la auditoría y hoja de ruta de corrección

## Context

Alberto aportó una auditoría de PilotOS fechada el 10 de agosto de 2026, con 31 hallazgos, y pidió **verificarla sin dar nada por válido** y después producir un documento de acción ejecutable por un modelo inferior.

He verificado los 31 puntos contra el código real de `PilotOS` (HEAD `07aa562` + working tree), `GlorIA` (rama `fix/rentos-recordatorios-salida-whatsapp`) y `RentOS/nexos-api`.

**Resultado de la verificación: 29 de 31 puntos CONFIRMADOS, 1 FALSO, 1 con matiz importante.** La auditoría es sólida y honesta. Además he encontrado **4 fallos que la auditoría no vio**, dos de ellos serios.

El objetivo de este documento es que otro modelo pueda ejecutar las correcciones sin volver a investigar: cada tarea lleva archivo, línea, qué está mal, qué hacer y cómo verificarlo.

### Decisiones de Alberto que enmarcan el plan

1. **Alcance:** se puede tocar PilotOS + GlorIA + RentOS.
2. **Asalariados:** solo ven **lo suyo** — sus partes y su liquidación. Nada de gastos del cliente, otros conductores ni P&L global.
3. **n8n:** el rumbo es **migrar los flujos de n8n al backend**, con el patrón **sombra** que ya funciona en RentOS (correr en paralelo, registrar lo que *haría*, no aplicar nada, revisar cada semana, promover solo con OK explícito).
4. **Entrega de esta sesión:** solo el documento. No se toca código todavía.
5. **Rama de GlorIA para la fase A (2026-08-11):** nueva rama partiendo de `gloria-v6` (no de `fix/rentos-recordatorios-salida-whatsapp`, para no arrastrar lo que haya sin cerrar ahí). Merge a `gloria-v6` cuando esté probado. Ver tarea 0.3.
6. **Seguridad Social y exceso de efectivo (2026-08-11), decidido — ver Fase F1.5/F1.6:** ya no son puntos abiertos, tienen regla de negocio cerrada.

---

## Parte 1 — Resultado de la verificación

### 1.1 El único punto FALSO

**Punto 5 — «El endpoint saliente de GlorIA no valida el token interno».** Es incorrecto. El router **sí** valida:

```ts
// GlorIA/src/routes/outbound.routes.ts:15,19
import { requireInternalToken } from '../middleware/requireInternalToken';
const router = Router();
router.use(requireInternalToken);          // ← aplica a todo el router
```

`GlorIA/src/middleware/requireInternalToken.ts` compara `x-internal-token` contra `INTERNAL_API_TOKEN`, devuelve 401 si no cuadra y **falla cerrado con 503** si la variable no está configurada. Montado en `GlorIA/src/index.ts:56`.

**Acción: ninguna. Retirar el punto 5 de la auditoría.** No hay que "proteger" nada aquí.

### 1.2 El punto con matiz importante

**Punto 4 — «Las plantillas de mantenimiento no existen en el catálogo de GlorIA».** Confirmado, pero el archivo que la auditoría señala es **código muerto**:

- `GlorIA/src/config/templates.ts` no contiene `mantenimiento_proximo` ni `mantenimiento_vencido` — cierto. Pero **nadie importa ese archivo**. `grep getTemplate|META_TEMPLATES` sobre `src/` solo devuelve las definiciones y un comentario.
- El catálogo que **de verdad decide** si un mensaje sale es el mapa `TEMPLATES` dentro del nodo Code "Build Meta Payload" del worker n8n `GlorIA/n8n-workflows/v6/wf-notificaciones-worker-v6.json`.
- En ese worker, las dos plantillas **existen pero solo como cambio sin commitear** (`git show HEAD:...| grep -c mantenimiento_proximo` → `0`). En HEAD el worker lanza `throw new Error('Tipo de notificación desconocido')`.

Es decir: hay trabajo hecho y sin guardar. Y sigue sin poder confirmarse desde los repos si Meta aprobó las plantillas ni si ese JSON está desplegado en el n8n vivo.

### 1.3 Los 29 puntos confirmados

Todos verificados con archivo y línea. Los más graves, con la evidencia:

**Cadena de avisos (P0 1-3) — confirmados y se agravan entre sí.**

```ts
// PilotOS/backend/src/services/mantenimientoAlertas.service.ts:208-220
const reserva = await prisma.mantenimientoVehiculo.updateMany({ ... 
  data: { estado: nuevoEstado,
          ...(avisarKm ? { ultimo_nivel_aviso_km: nivelKm } : {}),
          ...(avisarDias ? { ultimo_nivel_aviso_dias: nivelDias } : {}) } });
// ... 45 líneas después:
const envio = await enviarAvisoGloria(...);            // :260
await prisma.aviso.update({ where: { id: aviso.id },   // :266
  data: envio.ok ? { enviado: true, enviado_at: new Date() }
                 : { error_envio: envio.error?.slice(0, 500) } });
```

El nivel se quema antes de enviar y **no se revierte nunca**. `Aviso.intentos` está fijado a `1` (línea 255) y jamás se incrementa. No existe ningún job que relea `Aviso where enviado = false`. `esMasUrgente()` devolverá `false` en la siguiente pasada.

Peor de lo que dice la auditoría: `notificacion.service.ts:37-39` devuelve `ok:false` cuando `GLORIA_API_URL`/`GLORIA_INTERNAL_TOKEN` no están configurados — **un despliegue sin esas variables quema en silencio todos los escalones de todos los mantenimientos**, sin enviar nada.

**Punto 2 confirmado:** `notificacion.service.ts:60-65` nunca lee el cuerpo de la respuesta; `res.ok` es el único criterio.

**Punto 3 confirmado:** el payload no lleva `dedupe_key` ni `mant.id`:
```ts
// notificacion.service.ts:51-56
body: JSON.stringify({ phone: telefono, tipo, template_params, origin: 'pilotos' }),
```
GlorIA cae al fallback `` `${tipo}:${phone}:${día}` `` (`NotificationQueue.ts:50-53`). Dos mantenimientos distintos el mismo día → el segundo se descarta.

**Tokens internos (P0 6) — confirmado, y la asimetría es exacta.** `internal-token.middleware.ts` solo comprueba rutas (`RUTAS_HERMES`, `RUTAS_LUCIA`) y **nunca ata un cliente a `req`**. La escritura sí fija `HERMES_CLIENTE_ID` (`internal.routes.ts:236-245`), pero `/resumen?userId=` (L99) resuelve el cliente de *cualquier* userId. Enumerar enteros vuelca vehículos, ingresos, km y mantenimientos de todos los clientes.

**Asalariados (P0 7) — confirmado en las cuatro sub-afirmaciones.** `requirePatron` se aplica a **todas** las escrituras y a **ninguna** lectura. `dashboard.routes.ts:11` solo tiene `requireAuth`: el P&L completo del cliente es legible por cualquier asalariado.

El resto (9-31) confirmados igual, con la única salvedad del punto 3 de economía (*exceso de efectivo*): lo que existe es un `efectivoEstimado = max(0, bruto - datafono)` en `resumen.service.ts:136-138`, ni persistido ni conciliado. El concepto de *exceso* no existe.

### 1.4 Hallazgos NUEVOS que la auditoría no recoge

**N1 (grave) — El contrato de respuesta de GlorIA está mal tipado y miente.**
RentOS devuelve `{status:'enqueued', id}` o `{status:'duplicate', dedupe_key}` (`RentOS/nexos-api/server.js:7586,7589`). GlorIA lo tipa como `'PENDIENTE' | 'DEDUPED'` (`rentos.client.ts:108-112`) y lo **pasa tal cual sin traducir** (`enqueueNotificacion` es un `post` directo). Así que la respuesta documentada de `/api/gloria/enviar` nunca ocurre, y en el caso `duplicate` **no viene `id`**. Cualquier consumidor que crea la documentación se rompe. Hay que arreglarlo *antes* de que PilotOS empiece a leer esa respuesta (tarea A2).

**N2 (grave) — Desajuste de tipo en `template_params`.**
PilotOS envía un **objeto** `{matricula, mantenimiento, motivo}`; GlorIA lo tipa como `string[]`. Pasa sin error porque nadie lo valida, pero el worker n8n espera un array. El fix está en el diff sin commitear del worker (acepta objeto y mapea por `tpl.params`). Si se commitea el worker sin esto, o se envía array sin actualizar el worker, no sale nada.

**N3 (medio) — Latencia real 60× la documentada.**
`NotificationQueue.ts:6` promete «en los próximos 30 segundos». El worker corre con `scheduleTrigger` `minutesInterval: 30`. Un aviso de mantenimiento puede tardar **media hora**. Hay que corregir el comentario y decidir la cadencia.

**N4 (medio) — `requireAuth` se ha vuelto puenteable.**
El working tree añadió en `auth.middleware.ts:57` un `if (req.usuario) { next(); return; }` para hacerlo idempotente tras montar `app.use('/api', requireAuth, requireNexosPayAccess())` en `index.ts:165`. Correcto hoy, pero cualquier middleware futuro que rellene `req.usuario` salta la verificación del JWT. Necesita un comentario de advertencia y un test.

**N5 (grave, hallazgo del 2026-08-11 a petición de Alberto) — El acumulado de km y de € del taxímetro se extrae pero nunca se compara.**
`ocr.service.ts:192-193,292-300` extrae `acum_total` (€ acumulado histórico del taxímetro) y `acum_dist_total` (km acumulado histórico) de cada ticket. `ocrComparacion.service.ts` los guarda en `ocr_datos_extraidos` y **nunca los usa**: la única comparación ticket-contra-ticket que existe hoy es la de `acum_borrados` (`compararBorrados`, L276-318). Nadie compara si el salto de km/€ acumulado entre un ticket y el anterior del mismo vehículo coincide con lo declarado en los partes de ese periodo. El caso que describe Alberto — el coche circula ~100 km con el taxímetro apagado — no dispara ninguna alerta hoy: ese control no existe, solo el de borrados.

Relacionado: al crear un parte nuevo, `km_inicio` (`parteDiario.routes.ts:82-100`) **nunca se valida contra `vehiculo.km_actuales`**. El único control de continuidad que existe (`actualizarKmSiAvanza`, arreglado en la auditoría de julio) impide que el km oficial retroceda al *cerrar* un parte, pero no exige que el km_inicio de hoy coincida con el km_fin de ayer. Un conductor puede declarar directamente un km_inicio que ya absorbe el salto, sin dejar rastro.

**N6 (crítico, hallazgo del 2026-08-11 con un ticket real, CERRADO ese mismo día) — El separador de secciones del OCR no reconocía el formato real, y el control CRÍTICO de "borrados" probablemente nunca se había ejecutado.**
Alberto aportó una foto de un ticket real de su taxímetro. Al hacer correr `validarTicketTaximetro` contra el texto de ese ticket, **8 de los 10 campos del turno se leyeron mal** — el parser cogía el valor del acumulado histórico en vez del turno de hoy — y **ningún campo `acum_*` se extrajo, incluido `acum_borrados`**, el único control marcado CRÍTICO de todo el sistema (pensado para detectar manipulación del taxímetro).

Causa raíz, en `ocr.service.ts`: `extractarSeccionTaximetro` buscaba palabras clave de cabecera ("ACUMULADO", "PARCIAL", "TURNO"...) que este modelo de ticket no usa — marca cada campo del turno con un prefijo `P ` suelto y nada más. Al no encontrar ninguna palabra clave, el código trataba **todo** el ticket como si fuera "parcial" y el bloque acumulado quedaba vacío. Además, ocho de los diez campos del turno no exigían el prefijo "P" en su expresión regular, así que cogían la primera aparición del dato en todo el texto — que siempre era la del acumulado. Y la heurística "si el número es mayor de 2000, es en metros, divide por 1000" (pensada para valores diarios) corrompía cualquier acumulado real (183.108 km de vida útil pasaban a leerse como 183,1 km).

**Arreglado el mismo día** (no era una tarea para el modelo ejecutor, se cerró en la sesión de verificación porque bloqueaba directamente el control antifraude ya "activo"):
- `ocr.service.ts`: `extractarSeccionTaximetro` ahora separa por línea usando el prefijo real `P ` como señal primaria, con el método de palabras clave como reserva para otros modelos de taxímetro.
- `extractNumDistance` ya no aplica la conversión metros→km a los campos `acum_*` (parámetro `permitirConversionMetros`).
- `carreras`/`P Carreras` pasó de `extractNum` (entero, truncaba decimales) a `extractNumCurrency` — es un importe, no un contador.
- Los campos de tiempo (`acum_tiempo_ocupado/on`, `parc_tiempo_ocupado/on`) llevan ahora `\b` delante de la `t`: sin ese límite de palabra, la "t" final de "Dist." + ". " + "Ocupado" se leía como si fuera "Tiempo Ocupado".
- `serv\w*` sustituye a `servicios?` para cubrir la abreviatura real "servs".
- Test de regresión permanente: `backend/tests/smoke.ocrTaximetro.test.ts` (6 casos), con el texto literal del ticket real como fixture, más un caso de compatibilidad con el formato antiguo por cabecera. **79/79 tests en verde, build limpio.**

**Consecuencia para la tarea B5** (comparar acumulados entre tickets): ya no está bloqueada — la extracción de `acum_dist_total`, `acum_total` y `acum_borrados` ahora funciona con el ticket real. B5 puede construirse sobre esta base.

**Además, anti-patrón a evitar (visto en RentOS):** `bienvenida_precheckin` se encola como `PENDIENTE_SHADOW` y el worker solo lee `PENDIENTE` → **10 notificaciones muertas** acumuladas, hallazgo aún abierto en la auditoría pre-adquisición de RentOS. Una sombra sin endpoint de revisión y sin fecha de decisión se pudre. Aplica a la fase E de este plan.

### 1.5 Estado del working tree — leer antes de tocar nada

`PilotOS` tiene **trabajo sin commitear** (integración NexOS Pay: entitlements, gates Pro, sincronización de asalariados, `billing-access.middleware.ts`, `billing-sync.service.ts`, `smoke.nexosPay.test.ts`, doc de learning del 2026-08-11). `GlorIA` tiene sin commitear el worker n8n con las plantillas de mantenimiento.

**Primera acción del ejecutor: no empezar encima de esto.** Ver tarea 0.

---

## Parte 2 — Hoja de ruta

Siete fases. **Orden obligatorio: A → B → C.** Las demás pueden reordenarse.

| Fase | Qué | Puntos | Riesgo |
|---|---|---|---|
| **0** | Preparación: consolidar el working tree | — | bajo |
| **A** | Cadena de avisos: reintentos, dedupe, plantillas | 1,2,3,4 + N1,N2,N3 | medio (3 repos) |
| **B** | Seguridad: tokens, asalariados, cross-tenant, antifraude taxímetro | 6,7,8,15,16 + N5 | medio |
| **C** | Verificación de producción | 5(retirado),8 | solo lectura |
| **D** | Mantenimientos: datos correctos | 9,10,11,12 | bajo |
| **E** | Sombra n8n → backend | rumbo | bajo (no aplica nada) |
| **F** | Economía | 17,18,19,20,21 | alto (dinero) |
| **G** | Documentos, sesión, ops | 13,22,23,24,25,26,27,28,29,30,31 + N4 | bajo |

### Reglas para el modelo ejecutor

1. **Una fase, una rama, un PR.** `fix/pilotos-<fase>-<fecha>`. Nunca commits directos a `main`.
2. **Batería completa de regresión antes de cada push:** `cd backend && npm run build && npm test`. Los 73 tests deben pasar. Si tocas GlorIA o RentOS, corre también sus tests.
3. **Migraciones:** `prisma/migrations/` solo tiene `0_baseline`. Toda migración nueva se crea con `npx prisma migrate dev --name <nombre>`. **Nunca `prisma db push` contra producción**, nunca editar migraciones a mano.
4. **Documentar en `docs/learning/`** con el formato obligatorio: Fecha / Área / Problema / Causa / Solución / Prevención. Añadir entrada en `docs/correcciones.md`.
5. **Parar y preguntar** solo ante: decisión de negocio real, credencial que no tienes, riesgo sobre datos productivos, operación destructiva.
6. **No inventar.** Si un endpoint o campo que este plan menciona no existe donde dice, dilo y para. El plan se escribió contra el código del 11-08-2026.

---

## FASE 0 — Preparación

- [ ] **0.1** En `PilotOS`: `git status`. Hay 8 archivos modificados + 4 sin trackear, todo de la integración NexOS Pay del 2026-08-11. **Verificar que compila y pasa (`npm run build && npm test`, esperado 73/73) y commitearlo como su propio commit** antes de abrir ninguna rama de este plan. Mensaje sugerido: `feat(billing): acceso por entitlements y sincronizacion de asalariados con NexOS Pay`.
- [ ] **0.2** En `GlorIA`: `git status`. El worker `wf-notificaciones-worker-v6.json` tiene sin commitear las plantillas de mantenimiento y el soporte de `template_params` como objeto. **No commitear todavía** — forma parte de la tarea A5, que hay que hacer entera y a la vez.
- [ ] **0.3** GlorIA: crear rama nueva **desde `gloria-v6`** (no desde `fix/rentos-recordatorios-salida-whatsapp`) para todo el trabajo de la fase A — p.ej. `fix/pilotos-avisos-mantenimiento-2026-08`. PilotOS trabaja en `main`. Confirmado por Alberto el 2026-08-11.
- [ ] **0.4** Anotar el SHA de partida de los tres repos en el doc de learning de esta intervención.

---

## FASE A — La cadena de avisos (P0 1,2,3,4 + N1,N2,N3)

**Por qué:** hoy un fallo puntual de red pierde un escalón de aviso *para siempre*, y PilotOS registra `enviado=true` sin que el mensaje haya salido. Es el riesgo número uno: el sistema miente sobre algo que Alberto usa para decidir.

### A1 — Que un fallo de envío no queme el escalón · `PilotOS`

**Archivo:** `backend/src/services/mantenimientoAlertas.service.ts`

El problema es el orden. Hoy: reservar nivel (L208) → crear Aviso (L245) → enviar (L260) → registrar resultado (L266). Si el envío falla, el nivel ya está quemado.

**No cambies el orden de la reserva optimista** — protege contra dos réplicas del backend y esa protección es correcta. Lo que falta es **revertir la reserva cuando el envío falla**.

Tras el `prisma.aviso.update` de la línea 266, añadir:

```ts
if (!envio.ok) {
    // El escalón no se ha comunicado: devolvemos el nivel a como estaba para
    // que la pasada de mañana vuelva a intentarlo. Sin esto, un fallo puntual
    // de red pierde el aviso de este escalón para siempre.
    await prisma.mantenimientoVehiculo.updateMany({
        where: {
            id: mant.id,
            // Solo revertimos si nadie lo ha tocado desde nuestra reserva.
            ...(avisarKm ? { ultimo_nivel_aviso_km: nivelKm } : {}),
            ...(avisarDias ? { ultimo_nivel_aviso_dias: nivelDias } : {}),
        },
        data: {
            ...(avisarKm ? { ultimo_nivel_aviso_km: mant.ultimo_nivel_aviso_km } : {}),
            ...(avisarDias ? { ultimo_nivel_aviso_dias: mant.ultimo_nivel_aviso_dias } : {}),
        },
    });
}
```

`estado` **no** se revierte: si el mantenimiento está vencido, lo está, y eso es un hecho independiente de si el aviso salió.

- [ ] **A1.1** Implementar la reversión anterior.
- [ ] **A1.2** Salir antes si no hay configuración. Al principio de `procesarMantenimientos`, si `!process.env.GLORIA_API_URL || !process.env.GLORIA_INTERNAL_TOKEN`, registrar un `console.error` bien visible y **devolver el resultado vacío sin recorrer nada**. Hoy un despliegue sin variables recorre toda la flota quemando escalones.
- [ ] **A1.3** Incrementar `intentos` de verdad. En vez del `intentos: 1` fijo de la línea 255, buscar si ya existe un `Aviso` no enviado para ese `entidad_id` + escalón y sumar. Requiere migración: índice sobre `Aviso(entidad_id, enviado)`.
- [ ] **A1.4** Tests en `backend/tests/smoke.mantenimientoAlertas.test.ts` (ya tiene 23 casos, seguir su estilo):
  - envío falla → `ultimo_nivel_aviso_km` queda como estaba → segunda pasada vuelve a intentar;
  - envío OK → nivel avanza → segunda pasada no reenvía;
  - sin variables de entorno → cero mantenimientos evaluados, cero escalones tocados.

### A2 — Arreglar el contrato de respuesta de GlorIA (N1) · `GlorIA`

**Hacer esto ANTES que A3**, porque A3 depende de que la respuesta sea fiable.

**Archivo:** `src/integrations/rentos.client.ts` (~L192) y `src/services/NotificationQueue.ts`

RentOS devuelve `{status:'enqueued'|'duplicate'}`; el tipo dice `'PENDIENTE'|'DEDUPED'`; nadie traduce. En `duplicate` además **no viene `id`**.

- [ ] **A2.1** En `enqueueNotificacion`, traducir explícitamente:
  ```ts
  const raw = await this.post<{status: string; id?: string; dedupe_key?: string}>(
      '/internal/notificaciones/enviar', payload);
  if (raw.status === 'enqueued') return { id: raw.id!, status: 'PENDIENTE' };
  if (raw.status === 'duplicate') return { id: '', status: 'DEDUPED', message: raw.dedupe_key };
  throw new Error(`Respuesta inesperada de RentOS: ${raw.status}`);
  ```
- [ ] **A2.2** En `outbound.routes.ts`, devolver también la `dedupe_key` usada, para que el llamante pueda conciliar: `res.json({ status: result.status, id: result.id, dedupe_key: key })`.
- [ ] **A2.3** Corregir el comentario de `NotificationQueue.ts:6`: no son 30 segundos, es el intervalo del worker (hoy 30 minutos). (N3)

### A3 — Dedupe correcta y lectura real de la respuesta (P0 2,3) · `PilotOS`

**Archivo:** `backend/src/services/notificacion.service.ts`

- [ ] **A3.1** Cambiar la firma para aceptar `dedupe_key` y `entidad_id`:
  ```ts
  export async function enviarAvisoGloria(
      telefono: string, tipo: string,
      template_params: Record<string, unknown>,
      opts: { dedupe_key: string },
  ): Promise<EnvioResultado>
  ```
  e incluir `dedupe_key` en el body.
- [ ] **A3.2** En `mantenimientoAlertas.service.ts`, construir la clave con el **id del mantenimiento y el escalón**, que es lo que la hace única:
  ```ts
  const nivelEfectivo = avisarKm ? `km${nivelKm}` : `d${nivelDias}`;
  const dedupeKey = `pilotos:mant:${mant.id}:${nivelEfectivo}`;
  ```
  Sin fecha: si el escalón no llegó a enviarse, mañana debe reintentarse con la misma clave, y la idempotencia de RentOS es justo lo que queremos.
- [ ] **A3.3** Leer el cuerpo de la respuesta y **no llamar éxito a un descarte**:
  ```ts
  const cuerpo = await res.json().catch(() => ({} as any));
  if (cuerpo.status === 'DEDUPED') {
      return { ok: false, error: 'DEDUPED: GlorIA descarto el mensaje por duplicado', estado: 'DEDUPED' };
  }
  return { ok: true, estado: 'PENDIENTE', notificacion_id: cuerpo.id };
  ```
  Ampliar `EnvioResultado` con `estado?: string` y `notificacion_id?: string`.
- [ ] **A3.4** Migración Prisma: añadir a `Aviso` los campos `notificacion_id String?`, `estado_remoto String?`, `dedupe_key String?`, `delivery_status String?`, `conciliado_at DateTime?`. Guardarlos en el `aviso.update` de la línea 266.
- [ ] **A3.5** Corregir `template_params` a lo que el worker espera (N2). **Decidir una sola forma y aplicarla en los dos lados a la vez** — la recomendada es mantener el objeto en PilotOS y que el worker lo mapee (es el cambio ya escrito y sin commitear en A5), porque un objeto con nombres es menos frágil que un array posicional. Documentarlo.

### A4 — Cerrar el bucle de entrega (P0 2) · `RentOS` + `GlorIA` + `PilotOS`

Hoy `enviado=true` significa «RentOS aceptó una fila en la cola». La entrega real la conoce RentOS en `core."Notificaciones".delivery_status`, alimentado por `POST /internal/notificaciones/estado-meta`. Nada devuelve ese dato a PilotOS.

Ya existe `GET /internal/notificaciones/entregas?horas=72` (`server.js:7862`), pero es agregado y de vigilancia, no sirve para conciliar por id.

- [ ] **A4.1** `RentOS/nexos-api/server.js` — añadir junto a los otros endpoints de notificaciones (~L7855), con `requireInternalToken`:
  ```
  GET /internal/notificaciones/estado?ids=uuid1,uuid2,...
  → { items: [{ id, status, delivery_status, sent_at, failed_at, failure_code, failure_detail }] }
  ```
  Limitar a 100 ids. Consulta simple con `WHERE id = ANY($1::uuid[])`.
- [ ] **A4.2** `GlorIA/src/routes/outbound.routes.ts` — exponer `GET /api/gloria/estado?ids=...` que hace de proxy al anterior vía `rentosClient`. Va dentro del router, así que ya queda protegido por `requireInternalToken`. Así PilotOS solo habla con GlorIA y no necesita credenciales de RentOS.
- [ ] **A4.3** `PilotOS/backend/src/services/scheduler.service.ts` — nuevo cron de conciliación, cada hora, zona `Atlantic/Canary` (respetar `TIMEZONE` que ya está definido). Lee `Aviso` con `notificacion_id != null AND conciliado_at IS NULL AND created_at > now() - 7 días`, consulta a GlorIA por lotes de 100, y actualiza `delivery_status` + `conciliado_at`.
- [ ] **A4.4** **Y aquí está el valor real:** si un aviso vuelve como `failed`, **revertir el escalón** igual que en A1.2, para que el motor lo reintente. Ese es el cierre del bucle que la auditoría pide.
- [ ] **A4.5** Endpoint de revisión para Alberto: `GET /internal/avisos/entregas?dias=7` en `internal.routes.ts`, mismo formato que el de RentOS (`{ventana_dias, total, por_estado, problemas, items}`). Añadirlo a `RUTAS_LUCIA` para poder preguntárselo a LucIA.

### A5 — Plantillas de mantenimiento (P0 4) · `GlorIA` + Meta

- [ ] **A5.1** Revisar el diff sin commitear de `n8n-workflows/v6/wf-notificaciones-worker-v6.json`: añade `mantenimiento_proximo` y `mantenimiento_vencido` al mapa `TEMPLATES` y soporte de `template_params` como objeto. Verificar que es coherente con lo decidido en A3.5 y **commitearlo**.
- [ ] **A5.2** El JSON tiene **dos copias del workflow dentro del mismo archivo** (los hits estaban en línea 84 y 462). Comprobar que las dos quedan iguales, o el comportamiento dependerá de cuál se importe.
- [ ] **A5.3** Añadir también las dos plantillas a `src/config/templates.ts` **y documentar en el propio archivo que es código muerto** (nadie lo importa), o borrarlo. Ahora mismo es una trampa: parece el catálogo y no lo es. Decidir y dejarlo escrito.
- [ ] **A5.4** **Bloqueante externo, no lo puede cerrar el modelo:** confirmar con Alberto que las plantillas `mantenimiento_proximo` y `mantenimiento_vencido` están **creadas y aprobadas en Meta Business**, en español, con los tres parámetros `matricula`, `mantenimiento`, `motivo` en ese orden. Sin esto la cadena no funciona por mucho código que se arregle.
- [ ] **A5.5** Confirmar que el JSON commiteado **está importado en el n8n vivo**. El archivo del repo no es el workflow en ejecución.

### A6 — Cadencia del worker (N3)

- [ ] **A6.1** El worker corre cada 30 min. Para un aviso de mantenimiento es aceptable; para otras notificaciones puede no serlo. **Preguntar a Alberto** si se baja a 5 min, y si no, documentar la latencia real en `notificacion.service.ts` y en el master de PilotOS, para que nadie prometa inmediatez.

**Verificación de la fase A (end-to-end, en preproducción o con un cliente de prueba):**
1. `npm run build && npm test` en los tres repos.
2. Crear un vehículo con un mantenimiento a punto de cruzar un escalón.
3. Con `GLORIA_API_URL` **mal puesta a propósito**: forzar el cron, comprobar que el `Aviso` queda con `error_envio` y que `ultimo_nivel_aviso_km` **no** avanzó.
4. Arreglar la variable, forzar el cron: `Aviso` con `notificacion_id` y `estado_remoto='PENDIENTE'`.
5. Esperar al worker → llega el WhatsApp.
6. Forzar el cron de conciliación → `delivery_status='delivered'` y `conciliado_at` relleno.
7. Dos mantenimientos distintos del mismo vehículo el mismo día → **llegan los dos** (era el punto 3).

---

## FASE B — Seguridad y permisos (P0 6,7 · P1 8,15,16)

### B1 — Acotar por cliente los tokens de Hermes y LucIA (P0 6)

**Archivos:** `backend/src/middleware/internal-token.middleware.ts`, `backend/src/routes/internal.routes.ts`

El middleware restringe rutas pero **nunca ata un cliente a `req`**. La escritura sí lo hace; las lecturas no.

- [ ] **B1.1** En el middleware, cuando `internalScope` sea `hermes` o `lucia`, poner también `req.internalClienteId = process.env.HERMES_CLIENTE_ID` (usar la misma variable; si LucIA debe ver otro cliente, **preguntar a Alberto** — es decisión de negocio). Si el scope es acotado y la variable no está, **responder 500 y no continuar**, igual que ya hace `/registrar-gasto` en `internal.routes.ts:236-238`. Fallar cerrado.
- [ ] **B1.2** `GET /internal/resumen` (L99): tras resolver el `cliente`, si `req.internalClienteId` está definido y `cliente.id !== req.internalClienteId` → **404** (no 403: un 403 confirma que el id existe).
- [ ] **B1.3** `GET /internal/mantenimientos` (L338): el working tree ya resuelve el dueño del vehículo para comprobar su plan. Aprovechar esa consulta y comprobar **también** que el cliente es el autorizado. Devolver **404 en ambos casos** (inexistente y ajeno) para no crear un oráculo.
- [ ] **B1.4** Revisar `GET /internal/usuario-por-telefono` (L20): hoy solo lo puede usar el scope `total`, pero devuelve cualquier usuario por teléfono. Confirmar que `total` solo lo tiene GlorIA y dejarlo documentado en el propio archivo.
- [ ] **B1.5** Tests en `backend/tests/smoke.hermesToken.test.ts` (ya existe, 5 casos): token hermes + userId de otro cliente → 404; + userId propio → 200; sin `HERMES_CLIENTE_ID` → 500.

### B2 — El asalariado solo ve lo suyo (P0 7)

**Decisión de Alberto: solo sus partes y su liquidación.** Nada de gastos del cliente, otros conductores ni P&L global.

`requireClienteContext` (`auth.middleware.ts:143`) aísla por *tenant*, no por *rol*. Falta el filtro por fila.

- [ ] **B2.1** Crear en `auth.middleware.ts` un helper reutilizable junto a `requirePatron`:
  ```ts
  /** Si no es patrón, fuerza el filtro a su propio conductor_id. Devuelve el
   *  conductor_id al que hay que restringir, o null si puede verlo todo. */
  export function alcanceConductor(req: AuthRequest): string | null {
      return req.usuario?.es_patron ? null : (req.usuario?.conductor_id ?? '__ninguno__');
  }
  ```
  El `'__ninguno__'` es deliberado: un asalariado sin conductor asociado no ve nada, en vez de verlo todo.
- [ ] **B2.2** `parteDiario.routes.ts:424` (`GET /`): aplicar `const forzado = alcanceConductor(req); if (forzado) where.conductor_id = forzado;` **después** de leer el filtro opcional del query, para que no se pueda sobrescribir.
- [ ] **B2.3** `parteDiario.routes.ts:470` (`GET /:id`): además del check de tenant de L489, si `alcanceConductor(req)` no es null y `parte.conductor_id` no coincide → 404.
- [ ] **B2.4** `gasto.routes.ts`: añadir `requirePatron` a `GET /` (L42), `GET /resumen` (L66) y `GET /fijos` (L82). **Y también a `POST /` (L8)**, que hoy permite a un asalariado crear gastos del cliente — la auditoría no lo menciona y es un agujero real.
- [ ] **B2.5** `usuario.routes.ts`: `requirePatron` en `GET /` (L11). En `GET /:id` (L31), permitir que un asalariado se consulte **a sí mismo** y nada más.
- [ ] **B2.6** `dashboard.routes.ts:17` (`GET /resumen`): es el P&L del cliente. Añadir `requirePatron`. **Comprobar antes qué consume el frontend del conductor** (`app/src/app/conductor/`): si usa este endpoint, hay que darle una variante con su propia liquidación, no dejarlo sin datos. No romper la pantalla del conductor.
- [ ] **B2.7** `app/src/middleware.ts:66`: extender el bloque de rutas de patrón a `/partes`, `/gastos`, `/flota`, `/cierres`. Dejar el comentario de que **esto es solo UX** — `esPatron` sale de `parseJwtPayload`, un decode base64 sin verificar; el control real es el backend.
- [ ] **B2.8** Ampliar `backend/tests/smoke.rbac.test.ts` (4 casos hoy): asalariado listando partes solo ve los suyos; detalle de parte ajeno → 404; gastos → 403; dashboard → 403.

### B3 — Cross-tenant al crear conductor (P1 8)

- [ ] **B3.1** `usuario.routes.ts:109-113`: antes del `vehiculoConductor.create`, comprobar que el vehículo es del cliente de la sesión. **Copiar el patrón que ya existe** en `vehiculo.routes.ts:96-105`, que resuelve exactamente el caso simétrico. Si no coincide → 403 y abortar la transacción.
- [ ] **B3.2** Test en `smoke.tenant.test.ts`: patrón A creando conductor con `vehiculo_id` de B → 403, y **ninguna fila creada** (verificar que la transacción revierte también el `Conductor` y el `MinosUser`).

### B4 — No pisar la identidad global de Minos (P1 16)

- [ ] **B4.1** `usuario.routes.ts:68-83`: en la rama `update` del upsert, `telefono` se escribe **sin guarda** (a diferencia de `nombre`, que lleva `|| undefined`). Como el teléfono es el identificador de login (`auth.routes.ts:105`), esto permite reescribir el teléfono de una identidad NexOS existente. **Quitar `telefono` del `update`**: solo se fija en `create`.
- [ ] **B4.2** Si el upsert encuentra un usuario existente, **no tocar `nombre` tampoco**. La identidad global no se edita desde un producto. Si el patrón quiere otro nombre, que sea un campo local de `Conductor`.
- [ ] **B4.3** Documentarlo en `docs/decisiones-tecnicas.md`: *un producto OS no modifica `minos.Users`; solo lo lee o lo crea.* Es regla de ecosistema, no de PilotOS.

### B5 — Comparar el acumulado del taxímetro entre tickets (N5, IMPLEMENTADO el 2026-08-11)

**Por qué:** hasta el 2026-08-11 solo se auditaba el acumulado de "borrados" del taxímetro, y (por el hallazgo N6) ni siquiera eso funcionaba de verdad. El km y el importe acumulados se leían del ticket y se tiraban a la basura. Era el hueco que permitía que un coche circulara con el taxímetro apagado sin que nadie lo notara.

**Cerrado en la misma sesión de verificación** (no quedó como tarea para el ejecutor, se construyó junto con el fix de N6 porque dependía directamente de él). Diseño acordado con Alberto, más estricto que el propuesto inicialmente:

- Los borrados **no se comparan contra "máximo +1"**. Se comparan contra `borrados del ticket anterior + número de partes (turnos) declarados entre los dos tickets` — cada inicio de turno reinicia el parcial y genera un borrado legítimo, así que si entre dos tickets hay 2 partes, lo esperado es +2, no +1.
- Si sobran borrados sobre lo esperado, se mira km y € del acumulado:
  - Si **solo** sobran km (el dinero acumulado cuadra con lo declarado) → mensaje de severidad CRÍTICA pero de tono "revisa con tu asalariado" (coche al taller, ITV, cambio de ruedas...).
  - Si **también** sobra dinero acumulado sin declarar → mensaje de "posible trabajo no declarado", mismo nivel CRÍTICA pero con el motivo más grave explícito.
  - Si hay **menos** borrados de los esperados → CRÍTICA de "manipulación del contador", sin mirar km/€.
- Implementado en `backend/src/services/ocrComparacion.service.ts`: `compararAcumulados` sustituye a la antigua `compararBorrados`, con `buscarTicketAnterior` como helper compartido.
- Tolerancias de arranque, **no confirmadas por Alberto con datos reales todavía**: 20 km, 5 €. Documentadas como constantes ajustables al principio del archivo (`TOLERANCIA_KM_ACUMULADO`, `TOLERANCIA_EUR_ACUMULADO`) — ajustar cuando haya experiencia con tickets reales.
- Test de regresión: `backend/tests/smoke.ocrAcumulados.test.ts` (7 casos) — todo cuadra, caso explicable, caso grave, manipulación a la baja, varios partes entre tickets (el caso que prueba que NO es "+1 fijo"), sin ticket anterior, sin `acum_borrados` extraído.
- Documentado en `docs/learning/correcciones.md` (C-044).

### B5-bis — Aviso activo al patrón + cierre desde el panel (IMPLEMENTADO el 2026-08-11)

Alberto preguntó explícitamente si el aviso llegaba a algún canal: no llegaba a ninguno. Cerrado en la misma sesión, junto con B5:

- **WhatsApp real:** `compararAcumulados` llama a `notificarPatronAnomalia`, que usa `enviarAvisoGloria` — el mismo canal que mantenimiento, plantilla nueva `anomalia_taximetro` (motivo corto, distinto del mensaje largo del panel). Crea también un `Aviso` para trazabilidad. Un fallo del envío nunca rompe la comparación ni deja de registrar la Anomalia (try/catch propio, test dedicado). **Hereda automáticamente las mejoras de la Fase A** (reintento, confirmación de entrega) cuando esa fase se ejecute, porque usa la misma función.
- **Panel del patrón:** nuevo endpoint `POST /api/anomalias/:id/revisar` (solo patrón, aislado por cliente, idempotente) → `estado='RESUELTA'` + `revisada_at`/`revisada_por` (columnas nuevas). El widget "Alertas Pendientes" de `admin/page.tsx` ya no filtra por `notificada` ni limita a 4 — muestra **todas** las que no estén `RESUELTA`, con badge "Crítica" y botón "Marcar revisada" por fila.
- Migración `20260811160000_anomalia_revision` **escrita, NO aplicada** — la base de datos de este `.env` es la compartida (`161.97.108.106`); no se ha tocado sin confirmación explícita. Aplicar con `npm run db:deploy` cuando corresponda.
- GlorIA: plantilla `anomalia_taximetro` añadida al worker n8n, en rama nueva `fix/pilotos-avisos-mantenimiento-2026-08` (creada desde `gloria-v6`), junto con `mantenimiento_proximo`/`mantenimiento_vencido`. **Ahora son 3 plantillas pendientes de aprobación en Meta Business, no 2.**
- Test: `backend/tests/smoke.anomaliaRevisar.test.ts` (4 casos: tenant, inexistente, éxito, idempotencia).
- **Verificación conjunta B5 + B5-bis: 92/92 tests del backend en verde, build backend limpio, `next build` completo del frontend limpio.**

**Pendiente, no incluido en este cierre — queda como tarea B5.1 para el ejecutor:**
- [ ] **B5.1** El hueco de `km_inicio` sin validar contra `vehiculo.km_actuales` (relacionado, mismo hallazgo N5, ver texto de N5 más arriba): en `parteDiario.routes.ts`, handler `POST /` (L104+) — si `data.km_inicio` se aleja de `vehiculo.km_actuales` en más de un margen razonable (proponer **50 km**, a confirmar con Alberto), no bloquear el parte pero **crear una Anomalia NORMAL** dejando constancia, igual que ya hace `actualizarKmSiAvanza` con el caso de km retrocediendo (L55-65 del mismo archivo, molde de estilo). Test en `smoke.kilometraje.test.ts`.

**Verificación de la fase B:** `npm test` (92, ya incluye B5 y B5-bis). Con dos clientes de prueba y un asalariado, comprobar manualmente cada punto de B2 contra la API.

---

## FASE C — Verificación de producción (P0 8)

**No es código. Es comprobación, y sin ella lo demás no significa nada.** Necesita acceso a Coolify: si el modelo no lo tiene, **para y pídeselo a Alberto**.

- [ ] **C.1** SHA desplegado de **backend y frontend por separado** (son dos apps en Coolify: 1 backend, 5 frontend). El webhook de auto-deploy ya falló el 7 de agosto (C-041): comprobar los dos, siempre.
- [ ] **C.2** Variables en producción: `GLORIA_API_URL`, `GLORIA_INTERNAL_TOKEN`, `HERMES_CLIENTE_ID`, tokens de Hermes/LucIA, y todo el bloque `NEXOS_PAY_*`. Recordatorio de memoria: **`NEXOS_PAY_URL` debe ser el dominio, nunca el nombre del contenedor** — si no llegan altas a Pay, mirar eso primero.
- [ ] **C.3** Comprobar que `NEXOS_PAY_ENFORCE_ACCESS` y `NEXOS_PAY_ENFORCE_PLAN_GATES` siguen en `false`. El doc de learning del 2026-08-11 dice explícitamente que no se activan hasta aprobar y cargar los planes Control/Pro.
- [ ] **C.4** Desde el contenedor de PilotOS, `curl` al endpoint de GlorIA con el token real. Debe dar 400 (faltan campos), **no 401 ni 503**.
- [ ] **C.5** Estado real de las plantillas en Meta Business (A5.4).
- [ ] **C.6** Volumen `pilotos-uploads:/app/uploads` montado **y con copia externa**. Hoy los documentos viven ahí y solo ahí.
- [ ] **C.7** Estado del webhook de auto-deploy de Coolify, o procedimiento manual fiable documentado.
- [ ] **C.8** Escribir todo el resultado en `docs/learning/`. Sin esto, la próxima sesión repite el trabajo.

---

## FASE D — Datos de mantenimiento correctos (P1 9,10,11,12)

### D1 — Vehículo nuevo sin catálogo (P1 9) — el más urgente de la fase

`mantenimientoVehiculo.create` existe en **un solo sitio**: `onboarding.routes.ts:295`. Un segundo vehículo aparece en la flota **sin ningún mantenimiento monitorizado**: invisible para el motor de avisos, para `/proximos` y para `/internal/mantenimientos`.

- [ ] **D1.1** Extraer el bucle de siembra de `onboarding.routes.ts:293-305` a una función reutilizable, p.ej. `backend/src/services/mantenimiento.service.ts` → `sembrarCatalogo(tx, vehiculo, datosIniciales?)`.
- [ ] **D1.2** Llamarla desde `onboarding.routes.ts` **y** desde `POST /api/vehiculos` (`vehiculo.routes.ts:43-55`), envolviendo esta última en `prisma.$transaction` (hoy no lo está).
- [ ] **D1.3** Script de reparación puntual en `backend/src/scripts/`: encontrar vehículos activos sin filas de `MantenimientoVehiculo` y sembrarlos. **Idempotente y en seco por defecto** (`--apply` para escribir). Ejecutarlo en producción tras la fase C.

### D2 — Fechas iniciales reales (P1 10)

Hoy `proximo_km = km_actuales + frecuencia` y `proxima_fecha = hoy + frecuencia`. Una ITV que vence el mes que viene se registra a 12 meses. El propio código ya lo reconoce como deuda "M10" (`onboarding.routes.ts:288-292`).

- [ ] **D2.1** Permitir `datosIniciales` opcionales en `sembrarCatalogo`: `{ catalogo_id, ultima_ejecucion_km?, ultima_ejecucion_fecha? }[]`, y calcular el próximo umbral **desde la última ejecución real** cuando venga.
- [ ] **D2.2** Frontend: en el alta de vehículo, pedir al menos **fecha de última ITV, vencimiento del seguro y fecha/km de la última revisión**. Aplicar `nexos-frontend-design` y `ux.md`: opcional pero recomendado, con un aviso claro de que sin esos datos los primeros avisos serán aproximados. Estados loading/empty/error obligatorios.
- [ ] **D2.3** Retirar el comentario "M10" cuando quede cerrado.

### D3 — Umbrales del dashboard (P1 11)

- [ ] **D3.1** `mantenimiento.routes.ts:71-74` usa 1000 km / 30 días fijos. `resolverPreferenciasAvisos` **ya está importado en ese mismo archivo** (L5) y se usa en L22 y L29. Usarlo también aquí, leyendo `vehiculo.cliente.preferencias_avisos`. El umbral en km debe ser el **mayor** de `prefs.umbralesKmProximo`.
- [ ] **D3.2** Test: cliente con umbral de 60 días → `/proximos` devuelve un mantenimiento a 45 días.

### D4 — Reset de dedupe al editar (P1 12)

- [ ] **D4.1** `mantenimiento.routes.ts:236-247` (`PUT /:id`) recalcula `proximo_km`/`proxima_fecha` pero no resetea los niveles. Añadir `ultimo_nivel_aviso_km: null, ultimo_nivel_aviso_dias: null` **solo cuando cambien la frecuencia o los próximos umbrales** (no en un cambio de `activo`). El `POST /:id/resolver` (L125-138) ya lo hace bien: imitarlo.

---

## FASE E — Sombra de n8n → backend

**Rumbo confirmado por Alberto.** Importante: la auditoría dice que PilotOS depende de n8n, y **eso ya no es cierto del lado de PilotOS**. Los dos workflows de `PilotOS/n8n-workflows/` nunca se importaron; `wf-scheduler-avisos.json` fue reemplazado por `scheduler.service.ts` por decisión explícita de Alberto. La superficie n8n que queda es **la entrega dentro de GlorIA** (`wf-notificaciones-worker-v6`) y **el canal conversacional** (`wf-gloria-ai-bridge-v6`).

### E1 — Limpiar la contradicción documental (rápido y con valor)

- [ ] **E1.1** `PilotOS/docs/arquitectura/arquitectura-inicial.md:44` («Scheduling: n8n (objetivo), node-cron (transitorio)») y L199 («migrar a n8n progresivamente») dicen **lo contrario del rumbo**. Corregirlos.
- [ ] **E1.2** Igual en `docs/producto/Estado_Actual_PilotOS.md:97,196` y `docs/decisiones/decisiones-tecnicas.md:35,38,141`.
- [ ] **E1.3** Escribir la decisión de rumbo en `docs/decisiones-tecnicas.md`: *los flujos se migran de n8n al backend con patrón sombra; n8n no se apaga de golpe.*
- [ ] **E1.4** Borrar o marcar como obsoleto `PilotOS/n8n-workflows/wf-scheduler-avisos.json` (ya reemplazado) y `wf-inbound-whatsapp.json` (apunta a `/api/webhook/gloria`, endpoint que no existe en PilotOS).

### E2 — Sombra del envío: backend directo a Meta

El molde a copiar es **`RentOS/nexos-api/server.js:7900-8059` + `migrations/sombra_reconciliacion.sql`**, que lleva 19 días corriendo en producción. Sus tres propiedades de diseño, que hay que replicar tal cual:

1. **Guardar las entradas, no solo la decisión** — si no, las divergencias no se pueden interpretar.
2. **Una "alerta roja" precalculada en la fila** — no todas las divergencias son iguales.
3. **La sombra debe recibir exactamente la misma entrada que el sistema observado** — si no, mide otra cosa.

Y el anti-patrón a evitar, también de RentOS: `PENDIENTE_SHADOW` es una cola muerta con 10 mensajes atascados porque nadie la revisa. **Toda sombra necesita endpoint de revisión y fecha de decisión.**

- [ ] **E2.1** Migración: tabla `pilotos."Sombra_Envio"` con `ejecutado_en`, `aviso_id`, `entrada` (JSONB: teléfono, tipo, params — lo mismo que se mandó a GlorIA), `decision_backend` (JSONB: el payload de Meta que el backend *habría* construido), `resultado_n8n` (JSONB: lo que hizo el worker, vía la conciliación de A4), `coincide BOOLEAN`, `alerta TEXT`.
- [ ] **E2.2** Módulo puro y testeable `backend/src/services/metaPayload.service.ts` → `construirPayloadMeta(tipo, telefono, params)`, que replique **exactamente** el nodo "Build Meta Payload" del worker. Molde: `RentOS/scripts/reconciliar-cobertura.js` (28/28 tests).
- [ ] **E2.3** En `mantenimientoAlertas.service.ts`, tras el envío real, llamar a la sombra: construir el payload y **solo insertar la fila**. Nunca enviar. Nunca alterar el flujo. Envolver en try/catch para que un fallo de la sombra jamás rompa el aviso real.
- [ ] **E2.4** `GET /internal/avisos/sombra?dias=7` con el mismo formato que `GET /internal/ical/sombra` de RentOS: `{ventana_dias, ejecuciones, con_alerta, alertas, ultimas}`. Añadirlo a `RUTAS_LUCIA` para poder preguntarlo por Telegram.
- [ ] **E2.5** Doc semanal en `docs/learning/`, con la tabla «Estado de la sombra» del molde `RentOS/docs/learning/sombra-summary-ical-2026-08-08.md`.
- [ ] **E2.6** **Criterio de promoción, escrito de antemano:** mínimo 2 semanas con `coincide = true` en el 100% y `alertas = 0`. La promoción es **decisión explícita de Alberto**, nunca automática. El rollback es una variable de entorno.
- [ ] **E2.7** Poner **fecha de revisión** en el doc. Sin fecha, se pudre (ver `PENDIENTE_SHADOW`).

---

## FASE F — Economía (P2 17-21)

**Aquí se toca dinero. Máxima cautela: nada de esto se despliega sin que Alberto valide las cifras contra un caso real conocido.**

### F1 — Configuración vigente por fecha trabajada (P2 17)

`calculo.service.ts:55-66` filtra por `fecha_fin: null` y **nunca recibe `parte.fecha_trabajada`**. Un parte atrasado se calcula con la configuración de hoy. Mismo fallo, por separado, en `cierre.routes.ts:91-93` para `cuota_pilotos`.

- [ ] **F1.1** Pasar `fecha` a la función de resolución y filtrar por el intervalo vigente ese día:
  ```ts
  where: { cliente_id, activo: true, conductor_id,
           fecha_inicio: { lte: fecha },
           OR: [{ fecha_fin: null }, { fecha_fin: { gte: fecha } }] },
  orderBy: { fecha_inicio: 'desc' },
  ```
  Mantener la precedencia actual: primero la específica del conductor, luego la general.
- [ ] **F1.2** Aplicar lo mismo en `cierre.routes.ts:91`.
- [ ] **F1.3** Tests en `smoke.economia.test.ts` (hoy 58 líneas, no cubre esto): configuración 50/50 cerrada el 30 de junio y 60/40 desde el 1 de julio; un parte del 15 de junio recalculado hoy debe salir 50/50.
- [ ] **F1.4** **No recalcular partes históricos automáticamente.** Sería reescribir liquidaciones ya pagadas. Si hay que corregir históricos, es decisión de Alberto y trabajo aparte.

### F2 — Quitar el fallback silencioso (P2 20)

`resumen.service.ts:113-117` y `cierre.routes.ts:104-107`: si un parte no tiene `CalculoParte`, asignan **todo el bruto al patrón** y el conductor se queda a cero. Y en el cierre eso se **persiste**.

- [ ] **F2.1** Sustituir el fallback por: contar esos partes, **excluirlos de los totales**, y devolverlos en la respuesta como `partes_sin_calculo: [ids]`.
- [ ] **F2.2** En `POST /cierres`, si hay partes sin cálculo → **400 con la lista**, y no crear el cierre. Un cierre incompleto es peor que ningún cierre.
- [ ] **F2.3** UI: banner claro de «N partes sin calcular, revísalos antes de cerrar» con enlace a esos partes. `ux.md`: error humano + acción de recuperación.
- [ ] **F2.4** Script de diagnóstico (solo lectura) que cuente partes sin `CalculoParte` en producción. Ejecutarlo **antes** de desplegar F2, para saber a cuántos afecta.

### F3 — Validación de fechas en cierres (P2 21)

- [ ] **F3.1** `cierre.routes.ts:48-56`: añadir `isNaN(fecha.getTime())` para ambas y `fechaInicio <= fechaFin`. Hoy `"lunes"` llega hasta Prisma y `desde > hasta` crea un cierre de ceros con pinta de válido.

### F4 — Seguridad Social del asalariado (P2 18) — regla de negocio cerrada el 2026-08-11

Decisión de Alberto, ya no hay que preguntar nada:

- **Importe:** por conductor, no por cliente. Cada asalariado tiene su propia cuota fija de SS.
- **Modo de descuento:** configurable **por cliente** — el patrón elige, para todos sus asalariados, si se descuenta de cada parte diario o del cierre de periodo. No es una casilla por asalariado.
- **Mes incompleto:** **sin prorrateo.** Si el asalariado estuvo activo en algún momento del mes (alta o baja a mitad de mes, da igual), se le descuenta la **cuota completa** de ese mes. No hay cálculo de días.

Implementación:

- [ ] **F4.1** Migración: añadir a `Conductor` (o a la relación conductor-cliente si existe una tabla intermedia) el campo `cuota_ss_mensual Decimal?`. Si es null, no se le aplica descuento de SS a ese conductor.
- [ ] **F4.2** Migración: añadir a `Cliente` (o `ConfiguracionEconomica` general del cliente) el campo `ss_modo_descuento String @default("cierre")` con los valores `'parte' | 'cierre'`.
- [ ] **F4.3** Si `ss_modo_descuento = 'parte'`: en `calculo.service.ts`, el neto del conductor de **cada parte del mes** se ve reducido por `cuota_ss_mensual / dias_habiles_del_mes_con_parte` — pero **atención**, esto es solo el *reparto visual* dentro del mes, no un prorrateo por asistencia: la suma de todos los partes del mes debe dar exactamente `cuota_ss_mensual`, se hayan trabajado todos los días del mes o no (ver regla de "mes incompleto" arriba). La forma más simple y menos propensa a error de redondeo: aplicar el descuento completo en el **último parte del mes** de ese conductor, no repartirlo.
- [ ] **F4.4** Si `ss_modo_descuento = 'cierre'`: en `cierre.routes.ts`, añadir una línea `descuento_ss` en el `CierrePeriodo`, calculada como `SUM(cuota_ss_mensual)` de los conductores que estuvieron activos en algún momento del rango `[desde, hasta]` del cierre. No tocar los partes individuales.
- [ ] **F4.5** "Activo en algún momento del mes/periodo" se resuelve con las fechas de alta/baja de `Conductor` (o de `VehiculoConductor` si el alta/baja se modela ahí — comprobar cuál es la fuente de verdad antes de escribir la query).
- [ ] **F4.6** Tests en `smoke.economia.test.ts`: conductor con `cuota_ss_mensual=60`, modo `'cierre'` → el cierre del mes lleva `descuento_ss=60` aunque solo haya trabajado 3 días; modo `'parte'` → el último parte del mes lleva el descuento completo, los demás no.
- [ ] **F4.7** Documentar en `docs/decisiones-tecnicas.md` con la regla exacta de arriba, para que no se reabra la pregunta.

### F5 — Exceso de efectivo (P2 19) — retirado, ya cubierto

Alberto aclaró el 2026-08-11: **todos los trayectos pasan por el taxímetro**, así que el `bruto` de cada parte es siempre correcto y completo, se cobre en efectivo o en tarjeta. El `datafono` declarado por el conductor no necesita verificación de PilotOS: el propietario lo contrasta contra su banco **fuera del sistema**, y ahí el asalariado no tiene forma de mentir.

El único riesgo real es que el conductor **no declare un trayecto en efectivo** para quedárselo — y ese riesgo **ya está cubierto**: es exactamente lo que hace `ocrComparacion.service.ts` (`compararDocumentosConParte`), comparando el total y los km del parte declarado contra el ticket físico del taxímetro fotografiado, con las tolerancias y la detección `CRITICA` de `acum_borrados` que ya se corrigieron en la auditoría de seguridad de julio.

- [ ] **F5.1** No implementar ningún campo ni cálculo nuevo de "exceso de efectivo". El concepto de la auditoría (comparar `efectivo estimado` contra un `efectivo entregado real`) no aplica al modelo de negocio de PilotOS.
- [ ] **F5.2** Retirar el punto 19 de la lista de pendientes económicos. Dejar una nota en `docs/decisiones-tecnicas.md`: *el control de fraude en efectivo es el motor OCR de comparación contra el ticket del taxímetro (`ocrComparacion.service.ts`), no una cifra de "exceso" aparte. `efectivo estimado = bruto − datafono` es y seguirá siendo una estimación teórica; no se persiste ni se concilia porque no hace falta.*

---

## FASE G — Documentos, sesión y operación

### G1 — Recuperación de contraseña y sesión (P3 24,25)

- [ ] **G1.1** No existe «he olvidado mi contraseña». El 7 de agosto hubo que **tocar la BD a mano** para devolver la cuenta de Alberto a estado placeholder (C-039). Implementar recuperación con **OTP por WhatsApp vía GlorIA** — el canal ya existe y ya sabemos usarlo. Token de un solo uso, caducidad 15 minutos, tabla propia con hash del token, nunca el token en claro. Aplicar el `authLimiter` que ya existe (`auth.routes.ts:15-21`).
- [ ] **G1.2** `establecer-password` (L164) fija la primera contraseña sabiendo solo el teléfono y **emite sesión completa acto seguido** (L193-196). Exigir el mismo OTP. El propio código admite el fallo en el comentario de L155-162.
- [ ] **G1.3** JWT de 30 días (`auth.middleware.ts:16`) en localStorage **y** en cookie escrita desde JS (`app/src/lib/auth/session.ts:37-44`), por tanto sin `HttpOnly` ni `Secure` posibles. Bajar a 7 días con refresh, o como mínimo añadir `secure` a la cookie y documentar el riesgo aceptado. **Es decisión de producto (PWA móvil): preguntar a Alberto** antes de acortar la sesión.
- [ ] **G1.4** (N4) Comentario de advertencia en `auth.middleware.ts:57` explicando que el early-return existe por el doble montaje de `index.ts:165`, y test que verifique que un JWT inválido sigue dando 401 por esa ruta.

### G2 — Documentos: `DocumentoEnlace` genérico de verdad (P3 23)

Tiene `entidad_tipo`/`entidad_id` pero `entidad_id` es **FK física a `ParteDiario`** (`schema.prisma:236-248`). Cualquier fila con `entidad_tipo='GASTO'` viola la constraint. Es el bloqueo estructural del punto 13.

- [ ] **G2.1** Migración: eliminar la relación `parteDiario` y su `map: "doc_enlace_parte_fk"`, dejando `entidad_id` como columna libre. Mantener el `@@unique([documento_id, entidad_tipo, entidad_id])`.
- [ ] **G2.2** Revisar todo el código que dependa del `include` de esa relación (`parteDiario.routes.ts:474-480` la usa) y sustituirlo por consulta explícita en dos pasos.
- [ ] **G2.3** Migrar `Gasto.url_factura` (string suelto) a `DocumentoEnlace` con `entidad_tipo='GASTO'`, manteniendo la columna vieja durante una transición.

### G3 — Drive (P3 22) y OCR de facturas (P1 13)

- [ ] **G3.1** Los documentos viven en disco local (`storage.service.ts:6-9`), contra la arquitectura definida (Drive como almacén, BD como referencia). `Documento.drive_file_id` ya existe en el esquema (`schema.prisma:217`) pero está sin usar. **Es un proyecto en sí mismo: no lo metas dentro de otra fase.** Requiere credenciales de Google que el modelo no tiene → parar y pedirlas. **Nota 2026-08-11:** se corrigió por separado que el volumen `/app/uploads` de producción no existía en Coolify (C-047) — ya montado, pero sigue siendo disco local, no Drive; G3.1 sigue en pie tal cual.
- [x] **G3.2-terreno (2026-08-11)** — el tramo de recepción/guardado ya no depende de G2.1: en vez de generalizar `DocumentoEnlace` (arriesgado, ~10 sitios lo consultan), se añadieron `vehiculo_id`/`mantenimiento_vehiculo_id` directamente a `Documento` (aditivo, sin tocar código existente) y `POST /internal/documentos-vehiculo` para que GlorIA pueda entregar una foto sin clasificar. Ver C-048 en `docs/learning/correcciones.md`. **La extracción/clasificación en sí sigue sin construir** (G3.2 original, ahora más acotado: solo falta OCR de factura → tipo de documento → match contra `MantenimientoCatalogo`) — espera una foto real, y además falta que `wf-gloria-ai-bridge-v6` (n8n, en vivo) descargue el media de Meta y llame a este endpoint nuevo. Ese último cable es decisión de Alberto, no se ha tocado el workflow en vivo.

### G4 — Alta en Pay sin reconciliación (P3 26)

- [ ] **G4.1** El working tree ya mejoró esto: `billing-sync.service.ts:20-30` deja un `LedgerEvento` `BILLING_ASALARIADOS_SYNC_FAILED`. Pero **es solo para la sincronización de cantidad, y nadie lo relee**. Si `provisionarCliente` falla, no queda **ningún** rastro en BD.
- [ ] **G4.2** Escribir siempre un `LedgerEvento` también cuando falla el alta.
- [ ] **G4.3** Cron de reintento en `scheduler.service.ts`: releer esos eventos y reintentar con backoff. Es lo que convierte el log en un outbox de verdad. Sin él, G4.2 es otro `PENDIENTE_SHADOW`.
- [ ] **G4.4** No cambiar la naturaleza fire-and-forget del alta: la norma dice **Pay nunca puede romper el producto**. Sigue fuera de la transacción y sin `await`.

### G5 — Documentación y operación (P4 27,28,29,30,31)

- [ ] **G5.1** `backend/.env.example`: quitar `N8N_WEBHOOK_URL`; descomentar y documentar `GLORIA_API_URL`/`GLORIA_INTERNAL_TOKEN`; añadir todo el bloque `NEXOS_PAY_*` (8 variables leídas en `lib/nexos-pay.ts:50-71`), `HERMES_CLIENTE_ID`, los tokens de Hermes/LucIA y `PUBLIC_BASE_URL` (usado en `upload.routes.ts:37`). Marcar cuáles son **obligatorias** — hoy un despliegue arranca «bien» con las integraciones apagadas.
- [ ] **G5.2** `DEPLOY_COOLIFY.md`: quitar la recomendación de `npm run prod:setup` (L57-61) que contradice la sección de migraciones (L76-79). Misma contradicción en `docs/arquitectura/despliegue-preprod.md:49` y `SETUP.md:38`. Quitar `prod:setup` de `package.json` o renombrarlo a `dev:setup` para que no se pueda usar contra producción por error.
- [ ] **G5.3** CI: no hay `.github/workflows/`. Crear uno que corra `npm ci && npm run build && npm test` en cada push y PR. Es la red de seguridad de todo lo anterior. **Hacerlo pronto, no al final.**
- [ ] **G5.4** `/health` (`index.ts:74-76`) devuelve `ok` con la base de datos caída. Añadir `SELECT 1` con timeout de 2 s y comprobación de escritura en `uploads`; 503 si algo falla. Mantener un `/health/live` trivial para el orquestador.
- [ ] **G5.5** `unhandledRejection` (`index.ts:211`) se etiqueta `[FATAL]` y no sale. Decidir política y aplicarla. Recomendado: registrar y salir, igual que `uncaughtException`, para que Docker reinicie. **Cuidado:** interactúa con el fire-and-forget de Pay (G4) — implementar G4.2 primero para no tumbar el proceso por un fallo de Pay.
- [ ] **G5.6** Añadir `lint` y `typecheck` a los scripts de `package.json`. Hoy no existen.

---

## Verificación global

Al terminar cada fase:

```bash
cd "C:/Mis Documentos/NEXO STUDIOS/PilotOS/backend"
npm run build && npm test        # 73 + los nuevos, todos en verde
```

Antes de dar por cerrado el trabajo, prueba end-to-end en producción o preproducción:

1. Alta de cliente nuevo con dos vehículos → **ambos** con catálogo de mantenimientos sembrado (D1).
2. El alta llega a NexOS Pay (C.2, G4).
3. Un mantenimiento cruza escalón → llega el WhatsApp → `Aviso.delivery_status = 'delivered'` (fase A).
4. Dos mantenimientos distintos el mismo día → **llegan los dos** (A3).
5. Con GlorIA caída a propósito: el escalón **no** se quema y se reintenta al día siguiente (A1).
6. Asalariado autenticado: ve solo sus partes; gastos y dashboard → 403 (B2).
7. Token de Hermes con `userId` de otro cliente → 404 (B1).
8. Patrón A creando conductor con vehículo de B → 403 (B3).
9. `GET /internal/avisos/sombra?dias=7` devuelve observaciones y `con_alerta: 0` (E2).
10. `/health` con la BD parada → 503 (G5.4).

---

## Lo que este plan NO cierra, y por qué

Que quede explícito, para que nadie lo dé por hecho:

- **Aprobación de las plantillas en Meta Business** (A5.4) — fuera de los repos, solo lo puede confirmar Alberto.
- **Migración a Drive** (G3.1) — necesita credenciales de Google y es un proyecto propio.
- **OCR de facturas → mantenimiento** (G3.2) — depende de G2 y G3.1.
- **Duración del JWT** (G1.3) — decisión de producto sobre la PWA móvil.
- **Recálculo de partes históricos** (F1.4) — deliberadamente fuera: reescribiría liquidaciones ya pagadas.
- **Cadencia del worker n8n** (A6) — pendiente de decisión.
