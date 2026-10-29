// Smoke test de interfaz: carga public/index.html + public/app.js en jsdom contra un
// servidor real levantado en el mismo proceso (DB en memoria). No necesita `npm start`.
// Uso: npm test   (o: node tests/smoke.js)
process.env.DB_PATH = ':memory:';

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { app, db } = require('../app');

let fallos = 0;
const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FALLA ') + msg); if (!ok) fallos++; };
const esperar = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;

  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  const dom = new JSDOM(html, { url: BASE, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const errores = [];
  window.addEventListener('error', e => errores.push(e.message));
  window.console.error = (...a) => errores.push(a.join(' '));
  window.console.warn = () => {};

  window.fetch = async (url, opts) => {
    const r = await fetch(BASE + url, opts);
    return { json: async () => r.json(), ok: r.ok, status: r.status };
  };
  window.alert = () => {};
  window.confirm = () => true;
  window.scrollIntoView = () => {};
  window.Element.prototype.scrollIntoView = () => {};
  window.Chart = class { constructor() {} destroy() {} };
  window.lucide = { createIcons: () => {} };
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

  window.eval(appjs + '\nwindow.__state = () => ({ MODELOS, KITS, KITS_TODOS, COMP, EQ_SEL, KITS_SEL, ALQ, EQ, CLI, PAG, INV });');
  await esperar(2000);
  const d = window.document;
  const st = () => window.__state();

  console.log('--- carga general ---');
  check(errores.length === 0, 'sin errores en consola' + (errores.length ? ': ' + errores.join(' | ') : ''));
  check(st().MODELOS.length > 0, `modelos cargados (${st().MODELOS.length})`);
  check(st().KITS.length > 0, `kits cargados en la página (${st().KITS.length})`);
  check(st().KITS_TODOS.length === 2, `catálogo completo de kits para selectores (${st().KITS_TODOS.length})`);
  check(st().EQ.length === 12 && st().INV.length === 10, `equipos: catálogo 12 / página 10 (${st().EQ.length}/${st().INV.length})`);

  console.log('--- paginación ---');
  check(st().PAG.equipos.total === 12 && st().PAG.equipos.pages === 2, 'metadata de equipos: 12 en 2 páginas');
  check(st().PAG.kits.total === 2, 'metadata de kits: 2 registros');
  check(d.getElementById('pEq').querySelectorAll('button').length > 0, 'paginador de inventario renderizado');
  check(/12/.test(d.getElementById('pEq').textContent), 'paginador de inventario muestra el total');
  check(d.getElementById('pKits').textContent.trim().length > 0, 'paginador de kits renderizado');
  check(!!d.getElementById('pCli') && !!d.getElementById('pAlq') && !!d.getElementById('pDeud'),
    'contenedores de paginación de clientes/alquileres/deudores presentes');
  const ids = [...d.querySelectorAll('[id]')].map(e => e.id);
  check(new Set(ids).size === ids.length, 'sin IDs duplicados en el HTML');

  window.eval("irPagina('equipos', 2)");
  await esperar(600);
  check(st().INV.length === 2 && st().PAG.equipos.page === 2, 'ir a la página 2 de inventario trae 2 equipos');

  console.log('--- vistas renderizadas ---');
  check(d.getElementById('rKit').options.length === st().KITS_TODOS.length, 'select de kits poblado con el catálogo completo');
  check(d.getElementById('rCli').options.length === 12, 'select de clientes poblado (12)');
  check(d.getElementById('dEq').options.length === 12, 'select de equipos (verificador) poblado (12)');
  check(d.getElementById('tKits').querySelectorAll('tr').length > 1, 'tabla de kits renderizada');
  check(d.getElementById('tAlq').querySelectorAll('tr').length > 0, 'tabla de alquileres renderizada');
  check(d.getElementById('tEq').querySelectorAll('tr').length === 3, 'tabla de inventario con 2 filas (página 2)');
  check(d.getElementById('tCli').querySelectorAll('tr').length > 1, 'tabla de clientes renderizada');
  check(/1–8 de 12/.test(d.getElementById('pCli').textContent), 'paginador de clientes: 1–8 de 12');
  check(d.getElementById('pCli').textContent.includes('2'), 'el paginador de clientes ofrece la página 2');
  window.eval("irPagina('clientes', 2)");
  await esperar(700);
  check(st().CLI.length === 4 && st().PAG.clientes.page === 2, 'página 2 de clientes trae los 4 restantes');
  window.eval("irPagina('clientes', 1)");
  await esperar(700);
  check(d.getElementById('catBars').innerHTML.length > 0, 'barras de disponibilidad por categoría');
  check(d.getElementById('kAct').textContent !== '–', 'KPIs del panel calculados');

  console.log('--- búsqueda server-side ---');
  d.getElementById('qEq').value = 'sony';
  d.getElementById('qEq').dispatchEvent(new window.Event('input'));
  await esperar(700);
  check(st().INV.length === 2 && st().PAG.equipos.total === 2, 'la búsqueda de inventario filtra en el servidor (2)');
  d.getElementById('qEq').value = '';
  d.getElementById('qEq').dispatchEvent(new window.Event('input'));
  await esperar(700);

  console.log('--- lupa de equipos ---');
  d.getElementById('rEqSearch').value = 'sony';
  d.getElementById('rEqSearch').dispatchEvent(new window.Event('input'));
  await esperar(300);
  const filas = d.getElementById('rEqList').querySelectorAll('button');
  check(filas.length >= 1, `la lupa filtra (${filas.length} resultados para "sony")`);

  console.log('--- validación visible en pantalla ---');
  d.getElementById('rEqSearch').value = '';
  d.getElementById('rEqSearch').dispatchEvent(new window.Event('input'));
  d.getElementById('rIni').value = '2030-07-10';
  d.getElementById('rFin').value = '2030-07-01';
  await window.eval('reservar()');
  await esperar(200);
  check(/anterior/i.test(d.getElementById('rRes').textContent), 'fechas invertidas: mensaje de validación en pantalla');

  console.log('--- reserva intuitiva: fechas, disponibilidad y resumen ---');
  d.getElementById('rIni').value = '2032-01-10';
  d.getElementById('rFin').value = '2032-01-12';
  d.getElementById('rFin').dispatchEvent(new window.Event('change'));
  await esperar(1500);
  check(/3 días/.test(d.getElementById('rFechas').textContent), 'muestra la cantidad de días del rango elegido');
  check(/Libre/.test(d.getElementById('rEqList').textContent), 'la lista de equipos muestra el estado Libre con fechas');
  check(d.getElementById('rEqCount').textContent.trim().length > 0, 'indica qué hacer en el paso 2');
  check(/Disponible en esas fechas|Sin stock en esas fechas/.test(d.getElementById('rKitDesglose').textContent),
    'el kit elegido informa si está disponible en ese rango');
  check(/disponible|sin stock/.test(d.getElementById('rKit').textContent),
    'el selector de kits marca disponibilidad según las fechas');

  const libre = st().EQ.find(e => e.libre !== false);
  check(Boolean(libre), 'hay al menos un equipo libre para el rango de prueba');
  if (libre) {
    window.eval('toggleEq(' + libre.id + ')');
    check(st().EQ_SEL.includes(libre.id), 'tocar un equipo libre lo agrega a la selección');
    check(/3 ×/.test(d.getElementById('rTot').textContent) || /Estimado/.test(d.getElementById('rTot').textContent),
      'el total estimado usa los días del rango');
    check(d.getElementById('rEqSel').textContent.includes(libre.nombre), 'el equipo aparece en el resumen del paso 3');
    window.eval('toggleEq(' + libre.id + ')');
  }
  check(/3 días de alquiler/.test(d.getElementById('rDias').textContent), 'el resumen indica los días de alquiler');
  d.getElementById('rIni').value = '';
  d.getElementById('rFin').value = '';
  d.getElementById('rFin').dispatchEvent(new window.Event('change'));
  await esperar(900);

  console.log('--- cobranza ---');
  const resp = await fetch(BASE + '/api/alquileres', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cliente_id: 1, inicio: '2031-01-05', fin: '2031-01-06', equipo_ids: [1],
      garantia: { tipo: 'PAGARE', detalle: 'smoke', monto: 0 }
    })
  });
  const nuevo = await resp.json();
  check(resp.ok && nuevo.alquiler_id > 0, 'reserva creada por API para probar cobranza');
  d.getElementById('pAlqId').value = String(nuevo.alquiler_id);
  await window.eval('verSaldo()');
  await esperar(400);
  check(/saldo/i.test(d.getElementById('rPago').textContent), 'cobranza: ver saldo usa el input de ID correcto');
  check(/ALQ-/.test(d.getElementById('rPago').textContent), 'cobranza: muestra la referencia del alquiler');

  console.log('--- validación de campos en modales ---');
  let alertas = 0;
  window.alert = () => { alertas++; };
  window.eval('openCliente()');
  await window.eval('crearCliente()');
  check(alertas === 0 && /Nombre/.test(d.getElementById('cErr').textContent),
    'cliente sin datos: aviso dentro del modal (sin alert)');
  check(d.getElementById('cNom').classList.contains('campo-falta'), 'marca el campo Nombre del cliente');
  d.getElementById('dlgCli').close();

  console.log('--- alta de kit ---');
  d.getElementById('rIni').value = '';
  d.getElementById('rFin').value = '';
  window.eval('abrirKit()');
  check(d.getElementById('dlgKit').hasAttribute('open'), 'modal de kit abierto');
  const dlgKit = d.getElementById('dlgKit');
  check(/m-auto/.test(dlgKit.className) && /36rem/.test(dlgKit.className),
    'modal de kit centrado y más grande (36rem)');
  check(d.getElementById('kMod').options.length === st().MODELOS.length, `select de modelos poblado (${d.getElementById('kMod').options.length})`);

  await window.eval('crearKit()');
  await esperar(100);
  const aviso = d.getElementById('kErr').textContent;
  check(alertas === 0, 'guardar el kit vacío no abre alert del navegador');
  check(/Código/.test(aviso) && /Nombre/.test(aviso) && /componente/i.test(aviso),
    'avisa qué campos faltan rellenar: "' + aviso + '"');
  check(d.getElementById('kCod').classList.contains('campo-falta') &&
    d.getElementById('kNom').classList.contains('campo-falta') &&
    d.getElementById('kComp').classList.contains('campo-falta'), 'resalta los campos faltantes');
  check(dlgKit.hasAttribute('open'), 'el modal sigue abierto para corregir');

  const codigo = 'KIT-SMOKE-' + Date.now();
  d.getElementById('kCod').value = codigo;
  d.getElementById('kCod').dispatchEvent(new window.Event('input'));
  check(d.getElementById('kErr').textContent === '' &&
    !d.getElementById('kCod').classList.contains('campo-falta'), 'al escribir se limpia el aviso');
  d.getElementById('kNom').value = 'Kit Smoke Test';
  d.getElementById('kMod').value = st().MODELOS[0].modelo;
  d.getElementById('kCant').value = '2';
  window.eval('agregarComponente()');
  check(st().COMP.length === 1 && st().COMP[0].cantidad === 2, 'componente agregado al kit');
  d.getElementById('kPre').value = '30000';
  await window.eval('crearKit()');
  await esperar(1200);
  check(!d.getElementById('dlgKit').hasAttribute('open'), 'modal cerrado tras guardar');
  const creado = st().KITS_TODOS.find(k => k.codigo === codigo);
  check(!!creado, 'kit creado y recargado en el catálogo');
  if (creado) {
    const rr = await fetch(BASE + '/api/kits/' + creado.id, { method: 'DELETE' });
    check(rr.ok, 'baja lógica de kit');
  }

  console.log(fallos === 0 ? '\nTODOS LOS CHECKS OK' : `\n${fallos} CHECK(S) FALLARON`);
  server.close();
  try { db.close(); } catch (e) { /* ya cerrada */ }
  process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR EN EL TEST:', e); process.exit(1); });
