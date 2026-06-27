# Crunchies — Sistema POS & Pedidos en Línea

Restaurante de pollo y alas en Piamonte, Cauca, Colombia. Este repositorio contiene el sistema completo: punto de venta (POS) para el personal, panel de cocina en tiempo real, y sitio web para clientes con pedidos en línea y delivery.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML + CSS + Vanilla JS ES Modules (sin build) |
| Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth (JWT) |
| Tiempo real | Supabase Realtime (`postgres_changes`) |
| Hosting | Vercel (sitio estático) |
| Recibos | jsPDF (formato 80 mm) |
| Gráficas | Chart.js v4 |

No hay bundler, no hay framework. Los módulos JS se sirven directamente con `import/export` nativo. El proyecto funciona con cualquier servidor HTTP estático.

---

## Flujo del Sistema

```
Cliente escanea QR / abre el sitio
        │
        ▼
  Navega el menú → agrega items → llena datos → hace pedido
        │
        ▼
  Orden llega a la cocina (Realtime) ──────────────────────────────────┐
        │                                                               │
        ▼                                                               ▼
  Staff ve la orden en el POS (orders.html)              Cocina ve la tarjeta en kitchen.html
        │                                                               │
        ▼                                                               ▼
  Cocina marca "Listo" ──────────────────────────────── Cliente ve el estado en mis-pedidos.html
        │
        ▼
  Mesero entrega → POS procesa pago → recibo PDF / WhatsApp
        │
        ▼
  Sistema suma puntos de lealtad al cliente
```

---

## Estructura del Proyecto

```
neon-y-sabor/
├── shared/
│   ├── supabase-client.js      ← Cliente Supabase + helpers fmt + TAX_RATE
│   └── css/
│       └── design-system.css   ← Variables, botones, cards, modales, tablas (base global)
│
├── customerSide/               ← Sitio público para clientes
│   ├── index.html              ← Menú con tabs de categoría + búsqueda
│   ├── auth.html               ← Login / Registro / Reset de contraseña
│   ├── order.html              ← Orden online (para llevar / domicilio)
│   ├── table-order.html        ← Orden desde la mesa vía QR
│   ├── mis-pedidos.html        ← Historial de pedidos + estado en vivo
│   ├── track.html              ← Seguimiento en tiempo real del pedido
│   ├── reservations.html       ← Hacer / ver reservaciones
│   ├── profile.html            ← Puntos de lealtad, historial, cuenta
│   ├── css/
│   │   ├── customer.css        ← Estilos del sitio público
│   │   ├── order.css           ← Layout de la página de pedidos
│   │   └── track.css           ← Stepper de seguimiento
│   └── js/
│       ├── auth.js
│       ├── menu.js
│       ├── order.js
│       ├── table-order.js
│       ├── mis-pedidos.js
│       ├── track.js
│       ├── reservations.js
│       ├── profile.js
│       └── utils.js
│
└── adminSide/                  ← Panel de personal (requiere auth)
    ├── login.html
    ├── dashboard.html          ← KPIs + gráficas en tiempo real
    ├── orders.html             ← Terminal POS (menú + ticket split-panel)
    ├── kitchen.html            ← Display de cocina (Realtime)
    ├── delivery.html           ← Gestión de pedidos a domicilio
    ├── tables.html             ← Mesas y zonas
    ├── payments.html           ← Historial de pagos + reimpresión + CSV
    ├── menu-management.html    ← CRUD platillos y categorías
    ├── reservations.html       ← Gestión de reservaciones
    ├── reports.html            ← Reportes de ventas, gastos, gráficas, CSV
    ├── customers.html          ← CRM clientes + ajuste de puntos
    ├── expense-tracker.html    ← Registro de gastos por categoría
    ├── css/admin.css           ← Layout sidebar/topbar + POS + cocina
    └── js/
        ├── admin-auth.js       ← Guard de auth + shell de la barra lateral
        ├── dashboard.js
        ├── orders.js           ← Lógica completa del POS + pago + recibo
        ├── kitchen.js          ← Suscripción Realtime + timer de órdenes
        ├── delivery.js
        ├── tables.js
        ├── payments.js
        ├── menu-management.js
        ├── reservations.js
        ├── reports.js
        ├── customers.js
        └── expense-tracker.js
```

---

## Módulos: Qué Hace Cada Uno

### Customer Side

| Página | Función |
|--------|---------|
| `index.html` | Vitrina pública del menú. Tabs de categoría, búsqueda en tiempo real, cards con imagen, precio y descripción. |
| `auth.html` | Login / registro / reset de contraseña. Tabs que cambian el formulario sin recargar. Redirige según rol. |
| `order.html` | Flujo de pedido online. Selector Para Llevar / Domicilio. Muestra zonas y costo de envío. Pago: Efectivo o Nequi (número 312 828 2045). |
| `table-order.html` | Lo mismo que `order.html` pero el tipo es `dine_in` y el número de mesa viene por URL query param (`?table=3`). |
| `mis-pedidos.html` | Historial de pedidos del cliente logueado. Stepper de pasos (Recibida → Cocina → Lista → Entregada). Se refresca cada 30 s. |
| `track.html` | Seguimiento de un pedido específico por ID. Para compartir el link al cliente sin login. |
| `reservations.html` | Formulario para hacer reservación (fecha, hora, personas, nombre, tel). Lista de las reservaciones del usuario. |
| `profile.html` | Saldo de puntos de lealtad, historial de transacciones, estadísticas del perfil, edición de nombre. |

### Admin Panel

| Página | Función | Roles |
|--------|---------|-------|
| `login.html` | Login del personal. Redirige a `dashboard.html` si es admin/waiter, a `kitchen.html` si es kitchen. | Todos |
| `dashboard.html` | 5 KPIs: ventas del día, ventas semana, mesas ocupadas, órdenes en cocina, gastos del día. Gráfica de ventas 7 días (línea), distribución de pagos (donut), top platillos, órdenes recientes. Auto-refresca cada 60 s. | admin, waiter |
| `orders.html` | Terminal POS. Panel izquierdo: menú con tabs + búsqueda. Panel derecho: ticket con items, totales, IVA. Modal de pago (efectivo/tarjeta/transferencia, cambio automático, búsqueda de cliente, canje de puntos). Modal de recibo con impresión y WhatsApp. | admin, waiter |
| `kitchen.html` | Display para la cocina. Sin sidebar. Dos columnas: "En Preparación" (badge amber) y "Listo para Servir" (badge verde). Timer por orden (verde < 15 min, amber 15–25, rojo > 25). Historial colapsable del día. Suscripción Realtime. | admin, kitchen |
| `delivery.html` | Tarjetas de pedidos de domicilio/takeout con nombre, dirección, items, estado, tiempo estimado, botones de avance de estado y asignación de repartidor. | admin, waiter |
| `tables.html` | Grid de mesas por zona. Estado: libre / ocupada / reservada. Asignación de mesero. | admin, waiter |
| `payments.html` | Tabla de pagos del día (filtrable por fecha). Totales por método. Reimpresión de recibo. Exportar CSV. | admin, waiter |
| `menu-management.html` | CRUD de categorías (modal) y platillos (modal). Upload de imagen (URL). Toggle de disponibilidad. | admin |
| `reservations.html` | Lista de todas las reservaciones. Filtro por fecha. Cambio de estado (pendiente → confirmada → cancelada). | admin, waiter |
| `reports.html` | Período configurable (7/30/90 días). 8 KPIs. 6 gráficas (ventas diarias, métodos de pago, categorías, gastos, ingresos vs gastos, top 10 platillos). Tabla detallada con filtros. Exportar CSV. | admin |
| `customers.html` | Lista de clientes con búsqueda. Historial de pedidos reales. Notas internas. Ajuste manual de puntos. | admin |
| `expense-tracker.html` | Registro diario de gastos por categoría (insumos, nómina, renta, servicios, etc.). Resumen del día. | admin |

---

## Base de Datos

### Tablas Principales

| Tabla | Descripción |
|-------|-------------|
| `profiles` | Extiende `auth.users`. Columnas: `role`, `full_name`, `phone`, `loyalty_points`. |
| `categories` | Categorías del menú (`name`, `sort_order`, `active`). |
| `menu_items` | Platillos (`name`, `description`, `price`, `image_url`, `category_id`, `available`, `featured`). |
| `restaurant_tables` | Mesas físicas (`number`, `zone`, `capacity`, `status`, `assigned_waiter_id`). |
| `orders` | Encabezado de orden. Columnas clave: `status`, `order_type`, `total`, `subtotal`, `tax`, `table_id`, `waiter_id`, `delivery_name`, `delivery_phone`, `delivery_address`, `delivery_fee`, `payment_method`, `customer_id`, `driver_id`. |
| `order_items` | Líneas de la orden (`order_id`, `item_name`, `quantity`, `item_price`, `notes`). |
| `payments` | Pagos procesados (`order_id`, `method`, `amount`, `change_given`, `cashier_id`). |
| `reservations` | Reservaciones (`date`, `time`, `party_size`, `guest_name`, `phone`, `notes`, `status`). |
| `expenses` | Gastos (`expense_date`, `category`, `amount`, `description`, `created_by`). |
| `loyalty_transactions` | Historial de puntos (`customer_id`, `points`, `type` earned/redeemed, `order_id`). |
| `delivery_zones` | Zonas de delivery (`name`, `price`, `estimated_minutes`, `active`). |
| `drivers` | Repartidores (`name`, `phone`, `active`). |

### Estados de una Orden (`orders.status`)

```
open → in_kitchen → ready → delivered → paid
                                      ↘ cancelled
```

### RLS (Row Level Security)

Todas las tablas tienen RLS activa. Políticas clave:

- `profiles`: cada usuario solo lee/edita la suya. Admin lee todas.
- `orders`: `customer` solo ve sus propias órdenes; `waiter`/`admin` ven todas.
- `menu_items`: lectura pública (anon); escritura solo admin.
- `order_items`: los clientes pueden insertar en órdenes propias; el personal ve todo.
- `expenses`, `drivers`, `delivery_zones`: solo admin.

---

## Roles de Usuario

| Rol | Acceso |
|-----|--------|
| `admin` | Todo: panel completo, reportes, gestión de menú, clientes, gastos. |
| `waiter` | POS, cocina, delivery, mesas, pagos, reservaciones, dashboard. |
| `kitchen` | Solo `kitchen.html` (display de cocina). |
| `customer` | Solo sitio público. No puede acceder al panel admin. |

El guard de autenticación vive en `adminSide/js/admin-auth.js`. Llama a `initAdminShell(allowedRoles)` al inicio de cada página admin y redirige a login si el rol no coincide.

---

## Configuración Inicial (5 Pasos)

### 1. Crear proyecto en Supabase

Ve a [supabase.com](https://supabase.com) → New Project → elige nombre y contraseña.

### 2. Ejecutar el schema

En el dashboard de Supabase → **SQL Editor** → New Query → pega el contenido de `supabase/schema.sql` → Run.

Luego ejecuta `supabase/seed.sql` para poblar categorías, platillos de ejemplo y mesas.

### 3. Activar Realtime

En Supabase → **Database → Replication** → activa las tablas `orders` y `order_items`.

### 4. Agregar credenciales

Abre `shared/supabase-client.js` y reemplaza:

```js
const SUPABASE_URL  = 'https://xxxx.supabase.co'
const SUPABASE_ANON = 'tu-anon-key'
```

Ambos valores están en: Supabase → **Project Settings → API**.

### 5. Crear cuentas de personal

En Supabase → **Authentication → Users** → Invite user (o usar el formulario de login).  
Luego en **Table Editor → profiles** → establece la columna `role`:

```
admin   → acceso completo
waiter  → POS, cocina, pagos, dashboard
kitchen → solo pantalla de cocina
```

---

## Ejecutar Localmente

Los ES Modules requieren un servidor HTTP — abrir los `.html` directamente con `file://` no funciona.

```bash
# VS Code: instala la extensión "Live Server" → click derecho en index.html → Open with Live Server

# Node
npx http-server . -p 8080

# Python
python -m http.server 8080
```

Luego abre `http://localhost:8080/customerSide/index.html` para el sitio de clientes  
o `http://localhost:8080/adminSide/login.html` para el panel.

---

## Despliegue

El proyecto se despliega en **Vercel** como sitio estático. No hay build ni servidor de Node — Vercel sirve los archivos directamente.

URL de producción: `crunchies.vercel.app`

Para desplegar:
1. Conecta el repositorio en [vercel.com](https://vercel.com)
2. Framework: **Other** (no framework)
3. Output directory: `.` (raíz del repo)
4. No hay variables de entorno — las credenciales de Supabase van directamente en `shared/supabase-client.js`

---

## Sistema de Diseño

### Paleta de Colores

| Variable | Valor | Uso |
|----------|-------|-----|
| `--green` | `#FF6600` | Acento primario (alias "green" por compatibilidad histórica) |
| `--amber` | `#FF9900` | Acento secundario, precios, advertencias |
| `--bg-0`  | `#0E0908` | Fondo de página |
| `--bg-2`  | `#1E1210` | Modales, panel POS ticket |
| `--bg-3`  | `#261510` | Cards, sidebar |
| `--text-primary`   | `#FFFFFF` | Texto principal |
| `--text-secondary` | `#BFA099` | Texto secundario |
| `--text-muted`     | `#7A5248` | Labels, placeholders |
| `--danger` | `#FF4455` | Errores, cancelaciones |

### Tipografía

- **Bangers** — Títulos display, marca CRUNCHIES, nombres de mesa en cocina.
- **Poppins** — Todo el cuerpo, **incluyendo números y precios**. Bangers no es legible en datos monetarios.

```css
--font:   'Poppins', system-ui, sans-serif;
--font-d: 'Bangers', 'Poppins', sans-serif;
```

---

## IVA y Totales

El IVA está configurado como **8%** (Colombia — restaurantes y bares) en `shared/supabase-client.js`:

```js
export const TAX_RATE = 0.08
```

Los totales se calculan con `calcTotals(subtotal)` que redondea a enteros (pesos colombianos no tienen decimales en la práctica).

---

## Puntos de Lealtad

- **Acumulación**: 1 punto por cada $1.000 COP gastados (configurado en `orders.js` y `payments.js`).
- **Canje**: máximo 50% del total de la orden. Valor: $1 COP por punto.
- **Gestión**: el staff puede ajustar puntos manualmente desde `customers.html`.
- **Historial**: tabla `loyalty_transactions` con tipo `earned` / `redeemed`.

---

## Realtime (Suscripciones Activas)

| Módulo | Canal | Evento |
|--------|-------|--------|
| `kitchen.js` | `postgres_changes` en `orders` | INSERT, UPDATE — refresca las columnas |
| `track.js` | `postgres_changes` en `orders` | UPDATE — actualiza el stepper del cliente |
| `delivery.js` | `postgres_changes` en `orders` | INSERT, UPDATE — actualiza las tarjetas de delivery |

---

## Datos del Restaurante

| | |
|-|-|
| **Nombre** | Crunchies |
| **Dirección** | Piamonte, Cauca, Colombia |
| **Teléfono / Nequi** | 312 828 2045 |
| **Horario** | Lun–Dom 6:30–15:30 y 16:00–23:00 |
| **Especialidad** | Pollo, alas y sabores de rancho |

---

## Mapeo Rápido: Funcionalidad → Archivo

| Necesito cambiar... | Archivo |
|---------------------|---------|
| Credenciales de Supabase | `shared/supabase-client.js` |
| IVA o cálculo de totales | `shared/supabase-client.js` — `TAX_RATE`, `calcTotals` |
| Colores del sistema | `shared/css/design-system.css` — variables `:root` |
| Layout del sidebar / topbar | `adminSide/css/admin.css` |
| Estilos del POS | `adminSide/css/admin.css` — sección `POS Layout` |
| Lógica del POS (items, ticket, pago) | `adminSide/js/orders.js` |
| Lógica de pago + recibo | `adminSide/js/payments.js` (historial) / `orders.js` (modal) |
| Datos del dashboard | `adminSide/js/dashboard.js` |
| Gráficas de reportes | `adminSide/js/reports.js` |
| Display de cocina | `adminSide/kitchen.html` + `adminSide/js/kitchen.js` |
| Menú para clientes | `customerSide/index.html` + `customerSide/js/menu.js` |
| Flujo de pedido online | `customerSide/order.html` + `customerSide/js/order.js` |
| Guard de autenticación | `adminSide/js/admin-auth.js` — `initAdminShell()` |
| Schema de la base de datos | `supabase/schema.sql` |
