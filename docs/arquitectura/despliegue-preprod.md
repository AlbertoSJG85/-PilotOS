# Checklist de Despliegue a Pre-producción (PilotOS)
Fecha: **2026-03-09** | Estado: **READY**

Este documento detalla los pasos para levantar **PilotOS** en el entorno de pre-producción (Coolify).

---

## 🏗️ 1. Infraestructura
Asumimos un entorno con Coolify y 2 servicios/recursos o un "Project" agrupado:
1. **PilotOS Backend** (Node.js)
2. **PilotOS Frontend** (Next.js)

Ambos conectan a la base de datos compartida **NexOS Database** (PostgreSQL central).

---

## 🔐 2. Variables de Entorno Obligatorias

### Backend (`/backend`)
```env
# Conexión principal
DATABASE_URL="postgresql://user:pass@host:5432/nexos?schema=pilotos"

# Seguridad
JWT_SECRET="TU_SECRETO_SEGURO_AQUI"
PORT="3001"
NODE_ENV="production"
```

### Frontend (`/app`)
```env
# URL Pública del Backend (necesaria para el navegador y peticiones isomorfas)
NEXT_PUBLIC_API_URL="https://api.tu-dominio.com"

NODE_ENV="production"
```

---

## ⚙️ 3. Comandos de Construcción (Build Scripts)

El ecosistema soporta Nixpacks / Buildpacks por defecto:

### Backend
- **Install Command:** `npm install`
- **Build Command:** `npm run db:generate && npm run build`
- **Start Command:** `npm run start`

*(Nota: En la primera ejecución o tras alterar esquemas de BD, se debe correr manualmente `npm run db:push` en la consola de despliegue si se busca autogenerar tablas en el schema de PG).*

### Frontend
- **Install Command:** `npm install`
- **Build Command:** `npm run build`
- **Start Command:** `npm run start`

---

## ✅ 4. Checklist de Validación Post-Arrancado

1. **Rutas Públicas Backend:** Verificar respuesta HTTP 200 en `https://api.tu-dominio.com/health` (debe devolver versión y status `ok`).
2. **UI Frontend:** Entrar a la URL pública del Dashboard y verificar carga libre de errores 500.
3. **Flujo de Login:** Probar el login con un número (p. ej. `+34600...`) de un usuario que exista en el schema `minos.Users` y que tenga la fila correspondiente en `pilotos.clientes / conductores`.
4. **Almacenamiento (Uploads):** Subir un parte con fotos para asegurar que el volumen mapeado para la ruta `uploads/` tiene premisos de escritura correctos en el backend.
5. **Comunicación Cruzada (Internal/GlorIA):** Validar desde n8n si GlorIA alcanza `/internal/usuario-por-telefono` pasando el Custom Header correcto `x-internal-token`.

---

## 🎯 5. Orden de Lanzamiento Recomendado

1. Declarar y Guardar ENVs en el Backend de Coolify.
2. Hacer **Deploy** del Backend. Esperar a `Running`.
3. Validar los endpoints públicos del backend.
4. Declarar y Guardar ENVs en la UI con la URL generada del backend.
5. Hacer **Deploy** del Frontend.
6. Validar login de Patrón.

---

## 🖥️ 6. Desarrollo Local contra PostgreSQL Remota

### Topologia

```
Windows local (dev)
  └── PilotOS backend (localhost:3001)
        └── Prisma → 161.97.108.106:5433/nexos (schema pilotos)
```

La BD PostgreSQL del ecosistema NexOS esta en Coolify (Contabo). El puerto 5433 esta publicado y accesible directamente. **No se necesita tunel SSH.**

### Configuracion del .env local

```env
# Conexion directa al servidor remoto (puerto 5433 publico)
DATABASE_URL="postgresql://USER:PASSWORD@161.97.108.106:5433/nexos?schema=pilotos"
```

Notas:
- La BD compartida se llama `nexos` (no `pilotos`). El schema de PilotOS es `pilotos` (DT-002).
- Obtener credenciales reales desde Coolify > recurso pilotos-postgres > variables.
- No usar `127.0.0.1` salvo que haya un tunel SSH activo mapeando el puerto.

### Verificacion de conectividad

```powershell
# 1. Verificar que el puerto es alcanzable
Test-NetConnection -ComputerName 161.97.108.106 -Port 5433

# 2. Generar cliente Prisma
cd PilotOS/backend
npx prisma generate

# 3. Verificar que Prisma alcanza la BD
npx prisma db pull --schema=prisma/schema.prisma

# 4. Arrancar backend
npm run dev
```

Si el paso 1 falla (TcpTestSucceeded: False), el puerto esta bloqueado por firewall. En ese caso, usar tunel SSH:

```powershell
# Solo si el puerto NO esta abierto publicamente
ssh -L 5433:127.0.0.1:5433 usuario@161.97.108.106
# Y cambiar DATABASE_URL a 127.0.0.1:5433
```

### Alerta de seguridad

Tener PostgreSQL expuesto publicamente es un riesgo. Recomendaciones:
- Configurar firewall en Contabo para permitir solo IPs de desarrollo conocidas
- O cerrar el puerto publico y usar siempre tunel SSH
- Rotar credenciales periodicamente
