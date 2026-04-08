# PilotOS — Decisiones Tecnicas

Registro de decisiones tecnicas importantes del proyecto.

---

## DT-001 · Prisma con PostgreSQL provider

- Fecha: 2026-03-09
- Area: Stack tecnico
- Decision: Usar Prisma como ORM con PostgreSQL provider
- Alternativa descartada: pg Pool sin ORM (como RentOS)
- Justificacion: Type safety, migraciones declarativas, mejor DX. PilotOS parte de cero sin BD legacy
- Impacto: Diferencia de stack con RentOS aceptable; comunicacion entre productos es via API
- Riesgo: Multi-schema (`pilotos.*`) no tiene soporte nativo completo en Prisma. Se usa `@@schema` con preview feature `multiSchema`

---

## DT-002 · BD compartida nexos con schema pilotos

- Fecha: 2026-03-09
- Area: Base de datos
- Decision: Usar la BD compartida `nexos` con schema propio `pilotos`
- Alternativa descartada: BD separada para PilotOS
- Justificacion: Coherencia con ecosistema NexOS. Permite joins con `minos.Users` si fuera necesario
- Impacto: Requiere configurar Prisma con `multiSchema` preview feature
- Riesgo: Las migraciones de PilotOS no deben afectar a schemas de otros productos

---

## DT-003 · PilotOS no envia WhatsApp directamente

- Fecha: 2026-03-09
- Area: Integraciones
- Decision: Toda mensajeria al usuario pasa por GlorIA + n8n
- Alternativa descartada: WhatsApp service propio en PilotOS (existia en legacy)
- Justificacion: GlorIA es la unica identidad visible. Duplicar envio de WhatsApp crea canal paralelo
- Impacto: `whatsapp.service.ts` se marca como legacy. Las notificaciones se disparan via n8n webhooks
- Archivos legacy: `backend/src/services/whatsapp.service.ts`

---

## DT-004 · LucIA como prompt especializado dentro de GlorIA

- Fecha: 2026-03-09
- Area: Arquitectura de agentes
- Decision: LucIA no es un servicio separado. Es un prompt/contexto especializado que GlorIA carga cuando detecta planeta PILOTOS
- Alternativa descartada: Microservicio LucIA independiente
- Justificacion: Simplicidad. GlorIA ya tiene el router multi-planeta. LucIA se implementa como system prompt + contexto PilotOS
- Impacto: GlorIA necesita un endpoint `/internal/kb/producto` de PilotOS para alimentar el prompt de LucIA

---

## DT-005 · Entidad Cliente separada de Usuario

- Fecha: 2026-03-09
- Area: Modelo de datos
- Decision: Crear entidad `pilotos.clientes` que representa al titular/empresa, separada del usuario en `minos.Users`
- Alternativa descartada: Usar solo `minos.Users` con rol PATRON
- Justificacion: Un cliente puede ser persona fisica o empresa. Puede tener multiples vehiculos y conductores. Es el tenant key de PilotOS
- Impacto: Todas las entidades operativas llevan `cliente_id` como FK

---

## DT-006 · Configuracion economica como entidad propia

- Fecha: 2026-03-09
- Area: Modelo de datos
- Decision: Crear `pilotos.configuracion_economica` como tabla separada vinculada a cliente
- Justificacion: El Master define que "el sistema debe soportar varios modelos economicos". La configuracion puede cambiar en el tiempo y necesita historial
- Campos clave: modelo de reparto, porcentaje conductor, porcentaje patron, cuota PilotOS, gastos fijos mensuales

---

## DT-007 · Calculos de parte separados del parte diario

- Fecha: 2026-03-09
- Area: Modelo de datos
- Decision: Crear `pilotos.calculos_partes` como tabla derivada de `pilotos.partes_diarios`
- Justificacion: Los calculos dependen de la configuracion economica vigente. Separarlos permite recalcular sin modificar el parte (que es inmutable segun R-PD-017)
- Campos clave: bruto_diario, combustible, neto_diario, parte_conductor, parte_patron, varios

---

## DT-008 · Modelo documental evolucionado

- Fecha: 2026-03-09
- Area: Modelo de datos
- Decision: Evolucionar `FotoTicket` a un modelo `Documento` generico con `DocumentoEnlace` para vincular a cualquier entidad
- Justificacion: El Master exige hash, deduplicacion, vinculo a Drive, estado OCR y vinculacion a entidades de negocio
- Impacto: `FotoTicket` y `FotoHistorial` se reemplazan por `Documento`, `DocumentoEnlace` y `DocumentoHistorial`

---

## DT-009 · Router GlorIA y handler conversacional fuera de PilotOS

- Fecha: 2026-03-09
- Area: Arquitectura
- Decision: Marcar como legacy `gloria.router.ts`, `pilotos.handler.ts` y `webhook.routes.ts` del backend PilotOS
- Justificacion: El router multi-planeta ya existe en GlorIA. El handler conversacional es responsabilidad de GlorIA/LucIA. PilotOS expone API, GlorIA la consume
- Archivos legacy: `backend/src/services/gloria.router.ts`, `backend/src/handlers/pilotos.handler.ts`, `backend/src/routes/webhook.routes.ts`

---

## DT-010 · JWT_SECRET sin fallback hardcodeado

- Fecha: 2026-03-09
- Area: Seguridad
- Decision: Eliminar el fallback `'pilotos-secret-change-in-production'` del auth middleware
- Justificacion: Principio P-08 de NexOS. RentOS tuvo el mismo problema (P-08 fix documentado)
- Impacto: Si `JWT_SECRET` no esta definido, el servidor no debe arrancar

---

## DT-011 · PrismaClient singleton

- Fecha: 2026-03-09
- Area: Codigo
- Decision: Usar un unico PrismaClient exportado desde `lib/prisma.ts` en lugar de instanciar uno nuevo en cada archivo de rutas
- Justificacion: Cada `new PrismaClient()` abre un pool de conexiones separado. Con 12 archivos de rutas, esto genera 12 pools simultaneos
- Impacto: Todos los archivos de rutas importan desde `lib/prisma.ts`

---

## DT-012 · Transacciones obligatorias en operaciones multi-paso

- Fecha: 2026-03-09
- Area: Codigo
- Decision: Usar `prisma.$transaction()` en todas las operaciones que escriben en multiples tablas
- Justificacion: Principio P-07 de NexOS. El onboarding `completar` hace ~10 writes sin transaccion — un fallo parcial deja la BD inconsistente
- Operaciones afectadas: onboarding completar, resolver mantenimiento, reemplazar foto, crear parte con fotos

---

## DT-013 · Eliminación efectiva de archivos legacy

- Fecha: 2026-03-09
- Area: Limpieza de repositorio
- Decision: Borrado físico de `whatsapp.service.ts`, `gloria.router.ts`, `pilotos.handler.ts` y `webhook.routes.ts`.
- Justificacion: Aunque estaban marcados como legacy, seguían existiendo en el código y creando confusión.
- Impacto: Las referencias a `whatsapp.service` en `scheduler.service.ts` se han cambiado por TODOs para integrar con n8n/GlorIA.

---

## DT-014 · Consolidación del rol de LucIA

- Fecha: 2026-03-09
- Area: Arquitectura de Agentes
- Decision: Reafirmar que LucIA solo existe como un **prompt de sistema inyectado en GlorIA** cuando procesa un intent de PilotOS.
- Justificacion: Evitar la creación de un nuevo microservicio.
- Impacto: Todo el desarrollo conversacional debe hacerse en el repositorio de GlorIA (`handlePilotOS`), consumiendo los endpoints `/internal/` de PilotOS.

---

## DT-015 · Frontend actual considerado prototipo descartable

- Fecha: 2026-03-09
- Area: Frontend
- Decision: El código actual en `app/src/app` se marca como *legacy prototipo*. No debe usarse como base para escalar.
- Justificacion: Las páginas son enormes monolitos (20+ KB) que mezclan lógica, queries a API y UI sin componentes reutilizables.
---

## DT-017 · Implementacion frontend v2 sobre scaffold existente

- Fecha: 2026-03-09
- Area: Frontend
- Decision: Construir la base v2 directamente sobre el scaffold Next.js 16 existente, sin ejecutar `create-next-app` de nuevo ni mover a `app-legacy`
- Justificacion: El codigo legacy ya habia sido retirado previamente. Solo quedaba el scaffold limpio de Next.js con config correcta (TW4, TS5, React 19). Recrear desde cero habria desperdiciado la configuracion valida
- Impacto: Se preservaron `package.json`, `tsconfig.json`, `postcss.config.mjs` y `eslint.config.mjs` intactos. Se agregaron 4 dependencias UI (clsx, tailwind-merge, cva, lucide-react)
- Stack final: Next.js 16.1.6 + React 19 + Tailwind 4 + CVA (patron shadcn manual)

---

## DT-018 · Separacion de rutas por rol via route groups

- Fecha: 2026-03-09
- Area: Frontend / Navegacion
- Decision: Usar route groups de Next.js App Router: `(auth)` para login/onboarding y `(dashboard)` para todas las vistas autenticadas
- Justificacion: Permite layouts diferentes sin afectar la URL. El dashboard comparte Sidebar + AuthGuard; las paginas de auth no tienen sidebar
- Impacto: AuthGuard valida sesion client-side. El patron ve nav completa (Panel, Partes, Flota, Gastos, Mantenimientos, Documentos); el conductor ve nav reducida (Mi Panel, Nuevo Parte)

---

## DT-019 · Verificacion backend-first antes de implementar frontend

- Fecha: 2026-03-09
- Area: Frontend / Proceso
- Decision: Antes de implementar cualquier pantalla frontend, leer la ruta backend correspondiente para verificar: metodo HTTP, parametros, campos del body, y estructura de la respuesta
- Justificacion: Se encontraron 5+ discrepancias (C-010 a C-013) entre lo asumido y lo real. Sin esta verificacion, el frontend habria fallado en runtime
- Impacto: Todo tipo en `types/api.ts` y `types/models.ts` refleja exactamente el contrato real del backend
- Riesgo: Si el backend cambia sin actualizar los tipos frontend, se rompe silenciosamente

---

## DT-020 · FormularioParte como wizard de 5 pasos

- Fecha: 2026-03-09
- Area: Frontend / UX
- Decision: El formulario de parte diario es un wizard de 5 pasos: Vehiculo/Fecha, Kilometraje, Ingresos, Tickets/Fotos, Confirmacion
- Justificacion: En movil, un formulario de 10+ campos es inmanejable. El wizard descompone la complejidad y permite validacion progresiva
- Impacto: Las validaciones del PilotOS_Master (km_fin > km_inicio, bruto >= datafono, concepto obligatorio si varios > 0, ticket gasoil solo si combustible > 0) se aplican por paso
- Flujo: crearParte() → uploadFoto() × N → vincularFoto() × N

---

## DT-021 · Onboarding como wizard de 6 pasos con draft persistente

- Fecha: 2026-03-09
- Area: Frontend / UX
- Decision: El onboarding es un wizard de 6 pasos que guarda draft en backend (upsert por telefono) al avanzar cada paso
- Justificacion: Si el usuario cierra el navegador a mitad del onboarding, puede retomar. El backend soporta upsert por telefono
- Pasos: Datos titular → Vehiculo → Asalariado → Modelo economico → Gastos fijos → Confirmacion
- Impacto: `POST /api/onboarding` se llama en cada "Siguiente". `POST /api/onboarding/:telefono/completar` solo al final

---

## DT-022 · Middleware Server-Side con cookies

- Fecha: 2026-03-09
- Area: Frontend / Auth
- Decision: Implementar `src/middleware.ts` en Next.js gestionando redirecciones nativas y protección de rutas en base a cookies HTTP.
- Justificacion: El Next.js App Router requiere Edge Middleware para proteger layouts de forma segura antes del renderizado. El `AuthGuard` client-side era insuficiente a nivel de arquitectura.
- Impacto: `session.ts` ahora persiste `pilotos_token` y `pilotos_es_patron` también en cookies usando `document.cookie` (en base al login client-side).
- Riesgo Bajo: Transición fluida compatible con la persistencia JWT actual.

---

## DT-023 · Filtro de Periodos via SSR SearchParams

- Fecha: 2026-03-09
- Area: Frontend / UX
- Decision: Implementar un `PeriodFilter` en Next.js usando parameters en URL (`?desde...&hasta...`) en lugar de estados locales de React (`useState`).
- Justificacion: Mantiene la URL compartible, permite navegación "atrás" en el navegador y es el patrón óptimo de data-fetching en Server Components / Next.js.
- Impacto: Dashboards y listas re-hacen peticiones automaticamente al cambiar los searchParams, apoyados en `Suspense`. El endpoint `GET /api/gastos/resumen` carece de soporte `desde/hasta` y se respeta la DT-019 (no alterar backend sin permiso), por lo que total de gastos siempre evalúa el histórico.

---

## DT-016 · Integración dinámica de contexto IA en GlorIA

- Fecha: 2026-03-09
- Area: Ecosistema AI (GlorIA)
- Decision: GlorIA inyecta dinámicamente los datos vivos (`/internal/resumen`) y el playbook de operaciones (`/internal/kb/producto`) de PilotOS antes de pasarlos al LLM a través de n8n.
- Justificacion: Mantiene un único orquestador conversacional, separando los datos técnicos en sus respectivos repositorios. Esto honra el patrón "Un cerebro, muchos planetas, una sola voz".
- Impacto: PilotOS ahora funciona nativamente bajo el alias de LucIA sin requerir cambios de prompt en n8n ni un pipeline NLP separado.

---

## DT-024 · Acciones In-line via Estado Componente (Mantenimientos)

- Fecha: 2026-03-09
- Area: Frontend / UX
- Decision: El flujo de "Resolver" mantenimiento despliega un mini-formulario *in-line* dentro de la tarjeta del vehículo en lugar de navegar a una nueva URL o levantar un modal invasivo.
- Justificacion: Mantiene contexto visual y agiliza iteraciones múltiples del usuario, evitando saltos cognitivos en operaciones administrativas de bajo impacto en UI (pero alto valor de datos).

---

## DT-025 · Escalado Táctil en Inputs Globales Base

- Fecha: 2026-03-09
- Area: Frontend / Mobile UX
- Decision: Unificar los componentes base `Input` genéricos a formato `h-12` (mín. ~48px) y fuente `text-base` (16px).
- Justificacion: Se elimina el efecto 'auto-zoom' problemático propio del comportamiento en Safari (iOS) cuando se pulsa un text input < 16px. Aumenta fiabilidad de impacto del dedo ("Fat-finger syndrome").
- Impacto: Componentes adaptativos globales, mejora del UX sin sacrificar densidad de información crucial.

---

## DT-026 · Cierre de Periodo MVP en Backend

- Fecha: 2026-03-09
- Area: Backend / Reportes
- Decision: Implementar `POST /api/cierres` procesando agregación real desde la BD (`ParteDiario`, `Gasto`, `GastoFijo` vigentes) y persistiendo en `CierrePeriodo`.
- Justificacion: El Master dictamina cierres persistidos. Un reporte al vuelo en Frontend sirve visualmente pero no deja un "Cierre Contable" inmutable para emitir facturas/liquidaciones consolidadas al final de mes.
- Impacto: La agregación asume partes 'VALIDADO', sumando importe bruto, combustible y aplicando la cuota de PilotOS vigente desde las tablas base. Simplifica los gastos fijos como inserciones completas (sin pro-rateo por fechas) para el MVP.

---

## DT-027 · Generación PDF Frontend (Base Operativa)

- Fecha: 2026-03-09
- Area: Informes / Exportación PDF
- Decision: Utilizar la capacidad nativa del explorador (`window.print()` + utilidades `@media print` de Tailwind) para generar el PDF de Resumen / Cierre desde el Dashboard `informes`.
- Justificacion: Se descartó anexar dependencias como `puppeteer` interrumpiendo el bundle nativo MVP y requiriendo un backend mas pesado (binarios Chrome embebidos). La exportación web-based satisface la trazabilidad visual solicitada en FASE 3 proporcionando una "base operativa realista".
- Impacto: La opción de Imprimir genera una hoja de estilo optimizada, oculta menús/barras y presenta los informes de flujo de caja y balance limpio para que el Patrón guarde la facturación con un click.

---

## DT-028 · Separación de experiencias: Conductor (PWA) vs Patrón (Dashboard)

- Fecha: 2026-04-07
- Area: Frontend / Arquitectura de producto
- Decision: Dividir el frontend en dos experiencias dentro del mismo proyecto Next.js usando grupos de rutas:
  - `(conductor)` → /conductor/* — mobile-first, sin sidebar, instalable como PWA
  - `(dashboard)` → /admin, /partes, /gastos, /flota... — desktop, con sidebar, solo patrón
- Justificacion: La experiencia unificada con sidebar no es apta para uso real en móvil como conductor de taxi. El conductor necesita una app simple, de pantalla completa y acceso inmediato al parte diario. El patrón necesita control completo del negocio.
- Alternativas descartadas: dos proyectos separados (duplicación innecesaria), subdominios (complejidad operacional sin ventaja en esta fase).
- Impacto: El middleware redirige automáticamente según rol. FormularioParte se reutiliza con parámetro returnPath. La ruta /driver queda como legado funcional sin enlace activo.

## DT-029 · PWA con Service Worker propio (sin next-pwa)

- Fecha: 2026-04-07
- Area: Frontend / PWA
- Decision: Implementar PWA con manifest.json y service worker propio en /public/sw.js en lugar de usar la librería next-pwa.
- Justificacion: next-pwa añade complejidad de configuración, genera service workers opacos y tiene problemas con el App Router de Next.js 16. Un SW manual de 50 líneas es más controlable y suficiente para la estrategia network-first que necesitamos en esta fase.
- Iconos: servidos por rutas de API Next.js (/icon-192, /icon-512) como SVG temporales. En producción real, sustituir por PNG estáticos (192x192 y 512x512).
- Impacto: La app es instalable en iOS (via "Añadir a pantalla de inicio") y Android (banner automático de Chrome). start_url apunta a /conductor para que el icono abra directamente en la experiencia del conductor.
