-- Candado entre réplicas para las tareas programadas de PilotOS.
--
-- Hoy hay una sola réplica, así que esto no arregla nada visible: evita que
-- añadir la segunda duplique los avisos de mantenimiento a los patrones y ponga
-- dos purgas a borrar los mismos partes a la vez. El momento de descubrirlo no
-- puede ser el día en que se escale.
--
-- La clave primaria sobre `job` es lo que hace atómica la reclamación: dos
-- réplicas pidiendo el mismo trabajo chocan en el índice, y solo una gana.
CREATE TABLE IF NOT EXISTS pilotos."JobLease" (
    job        TEXT PRIMARY KEY,
    held_until TIMESTAMPTZ NOT NULL,
    holder     TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
