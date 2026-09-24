# PRESUPUESTO · Sistema de Gestión de Alquiler de Equipamiento Audiovisual

| | |
|---|---|
| **Cliente** | Rental Visual BA – Alquiler de equipamiento audiovisual (Zona Norte / Capital) |
| **Proyecto** | Sistema web de alquiler, stock, devoluciones y cobranzas (MVP) |
| **Proveedor** | [Nombre de tu empresa / equipo] – Cuit: [__] – Contacto: [__] |
| **Fecha** | [Fecha de emisión] |
| **Validez de la oferta** | 15 días desde la fecha de emisión |
| **Versión** | Presupuesto v1.0 · Fase 1 (MVP) |

---

## 1. Objetivo

Construir un sistema **web (abre desde el celular o la PC del mostrador, sin instalar nada)** que reemplace la planilla Excel y permita:

- Saber en segundos si un equipo está **realmente disponible** para un rango de fechas (termina con la "doble reserva" por WhatsApp).
- Armar **presupuesto multiequipo** y reservarlo.
- Controlar el ciclo completo: **reserva → retiro (check-out) → devolución (check-in)** con revisión del estado físico.
- Cobrar **señas, saldos y moras**, y ver a fin de mes **quién debe plata**.
- Bloquear equipos rotos para que nadie los alquile.

---

## 2. Alcance (módulos incluidos)

| # | Módulo / funcionalidad | Reglas que cubre |
|---|---|---|
| HU01 | Consulta de disponibilidad real por equipo y rango | R1 (anti doble reserva), R2 (estado operativo) |
| HU02 | Presupuesto / reserva multiequipo con total en vivo | R1 |
| HU03 | Registro de retiro (check-out) con fecha real | R3 (exige garantía y seña) |
| HU04 | Devolución (check-in) con estado físico y mora | R4, R5 (mora 1.5x/día) |
| HU05 | Tablero "vence hoy / vencidos" | — |
| HU06 | Carga de garantías, señas y pagos | R3 |
| HU07 | Reporte de deudores y mora | R5 |
| HU08 | Bloqueo de equipos a mantenimiento | R2, R4 |
| — | Panel de indicadores (KPIs, ingresos por mes, disponibilidad por categoría) | — |
| — | Pantallas: Principal, Inventario, Alquileres, Clientes · uso en celular y mostrador | — |
| — | Documentación (modelo de datos, historias de usuario, manual breve) + capacitación al personal | — |

**Fuera de alcance en esta fase (opcional, ver punto 8):** precios dinámicos por temporada, reportes PDF, notificaciones WhatsApp automáticas, usuarios con roles, app móvil nativa.

---

## 3. Esfuerzo estimado por etapa

Horas-hombre a tarifa de mercado. Incluye proceso completo, no solo "escribir código".

| Etapa | Horas | % |
|---|---|---|
| Relevamiento y análisis funcional (entrevista, planilla actual, casos de uso) | 15 | 11% |
| Modelo de datos y definición de reglas de negocio (R1–R6) | 10 | 7% |
| Diseño de interfaz y prototipo (celular + mostrador) | 12 | 8% |
| Desarrollo backend (API REST, validaciones, conflictos, seguridad básica) | 32 | 23% |
| Desarrollo frontend (pantallas, modales, indicadores) | 26 | 18% |
| Pruebas funcionales (matriz por historia de usuario y criterios de aceptación) | 16 | 11% |
| Puesta en marcha: deploy, carga de datos iniciales, capacitación | 11 | 8% |
| Documentación y manual de usuario | 8 | 6% |
| Gestión de proyecto y comunicación | 12 | 8% |
| **Total fase 1** | **≈ 142 h** | **100%** |

> Equivalencia: **18 días-hombre**, dentro de un **cronograma de 4–5 semanas** (3 semanas de desarrollo + 1 a 2 de pruebas, deploy y capacitación).

---

## 4. Cálculo del valor

Tarifa promedio aplicada: **USD 18 / hora** (perfil semi-senior full-stack + analista/QA parcial).

| Concepto | Cálculo | Monto |
|---|---|---|
| Esfuerzo total Fase 1 | 142 h × USD 18 | **USD 2.556** |
| — · casos bajo/alto | 106–180 h × USD 15–20 | USD 1.590 – 3.600 |
| **Total ofrecido (redondeado)** | — | **USD 2.600** |
| En pesos (referencia) | × cotización USD [a actualizar al facturar] | ≈ ARS [calcular al momento] |

**Descuento por pago anticipado (30% seña al firmar):** −5%.

**Condiciones comerciales**

- 30% seña al firmar el presupuesto.
- 40% al hito demostrable (disponibilidad, reserva, retiro/devolución y mora funcionando).
- 30% contra entrega, capacitación y aceptación.
- Incluye **1 mes de garantía** sobre errores funcionales.

---

## 5. Justificación del valor

### 5.1 Es un desarrollo a medida, no un producto de estantería
No existe un software genérico que entienda el negocio concreto (equipos únicos con Nº de inventario, garantías tipo DNI retenido/pagaré/depósito, mora del 50% extra diario, check-out/check-in físico). Esto se diseña, programa y prueba a medida.

### 5.2 Las reglas de negocio son el corazón y el riesgo
Cada regla tiene casos límite y una falla en cualquier escenario implica **pérdida de dinero real** del cliente:

- **R1 – Anti doble reserva:** valida solapamiento de rangos (nuevo.inicio ≤ existente.fin y nuevo.fin ≥ existente.inicio). Una sola reserva duplicada justifica meses de "viva la pepa".
- **R2 – Estado bloqueante:** un equipo en mantenimiento no debe poder prometerse.
- **R3 – Retiro exigente:** nadie se lleva un equipo sin garantía y seña registradas.
- **R4 – Devolución con revisión:** si vuelve dañado, pasa a mantenimiento y se bloquea solo.
- **R5 – Mora automática 1.5x/día** sobre días de atraso.
- **R6 – Prórroga sin generar solapamientos.**

Son 6 reglas críticas + sus conflictos (rechazo con estado HTTP 409 y mensaje claro para el operador no técnico). Validarlas contra casos borde es la parte más cara y valiosa del proyecto.

### 5.3 El 45% del esfuerzo no es código
Análisis, diseño UX, pruebas, documentación, deploy y capacitación representan ~64 de 142 h. Es lo que separa "un script que funciona en mi máquina" de un **sistema que un galponero usa todos los días** sin romper nada.

### 5.4 Retorno de la inversión (por qué es barato comparado con el problema)
Hoy el cliente pierde dinero por:
- Equipos doble-reservados que arruinan una producción → queja, puteada, y a veces devolución de plata.
- Devoluciones sin anotar → equipos "perdidos" o robados que no se detectan.
- Deudores a fin de mes que nadie persigue → plata que nunca se cobra.

Un solo equipo extraviado o una sola producción perdida por doble reserva ya supera el valor del sistema. El presupuesto se amortiza con **la primera venta de equipo "recuperado"** que la planilla actual deja escapar.

### 5.5 Referencia de mercado
- Un desarrollo a medida equivalente en el mercado local se cotiza típicamente en el rango **USD 3.000 – 6.000**.
- La tarifa aplicada (USD 18/h) es **media dentro del mercado local** (juniors USD 10–15; seniors USD 20–35) para un perfil semi-senior que resuelve solo el proyecto completo.
- El precio ofrecido (≈ USD 2.600, 142 h) está **por debajo del rango de mercado**, a cambio de: pago por hitos, garantía de 1 mes y documentación completa.

### 5.6 Riesgos asumidos por el proveedor
- Cambios de alcance menores absorbidos durante el desarrollo.
- Garantía de 1 mes con correcciones sin costo.
- Capacitación del personal incluida (2 sesiones).
- Puesta en producción (hosting propio del cliente o recomendado) incluida en el hito de entrega.

---

## 6. Cronograma

| Semana | Hito |
|---|---|
| Semana 1 | Relevamiento firmado, modelo de datos y mockups aprobados |
| Semana 2–3 | Desarrollo backend y frontend; **hito demo** (disponibilidad, reserva, retiro/devolución, mora) |
| Semana 4 | Pruebas completas, ajustes, carga de datos reales |
| Semana 5 | Deploy, capacitación y acta de entrega |

---

## 7. Entregables

- Código fuente en repositorio Git con historial de commits.
- Base de datos inicial (Schema + datos de ejemplo/actuales).
- Manual de usuario breve (1 página por pantalla).
- Documentación técnica (modelo de datos + historias de usuario).
- Acta de entrega con criterios de aceptación firmados.

---

## 8. Fase 2 (opcional, futura)

A medida que el negocio crezca, cada módulo nuevo se cotiza sobre la base de esta fase:

| Módulo futuro | Estimación |
|---|---|
| Precios dinámicos por temporada | USD 400 – 700 |
| Reportes en PDF (factura, remito, resumen de mes) | USD 500 – 900 |
| Notificaciones WhatsApp automáticas (vencimientos/deudores) | USD 700 – 1.200 |
| Usuarios con roles y permisos | USD 500 – 900 |
| **Total Fase 2 (estimado)** | **USD 2.100 – 3.700** |

> Regla usada: cada módulo típico cuesta entre 60% y 80% de su equivalente en la Fase 1, porque ya existe la base técnica.

---

## 9. Firma

| Proveedor | Cliente |
|---|---|
| Nombre: ______________________ | Nombre: ______________________ |
| Firma: ______________________ | Firma: ______________________ |
| Fecha: ______________________ | Fecha: ______________________ |

*Presupuesto válido por 15 días. Los montos en pesos se ajustan a la cotización del dólar al momento de cada factura.*