// RentaVisión · frontend conectado al backend real (/api/*)
const j = async (u, o) => (await fetch(u, o)).json();
const $ = id => document.getElementById(id);
const money = n => '$' + Number(n || 0).toLocaleString('es-AR');
const pill = s => `<span class="pill p-${s}">${s}</span>`;
let EQ = [], ALQ = [], CLI = [], KITS = [], FILTRO = '';
let KITS_SEL = [];
let EQ_SEL = [];
let chart = null;

/* Navegación */
function go(v) {
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  ['panel', 'inventario', 'kits', 'alquileres', 'clientes'].forEach(x => {
    const el = $('view-' + x);
    el.classList.add('hidden'); el.classList.remove('flex');
  });
  const cur = $('view-' + v);
  cur.classList.remove('hidden');
  if (v !== 'panel') cur.classList.add('flex');
  $('viewTitle').textContent = { panel: 'Panel', inventario: 'Inventario', kits: 'Kits', alquileres: 'Alquileres', clientes: 'Clientes' }[v];
  $('viewSub').textContent = {
    panel: 'Resumen de la operación de alquileres',
    inventario: 'Catálogo de equipos audiovisuales',
    kits: 'Kits promocionales y disponibilidad en cadena',
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
  const [eq, alq, cli, res, venc, deud, cats, kits] = await Promise.all([
    j('/api/equipos'), j('/api/alquileres'), j('/api/clientes'), j('/api/resumen'),
    j('/api/vencimientos'), j('/api/deudores'), j('/api/categorias'), j('/api/kits')
  ]);
  EQ = eq; ALQ = alq; CLI = cli; KITS = kits;

  // KPIs
  $('kAct').textContent = res.activos;
  $('kActSub').textContent = res.reservados + ' reservados · ' + res.vencidos + ' vencidos';
  $('kEq').textContent = res.disponibles + ' / ' + res.totalEquipos;
  $('kCash').textContent = money(res.cobradoMes);
  $('kVen').textContent = venc.length;
  $('kKit').textContent = kits.filter(k => k.completo).length + ' / ' + kits.length;

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
  $('rKit').innerHTML = kits.map(k => `<option value="${k.id}">${k.codigo} · ${k.nombre} (${money(k.precio_calculado)}/día)</option>`).join('');
  renderEq();
  renderKits();
  renderEqList();
  renderEqSel();
  renderLineas();

  // Alquileres + clientes
  renderAlq();
  $('rCli').innerHTML = cli.map(c => `<option value="${c.id}">${c.nombre} (${c.tipo})</option>`).join('');
  $('tCli').innerHTML = `<table class="w-full text-sm"><tr class="text-gray-500"><th class="text-left py-1">Cliente</th><th class="text-left">Tipo</th><th class="text-left">Contacto</th></tr>` +
    cli.map(c => `<tr class="border-t"><td class="py-2 font-medium">${c.nombre}</td><td>${c.tipo}</td><td class="text-xs">${c.whatsapp || ''}</td></tr>`).join('') + '</table>';
  $('tDeud').innerHTML = deud.length ? `<table class="w-full text-sm"><tr class="text-gray-500"><th class="text-left">Ref</th><th class="text-left">Cliente</th><th class="text-right">Saldo</th></tr>` +
    deud.map(r => `<tr class="border-t"><td>ALQ-${r.id}</td><td>${r.cliente}<br><span class="text-xs text-gray-500">presup ${money(r.total_presupuesto)}${r.total_mora ? ' + mora ' + money(r.total_mora) : ''} · pagado ${money(r.pagado)}</span></td><td class="text-right font-semibold text-red-700">${money(r.saldo)}</td></tr>`).join('') + '</table>' : '<span class="text-sm text-gray-500">Sin deudores. A fin de mes esto responde quién debe días o recargos.</span>';
  lucide.createIcons();
}

/* Búsqueda ágil: texto dedicado por sección + global del topbar, con debounce */
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function vistaActual() { return document.querySelector('.navbtn.active')?.dataset.view || 'panel'; }
function textoEq() { const t = ($('qEq').value || '').trim().toLowerCase(); if (t) return t; return vistaActual() === 'inventario' ? ($('q').value || '').trim().toLowerCase() : ''; }
function textoAlq() { const t = ($('qAlq').value || '').trim().toLowerCase(); if (t) return t; return vistaActual() === 'alquileres' ? ($('q').value || '').trim().toLowerCase() : ''; }

function renderEq() {
  const c = $('fCat').value, e = $('fEst').value, q = textoEq();
  const rows = EQ.filter(x => (!c || x.categoria === c) && (!e || x.estado_operativo === e) &&
    (!q || (x.nombre + ' ' + x.codigo + ' ' + (x.categoria || '')).toLowerCase().includes(q)));
  $('nEq').textContent = rows.length + ' de ' + EQ.length;
  $('tEq').innerHTML = `<table class="w-full text-sm"><tr class="text-gray-500"><th class="text-left py-1">Equipo</th><th class="text-left">Modelo</th><th class="text-left">Categoría</th><th class="text-left">Estado</th><th class="text-right">Tarifa / día</th><th></th></tr>` +
    rows.map(x => `<tr class="border-t"><td class="py-2"><b>${x.nombre}</b><br><span class="text-xs text-gray-500">${x.codigo}</span></td><td class="text-xs">${x.modelo || '—'}</td><td>${x.categoria || ''}</td><td>${pill(x.estado_operativo)}</td><td class="text-right">${money(x.precio_dia)}</td>
    <td class="text-right whitespace-nowrap"><button class="text-xs underline mr-2" onclick="consultar(${x.id})">Consultar</button><button class="text-xs underline" onclick="bloquear(${x.id},'${x.estado_operativo}')">${x.estado_operativo === 'DISPONIBLE' ? 'A mantenimiento' : 'Liberar'}</button></td></tr>`).join('') + '</table>';
}
$('fCat').onchange = renderEq; $('fEst').onchange = renderEq;
$('qEq').oninput = debounce(renderEq, 150);

function renderAlq() {
  const q = textoAlq();
  const rows = ALQ.filter(a => (!FILTRO || a.estado === FILTRO) &&
    (!q || ('ALQ-' + a.id + ' ' + a.cliente + ' ' + a.equipos.map(x => x.nombre + ' ' + (x.kit || '')).join(' ') + ' ' + a.estado).toLowerCase().includes(q)));
  $('nAlq').textContent = rows.length + ' de ' + ALQ.length;
  $('tAlq').innerHTML = `<table class="w-full text-sm"><tr class="text-gray-500"><th class="text-left py-1">Referencia</th><th class="text-left">Cliente</th><th class="text-left">Equipos</th><th class="text-left">Período</th><th class="text-left">Estado</th><th class="text-right">Total</th><th></th></tr>` +
    rows.map(a => {
      // agrupar por kit para mostrar "Kit X (n equipos)"
      const grupos = new Map();
      for (const e of a.equipos) {
        const k = e.kit || 'Sueltos';
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(e.nombre);
      }
      const eqTxt = [...grupos.entries()].map(([k, v]) => v.length > 1 ? `<b>${k}</b> (${v.length} eq.)` : v[0]).join(' · ');
      return `<tr class="border-t"><td class="py-2">ALQ-${a.id}</td><td>${a.cliente}</td><td class="text-xs">${eqTxt}</td><td class="text-xs">${a.fecha_retiro_prevista} — ${a.fecha_devolucion_prevista}</td><td>${pill(a.estado)}</td><td class="text-right">${money(a.total_presupuesto + (a.total_mora || 0))}</td>
    <td class="text-right"><button class="text-xs underline" onclick="verAlq(${a.id})">Operar</button></td></tr>`;
    }).join('') + '</table>';
}
$('q').oninput = debounce(() => { renderEq(); renderAlq(); }, 150);
$('qAlq').oninput = debounce(renderAlq, 150);

/* ---------- KITS ---------- */
function renderKits() {
  const ini = $('kIni').value, fin = $('kFin').value;
  const usarFechas = ini && fin;
  $('tKits').innerHTML = `<table class="w-full text-sm"><tr class="text-gray-500"><th class="text-left py-1">Kit</th><th class="text-left">Componentes</th><th class="text-right">Precio / dia</th><th class="text-left">Estado</th><th></th></tr>` +
    KITS.map(k => {
      const desglose = k.desglose.map(d => `${d.cantidad}x ${d.equipo} <span class="text-gray-500">(${d.unidades_libres}/${d.unidades_totales} libres)</span>`).join('<br>');
      const estado = usarFechas
        ? (k.completo ? pill('DISPONIBLE') : pill('VENCIDO') + ' bloqueado')
        : '<span class="text-gray-500">sin rango</span>';
      return `<tr class="border-t"><td class="py-2"><b>${k.nombre}</b><br><span class="text-xs text-gray-500">${k.codigo}</span></td>
        <td class="text-xs">${desglose}</td><td class="text-right">${money(k.precio_calculado)}</td><td>${estado}</td>
        <td class="text-right"><button class="text-xs underline" onclick="conflictosKit(${k.id})">Conflictos</button></td></tr>`;
    }).join('') + '</table>';
}
async function verKits() {
  const ini = $('kIni').value, fin = $('kFin').value;
  if (!ini || !fin) { alert('Elegi el rango de fechas para consultar la disponibilidad de los kits'); return; }
  KITS = await j(`/api/kits?inicio=${ini}&fin=${fin}`);
  renderKits();
}
async function conflictosKit(id) {
  const ini = $('kIni').value, fin = $('kFin').value;
  if (!ini || !fin) { alert('Elegi el rango de fechas para ver los conflictos'); return; }
  const d = await j(`/api/kits/${id}/disponibilidad?inicio=${ini}&fin=${fin}`);
  if (d.libre) { alert(`Kit disponible del ${ini} al ${fin}`); return; }
  const msg = d.conflictos.map(c => `• ${c.equipo} (${c.codigo})\n  motivo: ${c.motivo}${c.rango ? '\n  rango: ' + c.rango : ''}${c.cliente ? '\n  cliente: ' + c.cliente : ''}`).join('\n\n');
  alert('Kit BLOQUEADO\n\n' + msg);
}

/* ---------- Lineas de la reserva (equipos sueltos + kits) ---------- */
function renderEqList() {
  const q = ($('rEqSearch').value || '').trim().toLowerCase();
  const rows = EQ.filter(e => !q || (e.nombre + ' ' + e.codigo + ' ' + (e.categoria || '')).toLowerCase().includes(q));
  $('rEqList').innerHTML = rows.length ? rows.map(e => {
    const sel = EQ_SEL.includes(e.id);
    const noDisp = e.estado_operativo !== 'DISPONIBLE';
    return `<button class="w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-[#dcc99c] ${sel ? 'bg-[#e0cfa8]' : ''}" onclick="toggleEq(${e.id})">
      <span class="w-3 h-3 rounded border flex items-center justify-center">${sel ? '✓' : ''}</span>
      <span class="flex-1 truncate">${e.nombre} <span class="text-xs text-gray-500">${e.codigo}</span></span>
      <span class="text-xs">${money(e.precio_dia)}/d</span>
      ${noDisp ? '<span class="pill p-' + e.estado_operativo + '">' + e.estado_operativo + '</span>' : ''}
    </button>`;
  }).join('') : '<div class="p-2 text-xs text-gray-500">Sin resultados</div>';
}
function toggleEq(id) {
  const i = EQ_SEL.indexOf(id);
  if (i >= 0) EQ_SEL.splice(i, 1); else EQ_SEL.push(id);
  renderEqList(); renderEqSel(); estimar();
}function renderEqSel() {
  $('rEqSel').innerHTML = EQ_SEL.map(id => {
    const e = EQ.find(x => x.id === id);
    if (!e) return '';
    return `<span class="inline-flex items-center gap-1 bg-[#e0cfa8] rounded-lg px-2 py-0.5 text-xs">${e.nombre}
      <button class="underline" onclick="toggleEq(${id})">x</button></span>`;
  }).join('');
}
$('rEqSearch').oninput = renderEqList;

function agregarKit() {
  const id = +$('rKit').value, cant = Math.max(1, +$('rKitCant').value || 1);
  if (!id) return;
  KITS_SEL.push({ kit_id: id, cantidad: cant });
  renderLineas();
  estimar();
}
function quitarKit(i) { KITS_SEL.splice(i, 1); renderLineas(); estimar(); }
function renderLineas() {
  const box = $('rLineas');
  if (!KITS_SEL.length) { box.innerHTML = '<span class="text-xs text-gray-600">Sin kits agregados. Un kit se reserva entero: si un componente choca, se bloquea todo.</span>'; return; }
  box.innerHTML = KITS_SEL.map((k, i) => {
    const kit = KITS.find(x => x.id === k.kit_id);
    const comp = kit ? kit.desglose.map(d => `${d.cantidad}x ${d.equipo}`).join(', ') : '';
    return `<div class="flex items-center gap-2 bg-[#ead9b6] rounded-lg px-2 py-1">
      <b>${kit ? kit.nombre : 'Kit'}</b> x${k.cantidad}
      <span class="text-xs text-gray-600">${comp}</span>
      <button class="ml-auto text-xs underline" onclick="quitarKit(${i})">quitar</button></div>`;
  }).join('');
}
// Desglose del kit seleccionado (para que el mostrador vea que lleva antes de agregar)
$('rKit').onchange = () => {
  const kit = KITS.find(x => x.id === +$('rKit').value);
  $('rKitDesglose').innerHTML = kit
    ? 'Incluye: ' + kit.desglose.map(d => `${d.cantidad}x ${d.equipo} <span class="text-gray-500">(${d.unidades_libres}/${d.unidades_totales} libres)</span>`).join(' · ')
      + ` · ${money(kit.precio_calculado)}/día`
    : '';
  estimar();
};
// Estimacion de precio
function estimar() {
  const dias = ($('rIni').value && $('rFin').value) ? Math.max(1, Math.round((new Date($('rFin').value) - new Date($('rIni').value)) / 86400000) + 1) : 0;
  let total = EQ_SEL.reduce((s, id) => { const e = EQ.find(x => x.id === id); return s + (e ? Number(e.precio_dia) : 0); }, 0);
  for (const k of KITS_SEL) {
    const kit = KITS.find(x => x.id === k.kit_id);
    if (kit) total += Number(kit.precio_calculado) * k.cantidad;
  }
  $('rTot').textContent = (dias && total) ? `Estimado: ${dias} días · ${money(total * dias)}` : '';
}
function consultar(equipoId) {
  go('inventario');
  $('dEq').value = equipoId;
  if (!$('dIni').value) $('dIni').value = new Date().toISOString().slice(0, 10);
  if (!$('dFin').value) $('dFin').value = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  verDisp();
  $('dEq').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function verAlq(id) {
  $('mAlq').value = id;
  $('reservaCard').scrollIntoView({ behavior: 'smooth' });
}

/* Operaciones (enunciado) */
async function verDisp() {
  const r = await j(`/api/disponibilidad?equipo_id=${$('dEq').value}&inicio=${$('dIni').value}&fin=${$('dFin').value}`);
  $('dRes').innerHTML = r.libre ? pill('DISPONIBLE') + ' Libre' : pill('VENCIDO') + ' ' + (r.motivo || '');
}
async function reservar() {
  const r = await j('/api/alquileres', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente_id: +$('rCli').value, inicio: $('rIni').value, fin: $('rFin').value,
      equipo_ids: EQ_SEL, kits: KITS_SEL, garantia: { tipo: $('rGar').value, detalle: 'mostrador', monto: 0 } }) });
  if (r.ok) {
    $('rRes').textContent = `OK ALQ-${r.alquiler_id} · ${r.dias} días · ${r.equipos} equipos · total ${money(r.total)}`;
    KITS_SEL = []; EQ_SEL = [];
    renderLineas(); renderEqSel(); renderEqList();
    load();
  } else {
    $('rRes').textContent = 'Error: ' + (r.error || '?');
    if (r.conflictos && r.conflictos.length) {
      const detalle = r.conflictos.map(c => `${c.equipo} (${c.codigo}): ${c.motivo}${c.rango ? ' [' + c.rango + ']' : ''}`).join(' | ');
      $('rRes').innerHTML = '<span class="text-red-700">Kit bloqueado → ' + detalle + '</span>';
    }
  }
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
  if (r.error) { $('rPago').textContent = r.error; return; }
  const detalle = (r.detalle || []).map(d => `<div class="flex justify-between text-xs border-b py-1">
    <span>${d.equipo} ${d.kit ? '<b class="text-gray-600">(' + d.kit + ')</b>' : ''}</span>
    <span>${money(d.subtotal)}</span></div>`).join('');
  $('rPago').innerHTML = `ALQ-${r.id} · presup ${money(r.total_presupuesto)} + mora ${money(r.total_mora || 0)} − pagado ${money(r.pagado)} = <b>saldo ${money(r.saldo)}</b> (${r.estado})
    <br><span class="text-gray-500 text-xs">Garantía: ${(r.garantias || []).map(g => g.tipo).join(', ') || '—'} · Pagos: ${(r.pagos || []).map(p => p.tipo + ' ' + money(p.monto)).join(' · ') || '—'}</span>
    <div class="mt-2">${detalle}</div>`;
}
async function pagar() {
  await j('/api/pagos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alquiler_id: +$('pAlq').value, tipo: $('pTipo').value, monto: +$('pMonto').value }) });
  verSaldo(); load();
}

/* Estimar total al elegir equipos/fechas */
$('rIni').onchange = $('rFin').onchange = () => estimar();
$('rEqSearch').oninput = renderEqList;

load();
