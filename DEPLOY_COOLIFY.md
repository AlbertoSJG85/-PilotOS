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

## 4. Migraciones de BD (automáticas en cada deploy)

El backend aplica `prisma/migrations_pendientes.sql` automáticamente al arrancar en producción.

**No hay que hacer nada manual.** Al hacer deploy del backend en Coolify:

1. El contenedor arranca con `npm run start:prod`.
2. `start:prod` ejecuta `db:deploy` antes de iniciar el servidor.
3. `db:deploy` comprueba si existe `prisma/migrations_pendientes.sql`:
   - Si existe → lo aplica con `prisma db execute` y loguea el resultado.
   - Si no existe → continúa sin hacer nada.
4. Si la migración falla → el deploy falla con error claro. El servidor no arranca.

**El SQL en `migrations_pendientes.sql` debe ser siempre idempotente:**
- Usar `ADD COLUMN IF NOT EXISTS`
- Usar `CREATE INDEX IF NOT EXISTS`
- Nunca incluir DROP, DELETE o ALTER destructivos sin avisar

**Para añadir una migración futura:**
1. Añadir el SQL a `backend/prisma/migrations_pendientes.sql`.
2. Hacer commit y push a main.
3. Coolify despliega automáticamente → el SQL se aplica solo.

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
