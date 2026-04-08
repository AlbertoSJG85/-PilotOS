# PilotOS — Frontend v2: Transicion y Estado

Fecha: 2026-03-09
Estado: Primera capa funcional implementada y compilable

---

## 1. Estado del frontend legacy

El frontend legacy (prototipo monolitico) fue retirado en una sesion anterior. Al iniciar esta fase, `PilotOS/app/` contenia unicamente el scaffold por defecto de `create-next-app` (Next.js 16.1.6). No habia codigo legacy que archivar — la limpieza ya se habia ejecutado.

> Nota: El plan original proponia mover a `app-legacy`, pero el codigo legacy ya no existia al comenzar esta fase. No fue necesario archivar.

---

## 2. Inventario tecnico pre-transicion

| Elemento | Estado | Accion |
|----------|--------|--------|
| `package.json` | Next 16.1.6, React 19, TW 4, TS 5 | Conservado, dependencias agregadas |
| `tsconfig.json` | Standard con paths `@/*` | Conservado sin cambios |
| `next.config.ts` | Vacio | Actualizado: `output: 'standalone'` |
| `postcss.config.mjs` | Tailwind v4 plugin | Conservado sin cambios |
| `eslint.config.mjs` | Next.js + TS rules | Conservado sin cambios |
| `.gitignore` | Standard Next.js | Conservado sin cambios |
| `public/*.svg` | Placeholders Next/Vercel | Eliminados |
| `src/app/page.tsx` | Default Next.js | Reemplazado: redirect a `/login` |
| `src/app/layout.tsx` | Generico | Reescrito: metadata PilotOS, dark mode, `lang="es"` |
| `src/app/globals.css` | Light mode | Reescrito: dark mode base, scrollbar custom |

---

## 3. Dependencias agregadas

| Paquete | Proposito |
|---------|-----------|
| `clsx` | Composicion de clases condicionales |
| `tailwind-merge` | Merge inteligente de clases Tailwind |
| `class-variance-authority` | Variantes de componentes UI (patron shadcn) |
| `lucide-react` | Iconos SVG consistentes |

---

## 4. Estructura actual

```text
PilotOS/app/src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx          ← Funcional (telefono-only, JWT)
│   │   └── onboarding/page.tsx     ← Funcional (wizard 6 pasos)
│   ├── (dashboard)/
│   │   ├── layout.tsx              ← Sidebar + AuthGuard
│   │   ├── admin/page.tsx          ← Dashboard patron (datos reales)
│   │   ├── driver/page.tsx         ← Dashboard conductor (datos reales)
│   │   ├── partes/page.tsx         ← Lista partes (datos reales)
│   │   ├── partes/nuevo/page.tsx   ← Wizard 5 pasos con fotos
│   │   ├── gastos/page.tsx         ← Variables + fijos (datos reales)
│   │   ├── flota/page.tsx          ← Vehiculos + conductores (datos reales)
│   │   ├── mantenimientos/page.tsx ← Por vehiculo (datos reales)
│   │   └── documentos/page.tsx     ← Estado documental (datos reales)
│   ├── layout.tsx                  ← Root: dark, lang="es", PilotOS metadata
│   ├── page.tsx                    ← Redirect a /login
│   └── globals.css                 ← Dark mode + scrollbar custom
├── components/
│   ├── ui/                         ← Primitivas reutilizables
│   │   ├── button.tsx, input.tsx, card.tsx, badge.tsx, skeleton.tsx, stat-card.tsx
│   │   └── index.ts
│   ├── layout/                     ← Estructurales
│   │   ├── sidebar.tsx, auth-guard.tsx, page-header.tsx
│   │   └── index.ts
│   └── features/
│       └── formulario-parte.tsx    ← Wizard 5 pasos con upload + validaciones
├── lib/
│   ├── api/
│   │   ├── fetcher.ts              ← Cliente HTTP con JWT auto
│   │   ├── auth.ts                 ← login(), getMe()
│   │   ├── partes.ts               ← getPartes(), crearParte()
│   │   ├── vehiculos.ts            ← getVehiculos(), getVehiculo()
│   │   ├── gastos.ts               ← getGastos(), getGastosResumen(), getGastosFijos(), crearGasto()
│   │   ├── mantenimientos.ts       ← getMantenimientosVehiculo(), getMantenimientosProximos()
│   │   ├── incidencias.ts          ← getIncidencias(), cerrarIncidencia()
│   │   ├── anomalias.ts            ← getAnomalias()
│   │   ├── onboarding.ts           ← guardarOnboarding(), completarOnboarding(), getOnboarding()
│   │   ├── upload.ts               ← uploadFoto() (multipart)
│   │   ├── fotos.ts                ← vincularFoto()
│   │   └── index.ts
│   ├── auth/
│   │   ├── session.ts              ← getToken, setSession, clearSession
│   │   └── index.ts
│   └── utils/
│       ├── cn.ts                   ← clsx + twMerge
│       ├── format.ts               ← formatCurrency, formatDate, formatKm
│       └── index.ts
└── types/
    ├── models.ts                   ← Tipos de dominio (alineados con backend real)
    ├── api.ts                      ← ApiResponse, LoginResponse, MeResponse, GastosResponse
    └── index.ts
```

---

## 5. Estado de conexion con backend

| Capa | Estado | Detalle |
|------|--------|---------|
| `lib/api/fetcher.ts` | Conectado | Apunta a `NEXT_PUBLIC_API_URL` (default `localhost:3001`) |
| `lib/api/auth.ts` | Conectado | `POST /api/auth/login` (telefono-only), `GET /api/auth/me` |
| `lib/api/partes.ts` | Conectado | `GET /api/partes` (con filtros), `POST /api/partes` (con conductor_id) |
| `lib/api/vehiculos.ts` | Conectado | `GET /api/vehiculos`, `GET /api/vehiculos/:id` |
| `lib/api/gastos.ts` | Conectado | `GET /api/gastos`, `GET /api/gastos/resumen`, `GET /api/gastos/fijos`, `POST /api/gastos` |
| `lib/api/mantenimientos.ts` | Conectado | `GET /api/mantenimientos/vehiculo/:id`, `GET .../proximos` |
| `lib/api/incidencias.ts` | Conectado | `GET /api/incidencias`, `PATCH /api/incidencias/:id/cerrar` |
| `lib/api/anomalias.ts` | Conectado | `GET /api/anomalias` |
| `lib/api/onboarding.ts` | Conectado | `POST /api/onboarding`, `POST .../completar`, `GET .../` |
| `lib/api/upload.ts` | Conectado | `POST /api/upload` (multipart, campo `foto`) |
| `lib/api/fotos.ts` | Conectado | `POST /api/fotos` (vincular a parte) |
| Middleware Auth | Funcional | `src/middleware.ts` Server-side (Rutas `/admin`, `/driver`) |
| Login page | Funcional | Telefono-only, mapea context en cookies + localStorage |
| Onboarding | Funcional | Wizard 6 pasos, guarda draft por paso, completa en transaccion |
| Admin dashboard | Funcional | Datos reales: partes, gastos, vehiculos, anomalias |
| Driver dashboard | Funcional | Datos reales: partes filtrados por conductor, vehiculo asignado |
| Partes lista | Funcional | Listado con estados, conductores, calculos |
| Partes nuevo | Funcional | Wizard 5 pasos, upload fotos, validaciones PilotOS_Master |
| Gastos | Funcional | Tabs variables/fijos, resumen total |
| Flota | Funcional | Vehiculos + conductores desde getMe() |
| Mantenimientos | Funcional | Selector vehiculo, pendientes/resueltos |
| Documentos | Funcional | Estado documental de partes, alertas foto ilegible |

---

## 6. Estado Final de la Transición (Fase Funcional)

Todos los bloques marcados como pendientes en fases iniciales han sido completados e integrados exitosamente con el backend:

- **Auth/Middleware:** Rutas blindadas vía session cookie & JWT.
- **Period Filter:** Dashboards y vistas consumen `?desde=&hasta=` conectados la API real (SSR SearchParams).
- **Nuevo Gasto:** Integración activa del wizard para registrar gastos operativos vinculados a vehículos.
- **Detalle Parte:** Vista granular (`/partes/[id]`) funcional con desglose económico.
- **Mantenimientos:** Flujo resolutivo activado para marcar tareas vencidas como completadas aportando factura/KMs.
- **Mobile UX:** Botones táctiles extendidos y formularios reajustados para iOS/Android en las vistas prioritarias (`/partes/nuevo`, inputs, etc).

Con estas implementaciones, la arquitectura v2 (App Router) pasa de ser una propuesta a ser el **Front-end en producción/Main** de PilotOS.

---

## 7. Hitós Finales CORE (PilotOS Master) — 2026-03-09

Durante la segunda fase de ejecución automatizada, se consolidó toda la capa ejecutiva y operativa:

1. **Informes y Cierres (Backend-less Reports):** 
   - Ante la ausencia de una ruta real de `CierrePeriodo` y generación de PDFs nativa, el cálculo se implementó al vuelo en el _Frontend_ cruzando `/api/partes`, `/api/gastos` y `/api/gastos/fijos` apoyados en los `SearchParams` (`?desde=&hasta=`).
   - Botón de inminente exportación PDF documentado como bloqueado estructuralmente para futuras releases.
2. **Dashboard C-Suite (Ejecutiva Patrón):**
   - Panel `/admin` reconstruido priorizando KPIs rápidos: Ingreso Bruto, Neto, Alertas Pendientes, y Mantenimientos próximos (vehículo por vehículo consumido).
3. **Detalles Financieros Pulidos:**
   - La vista `/partes/[id]` enlaza correctamente los Tíckets subidos en OCR a su URL correcta pre-firmada.
   - Creación de Gasto totalmente ligada en formulario simple conectado a `POST /api/gastos`.
4. **Mobile UX Driver:**
   - Implementado un "Floating Action Button" persistente en el entorno del conductor.
   - Todos los "Touch Targets" de los steps móviles del Formulario de Partes crecieron de h-12 a h-14 (con íconos XL) evitando el _fat-finger issue_.

El entorno está validado, purgado de deudas de UI heredada, y alineado con los principios monolíticos estructurados de NexOS.
