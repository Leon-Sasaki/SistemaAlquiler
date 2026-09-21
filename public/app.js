// RentaVisión · frontend conectado al backend real (/api/*)
const j = async (u, o) => (await fetch(u, o)).json();
const $ = id => document.getElementById(id);
const money = n => '$' + Number(n || 0).toLocaleString('es-AR');
const pill = s => `<span class="pill p-${s}">${s}</span>`;
let EQ = [], ALQ = [], CLI = [], FILTRO = '';
let chart = null;

/* Navegación */
function go(v) {
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  ['panel', 'inventario', 'alquileres', 'clientes'].forEach(x => {
    const el = $('view-' + x);
    el.classList.add('hidden'); el.classList.remove('flex');
  });
  const cur = $('view-' + v);
  cur.classList.remove('hidden');
  if (v !== 'panel') cur.classList.add('flex');
  $('viewTitle').textContent = { panel: 'Panel', inventario: 'Inventario', alquileres: 'Alquileres', clientes: 'Clientes' }[v];
  $('viewSub').textContent = {
    panel: 'Resumen de la operación de alquileres',
    inventario: 'Catálogo de equipos audiovisuales',
    alquileres: 'Reservas y contratos de alquiler',
    clientes: 'Directorio de clientes y cobranzas'
  }[v];
  document.getElementById('sidebar').classList.add('hidden');
  if (window.innerWidth >= 768) document.getElementById('sidebar').classList.remove('hidden');
  lucide.createIcons();
}
document.querySelectorAll('.navbtn[data-view]').forEach(b => b.onclick = () => go(b.dataset.view));
document.querySelectorAll('#tabsEst button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabsEst button').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); FILTRO = b.dataset.e; renderAlq();
});
function openReserva() { go('alquileres'); $('reservaCard').scrollIntoView({ behavior: 'smooth' }); }
function openCliente() { $('dlgCli').showModal(); }
function openEquipo() { $('dlgEq').showModal(); }

/* Carga general */
async function load() {
  const [eq, alq, cli, res, venc, deud, cats] = await Promise.all([
    j('/api/equipos'), j('/api/alquileres'), j('/api/clientes'), j('/api/resumen'),
    j('/api/vencimientos'), j('/api/deudores'), j('/api/categorias')
  ]);
  EQ = eq; ALQ = alq; CLI = cli;

  // KPIs
  $('kAct').textContent = res.activos;
  $('kActSub').textContent = res.reservados + ' reservados · ' + res.vencidos + ' vencidos';
  $('kEq').textContent = res.disponibles + ' / ' + res.totalEquipos;
  $('kCash').textContent = money(res.cobradoMes);
  $('kVen').textContent = venc.length;

  // Chart ingresos
  if (chart) chart.destroy();
  chart = new Chart($('chIng'), { type: 'bar',
    data: { labels: res.ingresos.map(i => i.mes), datasets: [{ data: res.ingresos.map(i => i.total), backgroundColor: '#111827', borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });

  // Disponibilidad por categoría
  $('catBars').innerHTML = Object.entries(res.porCategoria).map(([k, v]) => {
    const pct = v.total ? Math.round(v.libres / v.total * 100) : 0;
    return `<div><div class="flex justify-between text-sm"><span>${k}</span><span class="text-gray-500">${v.libres} / ${v.total}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('') || '<span class="text-sm text-gray-500">Sin equipos</span>';

  // Recientes
  $('tRec').innerHTML = `<table class="w-full text-sm"><tr class="text-gray-500"><th class="text-left py-1">Referencia</th><th class="text-left">Cliente</th><th class="text-left">Fechas</th><th class="text-left">Estado</th><th class="text-right">Total</th></tr>` +
    res.recientes.map(a => `<tr class="border-t"><td class="py-2">ALQ-${a.id}</td><td>${a.cliente}</td><td class="text-xs">${a.fecha_retiro_prevista} — ${a.fecha_devolucion_prevista}</td><td>${pill(a.estado)}</td><td class="text-right">${money(a.total_presupuesto)}</td></tr>`).join('') + '</table>';

  // Inventario
  $('fCat').innerHTML = '<option value="">Todas</option>' + cats.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
  $('eCat').innerHTML = cats.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  $('dEq').innerHTML = eq.map(e => `<option value="${e.id}">${e.codigo} · ${e.nombre}</option>`).join('');
  $('rEqs').innerHTML = eq.map(e => `<option value="${e.id}">${e.codigo} · ${e.nombre} (${money(e.precio_dia)}/día) [${e.estado_operativo}]</option>`).join('');
  renderEq();

  // Alquileres + clientes
  renderAlq();
  $('rCli').innerHTML = cli.map(c => `<option value="${c.id}">${c.nombre} (${c.tipo})</option>`).join('');
  $('tCli').innerHTML = `<table class="w-full text-sm"><tr class="text-gray-500"><th class="text-left py-1">Cliente</th><th class="text-left">Tipo</th><th class="text-left">Contacto</th></tr>` +
    cli.map(c => `<tr class="border-t"><td class="py-2 font-medium">${c.nombre}</td><td>${c.tipo}</td><td class="text-xs">${c.whatsapp || ''}</td></tr>`).join('') + '</table>';
  $('tDeud').innerHTML = deud.length ? `<table class="w-full text-sm"><tr class="text-gray-500"><th class="text-left">Ref</th><th class="text-left">Cliente</th><th class="text-right">Saldo</th></tr>` +
    deud.map(r => `<tr class="border-t"><td>ALQ-${r.id}</td><td>${r.cliente}<br><span class="text-xs text-gray-500">presup ${money(r.total_presupuesto)}${r.total_mora ? ' + mora ' + money(r.total_mora) : ''} · pagado ${money(r.pagado)}</span></td><td class="text-right font-semibold text-red-700">${money(r.saldo)}</td></tr>`).join('') + '</table>' : '<span class="text-sm text-gray-500">Sin deudores. A fin de mes esto responde quién debe días o recargos.</span>';
  lucide.createIcons();
}

function renderEq() {
  const c = $('fCat').value, e = $('fEst').value, q = ($('q').value || '').toLowerCase();
  const rows = EQ.filter(x => (!c || x.categoria === c) && (!e || x.estado_operativo === e) &&
    (!q || (x.nombre + ' ' + x.codigo).toLowerCase().includes(q) || document.querySelector('[data-view].active')?.dataset.view !== 'inventario'));
  $('tEq').innerHTML = `<table class="w-full text-sm"><tr class="text-gray-500"><th class="text-left py-1">Equipo</th><th class="text-left">Categoría</th><th class="text-left">Nº de serie</th><th class="text-left">Estado</th><th class="text-right">Tarifa / día</th><th></th></tr>` +
    rows.map(x => `<tr class="border-t"><td class="py-2"><b>${x.nombre}</b><br><span class="text-xs text-gray-500">${x.codigo}</span></td><td>${x.categoria || ''}</td><td class="text-xs">${x.codigo}</td><td>${pill(x.estado_operativo)}</td><td class="text-right">${money(x.precio_dia)}</td>
    <td class="text-right"><button class="text-xs underline" onclick="bloquear(${x.id},'${x.estado_operativo}')">${x.estado_operativo === 'DISPONIBLE' ? 'A mantenimiento' : 'Liberar'}</button></td></tr>`).join('') + '</table>';
}
$('fCat').onchange = renderEq; $('fEst').onchange = renderEq;

function renderAlq() {
  const q = ($('q').value || '').toLowerCase();
  const rows = ALQ.filter(a => (!FILTRO || a.estado === FILTRO) && (!q || (a.cliente + ' ALQ-' + a.id).toLowerCase().includes(q)));
  $('tAlq').innerHTML = `<table class="w-full text-sm"><tr class="text-gray-500"><th class="text-left py-1">Referencia</th><th class="text-left">Cliente</th><th class="text-left">Equipos</th><th class="text-left">Período</th><th class="text-left">Estado</th><th class="text-right">Total</th></tr>` +
    rows.map(a => `<tr class="border-t"><td class="py-2">ALQ-${a.id}</td><td>${a.cliente}</td><td class="text-xs">${a.equipos.map(x => x.nombre).join(', ')}</td><td class="text-xs">${a.fecha_retiro_prevista} — ${a.fecha_devolucion_prevista}</td><td>${pill(a.estado)}</td><td class="text-right">${money(a.total_presupuesto + (a.total_mora || 0))}</td></tr>`).join('') + '</table>';
}
$('q').oninput = () => { renderEq(); renderAlq(); };

/* Operaciones (enunciado) */
async function verDisp() {
  const r = await j(`/api/disponibilidad?equipo_id=${$('dEq').value}&inicio=${$('dIni').value}&fin=${$('dFin').value}`);
  $('dRes').innerHTML = r.libre ? pill('DISPONIBLE') + ' Libre' : pill('VENCIDO') + ' ' + (r.motivo || '');
}
async function reservar() {
  const eqs = [...$('rEqs').selectedOptions].map(o => +o.value);
  const r = await j('/api/alquileres', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente_id: +$('rCli').value, inicio: $('rIni').value, fin: $('rFin').value, equipo_ids: eqs, garantia: { tipo: $('rGar').value, detalle: 'mostrador', monto: 0 } }) });
  $('rRes').textContent = r.ok ? `OK ALQ-${r.alquiler_id} · ${r.dias} días · total ${money(r.total)}` : ('Error: ' + (r.error || '?'));
  if (r.ok) { $('rTot').textContent = ''; load(); }
}
async function retiro() {
  const r = await j('/api/alquileres/' + $('mAlq').value + '/retiro', { method: 'POST' });
  $('mRes').textContent = r.ok ? 'Retirado (check-out). Equipos → ALQUILADO.' : ('Error: ' + r.error); load();
}
async function devol() { return checkin(false); }
async function marcarDanado() { return checkin(true); }
async function checkin(danado) {
  const alq = ALQ.find(a => a.id === +$('mAlq').value);
  const map = {};
  (alq?.equipos || []).forEach(() => {});
  // Pedimos detalle para mapear equipo_id -> estado
  const det = alq ? await j('/api/alquileres/' + alq.id) : null;
  (det?.detalle || []).forEach(d => map[d.equipo_id] = danado ? 'DANADO' : 'DISPONIBLE');
  const r = await j('/api/alquileres/' + $('mAlq').value + '/devolucion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado_equipos: map }) });
  $('mRes').textContent = r.ok ? `Devuelto. Mora: ${money(r.mora_calculada)}${danado ? ' · equipo → MANTENIMIENTO' : ''}` : ('Error: ' + r.error); load();
}
async function prorroga() {
  const r = await j('/api/alquileres/' + $('mAlq').value + '/prorroga', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nueva_fin: $('mPro').value }) });
  $('mRes').textContent = r.ok ? `Prórroga OK · nuevo total ${money(r.total)}` : ('Error: ' + r.error); load();
}
async function bloquear(id, est) {
  const nuevo = est === 'DISPONIBLE' ? 'MANTENIMIENTO' : 'DISPONIBLE';
  await j('/api/equipos/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipo_id: id, estado: nuevo, observacion: 'panel' }) });
  load();
}
async function crearCliente() {
  const r = await j('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: $('cNom').value, tipo: $('cTip').value, whatsapp: $('cWsp').value }) });
  $('dlgCli').close(); load();
}
async function crearEquipo() {
  const r = await j('/api/equipos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: $('eCod').value, nombre: $('eNom').value, categoria_id: +$('eCat').value, precio_dia: +$('ePre').value }) });
  if (r.error) alert(r.error); else { $('dlgEq').close(); load(); }
}
async function verSaldo() {
  const r = await j('/api/alquileres/' + $('pAlq').value);
  $('rPago').innerHTML = r.error ? r.error : `ALQ-${r.id} · presup ${money(r.total_presupuesto)} + mora ${money(r.total_mora || 0)} − pagado ${money(r.pagado)} = <b>saldo ${money(r.saldo)}</b> (${r.estado})<br><span class="text-gray-500 text-xs">Garantía: ${(r.garantias || []).map(g => g.tipo).join(', ') || '—'} · Pagos: ${(r.pagos || []).map(p => p.tipo + ' ' + money(p.monto)).join(' · ') || '—'}</span>`;
}
async function pagar() {
  await j('/api/pagos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alquiler_id: +$('pAlq').value, tipo: $('pTipo').value, monto: +$('pMonto').value }) });
  verSaldo(); load();
}

/* Estimar total al elegir equipos/fechas */
$('rEqs').onchange = $('rIni').onchange = $('rFin').onchange = () => {
  const dias = ($('rIni').value && $('rFin').value) ? Math.max(1, Math.round((new Date($('rFin').value) - new Date($('rIni').value)) / 86400000) + 1) : 0;
  const eqs = [...$('rEqs').selectedOptions].map(o => EQ.find(e => e.id === +o.value)).filter(Boolean);
  $('rTot').textContent = dias && eqs.length ? `Estimado: ${dias} días · ${money(eqs.reduce((s, e) => s + Number(e.precio_dia), 0) * dias)}` : '';
};

load();
