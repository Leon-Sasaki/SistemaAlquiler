# Sistema Alquiler — MVP 1 · Kits Promocionales · Validaciones + Paginación

Stack: **Node.js + Express + SQLite** (módulo nativo `node:sqlite`), frontend en `public/` con
Tailwind + Lucide + Chart.js por CDN. Sin ORM, sin build, sin bundler.

> Requiere **Node.js ≥ 22.5** (por `node:sqlite`). Probado con Node 24.

## Arrancar
```
npm install
npm start
```
Abrir http://localhost:3000. La base `alquiler.db` se crea sola con datos de ejemplo:
**12 equipos, 12 clientes y 2 kits** (suficientes para ver la paginación de clientes en 2 páginas).

### Variables de entorno
| Variable | Default | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `DB_PATH` | `./alquiler.db` | Archivo SQLite. `:memory:` para tests |

## Tests
```
npm test
```
Corre **dos suites sin necesidad de levantar el servidor** (cada una crea su propia base `:memory:`
y escucha en un puerto efímero):

* `tests/api.test.js` — 98 checks: validaciones 400/404/409, paginación, filtros, solapes,
  garantía (R3), mora, devolución dañada (R4), prórroga (R6), kits todo-o-nada, pagos y sobrepago.
* `tests/smoke.js` — 55 checks: carga la UI real en jsdom: paginadores, búsqueda server-side, lupa,
  render de tablas, mensajes de validación, alta/baja de kit y flujo de reserva (fechas,
  disponibilidad y resumen).

## Pantallas
Panel (KPIs, ingresos, disponibilidad por categoría, acciones rápidas) · Inventario · **Kits** ·
Alquileres · Clientes/Cobranza. Inventario, kits, alquileres, clientes y deudores tienen
**paginador propio** y búsqueda/filtros resueltos en el servidor.

## Paginación (endpoints de listado)
`GET /api/equipos`, `/api/alquileres`, `/api/clientes`, `/api/kits`, `/api/deudores`, `/api/vencimientos`

| Parámetro | Valores | Default |
|---|---|---|
| `page` | entero ≥ 1 | `1` |
| `limit` | entero 1–100 | `10` (`6` en kits) |

Respuesta uniforme:
```json
{
  "items": [ ... ],
  "paginacion": { "page": 1, "limit": 10, "total": 12, "pages": 2, "desde": 1, "hasta": 10 }
}
```

Catálogos para selectores/lupa (array plano, sin paginar, con tope interno):
`/api/equipos/todos`, `/api/clientes/todos`, `/api/kits/todos`. Los de equipos y kits aceptan
`inicio` y `fin` (juntos) para devolver la disponibilidad real de ese rango (`libre`/`motivo`
por equipo, `completo` por kit) sin cambiar el formato de array.

### Formulario de reserva (3 pasos)
1. **Cliente y fechas** — al elegir el rango se calculan los días y se refresca la disponibilidad.
2. **Qué vas a alquilar** — kit completo con su desglose y semáforo de stock, más equipos sueltos
   con buscador; un equipo ocupado en ese rango no se puede agregar. El selector de kits marca
   `disponible` / `sin stock` según las fechas.
3. **Resumen y confirmación** — líneas con subtotal por días, total estimado y botón para limpiar.

### Filtros
* `/api/equipos?q=&categoria=&estado=` — busca en nombre, código, modelo y categoría.
* `/api/alquileres?q=&estado=` — busca por ref (`ALQ-12`), cliente, equipo o kit.
* `/api/clientes?q=` y `/api/deudores?q=` — nombre / whatsapp / tipo y nombre / ref.
* `/api/kits?q=&inicio=&fin=` — `inicio` y `fin` se envían juntos; habilitan el estado de disponibilidad.

Los comodines de SQL (`%`, `_`) se escapan en las búsquedas: `q=%` no devuelve todo.

## Validaciones
Centralizadas en `lib/validacion.js`; el middleware de `app.js` traduce `ErrorValidacion` a
**HTTP 400** con `{ error }`. Reglas destacadas:

* Fechas `YYYY-MM-DD` reales (rechaza `2026-02-30`), `fin ≥ inicio`, y **hoy** calculado en
  `America/Argentina/Buenos_Aires` (no se corre de día después de las 21:00).
* Textos con longitud mínima/máxima y `trim`; códigos solo `A-Z a-z 0-9 . _ -`.
* Montos/cantidades numéricos dentro de rango; IDs enteros ≥ 1.
* Estados y enums cerrados: estado de equipo, estado de alquiler, tipo/medio de pago,
  tipo de garantía, tipo de cliente y tipo de mantenimiento.
* `equipo_ids` sin repetidos; kits con componentes no repetidos y modelos existentes.
* Devolución: fecha no futura ni anterior al retiro; estados por equipo solo `DISPONIBLE`/`DANADO`;
  equipos ajenos al alquiler rechazados.
* Pago: monto > 0 y **no puede superar el saldo** (409).
* JSON malformado → 400; cuerpo > 100 kb → 413; ruta `/api/*` inexistente → 404 JSON.

Códigos de respuesta: **400** dato inválido · **404** recurso inexistente · **409** conflicto
(solape R1, sin stock, retiro sin garantía R3, sobrepago, código duplicado) · **413** cuerpo grande.

## API → Historia de usuario

| Endpoint | HU / Reglas |
|---|---|
| `GET /api/disponibilidad?equipo_id&inicio&fin` | HU01 · R1 + R2 |
| `POST /api/alquileres` | HU02 · multiequipo + kits, bloquea solape con **409** |
| `POST /api/alquileres/:id/retiro` | HU03 · R3 (exige garantía) |
| `POST /api/alquileres/:id/devolucion` | HU04 · R4 + R5 (mora 1.5x/día persistida) |
| `POST /api/alquileres/:id/prorroga` | R6 (prórroga solo si no colisiona) |
| `GET /api/vencimientos?fecha` | HU05 · paginado |
| `POST /api/pagos` | HU06 (SENA / SALDO / RECARGO_MORA) |
| `GET /api/deudores` | HU07 (saldo = presupuesto + mora − pagado) · paginado |
| `POST /api/equipos/estado` | HU08 (bloqueo por rotura) |
| `GET /api/kits?inicio&fin` | HU09 (catálogo + desglose + estado) · paginado |
| `GET /api/kits/:id/disponibilidad` | HU10 (recurso en conflicto) |
| `POST /api/kits` | alta de kit |
| `DELETE /api/kits/:id` | baja lógica (idempotente: 404 si ya estaba dada de baja) |
| `GET /api/resumen` | KPIs del panel |
| `GET /api/alquileres/:id` | detalle + saldo + garantía + pagos |

## Kits promocionales
* `kits` + `kit_items` (modelo + cantidad) en `schema.sql`; `equipos.modelo` agrupa unidades del mismo producto.
* **Reserva todo-o-nada**: se validan TODOS los componentes antes de escribir (transacción `BEGIN/COMMIT/ROLLBACK`).
* Si uno choca, la respuesta 409 trae `conflictos[]` con equipo, código, motivo, rango y cliente.
* Pedir varias unidades del mismo kit descuenta las unidades ya asignadas: si no alcanzan, **409**
  (antes se reservaba de menos en silencio).
* Precio propio del kit prorrateado entre sus líneas (total exacto); si no tiene precio propio, suma componentes.
* Check-in por unidad física: una dañada → `MANTENIMIENTO`, las demás → `DISPONIBLE`.

## Decisiones tomadas (pendientes de confirmación del cliente)
1. Precio propio del kit con descuento (fallback a suma de componentes).
2. Reserva de **unidades físicas concretas** (la más antigua disponible), no "cualquiera del modelo".
3. Se permite pedir un equipo suelto que pertenece a un kit (con deduplicación por equipo).
4. Mantenimiento diferenciado en `PREVENTIVO` / `CORRECTIVO` (ambos bloquean la reserva).

## Archivos
* `app.js` — servidor, reglas de negocio y API (exporta `{ app, db }` para los tests)
* `lib/validacion.js` — validaciones de entrada y `hoyAR()`
* `lib/paginacion.js` — parseo de `page/limit` y envelope de respuesta
* `schema.sql` — modelo de datos + índices de performance
* `public/` — `index.html`, `app.js` (frontend paginado)
* `tests/` — `api.test.js` y `smoke.js`
* `docs/` — modelo de datos, historias de usuario y presupuestos
* `alquiler.db` — se crea solo al arrancar (ignorado por git)
