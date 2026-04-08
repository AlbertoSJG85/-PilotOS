# Estado Actual de PilotOS
> Última actualización: 2026-04-07 (revisión técnica completa) | Basado en estado real del repositorio

---

## 1. Resumen del estado actual

PilotOS tiene el core completamente construido: backend API, esquema de base de datos, frontend con todas las pantallas principales y documentación técnica completa. El sistema es funcional como producto web standalone.

Lo que **no funciona todavía** son las integraciones externas: GlorIA, n8n (notificaciones), OCR → lógica de negocio, y Google Drive.

**Estimación global: 70% production-ready. Para pruebas manuales locales: listo con los cambios de hoy (ver SETUP.md).**

---

## 2. Qué está hecho

### Backend (Express + TypeScript + Prisma)
- 13 archivos de rutas cubriendo todos los módulos:
  - `auth.routes.ts` — login por teléfono, JWT
  - `onboarding.routes.ts` — wizard 6 pasos con borrador persistente
  - `parteDiario.routes.ts` — creación e inmutabilidad del parte
  - `foto.routes.ts` — subida de fotos, OCR con Tesseract.js, reemplazo
  - `gasto.routes.ts` — registro y consulta de gastos
  - `incidencia.routes.ts` — creación con autorización del patrón
  - `mantenimiento.routes.ts` — catálogo cerrado + seguimiento por vehículo
  - `anomalia.routes.ts` — registro acumulativo (no se resetea)
  - `cierre.routes.ts` — cierre de período con agregaciones reales desde BD
  - `vehiculo.routes.ts`, `usuario.routes.ts`, `upload.routes.ts`, `internal.routes.ts`
- Middleware de auth con JWT sin fallback hardcodeado
- Token interno (`x-internal-token`) para endpoints de GlorIA
- 7 endpoints `/internal/*` listos para que GlorIA los consuma
- Servicios: `calculo.service.ts`, `ocr.service.ts`, `scheduler.service.ts`, `storage.service.ts`

### Base de datos (PostgreSQL, schema `pilotos`)
- 19+ tablas implementadas: `partes_diarios`, `calculos_partes`, `conductores`, `vehiculos`, `clientes`, `gastos`, `gastos_fijos`, `mantenimiento_catalogo`, `mantenimiento_vehiculo`, `seguimiento_mantenimiento`, `anomalias`, `incidencias`, `avisos`, `tareas_pendientes`, `cierres_periodo`, `documentos`, `documento_enlaces`, `configuracion_economica`, `onboarding`
- Multi-tenancy por `cliente_id` en todos los registros operativos
- Unicidad parte por vehículo + día
- `seed.ts` con catálogo de mantenimientos cargado

### Frontend (Next.js 16 + React 19 + Tailwind 4)
- Auth: `/login`, `/onboarding` (6 pasos)
- Dashboard admin y driver diferenciados por rol
- Partes: listado, nuevo (wizard 5 pasos), detalle
- Gastos: listado, nuevo
- Mantenimientos: página con acciones inline
- Flota: vehículos y conductores
- Documentos: navegador
- Informes: filtros por período, botón imprimir
- Componentes UI propios (Button, Input, Card, Badge, Skeleton, StatCard)
- AuthGuard + Sidebar + PageHeader
- Clientes API tipados para todos los endpoints
- Tipos de dominio sincronizados con contratos del backend
- Optimización iOS (inputs h-12, sin zoom automático)

### Documentación técnica
- `PilotOS_Master.md` — especificación completa del producto
- `arquitectura-inicial.md` — decisiones de stack y posicionamiento en NexOS
- `decisiones-tecnicas.md` — 27 decisiones (DT-001 a DT-027)
- `correcciones.md` — 18 correcciones documentadas (C-001 a C-018)
- `agents/*/AGENT.md` — reglas por módulo (parte diario, gastos, mantenimientos, incidencias, anomalías, fotos, dashboard, gloria)
- `rules.md`, `states.md`, `events.md` — especificación canónica del sistema

---

## 3. Qué está parcial

### OCR (Tesseract.js integrado, lógica no conectada)
- **Hecho**: Tesseract corre, extrae texto, guarda en BD (`ocr_texto`, `ocr_confianza`, `ocr_datos_extraidos`)
- **No hecho**: El output extraído no alimenta la lógica de negocio (importe del ticket, litros de combustible, fecha). El usuario sigue rellenando esos campos a mano.
- **Impacto**: Usabilidad reducida. Las fotos se suben pero no agilizan el parte.

### Scheduler / Avisos (`scheduler.service.ts`)
- **Hecho**: Servicio creado, esquema de `avisos` y `tareas_pendientes` en BD
- **No hecho**: No hay workflows de n8n activos. Los recordatorios de mantenimiento y los umbrales de anomalías (3 acumuladas → aviso) no disparan nada todavía.
- **Impacto**: Nadie recibe notificaciones automáticas.

### PDF / Informes
- **Hecho**: Página de informes con filtros, botón "Imprimir" (`window.print()`)
- **No hecho**: Sin generación de PDF en servidor, sin envío por email, sin archivo persistido.
- **Impacto**: El PDF es lo que el navegador genera. Válido para MVP, no para automatización.

### Drive / Almacenamiento
- **Hecho**: Esquema preparado (`drive_file_id` en `documentos`), archivos suben a `/uploads` local
- **No hecho**: Sin Google Drive API. Los archivos no van a Drive.
- **Impacto**: Escalabilidad y backup en riesgo. Si el servidor muere, los archivos se pierden.

---

## 4. Qué falta por hacer

### Crítico (bloquea valor real del producto)

| # | Tarea | Detalle |
|---|-------|---------|
| 1 | **Integración GlorIA → PilotOS** | GlorIA debe implementar: detección del "planeta PILOTOS", inyección del system prompt de LucIA, fetch de `/internal/kb/producto` y `/internal/resumen`, handlers para registrar-gasto, consultar-mantenimientos, crear-incidencia. Los endpoints de PilotOS ya existen. El trabajo está en el repo de GlorIA. |
| 2 | **Workflows n8n activos** | Desplegar en Coolify los workflows para: recordatorio de mantenimiento próximo, vencimientos de documentos, umbral de 3 anomalías, resumen semanal al patrón. |
| 3 | **OCR → lógica de negocio** | Conectar output de Tesseract con autocompletado de campos en el parte (importe ticket, litros combustible). |

### Importante (necesario antes de escalar)

| # | Tarea | Detalle |
|---|-------|---------|
| 4 | **Google Drive API** | Subir archivos a Drive en lugar de `/uploads` local. Ya hay schema preparado. |
| 5 | **PDF en servidor** | Generación real con Puppeteer o similar para email/archivo. |
| 6 | **Estrategia de backup** | BD remota en `161.97.108.106:5433`. Sin backup automático documentado. |

### Futuro / Fase 2

- Soporte VTC completo (múltiples vehículos mismo conductor mismo día)
- Estructuras de flota avanzadas (multi-empresa)
- App móvil nativa (actualmente web)
- Soporte multi-idioma

---

## 5. Riesgos o bloqueos actuales

| Riesgo | Severidad | Estado |
|--------|-----------|--------|
| **GlorIA sin implementar**: Los usuarios no pueden interactuar por WhatsApp. El frontend es el único canal. | Alta | Sin solución definida todavía |
| **Archivos en local `/uploads`**: Si el servidor se reinicia o se migra, los archivos se pierden | Alta | Sin mitigation activa |
| **Sin backup de BD documentado** | Alta | Desconocido |
| **n8n no desplegado**: Notificaciones automáticas no funcionan | Media | Depende de Coolify setup |
| **OCR sin conectar**: El parte requiere entrada manual de todos los datos | Media | No bloquea MVP, reduce UX |
| **Un único commit en git**: Sin historia real de cambios | Baja | Problema de trazabilidad, no de funcionamiento |

### Contradicciones detectadas entre docs y código

1. **GlorIA como única identidad**: El `PilotOS_Master.md` y `agents/gloria/AGENT.md` describen a GlorIA como canal principal. Sin embargo, actualmente el único canal funcional es el frontend propio. La documentación está por delante de la realidad.

2. **Scheduler**: `scheduler.service.ts` tiene comentarios `// TODO: n8n integration`. El servicio existe pero no hace nada efectivo todavía.

3. **Drive**: El schema tiene `drive_file_id` y los docs hablan de Drive como SSOT para documentos. En la práctica, todo va a `/uploads` local.

4. **app-legacy/**: Existe un directorio `app-legacy/` en el repositorio (mencionado en git status como `?? app-legacy/`). No está documentado. Probablemente es el prototipo anterior (DT-015: "frontend actual como prototipo legacy"). Necesita confirmación antes de borrar.

---

## 6c. Separación de experiencias conductor / patrón — 2026-04-07

**Decisión de producto**: El parte diario no vive en el dashboard general. Existen dos experiencias separadas.

**Nuevas rutas del conductor (PWA mobile-first):**
| Ruta | Función |
|------|---------|
| `/conductor` | Home: botón NUEVO PARTE + últimos partes |
| `/conductor/parte/nuevo` | Wizard de parte diario (mismo FormularioParte) |
| `/conductor/parte/[id]` | Detalle del parte enviado |

**Rutas del patrón (sin cambios):**
| Ruta | Función |
|------|---------|
| `/admin` | Dashboard ejecutivo |
| `/partes` | Listado completo de partes |
| `/gastos`, `/flota`, `/mantenimientos`, `/documentos`, `/informes` | Control del negocio |

**PWA activada:**
- `manifest.json` con `display: standalone`, `start_url: /conductor`
- Service worker (`/sw.js`) con estrategia network-first
- Safe area insets para iPhone con notch
- Iconos dinámicos via rutas API (temporales, en producción sustituir por PNG estáticos)

**Instalación en iPhone:**
1. Abrir `http://localhost:3000/conductor` en Safari
2. Compartir → "Añadir a pantalla de inicio"
3. La app abre directamente en el home del conductor, sin barra del navegador

---

## 6b. Cambios aplicados en revisión 2026-04-07

Correcciones realizadas para dejar el sistema usable para test manual (ver `correcciones.md` C-019, C-020, C-021):

| Cambio | Archivo | Motivo |
|--------|---------|--------|
| Desactivado check `TareaPendiente` en creación de partes | `backend/src/routes/parteDiario.routes.ts` | OCR fallido bloqueaba permanentemente al conductor sin UI de resolución |
| Desactivado check `TareaPendiente` en attach de fotos | `backend/src/routes/foto.routes.ts` | Mismo deadlock de UX |
| Corregido fallback URL en upload.ts | `app/src/lib/api/upload.ts` | Inconsistencia con fetcher.ts, roto en producción sin env var |
| Corregido AUTOMATICO → AUTOMATICA | `app/src/app/(auth)/onboarding/page.tsx` | Datos inconsistentes en BD |
| Creado `app/.env.local` | `app/.env.local` | Sin este fichero, el frontend no tenía la URL del backend configurada |
| Creado `SETUP.md` | `PilotOS/SETUP.md` | Guía de arranque paso a paso para pruebas reales |

**Para arrancar hoy:** seguir `SETUP.md` en la raíz del proyecto.

---

## 6. Siguiente paso recomendado

**El producto web funciona. El valor diferencial (GlorIA + notificaciones automáticas) no.**

Prioridad recomendada:

1. **Coordinar con equipo GlorIA** para implementar el router de PilotOS y el system prompt de LucIA. Los endpoints ya están listos. Sin esto, el producto no cumple su propuesta de valor principal.

2. **Desplegar n8n en Coolify** y crear los primeros workflows (recordatorio de mantenimiento, umbral de anomalías). Esto activa la parte proactiva del sistema.

3. **Definir backup de BD** antes de que haya datos reales de clientes.

4. **Decidir qué hacer con `app-legacy/`**: ¿Borrar o mantener como referencia? Limpiar el repo.

5. **Conectar OCR con lógica** una vez que lo anterior esté estable.

---

*Fuente: Estado real del repositorio a 2026-04-07. Revisado sobre código, schema Prisma, documentación técnica persistida y git log.*
