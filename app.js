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

// Seed mínimo si está vacío
if (db.prepare('SELECT COUNT(*) c FROM equipos').get().c === 0) {
  db.prepare("INSERT INTO categorias (nombre) VALUES ('Camaras'),('Sonido'),('Luces')").run();
  db.prepare(`INSERT INTO equipos (codigo,categoria_id,nombre,valor_reposicion,precio_dia,estado_operativo) VALUES
    ('CAM-SONY-A7-01',1,'Sony A7 III',2500,15000,'DISPONIBLE'),
    ('CON-YAM-01',2,'Consola Yamaha TF1',4000,20000,'DISPONIBLE'),
    ('MIC-SEN-01',2,'Mic Senheiser EW',800,5000,'MANTENIMIENTO')`).run();
  db.prepare(`INSERT INTO clientes (tipo,nombre,whatsapp) VALUES
    ('PRODUCTORA','Productora Sur','1100000001'),
    ('INDEPENDIENTE','Juan Videoclip','1100000002')`).run();
  console.log('Seed inicial cargado');
}

// --- Lógica de negocio ---
// R1: hay solape si nuevo.inicio <= existente.fin AND nuevo.fin >= existente.inicio (fechas YYYY-MM-DD)
function haySolape(aIni, aFin, bIni, bFin) {
  return aIni <= bFin && aFin >= bIni;
}

function equipoOcupadoEn(equipoId, inicio, fin, excluirAlquilerId = null) {
  let sql = `SELECT a.fecha_retiro_prevista ini, a.fecha_devolucion_prevista fin
    FROM detalle_alquiler d JOIN alquileres a ON a.id = d.alquiler_id
    WHERE d.equipo_id = ? AND a.estado IN ('RESERVADO','ACTIVO','VENCIDO')`;
  const params = [equipoId];
  if (excluirAlquilerId) { sql += ' AND a.id != ?'; params.push(excluirAlquilerId); }
  const rows = db.prepare(sql).all(...params);
  return rows.some(r => haySolape(inicio, fin, r.ini, r.fin));
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
    equipos: db.prepare(`SELECT e.codigo, e.nombre FROM detalle_alquiler d
      JOIN equipos e ON e.id=d.equipo_id WHERE d.alquiler_id=?`).all(a.id),
    pagado: db.prepare('SELECT IFNULL(SUM(monto),0) s FROM pagos WHERE alquiler_id=?').get(a.id).s
  })));
});

app.post('/api/equipos/estado', (req, res) => {
  const { equipo_id, estado, observacion } = req.body; // HU08
  db.prepare('UPDATE equipos SET estado_operativo=? WHERE id=?').run(estado, equipo_id);
  db.prepare(`INSERT INTO movimientos (equipo_id,fecha,tipo,observacion) VALUES (?,?,?,?)`)
    .run(equipo_id, new Date().toISOString().slice(0, 10), estado === 'DISPONIBLE' ? 'EGRESO_MANT' : 'INGRESO_MANT', observacion || '');
  res.json({ ok: true });
});

app.get('/api/disponibilidad', (req, res) => { // HU01
  const { equipo_id, inicio, fin } = req.query;
  if (!equipo_id || !inicio || !fin) return res.status(400).json({ error: 'equipo_id, inicio, fin requeridos (YYYY-MM-DD)' });
  res.json(disponibilidad(Number(equipo_id), inicio, fin));
});

app.post('/api/alquileres', (req, res) => { // HU02
  const { cliente_id, inicio, fin, equipo_ids, garantia } = req.body;
  if (!cliente_id || !inicio || !fin || !Array.isArray(equipo_ids) || !equipo_ids.length)
    return res.status(400).json({ error: 'cliente_id, inicio, fin, equipo_ids[] requeridos' });
  if (fin < inicio) return res.status(400).json({ error: 'fin < inicio' });
  // Validar cada equipo
  for (const eid of equipo_ids) {
    const d = disponibilidad(eid, inicio, fin);
    if (!d.libre) return res.status(409).json({ error: `Equipo ${eid} no disponible: ${d.motivo}` });
  }
  const dias = diasEntre(inicio, fin);
  const tx = db.prepare('INSERT INTO alquileres (cliente_id,estado,fecha_retiro_prevista,fecha_devolucion_prevista,total_presupuesto) VALUES (?,?,?,?,?)');
  let total = 0;
  const items = equipo_ids.map(eid => {
    const eq = db.prepare('SELECT * FROM equipos WHERE id=?').get(eid);
    const sub = eq.precio_dia * dias; total += sub;
    return { eid, precio: eq.precio_dia, sub };
  });
  const r = tx.run(cliente_id, 'RESERVADO', inicio, fin, total);
  const alqId = r.lastInsertRowid;
  for (const it of items)
    db.prepare('INSERT INTO detalle_alquiler (alquiler_id,equipo_id,precio_dia,subtotal) VALUES (?,?,?,?)').run(alqId, it.eid, it.precio, it.sub);
  if (garantia)
    db.prepare('INSERT INTO garantias (alquiler_id,tipo,detalle,monto_cubierto) VALUES (?,?,?,?)')
      .run(alqId, garantia.tipo, garantia.detalle || '', garantia.monto || 0);
  res.json({ ok: true, alquiler_id: alqId, total, dias });
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
    const final = est === 'DANADO' ? 'MANTENIMIENTO' : 'DISPONIBLE'; // R4
    db.prepare('UPDATE equipos SET estado_operativo=? WHERE id=?').run(final, d.equipo_id);
    db.prepare('INSERT INTO movimientos (equipo_id,alquiler_id,fecha,tipo,estado_recibido) VALUES (?,?,?,?,?)')
      .run(d.equipo_id, alq.id, hoy, 'DEVOLUCION', est);
  }
  db.prepare("UPDATE alquileres SET estado='DEVUELTO', fecha_devolucion_real=? WHERE id=?").run(hoy, alq.id);
  res.json({ ok: true, mora_calculada: Math.round(mora) });
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

app.get('/api/deudores', (req, res) => { // HU07
  const rows = db.prepare(`SELECT a.id, c.nombre cliente, a.total_presupuesto,
    IFNULL((SELECT SUM(monto) FROM pagos p WHERE p.alquiler_id=a.id),0) pagado,
    a.estado, a.fecha_devolucion_prevista FROM alquileres a JOIN clientes c ON c.id=a.cliente_id
    WHERE a.estado != 'CANCELADO'`).all();
  res.json(rows.map(r => ({ ...r, saldo: Math.round(r.total_presupuesto - r.pagado) })).filter(r => r.saldo > 0));
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
  const det = db.prepare(`SELECT d.*, e.codigo, e.nombre equipo FROM detalle_alquiler d
    JOIN equipos e ON e.id=d.equipo_id WHERE d.alquiler_id=?`).all(a.id);
  const pagos = db.prepare('SELECT * FROM pagos WHERE alquiler_id=? ORDER BY id').all(a.id);
  const gar = db.prepare('SELECT * FROM garantias WHERE alquiler_id=?').all(a.id);
  const pagado = pagos.reduce((s, p) => s + p.monto, 0);
  res.json({ ...a, detalle: det, pagos, garantias: gar, pagado, saldo: Math.round(a.total_presupuesto - pagado) });
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
