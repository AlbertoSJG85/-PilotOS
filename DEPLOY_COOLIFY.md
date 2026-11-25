# Despliegue de PilotOS (Coolify)

Revisado: 2026-11-25. Desplegar necesita autorización expresa de Alberto para esa acción.

## Qué hay en producción

| Pieza | Coolify | Dominio | Origen |
|---|---|---|---|
| Backend (Express + Prisma) | app 1, contexto `backend`, `Dockerfile` | `api.pilotos.nexostudios.digital` (puerto 3001) | rama `main` |
| App (Next.js) | app 5, contexto `app`, `Dockerfile` | `pilotos.nexostudios.digital` (puerto 3000) | rama `main` |

Base de datos: la compartida `nexos`, schema `pilotos` (y tablas compartidas `minos.Users`, `ledger.Eventos`: nunca borrarlas desde PilotOS). Las fotos viven en el volumen `pilotos-uploads:/app/uploads` del backend: sin él se pierden al reiniciar.

## Cómo se despliega

1. Fusionar en `main` y subir.
2. Lanzar el despliegue de las apps 1 y 5 (desde el panel de Coolify o con `queue_application_deployment` por tinker). Comprobar que ambas terminan en el commit nuevo.
3. **Migraciones:** el backend arranca con `npm run start:prod` = `prisma migrate deploy` + servidor. Una migración se aplica sola al desplegar: tiene que ser aditiva y tener vuelta atrás. Si falla, el backend no arranca.
4. Antes de una migración o un cambio delicado: copia del schema (`pg_dump -n pilotos -n minos`) en `/root/backups/`.
5. Comprobar: `/login` y `/partners` responden, el backend contesta `401` en `/api/partners/panel` sin sesión, y los logs no tienen errores.

**Nunca** `prisma db push` ni `npm run prod:setup` contra producción: saltan el historial de migraciones.

Nueva migración: editar `backend/prisma/schema.prisma`, `npx prisma migrate dev --name <descripcion>` en local y subir la carpeta generada junto al cambio.

## Variables

**Backend (app 1)**

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Base `nexos`, `?schema=pilotos` |
| `PORT` | `3001` |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Firma de sesiones (taxistas; la de partners se deriva de ella) |
| `ALLOWED_ORIGINS` | Orígenes permitidos (CORS y comprobación de `Origin`) |
| `INTERNAL_API_TOKEN`, `HERMES_INTERNAL_TOKEN`, `HERMES_CLIENTE_ID`, `LUCIA_INTERNAL_TOKEN` | Rutas `/internal/*` (GlorIA, Hermes, LucIA) |
| `GLORIA_API_URL`, `GLORIA_INTERNAL_TOKEN` | Avisos por GlorIA (`N8N_WEBHOOK_URL` sigue puesta en Coolify, pero el código actual no la usa) |
| `NEXOS_PAY_ENABLED`, `NEXOS_PAY_URL`, `NEXOS_PAY_INTERNAL_TOKEN` | Conexión con NexOS Pay |
| `NEXOS_PAY_PLAN_DEFECTO`, `NEXOS_PAY_PLAN_PRO` | Plan de las altas nuevas: `pilotos_taxi` |
| `NEXOS_PAY_EXENCION` | Exención de las altas (`fase_prueba`) |
| `NEXOS_PAY_ENFORCE_ACCESS` | `true`: corte al acabar la prueba sin contratar (Pay ADR-0020) |
| `NEXOS_PAY_ENFORCE_PLAN_GATES` | Límites por plan (sin poner) |
| `SMTP_URL`, `EMAIL_REMITENTE` | Correo desde info@ (bienvenidas, códigos, partners) |
| `OPENAI_API_KEY`, `OCR_VISION_*` | Lectura de tickets y documentos |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DRIVE_REDIRECT_URI`, `DRIVE_ENCRYPTION_KEY` | Google Drive del patrón |
| `APP_URL` | Opcional; por defecto `https://pilotos.nexostudios.digital` (enlaces de los correos) |
| `SESSION_COOKIE_INSECURE`, `SESSION_ACEPTA_BEARER` | Solo para desarrollo local; en producción sin poner |

**App (app 5):** `API_URL=https://api.pilotos.nexostudios.digital` (destino del proxy de Next: el navegador llama a `/api/*` en el propio dominio) y `NEXT_PUBLIC_API_URL` vacía.

Las claves se ponen en Coolify (por tinker, sin mostrarlas) y no se escriben en el repositorio, que es **público**.

## Detalles que importan

- El proxy de Next sale a `api.pilotos…` y vuelve a entrar por Traefik: el backend ve la IP del propio servidor en las peticiones de la app. Por eso el límite de intentos va por IP **y cuenta** y `trust proxy` solo confía en la red interna (DT-042).
- Las sesiones van en cookie `HttpOnly` (`pilotos_token` para taxistas, `pilotos_partner` para asociaciones).
