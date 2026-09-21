# Sistema de Alquiler Audiovisual - Modelo de Datos MVP

## 1. Entidades principales

### Categoria
- id, nombre (Cámaras, Lentes, Sonido, Luces, Generadores)

### Equipo (inventario físico, uno por unidad)
- id, codigo_inventario UNIQUE (ej: CAM-SONY-A7-01)
- categoria_id FK, nombre, descripcion
- valor_reposicion (USD/ARS, para garantía)
- estado_operativo: `DISPONIBLE | ALQUILADO | MANTENIMIENTO | DANADO | BAJA`
- Solo `DISPONIBLE` es reservable.

### Cliente
- id, tipo: `PRODUCTORA | AGENCIA | SONIDISTA | INDEPENDIENTE`
- nombre, whatsapp, email, dni_cuit
- historial_mora (calculado)

### Alquiler (cabecera, agrupa 1..N equipos)
- id, cliente_id FK
- estado: `PRESUPUESTO | RESERVADO | ACTIVO | VENCIDO | DEVUELTO | CANCELADO`
- fecha_retiro_prevista, fecha_devolucion_prevista
- fecha_retiro_real NULL, fecha_devolucion_real NULL
- total_presupuesto, total_mora (calculado), saldo (calculado)

### DetalleAlquiler (permite Sony A7 + consola en un presupuesto)
- alquiler_id FK, equipo_id FK
- precio_dia, subtotal = precio_dia * dias

### Pago
- id, alquiler_id FK, fecha, tipo: `SENA | SALDO | RECARGO_MORA`
- medio: `TRANSFERENCIA | EFECTIVO | OTRO`, monto

### Garantia
- id, alquiler_id FK, tipo: `PAGARE | DNI_RETENIDO | DEPOSITO | OTRO`
- detalle, monto_cubierto, devuelta: bool

### Movimiento (auditoría check-out / check-in)
- id, equipo_id FK, alquiler_id FK, fecha, tipo: `RETIRO | DEVOLUCION | INGRESO_MANT | EGRESO_MANT`
- estado_recibido, observacion, usuario

## 2. Reglas de negocio críticas

- **R1 No doble reserva:** un equipo no puede tener dos DetalleAlquiler con rangos solapados en estados `RESERVADO|ACTIVO|VENCIDO`.
  Solapa si: `nuevo.inicio <= existente.fin AND nuevo.fin >= existente.inicio`
- **R2 Estado bloqueante:** si `estado_operativo != DISPONIBLE`, rechazar reserva aunque esté libre en fechas.
- **R3 Retiro exige:** Alquiler en `RESERVADO` + Garantía registrada + Seña (a definir % mínimo).
- **R4 Devolución exige:** revisión de estado. Si `DANADO`, pasa a `MANTENIMIENTO` y bloquea futuras reservas.
- **R5 Mora automática:** si `hoy > fecha_devolucion_prevista AND fecha_devolucion_real IS NULL` => `VENCIDO`. Al devolver tarde: `dias_mora * precio_dia * factor_recargo`.
- **R6 Prórroga:** solo si no existe otra reserva que solape el rango extendido.

## 3. Diagrama (texto)

Cliente 1---N Alquiler 1---N DetalleAlquiler N---1 Equipo N---1 Categoria
Alquiler 1---N Pago
Alquiler 1---N Garantia
Equipo 1---N Movimiento
