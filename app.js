// MVP Sistema Alquiler Audiovisual - Node + Express + SQLite (built-in)
// Para arrancar: npm install  ->  npm start  ->  abrir http://localhost:3000
const express = require('express');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- DB ---
const DB_PATH = path.join(__dirname, 'alquiler.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
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
}
migrar();

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
    ('INDEPENDIENTE','Colectivo Luz','1100000004')`).run();
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
  const hoy = new Date().toISOString().slice(0, 10);
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

function diasEntre(ini, fin) {
  const ms = new Date(fin) - new Date(ini) + 86400000; // inclusivo aprox
  return Math.max(1, Math.round(ms / 86400000));
}

// --- API ---
app.get('/api/equipos', (req, res) => {
  res.json(db.prepare('SELECT e.*, c.nombre categoria FROM equipos e LEFT JOIN categorias c ON c.id=e.categoria_id').all());
});

// Listas para el panel RentaVisión
app.get('/api/clientes', (req, res) => {
  res.json(db.prepare('SELECT * FROM clientes ORDER BY nombre').all());
});

app.get('/api/alquileres', (req, res) => {
  const rows = db.prepare(`SELECT a.*, c.nombre cliente FROM alquileres a
    JOIN clientes c ON c.id=a.cliente_id ORDER BY a.id DESC`).all();
  res.json(rows.map(a => ({
    ...a,
    equipos: db.prepare(`SELECT e.id, e.codigo, e.nombre, d.kit_id, k.nombre kit, d.cantidad
      FROM detalle_alquiler d JOIN equipos e ON e.id=d.equipo_id
      LEFT JOIN kits k ON k.id=d.kit_id WHERE d.alquiler_id=?`).all(a.id),
    pagado: db.prepare('SELECT IFNULL(SUM(monto),0) s FROM pagos WHERE alquiler_id=?').get(a.id).s
  })));
});

app.post('/api/equipos/estado', (req, res) => {
  const { equipo_id, estado, observacion, tipo_mantenimiento } = req.body; // HU08
  db.prepare('UPDATE equipos SET estado_operativo=?, tipo_mantenimiento=? WHERE id=?')
    .run(estado, estado === 'MANTENIMIENTO' ? (tipo_mantenimiento || 'CORRECTIVO') : null, equipo_id);
  db.prepare(`INSERT INTO movimientos (equipo_id,fecha,tipo,observacion) VALUES (?,?,?,?)`)
    .run(equipo_id, new Date().toISOString().slice(0, 10), estado === 'DISPONIBLE' ? 'EGRESO_MANT' : 'INGRESO_MANT', observacion || '');
  res.json({ ok: true });
});

app.get('/api/disponibilidad', (req, res) => { // HU01
  const { equipo_id, inicio, fin } = req.query;
  if (!equipo_id || !inicio || !fin) return res.status(400).json({ error: 'equipo_id, inicio, fin requeridos (YYYY-MM-DD)' });
  res.json(disponibilidad(Number(equipo_id), inicio, fin));
});

// ---------- API KITS ----------
app.get('/api/kits', (req, res) => { // catalogo de kits con desglose
  const { inicio, fin } = req.query;
  const kits = db.prepare('SELECT * FROM kits WHERE activo = 1 ORDER BY nombre').all();
  const out = kits.map(k => {
    const items = db.prepare('SELECT modelo, cantidad FROM kit_items WHERE kit_id=?').all(k.id);
    const desglose = items.map(it => {
      const unidades = unidadesDeModelo(it.modelo);
      const libres = (inicio && fin) ? unidadesLibres(it.modelo, inicio, fin) : unidades.filter(u => u.estado_operativo === 'DISPONIBLE');
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
    return { ...k, desglose, completo, precio_calculado: precioKit,
      estado: (inicio && fin) ? (completo ? 'DISPONIBLE' : 'BLOQUEADO') : null };
  });
  res.json(out);
});

app.get('/api/kits/:id/disponibilidad', (req, res) => { // bloqueo en cadena
  const { inicio, fin } = req.query;
  if (!inicio || !fin) return res.status(400).json({ error: 'inicio y fin requeridos (YYYY-MM-DD)' });
  const d = disponibilidadKit(Number(req.params.id), inicio, fin);
  res.json({ libre: d.libre, kit: d.kit ? { id: d.kit.id, nombre: d.kit.nombre } : null, conflictos: d.conflictos });
});

app.post('/api/kits', (req, res) => { // alta de kit
  const { codigo, nombre, descripcion, precio_dia, componentes } = req.body;
  if (!codigo || !nombre) return res.status(400).json({ error: 'codigo y nombre requeridos' });
  try {
    const r = db.prepare('INSERT INTO kits (codigo,nombre,descripcion,precio_dia) VALUES (?,?,?,?)')
      .run(codigo, nombre, descripcion || '', precio_dia != null && precio_dia !== '' ? Number(precio_dia) : null);
    const kitId = r.lastInsertRowid;
    for (const c of (componentes || []))
      db.prepare('INSERT INTO kit_items (kit_id,modelo,cantidad) VALUES (?,?,?)').run(kitId, c.modelo, Number(c.cantidad) || 1);
    res.json({ ok: true, id: kitId });
  } catch (e) { res.status(409).json({ error: 'codigo de kit duplicado' }); }
});

app.post('/api/alquileres', (req, res) => { // HU02 (admite equipos sueltos y/o kits)
  const { cliente_id, inicio, fin, equipo_ids, kits, garantia } = req.body;
  const sueltos = Array.isArray(equipo_ids) ? equipo_ids.map(Number) : [];
  const pedidoKits = Array.isArray(kits) ? kits : [];
  if (!cliente_id || !inicio || !fin)
    return res.status(400).json({ error: 'cliente_id, inicio, fin requeridos' });
  if (!sueltos.length && !pedidoKits.length)
    return res.status(400).json({ error: 'Se requiere al menos un equipo o un kit' });
  if (fin < inicio) return res.status(400).json({ error: 'fin < inicio' });

  // 1) Validar KITS: todo o nada. Si un componente choca, cae el kit entero.
  const conflictos = [];
  const lineas = []; // {equipo_id, kit_id}
  for (const k of pedidoKits) {
    const kitId = Number(k.kit_id), qty = Math.max(1, Number(k.cantidad) || 1);
    for (let n = 0; n < qty; n++) {
      const d = disponibilidadKit(kitId, inicio, fin);
      if (!d.libre) {
        conflictos.push(...d.conflictos.map(c => ({ ...c, kit: d.kit?.nombre || 'Kit' })));
        continue;
      }
      for (const u of asignarUnidadesKit(kitId, inicio, fin)) lineas.push({ equipo_id: u.equipo_id, kit_id: kitId });
    }
  }
  if (conflictos.length)
    return res.status(409).json({ error: 'Kit no disponible: un componente esta en conflicto', conflictos });

  // 2) Validar equipos sueltos
  for (const eid of sueltos) {
    const d = disponibilidad(eid, inicio, fin);
    if (!d.libre) return res.status(409).json({ error: `Equipo ${eid} no disponible: ${d.motivo}` });
    lineas.push({ equipo_id: eid, kit_id: null });
  }

  // 3) Dedup: el mismo equipo fisico no puede aparecer dos veces en el mismo alquiler
  const vistos = new Set();
  const unicas = [];
  for (const l of lineas) {
    if (vistos.has(l.equipo_id)) continue;
    vistos.add(l.equipo_id);
    unicas.push(l);
  }
  if (!unicas.length) return res.status(400).json({ error: 'No quedan equipos validos para reservar' });

  // 4) Calculo de precios (transaccional: todo o nada)
  const dias = diasEntre(inicio, fin);
  db.exec('BEGIN');
  try {
    // precio propio del kit (si tiene) prorrateado entre sus lineas
    const porKit = new Map();
    for (const l of unicas) if (l.kit_id) porKit.set(l.kit_id, (porKit.get(l.kit_id) || 0) + 1);
    const precioKit = new Map();
    for (const [kitId, nLineas] of porKit) {
      const kit = db.prepare('SELECT * FROM kits WHERE id=?').get(kitId);
      const qty = pedidoKits.filter(k => Number(k.kit_id) === kitId).reduce((s, k) => s + Math.max(1, Number(k.cantidad) || 1), 0);
      const totalKit = kit.precio_dia != null ? kit.precio_dia * qty : null;
      precioKit.set(kitId, totalKit != null ? totalKit / nLineas : null);
    }
    let total = 0;
    const items = unicas.map(l => {
      const eq = db.prepare('SELECT * FROM equipos WHERE id=?').get(l.equipo_id);
      const pr = l.kit_id && precioKit.get(l.kit_id) != null ? precioKit.get(l.kit_id) : eq.precio_dia;
      const sub = pr * dias; total += sub;
      return { ...l, precio: pr, sub };
    });
    const r = db.prepare(`INSERT INTO alquileres (cliente_id,estado,fecha_retiro_prevista,fecha_devolucion_prevista,total_presupuesto)
      VALUES (?,?,?,?,?)`).run(cliente_id, 'RESERVADO', inicio, fin, total);
    const alqId = r.lastInsertRowid;
    for (const it of items)
      db.prepare(`INSERT INTO detalle_alquiler (alquiler_id,equipo_id,kit_id,cantidad,precio_dia,subtotal)
        VALUES (?,?,?,?,?,?)`).run(alqId, it.equipo_id, it.kit_id, 1, it.precio, it.sub);
    if (garantia)
      db.prepare('INSERT INTO garantias (alquiler_id,tipo,detalle,monto_cubierto) VALUES (?,?,?,?)')
        .run(alqId, garantia.tipo, garantia.detalle || '', garantia.monto || 0);
    db.exec('COMMIT');
    res.json({ ok: true, alquiler_id: alqId, total, dias, equipos: items.length,
      detalle: items.map(i => ({ equipo_id: i.equipo_id, kit_id: i.kit_id })) });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'No se pudo crear la reserva: ' + e.message });
  }
});

app.post('/api/alquileres/:id/retiro', (req, res) => { // HU03 + R3
  const alq = db.prepare('SELECT * FROM alquileres WHERE id=?').get(req.params.id);
  if (!alq || alq.estado !== 'RESERVADO') return res.status(400).json({ error: 'Debe estar RESERVADO' });
  const g = db.prepare('SELECT * FROM garantias WHERE alquiler_id=?').get(alq.id);
  if (!g) return res.status(400).json({ error: 'R3: exige garantía registrada antes del retiro' });
  const hoy = new Date().toISOString().slice(0, 10);
  db.prepare("UPDATE alquileres SET estado='ACTIVO', fecha_retiro_real=? WHERE id=?").run(hoy, alq.id);
  for (const d of db.prepare('SELECT * FROM detalle_alquiler WHERE alquiler_id=?').all(alq.id)) {
    db.prepare("UPDATE equipos SET estado_operativo='ALQUILADO' WHERE id=?").run(d.equipo_id);
    db.prepare("INSERT INTO movimientos (equipo_id,alquiler_id,fecha,tipo) VALUES (?,?,?,?)").run(d.equipo_id, alq.id, hoy, 'RETIRO');
  }
  res.json({ ok: true });
});

app.post('/api/alquileres/:id/devolucion', (req, res) => { // HU04 + R4/R5
  const { estado_equipos, fecha } = req.body; // {equipo_id: 'DISPONIBLE'|'DANADO'}
  const alq = db.prepare('SELECT * FROM alquileres WHERE id=?').get(req.params.id);
  if (!alq || !['ACTIVO', 'VENCIDO'].includes(alq.estado)) return res.status(400).json({ error: 'Debe estar ACTIVO/VENCIDO' });
  const hoy = fecha || new Date().toISOString().slice(0, 10);
  let mora = 0;
  if (hoy > alq.fecha_devolucion_prevista) { // R5
    const diasMora = diasEntre(alq.fecha_devolucion_prevista, hoy) - 1;
    for (const d of db.prepare('SELECT * FROM detalle_alquiler WHERE alquiler_id=?').all(alq.id))
      mora += d.precio_dia * diasMora * 1.5; // factor recargo 1.5
  }
  for (const d of db.prepare('SELECT * FROM detalle_alquiler WHERE alquiler_id=?').all(alq.id)) {
    const est = (estado_equipos && estado_equipos[d.equipo_id]) || 'DISPONIBLE';
    const final = est === 'DANADO' ? 'MANTENIMIENTO' : 'DISPONIBLE'; // R4 (por unidad fisica)
    db.prepare('UPDATE equipos SET estado_operativo=?, tipo_mantenimiento=? WHERE id=?')
      .run(final, est === 'DANADO' ? 'CORRECTIVO' : null, d.equipo_id);
    db.prepare('INSERT INTO movimientos (equipo_id,alquiler_id,fecha,tipo,estado_recibido) VALUES (?,?,?,?,?)')
      .run(d.equipo_id, alq.id, hoy, 'DEVOLUCION', est);
  }
  db.prepare("UPDATE alquileres SET estado='DEVUELTO', fecha_devolucion_real=?, total_mora=? WHERE id=?").run(hoy, Math.round(mora), alq.id);
  res.json({ ok: true, mora_calculada: Math.round(mora) });
});

// Prórroga telefónica formalizada (R6): solo si no colisiona con otra reserva
app.post('/api/alquileres/:id/prorroga', (req, res) => {
  const alq = db.prepare('SELECT * FROM alquileres WHERE id=?').get(req.params.id);
  if (!alq || !['RESERVADO', 'ACTIVO', 'VENCIDO'].includes(alq.estado))
    return res.status(400).json({ error: 'Solo RESERVADO/ACTIVO/VENCIDO' });
  const { nueva_fin } = req.body;
  if (!nueva_fin || nueva_fin <= alq.fecha_devolucion_prevista)
    return res.status(400).json({ error: 'nueva_fin debe ser mayor a la actual' });
  for (const d of db.prepare('SELECT * FROM detalle_alquiler WHERE alquiler_id=?').all(alq.id)) {
    if (equipoOcupadoEn(d.equipo_id, alq.fecha_retiro_prevista, nueva_fin, alq.id))
      return res.status(409).json({ error: `Equipo ${d.equipo_id} colisiona en la extensión (R6)` });
  }
  // Recalcula subtotales al nuevo rango
  const dias = diasEntre(alq.fecha_retiro_prevista, nueva_fin);
  let total = 0;
  for (const d of db.prepare('SELECT * FROM detalle_alquiler WHERE alquiler_id=?').all(alq.id)) {
    const sub = d.precio_dia * dias; total += sub;
    db.prepare('UPDATE detalle_alquiler SET subtotal=? WHERE id=?').run(sub, d.id);
  }
  db.prepare('UPDATE alquileres SET fecha_devolucion_prevista=?, total_presupuesto=?, estado=? WHERE id=?')
    .run(nueva_fin, total, alq.estado === 'VENCIDO' ? 'ACTIVO' : alq.estado, alq.id);
  res.json({ ok: true, total, dias });
});

app.get('/api/vencimientos', (req, res) => { // HU05
  const hoy = req.query.fecha || new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`SELECT a.*, c.nombre cliente, c.whatsapp FROM alquileres a
    JOIN clientes c ON c.id=a.cliente_id
    WHERE a.estado IN ('ACTIVO','RESERVADO','VENCIDO') AND a.fecha_devolucion_prevista <= ?
    ORDER BY a.fecha_devolucion_prevista`).all(hoy);
  // marca vencidos
  for (const r of rows.filter(x => x.estado === 'ACTIVO' && x.fecha_devolucion_prevista < hoy))
    db.prepare("UPDATE alquileres SET estado='VENCIDO' WHERE id=?").run(r.id);
  res.json(rows);
});

app.get('/api/deudores', (req, res) => { // HU07 (incluye mora persistida)
  const rows = db.prepare(`SELECT a.id, c.nombre cliente, a.total_presupuesto, IFNULL(a.total_mora,0) total_mora,
    IFNULL((SELECT SUM(monto) FROM pagos p WHERE p.alquiler_id=a.id),0) pagado,
    a.estado, a.fecha_devolucion_prevista FROM alquileres a JOIN clientes c ON c.id=a.cliente_id
    WHERE a.estado != 'CANCELADO'`).all();
  res.json(rows.map(r => ({ ...r, saldo: Math.round(r.total_presupuesto + r.total_mora - r.pagado) })).filter(r => r.saldo > 0));
});

// Alta de cliente y equipo (Acciones rápidas del panel)
app.post('/api/clientes', (req, res) => {
  const { tipo, nombre, whatsapp } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
  const r = db.prepare('INSERT INTO clientes (tipo,nombre,whatsapp) VALUES (?,?,?)').run(tipo || 'INDEPENDIENTE', nombre, whatsapp || '');
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.post('/api/equipos', (req, res) => {
  const { codigo, categoria_id, nombre, precio_dia, valor_reposicion } = req.body;
  if (!codigo || !nombre) return res.status(400).json({ error: 'codigo y nombre requeridos' });
  try {
    const r = db.prepare('INSERT INTO equipos (codigo,categoria_id,nombre,precio_dia,valor_reposicion,estado_operativo) VALUES (?,?,?,?,?,?)')
      .run(codigo, categoria_id || 1, nombre, precio_dia || 0, valor_reposicion || 0, 'DISPONIBLE');
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) { res.status(409).json({ error: 'código duplicado' }); }
});

app.get('/api/categorias', (req, res) => {
  res.json(db.prepare('SELECT * FROM categorias ORDER BY nombre').all());
});

// Resumen del panel: KPIs + disponibilidad por categoría + ingresos 6 meses + recientes
app.get('/api/resumen', (req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const mes = hoy.slice(0, 7);
  const eq = db.prepare('SELECT e.*, c.nombre categoria FROM equipos e LEFT JOIN categorias c ON c.id=e.categoria_id').all();
  const alq = db.prepare('SELECT * FROM alquileres').all();
  const vencidos = alq.filter(a => ['ACTIVO', 'VENCIDO'].includes(a.estado) && a.fecha_devolucion_prevista < hoy).length;
  const cobradoMes = db.prepare("SELECT IFNULL(SUM(monto),0) s FROM pagos WHERE substr(fecha,1,7)=?").get(mes).s;
  // ingresos últimos 6 meses
  const ing = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const k = d.toISOString().slice(0, 7);
    ing.push({ mes: k, total: db.prepare('SELECT IFNULL(SUM(monto),0) s FROM pagos WHERE substr(fecha,1,7)=?').get(k).s });
  }
  // disponibilidad por categoría
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
  const { alquiler_id, tipo, monto, medio } = req.body;
  if (!alquiler_id || !monto) return res.status(400).json({ error: 'alquiler_id y monto requeridos' });
  db.prepare('INSERT INTO pagos (alquiler_id,fecha,tipo,medio,monto) VALUES (?,?,?,?,?)')
    .run(alquiler_id, new Date().toISOString().slice(0, 10), tipo || 'SENA', medio || 'TRANSFERENCIA', monto);
  res.json({ ok: true });
});

// Detalle + saldo de un alquiler (para pantalla de cobranza)
app.get('/api/alquileres/:id', (req, res) => {
  const a = db.prepare(`SELECT a.*, c.nombre cliente FROM alquileres a
    JOIN clientes c ON c.id=a.cliente_id WHERE a.id=?`).get(req.params.id);
  if (!a) return res.status(404).json({ error: 'No existe' });
  const det = db.prepare(`SELECT d.*, e.codigo, e.nombre equipo, k.nombre kit FROM detalle_alquiler d
    JOIN equipos e ON e.id=d.equipo_id LEFT JOIN kits k ON k.id=d.kit_id WHERE d.alquiler_id=?`).all(a.id);
  const pagos = db.prepare('SELECT * FROM pagos WHERE alquiler_id=? ORDER BY id').all(a.id);
  const gar = db.prepare('SELECT * FROM garantias WHERE alquiler_id=?').all(a.id);
  const pagado = pagos.reduce((s, p) => s + p.monto, 0);
  res.json({ ...a, detalle: det, pagos, garantias: gar, pagado, saldo: Math.round(a.total_presupuesto + (a.total_mora || 0) - pagado) });
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
    <select id="cli">${optsCl}</select>
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
    rDisp.textContent = r.libre ? 'LIBRE' : 'OCUPADO: '+r.motivo; rDisp.className='mt-2 fw-bold '+(r.libre?'text-success':'text-danger'); }
  async function reservar(){ const r = await j('/api/alquileres',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({cliente_id:+cli.value,inicio:rini.value,fin:rfin.value,equipo_ids:[...eqs.selectedOptions].map(o=>+o.value),
    garantia:{tipo:'DNI_RETENIDO',detalle:'auto',monto:0}})}); rRes.textContent = JSON.stringify(r); }
  async function retiro(){ const r = await j('/api/alquileres/'+alq.value+'/retiro',{method:'POST'}); rMov.textContent=JSON.stringify(r); }
  async function devol(){ const r = await j('/api/alquileres/'+alq.value+'/devolucion',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); rMov.textContent=JSON.stringify(r); }
  async function venc(){ const rows = await j('/api/vencimientos');
    let h = '<table class="table table-sm"><tr><th>ID</th><th>Cliente</th><th>Devuelve</th><th>Estado</th></tr>';
    for (const r of rows) { h += '<tr><td>'+r.id+'</td><td>'+r.cliente+'</td><td>'+r.fecha_devolucion_prevista+'</td><td>'+r.estado+'</td></tr>'; }
    rTab.innerHTML = rows.length ? h+'</table>' : 'Nada vence hoy'; }
  async function deud(){ const rows = await j('/api/deudores');
    let h = '<table class="table table-sm"><tr><th>ID</th><th>Cliente</th><th>Total</th><th>Pagado</th><th>Saldo</th></tr>';
    for (const r of rows) { h += '<tr><td>'+r.id+'</td><td>'+r.cliente+'</td><td>$'+r.total_presupuesto+'</td><td>$'+r.pagado+'</td><td class="fw-bold text-danger">$'+r.saldo+'</td></tr>'; }
    rTab.innerHTML = rows.length ? h+'</table>' : 'Sin deudores'; }
  async function verSaldo(){ const r = await j('/api/alquileres/'+pAlq.value);
    rPago.textContent = r.error ? r.error : ('Total $'+r.total_presupuesto+' - Pagado $'+r.pagado+' = Saldo $'+r.saldo+' ('+r.estado+')'); }
  async function pagar(){ const r = await j('/api/pagos',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({alquiler_id:+pAlq.value,tipo:pTipo.value,monto:+pMonto.value})}); rPago.textContent = JSON.stringify(r); verSaldo(); }
  </script></body></html>`);
});

app.listen(PORT, () => console.log('OK http://localhost:' + PORT));
