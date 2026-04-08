# PilotOS — Propuesta de Arquitectura Frontend v2

## 1. Clasificación final del frontend actual
Tras auditar el código en `PilotOS/app/`, se confirma lo indicado en `auditoria-frontend.md`:
- **Es un prototipo monolítico descartable.** Páginas como `dashboard/page.tsx` mezclan UI, estado (`useState`), ciclo de vida (`useEffect`) y fetch directo al backend (`apiFetch`) dentro de un único gran _Client Component_.
- **No hay separación de responsabilidades.** Faltan carpetas como `components`, `hooks` o gestión de layouts robusta.
- **Conclusión:** Ningún archivo `.tsx` debe preservarse "tal cual". Servirán únicamente como referencia visual y funcional.

---

## 2. Árbol de carpetas propuesto para la nueva base frontend

La nueva estructura seguirá las mejores prácticas del App Router de Next.js.

```text
PilotOS/app/                  # RECONSTRUCCIÓN DIRIGIDA
├── app/                      
│   ├── (auth)/               # Rutas sin layout principal (Login, Onboarding)
│   │   ├── login/
│   │   └── onboarding/
│   ├── (dashboard)/          # Rutas con Layout autenticado (Sidebar, Header)
│   │   ├── admin/            # Dashboard exclusivo Patrón
│   │   ├── driver/           # Dashboard exclusivo Asalariado
│   │   ├── partes/           # Formularios y Listados
│   │   ├── flota/            # Gestión de vehículos y conductores
│   │   ├── gastos/           
│   │   └── documentos/
│   ├── layout.tsx            
│   └── globals.css           
│
├── components/               
│   ├── ui/                   # Primitivas reutilizables (Botones, Inputs) -> base shadcn/ui
│   ├── layout/               # Componentes estructurales (Sidebar, Navbar)
│   └── features/             # Componentes de negocio que combinan UI + Datos (ej: FormularioParte)
│
├── lib/                      
│   ├── api/                  # Capa de fetch tipada contra PilotOS Backend Express
│   │   ├── fetcher.ts        # Cliente base inyectando JWT
│   │   └── partes.ts         
│   ├── utils.ts              # Utilidades genéricas (twMerge, clsx)
│   └── auth/                 # Utilidades de sesión (validar JWT client-side/server-side)
│
└── types/                    # Tipado global de interfaces
    ├── models.ts             
    └── api.ts                
```

---

## 3. Criterio de separación entre Server y Client Components

El paradigma principal es **Server-First (RSC)**:

1. **Server Components (Por defecto en `app/`)**:
   - Usar en páginas principales (ej. `app/(dashboard)/admin/page.tsx`).
   - El fetch principal de datos (queries a nuestra API Express) ocurre en el servidor antes del renderizado, protegiendo peticiones e inyectando JWT.
   - Pasan datos limpios como `props` a los componentes clientes.

2. **Client Components (`'use client'`)**:
   - Limitados a los **hojas (leaf nodes)** del árbol de componentes donde haya interactividad real.
   - Ejemplos obligatorios: `FormularioParte` (maneja estado de validación y fotos), `GraficaIngresos` (recharts/interactividad visual).

---

## 4. Propuesta de components y lib/api

### `components/ui`
Elementos tontos, agnósticos al negocio.
- **Base recomendada**: `shadcn/ui` sobre TailwindCSS.

### `components/features`
Componentes conectados a reglas de PilotOS.
- **Ejemplos**: `BotonSubirTicketOcr`, `ResumenDashboardStats`, `FormularioGasto`.

### `lib/api`
Abstracción estricta contra el backend de PilotOS (`http://localhost:3001/api/*`).
- El frontend no usa Prisma ni habla con PostgreSQL. Usa las rutas protegidas existentes en el backend.

---

## 5. Navegación y vistas clave por rol

La entrada principal es `/login` o redirigirá ahí si no hay sesión. 
Un *Middleware* de Next.js o Server Component verificará el Rol desde el token JWT.

### Vistas clave Asalariado
1. **`/driver`**: Dashboard personal. Sus ingresos, últimos partes, avisos de ITVs de su vehículo.
2. **`/driver/partes/crear`**: Wizard/Flow para crear un parte. Diseñado estrictamente para **Mobile-First**, con botones grandes y subida rápida desde la cámara.

### Vistas clave Patrón
1. **`/admin`**: Dashboard maestro. Consolidado de facturación, combustible, beneficio neto real (según configuración económica vigente).
2. **`/admin/partes`** y **`/admin/gastos`**: Modos de auditoría de datos operativos de todos sus asalariados.
3. **`/admin/flota`**: Gestión de invitaciones, vinculación Conductor ↔ Vehículo ↔ Configuración económica.

---

## 6. Línea visual recomendada (NexOS Style)

- **Premium & Dark Mode**: Interfaz predominantemente oscura (ej. fondos `slate-950` o similares) que transmite control técnico y minimiza fatiga, como RentOS.
- **Glassmorphism controlado**: En sidebars flotantes o header modals.
- **Esqueletos de carga**: Es mandatorio el uso de Skeletons mientras el servidor hace el fetch, abandonando los clásicos "spinners" gigantes del legacy.
- **Formularios Mobile**: Formularios divididos en _steppers_ o cards para no saturar al conductor al terminar el turno.

---

## 7. Qué rescatar del legacy

- **Cero código react**. No se rescatará código TypeScript ni React.
- **Arquitectura funcional UX**: El orden de los campos al subir un parte (primero km, luego captura ticket taxímetro, luego combustible). Eso funcionaba visualmente bien.

---

## 8. Relacion Frontend ↔ GlorIA / LucIA

Tal y como indica el documento maestro:
- **PilotOS Frontend**: Es la herramienta estructural (crear configuración, subir tickets complejos, ver reportes agregados).
- **LucIA / GlorIA**: Es la asistencia por voz/chat (WhatsApp). El Frontend no representará visualmente a LucIA. Seguirá la identidad de marca `PilotOS by NexOS`.

---

## 9. Estado de implementacion (2026-03-09)

**IMPLEMENTADO — Primera capa funcional completa (2026-03-09).**

Base v2 + primera capa funcional:
- Arbol de carpetas creado segun seccion 2
- Componentes UI base (Button, Input, Card, Badge, Skeleton, StatCard) con CVA + Tailwind
- `lib/api/` completo: 11 modulos cubriendo todos los endpoints del backend
- Rutas por rol: `/admin` (patron), `/driver` (conductor) con Sidebar adaptativo
- Linea visual NexOS: dark mode, zinc-950 base, amber-500 accent
- FormularioParte: wizard 5 pasos con upload de fotos y validaciones PilotOS_Master
- Onboarding: wizard 6 pasos con draft persistente por paso
- Todas las pantallas conectadas a datos reales del backend
- Build `next build` exitoso con 11 rutas

**Pendiente:** Formulario nuevo gasto, responsive mobile. Ver `frontend-v2-transicion.md` para detalles.
