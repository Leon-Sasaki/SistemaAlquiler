# PRESUPUESTO Y PLAN · Sistema de Gestión de Alquiler de Equipamiento Audiovisual (MVP 1)

| | |
|---|---|
| **Cliente** | Rental Visual BA – Alquiler de equipamiento audiovisual (Zona Norte / Capital) |
| **Proyecto** | Sistema web de alquiler, stock, devoluciones y cobranzas |
| **Proveedor** | [Nombre de tu empresa / equipo] – Cuit: [__] – Contacto: [__] |
| **Equipo** | 4 personas: Líder/PM · Desarrollador Backend · Desarrollador Frontend · UX/QA |
| **Alcance cotizado** | **MVP 1** (historias HU01–HU08 + panel + puesta en marcha) |
| **Fecha de emisión** | [Fecha] · Validez 15 días |

---

## 1. Resumen ejecutivo

- **Esfuerzo:** 210 h base + **20% de contingencia** = **252 h** de equipo (4 personas).
- **Duración:** 3 sprints de 2 semanas + 1 semana de cierre = **7 semanas** (≈ 30 días hábiles).
- **Precio fijo cerrado MVP 1: ARS 3.730.000** (incluye costos, herramientas y margen).
- **Cobro por hitos:** 30% anticipo · 40% demo funcional · 30% pase a producción.
- **Ajuste por inflación:** aplica a saldos e hitos de fases posteriores.

---

## 2. Estimación de esfuerzo: asignación de complejidad por requerimiento (MVP 1)

Estimación por **horas de equipo** (no por persona): es la suma de las horas de todos los roles que participan en cada ítem.

| ID | Requerimiento (MVP 1) | Complejidad | Horas base |
|---|---|---|---|
| HU01 | Consultar disponibilidad real por equipo y rango (R1 + R2) | Media | 12 |
| HU02 | Presupuesto / reserva multiequipo con anti doble-reserva | Media-Alta | 16 |
| HU03 | Registrar retiro / check-out con garantía y seña (R3) | Media | 12 |
| HU04 | Registrar devolución / check-in con revisión y mora 1.5x (R4 + R5) | **Alta** | 18 |
| HU05 | Tablero "vence hoy / vencidos" | Baja | 10 |
| HU06 | Registrar garantías, señas y pagos | Media | 14 |
| HU07 | Reporte de deudores y mora | Baja | 10 |
| HU08 | Bloquear equipo a mantenimiento | Baja | 8 |
| XP1 | Panel de indicadores (KPIs, ingresos por mes, disponibilidad) | Media | 16 |
| XT1 | Relevamiento y análisis funcional (entrevista, planilla actual) | — | 16 |
| XT2 | Modelo de datos + definición de reglas R1–R6 | — | 12 |
| XT3 | Diseño UX / mockups (celular + mostrador) | — | 14 |
| XT4 | QA integral y matriz de pruebas por historia | — | 16 |
| XT5 | Deploy, carga de datos y capacitación | — | 14 |
| XT6 | Documentación y manual de usuario | — | 10 |
| XT7 | Gestión y coordinación del equipo | — | 12 |
| | **Total horas base** | | **210** |

### Regla de contingencia (buffer)

- **`15–25%`** exigido por la consigna → aplicamos **20%**: 210 h × 1,20 = **252 h** presupuestadas.
- El buffer cubre: pruebas de calidad extra, errores imprevistos, y el despliegue a producción. Si sobra, se devuelve como plazo adelantado (no como descuento).

### Distribución de las 252 h por rol (para el cálculo de costos)

| Rol | Horas | % |
|---|---|---|
| Líder de Proyecto / Analista | 66 | 26% |
| Desarrollador Backend | 66 | 26% |
| Desarrollador Frontend | 58 | 23% |
| Diseño UX + QA | 62 | 25% |
| **Total** | **252** | **100%** |

---

## 3. Estructuración en sprints y cronograma (Gantt simplificado)

**Ritmo:** Sprints de 2 semanas. **Kickoff asumido:** lunes 28/09/2026 (ajustable a la firma).

| Semana | Fechas | Actividades | Sprint |
|---|---|---|---|
| S1 | 28/09–04/10 | Relevamiento con el cliente · inventario/planilla actual · modelo de datos · reglas R1–R6 · arquitectura | Sprint 1 |
| S2 | 05/10–11/10 | Mockups aprobados · base de datos + datos semilla · HU08 bloqueo · HU01 disponibilidad (backend) | Sprint 1 |
| S3 | 12/10–18/10 | HU01 completo (frontend) · HU02 reserva multiequipo con R1/R2 | Sprint 2 |
| S4 | 19/10–25/10 | HU03 retiro (R3) · HU04 devolución + mora (R4/R5) · **✅ DEMO funcional en entorno de pruebas (hito 2)** | Sprint 2 |
| S5 | 26/10–01/11 | HU05 vencidos · HU06 garantías, señas y pagos | Sprint 3 |
| S6 | 02/11–08/11 | HU07 deudores · Panel de KPIs · QA integral y matriz de pruebas | Sprint 3 |
| S7 | 09/11–15/11 | Correcciones de QA · **deploy a producción** · carga de datos reales · capacitación (2 sesiones) · manual · acta de entrega | Cierre |

### Objetivos de sprint (comprobables)

- **Sprint 1** – "Reservar con confianza": base + HU01 + HU02 + HU08 → *se puede buscar y reservar sin doble reserva.*
- **Sprint 2** – "Controlar el ciclo": HU03 + HU04 + HU05 → *check-in/check-out con mora y tablero de vencidos.* → **Demo del 40%.**
- **Sprint 3** – "Cobrar y ver la plata": HU06 + HU07 + Panel.
- **Cierre** – Pase a producción, capacitación y acta de entrega.

### Fecha de entrega del MVP 1

**Viernes 13/11/2026** (fin de la semana 7), si el kickoff es el 28/09/2026 — equivalente a **30 días hábiles** desde el kickoff. Es una fecha construida sobre iteraciones, no al azar: si una sprint se atrasa, se re-planifica la siguiente con su impacto visible.

### Fases siguientes (alto nivel)

| Fase | Alcance | Alta estimación |
|---|---|---|
| MVP 2 | Precios dinámicos por temporada · reportes PDF · notificaciones WhatsApp | 8–10 semanas adicionales |
| MVP 3 | Usuarios con roles/perfilado · app móvil / integración contable | 8–12 semanas adicionales |

*Cada MVP se cotiza por separado (con su propio costo y cláusula de inflación).*

---

## 4. Cálculo del presupuesto: costos directos

### Valor por hora (regla del ejemplo de la consigna)

Base: *"un dev Jr de Front en Argentina gana ≈ $1.500.000 por mes"*.

> **Mes comercial = 22 días hábiles × 8 h = 176 h/mes.**
> Dev Jr Frontend → $1.500.000 ÷ 176 h = **$8.523/h**.

Los demás roles se estiman como múltiplos del base según seniority:

| Rol | Sueldo mensual ref. (ARS) | Valor/hora |
|---|---|---|
| Desarrollador Frontend (Jr – referencia) | $1.500.000 | **$8.523** |
| Desarrollador Backend (semi-senior, 1,4×) | $2.100.000 | **$11.932** |
| Líder / PM / Analista (semi-senior, 1,3×) | $1.950.000 | **$11.080** |
| Diseño UX + QA (semi-senior, 1,1×) | $1.650.000 | **$9.375** |

### Costo directo total (252 h con contingencia)

| Rol | Horas | Valor/h | Costo directo |
|---|---|---|---|
| Líder de Proyecto / Analista | 66 | $11.080 | $731.280 |
| Desarrollador Backend | 66 | $11.932 | $787.512 |
| Desarrollador Frontend | 58 | $8.523 | $494.334 |
| Diseño UX + QA | 62 | $9.375 | $581.250 |
| **Total costos directos** | **252** | — | **$2.594.376** |

---

## 5. Costos indirectos y margen

Según la consigna, sobre los costos directos se aplica:

| Concepto | % | Sobre | Monto |
|---|---|---|---|
| **Costos directos** | — | — | $2.594.376 |
| **Costos indirectos** (herramientas: servidor, dominio, licencias, tooling de QA) | 15% | directos | $389.156 |
| **Base de costo** | — | directos + indirectos | $2.983.532 |
| **Margen de ganancia operativa** | 25% | base | $745.883 |
| **TOTAL MVP 1** | — | — | **$3.729.416** |

> **Precio fijo cerrado: ARS 3.730.000** (redondeado).
> Rango si se varía el margen entre 10% y 30%: **ARS 3.280.000 – 3.880.000**. Elegimos 25% para asegurar rentabilidad del equipo.
> Referencia en USD: **≈ USD 2.700–2.900** según cotización al momento de facturar.

### Tabla de cotización resumida

| Concepto | Monto (ARS) |
|---|---|
| Anticipo 30% (a la firma) | **$1.119.000** |
| Hito demo 40% (fin Sprint 2) | **$1.492.000** |
| Pase a producción 30% (entrega) | **$1.119.000** |
| **Total MVP 1** | **$3.730.000** |

---

## 6. Estructura de pagos (cobro atado al progreso)

Nunca financiamos el proyecto con nuestro flujo de caja: el cobro avanza con el trabajo real.

| Hito | % | Cuándo | Monto (ARS) |
|---|---|---|---|
| **1. Anticipo** | 30% | A la firma del acuerdo · asegura disponibilidad del equipo e inicio del diseño de arquitectura | $1.119.000 |
| **2. Entrega intermedia** | 40% | Presentación de **demo funcional en entorno de pruebas** con las características principales operativas (disponibilidad, reserva, retiro, devolución y mora) al cierre del Sprint 2 | $1.492.000 |
| **3. Pase a producción** | 30% | Software terminado, funcionando en el servidor del cliente, código fuente transferido, capacitación y acta firmada | $1.119.000 |

*Las etapas siguientes (MVP 2, MVP 3) se facturan con el mismo esquema por hitos.*

---

## 7. Ajuste por inflación (cláusula)

Como el plan puede volverse un vínculo de largo plazo:

- **Dentro del MVP 1:** el precio de **ARS 3.730.000 es cerrado** mientras la duración pactada (7 semanas) se cumpla.
- **Saldo diferido:** si un hito se cobra más de 30 días después de su fecha prevista, el monto pendiente se recalcula con la variación del **IPC (INDEC)** o de la cotización del dólar entre ambas fechas.
- **Fases siguientes:** cada MVP nuevo se cotiza con su propio costo + **% de ajuste por inflación a negociar al momento de firmar esa fase** (se propone el mismo mecanismo IPC/dólar, sobre el saldo pendiente de cada hito).

> Ejemplo: si entre el presupuesto y la facturación del hito 2 pasan 2 meses y el IPC varió 12%, el hito de $1.492.000 se ajusta a $1.492.000 × 1,12 ≈ **$1.671.000**.

---

## 8. Entregables

- Código fuente en repositorio Git con historial de commits.
- Documentación técnica (modelo de datos + historias de usuario).
- Mockups/prototipos aprobados.
- Manual de usuario (1 página por pantalla).
- Matriz de pruebas ejecutada con resultados.
- Acta de entrega con criterios de aceptación firmados.

---

## 9. Firma

| Proveedor | Cliente |
|---|---|
| Nombre: ______________________ | Nombre: ______________________ |
| Firma: ______________________ | Firma: ______________________ |
| Fecha: ______________________ | Fecha: ______________________ |

*Presupuesto válido por 15 días.*