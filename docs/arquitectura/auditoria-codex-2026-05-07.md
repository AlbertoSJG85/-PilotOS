# Auditoria tecnica PilotOS - 2026-05-07

Alcance: revision estatica del repositorio sin modificar codigo. Se revisaron backend Express/Prisma, frontend Next, despliegue Docker/Coolify, persistencia, autenticacion/autorizacion y verificaciones locales.

## Resumen ejecutivo

El proyecto tiene una base funcional y bastante documentada, pero presenta lagunas importantes antes de considerarlo listo para produccion: autenticacion muy debil por telefono, varios endpoints con riesgo de acceso o modificacion cross-tenant, lint del frontend roto, ausencia de tests automatizados y algunos artefactos/archivos de entorno que conviene limpiar o reforzar.

Prioridad recomendada:

1. Cerrar autenticacion y autorizacion multi-tenant.
2. Corregir endpoints sensibles que actualizan por `id` sin validar `cliente_id`.
3. Hacer que lint/build formen parte obligatoria del pipeline.
4. Anadir tests de seguridad/tenancy para rutas criticas.
5. Revisar higiene de repo: `dev.db`, `ts_errors.txt`, `.env` locales y migraciones manuales.

## Hallazgos criticos

### 1. Login sin segundo factor ni password

Referencia: `backend/src/routes/auth.routes.ts:15`, `backend/src/routes/auth.routes.ts:17`, `backend/src/routes/auth.routes.ts:54`.

`POST /api/auth/login` acepta solo `telefono`, busca el usuario y emite un JWT. No hay password, OTP, magic link, PIN ni verificacion externa. Cualquier persona que conozca o adivine un telefono registrado podria obtener token.

Impacto: toma completa de cuenta, acceso a datos de flota, partes, gastos, fotos y operaciones de gestion.

Recomendacion: introducir OTP por WhatsApp/SMS/email o PIN con hash, rate limiting por telefono/IP y bloqueo temporal. No emitir JWT solo por existencia del telefono.

### 2. Autorizacion multi-tenant incompleta en endpoints de detalle y modificacion

Referencias principales:

- `backend/src/routes/vehiculo.routes.ts:23`, `backend/src/routes/vehiculo.routes.ts:54`, `backend/src/routes/vehiculo.routes.ts:75`.
- `backend/src/routes/usuario.routes.ts:28`, `backend/src/routes/usuario.routes.ts:113`.
- `backend/src/routes/gasto.routes.ts:103`, `backend/src/routes/gasto.routes.ts:113`, `backend/src/routes/gasto.routes.ts:116`.
- `backend/src/routes/parteDiario.routes.ts:421`, `backend/src/routes/parteDiario.routes.ts:428`.
- `backend/src/routes/mantenimiento.routes.ts:45`, `backend/src/routes/mantenimiento.routes.ts:53`, `backend/src/routes/mantenimiento.routes.ts:86`, `backend/src/routes/mantenimiento.routes.ts:101`.
- `backend/src/routes/incidencia.routes.ts:64`, `backend/src/routes/incidencia.routes.ts:75`.

Hay listados que filtran por `req.usuario.cliente_id`, pero varias rutas de detalle o update operan directamente con `id` recibido por URL. En un sistema multi-cliente, eso permite IDOR si un usuario autenticado obtiene IDs ajenos.

Impacto: lectura/modificacion de vehiculos, conductores, gastos fijos, mantenimientos, incidencias o estado de partes de otros clientes.

Recomendacion: centralizar helpers tipo `assertSameTenant` y usar `where` compuestos o comprobacion previa con `cliente_id` en todas las rutas por ID. Los endpoints de escritura de gestion deberian requerir patron/admin cuando proceda.

### 3. Rutas de creacion permiten asociar entidades ajenas por ID

Referencias:

- `backend/src/routes/parteDiario.routes.ts:61`, crea partes con `vehiculo_id` y `conductor_id` del body.
- `backend/src/routes/usuario.routes.ts:47`, crea conductor y opcionalmente asigna `vehiculo_id` del body.
- `backend/src/routes/gasto.routes.ts:8`, crea gasto con `vehiculo_id` del body.
- `backend/src/routes/anomalia.routes.ts:12`, crea anomalia con `conductor_id` del body.

En estas rutas no se ve una validacion consistente de que los IDs pertenezcan al `cliente_id` del usuario autenticado.

Impacto: contaminacion de datos entre clientes, ledger incorrecto, avisos a patron equivocado y manipulacion de metricas.

Recomendacion: antes de crear, cargar vehiculo/conductor por ID y comprobar pertenencia al tenant. Para asalariados, limitar `conductor_id` al propio `req.usuario.conductor_id`.

## Hallazgos altos

### 4. La proteccion del frontend se basa en datos manipulables por el cliente

Referencias: `app/src/middleware.ts:7`, `app/src/middleware.ts:8`, `app/src/middleware.ts:52`, `app/src/lib/auth/session.ts:42`, `app/src/lib/auth/session.ts:43`.

Next middleware decide acceso a `/admin` usando cookies legibles/escribibles desde JS (`pilotos_es_patron=true`). El backend sigue siendo la barrera real, pero el frontend puede mostrar pantallas de patron a usuarios que manipulen cookies/localStorage.

Impacto: exposicion de UI y posibles llamadas a endpoints que no aplican `requirePatron` correctamente.

Recomendacion: mover la decision de rol a backend o verificar JWT firmado en middleware. Como minimo, no confiar en `pilotos_es_patron` como fuente de verdad.

### 5. Uploads publicos sin control de acceso

Referencia: `backend/src/index.ts:75`.

`/uploads` se sirve como estatico publico. Las URLs son dificiles de adivinar, pero no hay autorizacion por documento/cliente.

Impacto: si una URL se filtra, cualquiera puede ver tickets/facturas. Ademas se pierde control de revocacion.

Recomendacion: servir documentos mediante endpoint autenticado que valide tenant, o usar URLs firmadas/expirables. Separar almacenamiento privado de URL publica.

### 6. Manejo global de errores fatales mantiene el proceso vivo

Referencias: `backend/src/index.ts:112`, `backend/src/index.ts:117`.

`uncaughtException` y `unhandledRejection` loguean pero no terminan el proceso. Esto evita caidas visibles, pero puede dejar el servidor en estado inconsistente.

Impacto: errores silenciosos, transacciones o servicios en estado corrupto y observabilidad pobre.

Recomendacion: para produccion, registrar el error y terminar el proceso para que el supervisor reinicie. Si hay jobs en background, aislarlos con manejo local.

### 7. CORS abierto por defecto si falta `ALLOWED_ORIGINS`

Referencias: `backend/src/index.ts:49`, `backend/src/index.ts:52`.

Si no se define `ALLOWED_ORIGINS`, el backend permite todos los origenes con credenciales habilitadas.

Impacto: configuracion insegura por omision en entornos no controlados.

Recomendacion: en `production`, fallar arranque si `ALLOWED_ORIGINS` no esta definido. Mantener wildcard solo en desarrollo.

## Calidad, build y mantenibilidad

### 8. `npm run lint` del frontend falla

Comando ejecutado: `npm run lint` en `app`.

Resultado: 53 problemas, 39 errores y 14 warnings. Los errores se concentran en `no-explicit-any` y `react-hooks/set-state-in-effect`.

Archivos destacados:

- `app/src/app/(dashboard)/flota/page.tsx`
- `app/src/app/(dashboard)/partes/[id]/page.tsx`
- `app/src/components/layout/auth-guard.tsx`
- `app/src/lib/api/fetcher.ts`
- `app/src/lib/api/usuarios.ts`
- `app/src/types/models.ts`

Impacto: pipeline de calidad roto; si el despliegue exige lint, bloquea release. Si no lo exige, se acumula deuda.

### 9. TypeScript pasa, pero existe `backend/ts_errors.txt` obsoleto

Comandos ejecutados:

- `npm exec tsc -- --noEmit` en `backend`: OK.
- `npm exec tsc -- --noEmit` en `app`: OK.

Sin embargo, `backend/ts_errors.txt` contiene errores antiguos sobre `scheduler.service.ts`. Esto puede confundir auditorias y despliegues manuales.

Recomendacion: eliminar o regenerar ese archivo como artefacto no versionado.

### 10. No hay tests automatizados detectables

Busqueda de archivos `test/spec/jest/vitest/playwright`: no aparecen suites de test, solo `backend/src/scripts/inspect_last_ocr.ts`.

Impacto: los riesgos de autenticacion, tenancy y calculo economico no tienen red de seguridad.

Recomendacion minima:

- Tests API para login, permisos patron/asalariado y cross-tenant.
- Tests de reglas de parte diario: km, duplicados, borrador, confirmacion con fotos.
- Tests de calculo de reparto y gastos.

### 11. `backend/prisma/dev.db` esta versionado

`git ls-files backend/.env app/.env.local backend/prisma/dev.db` devuelve `backend/prisma/dev.db`. Los `.env` locales no aparecen versionados, correcto.

Impacto: artefacto de base de datos local dentro del repo, posible deriva o datos residuales. Ademas `.gitignore` ignora `db/dev.db`, pero no `backend/prisma/dev.db`.

Recomendacion: sacar `backend/prisma/dev.db` del control de versiones si no es imprescindible y ajustar `.gitignore`.

### 12. Migraciones productivas fuera del flujo Prisma normal

Referencias: `backend/scripts/apply-pending-sql.js`, `backend/prisma/migrations_pendientes.sql`, `DEPLOY_COOLIFY.md`.

El deploy aplica un SQL idempotente manual en cada arranque. Es pragmatico, pero no deja historial formal tipo Prisma Migrate.

Impacto: dificil auditar orden de cambios, rollback y drift entre schema Prisma y base real.

Recomendacion: mantener este mecanismo solo como puente temporal. Para produccion, migraciones versionadas y revisadas con Prisma Migrate o un sistema equivalente.

## Riesgos medios y observaciones

### 13. Cookies y token en `localStorage`

Referencias: `app/src/lib/auth/session.ts:36`, `app/src/lib/auth/session.ts:42`.

El token se guarda en `localStorage` y tambien en cookie no `HttpOnly`. Cualquier XSS podria robarlo.

Recomendacion: cookie `HttpOnly`, `Secure`, `SameSite=Lax/Strict` gestionada por backend, o endurecer CSP y reducir superficie XSS.

### 14. Falta limite explicito al JSON body

Referencia: `backend/src/index.ts:53`.

`express.json()` usa limite por defecto. Puede ser suficiente, pero conviene definirlo explicitamente y separar upload binario de JSON.

Recomendacion: `express.json({ limit: '1mb' })` o limite acorde al dominio.

### 15. Catalogo de rutas publicas a revisar

Referencias:

- `backend/src/routes/mantenimiento.routes.ts:7`, catalogo publico.
- `backend/src/routes/anomalia.routes.ts:75`, total de anomalias por conductor publico.
- `backend/src/routes/onboarding.routes.ts`, endpoints publicos de onboarding.

No todo endpoint publico es incorrecto, pero conviene documentar cuales son publicos por diseno y que informacion exponen.

## Verificaciones realizadas

- Inventario de archivos con `rg --files`.
- Revision de `package.json`, Dockerfiles, `next.config.ts`, middlewares, rutas principales y Prisma schema.
- `npm exec tsc -- --noEmit` en `backend`: OK.
- `npm exec tsc -- --noEmit` en `app`: OK.
- `npm run lint` en `app`: FAIL, 53 problemas.
- `git status --short`: sin cambios al momento de revisar.
- `git ls-files backend/.env app/.env.local backend/prisma/dev.db`: solo aparece versionado `backend/prisma/dev.db`.

## Plan de remediacion sugerido

Semana 1:

1. Sustituir login por OTP/PIN y rate limiting.
2. Corregir todos los endpoints por ID para validar tenant.
3. Proteger uploads o hacer URLs firmadas.
4. Hacer fallar backend en produccion si faltan `JWT_SECRET`, `INTERNAL_API_TOKEN` y `ALLOWED_ORIGINS`.

Semana 2:

1. Anadir tests API de permisos y cross-tenant.
2. Limpiar lint hasta dejar `npm run lint` en verde.
3. Sacar `backend/prisma/dev.db` del repo.
4. Formalizar migraciones.

Semana 3:

1. Revisar observabilidad: logs estructurados, health real de DB, errores fatales con restart.
2. Revisar CSP/cookies/token storage.
3. Documentar matriz de permisos por rol y endpoint.
