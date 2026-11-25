# PilotOS

Gestión para taxistas autónomos y pequeñas flotas: parte diario, gastos, fotos de tickets y documentos (con lectura automática), mantenimientos e ITV, asalariados y liquidaciones, y un panel para el patrón. Producto del ecosistema NexOS; la parte de cobro, planes y acceso la decide **NexOS Pay**.

## Estado (2026-11-25)

En producción en `https://pilotos.nexostudios.digital` (app) y `https://api.pilotos.nexostudios.digital` (API), con clientes reales.

- **Tarifa** (la decide Pay): 5,99 €/mes con 30 días de prueba, + 2 € por asalariado y + 3 € por vehículo adicional. Últimos 5 días de prueba: cuenta atrás; al acabar sin contratar, solo «Reactivar PilotOS». Se contrata con tarjeta en la página «Contratar» de Pay.
- **Asociaciones partner**: entran en `/partners` (botón en `/login`) a ver sus socios y comisiones.
- **Estado exacto de cobros y versiones desplegadas**: en NexOS Pay, `docs/operacion/estado-cobros-produccion.md`.

## Qué leer según lo que vayas a hacer

| Tarea | Empieza por |
|---|---|
| Por qué algo es como es | `docs/decisiones/decisiones-tecnicas.md` (DT-001…; las últimas al final) |
| Errores ya cometidos | `docs/learning/correcciones.md` y `docs/learning/*` (seguridad PIL-01 a PIL-04) |
| Desplegar | `DEPLOY_COOLIFY.md` |
| Qué es el producto y para quién | `docs/producto/PilotOS_Master.md` |
| Reglas del dominio (partes, fotos, anomalías…) | `domain/` y `agents/*/AGENT.md`: **anteriores al código actual**, contrastar siempre con el código |

Si un documento contradice al código o a producción, manda el código y se corrige el documento en el mismo cambio.

## Arrancar en local

Requisitos: Node 20 y un PostgreSQL **local** (p. ej. en Docker). Nunca contra la base de producción.

```bash
# Backend (http://localhost:3001)
cd backend
npm install
cp .env.example .env      # DATABASE_URL local (?schema=pilotos), JWT_SECRET, ALLOWED_ORIGINS=http://localhost:3000,
                          # SESSION_COOKIE_INSECURE=true (sin https en local); NEXOS_PAY_* solo si hay un Pay local
npx prisma migrate deploy # crea el schema en una base vacía
npm run dev

# App (http://localhost:3000; llama al backend por el proxy de Next)
cd app
npm install
npm run dev               # API_URL=http://localhost:3001 por defecto
```

**Pruebas del backend:** `cd backend && npm test` (vitest, sin base de datos ni red: todo simulado). **Typecheck:** `npx tsc --noEmit` en `backend` y en `app`.

## Estructura

```
backend/   Express + Prisma (schema pilotos). src/routes, src/services, src/lib, prisma/migrations
app/       Next.js (App Router). src/app (rutas), src/components, src/lib/api
docs/      decisiones, learning, producto, arquitectura, auditoria
domain/, agents/   especificaciones de dominio de la primera etapa (ver la tabla de arriba)
app-legacy/        prototipo antiguo, sin uso
```

**El repositorio es público**: nada de claves, nombres de clientes ni matrículas reales en código, documentos o commits.
