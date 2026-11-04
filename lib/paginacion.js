// Paginación uniforme para los endpoints de listado.
// Params: ?page=1&limit=10   (limit acotado para no permitir volcar toda la tabla)
const { entero } = require('./validacion');

function paginacion(req, { limitePorDefecto = 10, limiteMax = 100 } = {}) {
  const page = entero(req.query.page, 'page', { min: 1, max: 100000, requerido: false, defecto: 1 });
  const limit = entero(req.query.limit, 'limit', {
    min: 1, max: limiteMax, requerido: false, defecto: limitePorDefecto
  });
  return { page, limit, offset: (page - 1) * limit };
}

function paginado(items, total, { page, limit }) {
  const pages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    items,
    paginacion: {
      page,
      limit,
      total,
      pages,
      desde: total ? (page - 1) * limit + 1 : 0,
      hasta: Math.min(page * limit, total)
    }
  };
}

module.exports = { paginacion, paginado };
