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

n8n (orquestacion)
  └── Workflows para avisos, scheduling, notificaciones
```

PilotOS NO envia mensajes WhatsApp directamente. Toda comunicacion al usuario pasa por GlorIA + n8n.

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
| Scheduling | n8n (objetivo), node-cron (transitorio) | Avisos y vencimientos |
| Mensajeria | GlorIA + n8n | PilotOS no envia WhatsApp directamente |

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
- `services/scheduler.service.ts` — migrar a n8n progresivamente

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
