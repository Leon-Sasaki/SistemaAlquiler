# Sistema Alquiler — MVP (principiantes)

Stack elegido: **Node.js + Express + SQLite** (sin Python, que no está instalado; usan Node 24 que ya tienen).
Sin ORM, sin build: un solo `app.js` comentado + `schema.sql`.

## Arrancar
```
npm install
npm start
```
Abrir http://localhost:3000 desde celular o mostrador.

## Qué cubre (trazabilidad con HU)
- `GET /api/disponibilidad?equipo_id&inicio&fin` → HU01, reglas R1+R2
- `POST /api/alquileres` → HU02 (multiequipo, bloquea solape con 409)
- `POST /api/alquileres/:id/retiro` → HU03 (exige garantía R3)
- `POST /api/alquileres/:id/devolucion` → HU04 (R4+R5, calcula mora 1.5x)
- `GET /api/vencimientos` → HU05
- `POST /api/pagos` + garantía en reserva → HU06
- `GET /api/deudores` → HU07
- `POST /api/equipos/estado` → HU08

## Archivos
- `app.js` : servidor + lógica + pantalla única Bootstrap
- `schema.sql` : tablas
- `alquiler.db` : se crea solo al arrancar (no commitear si no quieren)
- `docs/` : modelo + historias
