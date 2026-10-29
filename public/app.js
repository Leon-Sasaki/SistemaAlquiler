// RentaVisión · frontend conectado al backend real (/api/*)
// Listados paginados desde el servidor + validaciones con feedback en pantalla.

/* ---------------- helpers ---------------- */
const $ = id => document.getElementById(id);
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n || 0).toLocaleString('es-AR');
const pill = s => `<span class="pill p-${esc(s)}">${esc(s)}</span>`;
const aviso = msg => `<div class="text-sm text-[#fca5a5] p-2">${esc(msg)}</div>`;
const vacio = (cols, msg) => `<tr><td colspan="${cols}" class="py-3 text-sm text-[#94a3b8]">${esc(msg)}</td></tr>`;

// fetch que nunca lanza: devuelve el JSON o { error } para poder mostrarlo.
const j = async (url, opts) => {
  try {
    const r = await fetch(url, opts);
    const d = await r.json().catch(() => null);
    if (!d) return { error: 'Respuesta inválida del servidor (' + r.status + ')' };
    if (!r.ok && !d.error) d.error = 'Error HTTP ' + r.status;
    return d;
  } catch (e) {
    return { error: 'Sin conexión con el servidor: ' + e.message };
  }
};

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function isoLocal(d) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function hoyISO() { return isoLocal(new Date()); }

/* ---------------- estado ---------------- */
let EQ = [];          // catálogo liviano completo (selectores, lupa, precios)
let ALQ = [];         // página actual de alquileres
let CLI = [];         // página actual de clientes
let DEUD = [];        // página actual de deudores
let KITS = [];        // página actual de kits
let INV = [];         // página actual de inventario
let CLI_TODOS = [];   // clientes para el select de reserva
let KITS_TODOS = [];  // kits para el select de reserva y el cálculo de precios
let MODELOS = [];
let CATS = [];
let FILTRO = '';
let KITS_SEL = [];
let EQ_SEL = [];
let COMP = [];
let chart = null;

const PAG = {
  equipos:     { page: 1, limit: 10, total: 0, pages: 0, desde: 0, hasta: 0 },
  alquileres:  { page: 1, limit: 10, total: 0, pages: 0, desde: 0, hasta: 0 },
  clientes:    { page: 1, limit: 8,  total: 0, pages: 0, desde: 0, hasta: 0 },
  kits:        { page: 1, limit: 6,  total: 0, pages: 0, desde: 0, hasta: 0 },
  deudores:    { page: 1, limit: 5,  total: 0, pages: 0, desde: 0, hasta: 0 }
};

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
  $('sidebar').classList.add('hidden');
  if (window.innerWidth >= 768) $('sidebar').classList.remove('hidden');
  lucide.createIcons();
}
document.querySelectorAll('.navbtn[data-view]').forEach(b => b.onclick = () => go(b.dataset.view));
document.querySelectorAll('#tabsEst button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabsEst button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  FILTRO = b.dataset.e;
  PAG.alquileres.page = 1;
  cargarAlquileres();
});
function openReserva() { go('alquileres'); $('reservaCard').scrollIntoView({ behavior: 'smooth' }); }
function openCliente() { limpiarAviso('cErr', ['cNom', 'cWsp']); $('dlgCli').showModal(); }
function openEquipo() { limpiarAviso('eErr', ['eCod', 'eNom', 'ePre']); $('dlgEq').showModal(); }

/* ---------------- paginación ---------------- */
const PAGERS = {
  equipos:    { el: 'pEq',    fn: () => cargarEquipos() },
  alquileres: { el: 'pAlq',   fn: () => cargarAlquileres() },
  clientes:   { el: 'pCli',   fn: () => cargarClientes() },
  kits:       { el: 'pKits',  fn: () => cargarKits() },
  deudores:   { el: 'pDeud',  fn: () => cargarDeudores() }
};

// Copia la metadata de paginación. Devuelve false si hay que reintentar en la última página.
function aplicarPagina(key, d) {
  if (!d || !d.paginacion || !Array.isArray(d.items)) throw new Error('Respuesta inválida del servidor');
  const p = PAG[key];
  p.total = d.paginacion.total;
  p.pages = d.paginacion.pages;
  p.page = d.paginacion.page;
  p.desde = d.paginacion.desde;
  p.hasta = d.paginacion.hasta;
  if (!d.items.length && p.total > 0 && p.page > 1) { p.page = p.pages; return false; }
  return true;
}

function renderPager(key) {
  const cont = $(PAGERS[key].el);
  if (!cont) return;
  const p = PAG[key];
  if (!p.total) { cont.innerHTML = '<span class="text-xs text-[#94a3b8]">Sin registros</span>'; return; }
  if (p.pages <= 1) {
    cont.innerHTML = `<div class="mt-3"><span class="text-xs text-[#94a3b8]">${p.total} registro${p.total === 1 ? '' : 's'}</span></div>`;
    return;
  }
  const btn = (label, page, activo, disabled) =>
    `<button class="tabbtn ${activo ? 'active' : ''}" ${disabled ? 'disabled' : ''} onclick="irPagina('${key}',${page})">${label}</button>`;
  const nums = [];
  const desde = Math.max(1, p.page - 2);
  const hasta = Math.min(p.pages, p.page + 2);
  if (desde > 1) nums.push(btn('1', 1, false, false));
  if (desde > 2) nums.push('<span class="text-xs text-[#64748b] px-1">…</span>');
  for (let i = desde; i <= hasta; i++) nums.push(btn(String(i), i, i === p.page, false));
  if (hasta < p.pages - 1) nums.push('<span class="text-xs text-[#64748b] px-1">…</span>');
  if (hasta < p.pages) nums.push(btn(String(p.pages), p.pages, false, false));
  cont.innerHTML = `<div class="flex flex-wrap items-center gap-1.5 mt-3">
    <span class="text-xs text-[#94a3b8] mr-2">${p.desde}–${p.hasta} de ${p.total}</span>
    ${btn('‹', p.page - 1, false, p.page === 1)}
    ${nums.join('')}
    ${btn('›', p.page + 1, false, p.page === p.pages)}
  </div>`;
}

async function irPagina(key, page) {
  const p = PAG[key];
  const destino = Math.min(Math.max(1, Number(page) || 1), Math.max(1, p.pages));
  if (destino === p.page) return;
  p.page = destino;
  await PAGERS[key].fn();
}

/* ---------------- carga general ---------------- */
const IDS_REQUERIDOS = ['kAct', 'kActSub', 'kEq', 'kCash', 'kKit', 'kVen', 'chIng', 'catBars',
  'tRec', 'fCat', 'fEst', 'nEq', 'eCat', 'dEq', 'rKit', 'rKitCant', 'rKitDesglose', 'rCli', 'tCli',
  'tDeud', 'tEq', 'tAlq', 'tKits', 'rEqSearch', 'rEqList', 'rEqSel', 'rLineas', 'qEq', 'q', 'qAlq',
  'nAlq', 'dIni', 'dFin', 'mAlq', 'mPro', 'mRes', 'pAlqId', 'pTipo', 'pMonto', 'rPago', 'rRes', 'rTot',
  'rIni', 'rFin', 'rGar', 'rFechas', 'rDias', 'rEqCount', 'kIni', 'kFin', 'kMod', 'kCant', 'kComp', 'eCod', 'eNom', 'eMod', 'ePre',
  'cNom', 'cTip', 'cWsp', 'kCod', 'kNom', 'kDesc', 'kPre', 'sidebar', 'viewTitle', 'viewSub',
  'reservaCard', 'tabsEst', 'dlgCli', 'dlgEq', 'dlgKit', 'pEq', 'pAlq', 'pCli', 'pKits', 'pDeud'];

async function load() {
  try {
    await loadDatos();
  } catch (e) {
    console.error('Error cargando la aplicacion:', e);
    const b = document.createElement('div');
    b.className = 'fixed bottom-4 right-4 z-50 bg-[#4c1d24] text-[#fca5a5] rounded-lg p-3 text-sm max-w-md';
    b.textContent = 'Error cargando la aplicación: ' + e.message;
    document.body.appendChild(b);
  }
}

async function loadDatos() {
  const faltantes = IDS_REQUERIDOS.filter(id => !$(id));
  if (faltantes.length) console.error('IDs faltantes en el HTML (la app se va a romper):', faltantes);

  const [eqTodos, cliTodos, kitsTodos, cats, modelos, res, venc] = await Promise.all([
    j('/api/equipos/todos'), j('/api/clientes/todos'), j('/api/kits/todos'),
    j('/api/categorias'), j('/api/modelos'), j('/api/resumen'),
    j('/api/vencimientos?page=1&limit=1')
  ]);
  const fallo = [eqTodos, cliTodos, kitsTodos, cats, modelos, res, venc].find(x => x && x.error);
  if (fallo) throw new Error(fallo.error);
  if (!Array.isArray(eqTodos) || !Array.isArray(cliTodos) || !Array.isArray(kitsTodos) ||
      !Array.isArray(cats) || !Array.isArray(modelos)) throw new Error('Listas inválidas del servidor');

  EQ = eqTodos; CLI_TODOS = cliTodos; KITS_TODOS = kitsTodos; MODELOS = modelos; CATS = cats;

  renderPanel(res, venc);

  $('fCat').innerHTML = '<option value="">Todas</option>' +
    CATS.map(c => `<option value="${esc(c.nombre)}">${esc(c.nombre)}</option>`).join('');
  $('eCat').innerHTML = CATS.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  $('dEq').innerHTML = EQ.map(e => `<option value="${e.id}">${esc(e.codigo)} · ${esc(e.nombre)}</option>`).join('');
  $('rCli').innerHTML = CLI_TODOS.map(c => `<option value="${c.id}">${esc(c.nombre)} (${esc(c.tipo)})</option>`).join('');

  renderKitSelect();
  renderFechas();
  renderEqList();
  renderEqSel();
  renderLineas();
  estimar();
  // Si el formulario ya tenía fechas elegidas, se refresca la disponibilidad con ese rango.
  if (hayFechas()) await actualizarDisponibilidad();

  await Promise.all([
    cargarEquipos(), cargarAlquileres(), cargarClientes(), cargarDeudores(), cargarKits()
  ]);
  lucide.createIcons();
}

function renderPanel(res, venc) {
  $('kAct').textContent = res.activos;
  $('kActSub').textContent = res.reservados + ' reservados · ' + res.vencidos + ' vencidos';
  $('kEq').textContent = res.disponibles + ' / ' + res.totalEquipos;
  $('kCash').textContent = money(res.cobradoMes);
  $('kVen').textContent = (venc.paginacion && venc.paginacion.total) || 0;
  const listos = KITS_TODOS.filter(k => k.completo).length;
  $('kKit').textContent = listos + ' / ' + KITS_TODOS.length;

  // Chart (si el CDN no carga, la app sigue funcionando)
  try {
    if (chart) chart.destroy();
    chart = new Chart($('chIng'), {
      type: 'bar',
      data: {
        labels: res.ingresos.map(i => i.mes),
        datasets: [{ data: res.ingresos.map(i => i.total), backgroundColor: '#818cf8', borderRadius: 6 }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
          x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
        }
      }
    });
  } catch (e) { console.warn('Gráfico no disponible:', e.message); }

  $('catBars').innerHTML = Object.entries(res.porCategoria).map(([k, v]) => {
    const pct = v.total ? Math.round(v.libres / v.total * 100) : 0;
    return `<div><div class="flex justify-between text-sm"><span>${esc(k)}</span><span class="text-[#94a3b8]">${v.libres} / ${v.total}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('') || '<span class="text-sm text-[#94a3b8]">Sin equipos</span>';

  $('tRec').innerHTML = `<table class="w-full text-sm"><tr class="text-[#94a3b8]"><th class="text-left py-1">Referencia</th><th class="text-left">Cliente</th><th class="text-left">Fechas</th><th class="text-left">Estado</th><th class="text-right">Total</th></tr>` +
    (res.recientes.length ? res.recientes.map(a =>
      `<tr class="border-t"><td class="py-2">ALQ-${a.id}</td><td>${esc(a.cliente)}</td><td class="text-xs">${esc(a.fecha_retiro_prevista)} — ${esc(a.fecha_devolucion_prevista)}</td><td>${pill(a.estado)}</td><td class="text-right">${money(a.total_presupuesto)}</td></tr>`
    ).join('') : vacio(5, 'Todavía no hay alquileres cargados'));
}

/* ---------------- búsqueda ---------------- */
function vistaActual() { return document.querySelector('.navbtn.active')?.dataset.view || 'panel'; }
function busqueda(idLocal, vista) {
  if (idLocal) { const t = ($(idLocal).value || '').trim(); if (t) return t; }
  return vistaActual() === vista ? ($('q').value || '').trim() : '';
}

/* ---------------- INVENTARIO ---------------- */
async function cargarEquipos() {
  const p = PAG.equipos;
  const params = new URLSearchParams({ page: p.page, limit: p.limit });
  const q = busqueda('qEq', 'inventario');
  if (q) params.set('q', q);
  if ($('fCat').value) params.set('categoria', $('fCat').value);
  if ($('fEst').value) params.set('estado', $('fEst').value);

  const d = await j('/api/equipos?' + params.toString());
  if (d.error) { $('tEq').innerHTML = aviso(d.error); return; }
  if (!aplicarPagina('equipos', d)) return cargarEquipos();
  INV = d.items;
  renderEq();
}

function renderEq() {
  $('nEq').textContent = PAG.equipos.total + ' equipos';
  $('tEq').innerHTML = `<table class="w-full text-sm"><tr class="text-[#94a3b8]"><th class="text-left py-1">Equipo</th><th class="text-left">Modelo</th><th class="text-left">Categoría</th><th class="text-left">Estado</th><th class="text-right">Tarifa / día</th><th></th></tr>` +
    (INV.length ? INV.map(x =>
      `<tr class="border-t"><td class="py-2"><b>${esc(x.nombre)}</b><br><span class="text-xs text-[#94a3b8]">${esc(x.codigo)}</span></td><td class="text-xs">${esc(x.modelo || '—')}</td><td>${esc(x.categoria || '')}</td><td>${pill(x.estado_operativo)}</td><td class="text-right">${money(x.precio_dia)}</td>
      <td class="text-right whitespace-nowrap"><button class="text-xs underline mr-2" onclick="consultar(${x.id})">Consultar</button><button class="text-xs underline" onclick="bloquear(${x.id},'${esc(x.estado_operativo)}')">${x.estado_operativo === 'DISPONIBLE' ? 'A mantenimiento' : 'Liberar'}</button></td></tr>`
    ).join('') : vacio(6, 'Sin equipos para esos filtros'));
  renderPager('equipos');
}

/* ---------------- ALQUILERES ---------------- */
async function cargarAlquileres() {
  const p = PAG.alquileres;
  const params = new URLSearchParams({ page: p.page, limit: p.limit });
  const q = busqueda('qAlq', 'alquileres');
  if (q) params.set('q', q);
  if (FILTRO) params.set('estado', FILTRO);

  const d = await j('/api/alquileres?' + params.toString());
  if (d.error) { $('tAlq').innerHTML = aviso(d.error); return; }
  if (!aplicarPagina('alquileres', d)) return cargarAlquileres();
  ALQ = d.items;
  renderAlq();
}

function renderAlq() {
  $('nAlq').textContent = PAG.alquileres.total + ' alquileres';
  $('tAlq').innerHTML = `<table class="w-full text-sm"><tr class="text-[#94a3b8]"><th class="text-left py-1">Referencia</th><th class="text-left">Cliente</th><th class="text-left">Equipos</th><th class="text-left">Período</th><th class="text-left">Estado</th><th class="text-right">Total</th><th></th></tr>` +
    (ALQ.length ? ALQ.map(a => {
      const grupos = new Map();
      for (const e of a.equipos) {
        const k = e.kit || 'Sueltos';
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(e.nombre);
      }
      const eqTxt = [...grupos.entries()]
        .map(([k, v]) => v.length > 1 ? `<b>${esc(k)}</b> (${v.length} eq.)` : esc(v[0]))
        .join(' · ');
      return `<tr class="border-t"><td class="py-2">ALQ-${a.id}</td><td>${esc(a.cliente)}</td><td class="text-xs">${eqTxt}</td><td class="text-xs">${esc(a.fecha_retiro_prevista)} — ${esc(a.fecha_devolucion_prevista)}</td><td>${pill(a.estado)}</td><td class="text-right">${money(a.total_presupuesto + (a.total_mora || 0))}</td>
      <td class="text-right"><button class="text-xs underline" onclick="verAlq(${a.id})">Operar</button></td></tr>`;
    }).join('') : vacio(7, 'Sin alquileres para ese filtro'));
  renderPager('alquileres');
}

/* ---------------- CLIENTES / DEUDORES ---------------- */
async function cargarClientes() {
  const p = PAG.clientes;
  const params = new URLSearchParams({ page: p.page, limit: p.limit });
  const q = busqueda('', 'clientes');
  if (q) params.set('q', q);

  const d = await j('/api/clientes?' + params.toString());
  if (d.error) { $('tCli').innerHTML = aviso(d.error); return; }
  if (!aplicarPagina('clientes', d)) return cargarClientes();
  CLI = d.items;
  renderClientes();
}

function renderClientes() {
  $('tCli').innerHTML = `<table class="w-full text-sm"><tr class="text-[#94a3b8]"><th class="text-left py-1">Cliente</th><th class="text-left">Tipo</th><th class="text-left">Contacto</th></tr>` +
    (CLI.length ? CLI.map(c =>
      `<tr class="border-t"><td class="py-2 font-medium">${esc(c.nombre)}</td><td>${esc(c.tipo)}</td><td class="text-xs">${esc(c.whatsapp || '')}</td></tr>`
    ).join('') : vacio(3, 'Sin clientes para esa búsqueda'));
  renderPager('clientes');
}

async function cargarDeudores() {
  const p = PAG.deudores;
  const params = new URLSearchParams({ page: p.page, limit: p.limit });
  const q = busqueda('', 'clientes');
  if (q) params.set('q', q);

  const d = await j('/api/deudores?' + params.toString());
  if (d.error) { $('tDeud').innerHTML = aviso(d.error); return; }
  if (!aplicarPagina('deudores', d)) return cargarDeudores();
  DEUD = d.items;
  renderDeudores();
}

function renderDeudores() {
  $('tDeud').innerHTML = DEUD.length
    ? `<table class="w-full text-sm"><tr class="text-[#94a3b8]"><th class="text-left">Ref</th><th class="text-left">Cliente</th><th class="text-right">Saldo</th></tr>` +
      DEUD.map(r => `<tr class="border-t"><td>ALQ-${r.id}</td><td>${esc(r.cliente)}<br><span class="text-xs text-[#94a3b8]">presup ${money(r.total_presupuesto)}${r.total_mora ? ' + mora ' + money(r.total_mora) : ''} · pagado ${money(r.pagado)}</span></td><td class="text-right font-semibold text-[#fca5a5]">${money(r.saldo)}</td></tr>`).join('') + '</table>'
    : '<span class="text-sm text-[#94a3b8]">Sin deudores. A fin de mes esto responde quién debe días o recargos.</span>';
  renderPager('deudores');
}

/* ---------------- KITS ---------------- */
async function cargarKits() {
  const p = PAG.kits;
  const params = new URLSearchParams({ page: p.page, limit: p.limit });
  const q = busqueda('', 'kits');
  if (q) params.set('q', q);
  const ini = $('kIni').value, fin = $('kFin').value;
  if (ini && fin) { params.set('inicio', ini); params.set('fin', fin); }

  const d = await j('/api/kits?' + params.toString());
  if (d.error) { $('tKits').innerHTML = aviso(d.error); return; }
  if (!aplicarPagina('kits', d)) return cargarKits();
  KITS = d.items;
  renderKits();
}

function renderKits() {
  const ini = $('kIni').value, fin = $('kFin').value;
  const usarFechas = Boolean(ini && fin);
  $('tKits').innerHTML = `<table class="w-full text-sm"><tr class="text-[#94a3b8]"><th class="text-left py-1">Kit</th><th class="text-left">Componentes</th><th class="text-right">Precio / dia</th><th class="text-left">Estado</th><th></th></tr>` +
    (KITS.length ? KITS.map(k => {
      const desglose = k.desglose.map(d =>
        `${d.cantidad}x ${esc(d.equipo)} <span class="text-[#94a3b8]">(${d.unidades_libres}/${d.unidades_totales} libres)</span>`).join('<br>');
      const estado = usarFechas
        ? (k.completo ? pill('DISPONIBLE') : pill('VENCIDO') + ' bloqueado')
        : '<span class="text-[#94a3b8]">sin rango</span>';
      return `<tr class="border-t"><td class="py-2"><b>${esc(k.nombre)}</b><br><span class="text-xs text-[#94a3b8]">${esc(k.codigo)}</span></td>
        <td class="text-xs">${desglose}</td><td class="text-right">${money(k.precio_calculado)}</td><td>${estado}</td>
        <td class="text-right whitespace-nowrap"><button class="text-xs underline mr-2" onclick="conflictosKit(${k.id})">Conflictos</button><button class="text-xs underline" onclick="darDeBajaKit(${k.id})">Baja</button></td></tr>`;
    }).join('') : vacio(5, 'Sin kits para esa búsqueda'));

  renderPager('kits');
}

async function darDeBajaKit(id) {
  if (!confirm('Dar de baja el kit? Deja de ofrecerse pero se conserva el histórico.')) return;
  const r = await j('/api/kits/' + id, { method: 'DELETE' });
  if (r.error) alert(r.error); else await load();
}

async function verKits() {
  const ini = $('kIni').value, fin = $('kFin').value;
  if (!ini || !fin) { alert('Elegí el rango de fechas para consultar la disponibilidad de los kits'); return; }
  if (fin < ini) { alert('La fecha de fin no puede ser anterior a la de inicio'); return; }
  PAG.kits.page = 1;
  await cargarKits();
}

async function conflictosKit(id) {
  const ini = $('kIni').value, fin = $('kFin').value;
  if (!ini || !fin) { alert('Elegí el rango de fechas para ver los conflictos'); return; }
  const d = await j(`/api/kits/${id}/disponibilidad?inicio=${encodeURIComponent(ini)}&fin=${encodeURIComponent(fin)}`);
  if (d.error) { alert(d.error); return; }
  if (d.libre) { alert(`Kit disponible del ${ini} al ${fin}`); return; }
  const msg = d.conflictos.map(c =>
    `• ${c.equipo} (${c.codigo})\n  motivo: ${c.motivo}${c.rango ? '\n  rango: ' + c.rango : ''}${c.cliente ? '\n  cliente: ' + c.cliente : ''}`).join('\n\n');
  alert('Kit BLOQUEADO\n\n' + msg);
}

/* ---------------- Reserva: fechas, disponibilidad y selección ---------------- */
function hayFechas() {
  const ini = $('rIni').value, fin = $('rFin').value;
  return Boolean(ini && fin && fin >= ini);
}

function diasReserva() {
  const ini = $('rIni').value, fin = $('rFin').value;
  if (!ini || !fin || fin < ini) return 0;
  return Math.max(1, Math.round((new Date(fin) - new Date(ini)) / 86400000) + 1);
}

function renderFechas() {
  const ini = $('rIni').value, fin = $('rFin').value;
  const box = $('rFechas');
  if (!ini && !fin) {
    box.textContent = 'Elegí retiro y devolución para ver qué equipos y kits están libres en ese período.';
    return;
  }
  if (!ini || !fin) { box.textContent = 'Completá las dos fechas para ver la disponibilidad.'; return; }
  if (fin < ini) { box.innerHTML = aviso('La devolución no puede ser anterior al retiro.'); return; }
  const d = diasReserva();
  box.innerHTML = `<span class="text-[#e2e8f0]">${d} día${d === 1 ? '' : 's'}</span> · del ${esc(ini)} al ${esc(fin)}. La lista de abajo muestra qué está libre en ese período.`;
}

let tokenDisp = 0;
// Pide los catálogos con las fechas del formulario para mostrar disponibilidad real (R1 + R2).
async function actualizarDisponibilidad() {
  const t = ++tokenDisp;
  renderFechas();
  const ini = $('rIni').value, fin = $('rFin').value;
  const validas = ini && fin && fin >= ini;
  const qs = validas ? `?inicio=${encodeURIComponent(ini)}&fin=${encodeURIComponent(fin)}` : '';
  const [eq, kits] = await Promise.all([
    j('/api/equipos/todos' + qs), j('/api/kits/todos' + qs)
  ]);
  if (t !== tokenDisp) return; // llegó una respuesta vieja
  if (eq.error) { $('rFechas').innerHTML = aviso(eq.error); return; }
  if (kits.error) { $('rFechas').innerHTML = aviso(kits.error); return; }
  EQ = eq; KITS_TODOS = kits;
  renderKitSelect();
  renderEqList();
  renderEqSel();
  renderLineas();
  estimar();
}

function renderKitSelect() {
  const sel = $('rKit');
  const prev = sel.value;
  const fechas = hayFechas();
  sel.innerHTML = KITS_TODOS.length ? KITS_TODOS.map(k => {
    const marca = fechas ? (k.completo ? ' · disponible' : ' · sin stock') : '';
    return `<option value="${k.id}">${esc(k.codigo)} · ${esc(k.nombre)} (${money(k.precio_calculado)}/día${marca})</option>`;
  }).join('') : '<option value="">Sin kits cargados</option>';
  if (prev && KITS_TODOS.some(k => String(k.id) === prev)) sel.value = prev;
  renderKitDesglose();
}

function renderKitDesglose() {
  const box = $('rKitDesglose');
  const kit = KITS_TODOS.find(k => k.id === +$('rKit').value);
  if (!kit) { box.textContent = 'No hay kits cargados.'; return; }
  const fechas = hayFechas();
  const comps = kit.desglose.map(d => {
    const color = fechas ? (d.unidades_libres >= d.cantidad ? 'text-[#6ee7b7]' : 'text-[#fca5a5]') : 'text-[#94a3b8]';
    return `${d.cantidad}x ${esc(d.equipo)} <span class="${color}">(${d.unidades_libres}/${d.unidades_totales} libres)</span>`;
  }).join(' · ');
  const estado = !fechas
    ? '<span class="text-[#94a3b8]">Elegí las fechas para confirmar la disponibilidad.</span>'
    : kit.completo
      ? '<span class="pill p-DISPONIBLE">Disponible en esas fechas</span>'
      : '<span class="pill p-VENCIDO">Sin stock en esas fechas</span>';
  box.innerHTML = `${estado}<div class="mt-1">Incluye: ${comps} · ${money(kit.precio_calculado)}/día</div>`;
}

function renderEqList() {
  const q = ($('rEqSearch').value || '').trim().toLowerCase();
  const fechas = hayFechas();
  const rows = EQ.filter(e => !q ||
    (e.nombre + ' ' + e.codigo + ' ' + (e.categoria || '') + ' ' + (e.modelo || '')).toLowerCase().includes(q));
  $('rEqList').innerHTML = rows.length ? rows.map(e => {
    const sel = EQ_SEL.includes(e.id);
    const libre = fechas ? e.libre !== false : e.estado_operativo === 'DISPONIBLE';
    const motivo = e.motivo || (e.estado_operativo !== 'DISPONIBLE' ? 'En ' + e.estado_operativo : 'Libre');
    const badge = sel
      ? '<span class="pill p-ACTIVO">Elegido</span>'
      : libre
        ? '<span class="pill p-DISPONIBLE">Libre</span>'
        : `<span class="pill p-VENCIDO">${esc(motivo)}</span>`;
    return `<button class="w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-[#475569] ${sel ? 'bg-[#334155]' : ''} ${!libre && !sel ? 'opacity-60' : ''}" onclick="toggleEq(${e.id})">
      <span class="w-4 h-4 shrink-0 rounded border flex items-center justify-center text-xs">${sel ? '✓' : ''}</span>
      <span class="flex-1 min-w-0">
        <span class="block truncate">${esc(e.nombre)} <span class="text-xs text-[#94a3b8]">${esc(e.codigo)}</span></span>
        <span class="block text-xs text-[#64748b] truncate">${esc(e.categoria || 'Sin categoría')}${e.modelo ? ' · ' + esc(e.modelo) : ''}</span>
      </span>
      <span class="text-xs text-right whitespace-nowrap">${money(e.precio_dia)}/d<br>${badge}</span>
    </button>`;
  }).join('') : '<div class="p-3 text-xs text-[#94a3b8]">No hay equipos que coincidan con la búsqueda.</div>';

  const n = EQ_SEL.length;
  $('rEqCount').textContent = n
    ? `${n} equipo${n === 1 ? '' : 's'} seleccionado${n === 1 ? '' : 's'}`
    : (fechas ? 'Tocá un equipo libre para agregarlo' : 'Elegí las fechas para ver la disponibilidad');
}

function toggleEq(id) {
  const i = EQ_SEL.indexOf(id);
  if (i >= 0) {
    EQ_SEL.splice(i, 1);
  } else {
    const e = EQ.find(x => x.id === id);
    if (hayFechas() && e && e.libre === false) {
      $('rEqCount').innerHTML = aviso('No disponible: ' + (e.motivo || 'ocupado en esas fechas'));
      return;
    }
    if (!hayFechas() && e && e.estado_operativo !== 'DISPONIBLE') {
      $('rEqCount').innerHTML = aviso('Ese equipo está ' + e.estado_operativo + '.');
      return;
    }
    EQ_SEL.push(id);
  }
  renderEqList(); renderEqSel(); estimar();
}

function renderEqSel() {
  const fechas = hayFechas();
  $('rEqSel').innerHTML = EQ_SEL.length ? EQ_SEL.map(id => {
    const e = EQ.find(x => x.id === id);
    if (!e) return '';
    const sinStock = fechas && e.libre === false;
    return `<span class="inline-flex items-center gap-1 ${sinStock ? 'bg-[#4c1d24] text-[#fca5a5]' : 'bg-[#334155]'} rounded-lg px-2 py-1 text-xs">
      ${esc(e.nombre)} <span class="${sinStock ? '' : 'text-[#94a3b8]'}">${money(e.precio_dia)}/d</span>${sinStock ? ' · sin stock' : ''}
      <button class="underline" onclick="toggleEq(${id})">x</button></span>`;
  }).join('') : '<span class="text-xs text-[#64748b]">Ninguno. (Opcional: la venta normal es por kit.)</span>';
}

function agregarKit() {
  const id = +$('rKit').value;
  const cant = Math.max(1, Math.min(20, +$('rKitCant').value || 1));
  if (!id) { $('rKitDesglose').innerHTML = aviso('No hay kits para agregar'); return; }
  const kit = KITS_TODOS.find(k => k.id === id);
  if (hayFechas() && kit && !kit.completo) {
    $('rKitDesglose').innerHTML = '<span class="text-[#fca5a5]">Ese kit no tiene stock en las fechas elegidas: probá otro rango u otro kit.</span>';
    return;
  }
  KITS_SEL.push({ kit_id: id, cantidad: cant });
  $('rKitCant').value = '1';
  renderKitDesglose();
  renderLineas();
  estimar();
}

function quitarKit(i) { KITS_SEL.splice(i, 1); renderLineas(); estimar(); }

function renderLineas() {
  const box = $('rLineas');
  const fechas = hayFechas();
  const dias = diasReserva();
  if (!KITS_SEL.length) {
    box.innerHTML = '<span class="text-xs text-[#64748b]">Ninguno. Si un componente del kit no está libre, se bloquea el kit completo.</span>';
    return;
  }
  box.innerHTML = KITS_SEL.map((k, i) => {
    const kit = KITS_TODOS.find(x => x.id === k.kit_id);
    const precioDia = kit ? Number(kit.precio_calculado) : 0;
    const sub = precioDia * k.cantidad * (dias || 1);
    const comp = kit ? kit.desglose.map(d => `${d.cantidad}x ${d.equipo}`).join(', ') : '';
    const sinStock = fechas && kit && !kit.completo;
    return `<div class="flex flex-wrap items-center gap-2 ${sinStock ? 'bg-[#4c1d24]' : 'bg-[#334155]'} rounded-lg px-2 py-1">
      <b>${esc(kit ? kit.nombre : 'Kit')}</b> <span class="text-xs">x${k.cantidad}</span>
      <span class="text-xs text-[#94a3b8]">${esc(comp)}</span>
      ${sinStock ? '<span class="text-xs text-[#fca5a5]">sin stock en esas fechas</span>' : ''}
      <span class="ml-auto text-xs whitespace-nowrap">${money(sub)}${dias ? ' · ' + dias + ' días' : ''}</span>
      <button class="text-xs underline" onclick="quitarKit(${i})">quitar</button></div>`;
  }).join('');
}

function estimar() {
  const dias = diasReserva();
  let porDia = EQ_SEL.reduce((s, id) => {
    const e = EQ.find(x => x.id === id);
    return s + (e ? Number(e.precio_dia) : 0);
  }, 0);
  for (const k of KITS_SEL) {
    const kit = KITS_TODOS.find(x => x.id === k.kit_id);
    if (kit) porDia += Number(kit.precio_calculado) * k.cantidad;
  }
  const total = porDia * (dias || 1);
  $('rDias').textContent = dias ? `${dias} día${dias === 1 ? '' : 's'} de alquiler` : 'Sin fechas';
  $('rTot').innerHTML = porDia
    ? `Estimado: <b>${money(total)}</b>` +
      (dias ? ` <span class="text-xs text-[#94a3b8]">(${dias} × ${money(porDia)}/día)</span>`
            : ' <span class="text-xs text-[#94a3b8]">por día</span>')
    : '';
}

function limpiarReserva() {
  KITS_SEL = [];
  EQ_SEL = [];
  renderLineas(); renderEqSel(); renderEqList(); estimar();
  $('rRes').textContent = '';
}

function consultar(equipoId) {
  go('inventario');
  $('dEq').value = equipoId;
  if (!$('dIni').value) $('dIni').value = hoyISO();
  if (!$('dFin').value) {
    const d = new Date(); d.setDate(d.getDate() + 3);
    $('dFin').value = isoLocal(d);
  }
  verDisp();
  $('dEq').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function verAlq(id) {
  $('mAlq').value = id;
  $('reservaCard').scrollIntoView({ behavior: 'smooth' });
}

/* ---------------- Operaciones ---------------- */
async function verDisp() {
  const eq = $('dEq').value, ini = $('dIni').value, fin = $('dFin').value;
  if (!eq || !ini || !fin) { $('dRes').innerHTML = aviso('Elegí equipo, inicio y fin'); return; }
  if (fin < ini) { $('dRes').innerHTML = aviso('La fecha de fin no puede ser anterior a la de inicio'); return; }
  const r = await j(`/api/disponibilidad?equipo_id=${encodeURIComponent(eq)}&inicio=${encodeURIComponent(ini)}&fin=${encodeURIComponent(fin)}`);
  if (r.error) { $('dRes').innerHTML = aviso(r.error); return; }
  $('dRes').innerHTML = r.libre ? pill('DISPONIBLE') + ' Libre' : pill('VENCIDO') + ' ' + esc(r.motivo || '');
}

async function reservar() {
  const cliente_id = +$('rCli').value;
  const inicio = $('rIni').value, fin = $('rFin').value;
  if (!cliente_id) { $('rRes').innerHTML = aviso('Elegí un cliente'); return; }
  if (!inicio || !fin) { $('rRes').innerHTML = aviso('Completá las fechas de retiro y devolución'); return; }
  if (fin < inicio) { $('rRes').innerHTML = aviso('La devolución no puede ser anterior al retiro'); return; }
  if (!EQ_SEL.length && !KITS_SEL.length) { $('rRes').innerHTML = aviso('Agregá al menos un kit o un equipo'); return; }

  const r = await j('/api/alquileres', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cliente_id, inicio, fin, equipo_ids: EQ_SEL, kits: KITS_SEL,
      garantia: { tipo: $('rGar').value, detalle: 'mostrador', monto: 0 }
    })
  });
  if (r.ok) {
    $('rRes').textContent = `OK ALQ-${r.alquiler_id} · ${r.dias} días · ${r.equipos} equipos · total ${money(r.total)}`;
    KITS_SEL = []; EQ_SEL = [];
    $('rKitCant').value = '1';
    renderLineas(); renderEqSel(); renderEqList(); estimar();
    await load();
    await actualizarDisponibilidad();
  } else {
    $('rRes').innerHTML = aviso(r.error || 'No se pudo reservar');
    if (r.conflictos && r.conflictos.length) {
      const detalle = r.conflictos.map(c =>
        `${c.equipo || c.equipo_id || ''}${c.codigo ? ' (' + c.codigo + ')' : ''}: ${c.motivo}${c.rango ? ' [' + c.rango + ']' : ''}`).join(' | ');
      $('rRes').innerHTML = '<span class="text-[#fca5a5]">Kit bloqueado → ' + esc(detalle) + '</span>';
    }
  }
}

function idAlquiler(inputId, msgId) {
  const n = Number($(inputId).value);
  if (!Number.isInteger(n) || n < 1) {
    $(msgId).textContent = 'Ingresá un ID de alquiler válido';
    return null;
  }
  return n;
}

async function retiro() {
  const id = idAlquiler('mAlq', 'mRes');
  if (!id) return;
  const r = await j('/api/alquileres/' + id + '/retiro', { method: 'POST' });
  if (r.ok) { $('mRes').textContent = 'Retirado (check-out). Equipos → ALQUILADO.'; await load(); }
  else $('mRes').textContent = 'Error: ' + r.error;
}

async function devol() { return checkin(false); }
async function marcarDanado() { return checkin(true); }

async function checkin(danado) {
  const id = idAlquiler('mAlq', 'mRes');
  if (!id) return;
  const det = await j('/api/alquileres/' + id);
  if (det.error) { $('mRes').textContent = 'Error: ' + det.error; return; }
  const map = {};
  (det.detalle || []).forEach(d => map[d.equipo_id] = danado ? 'DANADO' : 'DISPONIBLE');
  const r = await j(`/api/alquileres/${id}/devolucion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado_equipos: map })
  });
  if (r.ok) {
    $('mRes').textContent = `Devuelto. Mora: ${money(r.mora_calculada)}${danado ? ' · equipo → MANTENIMIENTO' : ''}`;
    await load();
  } else {
    $('mRes').textContent = 'Error: ' + r.error;
  }
}

async function prorroga() {
  const id = idAlquiler('mAlq', 'mRes');
  if (!id) return;
  const nueva = $('mPro').value;
  if (!nueva) { $('mRes').textContent = 'Elegí la nueva fecha de devolución'; return; }
  const r = await j(`/api/alquileres/${id}/prorroga`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nueva_fin: nueva })
  });
  if (r.ok) { $('mRes').textContent = `Prórroga OK · nuevo total ${money(r.total)}`; await load(); }
  else $('mRes').textContent = 'Error: ' + r.error;
}

async function bloquear(id, est) {
  const nuevo = est === 'DISPONIBLE' ? 'MANTENIMIENTO' : 'DISPONIBLE';
  const r = await j('/api/equipos/estado', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ equipo_id: id, estado: nuevo, observacion: 'panel' })
  });
  if (r.error) alert(r.error); else await load();
}

/* ---------- validación visible dentro de los modales ---------- */
function campoFalta(id, falta) {
  const el = $(id);
  if (el) el.classList.toggle('campo-falta', Boolean(falta));
}

function limpiarAviso(boxId, campos = []) {
  const box = $(boxId);
  if (box) box.textContent = '';
  campos.forEach(id => campoFalta(id, false));
}

// Muestra los campos faltantes/inválidos dentro del formulario (sin alert del navegador).
function avisoModal(boxId, entidad, faltan = [], invalidos = [], campos = []) {
  const partes = [];
  if (faltan.length) partes.push('Faltan completar: ' + faltan.join(' · '));
  if (invalidos.length) partes.push('Revisá: ' + invalidos.join(' · '));
  const box = $(boxId);
  if (box) box.textContent = `No se pudo guardar ${entidad}. ` + partes.join('. ') + '.';
  campos.forEach(id => campoFalta(id, true));
  const primero = campos.map(id => $(id)).find(el => el && el.tabIndex >= 0) || campos.map(id => $(id)).find(Boolean);
  if (primero && typeof primero.focus === 'function') primero.focus();
}

async function crearCliente() {
  const nombre = ($('cNom').value || '').trim();
  const whatsapp = ($('cWsp').value || '').trim();
  const faltan = [], invalidos = [], marcar = [];
  if (nombre.length < 2) { faltan.push('Nombre (mínimo 2 caracteres)'); marcar.push('cNom'); }
  if (whatsapp && !/^[0-9+\-\s()]{6,30}$/.test(whatsapp)) {
    invalidos.push('WhatsApp (solo números, espacios, +, - y paréntesis)'); marcar.push('cWsp');
  }
  if (faltan.length || invalidos.length) {
    avisoModal('cErr', 'el cliente', faltan, invalidos, marcar);
    return;
  }
  limpiarAviso('cErr', ['cNom', 'cWsp']);
  const r = await j('/api/clientes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, tipo: $('cTip').value, whatsapp })
  });
  if (r.error) { avisoModal('cErr', 'el cliente', [], [r.error]); return; }
  $('cNom').value = ''; $('cWsp').value = '';
  $('dlgCli').close();
  await load();
}

async function crearEquipo() {
  const codigo = ($('eCod').value || '').trim();
  const nombre = ($('eNom').value || '').trim();
  const precio = $('ePre').value === '' ? 0 : +$('ePre').value;
  const faltan = [], invalidos = [], marcar = [];
  if (codigo.length < 2) { faltan.push('Código (mínimo 2 caracteres)'); marcar.push('eCod'); }
  if (nombre.length < 2) { faltan.push('Nombre (mínimo 2 caracteres)'); marcar.push('eNom'); }
  if (!Number.isFinite(precio) || precio < 0) {
    invalidos.push('Precio por día (número mayor o igual a 0)'); marcar.push('ePre');
  }
  if (faltan.length || invalidos.length) {
    avisoModal('eErr', 'el equipo', faltan, invalidos, marcar);
    return;
  }
  limpiarAviso('eErr', ['eCod', 'eNom', 'ePre']);
  const r = await j('/api/equipos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codigo, nombre, modelo: $('eMod').value || null,
      categoria_id: +$('eCat').value, precio_dia: precio
    })
  });
  if (r.error) { avisoModal('eErr', 'el equipo', [], [r.error]); return; }
  $('eCod').value = ''; $('eNom').value = ''; $('eMod').value = ''; $('ePre').value = '';
  $('dlgEq').close();
  await load();
}

/* ---------------- Alta de kit ---------------- */
function abrirKit() {
  COMP = [];
  $('kMod').innerHTML = MODELOS.map(m =>
    `<option value="${esc(m.modelo)}">${esc(m.nombre)} · ${esc(m.modelo)} (${m.unidades} uds)</option>`).join('');
  limpiarAviso('kErr', ['kCod', 'kNom', 'kPre', 'kComp']);
  renderComp();
  $('dlgKit').showModal();
}

function agregarComponente() {
  const modelo = $('kMod').value;
  const cant = Math.max(1, Math.min(99, +$('kCant').value || 1));
  if (!modelo) return;
  const ex = COMP.find(c => c.modelo === modelo);
  if (ex) ex.cantidad = Math.min(99, ex.cantidad + cant);
  else COMP.push({ modelo, cantidad: cant });
  campoFalta('kComp', false);
  if ($('kErr')) $('kErr').textContent = '';
  renderComp();
}

function quitarComponente(i) { COMP.splice(i, 1); renderComp(); }

function renderComp() {
  $('kComp').innerHTML = COMP.length ? COMP.map((c, i) => {
    const m = MODELOS.find(x => x.modelo === c.modelo);
    const texto = m && m.unidades < c.cantidad ? `<span class="text-[#fca5a5]">solo ${m.unidades} unidades</span>` : '';
    return `<div class="flex items-center gap-2 bg-[#334155] rounded-lg px-2 py-1">
      <b>${c.cantidad}x</b> ${esc(m ? m.nombre : c.modelo)} <span class="text-xs text-[#64748b]">${esc(c.modelo)}</span> ${texto}
      <button class="ml-auto text-xs underline" onclick="quitarComponente(${i})">quitar</button></div>`;
  }).join('') : '<span class="text-xs text-[#64748b]">Agregá al menos un componente.</span>';
}

async function crearKit() {
  const codigo = ($('kCod').value || '').trim();
  const nombre = ($('kNom').value || '').trim();
  const precio = $('kPre').value === '' ? null : +$('kPre').value;
  const faltan = [], invalidos = [], marcar = [];
  if (codigo.length < 2) { faltan.push('Código (mínimo 2 caracteres)'); marcar.push('kCod'); }
  if (nombre.length < 2) { faltan.push('Nombre (mínimo 2 caracteres)'); marcar.push('kNom'); }
  if (!COMP.length) { faltan.push('al menos un componente'); marcar.push('kComp'); }
  if (precio !== null && (!Number.isFinite(precio) || precio < 0)) {
    invalidos.push('Precio propio (número ≥ 0, o vacío para calcularlo por componentes)'); marcar.push('kPre');
  }
  if (faltan.length || invalidos.length) {
    avisoModal('kErr', 'el kit', faltan, invalidos, marcar);
    return;
  }
  limpiarAviso('kErr', ['kCod', 'kNom', 'kPre', 'kComp']);
  const r = await j('/api/kits', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo, nombre, descripcion: $('kDesc').value, precio_dia: precio, componentes: COMP })
  });
  if (r.error) { avisoModal('kErr', 'el kit', [], [r.error]); return; }
  $('kCod').value = ''; $('kNom').value = ''; $('kDesc').value = ''; $('kPre').value = '';
  COMP = [];
  $('dlgKit').close();
  PAG.kits.page = 1;
  await load();
}

async function verSaldo() {
  const id = idAlquiler('pAlqId', 'rPago');
  if (!id) return;
  const r = await j('/api/alquileres/' + id);
  if (r.error) { $('rPago').textContent = 'Error: ' + r.error; return; }
  const detalle = (r.detalle || []).map(d => `<div class="flex justify-between text-xs border-b py-1">
    <span>${esc(d.equipo)} ${d.kit ? '<b class="text-[#64748b]">(' + esc(d.kit) + ')</b>' : ''}</span>
    <span>${money(d.subtotal)}</span></div>`).join('');
  $('rPago').innerHTML = `ALQ-${r.id} · presup ${money(r.total_presupuesto)} + mora ${money(r.total_mora || 0)} − pagado ${money(r.pagado)} = <b>saldo ${money(r.saldo)}</b> (${esc(r.estado)})
    <br><span class="text-[#94a3b8] text-xs">Garantía: ${(r.garantias || []).map(g => esc(g.tipo)).join(', ') || '—'} · Pagos: ${(r.pagos || []).map(p => esc(p.tipo) + ' ' + money(p.monto)).join(' · ') || '—'}</span>
    <div class="mt-2">${detalle}</div>`;
}

async function pagar() {
  const id = idAlquiler('pAlqId', 'rPago');
  if (!id) return;
  const monto = +$('pMonto').value;
  if (!Number.isFinite(monto) || monto <= 0) { $('rPago').textContent = 'Ingresá un monto mayor a 0'; return; }

  const r = await j('/api/pagos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alquiler_id: id, tipo: $('pTipo').value, monto })
  });
  if (r.error) { $('rPago').textContent = 'Error: ' + r.error; return; }
  $('pMonto').value = '';
  await verSaldo();
  await load();
}

/* ---------------- listeners ---------------- */
// Al escribir en un campo marcado, se le quita el resaltado y se limpia el aviso.
[['kCod', 'kErr'], ['kNom', 'kErr'], ['kPre', 'kErr'], ['kDesc', 'kErr'],
 ['cNom', 'cErr'], ['cWsp', 'cErr'],
 ['eCod', 'eErr'], ['eNom', 'eErr'], ['ePre', 'eErr'], ['eMod', 'eErr']]
  .forEach(([campo, box]) => {
    const el = $(campo);
    if (!el) return;
    el.addEventListener('input', () => {
      campoFalta(campo, false);
      if ($(box)) $(box).textContent = '';
    });
  });

$('fCat').onchange = () => { PAG.equipos.page = 1; cargarEquipos(); };
$('fEst').onchange = () => { PAG.equipos.page = 1; cargarEquipos(); };
$('qEq').oninput = debounce(() => { PAG.equipos.page = 1; cargarEquipos(); }, 250);
$('qAlq').oninput = debounce(() => { PAG.alquileres.page = 1; cargarAlquileres(); }, 250);
$('rEqSearch').oninput = renderEqList;
$('rKit').onchange = renderKitDesglose;
// Al cambiar las fechas se recalculan días, total y disponibilidad real de equipos y kits.
$('rIni').onchange = debounce(() => { actualizarDisponibilidad(); }, 150);
$('rFin').onchange = debounce(() => { actualizarDisponibilidad(); }, 150);

$('q').oninput = debounce(() => {
  const v = vistaActual();
  if (v === 'inventario') { PAG.equipos.page = 1; cargarEquipos(); }
  else if (v === 'alquileres') { PAG.alquileres.page = 1; cargarAlquileres(); }
  else if (v === 'clientes') {
    PAG.clientes.page = 1; PAG.deudores.page = 1;
    cargarClientes(); cargarDeudores();
  } else if (v === 'kits') { PAG.kits.page = 1; cargarKits(); }
}, 250);

load();
