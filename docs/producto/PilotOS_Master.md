# PilotOS — Documento Maestro de Arranque (v1)

## 1. Propósito de este documento

Este documento unifica y consolida, en una sola base operativa, la documentación clave de:

- PilotOS Taxi
- Base funcional y lagunas cerradas
- Setup de Claude Code dentro del ecosistema NexOS

Su objetivo es servir como **documento maestro de arranque** para que Claude Code pueda iniciar PilotOS de forma ordenada, modular y alineada con NexOS.

Este documento debe tratarse como la referencia inicial para arrancar el proyecto. A partir de aquí, Claude Code podrá crear estructura, proponer arquitectura, preparar módulos y documentar decisiones nuevas.

---

## 2. Contexto del ecosistema NexOS

NexOS es el núcleo del ecosistema.

### Capas del ecosistema

1. **NexOS**  
   Núcleo compartido. Conecta productos, integra módulos comunes y mantiene coherencia arquitectónica.

2. **GlorIA**  
   Agente central visible del ecosistema. Es la interfaz conversacional única con la que habla el cliente.

3. **Productos OS**  
   Sistemas especializados construidos sobre NexOS. Ejemplos actuales:
   - RentOS
   - NauticOS
   - SociOS
   - PilotOS

### Regla de arquitectura obligatoria

Los productos OS **no deben duplicar lógica** si esa lógica puede vivir en NexOS o en una capa compartida.

---

## 3. Qué es PilotOS en esta fase

PilotOS Taxi es el sistema de control operativo, económico y documental para taxistas.

Centraliza en un solo entorno:

- partes diarios
- ingresos
- combustible
- reparto económico
- gastos
- facturas y tickets
- mantenimientos
- obligaciones administrativas
- avisos
- informes
- trazabilidad

Y se apoya en:

- frontend propio
- dashboard propio
- vistas por área
- Drive para documentos
- GlorIA como cara visible
- LucIA como subagente especializado de PilotOS

### Definición estratégica actual

En esta fase, **PilotOS Taxi ya no se trata como un MVP recortado**, sino como el producto completo del vertical taxi, validado primero con 3 taxis reales, pero diseñado desde el inicio para abrirse luego a:

- más taxistas
- VTC
- flotas

### Qué no se aborda todavía

Aunque la base debe quedar preparada para escalar, en esta fase todavía no se entra de lleno en:

- VTC operativamente
- flotas complejas
- jerarquías empresariales avanzadas
- escenarios multi-vehículo complejos por conductor
- reporting avanzado de flota

---

## 4. Principios rectores de PilotOS

1. **Una sola identidad visible**  
   El cliente siempre interactúa con GlorIA.

2. **LucIA como inteligencia específica del vertical taxi**  
   LucIA opera internamente como subagente de PilotOS, pero hacia fuera sigue existiendo GlorIA.

3. **El parte diario es el motor del sistema**  
   Toda la operación real gira alrededor del parte diario.

4. **Frontend propio, pero no fuente de verdad**  
   El frontend sirve para operar, consultar y controlar. La fuente de verdad es la base de datos del sistema.

5. **Documentos fuera de la base de datos pesada**  
   Los archivos se almacenan en Drive y se vinculan internamente.

6. **Auditoría real**  
   Todo cambio sensible debe dejar rastro.

7. **Escalabilidad sin rehacer la base**  
   La primera versión debe estar preparada para crecer sin romper su estructura.

8. **Control de un vistazo**  
   El patrón debe entender el negocio rápido desde dashboard y vistas claras.

---

## 5. Decisiones cerradas que se deben respetar

### 5.1 Identidad y conversación

- GlorIA es la única identidad visible.
- LucIA es el subagente específico de PilotOS.
- Los documentos entran por WhatsApp o frontend, pero la comunicación sigue el contexto GlorIA/LucIA.

### 5.2 Parte diario

- El parte diario es **por día, por conductor y asociado a un vehículo**.
- El patrón rellena el mismo parte que un asalariado.
- No existe un modelo de parte distinto para el patrón.
- En el modelo base actual, no se contempla que un conductor trabaje en más de un vehículo el mismo día.
- El parte debe poder rellenarse desde móvil.
- Debe permitir subir las imágenes obligatorias del propio parte.

### 5.3 Fuente oficial del kilometraje

- El kilometraje oficial del sistema sale del **último parte diario validado**.
- Una factura de taller con kilómetros puede quedar registrada como dato documental, pero no sustituye automáticamente el km maestro.
- Toda corrección manual de kilometraje debe quedar auditada.

### 5.4 Documentos

- Los documentos entran por WhatsApp o frontend.
- Deben guardarse en Drive.
- Deben vincularse a su entidad de negocio correspondiente.
- Deben tener hash y deduplicación.
- Deben registrar estado OCR, estado de validación y usuario remitente.

### 5.5 Gasto y reparto

- El sistema debe soportar varios modelos económicos, no uno solo.
- El campo **varios** no es un catálogo cerrado.
- Si se rellena **varios**, el concepto es obligatorio.
- El importe de **varios** repercute en la cuenta del patrón.
- La cuota de PilotOS debe aparecer como gasto visible, aunque esté bonificada a 0.

### 5.6 Multas

- La multa debe imputarse a quien conducía el vehículo en ese momento.
- Si no se puede determinar con certeza, LucIA debe preguntar antes de imputarla.

### 5.7 Permisos

Roles mínimos:
- patrón / propietario
- asalariado / conductor
- admin NexOS

Permisos mínimos:
- el patrón puede ver todo su entorno PilotOS, gestionar asalariados, gastos, configuraciones, históricos, PDF e informes
- el asalariado puede enviar su parte, consultar lo que le afecta y subir documentos si se le permite
- el asalariado no puede cambiar configuración económica ni estructura
- el admin NexOS puede supervisar y operar a nivel transversal

---

## 6. Onboarding inicial

El onboarding inicial debe recoger al menos:

- nombre del titular
- empresa, si aplica
- teléfono
- email
- tipo de actividad
- número de vehículos
- matrícula
- marca y modelo
- si trabaja solo o con asalariado
- nombre y teléfono del asalariado, si existe
- modelo económico inicial
- gastos fijos base
- obligaciones y vencimientos básicos
- preferencias de avisos

### Resultado esperado del onboarding

- cliente creado
- patrón creado
- asalariado creado si aplica
- vehículo creado
- configuración económica creada
- estructura documental preparada
- acceso listo
- LucIA reconoce al cliente

### Regla importante

El onboarding **no bloquea la estructura futura**. Después, el patrón debe poder:

- añadir asalariados
- eliminar asalariados
- cambiar configuración económica
- ajustar gastos fijos
- ajustar mantenimientos y obligaciones

LucIA podrá ejecutar estos cambios solo si quien lo solicita es el patrón.

---

## 7. Campos mínimos del parte diario

- fecha trabajada
- fecha de envío / auditoría
- conductor
- vehículo
- km iniciales
- km finales
- ingreso bruto
- combustible
- datáfono
- varios
- concepto de varios, si aplica
- ticket de taxímetro obligatorio
- ticket de combustible obligatorio si combustible > 0

### Reglas del parte

- un parte por día y por conductor
- el parte está asociado a un vehículo
- km_fin no puede ser menor que km_inicio
- no se debe cerrar el parte si falta un ticket obligatorio

### Cálculos base derivados

- bruto diario = ingreso bruto del día
- neto diario = bruto - combustible
- otros ajustes diarios = varios, si aplica
- reparto según configuración del conductor / cliente

---

## 8. Modelo económico

PilotOS debe soportar varios modelos económicos de taxi.

### Caso típico en Santa Cruz de Tenerife

- el conductor trabaja el día
- se obtiene el bruto diario
- se descuenta el combustible del día
- el resto se reparte normalmente al 50/50
- al final de mes, el patrón asume o distribuye costes fijos según el modelo configurado

### Requisito clave

El sistema no debe codificarse cerrado para un solo modelo. Debe aceptar configuración variable por cliente.

---

## 9. Estructura funcional del producto

PilotOS debe quedar separado internamente en estos bloques:

1. **Operación diaria**
   - partes diarios
   - validación
   - cálculos base

2. **Economía y reparto**
   - configuración económica
   - liquidaciones
   - cierres de periodo
   - informes

3. **Gastos**
   - diarios
   - fijos
   - variables

4. **Mantenimientos y obligaciones**
   - revisiones
   - averías
   - ITV
   - seguros
   - permisos
   - recordatorios

5. **Documental**
   - facturas
   - tickets
   - PDF
   - OCR
   - deduplicación
   - enlaces a Drive

6. **Capa conversacional**
   - GlorIA
   - LucIA
   - mensajes
   - solicitudes
   - aclaraciones

7. **Auditoría y control**
   - logs
   - estados
   - acciones sensibles
   - historial

8. **Frontend por vistas**
   - dashboard
   - partes
   - gastos
   - mantenimientos y obligaciones
   - documental
   - conductores
   - informes

---

## 10. Vistas mínimas del frontend

### Dashboard general
Debe mostrar al menos:
- facturación
- combustible
- neto
- gastos
- beneficio estimado o real
- próximos mantenimientos
- alertas activas
- últimos movimientos

### Vista Partes
Se alimenta de:
- partes_diarios
- calculos_partes
- documentos

### Vista Gastos
Se alimenta de:
- gastos
- documentos
- conductores
- vehiculos

### Vista Mantenimientos y obligaciones
Se alimenta de:
- obligaciones_mantenimiento
- seguimiento_mantenimiento
- avisos
- documentos

### Vista Conductores
Se alimenta de:
- usuarios
- conductores
- configuracion_economica
- partes_diarios

### Vista Documental
Se alimenta de:
- documentos
- document_links

### Vista Informes
Se alimenta de:
- cierres_periodo
- documentos

---

## 11. Auditoría, PDF y reporting

PilotOS debe incluir:

- PDF mensual
- PDF por rango de fechas
- descarga desde frontend
- logs de cambios
- historial de acciones sensibles
- confirmaciones enviadas
- control de quién hizo qué

### Contenido mínimo del PDF

- nombre del cliente o empresa
- resumen económico
- gastos
- mantenimientos relevantes
- marca tipo **PilotOS by NexOS**

---

## 12. Reglas duras de datos

Estas reglas deben existir a nivel de datos y validaciones:

- no puede haber dos partes del mismo conductor para el mismo vehículo en la misma fecha
- ticket de taxímetro obligatorio en todo parte
- ticket de combustible obligatorio si combustible > 0
- km_fin no puede ser menor que km_inicio
- el km oficial del sistema sale del último parte validado
- un asalariado no puede cambiar configuración económica ni estructura
- todo cambio sensible debe dejar rastro en logs_auditoria
- toda factura o ticket debe tener hash para deduplicación

---

## 13. Entidades base sugeridas

El sistema puede arrancar con estas entidades base:

- clientes
- usuarios
- roles
- conductores
- vehiculos
- configuracion_economica
- partes_diarios
- calculos_partes
- gastos
- documentos
- document_links
- obligaciones_mantenimiento
- seguimiento_mantenimiento
- avisos
- conversaciones_mensajes
- cierres_periodo
- logs_auditoria

---

## 14. Orden recomendado de construcción

Seguir este orden:

1. clientes
2. usuarios y roles
3. vehiculos
4. conductores
5. configuracion_economica
6. partes_diarios
7. calculos_partes
8. documentos
9. gastos
10. obligaciones_mantenimiento
11. seguimiento_mantenimiento
12. avisos
13. conversaciones y mensajes
14. cierres_periodo
15. logs_auditoria

---

## 15. Cómo debe trabajar Claude Code en NexOS

Claude Code debe actuar como:

- asistente de desarrollo
- auditor de arquitectura
- generador de documentación técnica
- coordinador de agentes especializados
- herramienta de mejora continua

### Reglas de trabajo

Antes de modificar código o estructura importante, Claude debe:

1. entender la arquitectura del proyecto
2. revisar documentación existente
3. detectar duplicaciones
4. proponer enfoque si el cambio es grande

### Prioridades técnicas

Claude debe priorizar:

- modularidad
- reutilización
- arquitectura limpia
- documentación técnica
- integraciones consistentes

### Aprendizaje continuo

Antes de modificar partes importantes debe revisar:

- `docs/learning/`
- `docs/correcciones.md`
- `docs/decisiones-tecnicas.md`

Cada vez que Claude:
- corrija un error
- haga un refactor importante
- resuelva una mala práctica
- mejore una integración
- optimice arquitectura

debe documentarlo con este formato mínimo:

- fecha
- área afectada
- problema detectado
- causa
- solución aplicada
- prevención futura

---

## 16. Qué debe crear Claude Code en el proyecto

Claude Code debe ser quien prepare la estructura inicial dentro de `C:\Mis Documentos\NEXO STUDIOS`.

### Estructura recomendada de PilotOS

```text
PilotOS/
├─ docs/
│  ├─ producto/
│  ├─ arquitectura/
│  ├─ decisiones/
│  ├─ workflows/
│  └─ learning/
├─ frontend/
├─ backend/
├─ database/
├─ automations/
├─ integrations/
└─ shared/
```

### Archivos mínimos a crear

- `PilotOS/docs/producto/PilotOS_Master.md`
- `PilotOS/docs/arquitectura/arquitectura-inicial.md`
- `PilotOS/docs/decisiones/decisiones-tecnicas.md`
- `PilotOS/docs/learning/correcciones.md`

Y, si detecta que faltan en la raíz del repo:
- `CLAUDE.md`
- `.claude/settings.json`
- `.claude/agents/architecture-agent.md`
- `.claude/agents/gloria-integration-agent.md`
- `.claude/agents/automation-agent.md`
- `.claude/agents/review-agent.md`

---

## 17. Estrategia de arranque recomendada

### Fase 1 — Bootstrap del proyecto
Claude Code debe:
- revisar el contexto NexOS
- revisar este documento maestro
- crear la estructura de carpetas de PilotOS
- crear los archivos base de documentación
- no implementar todavía la lógica completa

### Fase 2 — Análisis técnico
Claude Code debe devolver:
- resumen ejecutivo
- arquitectura funcional por módulos
- propuesta inicial de entidades y relaciones
- reparto entre lógica PilotOS vs lógica compartida NexOS
- riesgos
- backlog técnico por prioridad
- decisiones pendientes, si las detecta

### Fase 3 — Base técnica inicial
Claude Code podrá preparar:
- estructura técnica del proyecto
- base de backend
- base de frontend
- base de database
- base documental
- separación modular correcta

### Fase 4 — Implementación progresiva
Ir por bloques según el orden recomendado de construcción.

---

## 18. Decisiones abiertas delegadas a Claude Code

Se delega en Claude Code, con criterio arquitectónico y sin inventar reglas de negocio contrarias a la documentación, decidir:

- la mejor organización interna de carpetas técnicas
- la propuesta concreta de backend
- la separación de módulos compartidos vs específicos
- el patrón de contratos entre PilotOS y GlorIA
- el nivel de abstracción necesario para crecer a VTC y flotas sin meter aún esa complejidad
- las decisiones técnicas no funcionales que no contradigan este documento

Si algo no está claro, Claude debe decirlo explícitamente y no inventarlo.

---

## 19. Prompt recomendado para Claude Code — Bootstrap + análisis

```text
Actúa como arquitecto principal y lead técnico del ecosistema NexOS.

Estás trabajando dentro del repositorio ubicado en:
C:\Mis Documentos\NEXO STUDIOS

Debes asumir que PilotOS es un nuevo producto del ecosistema y que quieres dejarlo preparado desde cero de forma profesional, modular y escalable.

Contexto obligatorio:
- NexOS es el núcleo compartido del ecosistema.
- GlorIA es la única identidad visible para el cliente.
- LucIA es el subagente específico de PilotOS.
- Los productos OS no deben duplicar lógica si esta puede vivir en NexOS.
- Debes revisar primero la documentación antes de decidir estructura o implementar nada.
- Debes documentar toda corrección importante, mejora de arquitectura o refactor relevante.

Tu primera misión no es implementar toda la lógica de PilotOS, sino dejar preparado el proyecto correctamente.

Quiero que hagas esto en orden:

1. Revisar el contexto del ecosistema NexOS y la documentación existente.
2. Crear la estructura base de carpetas y archivos de PilotOS dentro de NEXO STUDIOS.
3. Crear la documentación base mínima si no existe.
4. Usar como documento maestro de arranque el archivo:
   PilotOS/docs/producto/PilotOS_Master.md
5. Analizar PilotOS como producto del vertical taxi.
6. Devolverme una propuesta clara de:
   - arquitectura funcional
   - módulos
   - entidades base
   - orden de construcción
   - riesgos
   - lógica compartida con NexOS
   - decisiones técnicas a vigilar
7. No implementar todavía toda la aplicación final.
8. Si haces cambios estructurales o de documentación, indícalos claramente.

Reglas de negocio ya cerradas que debes respetar:
- El parte diario es por día, por conductor y asociado a un vehículo.
- El patrón rellena el mismo parte que un asalariado.
- El km oficial sale del último parte diario validado.
- Los documentos se guardan en Drive y se vinculan internamente.
- El frontend no es la fuente de verdad.
- Debe haber roles patrón, asalariado y admin NexOS.
- El sistema debe soportar varios modelos económicos.
- La cuota de PilotOS debe seguir visible aunque esté bonificada.
- Todo cambio sensible debe quedar auditado.

Quiero que empieces por dejar el proyecto ordenado y listo para arrancar bien.
```

---

## 20. Prompt recomendado para Claude Code — Ejecución técnica posterior

```text
Actúa como arquitecto principal y lead técnico del ecosistema NexOS.

Ya existe una base documental inicial de PilotOS dentro del repositorio NEXO STUDIOS. Quiero que, respetando esa documentación, prepares la base técnica inicial del producto PilotOS Taxi.

Debes respetar estrictamente:

- NexOS es el núcleo compartido.
- GlorIA es la única identidad visible.
- LucIA es el subagente interno de PilotOS.
- No debes duplicar lógica compartible.
- Debes mantener trazabilidad y documentación.
- No inventes reglas que contradigan la documentación.

Quiero que trabajes siguiendo este orden:

1. revisar documentación existente de PilotOS
2. proponer o ajustar estructura técnica si hace falta
3. preparar modelo de datos inicial
4. separar correctamente:
   - operación diaria
   - economía y reparto
   - gastos
   - mantenimientos y obligaciones
   - documental
   - conversaciones / mensajes
   - informes / cierres
   - auditoría
5. construir la base técnica mínima sólida y escalable
6. seguir como referencia el orden funcional recomendado del documento maestro
7. señalar cualquier bloqueo o decisión no clara

Entregables:
- estructura técnica propuesta
- base de entidades y relaciones
- backlog técnico priorizado
- preparación inicial del proyecto para empezar a implementar
- explicación breve de decisiones arquitectónicas importantes
- indicación de qué documentación debe actualizarse

Importante:
- prioriza arquitectura limpia
- prioriza modularidad
- prepara la base para que en el futuro pueda crecer a VTC y flotas
- no mezcles todavía complejidades de flota avanzada si no son necesarias en esta fase
```

---

## 21. Recomendación operativa final

Para Claude Code, el formato mejor es **Markdown**.

### Uso recomendado
- **Markdown** = documento canónico de trabajo para Claude Code
- **PDF** = copia de lectura o revisión humana

Por tanto:
1. guardar este documento como `.md`
2. usar primero el prompt de **Bootstrap + análisis**
3. revisar lo que Claude devuelva
4. después usar el prompt de **Ejecución técnica posterior**

---

## 22. Resultado esperado

Si se sigue este documento correctamente, PilotOS debe arrancar:

- alineado con NexOS
- integrado con GlorIA
- preparado para crecer
- con estructura limpia
- con documentación viva
- sin rehacer la base más adelante