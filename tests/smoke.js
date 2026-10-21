// Smoke test: carga la app en un DOM real (jsdom) y verifica que todo se renderiza.
// Uso:  npm test   (requiere el server corriendo en http://localhost:3000)
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
let fallos = 0;
const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FALLA ') + msg); if (!ok) fallos++; };

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  const dom = new JSDOM(html, { url: BASE, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const errores = [];
  window.addEventListener('error', e => errores.push(e.message));
  window.console.error = (...a) => errores.push(a.join(' '));

  window.fetch = async (url, opts) => {
    const r = await fetch(BASE + url, opts);
    return { json: async () => r.json(), ok: r.ok, status: r.status };
  };
  window.alert = () => {};
  window.scrollIntoView = () => {};
  window.Chart = class { constructor() {} destroy() {} };
  window.lucide = { createIcons: () => {} };
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

  window.eval(appjs + '\nwindow.__state = () => ({ MODELOS, KITS, COMP, EQ_SEL, KITS_SEL, ALQ, EQ });');
  await new Promise(r => setTimeout(r, 2000));
  const d = window.document;
  const st = () => window.__state();

  console.log('--- carga general ---');
  check(errores.length === 0, 'sin errores en consola' + (errores.length ? ': ' + errores.join(' | ') : ''));
  check(st().MODELOS.length > 0, `modelos cargados (${st().MODELOS.length})`);
  check(st().KITS.length > 0, `kits cargados (${st().KITS.length})`);
  check(st().ALQ.length >= 0 && st().EQ.length > 0, `equipos cargados (${st().EQ.length})`);

  console.log('--- vistas renderizadas ---');
  check(d.getElementById('rKit').options.length === st().KITS.length, 'select de kits poblado en la reserva');
  check(d.getElementById('rCli').options.length > 0, 'select de clientes poblado');
  check(d.getElementById('dEq').options.length > 0, 'select de equipos (verificador) poblado');
  check(d.getElementById('tKits').querySelectorAll('tr').length > 1, 'tabla de kits renderizada');
  check(d.getElementById('tAlq').querySelectorAll('tr').length > 0, 'tabla de alquileres renderizada');
  check(d.getElementById('tEq').querySelectorAll('tr').length > 1, 'tabla de inventario renderizada');
  check(d.getElementById('tCli').querySelectorAll('tr').length > 1, 'tabla de clientes renderizada');
  check(d.getElementById('catBars').innerHTML.length > 0, 'barras de disponibilidad por categoría');
  check(d.getElementById('kAct').textContent !== '–', 'KPIs del panel calculados');

  console.log('--- lupa de equipos ---');
  d.getElementById('rEqSearch').value = 'sony';
  d.getElementById('rEqSearch').dispatchEvent(new window.Event('input'));
  await new Promise(r => setTimeout(r, 300));
  const filas = d.getElementById('rEqList').querySelectorAll('button');
  check(filas.length >= 1, `la lupa filtra (${filas.length} resultados para "sony")`);

  console.log('--- alta de kit ---');
  d.getElementById('rEqSearch').value = '';
  d.getElementById('rEqSearch').dispatchEvent(new window.Event('input'));
  window.eval('abrirKit()');
  check(d.getElementById('dlgKit').hasAttribute('open'), 'modal de kit abierto');
  check(d.getElementById('kMod').options.length === st().MODELOS.length, `select de modelos poblado (${d.getElementById('kMod').options.length})`);
  d.getElementById('kMod').value = st().MODELOS[0].modelo;
  d.getElementById('kCant').value = '2';
  window.eval('agregarComponente()');
  check(st().COMP.length === 1 && st().COMP[0].cantidad === 2, 'componente agregado al kit');
  const codigo = 'KIT-SMOKE-' + Date.now();
  d.getElementById('kCod').value = codigo;
  d.getElementById('kNom').value = 'Kit Smoke Test';
  d.getElementById('kPre').value = '30000';
  await window.eval('crearKit()');
  await new Promise(r => setTimeout(r, 1200));
  check(!d.getElementById('dlgKit').hasAttribute('open'), 'modal cerrado tras guardar');
  const creado = st().KITS.find(k => k.codigo === codigo);
  check(!!creado, 'kit creado y recargado en el catálogo');
  if (creado) {
    const r = await fetch(BASE + '/api/kits/' + creado.id, { method: 'DELETE' });
    check(r.ok, 'baja logica de kit');
  }

  console.log(fallos === 0 ? '\nTODOS LOS CHECKS OK' : `\n${fallos} CHECK(S) FALLARON`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR EN EL TEST:', e); process.exit(1); });
