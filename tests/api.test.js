// Tests de API: validaciones (400/404/409/413), paginación y reglas de negocio.
// No requiere un servidor externo: levanta la app en un puerto efímero con DB en memoria.
// Uso: npm test   (o: node tests/api.test.js)
process.env.DB_PATH = ':memory:';
process.env.PORT = '0';

const { app, db } = require('../app');

let fallos = 0;
const check = (ok, msg, extra) => {
  console.log((ok ? 'OK   ' : 'FALLA ') + msg + (ok || extra === undefined ? '' : ' → ' + JSON.stringify(extra)));
  if (!ok) fallos++;
};

let BASE = '';

async function req(method, url, body, { raw = false } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = raw ? body : JSON.stringify(body);
  }
  const r = await fetch(BASE + url, opts);
  const txt = await r.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
  return { status: r.status, body: json, text: txt };
}

(async () => {
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  BASE = 'http://127.0.0.1:' + server.address().port;
  console.log('Servidor de test en ' + BASE + '\n');

  /* ---------- paginación ---------- */
  console.log('--- paginación ---');
  let r = await req('GET', '/api/equipos');
  check(r.status === 200, 'GET /api/equipos responde 200', r.body);
  check(Array.isArray(r.body.items) && r.body.items.length === 10, 'devuelve 10 items por defecto', r.body.items && r.body.items.length);
  const p = r.body.paginacion || {};
  check(p.total === 12 && p.pages === 2 && p.page === 1 && p.limit === 10 && p.desde === 1 && p.hasta === 10,
    'metadata de paginación correcta (12 totales / 2 páginas)', p);

  r = await req('GET', '/api/equipos?page=2&limit=10');
  check(r.status === 200 && r.body.items.length === 2 && r.body.paginacion.desde === 11 && r.body.paginacion.hasta === 12,
    'segunda página trae los 2 restantes', r.body.paginacion);

  r = await req('GET', '/api/equipos?page=99&limit=10');
  check(r.status === 200 && r.body.items.length === 0 && r.body.paginacion.page === 99 && r.body.paginacion.total === 12,
    'página fuera de rango devuelve lista vacía (no error)', r.body.paginacion);

  r = await req('GET', '/api/equipos?limit=5');
  check(r.body.items.length === 5 && r.body.paginacion.pages === 3, 'limit=5 → 3 páginas', r.body.paginacion);

  r = await req('GET', '/api/clientes');
  check(r.status === 200 && r.body.paginacion.total === 12 && r.body.paginacion.pages === 2 &&
    r.body.paginacion.hasta === 10 && r.body.items.length === 10,
    'clientes paginados (12 · 2 páginas)', r.body.paginacion);
  r = await req('GET', '/api/clientes?page=2');
  check(r.status === 200 && r.body.items.length === 2 && r.body.paginacion.page === 2 &&
    r.body.paginacion.desde === 11 && r.body.paginacion.hasta === 12,
    'clientes página 2 (2 registros)', r.body.paginacion);

  r = await req('GET', '/api/kits');
  check(r.status === 200 && r.body.paginacion.total === 2 && r.body.items[0].desglose.length > 0,
    'kits paginados con desglose', r.body.paginacion);

  r = await req('GET', '/api/kits/todos');
  check(r.status === 200 && Array.isArray(r.body) && r.body.length === 2,
    '/api/kits/todos sigue siendo un array plano (selectores)', r.body);

  r = await req('GET', '/api/equipos/todos?q=sony');
  check(r.status === 200 && Array.isArray(r.body) && r.body.length === 2,
    '/api/equipos/todos?q=sony filtra (2)', r.body);

  /* ---------- catálogos con disponibilidad por fechas (formulario de reserva) ---------- */
  console.log('--- catálogos con disponibilidad por fechas ---');
  r = await req('GET', '/api/equipos/todos?inicio=2032-01-10&fin=2032-01-12');
  check(r.status === 200 && Array.isArray(r.body) && r.body.length === 12 &&
    r.body.every(e => typeof e.libre === 'boolean' && typeof e.motivo === 'string'),
    '/api/equipos/todos con fechas devuelve libre/motivo', r.body[0]);

  r = await req('GET', '/api/kits/todos?inicio=2032-01-10&fin=2032-01-12');
  check(r.status === 200 && Array.isArray(r.body) && r.body.length === 2 &&
    r.body.every(k => Array.isArray(k.desglose) && typeof k.completo === 'boolean'),
    '/api/kits/todos con fechas devuelve desglose y completo', r.body[0] && r.body[0].codigo);

  for (const [url, etiqueta] of [
    ['/api/equipos/todos?inicio=2032-01-10', 'equipos: inicio sin fin'],
    ['/api/kits/todos?fin=2032-01-12', 'kits: fin sin inicio'],
    ['/api/equipos/todos?inicio=2032-01-12&fin=2032-01-10', 'equipos: fin < inicio'],
    ['/api/kits/todos?inicio=2032-01-12&fin=2032-01-10', 'kits: fin < inicio'],
    ['/api/equipos/todos?inicio=2032-02-30&fin=2032-03-02', 'equipos: fecha inexistente']
  ]) {
    const res = await req('GET', url);
    check(res.status === 400 && res.body && res.body.error, `${etiqueta} → 400`, res.body);
  }

  /* ---------- validaciones de query ---------- */
  console.log('--- validaciones de query ---');
  for (const [url, etiqueta] of [
    ['/api/equipos?page=0', 'page=0'],
    ['/api/equipos?page=abc', 'page=abc'],
    ['/api/equipos?limit=0', 'limit=0'],
    ['/api/equipos?limit=101', 'limit=101'],
    ['/api/equipos?estado=INVENTADO', 'estado inválido'],
    ['/api/alquileres?estado=INVENTADO', 'estado de alquiler inválido'],
    ['/api/vencimientos?fecha=2026-02-30', 'fecha inexistente']
  ]) {
    const res = await req('GET', url);
    check(res.status === 400 && res.body && res.body.error, `${etiqueta} → 400`, res.body);
  }

  r = await req('GET', '/api/equipos?q=sony');
  check(r.body.paginacion.total === 2, 'filtro q=sony (2)', r.body.paginacion);
  r = await req('GET', '/api/equipos?q=%25');
  check(r.status === 200 && r.body.paginacion.total === 0, 'comodín LIKE escapado (% no matchea todo)', r.body.paginacion);
  r = await req('GET', '/api/equipos?categoria=Camaras&estado=DISPONIBLE');
  check(r.body.paginacion.total === 3, 'filtros combinados categoria+estado (3)', r.body.paginacion);

  r = await req('GET', '/api/disponibilidad');
  check(r.status === 400, 'disponibilidad sin params → 400', r.body);
  r = await req('GET', '/api/disponibilidad?equipo_id=1&inicio=2030-01-10&fin=2030-01-09');
  check(r.status === 400, 'disponibilidad con fin < inicio → 400', r.body);
  r = await req('GET', '/api/kits/9999/disponibilidad?inicio=2030-01-10&fin=2030-01-12');
  check(r.status === 404, 'kit inexistente → 404', r.body);
  r = await req('GET', '/api/kits?inicio=2030-01-10');
  check(r.status === 400, 'kits con solo inicio → 400', r.body);

  /* ---------- 404 / JSON inválido ---------- */
  console.log('--- errores de ruta y cuerpo ---');
  r = await req('GET', '/api/no-existe');
  check(r.status === 404 && r.body && r.body.error, 'ruta API desconocida → 404 JSON', r.body);
  r = await req('POST', '/api/clientes', '{"nombre":', { raw: true });
  check(r.status === 400 && /JSON/.test(r.body.error), 'JSON malformado → 400', r.body);

  /* ---------- alta de clientes / equipos ---------- */
  console.log('--- altas y validaciones de body ---');
  r = await req('POST', '/api/clientes', { nombre: 'A' });
  check(r.status === 400, 'cliente con nombre muy corto → 400', r.body);
  r = await req('POST', '/api/clientes', { nombre: 'Cliente OK', tipo: 'INVENTADO' });
  check(r.status === 400, 'cliente con tipo inválido → 400', r.body);
  r = await req('POST', '/api/clientes', { nombre: 'Cliente OK', whatsapp: 'no-es-tel' });
  check(r.status === 400, 'cliente con whatsapp inválido → 400', r.body);
  r = await req('POST', '/api/clientes', { nombre: 'Cliente Nuevo', tipo: 'AGENCIA', whatsapp: '+54 11 5555-1234' });
  check(r.status === 200 && r.body.id > 0, 'cliente válido → 200', r.body);

  r = await req('POST', '/api/equipos', { codigo: 'CAM SONY', nombre: 'Cámara' });
  check(r.status === 400, 'equipo con código inválido (espacio) → 400', r.body);
  r = await req('POST', '/api/equipos', { codigo: 'CAM-SONY-A7-01', nombre: 'Duplicado' });
  check(r.status === 409, 'equipo con código duplicado → 409', r.body);
  r = await req('POST', '/api/equipos', { codigo: 'TEST-01', nombre: 'Equipo Test', categoria_id: 999 });
  check(r.status === 400, 'equipo con categoría inexistente → 400', r.body);
  r = await req('POST', '/api/equipos', { codigo: 'TEST-01', nombre: 'Equipo Test', modelo: 'TEST-MOD', categoria_id: 1, precio_dia: 1000 });
  check(r.status === 200 && r.body.id > 0, 'equipo válido → 200', r.body);
  r = await req('GET', '/api/equipos');
  check(r.body.paginacion.total === 13, 'el equipo nuevo aparece en el total (13)', r.body.paginacion);

  /* ---------- alquileres ---------- */
  console.log('--- alquileres ---');
  r = await req('POST', '/api/alquileres', {});
  check(r.status === 400, 'alquiler sin datos → 400', r.body);
  r = await req('POST', '/api/alquileres', { cliente_id: 1, inicio: '2030-02-30', fin: '2030-03-02', equipo_ids: [1] });
  check(r.status === 400, 'alquiler con fecha inexistente → 400', r.body);
  r = await req('POST', '/api/alquileres', { cliente_id: 1, inicio: '2030-03-05', fin: '2030-03-01', equipo_ids: [1] });
  check(r.status === 400, 'alquiler con fin < inicio → 400', r.body);
  r = await req('POST', '/api/alquileres', { cliente_id: 999, inicio: '2030-03-01', fin: '2030-03-02', equipo_ids: [1] });
  check(r.status === 400, 'alquiler con cliente inexistente → 400', r.body);
  r = await req('POST', '/api/alquileres', { cliente_id: 1, inicio: '2030-03-01', fin: '2030-03-02', equipo_ids: [1, 1] });
  check(r.status === 400, 'alquiler con equipo repetido → 400', r.body);
  r = await req('POST', '/api/alquileres', { cliente_id: 1, inicio: '2030-03-01', fin: '2030-03-02' });
  check(r.status === 400, 'alquiler sin equipos ni kits → 400', r.body);
  r = await req('POST', '/api/alquileres', { cliente_id: 1, inicio: '2030-03-01', fin: '2030-03-02', equipo_ids: [9999] });
  check(r.status === 400, 'alquiler con equipo inexistente → 400', r.body);
  r = await req('POST', '/api/alquileres', {
    cliente_id: 1, inicio: '2030-03-01', fin: '2030-03-02', kits: [{ kit_id: 9999, cantidad: 1 }]
  });
  check(r.status === 400, 'alquiler con kit inexistente → 400', r.body);

  // Kit pedido 2 veces: solo hay 1 trípode → 409 con conflictos
  r = await req('POST', '/api/alquileres', {
    cliente_id: 1, inicio: '2030-04-01', fin: '2030-04-02', kits: [{ kit_id: 1, cantidad: 2 }]
  });
  check(r.status === 409 && Array.isArray(r.body.conflictos) && r.body.conflictos.length > 0,
    'pedir 2 kits iguales sin stock → 409 con conflictos', r.body);

  // Reserva válida
  r = await req('POST', '/api/alquileres', {
    cliente_id: 1, inicio: '2030-05-10', fin: '2030-05-12', equipo_ids: [1],
    garantia: { tipo: 'DNI_RETENIDO', detalle: 'test', monto: 0 }
  });
  check(r.status === 200 && r.body.alquiler_id > 0 && r.body.total === 45000 && r.body.dias === 3,
    'reserva válida: 3 días x 15000 = 45000', r.body);
  const alqId = r.body.alquiler_id;

  r = await req('POST', '/api/alquileres', {
    cliente_id: 1, inicio: '2030-05-10', fin: '2030-05-11', equipo_ids: [1]
  });
  check(r.status === 409, 'solape en las mismas fechas → 409 (R1)', r.body);

  r = await req('GET', '/api/alquileres');
  check(r.status === 200 && r.body.paginacion.total === 1 && r.body.items[0].equipos.length === 1 &&
    r.body.items[0].pagado === 0, 'listado paginado de alquileres con equipos y pagado', r.body.items[0]);
  r = await req('GET', '/api/alquileres?estado=RESERVADO');
  check(r.body.paginacion.total === 1, 'filtro por estado RESERVADO (1)', r.body.paginacion);
  r = await req('GET', '/api/alquileres?estado=DEVUELTO');
  check(r.body.paginacion.total === 0, 'filtro por estado DEVUELTO (0)', r.body.paginacion);
  r = await req('GET', '/api/alquileres?q=onda');
  check(r.body.paginacion.total === 1, 'búsqueda por cliente (1)', r.body.paginacion);
  r = await req('GET', '/api/alquileres?q=sony');
  check(r.body.paginacion.total === 1, 'búsqueda por equipo (1)', r.body.paginacion);

  r = await req('GET', '/api/alquileres/' + alqId);
  check(r.status === 200 && r.body.saldo === 45000 && r.body.garantias.length === 1,
    'detalle con saldo y garantía', { saldo: r.body.saldo });

  r = await req('GET', '/api/deudores');
  check(r.body.paginacion.total === 1 && r.body.items[0].saldo === 45000, 'deudores incluye el saldo (45000)', r.body.items);

  /* ---------- pagos ---------- */
  console.log('--- pagos ---');
  r = await req('POST', '/api/pagos', { alquiler_id: alqId, monto: 0 });
  check(r.status === 400, 'pago con monto 0 → 400', r.body);
  r = await req('POST', '/api/pagos', { alquiler_id: alqId, tipo: 'INVENTADO', monto: 1000 });
  check(r.status === 400, 'pago con tipo inválido → 400', r.body);
  r = await req('POST', '/api/pagos', { alquiler_id: 9999, monto: 1000 });
  check(r.status === 404, 'pago a alquiler inexistente → 404', r.body);
  r = await req('POST', '/api/pagos', { alquiler_id: alqId, monto: 999999 });
  check(r.status === 409, 'pago que supera el saldo → 409', r.body);
  r = await req('POST', '/api/pagos', { alquiler_id: alqId, tipo: 'SENA', medio: 'EFECTIVO', monto: 10000 });
  check(r.status === 200 && r.body.saldo === 35000, 'pago parcial: saldo 35000', r.body);
  r = await req('GET', '/api/alquileres/' + alqId);
  check(r.body.pagado === 10000 && r.body.saldo === 35000, 'el pago impacta en el detalle', { pagado: r.body.pagado, saldo: r.body.saldo });

  /* ---------- retiro / devolución ---------- */
  console.log('--- retiro y devolución ---');
  r = await req('POST', '/api/alquileres/' + alqId + '/retiro');
  check(r.status === 200, 'retiro con garantía → 200', r.body);
  r = await req('POST', '/api/alquileres/' + alqId + '/retiro');
  check(r.status === 409, 'retiro repetido → 409', r.body);
  r = await req('GET', '/api/equipos?estado=ALQUILADO');
  check(r.body.paginacion.total === 1, 'el equipo quedó ALQUILADO (1)', r.body.paginacion);

  r = await req('POST', '/api/alquileres', {
    cliente_id: 2, inicio: '2030-06-01', fin: '2030-06-02', equipo_ids: [2]
  });
  const alqSinGarantia = r.body.alquiler_id;
  check(r.status === 200 && alqSinGarantia > 0, 'reserva sin garantía → 200', r.body);
  r = await req('POST', '/api/alquileres/' + alqSinGarantia + '/retiro');
  check(r.status === 409 && /garant/i.test(r.body.error), 'retiro sin garantía → 409 (R3)', r.body);

  r = await req('POST', `/api/alquileres/${alqId}/devolucion`, { fecha: '2020-01-01' });
  check(r.status === 400, 'devolución anterior al retiro → 400', r.body);
  r = await req('POST', `/api/alquileres/${alqId}/devolucion`, { estado_equipos: { 1: 'ROTO' } });
  check(r.status === 400, 'estado de equipo inválido en devolución → 400', r.body);
  r = await req('POST', `/api/alquileres/${alqId}/devolucion`, { estado_equipos: { 2: 'DANADO' } });
  check(r.status === 400, 'equipo ajeno al alquiler en devolución → 400', r.body);
  r = await req('POST', `/api/alquileres/${alqId}/devolucion`, { estado_equipos: { 1: 'DANADO' } });
  check(r.status === 200, 'devolución con daño → 200', r.body);
  r = await req('GET', '/api/equipos?estado=MANTENIMIENTO');
  check(r.body.paginacion.total === 2, 'el equipo dañado pasó a MANTENIMIENTO (2 con el Rode)', r.body.paginacion);

  /* ---------- prórroga ---------- */
  console.log('--- prórroga y estado operativo ---');
  r = await req('POST', `/api/alquileres/${alqSinGarantia}/prorroga`, { nueva_fin: '2030-06-01' });
  check(r.status === 400, 'prórroga a fecha no mayor → 400', r.body);
  r = await req('POST', `/api/alquileres/${alqSinGarantia}/prorroga`, { nueva_fin: '2030-06-05' });
  check(r.status === 200 && r.body.dias === 5, 'prórroga válida → 200 (5 días)', r.body);

  r = await req('POST', '/api/equipos/estado', { equipo_id: 9999, estado: 'DISPONIBLE' });
  check(r.status === 404, 'estado de equipo inexistente → 404', r.body);
  r = await req('POST', '/api/equipos/estado', { equipo_id: 3, estado: 'INVENTADO' });
  check(r.status === 400, 'estado operativo inválido → 400', r.body);
  r = await req('POST', '/api/equipos/estado', { equipo_id: 3, estado: 'ALQUILADO' });
  check(r.status === 400, 'ALQUILADO manual sin alquiler → 400', r.body);
  r = await req('POST', '/api/equipos/estado', { equipo_id: 3, estado: 'MANTENIMIENTO', tipo_mantenimiento: 'X' });
  check(r.status === 400, 'tipo de mantenimiento inválido → 400', r.body);
  r = await req('POST', '/api/equipos/estado', { equipo_id: 3, estado: 'MANTENIMIENTO', tipo_mantenimiento: 'PREVENTIVO' });
  check(r.status === 200, 'mantenimiento preventivo → 200', r.body);

  /* ---------- kits: alta/baja ---------- */
  console.log('--- kits: alta y baja ---');
  r = await req('POST', '/api/kits', { codigo: 'KIT-TEST', nombre: 'Kit Test', componentes: [] });
  check(r.status === 400, 'kit sin componentes → 400', r.body);
  r = await req('POST', '/api/kits', {
    codigo: 'KIT-TEST', nombre: 'Kit Test',
    componentes: [{ modelo: 'CAM-SONY-A7', cantidad: 1 }, { modelo: 'CAM-SONY-A7', cantidad: 1 }]
  });
  check(r.status === 400, 'kit con modelo repetido → 400', r.body);
  r = await req('POST', '/api/kits', {
    codigo: 'KIT-TEST', nombre: 'Kit Test', componentes: [{ modelo: 'NO-EXISTE', cantidad: 1 }]
  });
  check(r.status === 400, 'kit con modelo inexistente → 400', r.body);
  r = await req('POST', '/api/kits', {
    codigo: 'KIT-TEST', nombre: 'Kit Test', precio_dia: 1000,
    componentes: [{ modelo: 'CAM-SONY-A7', cantidad: 1 }]
  });
  check(r.status === 200 && r.body.id > 0, 'kit válido → 200', r.body);
  const kitId = r.body.id;
  r = await req('POST', '/api/kits', {
    codigo: 'KIT-TEST', nombre: 'Otro', componentes: [{ modelo: 'CAM-SONY-A7', cantidad: 1 }]
  });
  check(r.status === 409, 'kit con código duplicado → 409', r.body);
  r = await req('GET', '/api/kits');
  check(r.body.paginacion.total === 3, 'el kit nuevo entra al catálogo (3)', r.body.paginacion);
  r = await req('DELETE', '/api/kits/' + kitId);
  check(r.status === 200, 'baja lógica de kit → 200', r.body);
  r = await req('DELETE', '/api/kits/' + kitId);
  check(r.status === 404, 'baja repetida → 404', r.body);
  r = await req('GET', '/api/kits/todos');
  check(r.body.length === 2, 'el kit dado de baja sale del catálogo (2)', r.body.length);

  /* ---------- resumen / vencimientos ---------- */
  console.log('--- panel ---');
  r = await req('GET', '/api/resumen');
  check(r.status === 200 && r.body.totalEquipos === 13 && Array.isArray(r.body.ingresos) && r.body.ingresos.length === 6,
    'resumen con KPIs y 6 meses de ingresos', { total: r.body.totalEquipos });
  r = await req('GET', '/api/vencimientos');
  check(r.status === 200 && r.body.paginacion && typeof r.body.paginacion.total === 'number',
    'vencimientos paginados', r.body.paginacion);
  r = await req('GET', '/api/modelos');
  check(r.status === 200 && Array.isArray(r.body) && r.body.length > 0, 'modelos agrupados', r.body.length);
  r = await req('GET', '/api/categorias');
  check(r.status === 200 && Array.isArray(r.body) && r.body.length === 6, 'categorías', r.body.length);

  /* ---------- catálogo con fechas: equipo ocupado ---------- */
  console.log('--- catálogo con fechas: equipo ocupado ---');
  r = await req('GET', '/api/equipos?estado=DISPONIBLE&limit=100');
  const libreId = r.body.items[0].id;
  const alta = await req('POST', '/api/alquileres', {
    cliente_id: 1, inicio: '2033-04-10', fin: '2033-04-11', equipo_ids: [libreId],
    garantia: { tipo: 'PAGARE', detalle: 'test catalogo', monto: 0 }
  });
  r = await req('GET', '/api/equipos/todos?inicio=2033-04-10&fin=2033-04-11');
  const eqOcupado = r.body.find(e => e.id === libreId);
  check(alta.status === 200 && eqOcupado && eqOcupado.libre === false &&
    /Ocupado/i.test(eqOcupado.motivo),
    'el catálogo con fechas marca como ocupado un equipo ya reservado', eqOcupado);

  console.log(fallos === 0 ? '\nTODOS LOS CHECKS DE API OK' : `\n${fallos} CHECK(S) FALLARON`);
  server.close();
  try { db.close(); } catch (e) { /* ya cerrada */ }
  process.exit(fallos === 0 ? 0 : 1);
})().catch(e => {
  console.error('ERROR EN EL TEST:', e);
  process.exit(1);
});
