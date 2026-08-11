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
