# PilotOS — Registro de Correcciones y Aprendizajes

Formato: fecha | area | problema | causa | solucion | prevencion

---

## 2026-03-09 · Setup inicial

### C-001 · PrismaClient instanciado multiples veces
- Area: Backend / conexiones BD
- Problema: Cada archivo de rutas creaba `new PrismaClient()`, generando multiples pools
- Causa: Patron copiado sin singleton
- Solucion: Creado `lib/prisma.ts` con singleton global (DT-011)
- Prevencion: Todos los archivos importan desde `lib/prisma.ts`. Nunca instanciar PrismaClient directamente

### C-002 · JWT_SECRET con fallback hardcodeado
- Area: Seguridad / auth middleware
- Problema: `process.env.JWT_SECRET || 'pilotos-secret-change-in-production'` — misma vulnerabilidad que RentOS P-08
- Causa: Patron de desarrollo que llego a produccion
- Solucion: Eliminado fallback. El servidor no arranca sin JWT_SECRET (DT-010)
- Prevencion: Nunca usar fallbacks para secrets. Validar env vars criticas al arrancar

### C-003 · WhatsApp service duplicado en PilotOS
- Area: Arquitectura / integraciones
- Problema: `whatsapp.service.ts` duplicaba funcionalidad que ya existe en GlorIA
- Causa: PilotOS se desarrollo inicialmente como sistema aislado
- Solucion: Marcado como legacy. Toda mensajeria pasa por GlorIA + n8n (DT-003)
- Prevencion: PilotOS nunca envia mensajes directamente al usuario. Las notificaciones se disparan via n8n

### C-004 · Router GlorIA duplicado en PilotOS
- Area: Arquitectura / integraciones
- Problema: `gloria.router.ts` en PilotOS duplicaba el router multi-planeta de `GlorIA/src/services/router.ts`
- Causa: Desarrollo aislado del backend PilotOS
- Solucion: Marcado como legacy. El router vive en GlorIA (DT-009)
- Prevencion: La logica conversacional es responsabilidad de GlorIA. PilotOS expone API

### C-005 · Operaciones multi-paso sin transacciones
- Area: Backend / integridad de datos
- Problema: Onboarding `completar` hacia ~10 writes sin `$transaction()`. Fallo parcial dejaba BD inconsistente
- Causa: Patron de desarrollo rapido sin considerar atomicidad
- Solucion: Documentado como obligatorio usar `prisma.$transaction()` (DT-012)
- Prevencion: Toda operacion que escribe en >1 tabla debe ser transaccional

### C-006 · Schema SQLite incompatible con ecosistema NexOS
- Area: Base de datos
- Problema: PilotOS usaba SQLite via Prisma. El ecosistema NexOS usa PostgreSQL con schemas separados
- Causa: Decision de desarrollo local inicial
- Solucion: Migrado a PostgreSQL con schema `pilotos.*` y preview feature `multiSchema` (DT-001, DT-002)
- Prevencion: Todo producto OS nuevo debe usar PostgreSQL desde el inicio

### C-007 · Limpieza legacy incompleta
- Area: Repositorio / Código
- Problema: Archivos core legacy (`whatsapp.service.ts`, `gloria.router.ts`, etc.) no habían sido borrados físicamente.
- Causa: Falta de ejecución final en la fase de limpieza de agentes previos.
- Solucion: Archivos eliminados y parcheada la referencia en `scheduler.service.ts`.
- Prevencion: Verificar siempre la inexistencia física de archivos marcados como legacy o eliminados en la documentación.

### C-009 · Frontend v2 no requirio archivado de legacy
- Area: Frontend / Transicion
- Problema: El plan de transicion (frontend-v2-transicion.md) preveia mover `app/` a `app-legacy`, pero al ejecutar no habia codigo legacy que mover
- Causa: La limpieza del codigo legacy se habia ejecutado en una sesion anterior sin actualizar el plan de transicion
- Solucion: Se construyo directamente sobre el scaffold limpio existente. Se actualizo el plan de transicion para reflejar la realidad
- Prevencion: Verificar siempre el estado real del repo antes de ejecutar un plan documentado. Los planes pueden quedar desactualizados entre sesiones

---

### C-010 · Login enviaba password pero backend solo acepta telefono
- Area: Frontend / API contract
- Problema: El formulario de login y la funcion `login()` enviaban `{ telefono, password }` pero `auth.routes.ts` solo destructura `{ telefono }` del body
- Causa: Asuncion incorrecta del contrato sin verificar el backend
- Solucion: Eliminado parametro password de `login()` y del formulario. Verificado contra `auth.routes.ts`
- Prevencion: Siempre leer la ruta backend antes de implementar la llamada frontend

### C-011 · Respuesta auth tenia context separado de user
- Area: Frontend / Tipos
- Problema: `AuthResponse` asumia `user.cliente_id`, `user.conductor_id`, `user.es_patron` dentro de `user`, pero backend devuelve `context` como objeto separado
- Causa: Tipos definidos sin verificar respuesta real del backend
- Solucion: Creado tipo `LoginResponse` con `user` y `context` separados. Login page mapea ambos en `SessionUser`
- Prevencion: Tipos API deben definirse leyendo la ruta backend, no asumiendo estructura

### C-012 · Campo `datafono` no existe, es `ingreso_datafono`
- Area: Frontend / Modelo de datos
- Problema: Frontend usaba `datafono` en tipos y API pero backend espera `ingreso_datafono`
- Causa: Nombre abreviado sin verificar schema Prisma
- Solucion: Renombrado a `ingreso_datafono` en models.ts y partes.ts
- Prevencion: Nombres de campos siempre del schema/ruta backend, nunca inventados

### C-013 · Onboarding type incompleto
- Area: Frontend / Tipos
- Problema: `Onboarding` en models.ts no incluia `nif_cif`, `tipo_combustible`, `tipo_transmision`, `fecha_matriculacion`, `seguro_vigencia`, `preferencias_avisos`
- Causa: Tipo definido parcialmente en la fase de scaffolding sin verificar todos los campos del backend
- Solucion: Agregados todos los campos que acepta `POST /api/onboarding`
- Prevencion: Al crear tipos, comparar campo por campo con la ruta backend

---

### C-008 · Falsa integración de LucIA en GlorIA
- Area: Integraciones / GlorIA
- Problema: PilotOS tiene toda la teoría y los conectores internos listos, pero GlorIA no tiene ninguna implementación real de LucIA.
- Causa: Falta de sincronización entre el estado de desarrollo de PilotOS y GlorIA.
- Solucion: Documentado en `auditoria-lucia.md`. La siguiente fase prioritaria para agentes es construir este conector en GlorIA.
- Prevencion: No asumir integraciones cruzadas sin comprobar ambos repositorios.

### C-014 · Tipos de TypeScript desincronizados en ParteDiario
- Area: Frontend / Tipos (models.ts)
- Problema: El frontend fallaba al acceder a `parte.documentos` o a `parte.calculo.porcentaje_conductor` porque no coincidían con el Prisma Query generado en el backend.
- Causa: Falta de revisión profunda en los Includes anidados de `prisma.parteDiario.findUnique`.
- Solucion: Se actualizaron las interfaces de dominio `models.ts` para tolerar `documentos` e `incidencias` como Arrays y se adaptó la UI eliminando `porcentaje_conductor`.
- Prevencion: Comparar la salida JSON real de un request válido al modelar en TS.

### C-015 · Cliente Prisma desincronizado causando errores TS en build
- Area: Backend / Types
- Problema: Al hacer un build de Pre-producción, TypeScript de backend fallaba buscando propiedades en camelCase y campos obsoletos (ej. `ingreso_bruto`).
- Causa: El Schema de BD se actualizó a la última iteración, pero los servicios usaban interfaces antiguas y el `PrismaClient` local no se había regenerado tras modificar la estructura `multiSchema`.
- Solucion: Refactor exhaustivo de dependencias tipeadas (e.g `cliente_id: string | undefined` -> comprobación explícita) y recreación del prisma client `npx prisma generate`. Backend ahora transpila en TypeScript 100% puro sin advertencias.
- Prevencion: Siempre correr `npx prisma generate` antes de `tsc` cuando se asume un workspace ya editado, para asegurar validez de tipados.

## C-018 · DATABASE_URL apuntando a localhost sin tunel SSH

1. **Estado**: Resuelto (2026-03-10)
2. **Impacto**: Critico (backend no arranca)
3. **Origen**: `backend/.env` — variable `DATABASE_URL`
4. **Contexto**: El backend fallaba con `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5433`. El `.env` tenia dos errores:
   - Host: `127.0.0.1` en lugar de `161.97.108.106` (la BD remota en Coolify)
   - Nombre de BD: `/pilotos` en lugar de `/nexos` (BD compartida del ecosistema, DT-002)
5. **Causa raiz**: Se configuro el `.env` asumiendo que se usaria un tunel SSH (`127.0.0.1:5433`), pero nunca se creo ni documento el tunel. Ademas, el nombre de BD fue confundido con el nombre del schema.
6. **Solucion**: Corregido `DATABASE_URL` para apuntar directamente a `161.97.108.106:5433/nexos?schema=pilotos`. El puerto 5433 del servidor esta abierto publicamente (verificado con `Test-NetConnection`).
7. **Prevencion**:
   - El `.env.example` ya tenia el formato correcto. Siempre verificar contra `.env.example` al configurar.
   - Documentada seccion "Desarrollo local contra PostgreSQL remota" en `despliegue-preprod.md`.
   - Recordar: la BD es `nexos`, el schema es `pilotos`. No confundir nombre de recurso Coolify con nombre de BD.

---

## C-016 · Failed to Fetch y Login Loop por CORS Next.js

1. **Estado**: Resuelto (2026-03-09)
2. **Impacto**: Crítico
3. **Rol implicado**: Todos (Fallo de red)
4. **Origen**: `app/src/lib/api/fetcher.ts`
5. **Contexto**: Ejecutar PilotOS Frontend en `http://localhost:3000` sin variables de entorno causaba que el `fetcher` intentase hacer ping cruzado a `http://localhost:3001/api`. Al requerir CORS y/o Cookies el navegador colapsaba silenciosamente ("Failed to Fetch").
6. **Solución**: Declarado un Proxy Transparente en `next.config.ts` (`rewrites()`). Todas las llamadas a `/api/*` y `/uploads/*` recaen relativas al frontend y el servidor de Next las enmascara haciéndolas pasar al puerto del backend internamente, sanando el Login y el Onboarding.

## C-017 · Onboarding asume asalariados siempre

1. **Estado**: Resuelto (2026-03-09)
2. **Impacto**: Medio (UX / Incoherencia)
3. **Rol implicado**: Patrón independiente sin choferes
4. **Origen**: `app/src/app/(auth)/onboarding/page.tsx`
5. **Contexto**: Aunque el usuario marcase `tiene_asalariado: false`, el Wizard obligaba a rellenar el Modelo Económico de Reparto 50-50 y mandaba los datos.
6. **Solución**: Refactorizado el manejador `handleNext()`. Si no hay asalariados, se salta íntegramente de Perfil a Gastos Fijos ocultando el Modelo Económico y subiendo internamente a persistencia: 100% Patrón / 0% Conductor.

---

## C-019 · TareaPendiente bloquea creación de partes si OCR falla (2026-04-07)

1. **Estado**: Mitigado para fase de test
2. **Impacto**: Crítico — bloqueaba el uso diario completo
3. **Rol implicado**: Conductor / Patrón
4. **Origen**: `backend/src/routes/parteDiario.routes.ts` y `foto.routes.ts`
5. **Contexto**: Si Tesseract OCR no podía leer un ticket (frecuente con fotos reales), se creaba una `TareaPendiente` con `resuelta: false`. El siguiente intento de crear un parte comprobaba esa tarea y devolvía `403 pending_tasks`. No existía UI para resolver tareas pendientes, dejando al conductor permanentemente bloqueado.
6. **Solución**: Desactivado el check de `TareaPendiente` en la creación de partes y en el attach de fotos. La regla R-FT-006 se reactivará cuando se implemente la UI de resolución de tareas pendientes en el detalle del parte.
7. **Prevención**: Cualquier bloqueo que dependa de una acción sin UI de resolución es un deadlock de UX. Antes de activar una regla de bloqueo, verificar que el camino de desbloqueo existe en el frontend.

## C-020 · upload.ts con fallback hardcodeado a localhost:3001 (2026-04-07)

1. **Estado**: Resuelto
2. **Impacto**: Medio — inconsistencia entre fetcher.ts y upload.ts
3. **Origen**: `app/src/lib/api/upload.ts`
4. **Contexto**: `upload.ts` usaba `|| 'http://localhost:3001'` como fallback mientras `fetcher.ts` usaba `|| ''` (URL relativa que pasa por el proxy de Next.js). En producción sin `NEXT_PUBLIC_API_URL`, las subidas de fotos fallarían apuntando a localhost.
5. **Solución**: Cambiado fallback a `|| ''` para consistencia. Creado `app/.env.local` con `NEXT_PUBLIC_API_URL=http://localhost:3001` para desarrollo local.
6. **Prevención**: Todos los módulos de API deben usar el mismo origen. Centralizar en `fetcher.ts` o garantizar que el `.env.local` siempre esté configurado.

## C-023 · minos.Users es identidad global NexOS — no borrar en reset de PilotOS (2026-04-08)

1. **Estado**: Resuelto
2. **Impacto**: Crítico de arquitectura — riesgo de destruir identidades de usuarios de otros productos
3. **Área**: `backend/prisma/reset-data.ts`, `backend/src/routes/onboarding.routes.ts`, `app/src/app/(auth)/onboarding/page.tsx`
4. **Contexto**: `minos.Users` y `ledger.Eventos` son tablas compartidas por todos los productos NexOS (PilotOS, RentOS, GlorIA, etc.) en la misma BD `nexos`. El script de reset anterior borraba registros de `minos.Users` ligados a conductores de PilotOS. Si esos usuarios también tenían cuenta en RentOS u otro producto, se borraban sus identidades globales. Adicionalmente, el onboarding aceptaba email como opcional y generaba emails sintéticos `telefono@pilotos.app` que no son cuentas Gmail reales y rompen la integración futura con Google Drive.
5. **Causa**: Falta de claridad sobre qué tablas pertenecen a PilotOS y cuáles son compartidas del ecosistema.
6. **Solución**:
   - `reset-data.ts`: eliminado el bloque `minosUser.deleteMany()` completamente. Solo se limpian tablas del schema `pilotos` + eventos con `source='PILOTOS'` en `ledger`.
   - `onboarding.routes.ts` (completar): nueva lógica de identidad basada en email + teléfono:
     - Busca usuario por email (campo @unique) y por teléfono (complementario).
     - Si el teléfono existe con otro email → conflicto de identidad → 409 con mensaje claro.
     - Si el email existe con Cliente/Conductor en PilotOS → ya tiene cuenta → 409.
     - Si el email existe pero sin PilotOS → usuario de otro producto NexOS → reutilizar sin modificar sus datos.
     - Si no existe → crear nuevo.
   - `onboarding.routes.ts` (guardar borrador): Gmail obligatorio + validación `@gmail.com` desde el primer paso.
   - `onboarding/page.tsx`: campo Gmail obligatorio con validación y nota explicativa sobre Google Drive.
7. **Prevención**: Siempre identificar qué schema pertenece cada tabla antes de tocarla. Tablas en `minos.*` y `ledger.*` son del ecosistema NexOS, no de PilotOS. Solo tocar `pilotos.*` en operaciones propias del producto. El email de Gmail es obligatorio desde el inicio porque es la identidad principal en NexOS y se necesita para Google Drive.

## C-022 · Unique constraint en minos.Users.email al completar onboarding (2026-04-08)

1. **Estado**: Resuelto
2. **Impacto**: Crítico — bloqueaba completar el onboarding con error crudo de BD
3. **Rol implicado**: Patrón (flujo de registro inicial)
4. **Origen**: `backend/src/routes/onboarding.routes.ts` — endpoint `POST /:telefono/completar`
5. **Contexto**: Al completar el onboarding, el paso 1 hacía `tx.minosUser.create({ email })`. Si ya existía un usuario con ese email en `minos.Users` (por un onboarding previo fallido a mitad, o por un reset incompleto), Prisma lanzaba `P2002 Unique constraint failed on the fields: (email)` con error crudo sin mensaje útil. La transacción reventaba sin estado a medias gracias al `$transaction`, pero el usuario veía "Error interno" sin saber qué hacer.
6. **Causa secundaria**: El script `reset-data.ts` anterior usaba nombres de modelo incorrectos (`prisma.documentoParte`, `prisma.reglaReparto`, `prisma.usuario`) que no existen en el schema de Prisma. El script crasheaba a mitad dejando `minos.Users`, `conductores`, `clientes` y `vehiculos` sin borrar.
7. **Solución**:
   - `completar`: añadido pre-check antes de la transacción — si existe un `minosUser` con ese email Y ya tiene un `Cliente` PilotOS asignado, devuelve `409 user_already_exists` con mensaje claro.
   - `completar`: cambiado `minosUser.create` → `minosUser.upsert` por email para reutilizar usuarios huérfanos (sin Cliente) sin error.
   - Mismo `upsert` aplicado a los `minosUser` de asalariados.
   - Añadido catch explícito de `err.code === 'P2002'` para devolver mensaje legible si ocurre cualquier otro duplicado.
   - `reset-data.ts`: reescrito completamente con nombres de modelo correctos de Prisma (`documentoEnlace`, `configuracionEconomica`, `minosUser`, etc.) y orden de borrado correcto respetando FK.
8. **Prevención**: Nunca usar `create` en tablas con `@unique` si el dato puede existir de ejecuciones previas. Usar `upsert` o pre-check explícito. Antes de lanzar un script de reset, verificar que los nombres de modelo coinciden con el schema generado de Prisma.

## C-021 · tipo_transmision AUTOMATICO vs AUTOMATICA (2026-04-07)

1. **Estado**: Resuelto
2. **Impacto**: Bajo — inconsistencia cosmética que podría generar confusión en filtros futuros
3. **Origen**: `app/src/app/(auth)/onboarding/page.tsx`
4. **Contexto**: El formulario de onboarding guardaba `AUTOMATICO` pero el schema Prisma documenta el valor como `AUTOMATICA`. Esto generaba datos inconsistentes en la BD.
5. **Solución**: Corregido a `AUTOMATICA` tanto en el valor por defecto como en la opción del select.
6. **Prevención**: Definir los valores de enum como constantes compartidas entre frontend y backend.

---

## 2026-05-03 · Fase 1 + Fase 2 (operacional crítico + OCR útil)

### C-016 · Cierres mensuales filtraban por estado fantasma `VALIDADO`
- Area: Backend / cierres
- Problema: `cierre.routes.ts` filtraba partes con `estado: 'VALIDADO'`. El estado no existe en el schema Prisma (solo `BORRADOR`, `ENVIADO`, `FOTO_SUSTITUIDA`). Resultado: todos los cierres en producción salían con 0 partes.
- Causa: Estado planeado pero nunca implementado en el flujo. Filtrado por una etiqueta sin ningún writer.
- Solucion: Filtrado cambiado a `{ in: ['ENVIADO', 'FOTO_SUSTITUIDA'] }`. `VALIDADO` queda reservado para fase posterior con flujo real de validación si se necesita.
- Prevencion: Cuando un estado se planee pero no se implemente, no filtrar por él. Usar test de integración que cree un parte y consulte cierres.

### C-017 · PeriodFilter usaba rolling 30 días en vez de mes natural
- Area: Frontend / filtros
- Problema: `period-filter.tsx` con `setMonth(now.getMonth() - 1)` daba rango "hace 30 días → hoy", no del 1 del mes en curso. Default era `'all'` (histórico). Sin opción de mes anterior.
- Causa: Implementación inicial confundió "último mes" (rolling) con "mes natural en curso".
- Solucion: Reescrito `getRangoPeriodo()` con cálculo de calendario real. Opciones: `mes_actual`, `mes_anterior`, `semana`, `all`. Default `mes_actual`. Fechas en formato unificado `YYYY-MM-DD`.
- Prevencion: Para periodos contables, calcular siempre con `new Date(year, month, 1)` y `new Date(year, month, 0)` (último día del mes anterior). No usar `setMonth(-1)`.

### C-018 · Dashboard mezclaba histórico de gastos con periodo de partes
- Area: Frontend + Backend / dashboard económico
- Problema: `admin/page.tsx` filtraba partes por desde/hasta pero llamaba `getGastosResumen()` sin fechas. `/api/gastos/resumen` además ignoraba filtros de fecha y omitía gastos fijos. Beneficio estimado mezclaba periodo seleccionado con gastos históricos totales.
- Causa: Cálculos duplicados entre dashboard e informes con implementaciones inconsistentes.
- Solucion: Nuevo servicio `resumen.service.ts` y endpoint `GET /api/dashboard/resumen?desde=&hasta=`. Calcula partes (filtrados por estado y fecha), gastos variables (filtrados por fecha), gastos fijos (prorrateados a mensualidad por periodicidad). Admin e informes consumen el mismo endpoint.
- Prevencion: Lógica de cálculo financiero centralizada en un único servicio backend. Nunca duplicar agregaciones en frontend.

### C-019 (revisado) · Parte podía quedar `ENVIADO` sin fotos obligatorias
- Area: Backend + Frontend / fotos parte diario
- Problema: El parte se creaba en `ENVIADO` antes de subir fotos. Si fallaba upload o vincular, el parte quedaba válido sin fotos. La validación de rol estaba solo en frontend (eludible).
- Causa: Diseño optimista sin estado intermedio ni validación backend.
- Solucion: Flujo asalariado en dos pasos:
  1. POST `/api/partes` con `borrador:true` → estado `BORRADOR` (no computa en cierres ni listados por defecto).
  2. POST `/api/upload` + POST `/api/fotos` para cada ticket.
  3. PATCH `/api/partes/:id/confirmar` → backend valida fotos según rol; si OK pasa a `ENVIADO`.
  El patrón sigue creando `ENVIADO` directo sin fotos (regla de negocio intacta).
  Reanudación: GET `/api/partes/borrador/actual?vehiculo_id=&fecha=`.
  Descarte: DELETE `/api/partes/:id` (solo BORRADOR).
  Limpieza: scheduler diario a las 03:00 elimina BORRADOR > 48h para evitar bloqueo del unique `[vehiculo_id, fecha_trabajada]`.
- Prevencion: Nunca dar por válido un parte sin sus documentos obligatorios verificados en backend. Estado intermedio + validación final atómica.

### C-020 · Hash de deduplicación incluía `Date.now()` y nunca detectaba duplicados
- Area: Backend / fotos
- Problema: `foto.routes.ts` calculaba `sha256(url + Date.now())`. Cada upload generaba un hash distinto incluso con el mismo fichero. La unicidad por `hash_sha256` en `Documento` no servía para nada.
- Causa: Implementación inicial sin acceso al buffer del fichero.
- Solucion: `upload.routes.ts` calcula `sha256` real del buffer al subir y devuelve `hash_sha256`. `foto.routes.ts` busca documento existente por hash; si ya está vinculado al parte responde `duplicado:true`; si existe pero no está vinculado, reutiliza el documento y crea solo el enlace.
- Prevencion: El hash debe ser del contenido real, nunca de URL ni metadatos volátiles.

### C-021 · OCR ilegible silenciado al usuario
- Area: Frontend / fotos
- Problema: Cuando OCR fallaba, backend devolvía 201 con `legible: false` y creaba `TareaPendiente`. El frontend no leía el campo `legible` y mostraba al usuario "✓ enviado" como si todo fuese bien.
- Causa: Contrato de respuesta no consumido por el cliente.
- Solucion: `vincularFoto` propaga `legible` y `duplicado`. El formulario muestra banner amarillo "Ticket subido pero poco legible" sin bloquear el envío del parte.
- Prevencion: Cuando un endpoint devuelve un campo de estado, el cliente debe consumirlo o rechazar la respuesta.

### C-022 · Sin comparación entre OCR y datos declarados
- Area: Backend / OCR
- Problema: Los datos extraídos por OCR se guardaban en `Documento.ocr_datos_extraidos` pero nunca se cruzaban con `ParteDiario.ingreso_bruto` ni `combustible`.
- Causa: Funcionalidad planeada y no implementada.
- Solucion: Nuevo `ocrComparacion.service.ts` ejecutado tras `confirmarParte`. Tolerancias: taxímetro ±3 €, combustible ±0.50 € (suma de tickets). Si supera tolerancia, crea `Anomalia` tipo `NORMAL` (no bloquea el envío). Combustible permite múltiples tickets vinculados al mismo parte.
- Prevencion: La comparación es parte del valor del OCR; sin ella el OCR es solo storage.

---

## 2026-05-05 · Módulo tickets/fotos/OCR/cotejo (rama fix/tickets-fotos-ocr-cotejo)

### C-024 · URL de uploads era http:// en producción HTTPS

- Area: Backend / Storage
- Problema: upload.routes.ts construía la URL con req.protocol, que devuelve 'http' detrás del proxy HTTPS de Coolify sin trust proxy activado. Las URLs guardadas en Documento.url eran http:// → mixed-content en el frontend HTTPS.
- Causa: Express no confía en cabeceras X-Forwarded-Proto sin app.set('trust proxy', true).
- Solución: Añadido app.set('trust proxy', true) en index.ts. Añadida variable PUBLIC_BASE_URL como fuente canónica de la URL base en upload.routes.ts.
- Prevención: Siempre activar trust proxy cuando el backend está detrás de un reverse proxy. PUBLIC_BASE_URL debe estar en el checklist de despliegue.

### C-025 · Ausencia de validación de tenencia en endpoints de foto y parte

- Area: Backend / Seguridad
- Problema: GET /api/partes/:id y todos los endpoints de /api/fotos/* no verificaban que el recurso perteneciera al mismo cliente_id del usuario autenticado. Cualquier usuario autenticado podía leer partes de otro cliente usando el UUID.
- Causa: Endpoints implementados con solo requireAuth, sin comprobación de tenencia.
- Solución: Añadida función verificarTenencia() en foto.routes.ts. GET /api/partes/:id y DELETE /api/partes/:id comprueban vehiculo.cliente_id === req.usuario.cliente_id. Admin bypasea la restricción.
- Prevención: Toda ruta que recibe un ID de recurso debe verificar tenencia, no solo autenticación.

### C-026 · OCR de taxímetro extraía solo un número genérico

- Area: Backend / OCR
- Problema: validarTicketTaximetro usaba regex genérica "último número del texto" como importe. No extraía P Total, P Dist.Total, Borrados ni ningún campo estructurado. El cotejo comparaba el importe incorrecto.
- Causa: Implementación inicial sin conocimiento del formato de tickets de taxímetro español.
- Solución: Reescrito validarTicketTaximetro con detección de secciones ACUMULADOS/PARCIALES y extracción de 20+ campos. Interfaz DatosTaximetro con prefijos acum_* y parc_*. Normalización automática de distancias metros→km.
- Prevención: Antes de implementar OCR sobre un dominio específico, estudiar el formato real del documento.

### C-027 · Cotejo sin trazabilidad ni comparación de km/Borrados

- Area: Backend / Cotejo
- Problema: ocrComparacion.service.ts solo comparaba importe vs ingreso_bruto. No comparaba km, no detectaba incrementos anómalos de Borrados (manipulación del taxímetro), y las Anomalias no tenían referencia al parte ni al documento.
- Causa: Implementación inicial mínima.
- Solución: Añadidas comparaciones: P Dist.Total vs km (±6km), acum_borrados actual vs ticket anterior del mismo vehículo (CRITICA si diff > 1 o decrece). Anomalia ahora incluye parte_diario_id y documento_id. Nuevo campo estado_ocr en Documento.
- Prevención: El cotejo es el valor real del OCR; sin comparación de todos los campos clave, es solo storage.

### C-028 · Ausencia de endpoints de gestión documental (eliminar, reintentar OCR)

- Area: Backend / API
- Problema: No existía forma de desvincular un documento de un parte (imprescindible en BORRADOR) ni de reintentar el OCR sin sustituir el fichero físico.
- Causa: Funcionalidad no implementada en la fase inicial.
- Solución: Nuevos endpoints DELETE /api/fotos/:id (desvincular, solo BORRADOR) y POST /api/fotos/:id/reintentar-ocr (re-procesar OCR sin consumir intentos de reemplazo).
- Prevención: Los flujos de corrección deben estar completos antes de activar restricciones de bloqueo.

### C-023 · Mensajes de error de upload genéricos
- Area: Frontend / upload
- Problema: `upload.ts` lanzaba `throw new Error('Error subiendo foto')` para todo. El usuario no podía distinguir tamaño excesivo, formato no soportado, sesión caducada o caída del servidor.
- Causa: Implementación mínima sin diferenciar códigos HTTP.
- Solucion: Mapping explícito de 413 (file_too_large), 415 (invalid_mime), 401 (sesión expirada con redirect), errores de red, fallo del servidor. Backend `upload.routes.ts` añade middleware multer-error que traduce `LIMIT_FILE_SIZE` y MIME inválido a 413/415 con mensaje claro.
- Prevencion: Diferenciar mensajes según código HTTP. El usuario debe saber si puede arreglarlo (foto más pequeña) o necesita ayuda técnica.

---

## 2026-05-19 · V1 ajustes (rama `work/pilotos-v1-ajustes-2026-05-19`, mergeada a `main` el 2026-05-21)

Tres ajustes funcionales + una incidencia de despliegue documentada al final.

### C-029 · Fotos legibles se marcaban como ILEGIBLE (Punto 1)
- Area: Backend / OCR
- Problema: Fotos reales de tickets de taxímetro nítidas (ej. licencia 562 S. CRUZ, P Total 113,40 €) acababan en `estado='ILEGIBLE'`. El frontend mostraba al usuario "foto dañada" y le obligaba a reemplazar.
- Causa: `estadoOcrFinal()` declaraba `ILEGIBLE` si la confianza de Tesseract (`UMBRAL_CONFIANZA = 60`) o la validación estructurada caían por debajo del umbral. Tickets térmicos reales bajan a ~35–55 de confianza aunque sean legibles a ojo. Además solo había dos estados (`ILEGIBLE` / `VALIDO`) — no existía un punto medio.
- Solucion: Separación estricta entre "imagen procesable" y "OCR concluyente". Nueva función `analizarImagen()` (Sharp: metadata + stdev luminancia) es la única que puede declarar `ILEGIBLE` — solo si Sharp no abre el fichero, las dimensiones son <200 px o la imagen es prácticamente monocromática. Nuevo estado intermedio `PENDIENTE_REVISION` cuando la imagen es procesable pero el OCR es parcial o roto. Tesseract puede fallar sin que la foto se considere ilegible. Decisión cristalizada en [DT-033](../decisiones/decisiones-tecnicas.md#dt-033--estado-pendiente_revision-para-ocr-parcial-en-imagen-procesable).
- Prevencion: La pipeline de OCR debe distinguir "no puedo abrir esto" de "la imagen está bien pero no le saco datos". Smoke test sintético en `backend/scripts/smoke-analizar-imagen.ts` con 6 casos (foto normal, negra, blanca, miniatura, archivo corrupto, patrón tipo ticket). Refactores futuros deben mantener `analizarImagen()` como puerta única a `ILEGIBLE`.

### C-030 · Documentos legacy en ILEGIBLE bloqueaban re-subida (Punto 1)
- Area: Backend / dedupe documental
- Problema: Tras arreglar C-029 en local, las fotos seguían apareciendo como ILEGIBLE al re-subirlas. La pipeline nueva (`analizarImagen`) nunca llegaba a ejecutarse.
- Causa: La deduplicación por SHA-256 en `POST /api/fotos` encontraba el documento previo (subido con la lógica vieja, estado `ILEGIBLE`) y devolvía ese tal cual. Sin re-procesamiento.
- Solucion: En el camino de dedupe, si el documento existente está en `ILEGIBLE` se re-ejecuta la pipeline (`analizarImagen` + OCR + `estadoOcrFinal`) antes de devolverlo. Si pasa a `VALIDO` o `PENDIENTE_REVISION`, se actualiza el documento y se cierra cualquier `TareaPendiente FOTO_ILEGIBLE` residual. No consume intentos de reemplazo (es el mismo fichero).
- Prevencion: La dedupe documental no puede ser un atajo que evite re-validar cuando el estado anterior es de fallo. Si el estado heredado es ILEGIBLE/BLOQUEADO/ERROR, recalcular antes de reutilizar.

### C-031 · Comparación parte↔ticket silenciosa y nunca disparada para patrones (Punto 1)
- Area: Backend / OCR + UX
- Problema: El servicio `ocrComparacion.service.ts` extraía P Total, km, fecha, etc., pero las discrepancias se escribían solo como `Anomalia` en BD — invisibles al usuario. Además, el trigger vivía exclusivamente en `PATCH /api/partes/:id/confirmar` (camino asalariado). Los patrones crean el parte directamente en `ENVIADO` vía `POST /api/partes` y suben fotos después, así que la comparación nunca corría para ellos.
- Causa: Implementación inicial pensada solo para flujo asalariado. Faltaba persistencia visible al usuario.
- Solucion:
  - `compararDocumentosConParte()` devuelve `ResultadoComparacion` con `Discrepancia[]` estructurada por documento y persiste en `documento.ocr_datos_extraidos.discrepancias`.
  - Añadida comparación de fecha (±1 día, tolera turnos nocturnos). `validarTicketGasoil` ahora extrae fecha.
  - Idempotencia: `deleteMany({ where: { parte_diario_id } })` sobre `Anomalia` al inicio del cálculo. Recalcular nunca duplica.
  - Helper `recompararSiEnviado()` en `foto.routes.ts` dispara la comparación al final de `POST /api/fotos`, `/:id/reemplazar` y `/:id/reintentar-ocr` cuando el parte ya está enviado. Cubre el camino patrón.
  - Frontend: banner ámbar específico de discrepancia en `partes/[id]/page.tsx`. Toast post-confirmar incluye contador. Tolerancias documentadas en [DT-031](../decisiones/decisiones-tecnicas.md#dt-031--cotejo-ocr-completo-con-trazabilidad).
- Prevencion: Cualquier servicio que cree señales para el usuario tiene que tener camino de visualización (no solo `Anomalia` en BD). Si dos flujos crean un parte (asalariado vs patrón), los servicios post-procesado deben dispararse en ambos.

### C-032 · Panel sin desglose datáfono vs efectivo estimado (Punto 2)
- Area: Backend `resumen.service.ts` + Frontend `admin/page.tsx`, `informes/page.tsx`
- Problema: El panel ya sumaba `ingreso_bruto` y `ingreso_datafono` pero no exponía el complementario (efectivo estimado). En informes se calculaba inline (`bruto - datafono`), riesgo de divergencia.
- Causa: Métrica obvia derivable, simplemente no expuesta.
- Solucion: Campo derivado `efectivo_estimado = max(0, bruto - datafono)` en el output de `calcularResumen()`. `max(0, …)` defensivo por si algún parte tiene datáfono > bruto (input erróneo). Card "Desglose de cobros del periodo" en `/admin` con cifras grandes, porcentajes y barra proporcional azul/verde, etiqueta "todo en efectivo" cuando datáfono=0. Informes consume el campo en lugar de calcular inline.
- Prevencion: Métricas derivables que aparezcan en >1 pantalla deben vivir en backend (servicio común) y no en cálculos UI inline.

### C-033 · UI mostraba referencias a asalariado sin asalariados (Punto 3)
- Area: Frontend / multi-pantalla
- Problema: Para un patrón que trabaja solo aparecían textos y tarjetas pensados para asalariado: StatCard "A Conductor — Liquidación asalariado" en informes, 3 columnas de reparto en detalle del parte, "Conductor desconocido" como fallback en header, CTA "Gestionar Flota y Conductores" en admin.
- Causa: La app se diseñó originalmente asumiendo siempre asalariado. No había señal en la sesión para diferenciar casos.
- Solucion: `/auth/login` calcula `context.tiene_asalariados = (COUNT(conductor WHERE cliente_id=X AND es_patron=false AND activo) > 0)`. `SessionUser` persiste el flag. Pantallas con copy/tarjetas específicas se condicionan a él. Cálculo económico intacto. Decisión técnica en [DT-034](../decisiones/decisiones-tecnicas.md#dt-034--flag-tiene_asalariados-en-context-de-login-para-ui-condicional).
- Prevencion: Cuando el dominio tiene casos cualitativos (con/sin asalariados, con/sin combustible, etc.), exponer la señal explícitamente desde el backend al cargar sesión. No hacer que el frontend la infiera de datos parciales (vacío != ausencia).

### C-034 · Coolify no rebuild el frontend automáticamente tras push a main
- Area: Despliegue / Coolify
- Problema: Tras mergear los 3 puntos a `main` y hacer `git push`, el backend redeployó solo pero el frontend no. El usuario veía cambios parciales (Punto 1 backend) pero no las cards/banners visuales (Puntos 2 y 3).
- Diagnóstico: Comparé los hashes de los 12 chunks JS de `pilotos.nexostudios.digital` antes y después del push — idénticos. Confirmado: Coolify no había rebuild el servicio frontend. `Cache-Control: s-maxage=31536000` y `X-Nextjs-Cache: HIT` en los headers de respuesta.
- Causa: Coolify tiene servicios separados para backend y frontend de PilotOS. El webhook GitHub solo disparó rebuild de uno (o el del frontend tardó/falló silenciosamente).
- Solucion: Redeploy manual del servicio frontend en Coolify. Tras eso, los chunks JS cambiaron de hash y las strings nuevas (`tiene_asalariados`, `efectivo_estimado`, `Desglose`, etc.) aparecieron.
- Prevencion: Tras un deploy a `main`, **verificar visualmente AMBOS servicios** (backend y frontend) en Coolify. Si Coolify no dispara rebuild de uno en ~3 minutos, redeploy manual. Para diagnosticar rápido: `curl -sI https://pilotos.nexostudios.digital/ | grep Etag` antes y después del push — si el ETag no cambia, no hay rebuild.

## 2026-07-25 · Auditoria de seguridad, cierre de pendientes

### C-035 · uncaughtException mantenia el proceso vivo "a ciegas" (R-SY-001 sin verificar)
- Area: Backend `index.ts`
- Problema: El handler de `process.on('uncaughtException', ...)` solo logueaba y NO salia del proceso, con el comentario "R-SY-001: El backend nunca debe caer". Decision tomada sin verificar si el orquestador (Coolify/Docker) reinicia el contenedor si el proceso muere — mantener vivo un proceso tras una excepcion no capturada arrastra estado potencialmente corrupto (conexiones a medio abrir, listeners duplicados).
- Diagnostico: Con acceso SSH real al servidor de Coolify, `docker inspect` sobre el contenedor de PilotOS backend en produccion confirmo `RestartPolicy: unless-stopped`. Docker reinicia automaticamente el proceso si termina, en segundos.
- Causa: La regla R-SY-001 se aplico literalmente ("nunca caer" = "nunca salir del proceso") sin comprobar que el objetivo real (disponibilidad del servicio) ya estaba cubierto por la politica de reinicio del orquestador.
- Solucion: `process.on('uncaughtException')` ahora loguea y hace `process.exit(1)`. Verificado con un script aislado (proceso hijo) que confirma exit code 1. R-SY-001 se sigue cumpliendo en su intencion: el servicio no queda caido, solo se reinicia limpio en vez de seguir corriendo con estado desconocido.
- Prevencion: Antes de descartar una recomendacion de "mejores practicas" (aqui: salir del proceso tras uncaughtException) por contradecir una regla de negocio documentada, comprobar si la regla y la practica realmente entran en conflicto en producción, no solo en el codigo. Aqui no entraban en conflicto: la regla hablaba de disponibilidad, la practica de limpieza de estado; el orquestador ya resolvia la disponibilidad.

### C-036 · GlorIA (y NexOS Pay) con fqdn `http://` en Coolify — sin router HTTPS
- Area: Infraestructura / Coolify
- Problema: `https://iswss8gk8kwckwgwo4wkc0k0.161.97.108.106.sslip.io` (URL publica de GlorIA) devolvia 503 "no available server". Bloqueaba la integracion PilotOS→GlorIA (avisos de mantenimiento) por HTTPS.
- Diagnostico: Consultando `applications.fqdn` en la BD de Coolify (`coolify-db`), GlorIA (id=3) y Nexos_Pay (id=9) son las UNICAS 2 apps de 11 con `fqdn` guardado como `http://` en vez de `https://` — comparacion directa con las otras 9, todas `https://`. Corregido el campo (`https://...`) y redeployado GlorIA: la app sigue sirviendo solo por HTTP, Traefik no genera el router HTTPS. Rastreado hasta `fqdnLabelsForTraefik()` en el codigo de Coolify (bootstrap/helpers/shared.php), que depende de una ruta de generacion de labels distinta para recursos con `com.docker.compose.*` (como GlorIA) — no resuelto, requeria seguir modificando logica interna de Coolify en produccion sin garantia de no romper otras apps.
- Causa: Configuracion original de GlorIA (y separadamente NexOS Pay) con el scheme equivocado en el campo `fqdn`, probablemente desde su alta inicial en Coolify.
- Solucion aplicada: `GLORIA_API_URL` en PilotOS usa `http://` (funciona, verificado extremo a extremo con redeploy y healthcheck). El `fqdn` de GlorIA quedo corregido en BD aunque el router HTTPS no se genera todavia.
- **Resuelto** (mismo dia, ver mas abajo): el router HTTPS no se regeneraba porque Coolify usa `applications.custom_labels` (texto base64 con el set COMPLETO de labels Traefik) como cache al desplegar, en vez de regenerarlo siempre desde `fqdn`. Corregir solo `fqdn` no bastaba. Solucion real: decodificar el `custom_labels` de una app que SI funciona en https (PilotOS backend, id=1) como plantilla, construir el equivalente para GlorIA (mismo patron: router http con redirect-to-https + router https con tls/certresolver=letsencrypt, sustituyendo uuid/host/puerto), guardarlo en `custom_labels` de GlorIA via el modelo Eloquent (no SQL crudo — evita corromper el formato) y redeploy. Verificado: `https://iswss8gk8kwckwgwo4wkc0k0.161.97.108.106.sslip.io/health` con certificado real de Let's Encrypt (`curl` sin `-k`), y `http://` redirige a `https://` (302). `GLORIA_API_URL` en PilotOS actualizado a `https://`.
- **Tambien resuelto** (mismo dia, a peticion expresa de Alberto): NexOS Pay (id=9, puerto 3005) tenia identico `fqdn` en `http://` y el mismo `custom_labels` desactualizado. Mismo procedimiento exacto: `fqdn` corregido, `custom_labels` reconstruido con el patron de router https + certresolver=letsencrypt, guardado via Eloquent, redeploy. Verificado: `https://e8wgckw0c8c8444c0w8owgog.161.97.108.106.sslip.io/health` responde 200 con certificado real de Let's Encrypt, `http://` redirige a `https://` (302).

### C-037 · Migraciones versionadas (prisma migrate deploy) en vez de SQL acumulativo
- Area: Backend / pipeline de deploy
- Problema: `migrations_pendientes.sql` (aplicado con `prisma db execute` en cada arranque) no registra que version esta aplicada en cada entorno, no distingue drift real de diferencias cosmeticas, y no escala a cambios complejos (rollback, cambios de tipo, etc.).
- Diagnostico: `prisma migrate diff --from-url <prod> --to-schema-datamodel schema.prisma` (solo lectura) confirmo que el unico drift real entre la BD de produccion y schema.prisma era cosmetico: nombres de indices (`idx_anomalias_estado` vs el nombre que generaria Prisma) y `VARCHAR(N)` vs `TEXT` en 3 columnas sin impacto funcional. Nada estructural fuera de sincronia.
- Solucion: Baseline generado por introspeccion de la BD REAL (no de schema.prisma, para no forzar los cambios cosmeticos como efecto colateral) via `prisma db pull` + `prisma migrate diff --from-empty --to-schema-datamodel <introspeccion>`, guardado en `prisma/migrations/0_baseline/migration.sql` (549 lineas, las 3 schemas: ledger/minos/pilotos) y marcado como ya aplicado con `prisma migrate resolve --applied 0_baseline` (0 pasos ejecutados, es solo un registro). `npm run db:deploy` ahora es `prisma migrate deploy`. Verificado: `prisma migrate status` → "Database schema is up to date!" contra produccion; `prisma migrate deploy` contra una BD local vacia reconstruye el esquema completo y los 6 tests de integracion pasan igual. `migrations_pendientes.sql` deprecado (contenido historico en `prisma/_historico/`), `scripts/apply-pending-sql.js` marcado deprecado pero conservado. `DEPLOY_COOLIFY.md` actualizado.
- Prevencion: Para cambios de schema futuros, `npx prisma migrate dev --name <descripcion>` en local genera la migracion versionada; se commitea junto al cambio de `schema.prisma`. Nunca editar `prisma/migrations/` a mano ni usar `prisma db push` contra produccion.

### C-038 · Firewall del puerto 5433 (Postgres compartido) — decision: no tocar
- Area: Infraestructura / seguridad
- Hallazgo: `ufw status` en el servidor Contabo (161.97.108.106) NO incluye el puerto 5433 en su lista de reglas — pero SI esta accesible publicamente (confirmado por conexion TCP directa). Causa: Docker manipula iptables directamente para publicar puertos de contenedores (`docker-proxy` + reglas DNAT), y esas reglas se evaluan ANTES que las de ufw en el pipeline de netfilter — es un problema conocido de Docker+UFW, no un fallo de configuracion de ufw en si. El mitigador estandar es una regla en la cadena `DOCKER-USER` (que Docker SI respeta) restringiendo por IP de origen.
- Decision de Alberto: no tocar. No hay una lista confirmada de que IPs de desarrollo/CI dependen de este acceso publico directo; una regla mal calibrada corta accesos legitimos en caliente sobre una BD compartida por todo el ecosistema.
- Prevencion / para retomar cuando se decida: reunir primero la lista real de IPs que se conectan (logs de conexion de Postgres, `pg_stat_activity` con logging de conexiones habilitado, o revisar quien necesita el acceso directo hoy) antes de escribir cualquier regla en `DOCKER-USER`.

## 2026-08-07 · Acceso

### C-039 · No hay flujo de recuperacion de contrasena (bloqueo de acceso a produccion)
- Area: Backend `auth.routes.ts` / operativa
- Problema: Alberto no podia entrar en `https://pilotos.nexostudios.digital/`. Su cuenta (`minos.Users` id=25, `+34615380646`, role `landlord` — la unica con telefono, y por tanto la unica que puede hacer login) tenia un `password_hash` bcrypt real, fijado en algun momento tras la Fase 1 de la auditoria y despues olvidado.
- Causa: La Fase 1 (C de la auditoria 2026-07-24) sustituyo el login "solo telefono" por telefono + bcrypt, pero solo dejo dos caminos: `POST /auth/establecer-password` (unicamente si el hash sigue siendo un marcador placeholder) y `POST /auth/cambiar-password` (exige la contrasena actual). No se anadio ningun "he olvidado mi contrasena", asi que una cuenta con contrasena real y olvidada queda **permanentemente fuera** sin acceso a la base de datos.
- Solucion aplicada: Backup del hash anterior a fichero local y `UPDATE minos."Users" SET password_hash = 'ONBOARDING_INITIAL_STEP' WHERE id = 25`. Eso devuelve la cuenta al estado placeholder, con lo que el login de produccion responde `password_not_set` / `action: SET_PASSWORD` (verificado con `curl` contra produccion) y el frontend muestra el formulario de fijar contrasena. Alberto elige la contrasena; en ningun momento la maneja otra persona.
- Nota de exposicion: mientras la cuenta esta en placeholder, cualquiera que conozca el telefono podria fijar la primera contrasena (misma superficie que ya documenta el comentario de `establecer-password`). La ventana se cierra en cuanto Alberto entra y fija la suya. `authLimiter` limita a 10 intentos por IP cada 15 min.
- Prevencion: PilotOS necesita un reset real. Lo natural en el ecosistema es **OTP por WhatsApp via GlorIA** — que es exactamente la verificacion de posesion del telefono que ya quedo pendiente de decision de negocio en el comentario de `POST /auth/establecer-password`. Mientras no exista, cualquier bloqueo de acceso obliga a tocar la BD de produccion a mano. Anadido a `docs/PENDIENTES.md` del ecosistema.

## 2026-08-07 · Branding

### C-040 · Iconos de app y de pestaña con un simbolo redibujado, no el del logo
- Area: `app/public/branding/pilotos/`, `app/src/app/favicon.ico`, `manifest.json`
- Problema: Todos los iconos (PWA, apple-touch, favicon) usaban una "P" redibujada a mano: le faltaba la linea diagonal de la plumilla y el punto amarillo caia dentro del contraforma en vez de en su extremo. Ademas `logo-full.png` y `logo-compact.png` eran el logo **vertical** con fondo negro quemado (4096x2783, 2 MB cada uno, ficheros identicos), servidos en huecos de cabecera pensados para un lockup horizontal (`h-9 w-auto`, ~190x56): el resultado era un bloque cuadrado, no el logo horizontal que el layout espera.
- Causa: Cuando se monto la app no habia material transparente del pack de branding, y se rehizo el simbolo a ojo. El pack (`PilotOS_Branding_Final_v4/BRAND_GUIDE.md`) avisa explicitamente de que el logo es raster de resolucion limitada y **no se debe redibujar ni vectorizar**.
- Solucion: Todo se genera ahora con `npm run branding` (`app/scripts/build-branding-assets.mjs`) desde una unica fuente, `00_referencia/PilotOS_logo_horizontal_dark_transparente.png`:
  - Lockup horizontal limpio → `logo-full.png` (1200 px) y `logo-compact.png` (800 px).
  - Simbolo recortado del propio lockup (columnas 230–605, antes del separador) → tile redondeado sobre `#05070B` para `icon-512/192/180`, `logo-icon`, `favicon-32` y un `icon-maskable-512` nuevo con 26 % de margen (antes `purpose: maskable` apuntaba al mismo icono que `any`, que Android recorta).
  - `src/app/favicon.ico` reconstruido (frames PNG 16/32/64/128/256).
  - `manifest.json`: `theme_color` era `#8DC63F` (un verde anterior al branding v4) → `#FFB703`, y `background_color` `#07111E` → `#05070B`. Ahora coincide con los tokens de `globals.css` y con el `themeColor` del viewport.
  - `sw.js`: `CACHE_NAME` a `pilotos-shell-v3` — el `activate` borra toda cache que no sea la actual, que es lo que purga los iconos viejos ya cacheados en los dispositivos.
- **Gotcha que costo encontrar:** el icono de la pestaña **no** sale de `metadata.icons` en `layout.tsx`. Next.js sirve `src/app/favicon.ico` por convencion de fichero y ese gana. Cambiar solo los PNG no habria cambiado nada visible en la pestaña.
- **Segundo gotcha:** los PNG "transparentes" del pack no lo estan del todo. El recorte automatico deja halo de alfa muy baja (el horizontal solo tenia el 80,5 % de pixeles a alfa 0; el simbolo suelto `PilotOS_icono_P_transparente.png`, un 22 %). No se ve en un visor de imagenes, pero sobre fondo oscuro deja un rectangulo grisaceo. El script limpia alfa ≤ 48 y reescala el resto a 0–255 para no perder el antialiasing.
- Prevencion: Nunca redibujar un logo del ecosistema. Si el pack no trae el recorte que hace falta, se extrae del asset oficial (como aqui el simbolo, sacado del propio lockup) y se deja el proceso en un script versionado, no a mano. `PilotOS_Branding_Final_v4/` esta ahora en el repo para que `npm run branding` sea reproducible.
- Nota operativa: una PWA ya instalada **conserva el icono de la pantalla de inicio** hasta que se desinstala y se vuelve a instalar — es del sistema operativo, no del service worker.

### C-041 · El webhook de Coolify no encolo NADA tras el push (amplia C-034)
- Area: Despliegue / Coolify
- Problema: Tras subir `4c9b2ef` (iconos) a `main`, produccion seguia sirviendo el favicon antiguo. C-034 describia el caso de "solo uno de los dos servicios se redespliega"; aqui fue peor: **no se encolo ningun deploy**. La misma sesion subio la landing NexOS a su repo y tampoco encolo nada.
- Diagnostico: `SELECT application_id, status, left(commit,7), updated_at FROM application_deployment_queues ORDER BY id DESC` en `coolify-db`. El ultimo deploy del **frontend de PilotOS (app id 5)** era `f6354f0` del **2026-07-24**, y el de la landing (app id 4) `fdaca3e` del **2026-07-30**. Ni una fila fallida: el webhook de GitHub simplemente no llego a crear la entrada. Ojo: `application_id` es `varchar` en esa tabla, comparar con `'5'` y no con `5` o el `IN` peta con `operator does not exist`.
- Implicacion que hay que mirar siempre: si el frontend llevaba 2 semanas sin desplegarse, **todo lo mergeado a `main` en ese intervalo tampoco estaba en produccion**, no solo el cambio que uno acaba de subir.
- Solucion: Encolado a mano desde el servidor con el mismo procedimiento ya documentado para ClinicOS, sin token de API:
  ```bash
  ssh root@161.97.108.106 "docker exec coolify php artisan tinker --execute='
    queue_application_deployment(
      application: App\Models\Application::find(5),
      deployment_uuid: (string) Illuminate\Support\Str::uuid(),
      force_rebuild: false
    );'"
  ```
  Ambos pasaron a `finished` en ~1-2 min. PilotOS son **dos apps distintas** en Coolify: id **1** (backend/api, `api.pilotos.nexostudios.digital`) e id **5** (frontend, `pilotos.nexostudios.digital`).
- Verificacion: no fiarse del estado `finished`. Comparar el md5 del asset local con el que sirve produccion — aqui se comprobaron uno a uno los 6 iconos/logos, el `manifest.json` y que el SVG viejo de la landing devuelve 404.
- Prevencion: Despues de cada `git push` a un repo desplegado por Coolify, consultar la cola antes de dar nada por desplegado. El push a GitHub y el deploy son dos cosas independientes y hoy la segunda no ocurre sola.

### C-042 · Integración con NexOS Pay: alta automática desde el onboarding
- Area: `backend/src/lib/nexos-pay.ts`, `backend/src/routes/onboarding.routes.ts`
- Contexto: norma del ecosistema `docs/arquitectura/nexos-pay-integracion-obligatoria.md` — si alguien puede darse de alta en algo que construimos, esa alta tiene que llegar a NexOS Pay.
- Solución: el patrón que completa el onboarding aparece en NexOS Pay con cliente, suscripción, permiso de acceso y referencia externa, en una sola llamada idempotente. Entra con `tipo_exencion: fase_prueba` sobre el plan `pilotos_autonomo` (tarifa 39 €): hoy paga 0, pero NexOS Pay sabe cuánto ingresaría al terminar las pruebas.
- **Regla que gobierna la integración:** la llamada va **fuera de la transacción y sin `await`**. Si NexOS Pay está caído, tarda o responde mal, el patrón termina su alta igual y solo queda constancia en el log. Un problema de facturación no puede impedir que alguien empiece a usar PilotOS.
- Verificado antes de desplegar (11 de 11 contra un NexOS Pay local): alta correcta, repetirla no duplica, con el servidor caído no lanza, con la red colgada corta a los 4 s.
- **Verificado en producción de punta a punta:** onboarding real → el cliente apareció solo en `pay.nexostudios.digital` con su plan y su exención. Datos de prueba borrados después de los dos schemas.

### C-043 · El parser de tickets del taxímetro confundía turno con histórico, y el control CRÍTICO de manipulación no se ejecutaba
- Area: `backend/src/services/ocr.service.ts`
- Problema: Alberto aportó la foto de un ticket real de taxímetro (2026-08-11) para verificar las medidas antifraude de la auditoría del 10-08. Al correr `validarTicketTaximetro` contra el texto de ese ticket: 8 de los 10 campos del turno leían el valor del acumulado histórico en vez del turno de hoy, y **ningún campo `acum_*` se extraía — incluido `acum_borrados`**, el único control marcado CRÍTICO de todo el sistema (pensado para detectar manipulación del taxímetro). El ticket quedaba marcado `valido: true` sin ningún error, así que nadie lo habría detectado sin comparar contra el ticket real.
- Causa: `extractarSeccionTaximetro` separaba el bloque "acumulado" del "turno" buscando palabras clave de cabecera ("ACUMULADO", "PARCIAL", "TURNO"...) que este modelo de ticket no usa — marca cada campo del turno con un prefijo `P ` suelto, sin cabeceras. Al no encontrar ninguna palabra clave, el código trataba todo el ticket como "turno" y el bloque acumulado quedaba vacío. Además: (a) 8 de los 10 campos del turno no exigían el prefijo "P" en su regex, así que cogían la primera aparición del dato en el texto completo — siempre la del acumulado; (b) la heurística "número > 2000 ⇒ está en metros, divide por 1000" (pensada para valores diarios) corrompía cualquier acumulado real (183.108 km de vida útil pasaban a 183,1 km); (c) "Carreras" se leía como contador entero (`extractNum`) cuando en realidad es un importe en euros con decimales; (d) los campos de tiempo usaban un patrón sin límite de palabra, así que la "t" final de "Dist." + ". " + "Ocupado" se confundía con "Tiempo Ocupado".
- Solución: separador de secciones ahora por línea, usando el prefijo real `P ` como señal primaria (con el método de palabras clave como reserva para otros modelos de taxímetro que sí rotulen secciones). `extractNumDistance` recibe un parámetro `permitirConversionMetros` y nunca se aplica a los campos `acum_*`. "Carreras" pasa a `extractNumCurrency`. Los patrones de tiempo llevan `\b` delante de la "t". Test de regresión permanente `backend/tests/smoke.ocrTaximetro.test.ts` (6 casos) con el texto literal del ticket real como fixture — verificado que los 20 campos coinciden al 100% con el ticket, más un caso de compatibilidad con el formato antiguo por cabecera. 79/79 tests del backend en verde, build limpio.
- Prevención: cualquier campo que se extraiga por OCR necesita, antes de darse por bueno, una prueba contra texto de un documento REAL — el texto sintético de los tests puede validar la sintaxis del regex sin validar que coincide con lo que de verdad imprime el aparato. Cuando se añada un nuevo tipo de ticket o de campo, pedir una foto real y convertirla en fixture de regresión antes de dar la extracción por cerrada.

### C-044 · Los borrados del taxímetro se comparaban contra "máximo +1", no contra los turnos declarados de verdad
- Area: `backend/src/services/ocrComparacion.service.ts`
- Problema: la comparación de borrados (única marcada CRÍTICA) asumía que entre un ticket y el siguiente siempre había exactamente un turno, así que toleraba como máximo +1. Si el conductor sube el ticket cada varios días (varios partes entre dos fotos), el sistema marcaría CRÍTICA una diferencia perfectamente normal. Y al revés: no distinguía entre "el coche se movió sin trabajar" (uso no laboral) y "el coche se movió Y generó ingresos que no se declararon" (trabajo oculto) — dos situaciones muy distintas para el patrón.
- Causa: diseño original más simple, pensado antes de tener B5 (comparación de acumulados de km/€) construida.
- Solución (diseñada con Alberto el 2026-08-11): borrados esperados = borrados del ticket anterior + número de partes (turnos) declarados entre los dos tickets, no un +1 fijo. Si sobran borrados, se cruza con el salto de km y de € acumulados frente a lo declarado en esos partes: solo km de más → aviso de "revisa con tu asalariado, puede ser uso no laboral"; km Y € de más → aviso de "posible trabajo no declarado". Menos borrados de los esperados → CRÍTICA de manipulación, sin mirar km/€. `compararAcumulados` sustituye a `compararBorrados`, con `buscarTicketAnterior` como helper compartido. Test `smoke.ocrAcumulados.test.ts` (7 casos, incluye el caso de varios partes entre tickets que prueba que no es "+1 fijo"). 86/86 tests del backend en verde.
- Prevención: las tolerancias de km (20) y € (5) usadas en esta comparación son un punto de partida, no un valor validado con datos reales — revisar y ajustar cuando haya experiencia con avisos reales generados en producción.

**Gotchas del despliegue, para la próxima:**

1. **El backend llevaba sin desplegarse desde el 2026-07-24.** Se comprobó antes con `git log <commit-desplegado>..main -- backend/`: **cero cambios**, así que el despliegue solo arrastraba esta integración. Hacer siempre esa comprobación antes de desplegar algo que lleva tiempo parado.
2. **Los uuid de contenedor NO se pueden adivinar por el nombre del servicio.** El backend (app id 1) es `pssws88so8cgcwc0ccgcc04w`, no `fgk8o4w088s0c004sg08g84g` (que es otro servicio). Sacar siempre el uuid de `applications.uuid` en la BD de Coolify antes de inspeccionar variables de entorno dentro del contenedor.
3. **Crear variables de entorno en Coolify por Eloquent**, no por SQL: `App\Models\EnvironmentVariable` con `resourceable_id` y `resourceable_type`. Pasar el PHP por fichero (base64 → `docker cp` → `php artisan tinker /tmp/fichero.php`), nunca por `--execute` con comillas anidadas: el shell se come los `$` de PHP y el script se ejecuta a medias.
4. **Un `psql` con `ON_ERROR_STOP` dentro de `BEGIN` deshace TODO.** Un borrado de limpieza que falló a mitad revirtió también la parte que ya había funcionado, y pareció que no se había borrado nada.

### C-045 · La anomalía de fraude no avisaba a nadie activamente, y el panel no permitía cerrarla
- Area: `backend/src/services/ocrComparacion.service.ts`, `backend/src/routes/anomalia.routes.ts`, `GlorIA` (plantilla nueva), `app/src/app/(dashboard)/admin/page.tsx`
- Problema: al construir `compararAcumulados` (C-044), la anomalía CRÍTICA solo escribía una fila en `Anomalia` — nada activo avisaba al patrón. Comprobado que ni siquiera el mecanismo de escalado ya existente en `POST /api/anomalias` (crear `Aviso` si `tipo=CRITICA`) se disparaba, porque el servicio OCR escribe la anomalía directamente por Prisma, sin pasar por esa ruta. Y aunque se disparara, ese `Aviso` tampoco mandaba WhatsApp — ninguna función lo enviaba, `enviarAvisoGloria` (el único sitio que de verdad llama a GlorIA) solo lo usaban los avisos de mantenimiento. Además, el widget "Alertas Pendientes" del panel filtraba por `!notificada` (un campo que este flujo tampoco tocaba), mostraba solo las 4 últimas, y no había ninguna forma de marcar una anomalía como vista — se acumulaban para siempre.
- Causa: la anomalía de fraude se diseñó como registro de auditoría (para el patrón, si mira), no como aviso proactivo; nunca se conectó al canal real de notificación cuando se construyó `compararAcumulados`.
- Solución: `compararAcumulados` llama ahora a `notificarPatronAnomalia`, que usa el mismo `enviarAvisoGloria` que mantenimiento (plantilla nueva `anomalia_taximetro`, con un motivo corto separado del mensaje largo del panel — los templates de Meta no admiten párrafos). Crea también un `Aviso` para trazabilidad, igual que mantenimiento. Un fallo de este envío nunca rompe la comparación (try/catch propio) ni deja de registrar la Anomalia. En el panel: nuevo endpoint `POST /api/anomalias/:id/revisar` (solo patrón, aislado por cliente, idempotente) que pone `estado='RESUELTA'` con quién y cuándo (`revisada_at`, `revisada_por`, columnas nuevas — migración `20260811160000_anomalia_revision`, **sin aplicar todavía**, ver nota abajo); el widget ahora filtra por `estado !== 'RESUELTA'` (sin límite de 4) y cada fila lleva un botón "Marcar revisada".
- Verificado: 92/92 tests del backend (9 nuevos de `compararAcumulados`+aviso, 4 de `/revisar`), build limpio backend y frontend (`next build` completo, no solo typecheck).
- Prevención: cuando una Anomalia se marca CRÍTICA, comprobar explícitamente a qué canal llega — escribir en una tabla no es avisar a nadie. Y toda pantalla que liste "pendientes" necesita una acción que las saque de pendiente, o se convierte en ruido que nadie mira.
- **Pendiente, no cerrado en esta sesión:**
  - La migración de `revisada_at`/`revisada_por` está escrita en `prisma/migrations/20260811160000_anomalia_revision/` pero **no aplicada** — no se ha tocado la base de datos compartida (`161.97.108.106`) sin confirmación explícita. Aplicar con `npm run db:deploy` cuando corresponda.
  - La plantilla `anomalia_taximetro` necesita aprobación de Meta Business — se suma a `mantenimiento_proximo`/`mantenimiento_vencido` (ya pendientes, ver plan de acción). Tres plantillas, no dos.
  - GlorIA: cambios preparados en la rama nueva `fix/pilotos-avisos-mantenimiento-2026-08` (creada desde `gloria-v6`), sin commitear todavía.

### C-046 · El aviso de mantenimiento a GlorIA existía en código pero no estaba documentado ni probado en su tramo real
- Area: `docs/arquitectura/arquitectura-inicial.md`, `backend/tests/smoke.mantenimientoEnvio.test.ts`
- Problema: Alberto preguntó si los avisos de mantenimiento llegaban a GlorIA de verdad. Verificado: la cadena completa existe y está cableada de forma independiente del panel (`scheduler.service.ts` cron diario → `mantenimientoAlertas.service.ts` → `notificacion.service.ts` → GlorIA → n8n → Meta), pero (a) no había ni una línea en `docs/` que describiera este mecanismo concreto — solo dos filas indirectas en `PilotOS_Master.md` sobre el checklist de NexOS Pay; y (b) `smoke.mantenimientoAlertas.test.ts` prueba explícitamente solo la lógica pura de escalones, nunca la llamada real a `enviarAvisoGloria` — su propio docstring lo admite ("la orquestación completa toca BD real y queda pendiente").
- Causa: el mecanismo se construyó y se documentó en comentarios de código (`notificacion.service.ts`, `mantenimientoAlertas.service.ts`), pero nunca se trasladó a `docs/`, y el test de integración pendiente nunca se escribió.
- Solución: nueva sección 5.1 en `arquitectura-inicial.md` con el diagrama completo, las 3 plantillas Meta usadas hoy (`mantenimiento_proximo`, `mantenimiento_vencido`, `anomalia_taximetro`) y los tres requisitos para que llegue de verdad (env vars, plantillas aprobadas, worker importado). De paso, corregidas 3 menciones obsoletas de "migrar a n8n" en el mismo archivo, que contradecían la decisión ya tomada en julio (tachadas, no borradas, con la fecha de la corrección). Test nuevo `smoke.mantenimientoEnvio.test.ts` (4 casos) que sí mockea `enviarAvisoGloria` y comprueba que `procesarMantenimientos` la llama con el teléfono y el `tipo` correctos, que un fallo de GlorIA deja `error_envio` y cuenta como fallido, y que sin teléfono del patrón no revienta.
- Verificado: 96/96 tests del backend, build limpio.
- Prevención: un mecanismo "cableado en el código" no es lo mismo que un mecanismo "verificado" — si nadie prueba el tramo que llama al sistema externo, un test en verde puede convivir años con una llamada que nunca se ejecuta de verdad.

### C-047 · El volumen de subida de fotos no existía en Coolify — todo se perdía en cada redeploy
- Area: Infraestructura / Coolify, app PilotOS backend (id 1, uuid `pssws88so8cgcwc0ccgcc04w`)
- Problema: verificando que `GLORIA_API_URL`/`GLORIA_INTERNAL_TOKEN` estuvieran configuradas (sí lo estaban, y la llamada real a GlorIA respondió correctamente), se comprobó también el resto del contenedor: `docker inspect` devolvía `"Mounts": []` y `local_persistent_volumes` no tenía ninguna fila para esta app. `DEPLOY_COOLIFY.md` documenta `pilotos-uploads:/app/uploads` como "imprescindible", pero nunca se había creado en Coolify. Toda foto de parte o ticket de taxímetro subida desde el último reinicio del contenedor vivía en el sistema de archivos efímero y se habría perdido en el siguiente redeploy.
- Causa: el volumen se documentó como requisito pero nunca se dio de alta en Coolify durante el despliegue inicial ni en ninguno posterior.
- Solución: creado el registro en `local_persistent_volumes` vía Eloquent (`App\Models\LocalPersistentVolume::create(...)`, mismo patrón seguro por fichero que las variables de entorno — nunca `--execute` con comillas anidadas), `name=pssws88so8cgcwc0ccgcc04w-uploads`, `mount_path=/app/uploads`, `resource_type=App\Models\Application`, `resource_id=1`. Encolado un redeploy manual (mismo commit `07aa562`, sin cambios de código) con `queue_application_deployment(...)` — mismo procedimiento que C-041. Verificado tras el deploy: `docker inspect` del contenedor nuevo muestra `volume pssws88so8cgcwc0ccgcc04w-uploads -> /app/uploads` montado, y `/health` responde 200.
- **Lo que esto NO arregla:** lo que ya estaba subido en el contenedor anterior (creado 2026-08-09, sustituido en este redeploy) no se pudo recuperar — no había forma de migrarlo desde aquí. A partir de este redeploy, las fotos nuevas persisten entre reinicios; las de antes, si no se habían perdido ya en un redeploy previo, se perdieron en este.
- Prevención: cuando la documentación dice "volumen imprescindible", verificarlo contra el `docker inspect` real, no dar por hecho que porque está en el doc está aplicado. Añadir esta comprobación a la lista de verificación de cualquier despliegue nuevo.

### C-048 · Terreno para "el propietario manda una foto de un documento y el sistema la encaja sola" — solo el lado PilotOS
- Area: `backend/prisma/schema.prisma`, `backend/src/routes/internal.routes.ts`
- Contexto: Alberto pidió verificar si esto existía (auditoría punto 13 / tarea G3.2 del plan ya lo daba por ausente) y, si no, preparar el terreno sin construir la extracción todavía — misma prudencia que obligó a rehacer el parser del ticket de taxímetro (C-043): las reglas de OCR escritas sin ver el documento real fallan.
- Confirmado ausente: ni código ni documentación de "OCR de factura → mantenimiento" en ningún sitio de PilotOS, y GlorIA no descarga ni reenvía imágenes de WhatsApp (ver `GlorIA/docs/correcciones.md`, misma fecha).
- Solución (solo el tramo de recepción y guardado, sin clasificar ni extraer nada):
  - `Documento` gana `vehiculo_id`/`mantenimiento_vehiculo_id` (nullable, con relación) para poder nacer sin `ParteDiario`. **Deliberadamente no se generalizó `DocumentoEnlace`** (tarea G2 del plan, sigue pendiente) — esa tabla tiene un FK físico a `partes_diarios` y unos ~10 sitios que ya la consultan; el camino aditivo con dos columnas nuevas consigue lo mismo sin ese riesgo. Migración `20260811170000_documento_vehiculo_mantenimiento`, **no aplicada** (misma razón que las anteriores: BD compartida, sin confirmar).
  - Nuevo endpoint `POST /internal/documentos-vehiculo` (solo scope `total`, es decir GlorIA — no está en `RUTAS_HERMES`/`RUTAS_LUCIA`): recibe `{vehiculo_id, imagen_base64}`, reutiliza `procesarYGuardarImagen` (mismo pipeline de compresión que usan los partes), crea `Documento` con `tipo=DOCUMENTO_VEHICULO_SIN_CLASIFICAR`, `estado=RECIBIDO`. Límite de payload propio (15 MB) para no chocar con el límite global de 1 MB de `index.ts`.
  - Convención de `tipo` documentada en el propio schema para cuando exista clasificación: `FACTURA_TALLER` / `CERTIFICADO_ITV` / `POLIZA_SEGURO`.
- Verificado: 101/101 tests del backend, build limpio.
- **Lo que queda, y de quién depende:** el tramo que de verdad dispara todo esto — que `wf-gloria-ai-bridge-v6` (n8n, EN VIVO, compartido por todos los productos) detecte una imagen entrante, la descargue de Meta y llame a este endpoint — no se ha tocado. Es una decisión que le corresponde a Alberto antes de tocar ese workflow.

### C-049 · Sombra de envío para PilotOS (Fase E del plan) — construida
- Area: `backend/src/services/metaPayload.service.ts`, `backend/src/services/mantenimientoAlertas.service.ts`, `backend/src/services/ocrComparacion.service.ts`, `backend/src/routes/internal.routes.ts`
- Contexto: Alberto preguntó por el estado de la sombra de RentOS (reconciliación iCal) para plantear promoverla y, sobre todo, pidió empezar ya la equivalente en PilotOS para ir sacando n8n de la cadena de avisos.
- Verificado antes de tocar nada: la sombra de RentOS **no está lista para promover todavía** — los dos casos "crear" que se repetían cada 6h dejaron de aparecer el 8 de agosto (0 en los últimos 3 días), pero el reloj de las 2 semanas limpias empieza ahí, no antes; faltaría hasta ~22 de agosto. Cero cancelaciones y cero alertas desde siempre, eso sigue firme.
- Solución (solo PilotOS, molde exacto de `core."Sombra_Reconciliacion"` de RentOS): `metaPayload.service.ts` replica byte a byte el nodo "Build Meta Payload" del worker n8n para los tres tipos que PilotOS manda (`mantenimiento_proximo`, `mantenimiento_vencido`, `anomalia_taximetro`) — construye el payload de Meta y lo guarda en `sombra_envios`, **sin mandarlo nunca**. Conectada en los dos sitios reales de envío (`mantenimientoAlertas.service.ts`, `ocrComparacion.service.ts`), siempre en try/catch propio para que un fallo de la sombra jamás toque el envío real. Endpoint de revisión `GET /internal/avisos/sombra?dias=7`, mismo formato que el de RentOS, añadido al alcance de LucIA.
- `coincide`/`resultado_n8n` quedan `null` a propósito: comparar contra lo que n8n hizo de verdad requiere la conciliación de entregas (Fase A del plan, todavía no construida). De momento la sombra solo certifica que el payload que el backend construiría es válido y estable — el primer paso, no el último.
- Verificado: 110/110 tests del backend, build limpio. Migración `20260811180000_sombra_envio` escrita, **no aplicada** (misma prudencia de siempre con la BD compartida).
- Prevención / criterio de promoción: igual que RentOS — no se promueve por antojo. Cuando exista la conciliación de entregas y `coincide=true` sostenido varias semanas sin alertas, decisión explícita de Alberto, nunca automática.

### C-050 · Cierre de la sesión: migraciones aplicadas y despliegue a producción
- Area: BD compartida `nexos` (schema `pilotos`), Coolify apps 1 (backend) y 5 (frontend)
- Contexto: cerrado el trabajo del 2026-08-11 con autorización explícita de Alberto ("acaba a falta de las plantillas").
- **Gotcha importante confirmado:** el `.env` local del backend (`161.97.108.106:5433`) apunta a la MISMA base de datos que producción (`eg40cws0g8okk0o0oso0skgg:5432`, mapeado a 5433 público). No hay BD de desarrollo separada: cualquier `prisma migrate deploy` local va contra producción. Nota: la memoria del proyecto decía que ":5433 público es el Postgres de n8n" — **es incorrecto**, n8n usa `n8n-postgres-1`, sin puerto público.
- Orden seguido, deliberadamente en ese orden: (1) `pg_dump` del schema `pilotos` a `/root/backups-pilotos/`; (2) verificado que `_prisma_migrations` tenía `0_baseline` marcado como aplicado (si no, `migrate deploy` habría intentado recrear el esquema); (3) aplicadas las 3 migraciones **con el código viejo todavía corriendo** — son puramente aditivas (columnas nullable + tabla nueva), así que el código anterior las ignora; verificado `/health` 200 y sin errores en el log tras aplicarlas; (4) push y despliegue del código nuevo. Aplicar antes de desplegar evita el escenario "código nuevo + esquema viejo" que dejaría el contenedor sin arrancar.
- Verificado tras las migraciones: las 4 columnas nuevas existen y son nullable, `sombra_envios` creada con su índice, y los datos intactos (2 anomalías, 3 documentos, 12 partes).
- **El webhook de Coolify volvió a no encolar nada tras el push** (tercera vez documentada, ver C-034 y C-041). Encolados los dos deploys a mano. El frontend (app 5) llevaba sin desplegarse desde el 2026-08-07 — se comprobó con `git log 4c9b2ef..HEAD -- app/` que no había nada acumulado de otras sesiones, solo los cambios de esta.
- Prevención: sigue vigente lo de C-041 — tras cada push, consultar la cola antes de dar nada por desplegado, y comprobar **las dos** apps por separado.

### C-051 · PilotOS envía directo a Meta: fuera la cola, fuera n8n, y fuera la sombra recién hecha
- Area: `GlorIA/src/services/MetaSender.ts`, `GlorIA/src/routes/outbound.routes.ts`, `backend/src/services/{mantenimientoAlertas,ocrComparacion,notificacion}.service.ts`
- **La sombra estaba mal planteada y Alberto lo señaló:** una sombra sirve para observar en paralelo algo que NO te puedes permitir romper porque hay gente real dependiendo — el caso de RentOS, con huéspedes de verdad. PilotOS tiene 1 vehículo y 12 partes de prueba: observar durante semanas un camino que nadie usa era retrasar el cambio sin ganar seguridad. Retirada el mismo día que se construyó (tabla incluida, migración `20260811190000`). Lección: copiar un patrón porque funcionó en otro sitio, sin comprobar que la razón que lo justificaba también se da aquí, es cargo cult.
- **Dónde estaba n8n de verdad:** no entre PilotOS y GlorIA, sino DENTRO del camino de envío de GlorIA (encolaba en `core.Notificaciones` de RentOS y el worker n8n lo recogía con un cron de 30 min). Por eso "quitar n8n de PilotOS" no se arreglaba en PilotOS: PilotOS ya hacía lo correcto, llamar a GlorIA. El cambio va en GlorIA.
- Solución: `MetaSender.ts` habla con la WhatsApp Cloud API directamente. Se activa **solo** para `origin: 'pilotos'` y solo para sus tres plantillas. El token de Meta se queda en GlorIA — no se reparte a los productos, así que la regla de "GlorIA es la única que habla con Meta" sigue intacta. Ganancia: el aviso sale al instante en vez de hasta 30 min después, y `enviado` pasa a significar "Meta lo aceptó" en vez de "quedó encolado".
- **Las dos protecciones que daba la cola, ahora explícitas nuestras** (esto es lo que había que construir, no la sombra):
  1. *Reintento:* si el envío falla, el escalón vuelve a su valor anterior y mañana se reintenta. **Este fallo ya existía** — un fallo puntual de red perdía el aviso de ese escalón para siempre porque el motor lo daba por avisado. No es una regresión del cambio; es que la cola lo disimulaba a medias.
  2. *No duplicados:* `Aviso.dedupe_key` por hecho avisado, no por fecha (mantenimiento → `mant+escalón`; anomalía → `parte`). La anomalía lo necesitaba especialmente: al recalcular un parte se borra y se recrea con id nuevo, así que sin clave estable cada recálculo mandaba otro WhatsApp. Antes lo tapaba por accidente la cola, que deduplicaba por tipo+teléfono+día.
- Verificado antes de tocar el camino compartido: **nadie más llama a `/api/gloria/enviar`** — ni los workflows de n8n ni RentOS (que no lo llama, es al revés: GlorIA le escribe a él). El riesgo sobre las notificaciones de huéspedes era nulo, no solo "bajo".
- Además: salida temprana si faltan `GLORIA_API_URL`/`GLORIA_INTERNAL_TOKEN` (antes recorría toda la flota reservando escalones que luego fallaban), y `/internal/avisos/sombra` sustituido por `/internal/avisos/entregas`, que con el envío directo por fin puede responder "¿se envió de verdad?".
- **RentOS sigue por la cola de siempre, a propósito.** Se migrará cuando el directo esté rodado con PilotOS.
- Verificado: 108/108 tests, build limpio, migraciones aplicadas con backup previo.
- **Verificado en producción de punta a punta (2026-08-11):** llamada real desde el VPS al endpoint con el token de producción →
  ```
  {"status":"FALLIDO","via":"directo","error":"(#132001) Template name does not exist in the translation","codigo_meta":132001}
  HTTP 502 en 0.9s
  ```
  Es el resultado ideal: `via: directo` confirma que no pasa por la cola, Meta contesta en **0,9 segundos** (antes hasta 30 min), y el error aísla el único bloqueo que queda — las plantillas sin aprobar. Comprobado además que un tipo ajeno a PilotOS con `origin=pilotos` cae al camino de la cola sin romper nada.
- **Dos gotchas operativos de esta sesión:**
  1. Encolar dos deploys seguidos de la misma app hace que el segundo tire el contenedor mientras el primero aún sirve peticiones — dio un 504 que parecía un fallo del código y no lo era. Si el webhook ya disparó, **no encolar a mano encima**.
  2. La prueba con `origin` de un tipo que cae a la cola **encola una notificación de verdad** que n8n intentará enviar. Hay que borrarla de `core."Notificaciones"` después. Para probar el camino directo no hace falta: falla en Meta y no deja rastro.
- Prevención: antes de copiar una salvaguarda de otro producto, preguntarse qué riesgo concreto cubre **aquí**. Y al quitar una pieza intermedia (una cola, un worker), listar qué te estaba dando gratis — casi siempre son reintento e idempotencia — y reponerlo explícitamente antes de quitarla.

### C-052 · El cable de las fotos: mandar un documento por WhatsApp y que se archive en el vehículo
- Area: `GlorIA/src/services/MetaMedia.ts`, `GlorIA/src/integrations/pilotos.client.ts`, `GlorIA/src/routes/inbound.routes.ts`, `backend/src/routes/internal.routes.ts`, workflow `wf-gloria-ai-bridge-v6`
- **Causa raíz, y no era la que parecía:** el problema no era que faltara clasificar el documento — es que **el fichero nunca entraba al sistema**. Meta no manda la imagen en el webhook, manda un `id`; el nodo Code del bridge de n8n copiaba `type`, `text`, `phone`... pero **no ese id**. Así que a GlorIA le llegaba `type:'image'` sin ninguna forma de ir a buscar la foto, y se perdía en silencio.
- Solución en tres piezas, con la lógica en el backend y n8n como tubería tonta:
  1. `MetaMedia.ts` — descarga el adjunto de Meta (dos llamadas: id → URL temporal → bytes, ambas con Bearer). Corta por tamaño **antes** de descargar si Meta ya declara que es enorme.
  2. `pilotos.client.ts` — entrega el documento a PilotOS. Primer consumidor real de `PILOTOS_API_URL`, que llevaba declarada en `env.ts` sin usarla nadie.
  3. `inbound.routes.ts` — si llega imagen/documento con `mediaId`, lo procesa y devuelve un bloque `adjunto` para que la IA sepa qué contestar sin inventarse nada.
- **Reparto de responsabilidades:** GlorIA manda el **teléfono**, no el vehículo. Qué coche tiene cada persona es dominio de PilotOS y se resuelve en `/internal/documentos-vehiculo`. Si GlorIA tuviera que averiguarlo, tendría que conocer el modelo de datos de PilotOS.
- **Lo que NO adivina, a propósito:** con varios vehículos devuelve 409 con la lista para que se pregunte cuál — adjudicar una factura al coche equivocado es peor que no adjudicarla. Y un teléfono ajeno a PilotOS (un huésped de RentOS mandando una foto) devuelve 404: es el caso **normal**, no un error, y se distingue explícitamente de un fallo de verdad.
- **Regla que gobierna el bloque:** todo va envuelto en try/catch. Este flujo se cuela en mitad de una conversación de WhatsApp real y **nunca** puede impedir que siga.
- Gotcha verificado: el `INTERNAL_API_TOKEN` de GlorIA y el de PilotOS **son distintos**. El cliente exige `PILOTOS_INTERNAL_TOKEN` explícito y **no cae** al de GlorIA — ese fallback solo habría dado 401 confusos. Variables creadas en Coolify (app 3).
- n8n: cambio mínimo y quirúrgico (copiar `message.image.id` al payload). Verificado que solo cambian esos 2 nodos de 19, con las conexiones idénticas.
- Verificado: 114/114 tests en PilotOS, 14/14 en `GlorIA/scripts/test-adjuntos-pilotos.js` (que cubre sobre todo los caminos de error: media inexistente, archivo enorme, sin token, teléfono ajeno, varios vehículos, caída de red, sin configurar), `tsc` limpio en ambos.
- **Nota sobre Coolify:** cada variable de entorno aparece **dos veces** en `environment_variables` — una con `is_runtime=true` y otra con `is_preview=true`. Es su comportamiento normal, no un duplicado a corregir. Perdí un rato pensando que había creado variables de más.
- **Lo que sigue sin existir:** la clasificación y extracción (qué tipo de documento es, qué mantenimiento resuelve). El documento entra como `DOCUMENTO_VEHICULO_SIN_CLASIFICAR` y ahí se queda. Eso espera a ver una foto real, misma prudencia que en C-043.

### C-053 · Recuperación de contraseña — cerrada la causa de fondo de C-039
- Area: `backend/src/routes/auth.routes.ts`, `prisma/schema.prisma` (`PasswordReset`), `app/src/app/(auth)/login/page.tsx`
- Problema: Alberto se quedó fuera de PilotOS **dos veces en cuatro días** (C-039 el 7 de agosto, otra vez el 11). Las dos veces hubo que **editar el hash a mano en la base de datos**, porque no existía ningún flujo de recuperación. La segunda vez se diagnosticó primero que no era culpa del despliegue del día: el endpoint de login funcionaba, rechazaba contraseñas malas correctamente, el frontend apuntaba bien y el orden de los middlewares era el correcto — simplemente la contraseña guardada no era la que él recordaba. El arreglo del momento fue dejar su cuenta en estado placeholder para que la fijara él desde la app (así nadie más la ve), pero eso es el parche, no la solución.
- Solución: `POST /api/auth/recuperar` manda un código de 6 dígitos por WhatsApp vía GlorIA; `POST /api/auth/restablecer` lo valida y deja la sesión iniciada. Usa el canal que ya es del producto y **verifica posesión del número**, que es exactamente lo que le faltaba a `establecer-password` (ver su nota de seguridad, que queda parcialmente respondida).
- **Decisiones de seguridad, todas con test:**
  - `/recuperar` responde **siempre lo mismo** exista o no la cuenta — incluso si el envío de WhatsApp falla o revienta algo por dentro. Si dijera "ese teléfono no está registrado", cualquiera podría averiguar quién usa PilotOS probando números. La respuesta neutra está definida **una sola vez** en la función para que ninguna rama pueda contestar distinto sin querer.
  - El código **no se guarda en claro**, solo su hash bcrypt: quien lea la tabla no puede entrar en ninguna cuenta.
  - Un solo uso, caduca a los 15 min, se quema a los 5 intentos fallidos, y pedir uno nuevo invalida los anteriores (si no, pedir varios dejaría varias puertas abiertas).
  - El cambio de contraseña y el quemado del código van en la **misma transacción**: no puede quedar la contraseña cambiada con el código todavía vivo.
  - Mismo mensaje para "no existe la cuenta", "código incorrecto" y "código caducado".
  - Hereda el `authLimiter` que ya existía (10 intentos / 15 min por IP).
- Verificado: 127/127 tests (13 nuevos, centrados en los caminos de abuso más que en el feliz), build limpio backend y frontend. Migración aplicada con backup previo.
- **Pendiente para que funcione de verdad:** la plantilla `codigo_recuperacion` en Meta Business. Es la **cuarta**, y la única que **no puede esperar a que el usuario escriba primero**: se dispara desde la web, con el usuario fuera de la app y sin conversación abierta, así que necesita plantilla aprobada sí o sí. Mientras no esté, el flujo existe pero el código no llega.
- Prevención: cuando un incidente se repite (dos veces en cuatro días), el arreglo del momento no es la solución — hay que cerrar la causa. Y en un endpoint de recuperación, lo que hay que probar no es el camino feliz: es que no se pueda usar para enumerar usuarios, ni a fuerza bruta, ni dos veces.

### C-054 · «Nunca se puede subir bien el archivo, no contrasta nada» — dos causas, una mía
- Area: `backend/src/services/ocr.service.ts`
- Alberto reportó `invalid_response` al enviar un parte, diciendo que **le pasa siempre** y que por eso el sistema nunca contrasta los tickets. Pidió la causa real, no hipótesis. Investigado con evidencia, salieron **dos causas distintas**:

**Causa 1 — la de ese envío concreto: mi propio despliegue.**
Cronología reconstruida de los datos, no supuesta:
- `17:30:24` — arranca mi despliegue de la recuperación de contraseña (`bb4d9c6`).
- `17:33:01` — se crea el parte en BD (con su `CalculoParte`): `crearParte` funcionó.
- `17:33:03` — **el contenedor se sustituye** (`docker ps` lo confirma).
- `17:33:05` — el fichero de la foto llega a `uploads/`: `uploadFoto` funcionó.
- El `POST /api/fotos` siguiente murió con el contenedor viejo → el proxy respondió algo que no era JSON → el frontend lo tradujo a `invalid_response` (`fetcher.ts:69`, el `.catch` de `res.json()`).
Prueba de que murió ahí: el parte existe, el fichero existe, y **no hay ninguna fila en `documentos`**.
Es el **mismo fallo que ya me había pasado horas antes** con un 504 de GlorIA (ver C-051): desplegar encima de alguien que está usando la aplicación. **No desplegar sin avisar, y menos dos veces el mismo día.**

**Causa 2 — la recurrente, y la de verdad: el parser no aguantaba el OCR real.**
Esta explica el "siempre" y el "no contrasta nada". Y es una corrección de mi propia corrección de esta misma mañana: en C-043 validé el parser contra una **transcripción del ticket que escribí yo a mano** leyendo la foto. Pasó al 100%. Pero Tesseract no produce eso:
```
7 Total: 2024.65        <- la P leída como 7
P-Carrerasi 1967-05     <- dos puntos como 'i', decimal como guion
carreras! 144605» 85    <- dos puntos como '!', decimal como '»'
Dist- Total 183043»1    <- punto abreviador como guion
de pel TOA 23521        <- "P Dist. Total: 2352,1", irrecuperable
```
Mi separador de bloques dependía del prefijo `P ` de cada línea del turno. Con la P destrozada, esas líneas caían en el bloque **acumulado**, y el resultado era el peor posible: `parc_total` vacío, `acum_total` = 2024,65 (el importe del **turno** metido en el campo del acumulado — dato correcto en el sitio equivocado), y `valido: false` → el ticket se marcaba **ilegible** y no se comparaba nada. Exactamente lo que él describía.
- Solución: separar por la línea de **`Borrados`** (último campo del acumulado, no se repite en el turno, y al ser palabra larga y sola en su línea sobrevive al ruido). El prefijo `P` queda como segunda estrategia y las cabeceras como tercera. Más `normalizarNumerosOcr()`, que limpia el ruido dentro de las cifras y en el separador de la etiqueta, sin tocar la fecha ni la hora.
- Verificado contra la foto real en producción (antes → ahora): `valido` false→**true**, importe del turno —→**2024,65** (el parte declaraba 2024,65), km acumulados —→**183.043,1**, importe acumulado 2024,65 (mal)→corregido.
- Limitación documentada en el propio test, **no es un fallo**: los km del turno de esa foto no se recuperan (`de pel TOA 23521`, etiqueta destruida). La comparación de **importe** sí funciona, que es la que protege el dinero.
- Test nuevo `smoke.ocrTicketRealOcr.test.ts` con la salida **literal** de Tesseract como fixture. El de la mañana se queda también: uno prueba que se entiende un ticket limpio, el otro que se entiende el real.
- **Prevención, y es la lección cara del día:** un texto transcrito a mano **no prueba** un parser de OCR — solo prueba lo que uno cree que pone la foto. Para validar OCR hace falta la salida literal del motor. Lo dije por la mañana en la prevención de C-043 y aun así lo repetí por la tarde.
**Causa 3 — encontrada de carambola al verificar el ticket de combustible: el flag `/g`.**
Al aplicarle a `validarTicketGasoil` la misma limpieza de ruido, el caso **limpio** seguía fallando. Eso no cuadraba, así que lo miré: sus cuatro patrones llevaban el flag `/g`, y con `/g` `String.match` devuelve las coincidencias **enteras** y descarta los grupos de captura:
```js
'Total: 28,70 EUR'.match(/...([\d]+[.,][\d]{2}).../gi)
  -> ['Total: 28,70 EUR']        // m[1] = undefined
```
Consecuencia: **todo** ticket de gasolinera salía "No se detectó importe" → inválido → el combustible declarado **no se ha contrastado jamás**. No es una regresión: no ha funcionado nunca. Los patrones del taxímetro no llevan `/g`, por eso ese lado sí funcionaba y este no.
- Arreglado (quitado el `/g` y aplicada la normalización). Verificado en los tres formatos habituales: limpio, con ruido de OCR, y con símbolo de euro sin la palabra "total". Test `smoke.ocrGasoil.test.ts`.
- **Prevención concreta:** un patrón con grupo de captura **nunca** debe llevar `/g` si se usa con `String.match` y se lee `m[1]`. Merece una revisión de todos los regex del proyecto que capturen.
- Ese día no se pudo verificar contra una foto real de gasolinera. Al reintentarlo con una, aparecieron **tres fallos más** — ver C-055.

### C-055 · El ticket de gasolinera cogía el descuento, y las fotos no se veían
- Area: `backend/src/services/ocr.service.ts`, `app/src/lib/utils/documento-url.ts`
- Tras arreglar C-054, Alberto reintentó el envío. **El flujo ya funcionó entero** (parte creado, las dos fotos enganchadas, ticket de taxímetro **VÁLIDO** con su importe correcto). Quedaron dos cosas: el combustible «no leyó los datos» y no podía ver las imágenes.

**Fallo A — el parser cogía el descuento en vez del importe pagado.**
Con la factura real delante (Suministros Insulares Océano, 10/08/2026) se ve al instante, y era imposible de ver con un ejemplo inventado:
```
Total Venta:      30,00 €   <- antes del descuento
Dto. total:        1,30 €   <- el descuento
IMPORTE A PAGAR:  28,70 €   <- la buena
```
El patrón genérico `(?:total|importe)` casaba **primero** con `Dto. total: 1,30`, guardaba 1,30 € como gasto del día y levantaba una discrepancia de 27,40 € **que no existía**. Ahora los patrones van de lo específico a lo genérico (`importe a pagar` → `total a pagar` → `total` a principio de línea → …), y exigir principio de línea impide que `Dto. total` cuele.
Lección: en un documento con varias cifras en euros, el problema no es *encontrar* un número, es **elegir el correcto**. Un fixture sintético con una sola cifra nunca lo habría destapado.

**Fallo B — «GASOLEO» no estaba en la lista de combustibles.**
La lista tenía `gasoil` pero no `gasoleo`, que es como lo escriben casi todas las gasolineras españolas. Sin palabra reconocida y sin litros, el ticket se daba por «no es de combustible» → `PENDIENTE_REVISION`. Añadido `gasoleo` y las cadenas más comunes.

**Fallo C — los litros venían en una tabla.**
`21,66` va en una fila bajo la línea del producto, sin la unidad pegada. Añadido un patrón que lee el primer número de la fila siguiente a la línea del combustible.

**Fallo D — las fotos daban 401 y no se veían.**
`/uploads` exige token y lo acepta por cabecera `Authorization` **o** por la cookie `pilotos_token`. Pero:
- un `<img src>` del navegador **no manda cabeceras**, solo cookies;
- la cookie se pone en `pilotos.nexostudios.digital` y la URL guardada apunta a `api.pilotos.nexostudios.digital`, que es **otro host**, así que la cookie tampoco viaja.
Resultado: 401 y foto rota, siempre. `next.config.ts` **ya proxeaba** `/uploads/:path*` al backend, así que bastaba con pedir la foto por la ruta del propio dominio: misma petición, mismo origen, cookie enviada. Helper `urlDocumento()` que se queda con el `pathname` — arregla también las fotos ya guardadas sin tocar ninguna fila, y deja pasar sin cambios cualquier URL que no sea de `/uploads`.
- Verificado: 146/146 tests, con `smoke.ocrGasoilRealOcr.test.ts` usando el texto **literal** de Tesseract sobre la factura real.
- **Prevención:** el fixture sintético de combustible que escribí en C-054 pasaba al 100% y no valía para nada — tres fallos reales pasaron por debajo. Cada tipo de documento nuevo necesita **su** fixture real antes de darse por bueno. Es la tercera vez en el mismo día que esta lección cuesta dinero.

### C-056 · Las alertas acusaban al conductor de cifras que el OCR había leído mal
- Fecha: 2026-08-12
- Área: `backend/src/services/ocrComparacion.service.ts`, `backend/src/services/ocr.service.ts`
- **Problema detectado.** Alberto subió un parte el 11/08 por la noche (fecha trabajada 08/08) y otro el 12/08 por la mañana (fecha trabajada 10/08). Las alertas que salieron eran falsas de arriba abajo:
  - Parte del 10/08: *«El taxímetro registra **2640 borrados** más de los 1 parte(s) declarados. El vehículo se ha movido **1.648.004,9 km** sin que ningún parte lo declare»*. En dos días.
  - Parte del 08/08: *«7 borrados más… **180.511,3 km** sin declarar»*, comparando contra un ticket de mayo cuyo acumulado el OCR había leído como 179,8 km.
  - Además: *«El total del parte (32 €) no coincide con el P Total del ticket (91,55 €)»*, cuando el ticket pone 51,55.
- **Causa.** Ninguna de las tres es un problema de los datos del conductor; las tres son lecturas malas de Tesseract que el motor de comparación se creyó sin preguntar. Salida literal del ticket del 10/08:
```
Total: 149047, 40      <- acum_total se perdía: el patrón exige separador + 2 dígitos PEGADOS
Dist. Total: 1831080   <- el ticket pone 183.108,0 (= 183.043,1 del anterior + 64,9 del turno)
Borrados: 2937         <- el ticket pone 297 (296 + 1 turno)
Surlementos: 4391.80   <- "Suplementos" con la p leída como r -> campo perdido
P Total: 91-55         <- el ticket pone 51,55 (= P Carreras 49,75 + P Suplementos 1,80)
```
  El motor no tenía **ningún** control de plausibilidad: convertía un dígito de más en una acusación de trabajo no declarado y disparaba un WhatsApp al patrón. Y como `acum_total` nunca se extraía (el espacio tras la coma), la rama que distingue «trabajo no declarado» de «solo km» no podía usar el dinero jamás: siempre caía en el mensaje alarmista de kilómetros.
- **Solución aplicada.**
  1. `evaluarFiabilidadAcumulados()` (función pura): un contador de taxímetro solo sube y sube a un ritmo acotado. Si entre dos tickets los borrados retroceden o suben más de `4 + 6/día`, o los km saltan más de 1000/día, o el importe más de 1500/día, esa cifra **no sirve de prueba**. Si lo que falla es el contador de borrados, no se compara nada: anomalía NORMAL diciendo que se revise la foto, y **sin WhatsApp**.
  2. `importeTurnoTicket()`: comprueba la coherencia interna del propio ticket (P Carreras + P Suplementos = P Total) y, cuando no cuadra, descarta el P Total —dos lecturas que suman bien pesan más que una suelta—. En el caso real esto convierte una diferencia falsa de 59,55 € en la de verdad: 51,55 del ticket contra 32 declarados.
  3. Tickets separados más de 15 días: la cuenta «borrados esperados = anteriores + partes declarados» deja de ser concluyente (seguro que hubo turnos sin parte). Se informa como NORMAL, no se acusa.
  4. CRÍTICA (que es la que avisa por WhatsApp) solo si hay prueba contrastable. Si ni km ni € se han podido contrastar, un borrado suelto queda como aviso NORMAL en el panel.
  5. Parser: recuperado el decimal con espacio detrás (`149047, 40`) y tolerancia a `Su?lementos` mal leído.
- **Verificado:** 163/163 tests, con `smoke.ocrFiabilidad.test.ts` y el fixture literal de Tesseract del ticket del 10/08 añadido a `smoke.ocrTicketRealOcr.test.ts`. Los dos partes de producción recalculados tras el despliegue.
- **Aparte, y no es de código:** los dos avisos al patrón fallaron con `(#132001) Template name does not exist` — la plantilla Meta `anomalia_taximetro` sigue sin estar aprobada. Ninguna alerta crítica ha salido nunca por WhatsApp.
- **Prevención.** Regla para todo lo que salga del OCR: *antes de acusar, comprobar que la cifra es posible*. Un número bien formado (`2937`) no es un número correcto, y el parser no puede saberlo — quien tiene que darse cuenta es quien compara. Ningún dato imposible puede terminar en un mensaje a una persona.

### C-057 · Un parte con diferencias contaba igual, y la recuperación de contraseña dependía de Meta
- Fecha: 2026-08-12
- Área: `backend/src/services/retencionParte.service.ts`, `backend/src/routes/parteDiario.routes.ts`, `backend/src/services/email.service.ts`, `backend/src/routes/auth.routes.ts`, `app/src/components/features/partes-retenidos.tsx`, `app/src/app/(conductor)/conductor/page.tsx`

**1. El control que no controlaba nada.**
Un parte con discrepancias generaba su incidencia en el panel, el dueño pulsaba «Marcar revisada» y desaparecía — pero el dinero de ese parte estaba en los totales desde el primer momento. El botón no decidía nada: solo apagaba el aviso.
- Solución: estado `PENDIENTE_VALIDACION`. El parte existe, se lista y se ve, pero queda fuera de `calcularResumen` y de los cierres hasta que el dueño elige una de dos:
  - **Aceptar** → pasa a ENVIADO, entra en globales, sus anomalías quedan revisadas (no borradas, R-AN-002).
  - **Pedir que se rehaga** → el parte y sus tickets se borran para que el asalariado registre ese día otra vez. Queda `PARTE_RECHAZADO` en el ledger con copia de las cifras.
- Detalle que costó pensar y es el que protege el dato: **el km del vehículo se recalcula al rechazar**. El parte rechazado pudo ser el que subió el contador; si no se devuelve al máximo de los partes que sobreviven, el parte nuevo arrancaría con kilómetros que nadie ha recorrido.
- Otro: un parte retenido **sigue contando como turno físico** para la comparación de acumulados del taxímetro. Si se excluyera, el motor vería un borrado que ningún parte explica — el falso positivo de C-056 otra vez, por la puerta de atrás.
- Y otro: un parte que el dueño ya aceptó **no se vuelve a retener solo**. Su decisión pesa más que una relectura del OCR.
- El asalariado ve en su panel que su parte tiene diferencias, que **todavía no cuenta**, y qué cifras concretas no cuadran. Antes se habría enterado al cuadrar la nómina.

**2. La vista del dueño empezaba por lo que menos hace.**
El home ofrecía «Nuevo parte» como acción dominante y el panel de gestión como un enlace al final. Un dueño entra a controlar el negocio; conducir es la excepción. Invertido: panel de gestión como acción principal, nuevo parte como secundaria. El asalariado mantiene el parte primero, que es lo suyo.

**3. La recuperación de contraseña dependía de un tercero.**
El código salía por WhatsApp con una plantilla de Meta. A 12 de agosto no habían aprobado ninguna de las cuatro enviadas: la función existía y no servía para nadie. Se pasa a email (SMTP), que solo depende de nosotros — **la misma decisión que ya tomó NexOS Pay el 2026-08-08 y por el mismo motivo**.
- `email.service.ts` repite el enfoque de Pay (transporte inyectable, nunca lanza, sin credenciales no envía y lo dice) en vez de importarlo, porque hoy no hay paquete compartido para esto. Anotado: al tercer consumidor, esto sube a `NexOS/core`.
- **Hallazgo de paso, y es el que de verdad importaba:** el onboarding **nunca pidió email al asalariado** — le inventaba `telefono@pilotos.app`, un buzón que no existe. Con el reset por correo, ese asalariado no habría podido recuperar nada. Ahora el email es obligatorio en el alta; las altas antiguas se detectan en `/recuperar` y quedan en el log (por fuera la respuesta no cambia, no se revela quién tiene cuenta).
- Verificado: 187/187 tests.
- **Prevención.** Dos lecciones distintas: (a) un aviso que no cambia el estado de nada es decoración — si el sistema detecta que algo no cuadra, tiene que retener el efecto, no solo pintar un cartel; (b) una función crítica no puede depender de la aprobación de un tercero, y si depende, hay que saber que está apagada, no descubrirlo el día que alguien la necesita.

### C-058 · La pantalla de Documentos duplicaba los partes, y el asalariado veía demasiado
- Fecha: 2026-08-12
- Área: `app/src/app/(dashboard)/documentos/page.tsx`, `backend/src/routes/documentoVehiculo.routes.ts`, `backend/src/services/ocrDocumentoVehiculo.service.ts`, `backend/src/services/aplicarDocumento.service.ts`, `app/src/components/features/resumen-mes-conductor.tsx`

**1. El asalariado sabía exactamente qué hueco tenía que justificar.**
Al retener un parte (C-057) le enseñábamos el detalle: *"el ticket dice 148,60 € y declaraste 95 €"*. Alberto lo cortó en cuanto lo vio, y tiene razón: eso es darle la medida de la historia que le toca contar. Ahora ve **que** algo no cuadra y de qué día, nada más.
- Se filtra en el **backend**, no en la pantalla: ocultarlo solo en el frontend dejaba el dato viajando en la respuesta, a un inspector de vista de distancia. `GET /api/partes/:id` devuelve a un no-patrón el parte sin anomalías y sin las discrepancias del OCR. Verificado con las dos sesiones: 0 y 0 para el asalariado, 2 y 2 para el dueño.
- Lección general: **una regla de privacidad que solo vive en la UI no es una regla.**

**2. Documentos listaba partes.**
La pantalla mostraba los partes con sus tickets — es decir, la pantalla de partes otra vez. Lo que faltaba era la carpeta del taxi: la ITV, la factura de los neumáticos, el seguro. Reescrita entera.

**3. El circuito documental, que no existía.**
Se sube el papel → el OCR **propone** (tipo, fecha, importe, validez, qué mantenimientos resuelve) → una persona confirma → el contador del mantenimiento se pone al día con su fecha nueva **y** el importe se registra como gasto con la factura enganchada. Todo en una transacción: un gasto sin su mantenimiento actualizado (o al revés) es peor que no hacer nada, porque nadie se entera de que falta la mitad.
- La regla de quién confirma la fijó Alberto y no es la obvia: **lo que dispara la revisión del dueño no es quién sube el documento, sino si esa persona contradice a la imagen.** Si el asalariado acepta lo que pone el papel, se aplica solo; si lo corrige, va a revisión. Si corrige el dueño, manda él.
- Se guardan **las dos versiones** (lo que leyó la máquina y lo que vale) con autor y fecha.
- El kilometraje oficial no se toca: §5.3 del maestro. Una factura puede ser de hace tres días.
- Verificado end-to-end contra la base de prueba con una factura combinada (4 neumáticos + alineado + pastillas, 620 €): mantenimiento de neumáticos al día con la fecha y los km de la factura, gasto de 620 € creado, km del vehículo intacto, y **aviso explícito** de que "Pastillas de freno" no estaba dado de alta en ese vehículo en vez de fallar en silencio.
- **Honestidad sobre el OCR, que es la lección cara de esta semana:** los patrones de ITV y factura están escritos contra el formato habitual, no contra documentos reales pasados por Tesseract. Ya sabemos lo que vale eso (C-043, C-054, C-055): poco. Lo que sostiene el dato mientras tanto es el paso de confirmación — si el OCR no lee un campo, lo declara faltante y lo escribe la persona.
- Detalle divertido de la prueba: el parser no leyó la matrícula `0000DMO` del vehículo ficticio. No es un fallo: la `O` no existe en las matrículas españolas (se excluye para no confundirla con el cero). La matrícula inventada era imposible; el parser tenía razón.

**4. Mini-panel del asalariado.** Lo que ha entregado neto (bruto − combustible, la misma definición que usa el motor de cálculo), días trabajados, km, €/km y €/día. No ve su reparto: eso es del dueño. Los partes retenidos no suman, y se dice.
- Verificado: 205/205 tests.
- **Prevención:** antes de dar por buena una pantalla, preguntar qué está enseñando de más. "Documentos" llevaba meses siendo un duplicado de "Partes" y nadie lo miró; el detalle de las discrepancias se coló porque parecía transparencia y era ventaja para quien tiene que dar explicaciones.

### C-059 · El asalariado no se enteraba de la decisión del dueño, y el datáfono era obligatorio
- Fecha: 2026-08-12
- Área: `backend/src/services/notificacionConductor.service.ts`, `backend/src/routes/notificacion.routes.ts`, `backend/src/routes/parteDiario.routes.ts`, `app/src/components/features/avisos-conductor.tsx`, `app/src/app/(conductor)/conductor/panel/page.tsx`

**1. Las decisiones se tomaban a espaldas de quien las sufre.**
Al montar la retención (C-057) se resolvió el lado del dueño —aceptar o mandar rehacer— pero no el del asalariado: si le pedían rehacerlo, **el parte desaparecía de su pantalla sin una palabra**. Ahora los dos caminos avisan, con el nombre de quien decidió:
- Aceptado → *"Manuel Ficticio ha aceptado tu parte del 11/08/2026. Ya está contabilizado."*
- Rehacer → *"…ha pedido que vuelvas a registrar el parte del 11/08/2026. El anterior se ha eliminado"*, con el motivo si lo hay y un botón directo para registrarlo otra vez.
- Tabla nueva `notificaciones_conductor`. La referencia al parte es **blanda a propósito** (sin FK): en el caso "rehacer" el parte se borra, y el aviso tiene que sobrevivirle — si no, el asalariado se quedaría sin la explicación justo en el caso que la necesita.
- El aviso se crea **antes** de borrar el parte, y hay un test que lo comprueba por orden de llamada. Si el borrado fallara, al menos la persona sabe que algo pasa.

**2. El datáfono era obligatorio y no tenía por qué.**
Un turno puede ser todo en efectivo o todo con tarjeta. El formulario exigía rellenarlo igual, así que el conductor escribía un 0 a mano o se lo inventaba. Ahora es opcional (vacío = 0) en el backend y en el formulario. La regla R-PD-014 (bruto ≥ datáfono) sigue viva cuando sí se rellena.

**3. Las vistas, cada una en lo suyo.**
La home del asalariado es para **trabajar**: avisos, el parte de hoy y poco más. Todo lo demás —cómo va el mes, su vehículo, sus partes, subir un documento— se muda a `/conductor/panel`. Es la simétrica de la decisión del dueño: cada uno arranca en lo que hace el 90% de las veces.
- En su panel, además, los **acumulados del mes por datáfono y en efectivo**: el efectivo es lo que de verdad tiene que entregar, y verlo separado le ahorra la cuenta a mano.
- Verificado: 208/208 tests, y el ciclo completo probado con las dos sesiones del entorno ficticio.
- **Prevención:** cuando una función tenga dos lados (quien decide y quien lo sufre), construir los dos a la vez. La retención se dio por terminada con el lado del dueño resuelto, y estaba a medias.

### C-060 · El OCR leía "2937" donde el ticket pone "297" — cuarto intento, y el bueno
- Fecha: 2026-08-12
- Área: `backend/src/services/ocr.service.ts`, `backend/tests/smoke.ocrImagenReal.test.ts`, `backend/tests/fixtures/`

**El problema, después de tres arreglos fallidos.** Alberto subió otro parte y el contador de borrados volvió a leerse `2937` cuando el papel pone `297`, dejándole un parte retenido sin motivo. Tres días arreglando el parser (C-043, C-054, C-055) y el fallo seguía.

**La causa: no estaba en el parser.** El número llegaba ya mal desde Tesseract. Todo el trabajo anterior se había hecho sobre el TEXTO — transcripciones primero, salida literal de Tesseract después — y con el texto ya equivocado ningún parser puede acertar. El problema estaba un paso antes: **la imagen**. La letra del ticket, tal y como sale de la foto del móvil, es demasiado pequeña para el motor; Tesseract está afinado para ~300 dpi y por debajo se inventa trazos.

**La solución: preparar la imagen antes de leerla.** Grises + normalizar contraste + agrandar x2,5 con lanczos3. Nada más.

**Y el error que casi cometo otra vez.** La primera versión llevaba `sharpen`, y con ella el ticket del 10/08 salía *perfecto*: 297 borrados, la distancia acumulada bien (183.108,0 en vez del 1831080 que también rompía), el importe del turno... 7 de 7. Estuve a punto de darlo por cerrado. Al probarlo contra **la otra foto real** que había en producción, el 08/08 perdía la línea entera de "Borrados" y el importe del turno. Es la misma trampa de C-043 y C-054 —validar contra un solo ejemplo— pero un nivel más arriba.
- Se probaron 6 combinaciones (escalas 1,5/2/2,5 × afilado sí/no) contra las DOS fotos, midiendo 9 campos contra lo que pone el papel: `x2 plano` 7/9, `x2,5 afilado` 8/9, **`x2,5 plano` 9/9**.
- Añadido también: el importe del turno se reconstruye por coherencia interna cuando P Total no cuadra con P Carreras + P Suplementos (el ticket del 10/08 pone 51,55 y Tesseract lee "1.55" al confundir el borde del papel con un carácter). Y dos separadores decimales nuevos a la lista, `;` y `"`, que aparecieron en estas fotos.

**Lo que hace que esto no vuelva a pasar:** las dos fotos están ahora en `tests/fixtures/` y `smoke.ocrImagenReal.test.ts` pasa la tubería COMPLETA —imagen → OCR → parser— comparando con lo que se lee mirando el papel. Es lento (unos 16 segundos) y da igual: es la única prueba que detecta esta clase de fallo. Los tests sobre texto siguen ahí, pero ya sabemos que no bastan.

- **Prevención, y van cuatro:** *un fallo de lectura no se arregla mirando solo el texto.* Cuando el dato llega mal, hay que subir un escalón y preguntarse qué le estamos dando al motor. Y toda mejora de OCR se valida contra **todas** las fotos reales disponibles, nunca contra una — si solo hay una, no está validada.

### C-061 · Un documento mandado por GlorIA se quedaba en RECIBIDO para siempre
- Fecha: 2026-08-12
- Área: `backend/src/routes/internal.routes.ts`, `backend/src/services/ocrDocumentoVehiculo.service.ts`, `backend/src/routes/documentoVehiculo.routes.ts`

**El hallazgo.** Repasando qué quedaba pendiente tras el bloque de trabajo del día, se encontró que `POST /internal/documentos-vehiculo` —el endpoint por el que GlorIA mete una foto que llega por WhatsApp— guardaba la imagen y creaba el `Documento` con `estado: 'RECIBIDO'` y `estado_ocr: 'PENDIENTE'`, y ahí se quedaba. Nada volvía a tocarlo: ni un cron, ni un job en cola, nada. Ese documento nunca aparecía en "Esperan tu confirmación" (que filtra por `PENDIENTE_CONFIRMACION`), así que una factura mandada por WhatsApp desaparecía en la práctica sin que nadie lo notara.

**Por qué pasó desapercibido tanto tiempo.** El endpoint es de julio/agosto (2026-08-11), anterior al circuito de confirmación (§5.4.1, del mismo día 12 por la mañana). Cuando se construyó ese circuito, el camino de la app (`POST /api/documentos-vehiculo`) sí quedó completo —lee la imagen, saca la propuesta, deja el documento listo—, pero nadie volvió a este endpoint más viejo para conectarlo al análisis nuevo. Los dos caminos existían, pero solo uno hacía el trabajo entero.

**La corrección.** Se extrajo el análisis completo (leer la imagen, `analizarDocumentoVehiculo`, crear el `Documento` en `PENDIENTE_CONFIRMACION`) a una función compartida — `analizarYRegistrarDocumento` en `ocrDocumentoVehiculo.service.ts` — y los dos endpoints la usan ahora. Que la factura entre por WhatsApp o por la app no puede cambiar si se procesa.

**Verificado de punta a punta**, no solo con tests: se disparó una llamada real al endpoint interno con la imagen real de un ticket (la misma fixture de C-060), con el token interno de verdad. Resultado: `HTTP 201`, documento creado en `PENDIENTE_CONFIRMACION` con `estado_ocr: COMPLETADO`, y **aparece en `GET /api/documentos-vehiculo?estado=PENDIENTE_CONFIRMACION`**, que es exactamente lo que pinta la pantalla del dueño.

- 11/11 tests del endpoint interno actualizados (antes afirmaban `estado: 'RECIBIDO'` como comportamiento correcto — ahora afirman que se analiza).
- 240/240 en la batería completa.
- **Prevención.** Cuando se construye un circuito nuevo con dos puntos de entrada (app y canal externo), comprobar que el segundo también quedó conectado al final del circuito, no solo al principio. Un endpoint que "guarda algo" y ya no hace nada más es indistinguible de uno que funciona, hasta que alguien mira qué pasa después.

### C-062 · La foto sí llegaba, pero n8n nunca decía dónde estaba
- Fecha: 2026-08-12
- Área: n8n `wf-gloria-ai-bridge-v6` (nodo `Code in JavaScript`), `GlorIA/src/routes/inbound.routes.ts`

**El síntoma.** Justo después de cerrar C-061 —que dejaba el endpoint interno de PilotOS analizando de verdad los documentos— Alberto mandó una factura real de una reparación por WhatsApp. GlorIA contestó con una respuesta genérica de RentOS, sin rastro del documento. El arreglo estaba desplegado y verificado con una llamada real al endpoint, y aun así por el canal de verdad no funcionaba.

**El rastreo, y los dos callejones sin salida.** Los logs de GlorIA solo mostraban `POST /api/gloria/inbound` seguido de `POST /api/gloria/commit`, sin cuerpo ni código de estado. Ese `commit` posterior con una respuesta coherente ya descartaba un 400: si hubieran faltado `phone` o `messageId`, no habría habido respuesta. O sea, la petición entraba bien — pero sin `mediaId`.

Se descartó, en este orden: ClinicOS (otro número), RentOS (no reenvía nada), un segundo despliegue de GlorIA (solo existe la app 3 en Coolify), y un `dist/routes/webhook.routes.js` encontrado en local que resultó ser un artefacto viejo, gitignoreado y **ausente del contenedor en producción** — se comprobó antes de darlo por bueno.

**Los dos errores propios que alargaron el diagnóstico.**
1. *Se dio por cerrada la vía n8n demasiado pronto.* Hay **dos instancias de n8n** en el servidor: `n8n-n8n-1` (con su `n8n-postgres-1`) y `n8n-ak48k0w8c0cog00gowggcgcc`, la gestionada por Coolify, que es la real de `n8n.nexostudios.digital`. La primera consulta de ejecuciones fue contra la equivocada, dio cero, y se concluyó "n8n no está en el camino". Lo estaba.
2. *Se implementó un arreglo antes de tener la causa.* Se añadió a `/api/gloria/inbound` una red de seguridad que aplana el webhook crudo de Meta si le llega en esa forma. No es incorrecta y se queda —protege ante un emisor que reenvíe el payload sin aplanar— pero **no resolvió nada**, porque el cuerpo ya venía aplanado. Ese despliegue se hizo sin haber confirmado aún la causa raíz.

**Lo que zanjó el caso** fue mirar la tabla `gloria.events`: los dos mensajes (18:21 y 18:56) estaban registrados con `type = 'image'`. El emisor sabía perfectamente que era una imagen y aun así no mandaba el id. Eso descartaba el formato crudo y apuntaba a un normalizador aplanando mal. De ahí a las ejecuciones de la n8n correcta: `wf-gloria-ai-bridge-v6`, **activo**, ejecutándose a las 18:56:42 — tres segundos antes del `inbound`.

**La causa.** El nodo `Code in JavaScript` de ese workflow devuelve `phone`, `text`, `messageId`, `type`, `timestamp` y `phoneNumberId`. Ni una palabra de `mediaId`. La versión **corregida el 2026-08-11**, con `mediaId: message.image?.id || message.document?.id || body.mediaId || null`, está en `GlorIA/n8n-workflows/v6/wf-gloria-ai-bridge-v6.json` — versionada en git, comentada, correcta. El workflow en vivo tiene `updatedAt` de **2026-07-20**. El arreglo se escribió y se commiteó, pero nunca se subió a n8n.

**Prevención, que es lo que importa aquí.**
- *Un workflow de n8n versionado en el repo no es un workflow desplegado.* El fichero JSON en git y lo que corre en n8n son dos cosas distintas y pueden divergir semanas. Cuando se arregla un workflow, el trabajo no está hecho hasta que se comprueba el `updatedAt` del que está activo.
- *Antes de descartar un componente, verificar contra qué instancia se está preguntando.* "Cero ejecuciones" solo significa algo si es la base de datos correcta.
- *No desplegar un arreglo antes de tener la causa.* La red de seguridad del `inbound` se escribió sobre una hipótesis (payload crudo) que los datos —`type='image'` en `gloria.events`— habrían refutado en dos minutos si se hubieran mirado primero.

### C-063 · El arreglo de la mañana rompió el mismo circuito que arreglaba
- Fecha: 2026-08-12
- Área: `backend/src/routes/internal.routes.ts`, `backend/src/services/ocrDocumentoVehiculo.service.ts`

**El síntoma.** Después de C-062 —que hizo que n8n por fin mandara el `mediaId` de la foto— Alberto envió otra factura real y **siguió sin archivarse**. Ninguna traza de error en ningún sitio: ni en GlorIA, ni en PilotOS, ni en n8n. Los tres servicios decían que todo iba bien.

**Lo que zanjó el caso.** Ejecutar el camino real (`descargarMedia` + `subirDocumentoVehiculo`) desde dentro del contenedor de GlorIA, con el `mediaId` de la foto de verdad y enseñando el error que el código se traga a propósito:

```
descargarMedia:        ok: true | bytes: 330647
subirDocumentoVehiculo: { ok: false, motivo: "error_red", error: "timeout" }
```

**La causa, y es propia.** C-061, esa misma mañana, metió el OCR completo dentro de `POST /internal/documentos-vehiculo` para que una factura de WhatsApp se procesara igual que una de la app. El fondo era correcto. El efecto, no: Tesseract sobre una foto de móvil de 330 KB tarda unos 20 segundos, y el cliente de PilotOS en GlorIA corta exactamente a los 20 (`TIMEOUT_MS = 20000`). La foto se subía, el documento se creaba, el OCR se completaba — y GlorIA recibía un timeout que su propio diseño ("nunca lanza") convertía en silencio.

La prueba de que el trabajo sí se hacía quedó en la base de datos: el documento `d1828313`, creado a las 19:27:35 por la primera llamada de diagnóstico —la que dio timeout— estaba ahí, clasificado como `FACTURA_TALLER` y en `PENDIENTE_CONFIRMACION`. **El sistema hacía su trabajo entero; el que llamaba se rendía antes de que terminara.**

**Por qué no lo detecté al hacer C-061.** Lo verifiqué con una llamada directa al endpoint —`HTTP 201`, documento correcto, aparece en la pantalla del dueño— y lo di por bueno. Pero esa llamada la hice yo, sin timeout. El cliente real tiene uno. **Verifiqué el endpoint, no el circuito.**

**La corrección.** El trabajo se parte en dos para el camino de entrada externa:
- `registrarDocumentoPendiente` — crea la fila al momento (`estado: 'ANALIZANDO'`) y permite contestar enseguida.
- `analizarDocumentoRegistrado` — hace el OCR después, sin `await`, y deja el documento en `PENDIENTE_CONFIRMACION`. Nunca lanza: si el OCR falla, el documento queda **visible con el motivo** en vez de perderse, porque que el dueño lo rellene a mano es mejor que perder la factura.

El camino de la app sigue siendo síncrono a propósito: ahí la persona está delante esperando a ver la propuesta.

**Verificado con la foto real**, no solo con tests: `ok: true` → documento `e9ff8bf5` → `[DOC-VEHICULO] Analizado ... FACTURA_TALLER` → `PENDIENTE_CONFIRMACION`.

- 242/242 tests, incluido uno nuevo que falla si alguien vuelve a meter trabajo lento dentro de esa petición (comprueba que se responde **antes** de que el análisis termine).
- **Prevención, y es la lección cara del día:** *un endpoint verificado no es un circuito verificado.* Cuando algo se arregla para que lo consuma otro servicio, la prueba tiene que salir **desde ese servicio**, con su cliente, sus timeouts y sus tokens. Una llamada directa desde fuera no reproduce las condiciones reales y da una falsa sensación de cierre. Y un arreglo que hace más trabajo dentro de una petición es, por definición, un candidato a romper a quien la llama por tiempo.

---

### C-064 · La factura llegó entera, y aun así el sistema no supo leerla
- Fecha: 2026-08-12
- Área: `backend/src/services/ocr.service.ts`, `backend/src/services/ocrDocumentoVehiculo.service.ts`

**El síntoma.** Cerrado C-063, el circuito de WhatsApp por fin archivaba la factura. Alberto abrió la pantalla de documentos y se encontró un aviso: *"No he podido leer fecha, mantenimientos del documento. Escríbelo tú."* El sistema funcionaba de punta a punta y el resultado seguía siendo inservible.

**Lo que ponía el papel** (factura `INV/2026/0193`, del 13/05/2026): kit de distribución y bomba de agua, correa del alternador, tubo de embrague, agua refrigerante y mano de obra. Base 371,31 € + 26,00 € de impuesto = **397,31 € de total**.

**Lo que propuso el sistema:** importe **54,15 €**, matrícula **1100MTS**, sin fecha, sin mantenimientos. Confianza del OCR: 31 sobre 100 (los tickets del taxímetro salen a 64-73).

Cuatro fallos distintos, y ninguno era el mismo:

**1. La imagen: la tubería estaba afinada para tickets, no para documentos.**
La factura no era un papel: era una **foto de la pantalla de un ordenador**, con el muaré que eso produce. El preprocesado de C-060 (gris + normalizar + x2,5) está ajustado contra tira térmica y ahí no rascaba nada. La solución fue una segunda tubería —dividir la imagen por su propio fondo desenfocado y binarizar— que sube esa foto de 31 a 59 de confianza y deja la factura legible entera.

Lo importante es **cómo se elige** entre las dos, porque la de documento aplicada a un ticket térmico lo destroza (se probó: 0 de 4 datos correctos). No se adivina por el aspecto de la imagen: se lee, y **solo si la confianza baja de 45 se reintenta** con la otra tubería y se queda la mejor de las dos. Un ticket normal no paga ese coste nunca, y un caso que ya funcionaba no puede empeorar.

**2. El importe: se leía con el lector de tickets de gasolinera.**
Un ticket de gasolinera tiene un importe. Una factura de taller tiene uno por línea, más base y más impuesto — la de Alberto traía siete cifras en euros. Ese lector termina en un patrón de último recurso ("la primera cifra con un € detrás") y ahí cogió la primera línea, 154,15 €, que además el OCR leyó como 54,15 €.

No es un detalle cosmético: si el dueño le da a *aceptar*, eso se registra como gasto. **Se habría anotado un gasto de 54,15 € en vez de 397,31 €, y el descuadre del mes no lo habría explicado nadie.** Ahora hay un lector propio de facturas que **solo devuelve un importe si viene etiquetado como total**; si no hay etiqueta, no propone nada y se lo pide a la persona. Además, un "total" menor que la base imponible se descarta por imposible.

**3. La matrícula: se la inventó.** De `1100 mts` en la cabecera salió la matrícula `1100MTS`, porque encaja en el patrón de matrícula moderna (4 cifras + 3 consonantes). Con el ruido de una foto de documento, ese patrón va a encontrar matrículas falsas siempre. Ahora la matrícula leída **solo se propone si coincide con la del vehículo** al que se sube el documento — que además es lo único para lo que sirve, porque el vehículo lo elige la persona.

**4. Los kilómetros y los mantenimientos.** La factura traía una columna "Kilómetro 245,25" del programa del taller, de la que salían "245 km" propuestos; ahora se descarta cualquier lectura fuera de 1.000–2.000.000 km. Y ningún mantenimiento se detectaba porque el patrón exigía "kit **de** distribución" y el papel ponía "KIT DISTRIBUCION Y BOMBA DE AGUA" — y encima el OCR partió la línea entre "KIT" y "DISTRIBUCION", así que ningún patrón de dos palabras iba a casar jamás.

**Verificado con la foto real.** La factura está en `tests/fixtures/factura-taller-2026-08-12.jpg` y `smoke.ocrFacturaReal` la pasa por la tubería completa: total 397,31 €, fecha 13/05/2026, tres mantenimientos detectados, **cero campos faltantes**. Antes de esto, ese mismo fichero daba 54,15 € y dos faltantes.

- 256/256 tests. Los dos tests de los tickets reales del taxímetro siguen verdes, que es lo que demuestra que la tubería nueva no se ha llevado por delante la vieja.
- **Prevención.** Dos cosas. La primera: *el OCR no puede proponer un número que no sepa nombrar.* Coger "una cifra que había por ahí" es peor que dejar el campo vacío — es la misma lección de C-056 (los borrados del taxímetro) y de C-055 (el descuento de la gasolinera), y ya van tres. Si el dato no viene etiquetado, se pregunta.
  La segunda: *un formato nuevo de documento es un problema nuevo, no un parámetro más.* Facturas A4 y tickets térmicos no comparten preprocesado y no hay ajuste que sirva para los dos; intentar unificarlos rompe el que ya funcionaba. Cuando entre el primer PDF, o la primera tarjeta ITV real, habrá que volver aquí y repetir el ejercicio con su fixture.
- **Deuda declarada:** la tubería de documento está ajustada contra UNA sola factura. Se eligió a propósito un punto con vecinos buenos en el barrido (sigma 25 / umbral 150) en vez del máximo aislado, pero sigue siendo una foto. La segunda factura real que entre va a decir la verdad.

---

### C-065 · El sistema hizo bien las tres cosas y la pantalla no contó ninguna
- Fecha: 2026-08-12
- Área: `backend/src/index.ts`, `backend/src/services/propiedadArchivo.service.ts`, `app/src/app/(dashboard)/{mantenimientos,gastos,admin}/page.tsx`

**El síntoma.** Alberto confirmó la factura de taller ya leída bien (C-064) y reportó cuatro cosas de golpe: el mantenimiento de distribución "no se ha resuelto", "Ver documento" abría una pantalla en negro, el gasto aparecía en el total acumulado pero no en la lista de variables, y la tarjeta de desglose de cobros salía dos veces.

Lo llamativo: **el backend había hecho su trabajo entero y correctamente en los tres primeros casos.** En base de datos, la correa de distribución tenía `ultima_ejecucion_fecha = 13/05/2026` y `proximo_km = 342.133`; el gasto de 397,31 € estaba creado; el fichero estaba en disco. Lo que falló fue contarlo.

**1. El mantenimiento que sí estaba hecho.** Un mantenimiento recurrente **nunca** queda en estado `RESUELTO`: al hacerlo arranca un ciclo nuevo y vuelve a `PENDIENTE` con su próxima cita. `RESUELTO` se lo quedan solo los que no se repiten (un embrague). La pantalla enseñaba el estado crudo de la base de datos, así que "hecho hace tres meses" y "sin hacer jamás" se veían **exactamente igual**: badge amarillo, sección "Pendientes".

Ahora la etiqueta se calcula por lo que le importa a quien lee: `TOCA YA` / `AL DÍA` / `SIN HACER` / `HECHO`, y en cada línea se ve cuándo se hizo la última vez y cuándo toca la siguiente. Las secciones pasan a ser "Te reclaman" y "Al día", que es la pregunta real.

**2. La pantalla en negro.** El guardia de `/uploads` resuelve de quién es un fichero siguiendo `Documento → enlace → ParteDiario → vehículo`. Esa es la cadena de los **tickets del parte**. Los papeles del vehículo —ITV, factura de taller, póliza— no tienen enlace a ningún parte: cuelgan del vehículo directamente. Para ellos no encontraba dueño, devolvía 403, y el navegador pintaba negro sobre la propia factura del dueño, con sesión válida y fichero intacto.

Se añade el camino directo por `documento.vehiculo.cliente_id`, y —más importante— **la función sale de `index.ts` a su propio servicio** (`propiedadArchivo.service.ts`) para que se pueda probar. Metida junto al arranque del servidor no la cubría ni un test; ahora hay seis, y cubren las dos direcciones del guardia: denegar de más deja al dueño sin ver su factura, permitir de más enseña las fotos de un cliente a otro.

**3. El gasto que estaba en un total y no en la lista.** La pantalla de Gastos mezclaba dos escalas de tiempo sin avisar: la tarjeta "Total acumulado" llamaba a `/gastos/resumen`, que **ignora el filtro de periodo y no cuenta los fijos**, mientras la lista de debajo sí respetaba el periodo. Con una factura del 13/05 subida en agosto, el resultado era que el gasto aparecía en un sitio y no en el otro. Parecía dinero perdido.

Tres cambios: la tarjeta ahora sale del **mismo cálculo que el panel** (`/dashboard/resumen`) y muestra variables + fijos por separado; se avisa explícitamente de los gastos que el periodo está tapando ("hay 1 gasto fuera del periodo, por 397,31 €"); y cada gasto enseña "registrado el X" cuando la fecha de alta no es la del documento. Un gasto ya no se puede esconder en silencio.

**4. La tarjeta duplicada.** Copia y pega literal: el mismo bloque de "Desglose de cobros del periodo", idéntico carácter a carácter, dos veces en `admin/page.tsx`.

- 262/262 tests.
- **Prevención, y es la lección:** *el backend puede estar en lo cierto y el producto estar roto igual.* Los tres primeros fallos habrían pasado cualquier test de backend —los datos eran correctos—, y ninguno era discutible para quien miraba la pantalla. Cuando se cierra un circuito nuevo, la verificación tiene que llegar **hasta lo que ve la persona**, no hasta la fila de la base de datos. Es la hermana de la lección de C-063 ("un endpoint verificado no es un circuito verificado"), un paso más allá.
- **Corolario concreto:** *nunca enseñar un enum de la base de datos tal cual.* `PENDIENTE` significaba dos cosas opuestas según si había una ejecución anterior. Si un estado necesita contexto para entenderse, la pantalla tiene que dar ese contexto o traducirlo.

---

### C-066 · El comentario decía la verdad; la línea estaba dos bloques más abajo
- Fecha: 2026-08-13
- Área: `backend/src/index.ts`

**El síntoma.** Alberto corrigió el `redirect_uri_mismatch` en Google Cloud Console, pulsó "Conectar mi Drive", aceptó el permiso en Google — y al volver se encontró esto en la cara, como texto plano en el navegador:

```json
{"status":"FAIL","error":"auth_required","message":"Token de autenticacion requerido"}
```

**La causa.** `GET /api/drive/callback` lo llama el navegador del cliente **redirigido por Google**. Esa petición no lleva nuestra cookie ni nuestra cabecera `Authorization`: viene de `accounts.google.com`. Lo que la autentica es el `state` firmado con HMAC, que comprueba el propio router.

El router estaba bien: el callback nunca tuvo `requireAuth`. Lo que estaba mal era el **orden de montaje**. Express ejecuta los `app.use` por orden de registro, y el cableado era:

```
línea 146:  app.use('/api', requireAuth, requireNexosPayAccess());   ← guardia global
...
línea 160:  app.use('/api/drive', driveRoutes);                      ← demasiado tarde
```

El guardia se comía la petición antes de que llegara al router. Y el detalle que lo resume: **el comentario justo encima de la línea 160 decía "por eso va montado antes del requireAuth global"**. Describía la intención correcta. La línea estaba debajo. Nadie volvió a mirar si el código hacía lo que el comentario prometía.

**La corrección.** El montaje sube por encima del guardia global, con `requireNexosPayAccess()` explícito para no abrir de más: los otros endpoints (`/estado`, `/conectar`, `/desconectar`) conservan su `requireAuth` y su `requirePatron` dentro del router, así que no quedan expuestos. Solo el callback pasa sin sesión, que es justo lo que necesita.

Al mover la línea quedó el montaje viejo duplicado —el router montado dos veces—, cazado antes de subir. De ahí uno de los tests nuevos.

- 266/266 tests, con tres nuevos que cubren esto por los dos lados: que el callback no lleva sesión delante, que los demás endpoints sí, y **que `/api/drive` se monta antes del guardia global**.
- **Prevención, y es incómoda:** *un comentario no es una garantía.* Este decía exactamente lo correcto y llevaba meses siendo falso. Cuando un comentario afirma una propiedad del cableado ("esto va antes que aquello", "esto no pasa por aquí"), esa propiedad hay que **afirmarla en un test**, no en prosa. El test de este caso lee `index.ts` como texto y compara posiciones — poco elegante, pero es que `index.ts` abre el puerto al importarse y no se puede montar en una prueba, y ninguna prueba del router habría visto nada: el router siempre fue correcto.
- **Corolario:** los fallos de orden de middleware no los ve ningún test unitario de la pieza afectada. Solo se ven ejecutando el circuito entero o afirmando el cableado. Otra vuelta de la lección de C-063.
