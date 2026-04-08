# Auditoría y Visión del Frontend de PilotOS

## 1. Clasificación del Frontend Actual

El análisis de la carpeta `app/src/` revela una arquitectura monolítica donde no existe separación de componentes ni reutilización de UI.

- **Descartable**: Todos los archivos `page.tsx` actuales (`onboarding/page.tsx`, `parte/page.tsx`, `dashboard/page.tsx` y subrutas). Son archivos enormes (20+ KB) que mezclan estado complejo, llamadas a API y UI en un solo bloque. Esta estructura no es escalable ni mantenible y va en contra de la arquitectura limpia de NexOS.
- **Legacy (solo como referencia)**: El flujo de usuario implementado en esas páginas sirve para entender qué campos se pidieron y cómo se estructuró la UX inicial (ej. el flujo paso a paso del onboarding o la subida de tickets en el parte).
- **Refactorizable**: El archivo `lib/api.ts` puede servir de base conceptual para un futuro SDK o capa de servicios de fetch adaptada al nuevo backend.
- **Reutilizable**: Configuración base del proyecto (Next.js, TypeScript).

**Conclusión**: El frontend actual **no debe ser la base** para escalar el producto. Se debe tratar exclusivamente como un prototipo o MVP legacy para extraer reglas de negocio visuales.

---

## 2. Visión Recomendada para el Nuevo Frontend

El nuevo frontend debe construirse siguiendo los estándares del ecosistema NexOS:

- **Framework**: Next.js App Router con React Server Components (RSC) por defecto para mejorar rendimiento y SEO, pasando estado al cliente solo cuando haya interactividad.
- **Diseño Dinámico y Premium**:
  - Uso de un sistema de diseño propio u open-source estilizado (como *shadcn/ui* o *TailwindCSS* con paleta estricta).
  - Tema adaptativo (Dark Mode por defecto, consistente con la marca NexOS "PilotOS").
  - Micro-interacciones y skeleton loaders para dar sensación de inmediatez, especialmente en pantallas de carga de OCR o subida de tickets.
- **Arquitectura de Carpetas**:
  - `app/`: Rutas, layouts y Server Components.
  - `components/ui/`: Botones, inputs, modales (reutilizables y 'mudos').
  - `components/features/`: Componentes complejos conectados a lógica de negocio (ej. `FormularioParteDiario`, `GraficoBeneficios`).
  - `lib/api/`: Capa de abstracción estricta contra el backend de PilotOS (`/api/*`).

---

## 3. Arquitectura de Navegación Sugerida

El sistema debe adaptar su navegación dependiendo del Rol del usuario autenticado (extraído del backend / JWT).

### Experiencia del Patrón (Admin / Propietario)
Visión completa del negocio y la flota:
1. **`/dashboard`**: Resumen global (Facturación, Combustible, Neto, Próximos mantenimientos, Alertas).
2. **`/partes`**: Historial y auditoría de partes enviados por asalariados o él mismo.
3. **`/gastos`**: Gestión de gastos fijos y variables.
4. **`/mantenimientos`**: Panel de control de la flota (vehículos, ITVs, averías, seguros).
5. **`/documentos`**: Repositorio de facturas y tickets analizados por OCR.
6. **`/flota`**: Gestión de vehículos, configuración económica y asalariados (alta/baja de conductores).

### Experiencia del Asalariado (Conductor)
Visión simplificada, enfocada en la operación:
1. **`/dashboard`**: Resumen personal (mis jornadas, mis ingresos netos generados, mis alertas de vehículo).
2. **`/parte/nuevo`**: Flujo principal para enviar el parte diario con subida de fotos (taxímetro, tickets).
3. **`/partes/mis-partes`**: Histórico personal en modo solo lectura.
4. **`/perfil`**: Ajustes personales.
El asalariado **no** tiene acceso a configuraciones económicas ni flota.

---

## 4. Relación Frontend ↔ GlorIA / LucIA

El frontend de PilotOS y GlorIA/LucIA operan como interfaces paralelas que comparten la misma base de datos, pero con responsabilidades distintas:

1. **El Frontend es para operar estructuralmente y visualizar datos masivos**:
   - Rellenar un parte complejo con 3 fotos adjuntas.
   - Ver dashboards visuales y descargar PDFs mensuales.
   - Configurar modelos de reparto económico complejos.
2. **GlorIA (con el prompt de LucIA) es para asistencia, consultas rápidas y notificaciones**:
   - "GlorIA, envía la factura del taller que acabo de pagar" (WhatsApp).
   - "GlorIA, ¿cuándo me toca la ITV del vehículo 1234-ABC?" (WhatsApp).
   - "El parte de ayer ha sido procesado. Tienes un neto de 50€." (Notificación activa enviada desde el backend vía n8n hacia GlorIA).

El frontend no debe contener la lógica de chat ni asumir el rol de GlorIA. Son sistemas desacoplados que leen el mismo backend (`PostgreSQL pilotos.*`).
