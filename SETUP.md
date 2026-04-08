# PilotOS — Arranque Local para Pruebas

> Guía mínima para levantar PilotOS en local y poder probarlo con un taxi real.

---

## Requisitos previos

- Node.js 20+ instalado (`node -v` para verificar)
- Acceso a internet (la BD está en servidor remoto)
- El fichero `backend/.env` ya existe con la URL de BD correcta

---

## Primera vez (setup completo)

### 1. Instalar dependencias

```bash
# Backend
cd "C:\Mis Documentos\NEXO STUDIOS\PilotOS\backend"
npm install

# Frontend
cd "C:\Mis Documentos\NEXO STUDIOS\PilotOS\app"
npm install
```

### 2. Preparar la base de datos (solo primera vez)

```bash
cd "C:\Mis Documentos\NEXO STUDIOS\PilotOS\backend"

# Generar cliente Prisma
npm run db:generate

# Crear/sincronizar tablas en BD remota
npm run db:push

# Cargar catálogo de mantenimientos
npm run db:seed
```

> Si `db:push` falla, verificar conectividad: `Test-NetConnection -ComputerName 161.97.108.106 -Port 5433`

---

## Arranque diario (una vez configurado)

**Terminal 1 — Backend:**
```bash
cd "C:\Mis Documentos\NEXO STUDIOS\PilotOS\backend"
npm run dev
# → Escucha en http://localhost:3001
# → Debe mostrar: "PilotOS Backend running on port 3001"
```

**Terminal 2 — Frontend:**
```bash
cd "C:\Mis Documentos\NEXO STUDIOS\PilotOS\app"
npm run dev
# → Escucha en http://localhost:3000
```

---

## Crear primer usuario (onboarding)

1. Abrir `http://localhost:3000` en el navegador
2. Se redirige automáticamente a `/login`
3. Introducir cualquier teléfono → si no existe, te redirige a `/onboarding`
4. Completar el wizard de 5 pasos:
   - **Paso 1**: Nombre del propietario + teléfono (este teléfono será el de login)
   - **Paso 2**: Datos del vehículo (matrícula, marca, km actuales)
   - **Paso 3**: Asalariados (si eres conductor único, pulsar Siguiente sin añadir)
   - **Paso 4**: Gastos fijos (opcional, puede dejarse vacío)
   - **Paso 5**: Confirmar y finalizar
5. Al finalizar, te redirige al login → entrar con el teléfono del paso 1

---

## Instalar en el móvil como app (PWA)

Una vez el backend y frontend estén arrancados y accesibles desde el móvil (misma red WiFi):

**En iPhone (Safari):**
1. Abrir `http://[IP_DE_TU_PC]:3000/conductor` en Safari
2. Pulsar el icono de compartir (cuadrado con flecha arriba)
3. "Añadir a pantalla de inicio"
4. La app se instala como una app nativa con icono propio

**En Android (Chrome):**
1. Abrir la URL en Chrome
2. Chrome mostrará automáticamente un banner "Añadir a pantalla de inicio"
3. O: menú → "Instalar app"

> Para acceder desde el móvil a tu PC local: busca la IP de tu PC con `ipconfig` (Windows) y usa `http://192.168.x.x:3000`

---

## Flujo mínimo de prueba real

**Como conductor** (experiencia móvil/PWA en `/conductor`):
1. **Home**: botón grande "NUEVO PARTE" → rellena el wizard → envía
2. **Historial**: los últimos partes aparecen en la pantalla de inicio

**Como patrón** (dashboard en `/admin`):
1. **Panel ejecutivo**: `/admin` — resumen de ingresos, gastos, alertas
2. **Partes**: `/partes` — listado completo de todos los partes
3. **Gastos**: `/gastos/nuevo` — registrar gasto
4. **Mantenimientos**: `/mantenimientos`
5. **Flota**: `/flota` — vehículos y conductores

---

## Ver datos de la BD directamente

```bash
cd "C:\Mis Documentos\NEXO STUDIOS\PilotOS\backend"
npm run db:studio
# → Se abre en http://localhost:5555
# → Permite ver y editar todas las tablas
```

---

## Notas importantes

- **El ticket del taxímetro es obligatorio** para enviar un parte. Puedes hacer foto con el móvil o subir una imagen desde el PC.
- **OCR en fase de test**: Si la foto no es legible, el sistema la marca como ilegible pero NO bloquea la creación del parte (comportamiento activado para pruebas — ver C-019).
- **Los partes son inmutables** una vez enviados. Si hay un error, se gestiona vía incidencia.
- **Los km del vehículo se actualizan** automáticamente con cada parte enviado.
