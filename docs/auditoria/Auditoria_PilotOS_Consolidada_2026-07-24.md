# Auditoría técnica consolidada de PilotOS

**Fecha:** 24 de julio de 2026
**Autor:** Claude Code (revisión sobre código real del repo)
**Base de contraste:** `Informe_Auditoria_PilotOS_REVISADO_2026-07-22.md` (ChatGPT)
**Alcance:** `PilotOS/backend/src` (verificado línea a línea), esquema Prisma, frontend auth, docs de arquitectura.

> Este documento **contrasta el informe de ChatGPT contra el código real**, marca cada afirmación
> (confirmada / matizable / falsa), añade lo que se le escapó y consolida un **plan por fases verificable**.
> No sustituye al informe de ChatGPT: lo audita.

---

## 1. Veredicto global

El informe de ChatGPT es **sólido y en su mayoría correcto**. Los fallos P0 de seguridad y de exactitud
económica son **reales y verificados**. Tiene **3 puntos flojos** (1 probablemente falso, 2 exagerados) y
**se le escapan 2 cosas** relevantes por ser reglas del ecosistema NexOS.

**Dictamen mantenido:** PilotOS **no es apto todavía para datos reales multiusuario** hasta cerrar los P0
(autenticación, aislamiento entre clientes, permisos, documentos privados) y la exactitud económica.

---

## 2. Confirmado (verificado en código)

### Seguridad P0
| Hallazgo | Ubicación | Estado |
|---|---|---|
| Login sin verificación (solo teléfono → JWT) | `auth.routes.ts:15` | ✔️ Confirmado |
| IDOR por `cliente_id` ausente (guarda invertida) | `parteDiario.routes.ts:429` | ✔️ Confirmado |
| Listados sin filtro cuando falta `cliente_id` | `vehiculo/usuario/gasto.routes.ts` | ✔️ Confirmado |
| `POST/PATCH /api/usuarios` sin `requirePatron` | `usuario.routes.ts:49,115` | ✔️ Confirmado |
| Cierres rotos para el patrón (`role` = `'user'`, no `'patron'`) | `cierre.routes.ts:36` | ✔️ Confirmado |
| `/uploads` sin comprobar propiedad del archivo | `index.ts:80` | ✔️ Confirmado |

### Exactitud económica y datos
| Hallazgo | Ubicación | Estado |
|---|---|---|
| `neto = bruto` cuando no incluye combustible | `calculo.service.ts:71-73` | ✔️ Confirmado |
| Fallback sin cálculo → todo el bruto al patrón | `resumen.service.ts:75-79`, `cierre.routes.ts:97-100` | ✔️ Confirmado |
| Cálculo fuera de la transacción (parte ENVIADO sin cálculo) | `parteDiario.routes.ts:181-187` | ✔️ Confirmado |
| Kilometraje maestro retrocede (`km_actuales = km_fin`) | `parteDiario.routes.ts:169,199` | ✔️ Confirmado |
| Gastos fijos sin prorratear por rango | `resumen.service.ts:92`, `cierre.routes.ts:108` | ✔️ Confirmado |
| Config económica: `ORDER BY conductor_id DESC` → NULLS FIRST → gana la genérica | `calculo.service.ts:53-54` | ✔️ Confirmado (buen catch) |
| Cierres duplicables (sin `@@unique` de periodo) | `schema.prisma` `CierrePeriodo` | ✔️ Confirmado |
| `DocumentoEnlace` con FK física solo a `ParteDiario` | `schema.prisma` (`doc_enlace_parte_fk`) | ✔️ Confirmado |
| Scheduler crea su propio `PrismaClient` (rompe DT-011) | `scheduler.service.ts:10` | ✔️ Confirmado |
| `/health` superficial (no comprueba dependencias) | `index.ts:61` | ✔️ Confirmado |

### Mantenimientos (bloque M1–M14)
| ID | Hallazgo | Ubicación | Estado |
|---|---|---|---|
| M1 | Envío es `TODO`; el log dice "alertas enviadas" sin enviar nada | `scheduler.service.ts:68,80,89` | ✔️ Confirmado |
| M2 | Al resolver queda `RESUELTO` para siempre; scheduler solo mira PENDIENTE/VENCIDO y `/proximos` excluye RESUELTO → ciclo recurrente roto | `mantenimiento.routes.ts:68`, `scheduler.service.ts:34`, `mantenimiento.routes.ts:40` | ✔️ Confirmado (el más grave del bloque) |
| M3 | Solo umbrales 1.000 km / 30 días | `scheduler.service.ts:76-77` | ✔️ Confirmado |
| M6 | Cron sin timezone declarada | `scheduler.service.ts:137` | ✔️ Confirmado |
| M7 | Scheduler in-process sin lock distribuido | `scheduler.service.ts`, `index.ts:144` | ✔️ Confirmado |
| M8 | `preferencias_avisos` no se usa | `scheduler.service.ts` | ✔️ Confirmado |
| M9 | Meses de 30 días en resolver vs `setMonth` en editar (inconsistente) | `mantenimiento.routes.ts:67` vs `:164` | ✔️ Confirmado |
| M12 | Modelo `Aviso` existe pero el scheduler no lo usa | `schema.prisma:389` | ✔️ Confirmado |

---

## 3. Matizable / exagerado

- **Punto 2 — lista de "áreas afectadas" inflada.** El *detalle* de vehículos (`vehiculo.routes.ts:23`)
  y conductores (`usuario.routes.ts:28`) sí está protegido por `isSameTenant`, que **deniega** cuando no
  hay `cliente_id`. El agujero de *detalle* está solo en **partes** (`:429`). En *listados* sí es sistémico.
  Dirección correcta, alcance sobredimensionado.
- **M4 "enviaría el mismo aviso todos los días".** Cierto como bug latente, pero **hoy no se envía nada**;
  es hipotético hasta conectar el canal. No leerlo como problema actual.

---

## 4. Dudoso / probablemente FALSO

- **Punto 6 · "efectivo estimado debería ser `neto − datáfono`".** → **Probablemente incorrecto.**
  `docs/learning/correcciones.md` (C-032) documenta `efectivo_estimado = max(0, bruto − datáfono)` como
  **decisión de diseño intencional** = complementario del datáfono sobre el bruto. Tiene sentido físico:
  *efectivo cobrado al pasajero = facturado − pagado con tarjeta*. Restar el combustible (un coste, no un
  canal de cobro) mezclaría conceptos. **Salvo redefinición explícita en el Master, el código está bien.**
- **Punto 8 · "Hetzner como SSOT".** → **Falso.** Toda la documentación de PilotOS (`backend/.env.example:9`,
  `DEPLOY_COOLIFY.md:18`, `docs/arquitectura/despliegue-preprod.md`) dice **Contabo**
  (`161.97.108.106:5433/nexos?schema=pilotos`, PostgreSQL compartida NexOS dentro de Coolify). No consta
  Hetzner. La *acción* (confirmar BD, backups, restore) sigue siendo válida; la premisa no.

---

## 5. Se le escapó (hallazgos adicionales)

- **NexOS Pay: cero integración.** No hay billing/entitlements/planes. `CLAUDE.md` obliga a evaluar el
  encaje con NexOS Pay antes de ampliar cualquier producto (cliente, plan, impago, límites). PilotOS no lo
  responde. Regla del ecosistema sin cumplir.
- **Comparación de token interno no constante** (`internal-token.middleware.ts:21`, `!==`) — timing menor,
  trivial de blindar con `crypto.timingSafeEqual`.
- **PostgreSQL expuesto públicamente** (puerto 5433) — los propios docs
  (`despliegue-preprod.md:130`) lo marcan como riesgo. Debe restringirse por firewall a IPs conocidas.
- **`password_hash` ya existe en `minos.Users`** con placeholders (`CONDUCTOR_NUEVO`, `ONBOARDING_INITIAL_STEP`).
  La Fase 1 (bcrypt) no parte de cero: rellena ese campo con hash real + verificación.

---

## 6. Decisiones de producto aplicadas (Alberto)

- **Autenticación:** contraseña + **bcrypt** (no OTP/enlace mágico).
- **Punto 5 (flujo tickets/partes):** **retirado**, se mantiene el comportamiento actual.
- **Punto 10 (avisos/automatización):** se implementa **en el backend, sin n8n**.

---

## 7. Plan consolidado por fases (verificable)

Orden por riesgo. Cada fase con criterio de cierre comprobable antes de pasar a la siguiente.
Todo el trabajo en `fix/pilotos-seguridad-2026-07-24` (o ramas hijas). Cada fase se documenta en
`docs/learning/correcciones.md` con el formato obligatorio.

| Fase | Contenido | Check de cierre |
|------|-----------|-----------------|
| **0 · Red de seguridad** | Rama de trabajo, scaffold de tests, higiene de repo (`schema.prisma.bak`, verificar ignores). | App arranca + tests de humo en verde. |
| **1 · Auth real (bcrypt)** | Hash bcrypt al crear usuarios, verificación en login, alta/recuperación de contraseña, cookie `httpOnly+Secure`, rate-limit + `helmet`. | Login sin credencial válida = 401; con ella = 200. Test lo prueba. |
| **2 · IDOR y fugas** | Middleware `requirePilotOSContext` (deny-by-default sin `cliente_id`); arreglar `parte:429`; proteger `/uploads` y `GET /onboarding/:telefono`; validar IDs de body. | Suite cross-tenant: A no lee/escribe datos ni ficheros de B. |
| **3 · Roles/RBAC** | Rol PilotOS sobre `es_patron` (no `minos.role`); arreglar cierres; `requirePatron` en estructura/conductores/gastos fijos. | Patrón crea cierre; asalariado denegado. |
| **4 · Exactitud económica** | Separar neto operativo vs base de reparto; cálculo dentro de la transacción + reconciliación; prorrateo de gastos fijos por rango; fijar orden config (específica > genérica); `@@unique` de cierre. | Batería financiera en verde. |
| **5 · Kilometraje** | `km_actuales` solo avanza; parte atrasado no retrocede; saltos como anomalía. | Test: parte atrasado nunca baja `km_actuales`. |
| **6 · Mantenimientos e2e (backend, sin n8n)** | Ciclo recurrente (RESUELTO→siguiente PENDIENTE); escalones 1.000/500/250/+250; dedup por umbral en modelo `Aviso`; envío real vía GlorIA desde backend; timezone `Atlantic/Canary`; `PrismaClient` singleton; fechas con calendario real. | Test que adelanta km/fechas dispara cada umbral una sola vez. |
| **7 · Higiene ecosistema** | Doc de encaje **NexOS Pay**; `timingSafeEqual`; política `uncaughtException`; migraciones versionadas; firewall Postgres. | Doc creada; migración limpia; repo ordenado. |

---

## 8. Estado de este documento

Todas las fases (0–7) se ejecutaron y verificaron en la rama
`fix/pilotos-seguridad-2026-07-24` el 2026-07-24. Cada fase tiene su commit
propio, con tests (51/51 al cierre de la Fase 7), `tsc --noEmit` limpio y
build verificado antes de pasar a la siguiente. Detalle y pendientes de cada
fase en los mensajes de commit correspondientes:

| Fase | Commit | Resumen |
|---|---|---|
| 0 | `chore(fase-0)` | Rama, scaffold de tests, higiene de repo |
| 1 | `fix(fase-1)` | Auth real con bcrypt |
| 2 | `fix(fase-2)` | Cerrar IDOR y fugas cross-tenant |
| 3 | `fix(fase-3)` | RBAC basado en es_patron |
| 4 | `fix(fase-4)` | Exactitud economica (calculo, prorrateo, cierres) |
| 5 | `fix(fase-5)` | Kilometraje maestro no retrocede |
| 6 | `fix(fase-6)` | Mantenimientos e2e en backend (sin n8n) |
| 7 | `fix(fase-7)` | Timing-safe token, encaje NexOS Pay |

**No se ha hecho merge a `main`**, ni push al remoto. Pendiente de revision
y decision de Alberto (ver lista de pendientes entregada al cierre de la
sesion).
