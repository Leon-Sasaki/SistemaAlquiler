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

## Fuera de MVP (fase 2)
- Precios dinámicos por temporada, reportes PDF, notificaciones WhatsApp automáticas, usuarios/roles finos.
