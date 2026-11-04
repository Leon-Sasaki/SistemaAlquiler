// Validaciones de entrada reutilizables (sin dependencias externas).
// Todas lanzan ErrorValidacion, que el middleware de app.js traduce a HTTP 400.

class ErrorValidacion extends Error {
  constructor(mensaje, detalles = null) {
    super(mensaje);
    this.name = 'ErrorValidacion';
    this.status = 400;
    this.detalles = detalles;
  }
}

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const TZ = 'America/Argentina/Buenos_Aires';

// Fecha de hoy en Argentina (YYYY-MM-DD). Evita el corrimiento de día que
// produce toISOString() después de las 21:00 (UTC-3).
function hoyAR() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function fecha(valor, campo = 'fecha', { requerido = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (!requerido) return null;
    throw new ErrorValidacion(`${campo} es obligatorio (formato YYYY-MM-DD)`);
  }
  const s = String(valor).trim();
  const m = RE_FECHA.exec(s);
  if (!m) throw new ErrorValidacion(`${campo} debe tener formato YYYY-MM-DD`);
  const anio = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia)
    throw new ErrorValidacion(`${campo} no es una fecha válida`);
  return s;
}

function texto(valor, campo, { min = 1, max = 200, requerido = true, defecto = null } = {}) {
  if (valor === undefined || valor === null) {
    if (!requerido) return defecto;
    throw new ErrorValidacion(`${campo} es obligatorio`);
  }
  if (typeof valor !== 'string') throw new ErrorValidacion(`${campo} debe ser texto`);
  const s = valor.trim();
  if (!requerido && s.length === 0) return defecto;
  if (s.length < min) throw new ErrorValidacion(`${campo} debe tener al menos ${min} caracteres`);
  if (s.length > max) throw new ErrorValidacion(`${campo} no puede superar ${max} caracteres`);
  return s;
}

function entero(valor, campo, { min = 0, max = 1000000000, requerido = true, defecto = null } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (!requerido) return defecto;
    throw new ErrorValidacion(`${campo} es obligatorio`);
  }
  const n = Number(valor);
  if (!Number.isInteger(n)) throw new ErrorValidacion(`${campo} debe ser un número entero`);
  if (n < min || n > max) throw new ErrorValidacion(`${campo} debe estar entre ${min} y ${max}`);
  return n;
}

function decimal(valor, campo, { min = 0, max = 1000000000, requerido = true, defecto = null } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (!requerido) return defecto;
    throw new ErrorValidacion(`${campo} es obligatorio`);
  }
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new ErrorValidacion(`${campo} debe ser un número`);
  if (n < min || n > max) throw new ErrorValidacion(`${campo} debe estar entre ${min} y ${max}`);
  return Math.round(n * 100) / 100;
}

function opcion(valor, campo, permitidas, { requerido = true, defecto = null } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (!requerido) return defecto;
    throw new ErrorValidacion(`${campo} es obligatorio`);
  }
  if (!permitidas.includes(valor))
    throw new ErrorValidacion(`${campo} debe ser uno de: ${permitidas.join(', ')}`);
  return valor;
}

function arreglo(valor, campo, { max = 100, requerido = false } = {}) {
  if (valor === undefined || valor === null) {
    if (requerido) throw new ErrorValidacion(`${campo} es obligatorio`);
    return [];
  }
  if (!Array.isArray(valor)) throw new ErrorValidacion(`${campo} debe ser una lista`);
  if (valor.length > max) throw new ErrorValidacion(`${campo} no puede tener más de ${max} elementos`);
  return valor;
}

// Patrón para LIKE con escape de comodines (se usa con ESCAPE '\').
function patronLike(q) {
  return '%' + String(q).replace(/[\\%_]/g, (m) => '\\' + m) + '%';
}

module.exports = {
  ErrorValidacion,
  hoyAR,
  fecha,
  texto,
  entero,
  decimal,
  opcion,
  arreglo,
  patronLike
};
