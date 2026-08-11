# PilotOS — Arquitectura Inicial

Fecha: 2026-03-09
Estado: Primera capa funcional implementada

---

## 1. Posicion en el ecosistema NexOS

```
NexOS (nucleo compartido)
  ├── minos.*    (auth, usuarios, suscripciones)
  ├── ledger.*   (auditoria inmutable)
  └── finance.*  (datos financieros)

PilotOS (producto vertical taxi)
  └── pilotos.*  (operacion, vehiculos, partes, gastos, mantenimientos, docs)

GlorIA (capa conversacional)
  ├── Router multi-planeta (detecta PILOTOS)
  ├── LucIA = prompt especializado dentro de GlorIA para el vertical taxi
  └── Endpoints /internal/ de PilotOS como fuente de datos

n8n (solo el worker de entrega dentro de GlorIA)
  └── wf-notificaciones-worker-v6: lee la cola de RentOS y envia a Meta
```

PilotOS NO envia mensajes WhatsApp directamente. Toda comunicacion al usuario pasa por GlorIA.
**Corrección 2026-08-11:** el *scheduling* y la *decisión* de cuándo avisar (mantenimientos, anomalías) viven en el backend de PilotOS (`node-cron`), no en n8n — decisión explícita de Alberto, ver `notificacion.service.ts` y la sección 5.1. n8n solo interviene como worker de entrega DENTRO de GlorIA, ya existía antes de PilotOS y no se sustituye. Las líneas de más abajo que dicen "n8n (objetivo)" o "migrar a n8n" quedan obsoletas por esta decisión — se dejan tachadas en vez de borradas, para que quede constancia de por qué se descartó ese rumbo.

---

## 2. Stack tecnico

| Capa | Tecnologia | Justificacion |
|------|-----------|---------------|
| Backend | Node.js + Express + TypeScript | Consistente con ecosistema |
| ORM | Prisma (PostgreSQL provider) | Moderno, type-safe, migraciones declarativas |
| Base de datos | PostgreSQL (BD compartida `nexos`) | SSOT del ecosistema |
| Schema BD | `pilotos.*` | Separacion por producto dentro de BD compartida |
| Auth | JWT via `minos.Users` | Compartido con ecosistema |
| Frontend | Next.js 16 + React 19 + Tailwind 4 | Base v2 construida, dark mode, rutas por rol |
| OCR | Tesseract.js (fase 1), cloud OCR (futuro) | Extraccion de tickets |
| Storage | Local (fase 1), S3-compatible (futuro) | Fotos y documentos |
| Scheduling | ~~n8n (objetivo), node-cron (transitorio)~~ → **node-cron, decisión final (2026-08-11)** | Avisos y vencimientos — ver 5.1 |
| Mensajeria | GlorIA (que internamente usa n8n solo como worker de entrega) | PilotOS no envia WhatsApp directamente |

### Decisiones clave de stack

**Prisma vs pg Pool**: PilotOS usa Prisma con PostgreSQL. RentOS usa pg Pool sin ORM. Esta diferencia es aceptable porque:
- Prisma aporta type safety y migraciones declarativas
- PilotOS parte de cero (no hay BD legacy en produccion)
- La comunicacion entre productos es via API interna, no queries directas cruzadas

**BD compartida con schema propio**: PilotOS usa la BD `nexos` pero con schema `pilotos`. Las tablas compartidas (`minos.Users`, `ledger.Eventos`) se acceden via raw queries o vistas cuando Prisma no soporte multi-schema nativamente.

---

## 3. Arquitectura de modulos

```
PilotOS Backend
├── /api/               (endpoints publicos, protegidos por JWT)
│   ├── auth            → login, /me
│   ├── onboarding      → registro inicial
│   ├── partes          → CRUD partes diarios
│   ├── vehiculos       → CRUD vehiculos
│   ├── usuarios        → CRUD usuarios/conductores
│   ├── gastos          → gastos diarios + fijos
│   ├── mantenimientos  → catalogo + seguimiento
│   ├── fotos           → upload + OCR + reemplazo
│   ├── incidencias     → creacion + cierre
│   └── anomalias       → registro + consulta
│
├── /internal/          (endpoints para GlorIA, protegidos por x-internal-token)
│   ├── usuario-por-telefono
│   ├── resumen-operativo
│   ├── registrar-gasto
│   ├── consultar-mantenimientos
│   └── kb/producto
│
├── /services/          (logica de negocio)
│   ├── ocr.service     → extraccion de tickets
│   ├── calculo.service → calculos de partes y reparto
│   └── storage.service → gestion de archivos
│
├── /middleware/
│   ├── auth            → JWT + roles
│   └── internal-token  → validacion x-internal-token
│
└── /prisma/
    └── schema.prisma   → modelo de datos (schema pilotos)
```

---

## 4. Flujo de datos principal

```
Conductor (movil)                    Patron (movil/web)
    │                                     │
    ▼                                     ▼
Frontend PilotOS                     Frontend PilotOS
    │                                     │
    ▼                                     ▼
PilotOS API (/api/*)                 PilotOS API (/api/*)
    │                                     │
    ▼                                     ▼
PostgreSQL (pilotos.*)               PostgreSQL (pilotos.*)
    │
    ▼
ledger.Eventos (auditoria)


Conductor (WhatsApp)                 Patron (WhatsApp)
    │                                     │
    ▼                                     ▼
GlorIA (router → PILOTOS)           GlorIA (router → PILOTOS)
    │                                     │
    ▼                                     ▼
PilotOS API (/internal/*)            PilotOS API (/internal/*)
    │                                     │
    ▼                                     ▼
PostgreSQL (pilotos.*)               PostgreSQL (pilotos.*)
```

El parte diario es la unica operacion que entra SOLO por frontend (R-PD-001, R-PD-002).
Gastos, incidencias, consultas y demas pueden entrar por GlorIA/WhatsApp.

---

## 5. Integracion con GlorIA

PilotOS expone endpoints `/internal/` protegidos por `x-internal-token` (misma convencion que RentOS):

| Endpoint | Proposito |
|----------|-----------|
| `GET /internal/usuario-por-telefono?phone=` | Identificar usuario PilotOS por telefono |
| `GET /internal/resumen?userId=` | Resumen operativo para contexto de IA |
| `POST /internal/registrar-gasto` | Registrar gasto desde GlorIA |
| `GET /internal/mantenimientos?vehiculoId=` | Estado de mantenimientos |
| `GET /internal/kb/producto` | Knowledge base del producto para IA |

GlorIA usa estos endpoints para:
1. Identificar al usuario y su contexto PilotOS
2. Alimentar el prompt de LucIA con datos reales
3. Ejecutar acciones operativas (gastos, consultas)

### 5.1 Avisos salientes: PilotOS → GlorIA → WhatsApp (verificado 2026-08-11)

Dirección contraria a la tabla anterior: aquí es PilotOS quien inicia el aviso, sin que el propietario haya preguntado nada. Cadena completa, backend a backend, **sin n8n en el lado PilotOS** (decisión explícita de Alberto, ver cabecera de `notificacion.service.ts`):

```
scheduler.service.ts (node-cron, diario 08:00, Atlantic/Canary)
  → mantenimientoAlertas.service.ts: procesarMantenimientos()
      calcula escalones (1000/500/250/vencido km, 30/vencido días)
      y detecta anomalías críticas del taxímetro (ocrComparacion.service.ts)
  → notificacion.service.ts: enviarAvisoGloria(telefono, tipo, params)
      POST {GLORIA_API_URL}/api/gloria/enviar  (header x-internal-token)
  → GlorIA: outbound.routes.ts → NotificationQueue → rentos.client.ts
  → RentOS: POST /internal/notificaciones/enviar → inserta en core."Notificaciones"
  → n8n (wf-notificaciones-worker-v6, cron cada 30 min):
      lee pendientes → construye el payload con la plantilla Meta → envía →
      confirma en RentOS
```

Tres tipos de aviso usan esta cadena hoy, con plantilla Meta propia cada uno
(pendientes de aprobación en Meta Business, ver `docs/auditoria/Plan_Accion_PilotOS_2026-08-11.md`):

| `tipo` | Cuándo se dispara | Parámetros |
|---|---|---|
| `mantenimiento_proximo` | Mantenimiento entra en un escalón de aviso (1000/500/250 km o 30 días) | `matricula`, `mantenimiento`, `motivo` |
| `mantenimiento_vencido` | Mantenimiento pasa de fecha/km sin resolverse | `matricula`, `mantenimiento`, `motivo` |
| `anomalia_taximetro` | El motor de comparación de acumulados detecta borrados/km/€ sin declarar (ver `ocrComparacion.service.ts`) | `matricula`, `motivo` |

**Requisitos para que llegue de verdad, ninguno verificable desde el repo:**
- `GLORIA_API_URL` y `GLORIA_INTERNAL_TOKEN` configurados en el entorno de PilotOS (Coolify) — sin ellos, `enviarAvisoGloria` no intenta la llamada (falla en silencio, deja constancia en `Aviso.error_envio`).
- Las tres plantillas aprobadas en Meta Business, con el idioma y los parámetros exactos de la tabla.
- El worker n8n con el JSON actualizado importado en la instancia real (el archivo del repo no es automáticamente lo que corre).

**Fuera de esta cadena, informativo:** el panel del patrón (`/admin`, widget "Alertas Pendientes") muestra las mismas anomalías críticas de forma pasiva, independiente de si el WhatsApp llegó o no — ver `POST /api/anomalias/:id/revisar`.

---

## 6. Modelo de tenencia

Cada registro en PilotOS pertenece a un patron (propietario de licencia). La cadena de propiedad es:

```
minos.Users (id, telefono, rol)
    │
    ▼
pilotos.clientes (patron_id → minos.Users.id)
    │
    ├── pilotos.vehiculos (cliente_id)
    ├── pilotos.conductores (cliente_id, usuario_id → minos.Users.id)
    ├── pilotos.configuracion_economica (cliente_id)
    └── pilotos.gastos_fijos (cliente_id)
```

El `cliente_id` es el tenant key de PilotOS. Todo query de datos operativos filtra por `cliente_id`.

---

## 7. Patrones NexOS aplicados

| Patron | Implementacion en PilotOS |
|--------|--------------------------|
| P-01 Event-driven | Toda mutacion registra evento en `ledger.Eventos` |
| P-02 Idempotencia | `dedupe_key` en eventos, unique constraints en partes |
| P-03 SSOT | PostgreSQL es la unica fuente de verdad |
| P-04 Soft deletes | `activo: false` en lugar de DELETE |
| P-06 Multi-tenant | `cliente_id` en todos los registros operativos |
| P-07 Fail fast | Validaciones al inicio, transacciones con rollback |
| P-08 Secrets en env | Sin fallbacks hardcodeados |
| P-09 IAs no improvisan | LucIA opera solo sobre lo documentado |

---

## 8. Clasificacion del codigo heredado

### Se reutiliza (alineado con arquitectura objetivo)
- `domain/rules/`, `domain/states/`, `domain/events/` — especificacion canonica, bien estructurada
- `agents/*/AGENT.md` — especificaciones de agentes, completas y utiles
- `services/ocr.service.ts` — logica de OCR funcional, se mantiene
- `prisma/seed.ts` — catalogo de mantenimientos correcto
- Logica de negocio en routes (validaciones R-PD-*, R-FT-*, etc.)

### Se refactoriza (buena base, necesita ajustes)
- `schema.prisma` — migrar de SQLite a PostgreSQL, añadir entidades faltantes, schema pilotos
- `routes/*.ts` — añadir PrismaClient singleton, transacciones, auth consistente
- `middleware/auth.ts` — eliminar JWT_SECRET hardcodeado, integrar con minos
- `services/storage.service.ts` — preparar para cloud storage futuro
- ~~`services/scheduler.service.ts` — migrar a n8n progresivamente~~ — **obsoleto (2026-08-11): se queda en node-cron, ver sección 5.1. No crear workflows n8n nuevos en PilotOS.**

### Se marca como legacy (no encaja, se sustituye)
- `services/whatsapp.service.ts` — PilotOS no envia WhatsApp directamente (decision confirmada)
- `services/gloria.router.ts` — duplica el router de GlorIA (ya existe en GlorIA/src/services/router.ts)
- `handlers/pilotos.handler.ts` — handler conversacional que deberia vivir en GlorIA, no en PilotOS
- `routes/webhook.routes.ts` — webhook de WhatsApp debe vivir en GlorIA
- `ConversacionContexto` (modelo Prisma) — el contexto conversacional vive en GlorIA

### Justificacion de cada eliminacion

**whatsapp.service.ts**: Decision confirmada — PilotOS no envia WhatsApp. Las notificaciones pasan por GlorIA + n8n. Mantener este servicio crearia un canal paralelo no alineado.

**gloria.router.ts**: El router multi-planeta ya existe en `GlorIA/src/services/router.ts` con la misma logica. Mantener una copia en PilotOS viola el principio de no duplicacion.

**pilotos.handler.ts**: Contiene logica conversacional (respuestas a intents, descarga de imagenes WhatsApp) que es responsabilidad de GlorIA/LucIA, no del backend de PilotOS. PilotOS expone endpoints API; GlorIA los consume.

**webhook.routes.ts**: El webhook de Meta debe ser un unico punto de entrada en GlorIA. PilotOS no debe recibir webhooks de WhatsApp directamente.

**ConversacionContexto**: El estado de conversacion es dominio de GlorIA. PilotOS no necesita esta tabla.

---

## 9. Estado Actual y Siguiente Fase (Marzo 2026)

**Estado actual:**
1. **Backend PilotOS**: Base de API y BD estructurada robustamente. Endpoints `/internal/` operativos.
2. **GlorIA (Frente 1 Finalizado)**: Integración de PilotOS/LucIA dinamizada correctamente sin fisuras en GlorIA. Emplea autenticación interna y fetch de contexo activo.
3. **Frontend PilotOS (Frente 2 Inicializado)**: El prototipo descartado y auditado (`app/src/app`). Propuesta formal de Arquitectura v2 (App Router, Shadcn, Dark Mode) generada en `frontend-v2-propuesta.md`.

**Siguiente Fase recomendada para Claude Code:**
1. Implementar formulario nuevo gasto (Phase 3 actual).
2. Crear detalle individual de parte y acciones reales de mantenimiento.
3. Mejorar experiencia móvil en Conductor y consolidar UX global.
