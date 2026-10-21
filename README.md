# Sistema Alquiler — MVP 1 + Kits Promocionales

Stack: **Node.js + Express + SQLite** (módulo nativo `node:sqlite`), frontend en `public/` con
Tailwind + Lucide + Chart.js por CDN. Sin ORM, sin build, sin bundler.

## Arrancar
```
npm install
npm start
```
Abrir http://localhost:3000 desde celular o mostrador. La base `alquiler.db` se crea sola con datos de ejemplo.

## Pantallas
Panel (KPIs, ingresos, disponibilidad por categoría, acciones rápidas) · Inventario · **Kits** · Alquileres · Clientes/Cobranza.

## API → Historia de usuario

| Endpoint | HU / Reglas |
|---|---|
| `GET /api/disponibilidad?equipo_id&inicio&fin` | HU01 · R1 + R2 |
| `POST /api/alquileres` | HU02 · multiequipo + kits, bloquea solape con **409** |
| `POST /api/alquileres/:id/retiro` | HU03 · R3 (exige garantía) |
| `POST /api/alquileres/:id/devolucion` | HU04 · R4 + R5 (mora 1.5x/día persistida) |
| `POST /api/alquileres/:id/prorroga` | R6 (prórroga solo si no colisiona) |
| `GET /api/vencimientos` | HU05 |
| `POST /api/pagos` | HU06 (SENA / SALDO / RECARGO_MORA) |
| `GET /api/deudores` | HU07 (saldo = presupuesto + mora − pagado) |
| `POST /api/equipos/estado` | HU08 (bloqueo por rotura) |
| `GET /api/kits?inicio&fin` | HU09 (catálogo + desglose + estado) |
| `GET /api/kits/:id/disponibilidad` | HU10 (recurso en conflicto) |
| `POST /api/kits` | alta de kit |
| `GET /api/resumen` | KPIs del panel |
| `GET /api/alquileres/:id` | detalle + saldo + garantía + pagos |

## Kits promocionales (nuevo requerimiento)
* `kits` + `kit_items` (modelo + cantidad) en `schema.sql`; `equipos.modelo` agrupa unidades del mismo producto.
* **Reserva todo-o-nada**: se validan TODOS los componentes antes de escribir (transacción `BEGIN/COMMIT/ROLLBACK`).
* Si uno choca, la respuesta 409 trae `conflictos[]` con equipo, código, motivo, rango y cliente.
* Precio propio del kit prorrateado entre sus líneas (total exacto); si no tiene precio propio, suma componentes.
* Check-in por unidad física: una dañada → `MANTENIMIENTO`, las demás → `DISPONIBLE`.

## Decisiones tomadas (pendientes de confirmación del cliente)
1. Precio propio del kit con descuento (fallback a suma de componentes).
2. Reserva de **unidades físicas concretas** (la más antigua disponible), no "cualquiera del modelo".
3. Se permite pedir un equipo suelto que pertenece a un kit (con deduplicación por equipo).
4. Mantenimiento diferenciado en `PREVENTIVO` / `CORRECTIVO` (ambos bloquean la reserva).

## Archivos
* `app.js` — servidor, reglas de negocio y API
* `schema.sql` — modelo de datos
* `public/` — `index.html`, `app.js`, `styles.css` (frontend)
* `docs/` — modelo de datos e historias de usuario
* `alquiler.db` — se crea solo al arrancar (ignorado por git)
