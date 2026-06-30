# AUDIT.md — Sistema POS Crunchies SV
Fecha: 2026-06-28

---

## RESUMEN EJECUTIVO

El sistema está estructuralmente sano: stack correcto, Realtime implementado en kitchen y delivery, flujo de estados consistente. El ~70% de las funcionalidades críticas funciona o funciona parcialmente. El riesgo principal no es de código sino de **sincronización de migrations SQL**: el proyecto acumuló 14+ archivos SQL que deben haberse ejecutado en orden correcto en la DB de Supabase. El segundo riesgo es un **CHECK CONSTRAINT desincronizado** en `delivery_status` que puede estar bloqueando silenciosamente todo el panel de delivery. Si esos dos riesgos están resueltos en la DB en producción, el sistema es entregable con ajustes menores.

---

## ESTADO POR MÓDULO

| Módulo | Estado | Prioridad | Problema Principal |
|--------|--------|-----------|-------------------|
| adminSide/orders.html | ⚠️ PARCIAL | CRÍTICO | POS no muestra estado de la orden en tiempo real; mesero no sabe si ya está lista |
| adminSide/kitchen.html | ⚠️ PARCIAL | CRÍTICO | Realtime funciona, pero los modificadores de ítems **nunca aparecen** en las tarjetas de cocina |
| adminSide/delivery.html | ⚠️ PARCIAL | CRÍTICO | delivery_status CHECK CONSTRAINT puede estar bloqueando avances de estado |
| adminSide/payments.html | ✅ FUNCIONA | CRÍTICO | FK alias `payments_processed_by_fkey` depende de nombre auto-generado (probable, no garantizado) |
| customerSide/order.html | ⚠️ PARCIAL | CRÍTICO | Depende de múltiples columnas añadidas en migrations; falla silenciosamente si alguna falta |
| customerSide/index.html | ✅ FUNCIONA | CRÍTICO | Menú público carga correctamente con RLS pública |
| adminSide/dashboard.html | ⚠️ PARCIAL | IMPORTANTE | Depende de tabla `expenses` (expenses_create.sql); KPI de gastos rompe si no existe |
| adminSide/menu-management.html | ✅ FUNCIONA | IMPORTANTE | Requiere `modifier_groups` y tablas asociadas (modifiers_schema.sql) |
| customerSide/mis-pedidos.html | ✅ FUNCIONA | IMPORTANTE | Solo busca por teléfono; pedidos de mesa QR sin teléfono no aparecen |
| customerSide/track.html | ✅ FUNCIONA | IMPORTANTE | Realtime filtrado por ID; correcto y eficiente |
| adminSide/tables.html | ✅ FUNCIONA | SECUNDARIO | QR, gestión de mesas, estado funcional |
| adminSide/reservations.html | ✅ FUNCIONA | SECUNDARIO | CRUD completo con asignación de mesa |
| adminSide/reports.html | ⚠️ PARCIAL | SECUNDARIO | Depende de `expenses` y JOIN anidado `menu_items(categories(name))` |
| adminSide/customers.html | ✅ FUNCIONA | SECUNDARIO | Gestión de clientes, ajuste manual de puntos, notas |
| adminSide/expense-tracker.html | ⚠️ PARCIAL | SECUNDARIO | Depende de tabla `expenses` + columna `recurring` (expenses_create.sql) |
| customerSide/reservations.html | ✅ FUNCIONA | SECUNDARIO | Cliente puede crear/ver reservaciones |
| customerSide/profile.html | ✅ FUNCIONA | SECUNDARIO | Perfil + historial de puntos + cambio de contraseña |
| customerSide/auth.html | ✅ FUNCIONA | SECUNDARIO | Login/registro/reset completo con Supabase Auth |
| adminSide/finance.html | ❓ DESCONOCIDO | SECUNDARIO | Módulo financiero nuevo (datos mock en commit Responsive_Finance_modules_Mock_data) |
| adminSide/seed-runner.html | 🔲 HUÉRFANO | — | No existe seed-runner.js; HTML posiblemente tiene script inline |

---

## ERRORES CRÍTICOS (bloquean la entrega)

### ERROR 1 — delivery_status CHECK CONSTRAINT desincronizado
- **Archivo**: `supabase/add_order_columns.sql`, línea 11–13
- **Descripción**: `add_order_columns.sql` define el CHECK como `IN ('pending','assigned','in_transit','delivered')`. El código de `delivery.js` usa valores `'preparing'`, `'ready'`, `'on_the_way'` que **no están en ese constraint**. Si el constraint original está activo en la DB, cualquier llamada a `advanceStatus()` en delivery.js falla con error de Postgres.
- **Impacto**: El panel de delivery queda completamente roto — no puede avanzar ningún estado. El código nunca muestra el error al usuario (solo un toast "Error al actualizar").
- **Verificación**: `SELECT conname, consrc FROM pg_constraint WHERE conname LIKE '%delivery_status%';` en Supabase SQL Editor.
- **Fix si está roto**: `ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check; ALTER TABLE orders ADD CONSTRAINT orders_delivery_status_check CHECK (delivery_status IN ('pending','preparing','ready','on_the_way','delivered') OR delivery_status IS NULL);`

### ERROR 2 — kitchen.js no incluye order_item_modifiers en la query
- **Archivo**: `adminSide/js/kitchen.js`, línea 28
- **Descripción**: `.select('*, restaurant_tables(number), order_items(*)')` — el wildcard `*` en `order_items` no hace join automático a `order_item_modifiers`. La línea 100 intenta acceder `i.order_item_modifiers?.length` pero siempre es `undefined`. Los modificadores (extras, variaciones) nunca llegan a la pantalla de cocina.
- **Impacto**: Cocina no ve si un plato tiene modificaciones (ej. "sin cebolla", "término medio"). Error silencioso.
- **Fix**: cambiar a `order_items(*, order_item_modifiers(*))` en la línea 28.

### ERROR 3 — POS no tiene Realtime: el mesero no sabe cuándo una orden está lista
- **Archivo**: `adminSide/js/orders.js` — sin suscripción Realtime
- **Descripción**: `orders.js` nunca suscribe a `postgres_changes`. Si la cocina marca "Listo" en `kitchen.html`, el mesero no recibe ninguna notificación en el POS. No hay polling ni indicador de estado de la orden activa.
- **Impacto**: El mesero tiene que ir físicamente al panel de cocina o llamar por voz para saber que la orden está lista. Flujo operativo roto.
- **Fix**: agregar una suscripción Realtime en `orders.js` que actualice el estado visual del ticket actual cuando la orden cambie.

### ERROR 4 — Realtime no está garantizado habilitado en Supabase
- **Archivo**: `supabase/schema.sql`, líneas 217–219 (comentario)
- **Descripción**: El comentario final del schema.sql dice: "Go to: Supabase → Database → Replication → enable for orders, order_items". Esto es una acción **manual** en el dashboard de Supabase. Si no está habilitado, `kitchen.html` y `delivery.html` no se actualizan en tiempo real — requerirían recarga manual.
- **Impacto**: Toda la propuesta de valor del sistema (tiempo real en cocina/delivery) falla silenciosamente.
- **Verificación**: En Supabase → Database → Replication, verificar que `orders` y `order_items` están en la lista de tablas con Realtime activo.

### ERROR 5 — orders.js usa columnas que no están en el schema base
- **Archivo**: `adminSide/js/orders.js`, líneas 248–257 (INSERT de nueva orden)
- **Descripción**: El INSERT usa `order_type`, `delivery_name`, `delivery_phone`, `delivery_address`, `delivery_status` (de `add_order_columns.sql`), `driver_id`, `delivery_zone_id`, `delivery_fee` (de `delivery_management_schema.sql`), y `payment_method` (de `add_payment_method.sql`). Si cualquiera de esas migrations no se ejecutó, el INSERT falla.
- **Impacto**: El POS no puede crear órdenes takeout/delivery. Error devuelto: columna inexistente.
- **Fix**: Verificar en Supabase que las columnas existen: `SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' ORDER BY column_name;`

---

## PROBLEMAS DE UX

1. **POS (orders.html)** — El mesero no ve el estado de la orden activa en el ticket (si ya está `in_kitchen`, `ready`, etc.). No hay badge ni indicador de estado. El mesero está "ciego" después de enviar a cocina.

2. **POS (orders.html)** — El botón "Enviar a Cocina" no se deshabilita permanentemente después de enviar. Si el mesero agrega más ítems y vuelve a presionar, puede enviar duplicados al kitchen (la orden sí se actualiza, pero no hay confirmación clara de qué se envió ya y qué es nuevo).

3. **kitchen.html** — Sin notificación sonora cuando llega una orden nueva. En una cocina ruidosa, el staff tiene que estar mirando la pantalla constantemente.

4. **delivery.html** — No hay notificación sonora ni visual (flash/vibración) cuando llega una nueva orden de domicilio. El botón "Realtime dot" es muy discreto.

5. **orders.html flujo de delivery** — Cuando el mesero crea un pedido de tipo "delivery" desde el POS, los datos del cliente (nombre, teléfono, dirección) no se pre-validan antes del INSERT. La validación existe pero solo para takeout (nombre). Para delivery podría perderse la dirección.

6. **customerSide/order.html** — Si no hay zonas de delivery configuradas en la DB, el selector `deliveryZone` queda vacío y el cliente puede intentar un delivery sin zona. La validación en `placeOrder()` lo atrapa pero el UX es malo (el selector parece roto).

7. **mis-pedidos.html** — Solo muestra pedidos de los últimos 7 días. No hay mensaje claro de ese límite de tiempo en el UI.

---

## ESTADO DEL REALTIME

### kitchen.js
- Canal: `'kitchen-live'` — escucha `event: '*'` en tabla `orders` (sin filtro de status)
- ✅ Correcto: captura todos los cambios incluyendo transición `delivered`
- ❌ Sin cleanup de canal al salir de la página (page unload)
- ❌ Sin indicador visual de estado de conexión del canal
- ❌ Sin reconexión automática si el canal cae

### delivery.js
- Canal: `'delivery-orders'` — escucha `event: '*'` en tabla `orders`, filtra por `order_type` en el callback
- ✅ Dot indicator de conexión activo
- ✅ Animación visual al recibir cambio
- ✅ Toast de notificación en nuevas órdenes
- ❌ Sin cleanup al salir

### mis-pedidos.js
- Canal: `'mis-pedidos-live'` — escucha solo `event: 'UPDATE'`
- ✅ `realtimeChannel?.unsubscribe()` antes de suscribir nuevamente (cleanup correcto)
- ✅ Filtra solo UPDATE (eficiente)

### track.js
- Canal: `track-order-${id}` — filtro `id=eq.${id}` (más eficiente de todos)
- ✅ Solo actualiza el UI relevante, no recarga toda la página
- ❌ Sin cleanup al salir

### Requisito externo crítico
Realtime de Supabase requiere habilitación manual en el dashboard para las tablas `orders` y `order_items`. Sin esta acción, ninguno de los canales anteriores recibe datos.

---

## LO QUE FALTA CONSTRUIR DESDE CERO

1. **Sistema de portales con PIN** — completamente inexistente. Actualmente, cocina y delivery requieren login completo con email/contraseña de Supabase Auth. Un portal de PIN (ej. pantalla que pide un código de 4 dígitos y da acceso solo a `kitchen.html` o `delivery.html`) no existe en ningún archivo del proyecto. Esto se mencionó como funcionalidad deseada.

2. **Notificaciones web del navegador (Web Push / Notification API)** — cero implementación. No hay `Notification.requestPermission()` ni Service Worker en ningún archivo. Podría implementarse con la Notification API del navegador (sin servidor adicional) para alertas de nuevas órdenes en cocina/delivery.

3. **Indicador de estado de orden en POS** — el mesero envía a cocina y el ticket se congela. No hay badge de "EN COCINA ⏳" o "LISTO ✅" que se actualice via Realtime en `orders.html`.

4. **Notificación sonora en kitchen/delivery** — un simple `new Audio('beep.mp3').play()` al recibir nuevas órdenes. Nada implementado.

5. **adminSide/finance.html** — módulo financiero completo. El commit `Responsive_Finance_modules_Mock_data` sugiere que los datos son mock/demo, no reales. Necesita integración real con la tabla `expenses` y `payments`.

---

## DEUDA TÉCNICA

1. **14+ archivos SQL de migrations sin orden garantizado** — El proyecto acumuló `schema.sql`, `add_order_columns.sql`, `add_payment_method.sql`, `delivery_management_schema.sql`, `modifiers_schema.sql`, `anon_ordering_rls.sql`, `fix_tables_and_rls.sql`, `loyalty_points_fix.sql`, `expenses_create.sql`, `expenses_rls.sql`, `enable_realtime.sql`, `customer_notes_rls.sql`, `reorganize_tables.sql` y otros. No existe un archivo maestro de migrations ni documentación del orden de ejecución. Riesgo de inconsistencia entre ambientes.

2. **Credenciales expuestas en supabase-client.js** — La `SUPABASE_ANON` key está en texto claro en el repositorio. Para una anon key de Supabase esto es técnicamente aceptable (es pública por diseño), pero el comentario en el archivo dice "Replace these values" como si fueran un placeholder. Está bien como está, pero confunde.

3. **`window.changeQty` / `window.assignDriver` / etc.** — Varias funciones se exponen en `window` para ser llamadas desde `onclick` en HTML generado dinámicamente. Es un patrón funcional pero frágil: si el JS falla en cargar, los botones no tienen handler y fallan silenciosamente.

4. **`jsPDF` cargado desde CDN sin fallback** — `buildReceiptPDF()` hace `if (!window.jspdf) return null`. Si el CDN falla, no hay PDF. No hay mensaje de error al usuario.

5. **No hay manejo de errores de red en carga inicial** — si Supabase está caído o hay un error de red, la mayoría de módulos muestra una pantalla en blanco sin mensaje de error (los `if (error) toast(...)` solo funcionan si el módulo cargó inicialmente).

6. **Estructura de archivos HTML planos** — Para 18+ páginas HTML con sidebar/nav repetido, la estructura actual es manejable pero ya está al límite. Cualquier cambio en la navegación requiere editar todos los archivos HTML manualmente. Esto es un riesgo de mantenimiento, no un riesgo de funcionalidad para el 1 de julio.

---

## RIESGOS PARA EL 1 DE JULIO

| Prioridad | Riesgo | Probabilidad | Impacto |
|-----------|--------|--------------|---------|
| 🔴 1 | `delivery_status` CHECK CONSTRAINT activo con valores incorrectos | Media-Alta | El panel de delivery no avanza ningún estado |
| 🔴 2 | Realtime no habilitado en Supabase dashboard | Media | Cocina y delivery no se actualizan en tiempo real — requieren F5 manual |
| 🔴 3 | Alguna SQL migration no ejecutada en producción | Media | Múltiples módulos fallan con error de columna inexistente |
| 🟡 4 | kitchen.js no muestra modificadores | Alta (bug real) | Impacto operacional: cocina no ve instrucciones de personalización |
| 🟡 5 | POS sin Realtime: mesero no sabe cuándo está lista la orden | Alta (comportamiento actual) | Proceso operativo más lento, requiere comunicación verbal |
| 🟡 6 | finance.html con datos mock | Alta | Módulo financiero no muestra datos reales |
| 🟢 7 | Sin sistema de PIN para cocina/delivery | Certeza | Feature ausente, no rompe lo existente |
| 🟢 8 | Sin notificaciones push/sonoras | Certeza | Feature ausente, no rompe lo existente |
