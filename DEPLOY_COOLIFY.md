# Despliegue de PilotOS en Coolify

Guía de referencia para desplegar PilotOS (backend + frontend) en Coolify.

---

## 1. Preparación en Coolify

1. Accede al panel de Coolify.
2. Crea un **Project** (ej: `PilotOS`) con un entorno **Production**.

---

## 2. Base de Datos (PostgreSQL compartida NexOS)

PilotOS usa la BD compartida `nexos` con el schema `pilotos.*`.

La `DATABASE_URL` debe apuntar a la instancia PostgreSQL de Contabo:

```
postgresql://USER:PASSWORD@161.97.108.106:5433/nexos?schema=pilotos
```

No crees una BD separada para PilotOS — usa la compartida del ecosistema (DT-002).

---

## 3. Despliegue del Backend

1. En Coolify: **Application** → **Public Repository**.
2. **Build Pack**: `Dockerfile`.
3. **Docker Context**: `backend`.
4. **Dockerfile Location**: `Dockerfile`.
5. **Variables de Entorno** (obligatorias):

| Variable | Valor / Descripción |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL (ver arriba) |
| `PORT` | `3001` |
| `JWT_SECRET` | Secret seguro (mínimo 32 chars, nunca hardcodeado) |
| `INTERNAL_API_TOKEN` | Token compartido con GlorIA para `/internal/*` |
| `PUBLIC_BASE_URL` | URL pública del backend, ej: `https://api.pilotos.app` (sin barra final). Necesario para que las URLs de /uploads sean HTTPS. |
| `ALLOWED_ORIGINS` | URL del frontend, ej: `https://pilotos.app` |
| `NODE_ENV` | `production` |

6. **Volume** (imprescindible para persistir fotos):

```
pilotos-uploads:/app/uploads
```

Sin este volumen, las fotos se pierden al reiniciar el contenedor.

7. **URLs**: configura tu dominio (ej: `https://api.pilotos.app`).
8. **Deploy**.

> Tras el primer despliegue, desde la terminal del contenedor ejecuta:
> ```
> npm run prod:setup
> ```
> Esto aplica `prisma db push` y carga el catálogo de mantenimientos.

---

## 4. Migraciones de BD (cambios incrementales)

Cuando el schema Prisma cambia de forma aditiva (nuevas columnas), hay dos opciones:

### Opción A — `prisma db push` (recomendada para cambios pequeños)

Desde la terminal del contenedor en Coolify:

```bash
npx prisma db push
```

### Opción B — SQL manual

Si `prisma db push` no está disponible, aplicar el fichero:

```
backend/prisma/migrations_pendientes.sql
```

Desde psql o la terminal del contenedor:

```bash
psql $DATABASE_URL -f /app/prisma/migrations_pendientes.sql
```

**Pendiente de aplicar en producción (2026-05-05):**

```sql
-- Campos OCR en documentos
ALTER TABLE pilotos.documentos
  ADD COLUMN IF NOT EXISTS ocr_error   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS estado_ocr  VARCHAR(50) DEFAULT 'PENDIENTE';

-- Trazabilidad en anomalías
ALTER TABLE pilotos.anomalias
  ADD COLUMN IF NOT EXISTS parte_diario_id UUID,
  ADD COLUMN IF NOT EXISTS documento_id    UUID,
  ADD COLUMN IF NOT EXISTS estado         VARCHAR(50) NOT NULL DEFAULT 'ACTIVA';
```

---

## 5. Despliegue del Frontend

1. En Coolify: **Application** → **Public Repository**.
2. **Build Pack**: `Dockerfile`.
3. **Docker Context**: `app`.
4. **Dockerfile Location**: `Dockerfile`.
5. **Variables de Entorno**:

| Variable | Valor / Descripción |
|---|---|
| `API_URL` | URL interna del backend (usada en rewrites de Next.js), ej: `http://backend:3001` |
| `NEXT_PUBLIC_API_URL` | Dejar vacío (`''`) en producción — las llamadas van por el proxy de Next.js |
| `NEXT_PUBLIC_BACKEND_URL` | URL pública del backend (usada en links directos si los hay), ej: `https://api.pilotos.app` |

> **Nota sobre variables de entorno en Next.js:**
> - `API_URL` → solo servidor (rewrites en `next.config.ts`).
> - `NEXT_PUBLIC_*` → inyectadas en el bundle del navegador.
> - Mantener `NEXT_PUBLIC_API_URL=''` en producción para que las llamadas API pasen por el proxy de Next.js y evitar problemas de CORS.

6. **URLs**: configura tu dominio (ej: `https://pilotos.app`).
7. **Deploy**.

---

## 6. Primeros Pasos (Base de Datos Limpia)

1. Abre `https://pilotos.app/onboarding`.
2. Completa el asistente (patrón, vehículo, configuración económica).
3. El sistema crea automáticamente el Usuario, Cliente, Conductor y Vehículo.

---

## 7. Notas de Arquitectura

- El backend sirve `/uploads/*` como ficheros estáticos. Con el volumen `pilotos-uploads:/app/uploads` los ficheros persisten entre deploys.
- `PUBLIC_BASE_URL` evita el problema de `req.protocol = 'http'` detrás del proxy HTTPS de Coolify. Si no se define, `app.set('trust proxy', true)` en `index.ts` intenta reconstruir la URL correcta, pero es más fiable usar la variable explícita.
- El token interno `INTERNAL_API_TOKEN` debe coincidir en PilotOS y en GlorIA.
- `minos.Users` y `ledger.Eventos` son tablas compartidas con RentOS y otros productos — nunca borrar en scripts de reset de PilotOS (C-023).
