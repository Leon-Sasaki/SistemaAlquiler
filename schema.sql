-- Esquema MVP Sistema Alquiler (SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS equipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  modelo TEXT,                                  -- agrupa unidades del mismo producto (para kits)
  categoria_id INTEGER REFERENCES categorias(id),
  nombre TEXT NOT NULL,
  valor_reposicion REAL DEFAULT 0,
  precio_dia REAL DEFAULT 0,
  estado_operativo TEXT NOT NULL DEFAULT 'DISPONIBLE'
    CHECK (estado_operativo IN ('DISPONIBLE','ALQUILADO','MANTENIMIENTO','DANADO','BAJA')),
  tipo_mantenimiento TEXT DEFAULT 'CORRECTIVO'  -- PREVENTIVO | CORRECTIVO
    CHECK (tipo_mantenimiento IN ('PREVENTIVO','CORRECTIVO'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL DEFAULT 'INDEPENDIENTE',
  nombre TEXT NOT NULL,
  whatsapp TEXT DEFAULT '',
  dni_cuit TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS alquileres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  estado TEXT NOT NULL DEFAULT 'RESERVADO'
    CHECK (estado IN ('PRESUPUESTO','RESERVADO','ACTIVO','VENCIDO','DEVUELTO','CANCELADO')),
  fecha_retiro_prevista TEXT NOT NULL,
  fecha_devolucion_prevista TEXT NOT NULL,
  fecha_retiro_real TEXT,
  fecha_devolucion_real TEXT,
  total_presupuesto REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS detalle_alquiler (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alquiler_id INTEGER NOT NULL REFERENCES alquileres(id) ON DELETE CASCADE,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id),
  kit_id INTEGER REFERENCES kits(id),            -- NULL = equipo suelto
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_dia REAL NOT NULL,
  subtotal REAL NOT NULL
);

-- Kit promocional: agrupacion predefinida de productos (modelo + cantidad)
CREATE TABLE IF NOT EXISTS kits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  precio_dia REAL,        -- precio propio del kit (NULL = suma de los componentes)
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS kit_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kit_id INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  modelo TEXT NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1,
  UNIQUE (kit_id, modelo)
);

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alquiler_id INTEGER NOT NULL REFERENCES alquileres(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('SENA','SALDO','RECARGO_MORA')),
  medio TEXT DEFAULT 'TRANSFERENCIA',
  monto REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS garantias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alquiler_id INTEGER NOT NULL REFERENCES alquileres(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('PAGARE','DNI_RETENIDO','DEPOSITO','OTRO')),
  detalle TEXT DEFAULT '',
  monto_cubierto REAL DEFAULT 0,
  devuelta INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id),
  alquiler_id INTEGER REFERENCES alquileres(id),
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('RETIRO','DEVOLUCION','INGRESO_MANT','EGRESO_MANT')),
  estado_recibido TEXT DEFAULT '',
  observacion TEXT DEFAULT ''
);
