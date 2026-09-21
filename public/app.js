// Frontend RentaVisión (vanilla JS) - habla con /api/* del backend
const j = async (u, o) => (await fetch(u, o)).json();
const $ = id => document.getElementById(id);
const money = n => '$' + Number(n || 0).toLocaleString('es-AR');
let ALQ = [], FILTRO_EST = '';

function go(v) {
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  ['panel', 'inventario', 'alquileres', 'clientes'].forEach(x => $('view-' + x).classList.add('hidden'));
  $('view-' + v).classList.remove('hidden');
  $('viewTitle').textContent = { panel: 'Panel', inventario: 'Inventario', alquileres: 'Alquileres', clientes: 'Clientes' }[v];
  document.getElementById('sidebar').classList.remove('open');
}
document.querySelectorAll('.nav button').forEach(b => b.onclick = () => go(b.dataset.view));
document.querySelectorAll('#tabsEst button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabsEst button').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); FILTRO_EST = b.dataset.e; renderAlq();
});
function openReserva() { $('reservaCard').scrollIntoView({ behavior: 'smooth' }); }

async function load() {
  const [eq, alq, cli, venc, deud] = await Promise.all([
    j('/api/equipos'), j('/api/alquileres'), j('/api/clientes'), j('/api/vencimientos'), j('/api/deudores')
  ]);
  ALQ = alq;
  // KPIs
  $('kAct').textContent = alq.filter(a => a.estado === 'ACTIVO').length;
  $('kActSub').textContent = alq.filter(a => a.estado === 'RESERVADO').length + ' reservados';
  $('kEq').textContent = eq.filter(e => e.estado_operativo === 'DISPONIBLE').length + ' / ' + eq.length;
  $('kCash').textContent = money(alq.reduce((s, a) => s + Number(a.pagado || 0), 0));
  $('kVen').textContent = venc.length;
  // Tablas panel
  $('tVenc').innerHTML = venc.length ? '<table><tr><th>ID</th><th>Cliente</th><th>Devuelve</th><th>Estado</th></tr>' +
    venc.map(r => `<tr><td>ALQ-${r.id}</td><td>${r.cliente}</td><td>${r.fecha_devolucion_prevista}</td><td><span class="pill ${r.estado}">${r.estado}</span></td></tr>`).join('') + '</table>' : 'Nada vence hoy.';
  $('tDeud').innerHTML = deud.length ? '<table><tr><th>ID</th><th>Cliente</th><th>Saldo</th></tr>' +
    deud.map(r => `<tr><td>ALQ-${r.id}</td><td>${r.cliente}</td><td><b>${money(r.saldo)}</b></td></tr>`).join('') + '</table>' : 'Sin deudores.';
  // Inventario
  const cats = [...new Set(eq.map(e => e.categoria).filter(Boolean))];
  $('fCat').innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c => `<option>${c}</option>`).join('');
  renderEq(eq);
  $('dEq').innerHTML = eq.map(e => `<option value="${e.id}">${e.codigo} · ${e.nombre}</option>`).join('');
  $('rEqs').innerHTML = eq.filter(e => e.estado_operativo === 'DISPONIBLE').map(e => `<option value="${e.id}">${e.codigo} · ${e.nombre} (${money(e.precio_dia)}/día)</option>`).join('');
  // Alquileres + clientes
  renderAlq();
  $('rCli').innerHTML = cli.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  $('tCli').innerHTML = '<table><tr><th>Cliente</th><th>Tipo</th><th>WhatsApp</th></tr>' +
    cli.map(c => `<tr><td>${c.nombre}</td><td>${c.tipo}</td><td>${c.whatsapp || ''}</td></tr>`).join('') + '</table>';
  window._EQ = eq;
}
function renderEq(eq) {
  const c = $('fCat').value, e = $('fEst').value;
  const rows = (eq || window._EQ).filter(x => (!c || x.categoria === c) && (!e || x.estado_operativo === e));
  $('tEq').innerHTML = '<table><tr><th>Equipo</th><th>Categoría</th><th>N° serie</th><th>Estado</th><th>Tarifa/día</th></tr>' +
    rows.map(x => `<tr><td><b>${x.nombre}</b><br><small>${x.codigo}</small></td><td>${x.categoria || ''}</td><td>${x.codigo}</td><td><span class="pill ${x.estado_operativo}">${x.estado_operativo}</span></td><td>${money(x.precio_dia)}</td></tr>`).join('') + '</table>';
}
$('fCat').onchange = () => renderEq(); $('fEst').onchange = () => renderEq();

function renderAlq() {
  const rows = ALQ.filter(a => !FILTRO_EST || a.estado === FILTRO_EST);
  const q = ($('q').value || '').toLowerCase();
  const f = rows.filter(a => !q || (a.cliente + ' ' + a.id).toLowerCase().includes(q));
  $('tAlq').innerHTML = '<table><tr><th>Ref</th><th>Cliente</th><th>Equipos</th><th>Período</th><th>Estado</th><th>Total</th></tr>' +
    f.map(a => `<tr><td>ALQ-${a.id}</td><td>${a.cliente}</td><td>${a.equipos.map(x => x.nombre).join(', ')}</td><td><small>${a.fecha_retiro_prevista} → ${a.fecha_devolucion_prevista}</small></td><td><span class="pill ${a.estado}">${a.estado}</span></td><td>${money(a.total_presupuesto)}</td></tr>`).join('') + '</table>';
}
$('q').oninput = renderAlq;

async function verDisp() {
  const r = await j(`/api/disponibilidad?equipo_id=${$('dEq').value}&inicio=${$('dIni').value}&fin=${$('dFin').value}`);
  const el = $('dRes'); el.textContent = r.libre ? 'LIBRE' : 'OCUPADO: ' + r.motivo;
  el.className = 'pill ' + (r.libre ? 'DISPONIBLE' : 'VENCIDO');
}
async function reservar() {
  const eqs = [...$('rEqs').selectedOptions].map(o => +o.value);
  const r = await j('/api/alquileres', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente_id: +$('rCli').value, inicio: $('rIni').value, fin: $('rFin').value, equipo_ids: eqs, garantia: { tipo: $('rGar').value, detalle: 'web', monto: 0 } }) });
  $('rRes').textContent = r.ok ? `OK ALQ-${r.alquiler_id} total ${money(r.total)}` : ('Error: ' + (r.error || '?'));
  load();
}
async function retiro() { $('mRes').textContent = JSON.stringify(await j('/api/alquileres/' + $('mAlq').value + '/retiro', { method: 'POST' })); load(); }
async function devol() { $('mRes').textContent = JSON.stringify(await j('/api/alquileres/' + $('mAlq').value + '/devolucion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })); load(); }
async function verSaldo() {
  const r = await j('/api/alquileres/' + $('pAlq').value);
  $('rPago').textContent = r.error ? r.error : `ALQ-${r.id} Total ${money(r.total_presupuesto)} - Pagado ${money(r.pagado)} = Saldo ${money(r.saldo)} (${r.estado})`;
}
async function pagar() {
  await j('/api/pagos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alquiler_id: +$('pAlq').value, tipo: $('pTipo').value, monto: +$('pMonto').value }) });
  verSaldo(); load();
}
load();
