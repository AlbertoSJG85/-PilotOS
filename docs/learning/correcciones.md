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

### C-023 · Mensajes de error de upload genéricos
- Area: Frontend / upload
- Problema: `upload.ts` lanzaba `throw new Error('Error subiendo foto')` para todo. El usuario no podía distinguir tamaño excesivo, formato no soportado, sesión caducada o caída del servidor.
- Causa: Implementación mínima sin diferenciar códigos HTTP.
- Solucion: Mapping explícito de 413 (file_too_large), 415 (invalid_mime), 401 (sesión expirada con redirect), errores de red, fallo del servidor. Backend `upload.routes.ts` añade middleware multer-error que traduce `LIMIT_FILE_SIZE` y MIME inválido a 413/415 con mensaje claro.
- Prevencion: Diferenciar mensajes según código HTTP. El usuario debe saber si puede arreglarlo (foto más pequeña) o necesita ayuda técnica.
