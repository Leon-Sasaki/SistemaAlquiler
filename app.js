// MVP Sistema Alquiler Audiovisual - Node + Express + SQLite (built-in)
// Para arrancar: npm install  ->  npm start  ->  abrir http://localhost:3000
//
// Variables de entorno:
//   PORT=3000          puerto HTTP
//   DB_PATH=...        ruta del archivo SQLite (usar ':memory:' en tests)
const express = require('express');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const {
  ErrorValidacion, hoyAR, fecha: validarFecha, texto, entero, decimal, opcion, arreglo, patronLike
} = require('./lib/validacion');
const { paginacion, paginado } = require('./lib/paginacion');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'alquiler.db');

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- DB ---
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// --- Migraciones idempotentes (DBs creadas antes de estos cambios) ---
function migrar() {
  const cols = [
    ['equipos', 'modelo', 'TEXT'],
    ['equipos', 'tipo_mantenimiento', "TEXT DEFAULT 'CORRECTIVO'"],
    ['alquileres', 'total_mora', 'REAL DEFAULT 0'],
    ['detalle_alquiler', 'kit_id', 'INTEGER REFERENCES kits(id)'],
    ['detalle_alquiler', 'cantidad', 'INTEGER DEFAULT 1']
  ];
  for (const [t, c, d] of cols) {
    try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); } catch (e) { /* ya existe */ }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_detalle_equipo ON detalle_alquiler(equipo_id);
    CREATE INDEX IF NOT EXISTS idx_detalle_alquiler ON detalle_alquiler(alquiler_id);
    CREATE INDEX IF NOT EXISTS idx_alquileres_cliente ON alquileres(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_alquileres_estado_fin ON alquileres(estado, fecha_devolucion_prevista);
    CREATE INDEX IF NOT EXISTS idx_pagos_alquiler ON pagos(alquiler_id);
    CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha);
    CREATE INDEX IF NOT EXISTS idx_movimientos_equipo ON movimientos(equipo_id);
    CREATE INDEX IF NOT EXISTS idx_equipos_modelo ON equipos(modelo);
    CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);
  `);
}
migrar();

// --- Catálogos cerrados (se usan también en las validaciones) ---
const ESTADOS_EQUIPO = ['DISPONIBLE', 'ALQUILADO', 'MANTENIMIENTO', 'DANADO', 'BAJA'];
const ESTADOS_ALQUILER = ['PRESUPUESTO', 'RESERVADO', 'ACTIVO', 'VENCIDO', 'DEVUELTO', 'CANCELADO'];
const TIPOS_PAGO = ['SENA', 'SALDO', 'RECARGO_MORA'];
const MEDIOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'MERCADO_PAGO', 'OTRO'];
const TIPOS_GARANTIA = ['PAGARE', 'DNI_RETENIDO', 'DEPOSITO', 'OTRO'];
const TIPOS_CLIENTE = ['PRODUCTORA', 'AGENCIA', 'SONIDISTA', 'INDEPENDIENTE'];
const TIPOS_MANTENIMIENTO = ['PREVENTIVO', 'CORRECTIVO'];

// Seed mínimo si está vacío (enunciado: cámaras, lentes, consolas, micrófonos, luces, generadores)
if (db.prepare('SELECT COUNT(*) c FROM equipos').get().c === 0) {
  db.prepare("INSERT INTO categorias (nombre) VALUES ('Camaras'),('Lentes'),('Sonido'),('Luces'),('Generadores'),('Soportes')").run();
  // codigo | modelo | cat | nombre | valor | precio/dia | estado
  db.prepare(`INSERT INTO equipos (codigo,modelo,categoria_id,nombre,valor_reposicion,precio_dia,estado_operativo) VALUES
    ('CAM-SONY-A7-01','CAM-SONY-A7',1,'Sony A7 III',2500,15000,'DISPONIBLE'),
    ('CAM-SONY-A7-02','CAM-SONY-A7',1,'Sony A7 III',2500,15000,'DISPONIBLE'),
    ('CAM-BMPCC-01','CAM-BMPCC',1,'Blackmagic Pocket 6K',3000,22000,'DISPONIBLE'),
    ('LEN-CANON-01','LEN-CANON-2470',2,'Lente Canon RF 24-70',1800,8000,'DISPONIBLE'),
    ('CON-YAM-01','CON-YAM',3,'Consola Yamaha TF1',4000,20000,'DISPONIBLE'),
    ('MIC-SEN-01','MIC-SEN',3,'Mic Sennheiser EW',800,5000,'DISPONIBLE'),
    ('MIC-SEN-02','MIC-SEN',3,'Mic Sennheiser EW',800,5000,'DISPONIBLE'),
    ('MIC-RODE-01','MIC-RODE',3,'Rode Wireless GO II',600,4500,'MANTENIMIENTO'),
    ('MIC-RODE-02','MIC-RODE',3,'Rode Wireless GO II',600,4500,'DISPONIBLE'),
    ('LUZ-APU-01','LUZ-APU',4,'Aputure 600D Pro',1500,12000,'DISPONIBLE'),
    ('TRP-MAN-01','TRP-MAN',6,'Tripode Manfrotto 546B',700,8000,'DISPONIBLE'),
    ('GEN-HON-01','GEN-HON',5,'Generador Honda 5kW',2500,18000,'DISPONIBLE')`).run();
  db.prepare(`INSERT INTO clientes (tipo,nombre,whatsapp) VALUES
    ('PRODUCTORA','Onda Films','1100000001'),
    ('AGENCIA','Estudio Nomada','1100000002'),
    ('SONIDISTA','Ferrer Producciones','1100000003'),
    ('INDEPENDIENTE','Colectivo Luz','1100000004'),
    ('PRODUCTORA','Pampa Cine','1100000005'),
    ('AGENCIA','Nube Estudio','1100000006'),
    ('SONIDISTA','Rios Sonido','1100000007'),
    ('INDEPENDIENTE','Mateo Vidal','1100000008'),
    ('PRODUCTORA','Sur Films','1100000009'),
    ('AGENCIA','Prisma Creativa','1100000010'),
    ('SONIDISTA','Cabrera Audio','1100000011'),
    ('INDEPENDIENTE','Lucia Paredes','1100000012')`).run();
  // Kits promocionales (precio propio con descuento; NULL = suma de componentes)
  db.prepare(`INSERT INTO kits (codigo,nombre,descripcion,precio_dia) VALUES
    ('KIT-ENTREV','Kit Entrevista','1 camara Sony A7 + 2 mics Sennheiser + 1 tripode',29000),
    ('KIT-ROD','Kit Rodaje','1 camara Blackmagic + 2 mics Rode + 1 luz Aputure',39000)`).run();
  db.prepare(`INSERT INTO kit_items (kit_id,modelo,cantidad) VALUES
    (1,'CAM-SONY-A7',1),(1,'MIC-SEN',2),(1,'TRP-MAN',1),
    (2,'CAM-BMPCC',1),(2,'MIC-RODE',2),(2,'LUZ-APU',1)`).run();
  console.log('Seed inicial cargado (equipos + kits)');
}

// --- Lógica de negocio ---
// R1: hay solape si nuevo.inicio <= existente.fin AND nuevo.fin >= existente.inicio (fechas YYYY-MM-DD)
function haySolape(aIni, aFin, bIni, bFin) {
  return aIni <= bFin && aFin >= bIni;
}

// Rango REALMENTE ocupado por un alquiler (R1 robusto):
// - si el alquiler sigue abierto, el equipo esta afuera hasta hoy como minimo;
// - si ya se devolvio, el equipo estuvo afuera hasta la fecha real de devolucion
//   (puede ser posterior a la prevista = devolucion tardia).
function rangoOcupacion(a) {
  const hoy = hoyAR();
  const ini = a.fecha_retiro_real || a.fecha_retiro_prevista;
  const enCurso = ['RESERVADO', 'ACTIVO', 'VENCIDO'].includes(a.estado);
  let fin = a.fecha_devolucion_prevista;
  if (a.fecha_devolucion_real && a.fecha_devolucion_real > fin) fin = a.fecha_devolucion_real;
  if (enCurso && fin < hoy) fin = hoy;
  return { ini, fin };
}

function equipoOcupadoEn(equipoId, inicio, fin, excluirAlquilerId = null) {
  let sql = `SELECT a.estado, a.fecha_retiro_prevista, a.fecha_devolucion_prevista,
      a.fecha_retiro_real, a.fecha_devolucion_real
    FROM detalle_alquiler d JOIN alquileres a ON a.id = d.alquiler_id
    WHERE d.equipo_id = ? AND a.estado IN ('RESERVADO','ACTIVO','VENCIDO','DEVUELTO')`;
  const params = [equipoId];
  if (excluirAlquilerId) { sql += ' AND a.id != ?'; params.push(excluirAlquilerId); }
  const rows = db.prepare(sql).all(...params);
  return rows.some(r => {
    const ef = rangoOcupacion(r);
    return haySolape(inicio, fin, ef.ini, ef.fin);
  });
}

function disponibilidad(equipoId, inicio, fin) {
  const eq = db.prepare('SELECT * FROM equipos WHERE id = ?').get(equipoId);
  if (!eq) return { libre: false, motivo: 'Equipo inexistente' };
  if (eq.estado_operativo !== 'DISPONIBLE')
    return { libre: false, motivo: 'En ' + eq.estado_operativo }; // R2
  if (equipoOcupadoEn(equipoId, inicio, fin))
    return { libre: false, motivo: 'Reservado en esas fechas (R1)' }; // R1
  return { libre: true, motivo: 'Libre' };
}

// ---------- KITS: disponibilidad en cadena ----------
// Un kit se reserva entero o no se reserva (todo o nada).
// La disponibilidad del kit es el AND de la disponibilidad de cada componente.
function unidadesDeModelo(modelo) {
  return db.prepare("SELECT * FROM equipos WHERE modelo = ? AND estado_operativo != 'BAJA' ORDER BY id").all(modelo);
}

function unidadesLibres(modelo, inicio, fin, excluirAlquilerId = null) {
  return unidadesDeModelo(modelo).filter(u =>
    u.estado_operativo === 'DISPONIBLE' && !equipoOcupadoEn(u.id, inicio, fin, excluirAlquilerId));
}

// Devuelve {libre, conflictos[]} con el RECURSO EN CONFLICTO (requisito del enunciado)
function disponibilidadKit(kitId, inicio, fin, excluirAlquilerId = null) {
  const kit = db.prepare('SELECT * FROM kits WHERE id = ?').get(kitId);
  if (!kit) return { libre: false, kit: null, conflictos: [{ motivo: 'Kit inexistente' }] };
  const items = db.prepare('SELECT modelo, cantidad FROM kit_items WHERE kit_id = ?').all(kitId);
  const conflictos = [];
  for (const it of items) {
    const libres = unidadesLibres(it.modelo, inicio, fin, excluirAlquilerId);
    if (libres.length < it.cantidad) {
      // identificar el recurso en conflicto: primero el bloqueado por estado, luego el reservado
      const todas = unidadesDeModelo(it.modelo);
      const bloqueado = todas.find(u => u.estado_operativo !== 'DISPONIBLE');
      const reservado = todas.find(u => u.estado_operativo === 'DISPONIBLE' && equipoOcupadoEn(u.id, inicio, fin, excluirAlquilerId));
      const culpable = bloqueado || reservado;
      const fila = db.prepare(`SELECT a.estado, a.fecha_retiro_prevista, a.fecha_devolucion_prevista,
          a.fecha_retiro_real, a.fecha_devolucion_real, c.nombre cliente
        FROM detalle_alquiler d JOIN alquileres a ON a.id=d.alquiler_id JOIN clientes c ON c.id=a.cliente_id
        WHERE d.equipo_id = ? AND a.estado IN ('RESERVADO','ACTIVO','VENCIDO','DEVUELTO')`).all(culpable?.id)[0];
      const ef = fila ? rangoOcupacion(fila) : null;
      conflictos.push({
        modelo: it.modelo,
        requeridos: it.cantidad,
        disponibles: libres.length,
        equipo: culpable ? culpable.nombre : it.modelo,
        codigo: culpable ? culpable.codigo : it.modelo,
        motivo: bloqueado
          ? 'En ' + bloqueado.estado_operativo + (bloqueado.tipo_mantenimiento ? ' ' + bloqueado.tipo_mantenimiento.toLowerCase() : '')
          : 'Reservado en esas fechas',
        rango: ef ? `${ef.ini} → ${ef.fin}` : null,
        cliente: fila ? fila.cliente : null
      });
    }
  }
  return { libre: conflictos.length === 0, kit, conflictos };
}

// Asigna unidades fisicas concretas para un kit (politica: la mas antigua disponible)
function asignarUnidadesKit(kitId, inicio, fin, excluirAlquilerId = null) {
  const items = db.prepare('SELECT modelo, cantidad FROM kit_items WHERE kit_id = ?').all(kitId);
  const asignadas = [];
  for (const it of items) {
    const libres = unidadesLibres(it.modelo, inicio, fin, excluirAlquilerId);
    for (const u of libres.slice(0, it.cantidad)) asignadas.push({ equipo_id: u.id, modelo: it.modelo });
  }
  return asignadas;
}

function componentesRequeridosKit(kitId) {
  return db.prepare('SELECT IFNULL(SUM(cantidad),0) c FROM kit_items WHERE kit_id = ?').get(kitId).c;
}

function diasEntre(ini, fin) {
  const ms = new Date(fin) - new Date(ini) + 86400000; // inclusivo aprox
  return Math.max(1, Math.round(ms / 86400000));
}

// --- Helpers de listado ---
const LIKE = "LIKE ? ESCAPE '\\'";

function totalDe(sql, params) {
  return db.prepare(sql).get(...params).c;
}

// --- API ---
// Catálogo liviano para selectores, lupa y cálculos del frontend (sin paginar).
app.get('/api/equipos/todos', (req, res) => {
  const q = texto(req.query.q, 'q', { requerido: false, defecto: '', max: 80 });
  const inicio = validarFecha(req.query.inicio, 'inicio', { requerido: false });
  const fin = validarFecha(req.query.fin, 'fin', { requerido: false });
  if ((inicio && !fin) || (!inicio && fin))
    throw new ErrorValidacion('inicio y fin deben enviarse juntos');
  if (inicio && fin && fin < inicio)
    throw new ErrorValidacion('fin no puede ser anterior a inicio');

  const donde = [];
  const params = [];
  if (q) {
    const p = patronLike(q);
    donde.push(`(e.nombre ${LIKE} OR e.codigo ${LIKE} OR IFNULL(e.modelo,'') ${LIKE} OR IFNULL(c.nombre,'') ${LIKE})`);
    params.push(p, p, p, p);
  }
  const where = donde.length ? ' WHERE ' + donde.join(' AND ') : '';
  const rows = db.prepare(`SELECT e.id, e.codigo, e.nombre, e.modelo, e.precio_dia, e.estado_operativo,
      c.nombre categoria
    FROM equipos e LEFT JOIN categorias c ON c.id = e.categoria_id ${where}
    ORDER BY e.nombre LIMIT 1000`).all(...params);

  // Con fechas, el catálogo trae la disponibilidad real (R1 + R2) para el formulario de reserva.
  if (!inicio) return res.json(rows.map(e => ({
    ...e, libre: e.estado_operativo === 'DISPONIBLE', motivo: e.estado_operativo === 'DISPONIBLE' ? 'Libre' : 'En ' + e.estado_operativo
  })));
  res.json(rows.map(e => {
    if (e.estado_operativo !== 'DISPONIBLE') return { ...e, libre: false, motivo: 'En ' + e.estado_operativo };
    if (equipoOcupadoEn(e.id, inicio, fin)) return { ...e, libre: false, motivo: 'Ocupado en esas fechas' };
    return { ...e, libre: true, motivo: 'Libre' };
  }));
});

app.get('/api/equipos', (req, res) => {
  const { page, limit, offset } = paginacion(req);
  const q = texto(req.query.q, 'q', { requerido: false, defecto: '', max: 80 });
  const categoria = texto(req.query.categoria, 'categoria', { requerido: false, defecto: '', max: 80 });
  const estado = opcion(req.query.estado, 'estado', ESTADOS_EQUIPO, { requerido: false, defecto: '' });

  const donde = [];
  const params = [];
  if (q) {
    const p = patronLike(q);
    donde.push(`(e.nombre ${LIKE} OR e.codigo ${LIKE} OR IFNULL(e.modelo,'') ${LIKE} OR IFNULL(c.nombre,'') ${LIKE})`);
    params.push(p, p, p, p);
  }
  if (categoria) { donde.push('c.nombre = ?'); params.push(categoria); }
  if (estado) { donde.push('e.estado_operativo = ?'); params.push(estado); }
  const where = donde.length ? ' WHERE ' + donde.join(' AND ') : '';

  const total = totalDe(`SELECT COUNT(*) c FROM equipos e LEFT JOIN categorias c ON c.id = e.categoria_id ${where}`, params);
  const items = db.prepare(`SELECT e.*, c.nombre categoria
    FROM equipos e LEFT JOIN categorias c ON c.id = e.categoria_id ${where}
    ORDER BY e.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json(paginado(items, total, { page, limit }));
});

// Listas para el panel RentaVisión
app.get('/api/clientes/todos', (req, res) => {
  res.json(db.prepare('SELECT id, nombre, tipo, whatsapp FROM clientes ORDER BY nombre LIMIT 1000').all());
});

app.get('/api/clientes', (req, res) => {
  const { page, limit, offset } = paginacion(req);
  const q = texto(req.query.q, 'q', { requerido: false, defecto: '', max: 80 });
  const donde = [];
  const params = [];
  if (q) {
    const p = patronLike(q);
    donde.push(`(nombre ${LIKE} OR IFNULL(whatsapp,'') ${LIKE} OR tipo ${LIKE})`);
    params.push(p, p, p);
  }
  const where = donde.length ? ' WHERE ' + donde.join(' AND ') : '';
  const total = totalDe(`SELECT COUNT(*) c FROM clientes ${where}`, params);
  const items = db.prepare(`SELECT * FROM clientes ${where} ORDER BY nombre LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json(paginado(items, total, { page, limit }));
});

app.get('/api/alquileres', (req, res) => {
  const { page, limit, offset } = paginacion(req);
  const q = texto(req.query.q, 'q', { requerido: false, defecto: '', max: 80 });
  const estado = opcion(req.query.estado, 'estado', ESTADOS_ALQUILER, { requerido: false, defecto: '' });

  const donde = [];
  const params = [];
  if (estado) { donde.push('a.estado = ?'); params.push(estado); }
  if (q) {
    const p = patronLike(q);
    const soloId = /^ALQ-?(\d+)$/i.exec(q);
    const filtros = ['c.nombre ' + LIKE, 'a.estado ' + LIKE];
    const valores = [p, p];
    if (soloId) { filtros.push('a.id = ?'); valores.push(Number(soloId[1])); }
    filtros.push(`EXISTS (SELECT 1 FROM detalle_alquiler d JOIN equipos e ON e.id = d.equipo_id
      WHERE d.alquiler_id = a.id AND (e.nombre ${LIKE} OR e.codigo ${LIKE}))`);
    valores.push(p, p);
    filtros.push(`EXISTS (SELECT 1 FROM detalle_alquiler d2 JOIN kits k2 ON k2.id = d2.kit_id
      WHERE d2.alquiler_id = a.id AND k2.nombre ${LIKE})`);
    valores.push(p);
    donde.push('(' + filtros.join(' OR ') + ')');
    params.push(...valores);
  }
  const where = donde.length ? ' WHERE ' + donde.join(' AND ') : '';

  const total = totalDe(`SELECT COUNT(*) c FROM alquileres a JOIN clientes c ON c.id = a.cliente_id ${where}`, params);
  const rows = db.prepare(`SELECT a.*, c.nombre cliente FROM alquileres a
    JOIN clientes c ON c.id = a.cliente_id ${where}
    ORDER BY a.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

  const items = rows.map(a => ({
    ...a,
    equipos: db.prepare(`SELECT e.id, e.codigo, e.nombre, d.kit_id, k.nombre kit, d.cantidad
      FROM detalle_alquiler d JOIN equipos e ON e.id=d.equipo_id
      LEFT JOIN kits k ON k.id=d.kit_id WHERE d.alquiler_id=?`).all(a.id),
    pagado: db.prepare('SELECT IFNULL(SUM(monto),0) s FROM pagos WHERE alquiler_id=?').get(a.id).s
  }));
  res.json(paginado(items, total, { page, limit }));
});

app.post('/api/equipos/estado', (req, res) => { // HU08
  const equipo_id = entero(req.body.equipo_id, 'equipo_id');
  const estado = opcion(req.body.estado, 'estado', ESTADOS_EQUIPO);
  const observacion = texto(req.body.observacion, 'observacion', { requerido: false, defecto: '', max: 300 });
  const tipo_mantenimiento = opcion(req.body.tipo_mantenimiento, 'tipo_mantenimiento', TIPOS_MANTENIMIENTO, {
    requerido: false, defecto: 'CORRECTIVO'
  });

  const equipo = db.prepare('SELECT * FROM equipos WHERE id = ?').get(equipo_id);
  if (!equipo) return res.status(404).json({ error: 'Equipo inexistente' });

  const alquilerActivo = db.prepare(`SELECT 1 FROM detalle_alquiler d JOIN alquileres a ON a.id = d.alquiler_id
    WHERE d.equipo_id = ? AND a.estado IN ('ACTIVO','VENCIDO') LIMIT 1`).get(equipo_id);

  if (estado === 'ALQUILADO' && !alquilerActivo)
    throw new ErrorValidacion('Un equipo solo pasa a ALQUILADO desde el retiro de un alquiler');
  if (estado !== 'ALQUILADO' && estado !== 'DISPONIBLE' && alquilerActivo)
    return res.status(409).json({ error: 'El equipo tiene un alquiler activo: registrá la devolución antes de cambiar su estado' });
  if (estado === 'DISPONIBLE' && alquilerActivo)
    return res.status(409).json({ error: 'El equipo todavía no fue devuelto: no puede marcarse DISPONIBLE' });

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE equipos SET estado_operativo=?, tipo_mantenimiento=? WHERE id=?')
      .run(estado, estado === 'MANTENIMIENTO' ? tipo_mantenimiento : null, equipo_id);
    db.prepare(`INSERT INTO movimientos (equipo_id,fecha,tipo,observacion) VALUES (?,?,?,?)`)
      .run(equipo_id, hoyAR(), estado === 'DISPONIBLE' ? 'EGRESO_MANT' : 'INGRESO_MANT', observacion);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

app.get('/api/disponibilidad', (req, res) => { // HU01
  const equipo_id = entero(req.query.equipo_id, 'equipo_id');
  const inicio = validarFecha(req.query.inicio, 'inicio');
  const fin = validarFecha(req.query.fin, 'fin');
  if (fin < inicio) throw new ErrorValidacion('fin no puede ser anterior a inicio');
  res.json(disponibilidad(equipo_id, inicio, fin));
});

// ---------- API KITS ----------
function kitConDesglose(k, inicio, fin) {
  const items = db.prepare('SELECT modelo, cantidad FROM kit_items WHERE kit_id=?').all(k.id);
  const desglose = items.map(it => {
    const unidades = unidadesDeModelo(it.modelo);
    const libres = (inicio && fin)
      ? unidadesLibres(it.modelo, inicio, fin)
      : unidades.filter(u => u.estado_operativo === 'DISPONIBLE');
    const primera = unidades[0];
    return {
      modelo: it.modelo, cantidad: it.cantidad,
      equipo: primera ? primera.nombre : it.modelo,
      unidades_totales: unidades.length,
      unidades_libres: libres.length,
      suficiente: libres.length >= it.cantidad
    };
  });
  const completo = desglose.every(d => d.suficiente);
  const precioKit = k.precio_dia != null ? k.precio_dia : desglose.reduce((s, d) => {
    const u = unidadesDeModelo(d.modelo)[0];
    return s + (u ? u.precio_dia * d.cantidad : 0);
  }, 0);
  return {
    ...k, desglose, completo, precio_calculado: precioKit,
    estado: (inicio && fin) ? (completo ? 'DISPONIBLE' : 'BLOQUEADO') : null
  };
}

app.get('/api/kits', (req, res) => { // catálogo de kits con desglose, paginado
  const { page, limit, offset } = paginacion(req, { limitePorDefecto: 6 });
  const inicio = validarFecha(req.query.inicio, 'inicio', { requerido: false });
  const fin = validarFecha(req.query.fin, 'fin', { requerido: false });
  if ((inicio && !fin) || (!inicio && fin)) throw new ErrorValidacion('inicio y fin deben enviarse juntos');
  if (inicio && fin && fin < inicio) throw new ErrorValidacion('fin no puede ser anterior a inicio');
  const q = texto(req.query.q, 'q', { requerido: false, defecto: '', max: 80 });

  const donde = ['k.activo = 1'];
  const params = [];
  if (q) {
    const p = patronLike(q);
    donde.push(`(k.nombre ${LIKE} OR k.codigo ${LIKE} OR IFNULL(k.descripcion,'') ${LIKE})`);
    params.push(p, p, p);
  }
  const where = ' WHERE ' + donde.join(' AND ');
  const total = totalDe(`SELECT COUNT(*) c FROM kits k ${where}`, params);
  const rows = db.prepare(`SELECT k.* FROM kits k ${where} ORDER BY k.id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  res.json(paginado(rows.map(k => kitConDesglose(k, inicio, fin)), total, { page, limit }));
});

app.get('/api/kits/todos', (req, res) => {
  const inicio = validarFecha(req.query.inicio, 'inicio', { requerido: false });
  const fin = validarFecha(req.query.fin, 'fin', { requerido: false });
  if ((inicio && !fin) || (!inicio && fin))
    throw new ErrorValidacion('inicio y fin deben enviarse juntos');
  if (inicio && fin && fin < inicio)
    throw new ErrorValidacion('fin no puede ser anterior a inicio');
  const rows = db.prepare('SELECT * FROM kits WHERE activo = 1 ORDER BY nombre LIMIT 500').all();
  res.json(rows.map(k => kitConDesglose(k, inicio, fin)));
});

app.get('/api/kits/:id/disponibilidad', (req, res) => { // bloqueo en cadena
  const id = entero(req.params.id, 'id');
  const inicio = validarFecha(req.query.inicio, 'inicio');
  const fin = validarFecha(req.query.fin, 'fin');
  if (fin < inicio) throw new ErrorValidacion('fin no puede ser anterior a inicio');
  const d = disponibilidadKit(id, inicio, fin);
  if (!d.kit) return res.status(404).json({ error: 'Kit inexistente' });
  res.json({ libre: d.libre, kit: { id: d.kit.id, nombre: d.kit.nombre }, conflictos: d.conflictos });
});

app.post('/api/kits', (req, res) => { // alta de kit
  const codigo = texto(req.body.codigo, 'codigo', { min: 2, max: 40 });
  const nombre = texto(req.body.nombre, 'nombre', { min: 2, max: 120 });
  const descripcion = texto(req.body.descripcion, 'descripcion', { requerido: false, defecto: '', max: 300 });
  const precio_dia = decimal(req.body.precio_dia, 'precio_dia', { requerido: false, defecto: null, min: 0 });
  if (!/^[A-Za-z0-9._-]+$/.test(codigo))
    throw new ErrorValidacion('codigo solo admite letras, números, punto, guión y guión bajo');

  const componentes = arreglo(req.body.componentes, 'componentes', { max: 50 });
  if (!componentes.length) throw new ErrorValidacion('El kit debe tener al menos un componente');

  const vistos = new Set();
  const limpios = componentes.map((c, i) => {
    const modelo = texto(c && c.modelo, `componentes[${i}].modelo`, { max: 60 });
    const cantidad = entero(c && c.cantidad, `componentes[${i}].cantidad`, { min: 1, max: 99 });
    if (vistos.has(modelo)) throw new ErrorValidacion(`El modelo ${modelo} está repetido en los componentes`);
    vistos.add(modelo);
    if (!db.prepare('SELECT 1 FROM equipos WHERE modelo = ? LIMIT 1').get(modelo))
      throw new ErrorValidacion(`No hay equipos cargados con el modelo ${modelo}`);
    return { modelo, cantidad };
  });

  if (db.prepare('SELECT 1 FROM kits WHERE codigo = ?').get(codigo))
    return res.status(409).json({ error: 'Ya existe un kit con ese código' });

  db.exec('BEGIN');
  try {
    const r = db.prepare('INSERT INTO kits (codigo,nombre,descripcion,precio_dia) VALUES (?,?,?,?)')
      .run(codigo, nombre, descripcion, precio_dia);
    const kitId = r.lastInsertRowid;
    for (const c of limpios)
      db.prepare('INSERT INTO kit_items (kit_id,modelo,cantidad) VALUES (?,?,?)').run(kitId, c.modelo, c.cantidad);
    db.exec('COMMIT');
    res.json({ ok: true, id: kitId });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

app.post('/api/alquileres', (req, res) => { // HU02 (admite equipos sueltos y/o kits)
  const cliente_id = entero(req.body.cliente_id, 'cliente_id');
  const inicio = validarFecha(req.body.inicio, 'inicio');
  const fin = validarFecha(req.body.fin, 'fin');
  if (fin < inicio) throw new ErrorValidacion('fin no puede ser anterior a inicio');
  if (!db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(cliente_id))
    throw new ErrorValidacion('cliente_id inexistente');

  const sueltos = arreglo(req.body.equipo_ids, 'equipo_ids', { max: 100 })
    .map((id, i) => entero(id, `equipo_ids[${i}]`, { min: 1 }));
  const pedidoKits = arreglo(req.body.kits, 'kits', { max: 50 })
    .map((k, i) => ({
      kit_id: entero(k && k.kit_id, `kits[${i}].kit_id`, { min: 1 }),
      cantidad: entero(k && k.cantidad !== undefined ? k.cantidad : 1, `kits[${i}].cantidad`, { min: 1, max: 20 })
    }));

  if (!sueltos.length && !pedidoKits.length)
    throw new ErrorValidacion('Se requiere al menos un equipo o un kit');
  if (new Set(sueltos).size !== sueltos.length)
    throw new ErrorValidacion('equipo_ids tiene equipos repetidos');

  let garantia = null;
  if (req.body.garantia !== undefined && req.body.garantia !== null) {
    const g = req.body.garantia;
    garantia = {
      tipo: opcion(g.tipo, 'garantia.tipo', TIPOS_GARANTIA, { requerido: false, defecto: 'OTRO' }),
      detalle: texto(g.detalle, 'garantia.detalle', { requerido: false, defecto: '', max: 200 }),
      monto: decimal(g.monto, 'garantia.monto', { requerido: false, defecto: 0, min: 0 })
    };
  }

  // 1) Validar KITS: todo o nada. Si un componente choca, cae el kit entero.
  const conflictos = [];
  const lineas = []; // {equipo_id, kit_id}
  const usados = new Set();

  for (const pedido of pedidoKits) {
    const kit = db.prepare('SELECT * FROM kits WHERE id = ? AND activo = 1').get(pedido.kit_id);
    if (!kit) throw new ErrorValidacion(`kit_id ${pedido.kit_id} inexistente o dado de baja`);
    const requeridos = componentesRequeridosKit(pedido.kit_id);
    if (!requeridos) throw new ErrorValidacion(`El kit ${pedido.kit_id} no tiene componentes`);

    for (let n = 0; n < pedido.cantidad; n++) {
      const d = disponibilidadKit(pedido.kit_id, inicio, fin);
      if (!d.libre) {
        conflictos.push(...d.conflictos.map(c => ({ ...c, kit: d.kit ? d.kit.nombre : 'Kit' })));
        continue;
      }
      // Descontar las unidades ya asignadas a este mismo pedido (evita prometer
      // dos veces la misma unidad cuando se piden varios kits iguales).
      const asignadas = asignarUnidadesKit(pedido.kit_id, inicio, fin).filter(u => !usados.has(u.equipo_id));
      if (asignadas.length < requeridos) {
        conflictos.push({
          kit: d.kit.nombre,
          modelo: null,
          requeridos,
          disponibles: asignadas.length,
          motivo: 'Stock insuficiente para la cantidad de kits pedida en esta misma reserva'
        });
        continue;
      }
      for (const u of asignadas) {
        usados.add(u.equipo_id);
        lineas.push({ equipo_id: u.equipo_id, kit_id: pedido.kit_id });
      }
    }
  }
  if (conflictos.length)
    return res.status(409).json({ error: 'Kit no disponible: un componente está en conflicto', conflictos });

  // 2) Validar equipos sueltos
  for (const eid of sueltos) {
    if (!db.prepare('SELECT 1 FROM equipos WHERE id = ?').get(eid))
      throw new ErrorValidacion(`equipo_id ${eid} inexistente`);
    if (usados.has(eid))
      return res.status(409).json({ error: `El equipo ${eid} ya está incluido en un kit de este pedido` });
    const d = disponibilidad(eid, inicio, fin);
    if (!d.libre)
      return res.status(409).json({
        error: `Equipo ${eid} no disponible: ${d.motivo}`,
        conflictos: [{ equipo_id: eid, motivo: d.motivo }]
      });
    usados.add(eid);
    lineas.push({ equipo_id: eid, kit_id: null });
  }

  if (!lineas.length) throw new ErrorValidacion('No quedan equipos válidos para reservar');

  // 3) Calculo de precios (transaccional: todo o nada)
  const dias = diasEntre(inicio, fin);
  db.exec('BEGIN');
  try {
    // precio propio del kit (si tiene) prorrateado entre sus lineas
    const porKit = new Map();
    for (const l of lineas) if (l.kit_id) porKit.set(l.kit_id, (porKit.get(l.kit_id) || 0) + 1);
    const precioKit = new Map();
    for (const [kitId, nLineas] of porKit) {
      const kit = db.prepare('SELECT * FROM kits WHERE id=?').get(kitId);
      const qty = pedidoKits.filter(k => k.kit_id === kitId).reduce((s, k) => s + k.cantidad, 0);
      const totalKit = kit.precio_dia != null ? kit.precio_dia * qty : null;
      precioKit.set(kitId, totalKit != null ? totalKit / nLineas : null);
    }
    let total = 0;
    const items = lineas.map(l => {
      const eq = db.prepare('SELECT * FROM equipos WHERE id=?').get(l.equipo_id);
      const pr = l.kit_id && precioKit.get(l.kit_id) != null ? precioKit.get(l.kit_id) : eq.precio_dia;
      const sub = Math.round(pr * dias * 100) / 100;
      total += sub;
      return { ...l, precio: pr, sub };
    });
    const r = db.prepare(`INSERT INTO alquileres (cliente_id,estado,fecha_retiro_prevista,fecha_devolucion_prevista,total_presupuesto)
      VALUES (?,?,?,?,?)`).run(cliente_id, 'RESERVADO', inicio, fin, Math.round(total * 100) / 100);
    const alqId = r.lastInsertRowid;
    for (const it of items)
      db.prepare(`INSERT INTO detalle_alquiler (alquiler_id,equipo_id,kit_id,cantidad,precio_dia,subtotal)
        VALUES (?,?,?,?,?,?)`).run(alqId, it.equipo_id, it.kit_id, 1, it.precio, it.sub);
    if (garantia)
      db.prepare('INSERT INTO garantias (alquiler_id,tipo,detalle,monto_cubierto) VALUES (?,?,?,?)')
        .run(alqId, garantia.tipo, garantia.detalle, garantia.monto);
    db.exec('COMMIT');
    res.json({
      ok: true, alquiler_id: alqId, total: Math.round(total * 100) / 100, dias, equipos: items.length,
      detalle: items.map(i => ({ equipo_id: i.equipo_id, kit_id: i.kit_id }))
    });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

app.post('/api/alquileres/:id/retiro', (req, res) => { // HU03 + R3
  const id = entero(req.params.id, 'id');
  const alq = db.prepare('SELECT * FROM alquileres WHERE id=?').get(id);
  if (!alq) return res.status(404).json({ error: 'Alquiler inexistente' });
  if (alq.estado !== 'RESERVADO') return res.status(409).json({ error: 'Debe estar RESERVADO' });
  const g = db.prepare('SELECT * FROM garantias WHERE alquiler_id=?').get(id);
  if (!g) return res.status(409).json({ error: 'R3: exige garantía registrada antes del retiro' });

  const hoy = hoyAR();
  db.exec('BEGIN');
  try {
    db.prepare("UPDATE alquileres SET estado='ACTIVO', fecha_retiro_real=? WHERE id=?").run(hoy, id);
    for (const d of db.prepare('SELECT * FROM detalle_alquiler WHERE alquiler_id=?').all(id)) {
      db.prepare("UPDATE equipos SET estado_operativo='ALQUILADO' WHERE id=?").run(d.equipo_id);
      db.prepare('INSERT INTO movimientos (equipo_id,alquiler_id,fecha,tipo) VALUES (?,?,?,?)')
        .run(d.equipo_id, id, hoy, 'RETIRO');
    }
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

app.post('/api/alquileres/:id/devolucion', (req, res) => { // HU04 + R4/R5
  const id = entero(req.params.id, 'id');
  const alq = db.prepare('SELECT * FROM alquileres WHERE id=?').get(id);
  if (!alq) return res.status(404).json({ error: 'Alquiler inexistente' });
  if (!['ACTIVO', 'VENCIDO'].includes(alq.estado)) return res.status(409).json({ error: 'Debe estar ACTIVO/VENCIDO' });

  const hoy = validarFecha(req.body.fecha === undefined || req.body.fecha === '' ? hoyAR() : req.body.fecha, 'fecha');
  if (hoy > hoyAR()) throw new ErrorValidacion('La fecha de devolución no puede ser futura');
  if (alq.fecha_retiro_real && hoy < alq.fecha_retiro_real)
    throw new ErrorValidacion('La fecha de devolución no puede ser anterior al retiro');

  const detalle = db.prepare('SELECT * FROM detalle_alquiler WHERE alquiler_id=?').all(id);
  const recibidos = req.body.estado_equipos === undefined || req.body.estado_equipos === null
    ? {} : req.body.estado_equipos;
  if (typeof recibidos !== 'object' || Array.isArray(recibidos))
    throw new ErrorValidacion('estado_equipos debe ser un objeto {equipo_id: estado}');
  const idsValidos = new Set(detalle.map(d => d.equipo_id));
  for (const [k, v] of Object.entries(recibidos)) {
    const eid = entero(k, `estado_equipos.${k}`);
    if (!idsValidos.has(eid))
      throw new ErrorValidacion(`El equipo ${eid} no pertenece al alquiler ${id}`);
    opcion(v, `estado_equipos.${k}`, ['DISPONIBLE', 'DANADO']);
  }

  let mora = 0;
  if (hoy > alq.fecha_devolucion_prevista) { // R5
    const diasMora = diasEntre(alq.fecha_devolucion_prevista, hoy) - 1;
    for (const d of detalle) mora += d.precio_dia * diasMora * 1.5; // factor recargo 1.5
  }

  db.exec('BEGIN');
  try {
    for (const d of detalle) {
      const est = recibidos[d.equipo_id] || 'DISPONIBLE';
      const final = est === 'DANADO' ? 'MANTENIMIENTO' : 'DISPONIBLE'; // R4 (por unidad fisica)
      db.prepare('UPDATE equipos SET estado_operativo=?, tipo_mantenimiento=? WHERE id=?')
        .run(final, est === 'DANADO' ? 'CORRECTIVO' : null, d.equipo_id);
      db.prepare('INSERT INTO movimientos (equipo_id,alquiler_id,fecha,tipo,estado_recibido) VALUES (?,?,?,?,?)')
        .run(d.equipo_id, id, hoy, 'DEVOLUCION', est);
    }
    db.prepare("UPDATE alquileres SET estado='DEVUELTO', fecha_devolucion_real=?, total_mora=? WHERE id=?")
      .run(hoy, Math.round(mora), id);
    db.exec('COMMIT');
    res.json({ ok: true, mora_calculada: Math.round(mora) });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

// Prórroga telefónica formalizada (R6): solo si no colisiona con otra reserva
app.post('/api/alquileres/:id/prorroga', (req, res) => {
  const id = entero(req.params.id, 'id');
  const alq = db.prepare('SELECT * FROM alquileres WHERE id=?').get(id);
  if (!alq) return res.status(404).json({ error: 'Alquiler inexistente' });
  if (!['RESERVADO', 'ACTIVO', 'VENCIDO'].includes(alq.estado))
    return res.status(409).json({ error: 'Solo RESERVADO/ACTIVO/VENCIDO' });

  const nueva_fin = validarFecha(req.body.nueva_fin, 'nueva_fin');
  if (nueva_fin <= alq.fecha_devolucion_prevista)
    throw new ErrorValidacion('nueva_fin debe ser mayor a la actual');

  for (const d of db.prepare('SELECT * FROM detalle_alquiler WHERE alquiler_id=?').all(id)) {
    if (equipoOcupadoEn(d.equipo_id, alq.fecha_retiro_prevista, nueva_fin, id))
      return res.status(409).json({ error: `Equipo ${d.equipo_id} colisiona en la extensión (R6)` });
  }

  const dias = diasEntre(alq.fecha_retiro_prevista, nueva_fin);
  db.exec('BEGIN');
  try {
    let total = 0;
    for (const d of db.prepare('SELECT * FROM detalle_alquiler WHERE alquiler_id=?').all(id)) {
      const sub = Math.round(d.precio_dia * dias * 100) / 100;
      total += sub;
      db.prepare('UPDATE detalle_alquiler SET subtotal=? WHERE id=?').run(sub, d.id);
    }
    db.prepare('UPDATE alquileres SET fecha_devolucion_prevista=?, total_presupuesto=?, estado=? WHERE id=?')
      .run(nueva_fin, Math.round(total * 100) / 100, alq.estado === 'VENCIDO' ? 'ACTIVO' : alq.estado, id);
    db.exec('COMMIT');
    res.json({ ok: true, total: Math.round(total * 100) / 100, dias });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

app.get('/api/vencimientos', (req, res) => { // HU05
  const hoy = validarFecha(req.query.fecha, 'fecha', { requerido: false }) || hoyAR();
  const { page, limit, offset } = paginacion(req);

  // El estado VENCIDO se actualiza siempre, no solo para la página consultada.
  db.prepare("UPDATE alquileres SET estado='VENCIDO' WHERE estado='ACTIVO' AND fecha_devolucion_prevista < ?").run(hoy);

  const total = totalDe(`SELECT COUNT(*) c FROM alquileres a JOIN clientes c ON c.id = a.cliente_id
    WHERE a.estado IN ('ACTIVO','RESERVADO','VENCIDO') AND a.fecha_devolucion_prevista <= ?`, [hoy]);
  const rows = db.prepare(`SELECT a.*, c.nombre cliente, c.whatsapp FROM alquileres a
    JOIN clientes c ON c.id=a.cliente_id
    WHERE a.estado IN ('ACTIVO','RESERVADO','VENCIDO') AND a.fecha_devolucion_prevista <= ?
    ORDER BY a.fecha_devolucion_prevista LIMIT ? OFFSET ?`).all(hoy, limit, offset);
  res.json(paginado(rows, total, { page, limit }));
});

app.get('/api/deudores', (req, res) => { // HU07 (incluye mora persistida)
  const { page, limit, offset } = paginacion(req);
  const q = texto(req.query.q, 'q', { requerido: false, defecto: '', max: 80 });
  const saldoExpr = `(a.total_presupuesto + IFNULL(a.total_mora,0) -
    IFNULL((SELECT SUM(monto) FROM pagos p WHERE p.alquiler_id=a.id),0))`;
  const donde = ["a.estado != 'CANCELADO'", `${saldoExpr} > 0`];
  const params = [];
  if (q) {
    const p = patronLike(q);
    donde.push(`(c.nombre ${LIKE} OR CAST(a.id AS TEXT) ${LIKE})`);
    params.push(p, p);
  }
  const where = ' WHERE ' + donde.join(' AND ');
  const total = totalDe(`SELECT COUNT(*) c FROM alquileres a JOIN clientes c ON c.id = a.cliente_id ${where}`, params);
  const rows = db.prepare(`SELECT a.id, c.nombre cliente, a.total_presupuesto, IFNULL(a.total_mora,0) total_mora,
      IFNULL((SELECT SUM(monto) FROM pagos p WHERE p.alquiler_id=a.id),0) pagado,
      a.estado, a.fecha_devolucion_prevista
    FROM alquileres a JOIN clientes c ON c.id = a.cliente_id ${where}
    ORDER BY a.fecha_devolucion_prevista, a.id LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const items = rows.map(r => ({ ...r, saldo: Math.round(r.total_presupuesto + r.total_mora - r.pagado) }));
  res.json(paginado(items, total, { page, limit }));
});

// Alta de cliente y equipo (Acciones rápidas del panel)
app.post('/api/clientes', (req, res) => {
  const nombre = texto(req.body.nombre, 'nombre', { min: 2, max: 120 });
  const tipo = opcion(req.body.tipo, 'tipo', TIPOS_CLIENTE, { requerido: false, defecto: 'INDEPENDIENTE' });
  const whatsapp = texto(req.body.whatsapp, 'whatsapp', { requerido: false, defecto: '', max: 30 });
  if (whatsapp && !/^[0-9+\-\s()]{6,30}$/.test(whatsapp))
    throw new ErrorValidacion('whatsapp solo admite números, espacios, +, - y paréntesis');
  const r = db.prepare('INSERT INTO clientes (tipo,nombre,whatsapp) VALUES (?,?,?)').run(tipo, nombre, whatsapp);
  res.json({ ok: true, id: r.lastInsertRowid });
});

// Baja logica de kit (deja de ofrecerse, no borra el historico)
app.delete('/api/kits/:id', (req, res) => {
  const id = entero(req.params.id, 'id');
  const r = db.prepare('UPDATE kits SET activo = 0 WHERE id = ? AND activo = 1').run(id);
  if (!r.changes) return res.status(404).json({ error: 'Kit inexistente' });
  res.json({ ok: true });
});

app.post('/api/equipos', (req, res) => {
  const codigo = texto(req.body.codigo, 'codigo', { min: 2, max: 40 });
  const nombre = texto(req.body.nombre, 'nombre', { min: 2, max: 120 });
  const modelo = texto(req.body.modelo, 'modelo', { requerido: false, defecto: '', max: 60 });
  const categoria_id = entero(req.body.categoria_id === undefined ? 1 : req.body.categoria_id, 'categoria_id', { min: 1 });
  const precio_dia = decimal(req.body.precio_dia, 'precio_dia', { requerido: false, defecto: 0, min: 0 });
  const valor_reposicion = decimal(req.body.valor_reposicion, 'valor_reposicion', { requerido: false, defecto: 0, min: 0 });

  if (!/^[A-Za-z0-9._-]+$/.test(codigo))
    throw new ErrorValidacion('codigo solo admite letras, números, punto, guión y guión bajo');
  if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoria_id))
    throw new ErrorValidacion('categoria_id inexistente');
  if (db.prepare('SELECT 1 FROM equipos WHERE codigo = ?').get(codigo))
    return res.status(409).json({ error: 'Ya existe un equipo con ese código' });

  const r = db.prepare(`INSERT INTO equipos (codigo,modelo,categoria_id,nombre,precio_dia,valor_reposicion,estado_operativo)
    VALUES (?,?,?,?,?,?,?)`).run(codigo, modelo || null, categoria_id, nombre, precio_dia, valor_reposicion, 'DISPONIBLE');
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.get('/api/categorias', (req, res) => {
  res.json(db.prepare('SELECT * FROM categorias ORDER BY nombre').all());
});

// Modelos: agrupadores de unidades (base de los kits)
app.get('/api/modelos', (req, res) => {
  const rows = db.prepare(`SELECT modelo, MIN(nombre) nombre, COUNT(*) unidades,
      SUM(CASE WHEN estado_operativo='DISPONIBLE' THEN 1 ELSE 0 END) libres,
      MIN(categoria_id) categoria_id
    FROM equipos WHERE modelo IS NOT NULL AND modelo != '' GROUP BY modelo ORDER BY modelo`).all();
  res.json(rows);
});

// Resumen del panel: KPIs + disponibilidad por categoría + ingresos 6 meses + recientes
app.get('/api/resumen', (req, res) => {
  const hoy = hoyAR();
  const mes = hoy.slice(0, 7);
  const eq = db.prepare('SELECT e.*, c.nombre categoria FROM equipos e LEFT JOIN categorias c ON c.id=e.categoria_id').all();
  const alq = db.prepare('SELECT * FROM alquileres').all();
  const vencidos = alq.filter(a => ['ACTIVO', 'VENCIDO'].includes(a.estado) && a.fecha_devolucion_prevista < hoy).length;
  const cobradoMes = db.prepare("SELECT IFNULL(SUM(monto),0) s FROM pagos WHERE substr(fecha,1,7)=?").get(mes).s;

  // Ingresos últimos 6 meses (Date.UTC evita el salto de mes tipo 31/01 → 03/03)
  const ing = [];
  const [anioHoy, mesHoy] = hoy.split('-').map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(anioHoy, mesHoy - 1 - i, 1));
    const k = d.toISOString().slice(0, 7);
    ing.push({ mes: k, total: db.prepare('SELECT IFNULL(SUM(monto),0) s FROM pagos WHERE substr(fecha,1,7)=?').get(k).s });
  }

  const porCat = {};
  for (const e of eq) {
    const k = e.categoria || 'Sin categoría';
    porCat[k] = porCat[k] || { total: 0, libres: 0 };
    porCat[k].total++; if (e.estado_operativo === 'DISPONIBLE') porCat[k].libres++;
  }
  const recientes = db.prepare(`SELECT a.id, c.nombre cliente, a.fecha_retiro_prevista, a.fecha_devolucion_prevista,
    a.estado, a.total_presupuesto FROM alquileres a JOIN clientes c ON c.id=a.cliente_id ORDER BY a.id DESC LIMIT 6`).all();
  res.json({
    activos: alq.filter(a => a.estado === 'ACTIVO').length,
    reservados: alq.filter(a => a.estado === 'RESERVADO').length,
    disponibles: eq.filter(e => e.estado_operativo === 'DISPONIBLE').length, totalEquipos: eq.length,
    cobradoMes, vencidos, ingresos: ing, porCategoria: porCat, recientes
  });
});

app.post('/api/pagos', (req, res) => { // HU06
  const alquiler_id = entero(req.body.alquiler_id, 'alquiler_id');
  const tipo = opcion(req.body.tipo, 'tipo', TIPOS_PAGO, { requerido: false, defecto: 'SENA' });
  const medio = opcion(req.body.medio, 'medio', MEDIOS_PAGO, { requerido: false, defecto: 'TRANSFERENCIA' });
  const monto = decimal(req.body.monto, 'monto', { min: 0.01, max: 100000000 });
  const fechaPago = validarFecha(
    req.body.fecha === undefined || req.body.fecha === '' ? hoyAR() : req.body.fecha, 'fecha');
  if (fechaPago > hoyAR()) throw new ErrorValidacion('La fecha del pago no puede ser futura');

  const alq = db.prepare('SELECT * FROM alquileres WHERE id = ?').get(alquiler_id);
  if (!alq) return res.status(404).json({ error: 'Alquiler inexistente' });
  if (alq.estado === 'CANCELADO')
    return res.status(409).json({ error: 'El alquiler está cancelado: no admite pagos' });

  const pagado = db.prepare('SELECT IFNULL(SUM(monto),0) s FROM pagos WHERE alquiler_id = ?').get(alquiler_id).s;
  const saldo = Math.round(alq.total_presupuesto + (alq.total_mora || 0) - pagado);
  if (monto > saldo + 0.5)
    return res.status(409).json({ error: `El monto (${monto}) supera el saldo pendiente (${saldo})`, saldo });

  db.prepare('INSERT INTO pagos (alquiler_id,fecha,tipo,medio,monto) VALUES (?,?,?,?,?)')
    .run(alquiler_id, fechaPago, tipo, medio, monto);
  res.json({ ok: true, saldo: Math.max(0, Math.round(saldo - monto)) });
});

// Detalle + saldo de un alquiler (para pantalla de cobranza)
app.get('/api/alquileres/:id', (req, res) => {
  const id = entero(req.params.id, 'id');
  const a = db.prepare(`SELECT a.*, c.nombre cliente FROM alquileres a
    JOIN clientes c ON c.id=a.cliente_id WHERE a.id=?`).get(id);
  if (!a) return res.status(404).json({ error: 'Alquiler inexistente' });
  const det = db.prepare(`SELECT d.*, e.codigo, e.nombre equipo, k.nombre kit FROM detalle_alquiler d
    JOIN equipos e ON e.id=d.equipo_id LEFT JOIN kits k ON k.id=d.kit_id WHERE d.alquiler_id=?`).all(id);
  const pagos = db.prepare('SELECT * FROM pagos WHERE alquiler_id=? ORDER BY id').all(id);
  const gar = db.prepare('SELECT * FROM garantias WHERE alquiler_id=?').all(id);
  const pagado = pagos.reduce((s, p) => s + p.monto, 0);
  res.json({
    ...a, detalle: det, pagos, garantias: gar, pagado,
    saldo: Math.round(a.total_presupuesto + (a.total_mora || 0) - pagado)
  });
});

// --- Pantalla vieja (respaldo, la nueva está en public/index.html) ---
app.get('/mostrador-viejo', (req, res) => {
  const equipos = db.prepare('SELECT * FROM equipos').all();
  const clientes = db.prepare('SELECT * FROM clientes').all();
  const optsEq = equipos.map(e => `<option value="${e.id}">${e.codigo} - ${e.nombre} (${e.estado_operativo}) $${e.precio_dia}/día</option>`).join('');
  const optsCl = clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Alquiler - Mostrador</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"></head>
  <body class="container py-3"><h3>Alquiler audiovisual - Mostrador</h3>
  <div class="row g-3">
   <div class="col-md-6 card p-3"><h5>1. Disponibilidad (HU01)</h5>
    <select id="eq" class="form-select">${optsEq}</select>
    <div class="d-flex gap-2 mt-2"><input id="ini" type="date" class="form-control"><input id="fin" type="date" class="form-control">
    <button class="btn btn-primary" onclick="verDisp()">Ver</button></div><div id="rDisp" class="mt-2 fw-bold"></div></div>
   <div class="col-md-6 card p-3"><h5>2. Presupuesto / Reserva (HU02)</h5>
    <select id="cli" class="form-select">${optsCl}</select>
    <select id="eqs" multiple class="form-select mt-2">${optsEq}</select>
    <div class="d-flex gap-2 mt-2"><input id="rini" type="date" class="form-control"><input id="rfin" type="date" class="form-control"></div>
    <button class="btn btn-success mt-2" onclick="reservar()">Reservar</button><div id="rRes" class="mt-2"></div></div>
   <div class="col-md-6 card p-3"><h5>3. Retiro / Devolución (HU03-HU04)</h5>
    <input id="alq" placeholder="ID alquiler" class="form-control">
    <div class="d-flex gap-2 mt-2"><button class="btn btn-warning" onclick="retiro()">Retiro</button>
    <button class="btn btn-info" onclick="devol()">Devolución OK</button></div><div id="rMov" class="mt-2"></div></div>
   <div class="col-md-6 card p-3"><h5>4. Vencimientos hoy / Deudores (HU05-HU07)</h5>
    <div class="d-flex gap-2"><button class="btn btn-dark" onclick="venc()">Vence hoy</button>
    <button class="btn btn-danger" onclick="deud()">Deudores</button></div><div id="rTab" class="mt-2 table-responsive"></div></div>
   <div class="col-md-6 card p-3"><h5>5. Cobranza: ver saldo y cargar pago (HU06)</h5>
    <div class="d-flex gap-2"><input id="pAlq" placeholder="ID alquiler" class="form-control">
    <button class="btn btn-secondary" onclick="verSaldo()">Ver saldo</button></div>
    <div class="d-flex gap-2 mt-2"><select id="pTipo" class="form-select"><option>SENA</option><option>SALDO</option><option>RECARGO_MORA</option></select>
    <input id="pMonto" type="number" placeholder="Monto" class="form-control">
    <button class="btn btn-success" onclick="pagar()">Cobrar</button></div><div id="rPago" class="mt-2"></div></div>
  </div>
  <script>
  const j = async (u,o) => (await fetch(u,o)).json();
  async function verDisp(){ const r = await j('/api/disponibilidad?equipo_id='+eq.value+'&inicio='+ini.value+'&fin='+fin.value);
    rDisp.textContent = r.libre ? 'LIBRE' : 'OCUPADO: '+(r.error||r.motivo); rDisp.className='mt-2 fw-bold '+(r.libre?'text-success':'text-danger'); }
  async function reservar(){ const r = await j('/api/alquileres',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({cliente_id:+cli.value,inicio:rini.value,fin:rfin.value,equipo_ids:[...eqs.selectedOptions].map(o=>+o.value),
    garantia:{tipo:'DNI_RETENIDO',detalle:'auto',monto:0}})}); rRes.textContent = JSON.stringify(r); }
  async function retiro(){ const r = await j('/api/alquileres/'+alq.value+'/retiro',{method:'POST'}); rMov.textContent=JSON.stringify(r); }
  async function devol(){ const r = await j('/api/alquileres/'+alq.value+'/devolucion',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); rMov.textContent=JSON.stringify(r); }
  async function venc(){ const d = await j('/api/vencimientos?limit=100'); const rows = d.items||[];
    let h = '<table class="table table-sm"><tr><th>ID</th><th>Cliente</th><th>Devuelve</th><th>Estado</th></tr>';
    for (const r of rows) { h += '<tr><td>'+r.id+'</td><td>'+r.cliente+'</td><td>'+r.fecha_devolucion_prevista+'</td><td>'+r.estado+'</td></tr>'; }
    rTab.innerHTML = rows.length ? h+'</table>' : 'Nada vence hoy'; }
  async function deud(){ const d = await j('/api/deudores?limit=100'); const rows = d.items||[];
    let h = '<table class="table table-sm"><tr><th>ID</th><th>Cliente</th><th>Total</th><th>Pagado</th><th>Saldo</th></tr>';
    for (const r of rows) { h += '<tr><td>'+r.id+'</td><td>'+r.cliente+'</td><td>$'+r.total_presupuesto+'</td><td>$'+r.pagado+'</td><td class="fw-bold text-danger">$'+r.saldo+'</td></tr>'; }
    rTab.innerHTML = rows.length ? h+'</table>' : 'Sin deudores'; }
  async function verSaldo(){ const r = await j('/api/alquileres/'+pAlq.value);
    rPago.textContent = r.error ? r.error : ('Total $'+r.total_presupuesto+' - Pagado $'+r.pagado+' = Saldo $'+r.saldo+' ('+r.estado+')'); }
  async function pagar(){ const r = await j('/api/pagos',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({alquiler_id:+pAlq.value,tipo:pTipo.value,monto:+pMonto.value})}); rPago.textContent = JSON.stringify(r); verSaldo(); }
  </script></body></html>`);
});

// --- 404 JSON para la API ---
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Ruta no encontrada' });
  res.status(404).send('No encontrado');
});

// --- Manejo centralizado de errores ---
app.use((err, req, res, next) => {
  if (err instanceof ErrorValidacion)
    return res.status(400).json({ error: err.message, detalles: err.detalles || undefined });
  if (err && err.type === 'entity.parse.failed')
    return res.status(400).json({ error: 'JSON inválido en el cuerpo del pedido' });
  if (err && err.type === 'entity.too.large')
    return res.status(413).json({ error: 'El cuerpo del pedido es demasiado grande' });
  const msg = String((err && err.message) || '');
  if (msg.includes('CHECK constraint failed'))
    return res.status(400).json({ error: 'Valor inválido para un campo restringido' });
  if (msg.includes('UNIQUE constraint failed'))
    return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  if (msg.includes('FOREIGN KEY constraint failed'))
    return res.status(400).json({ error: 'Referencia inexistente en los datos enviados' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

if (require.main === module) {
  const server = app.listen(PORT, () => console.log('OK http://localhost:' + PORT));
  const cerrar = () => {
    server.close(() => {
      try { db.close(); } catch (e) { /* nada */ }
      process.exit(0);
    });
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

module.exports = { app, db };
