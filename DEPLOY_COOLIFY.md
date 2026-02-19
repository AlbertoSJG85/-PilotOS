# 🚀 Despliegue de PilotOS en Coolify

Guía para desplegar PilotOS en tu servidor con Coolify y empezar con una base de datos limpia.

---

## 1. Preparación en Coolify

1.  Accede a tu panel de Coolify.
2.  Crea un nuevo **Project** (ej: `PilotOS`).
3.  Dentro del proyecto, crea un entorno **Production**.

---

## 2. Base de Datos (PostgreSQL)

PilotOS en producción usa **PostgreSQL**, no SQLite.

1.  En Coolify, añade un nuevo recurso: **Database** -> **PostgreSQL**.
2.  Dale un nombre (ej: `pilotos-db`).
3.  Una vez creada, copia la **Connection String (Internal)**. Será algo como:
    `postgresql://postgres:password@ip:5432/postgres`

---

## 3. Despliegue del Backend

1.  En Coolify, añade un nuevo recurso: **Application** -> **Public Repository**.
2.  Usa tu repo de GitHub (donde subirás este código).
3.  **Build Pack**: `Dockerfile`.
4.  **Docker Context**: `backend` (importante, apunta a la carpeta del backend).
5.  **Dockerfile Location**: `Dockerfile`.
6.  **Variables de Entorno**:
    *   `DATABASE_URL`: Pega la Connection String de PostgreSQL de arriba.
    *   `PORT`: `3001`
7.  **Volumes** (IMPORTANTE para las fotos):
    *   Añade un volumen: `pilotos-uploads:/app/uploads`
    *   Esto asegura que las fotos no se pierdan al reiniciar el contenedor.
8.  **URLs**: Configura tu dominio (ej: `https://api.pilotos.app`).
9.  **Deploy**.

> **Nota importante**: Al terminar el despliegue, entra en la terminal del contenedor del Backend en Coolify y ejecuta:
> `npm run prod:setup`
> Esto creará las tablas y cargará el catálogo de mantenimientos básicos.

---

## 4. Despliegue del Frontend

1.  En Coolify, añade otro recurso: **Application** -> **Public Repository**.
2.  Mismo repo de GitHub.
3.  **Build Pack**: `Dockerfile`.
4.  **Docker Context**: `app` (carpeta del frontend).
5.  **Dockerfile Location**: `Dockerfile`.
6.  **Variables de Entorno**:
    *   `NEXT_PUBLIC_BACKEND_URL`: La URL de tu backend (ej: `https://api.pilotos.app`). **Sin barra final**.
7.  **URLs**: Configura tu dominio principal (ej: `https://pilotos.app`).
8.  **Deploy**.

---

## 5. Primeros Pasos (Base de Datos Limpia)

Al desplegar, la base de datos estará vacía.

1.  Entra en la URL de tu frontend: `https://pilotos.app/onboarding`
2.  Rellena tus datos.
3.  El sistema creará tu usuario Patrón, vehículo y configuraciones automáticamente.
4.  ¡Listo!

---

## 6. Configuración de MinIO (Opcional por ahora)

Si quieres subir fotos, necesitarás un servicio S3 (como MinIO en Coolify o AWS S3).
Configura en el Backend:
*   `MINIO_ENDPOINT`
*   `MINIO_ACCESS_KEY`
*   `MINIO_SECRET_KEY`
*   `MINIO_BUCKET`
