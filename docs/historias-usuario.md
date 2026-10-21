# Historias de Usuario - MVP

## HU01 - Consultar disponibilidad real
**Como** empleado de mostrador **quiero** buscar un equipo y ver si está libre en un rango de fechas **para** no prometer por WhatsApp algo ocupado o roto.
- Criterios: ingreso equipo/categoría + fecha inicio/fin. Muestra LIBRE/OCUPADO + motivo (reservado por otro / en mantenimiento). Valida R1+R2.

## HU02 - Armar presupuesto / reserva multiequipo
**Como** empleado **quiero** armar un presupuesto con N equipos x rango de fechas **para** reservarlo.
- Criterios: calcula dias * precio_dia por ítem + total. Si un ítem solapa, bloquea solo ese ítem y avisa. Crea Alquiler en `RESERVADO`.

## HU03 - Registrar retiro (check-out)
**Como** galponero **quiero** marcar retiro con fecha real **para** saber qué está afuera.
- Criterios: exige R3. Cambia Alquiler a `ACTIVO`, Equipos a `ALQUILADO`, crea Movimiento RETIRO.

## HU04 - Registrar devolución (check-in con revisión)
**Como** recepción **quiero** registrar devolución con estado del equipo **para** cerrar o mandar a mantenimiento.
- Criterios: carga fecha_real + estado_recibido + observación. Si OK -> Equipo `DISPONIBLE`, Alquiler `DEVUELTO`. Si dañado -> `MANTENIMIENTO`. Si tarde -> calcula mora (R5).

## HU05 - Tablero "vence hoy / vencidos"
**Como** encargado **quiero** ver qué debe volver hoy y qué está vencido **para** reclamar.
- Criterios: lista por fecha_devolucion_prevista, resalta vencidos, muestra cliente + whatsapp.

## HU06 - Registrar seña, garantía y pagos
**Como** mostrador **quiero** cargar seña/garantía/pagos **para** saber quién debe plata.
- Criterios: no permite RETIRO sin garantía. Muestra total, pagado, saldo.

## HU07 - Ver deudores y mora
**Como** dueño **quiero** ver a fin de mes quién debe días o recargos **para** cobrar.
- Criterios: lista Alquileres con saldo>0 o mora>0, con días de atraso y monto.

## HU08 - Bloquear equipo por rotura
**Como** técnico **quiero** pasar un equipo a mantenimiento **para** que no lo alquilen.
- Criterios: cambia estado_operativo, bloquea R2, registra Movimiento.

## HU09 - Catalogo de kits promocionales
**Como** mostrador **quiero** ver los kits con su desglose y su precio **para** vender paquetes armados.
- Criterios: lista kit, componentes (modelo + cantidad), unidades libres/totales por componente, precio propio del kit (o suma de componentes si no tiene), estado DISPONIBLE/BLOQUEADO segun el rango de fechas.

## HU10 - Reservar kit con bloqueo en cadena
**Como** mostrador **quiero** reservar un kit **para** venderlo sin prometer un paquete incompleto.
- Criterios: la reserva es **todo o nada**. Se verifica la disponibilidad de TODOS los componentes antes de escribir; si uno choca, no se reserva nada y la respuesta informa el **recurso en conflicto** (equipo, codigo, motivo, rango, cliente). Al reservar se asignan unidades fisicas concretas y el precio del kit se prorratea entre sus lineas. Un equipo suelto ya reservado dentro de un kit no se puede volver a reservar (R1).

## R7 - Reglas adicionales de kits
- **R7.1 Atomicidad:** un kit se reserva completo o no se reserva (transaccion: BEGIN/COMMIT/ROLLBACK).
- **R7.2 Disponibilidad conjuntiva:** la disponibilidad del kit es el AND de la de cada componente (R1 + R2 aplicados a cada uno).
- **R7.3 Asignacion de unidades:** al reservar se eligen unidades fisicas concretas (la mas antigua disponible) y quedan registradas en detalle_alquiler con su kit_id.
- **R7.4 Check-in por unidad:** al devolver, cada unidad se revisa por separado; una danada va a MANTENIMIENTO y las demas a DISPONIBLE, sin bloquear el cierre del alquiler.
- **R7.5 Coherencia de precios:** el total del kit es exactamente su precio propio (prorrateado) o la suma de sus componentes; la mora (R5) se calcula sobre ese mismo total.

## Fuera de MVP (fase 2)
- Precios dinámicos por temporada, reportes PDF, notificaciones WhatsApp automáticas, usuarios/roles finos.
- Historico de ventas por kit (requiere guardar la cantidad de kits por alquiler, hoy inferida desde detalle_alquiler).
- Politica de reasignacion de unidades cuando una unidad de un kit se daña a mitad del alquiler.
