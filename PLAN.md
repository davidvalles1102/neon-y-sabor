# PLAN.md — Sistema POS Crunchies SV
Fecha: 2026-06-28
Basado en: AUDIT.md

---

## RESUMEN DEL PLAN

5 fases, estimado total ~22-26 horas de trabajo.

| Fase | Objetivo | Estimado | Estado al completar |
|------|----------|----------|-------------------|
| 1 — Estabilización | Cero errores bloqueantes | 3-4 h | Sistema entregable el 1 de julio |
| 2 — Portales con PIN | 3 portales operativos sin Supabase Auth login | 10-12 h | Staff entra con PIN de 6 dígitos |
| 3 — Simplificación UX | POS, cocina y delivery más rápidos | 5-6 h | Mesero completa pedido en < 30 segundos |
| 4 — Notificaciones web | 4 tipos de alerta automáticas | 3-4 h | Sistema avisa sin que nadie esté mirando |
| 5 — Deuda técnica | Código limpio, migrations documentadas | 1-2 h | Base sana para post-julio |

**Orden obligatorio:** Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5.
Las fases 3 y 4 pueden ejecutarse en paralelo una vez que la Fase 2 esté completa.

---

## CRITERIO DE ÉXITO GLOBAL

El sistema está completo cuando:
1. Un mesero puede tomar un pedido en el POS, enviarlo a cocina y cobrar — sin tocar Supabase Auth login en operación diaria
2. El cocinero ve cada orden con modificadores incluidos, y el panel se actualiza solo cuando llega algo nuevo
3. Delivery ve pedidos ordenados por espera, puede asignar repartidor y avanzar el estado
4. El admin puede crear/revocar PINs de staff sin tocar la base de datos directamente
5. El sistema lanza notificaciones del navegador cuando hay órdenes demoradas o pedidos nuevos

---

## FASE 1 — ESTABILIZACIÓN
**Objetivo:** El sistema funciona end-to-end sin errores bloqueantes para el 1 de julio.
**Tiempo estimado:** 3-4 horas
**Criterio de éxito:** Un mesero puede crear orden → cocina la ve con modificadores → delivery avanza estados → pago registrado.

---

### Tareas:

**1.1 — Verificar y corregir el CHECK CONSTRAINT de `delivery_status`**
- Archivo: `supabase/` (ejecutar en Supabase SQL Editor)
- Acción: Verificar en la DB el constraint activo. Si tiene los valores del `add_order_columns.sql` original (`pending`,`assigned`,`in_transit`,`delivered`), eliminarlo y recrearlo con los valores que usa el código (`pending`,`preparing`,`ready`,`on_the_way`,`delivered`).
- SQL a ejecutar:
  ```sql
  -- Verificar
  SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid = 'orders'::regclass AND conname LIKE '%delivery_status%';
  
  -- Corregir si es necesario
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;
  ALTER TABLE orders ADD CONSTRAINT orders_delivery_status_check
    CHECK (delivery_status IN ('pending','preparing','ready','on_the_way','delivered') OR delivery_status IS NULL);
  ```
- Impacto: desbloquea todo el panel de delivery

**1.2 — Corregir query en kitchen.js para incluir `order_item_modifiers`**
- Archivo: `adminSide/js/kitchen.js`, línea 28
- Acción: Cambiar `.select('*, restaurant_tables(number), order_items(*)')` a `.select('*, restaurant_tables(number), order_items(*, order_item_modifiers(*))')`
- También en `loadHistory()` línea 146: mismo fix
- Impacto: los modificadores (variaciones, extras, notas de personalización) aparecen en cocina

**1.3 — Agregar indicador de estado de orden en el POS (Realtime)**
- Archivo: `adminSide/js/orders.js`
- Acción: Suscribir a `postgres_changes` en la orden activa. Cuando el status cambie a `ready`, mostrar un badge visible en el ticket ("✅ ORDEN LISTA — llevar a la mesa") con sonido de alerta opcional.
- No requiere nuevo modal: solo actualizar el `renderTicket()` existente para mostrar el estado con color.
- Impacto: el mesero sabe cuándo la comida está lista sin ir a kitchen.html

**1.4 — Verificar y habilitar Realtime en Supabase**
- Acción manual en Supabase dashboard: Database → Replication → activar para tablas `orders` y `order_items`
- Documentar en README el paso como requisito de deployment
- Impacto: sin esto, kitchen.html y delivery.html no se actualizan en tiempo real

**1.5 — Verificar que todas las SQL migrations están aplicadas en producción**
- Acción: Ejecutar en Supabase SQL Editor:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'orders'
  ORDER BY column_name;
  ```
  Verificar que existen: `order_type`, `delivery_name`, `delivery_phone`, `delivery_address`, `delivery_status`, `driver_id`, `delivery_zone_id`, `delivery_fee`, `payment_method`
- Si alguna columna falta: ejecutar el SQL de migration correspondiente
- Verificar también que existen las tablas: `drivers`, `delivery_zones`, `modifier_groups`, `modifier_options`, `menu_item_modifier_groups`, `order_item_modifiers`, `expenses`
- Impacto: el POS puede crear órdenes de todos los tipos

---

### Cómo verificar que la Fase 1 está completa:
- [ ] Panel de delivery puede avanzar un pedido de `pending` → `preparing` → `ready` → `on_the_way` → `delivered` sin error
- [ ] En kitchen.html, una orden con modificadores (ej. "sin cebolla") muestra los modificadores en la tarjeta
- [ ] En orders.html, cuando se marca una orden como "lista" desde kitchen.html, el ticket del mesero muestra el cambio de estado sin recargar
- [ ] En Supabase → Database → Replication, `orders` y `order_items` tienen Realtime activo
- [ ] La query `SELECT column_name FROM information_schema.columns WHERE table_name = 'orders'` devuelve al menos 15 columnas incluyendo todas las de delivery

---

## FASE 2 — PORTALES CON PIN
**Objetivo:** Los 3 portales (cocina, delivery, mesero) funcionan con autenticación por PIN sin que el staff necesite saber emails ni contraseñas de Supabase Auth.
**Tiempo estimado:** 10-12 horas
**Criterio de éxito:** Un cocinero ingresa su PIN en `/portal/kitchen/` y ve sus órdenes. PIN incorrecto muestra error. Al cerrar la pestaña, la sesión desaparece.

---

### Decisión técnica de autenticación (documentada):

El sistema de PIN no puede simplemente bypassear Supabase Auth porque las políticas RLS actuales requieren `auth.uid()` con un perfil de rol `kitchen`/`waiter`/etc. para poder leer/escribir órdenes. Opciones evaluadas:

**Opción elegida — Cuentas compartidas por rol (ponytail, sin nuevo backend):**
- Se crean 3 cuentas de Supabase Auth dedicadas: `cocina@crunchies.sv`, `delivery@crunchies.sv`, `mesero@crunchies.sv` (setup único, manual, por el admin)
- Cada cuenta tiene su `profiles.role` correcto en la DB
- Al verificar el PIN, una función RPC (SECURITY DEFINER) devuelve los credentials de la cuenta compartida para ese rol
- El cliente hace `supabase.auth.signInWithPassword()` con esos credentials — todo RLS existente funciona sin cambios
- La contraseña de las cuentas compartidas nunca aparece en el JS cliente — solo en la función RPC del servidor Supabase
- El PIN es la llave del portal; la cuenta compartida es la identidad de Supabase

**Implicación:** si alguien extrae la contraseña de la cuenta compartida desde el RPC (requiere esfuerzo activo), puede acceder al panel de kitchen. Para un restaurante pequeño, este nivel de seguridad es adecuado. La cuenta admin permanece con login normal y contraseña propia.

---

### Tareas:

**2.1 — Crear tabla `staff_pins` en Supabase**
- Archivo nuevo: `supabase/staff_pins_schema.sql`
- Schema:
  ```sql
  CREATE TABLE public.staff_pins (
    id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    pin         varchar(6) NOT NULL UNIQUE,
    staff_name  varchar(100) NOT NULL,
    role        text NOT NULL CHECK (role IN ('kitchen','delivery','waiter')),
    active      boolean DEFAULT true,
    last_login  timestamptz,
    created_at  timestamptz DEFAULT now()
  );
  ALTER TABLE public.staff_pins ENABLE ROW LEVEL SECURITY;
  -- Solo admin puede leer y escribir
  CREATE POLICY "staff_pins_admin_only" ON public.staff_pins FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
  ```
- Crear RPC para verificar PIN (SECURITY DEFINER — puede leer la tabla sin exponer credentials):
  ```sql
  CREATE OR REPLACE FUNCTION public.verify_staff_pin(p_pin TEXT)
  RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
  DECLARE r RECORD;
  BEGIN
    SELECT id, staff_name, role INTO r FROM public.staff_pins
    WHERE pin = p_pin AND active = true;
    IF NOT FOUND THEN RETURN NULL; END IF;
    UPDATE public.staff_pins SET last_login = NOW() WHERE pin = p_pin;
    RETURN json_build_object('staff_name', r.staff_name, 'role', r.role);
  END; $$;
  GRANT EXECUTE ON FUNCTION public.verify_staff_pin TO anon, authenticated;
  ```
- Crear segunda RPC para get credentials (usada solo internamente por `pin-auth.js` después de verificar PIN):
  Esta función devuelve el email de la cuenta compartida del rol. La contraseña se almacena en Supabase Vault o como constante en la función (SECURITY DEFINER, no expuesta al cliente).
  ```sql
  CREATE OR REPLACE FUNCTION public.get_role_session_token(p_pin TEXT)
  RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
  DECLARE r RECORD; role_email text; role_pass text;
  BEGIN
    SELECT role INTO r FROM public.staff_pins WHERE pin = p_pin AND active = true;
    IF NOT FOUND THEN RETURN NULL; END IF;
    -- Hardcoded shared credentials per role (kept server-side only)
    CASE r.role
      WHEN 'kitchen'  THEN role_email := 'cocina@crunchies.sv';  role_pass := 'KITCHEN_PASS_HERE';
      WHEN 'delivery' THEN role_email := 'delivery@crunchies.sv'; role_pass := 'DELIVERY_PASS_HERE';
      WHEN 'waiter'   THEN role_email := 'mesero@crunchies.sv';  role_pass := 'WAITER_PASS_HERE';
    END CASE;
    RETURN json_build_object('email', role_email, 'password', role_pass);
  END; $$;
  GRANT EXECUTE ON FUNCTION public.get_role_session_token TO anon;
  ```
- Impacto: base de datos lista para el sistema de PINs

**2.2 — Setup inicial de cuentas compartidas (único, manual)**
- El admin crea en Supabase Auth: `cocina@crunchies.sv`, `delivery@crunchies.sv`, `mesero@crunchies.sv`
- Ejecuta SQL para crear sus perfiles con el rol correcto
- Reemplaza `KITCHEN_PASS_HERE` etc. en la función RPC con contraseñas fuertes generadas
- Este paso solo se hace una vez al momento de activar el sistema de portales

**2.3 — Crear `shared/pin-auth.js`**
- Archivo nuevo: `shared/pin-auth.js`
- Responsabilidades:
  - `verifyPin(pin)` — llama RPC `verify_staff_pin`, retorna `{ staff_name, role }` o null
  - `loginWithPin(pin)` — llama RPC `get_role_session_token`, hace `supabase.auth.signInWithPassword`, guarda `{ staff_name, role }` en `sessionStorage`
  - `getPinSession()` — lee sessionStorage, retorna datos del staff o null
  - `logoutPin()` — `supabase.auth.signOut()` + limpia sessionStorage

**2.4 — Crear `adminSide/staff-pins.html` + `adminSide/js/staff-pins.js`**
- HTML: tabla de PINs activos/inactivos, formulario de creación, botones de edición
- JS: CRUD completo usando la tabla `staff_pins`
  - Listar todos los PINs (admin only via RLS)
  - Crear: nombre + rol + PIN (auto-generado como 6 dígitos random, editable)
  - Toggle activo/inactivo
  - Eliminar con confirmación
  - Mostrar `last_login` formateado
- Agregar enlace en el sidebar de admin

**2.5 — Crear `portal/kitchen/index.html`**
- HTML limpio: sin sidebar, sin navbar admin
- Sección de PIN: fondo oscuro, teclado numérico 3×4 grande, display de dígitos ingresados, botón borrar
- Sección de contenido (oculta hasta PIN correcto): las tarjetas de cocina
- Encabezado mínimo: "🍳 Cocina — [Nombre del staff]" + botón "Cerrar sesión"

**2.6 — Crear `portal/kitchen/kitchen.js`**
- Init: llama `getPinSession()` — si hay sesión activa, salta directo al contenido
- Flujo PIN: dígitos → verify → login → renderizar órdenes
- Lógica de órdenes: reutilizar la lógica de `kitchen.js` existente (copiar las funciones `loadOrders`, `renderColumn`, `buildCard`, `handleAction`, Realtime) adaptada al contexto del portal (sin sidebar ni historial de admin)
- Sin historial completo en portal — solo las 2 columnas: "En Cocina" / "Listos"

**2.7 — Crear `portal/delivery/index.html` + `portal/delivery/delivery.js`**
- Misma estructura de PIN que kitchen
- Contenido: versión simplificada del delivery board
  - Lista de órdenes ordenada por tiempo de espera (más antigua primero)
  - Cada tarjeta: nombre cliente, dirección, items resumidos, estado, botón de avance
  - Sin gestión de repartidores ni zonas (eso queda en adminSide/delivery.html)
  - Realtime activo

**2.8 — Crear `portal/waiter/index.html` + `portal/waiter/waiter.js`**
- Misma estructura de PIN que kitchen
- Contenido: versión del POS con los pasos reducidos (ver Fase 3 para spec de UX)
- Reutilizar lógica de `orders.js` adaptada al contexto

**2.9 — Actualizar `vercel.json` para servir los portales**
- Verificar que las rutas `/portal/kitchen/`, `/portal/delivery/`, `/portal/waiter/` están correctamente configuradas para servir los `index.html` correspondientes
- Agregar rewrite rules si es necesario

---

### Cómo verificar que la Fase 2 está completa:
- [ ] Admin puede ver, crear y desactivar PINs desde `adminSide/staff-pins.html`
- [ ] `/portal/kitchen/` muestra teclado numérico; PIN incorrecto muestra error "PIN inválido"
- [ ] PIN correcto de cocina muestra las tarjetas de órdenes `in_kitchen` y `ready`
- [ ] Los modificadores aparecen en las tarjetas de cocina del portal
- [ ] Realtime actualiza el portal de cocina sin recargar
- [ ] `/portal/delivery/` muestra pedidos ordenados por antigüedad
- [ ] `/portal/waiter/` permite crear una orden, agregar ítems y enviar a cocina
- [ ] Cerrar sesión en cualquier portal vuelve a la pantalla de PIN
- [ ] Recargar la pestaña sin cerrar sesión mantiene la sesión activa (sessionStorage)
- [ ] Abrir nueva pestaña del mismo portal pide PIN nuevamente

---

## FASE 3 — SIMPLIFICACIÓN DE UX
**Objetivo:** POS, cocina y delivery son más rápidos y menos engorrosos para el staff en operación real.
**Tiempo estimado:** 5-6 horas
**Criterio de éxito:** Desde cero, un mesero puede seleccionar mesa → agregar ítems → enviar a cocina en menos de 30 segundos.

---

### Tareas:

**3.1 — POS: Indicador de estado de orden en el ticket (complemento de 1.3)**
- Archivo: `adminSide/js/orders.js` + CSS en `adminSide/css/admin.css`
- Agregar un banner de estado al tope del ticket: "🟡 EN COCINA" / "✅ LISTA — llevar a la mesa" / "🍽️ ENTREGADA"
- El banner se actualiza via Realtime (suscripción a la orden activa por ID)
- Color: ámbar para in_kitchen, verde brillante para ready, muted para delivered
- Sin cambios al flujo de datos — solo UI

**3.2 — POS: Eliminar paso innecesario de "+ Nueva Orden"**
- Archivo: `adminSide/js/orders.js`
- Cambio: cuando el mesero selecciona una mesa sin orden activa, ofrecer crear orden directamente en el mismo flujo (sin botón separado para dine_in). Para takeout/delivery, sí mantener el paso de datos del cliente.
- Reducción de pasos para dine_in: seleccionar mesa → (si no hay orden activa: crear automáticamente) → agregar ítems → enviar a cocina

**3.3 — POS: Feedback visual al enviar a cocina**
- Archivo: `adminSide/js/orders.js`
- Cambio: después de `sendToKitchen()`, el botón "Enviar a Cocina" cambia a "✅ Enviado" y se deshabilita permanentemente para esa orden. Si el mesero agrega más ítems, vuelve a activarse con texto "📤 Enviar nuevos ítems".
- Elimina la ambigüedad de "¿ya lo envié?"

**3.4 — Kitchen portal: Ajustar umbrales del timer**
- Archivo: `portal/kitchen/kitchen.js` (y también `adminSide/js/kitchen.js`)
- Cambio: verde < 15 min, ámbar 15-25 min, rojo > 25 min (actualmente: verde < 10, ámbar < 20, rojo > 20)
- El umbral de 10 minutos es muy agresivo para un restaurante — el rojo aparece demasiado rápido

**3.5 — Delivery portal: Ordenar por tiempo de espera**
- Archivo: `portal/delivery/delivery.js`
- Cambio: en `renderBoard()`, ordenar las órdenes por `created_at` ascendente (más antigua primero) en lugar del orden por defecto de la DB
- También en `adminSide/js/delivery.js`: aplicar el mismo criterio en `renderBoard()`

**3.6 — Delivery: Un solo botón de avance por estado**
- Archivo: `adminSide/js/delivery.js` + `portal/delivery/delivery.js`
- Cambio: cada tarjeta muestra solo UN botón de acción: el siguiente estado. Eliminar el botón "Ver" del panel principal (mantenerlo solo si hay información que no cabe en la tarjeta). En el portal de delivery, las tarjetas son más simples aún.
- Reducción de clics: un clic avanza el estado, sin confirmar

**3.7 — Kitchen portal: Eliminar información irrelevante de las tarjetas**
- Archivo: `portal/kitchen/kitchen.js`
- Las tarjetas del portal NO muestran: precio, datos de cliente completos, método de pago
- Solo: identificador (mesa o nombre para delivery/takeout), items + cantidades + modificadores + notas, timer, botón de acción

---

### Cómo verificar que la Fase 3 está completa:
- [ ] Un mesero puede ir de "mesa seleccionada" a "orden en cocina" en ≤ 3 clics y < 30 segundos (cronometrar)
- [ ] El ticket muestra el estado actual de la orden (EN COCINA / LISTA / ENTREGADA) con color apropiado
- [ ] El botón "Enviar a Cocina" no puede presionarse dos veces para la misma orden sin agregar nuevos ítems
- [ ] Los timers en cocina son: verde hasta 15m, ámbar 15-25m, rojo >25m
- [ ] Las órdenes en delivery están ordenadas de más antigua a más reciente
- [ ] Las tarjetas del portal de cocina no muestran precios ni datos de pago

---

## FASE 4 — NOTIFICACIONES WEB
**Objetivo:** El sistema avisa proactivamente de situaciones críticas usando la Notification API nativa del navegador + Supabase Realtime.
**Tiempo estimado:** 3-4 horas
**Criterio de éxito:** Las 4 notificaciones especificadas funcionan en Chrome sin plugins externos ni servicios de terceros.

---

### Estrategia técnica:
- Usar `window.Notification` (API nativa, sin librerías)
- Pedir permiso una vez al cargar cada panel de admin
- Realtime ya está activo — las notificaciones son un handler adicional en los canales existentes
- Los checks de "orden demorada" usan `setInterval` (ya hay uno en kitchen.js para los timers)
- Fallback si el navegador no soporta notificaciones: un panel de alertas flotante en la página

---

### Tareas:

**4.1 — Crear `shared/notifications.js`**
- Archivo nuevo: `shared/notifications.js`
- Funciones:
  - `requestPermission()` — pide permiso, guarda resultado en localStorage
  - `notify(title, body, icon?)` — envía notificación nativa si hay permiso, o agrega al panel fallback
  - `showFallbackAlert(msg)` — agrega un item al panel de alertas in-page

**4.2 — Implementar panel de alertas in-page (fallback)**
- Agregar un icono de campana 🔔 en el header de admin con badge contador
- Al hacer clic: panel lateral/dropdown que muestra las últimas 10 alertas con timestamp
- Este panel siempre funciona, con o sin permiso de notificaciones

**4.3 — Notificación 1: COCINA > 30 MIN**
- Archivo: `adminSide/js/kitchen.js` (y `portal/kitchen/kitchen.js`)
- En el `setInterval` de 30 segundos que ya existe para los timers:
  - Si `elapsed >= 30` y aún `in_kitchen`, disparar notificación una vez
  - Guardar IDs de órdenes ya notificadas en un Set para no repetir cada 30s
  - Repetir notificación cada 10 minutos si la orden sigue sin resolverse (limpiar del Set a los 10 min)
- Destinatario: quien tenga kitchen.html abierto

**4.4 — Notificación 2: ORDEN LISTA SIN RECOGER > 5 MIN**
- Archivo: `adminSide/js/orders.js` (y `portal/waiter/waiter.js`)
- Al actualizar el estado de la orden vía Realtime: si pasa a `ready`, iniciar un `setTimeout` de 5 minutos
- Si pasados 5 minutos la orden sigue `ready` (verificar en DB), enviar notificación
- Repetir cada 3 minutos con el mismo mecanismo
- Destinatario: quien tenga orders.html abierto (el mesero)

**4.5 — Notificación 3: NUEVO PEDIDO ONLINE**
- Archivo: `adminSide/js/dashboard.js` + `adminSide/js/kitchen.js`
- En el canal Realtime de orders (ya existente en kitchen.js), agregar handler para `event: 'INSERT'`:
  - Si `order_type in ('delivery','takeout')`: disparar notificación "📱 Nuevo pedido de [delivery_name]"
- También agregar al `delivery.js` (ya tiene este handler implementado — solo falta llamar `notify()`)
- Destinatario: quien tenga kitchen.html o delivery.html abierto

**4.6 — Notificación 4: PEDIDO DELIVERY ASIGNADO**
- Archivo: `adminSide/js/delivery.js`
- En el handler Realtime de delivery: cuando `payload.new.driver_id !== payload.old.driver_id` y `driver_id` no es null:
  - Buscar nombre del driver en el array local `drivers`
  - Disparar notificación "🛵 Pedido #[N] asignado a [driver_name]"
- Destinatario: quien tenga delivery.html abierto

**4.7 — Integrar `requestPermission()` en los paneles de admin**
- Archivos: `adminSide/js/dashboard.js`, `adminSide/js/kitchen.js`, `adminSide/js/delivery.js`, `adminSide/js/orders.js`
- Al `init()` de cada módulo: llamar `requestPermission()` si `localStorage.getItem('notif_pref') !== 'denied'`
- Un solo modal de solicitud que explica por qué se necesitan notificaciones

---

### Cómo verificar que la Fase 4 está completa:
- [ ] Al abrir kitchen.html por primera vez, aparece el dialog del navegador solicitando permiso de notificaciones
- [ ] Una orden en `in_kitchen` > 30 minutos dispara una notificación del sistema operativo
- [ ] Cuando kitchen.js marca una orden como `ready`, el mesero recibe notificación en orders.html (si está abierto)
- [ ] Un pedido online nuevo (delivery/takeout) dispara notificación en kitchen.html y delivery.html
- [ ] En un navegador sin soporte de notificaciones (o permiso denegado), aparece el panel de alertas in-page
- [ ] El badge de campana en el header muestra el número de alertas no leídas

---

## FASE 5 — DEUDA TÉCNICA Y OPTIMIZACIONES
**Objetivo:** El código está limpio y las migrations están documentadas para no bloquear trabajo futuro.
**Tiempo estimado:** 1-2 horas

---

### Tareas:

**5.1 — Crear `supabase/MIGRATIONS.md`**
- Documentar el orden correcto de ejecución de los 14+ SQL files
- Indicar cuáles son idempotentes (tienen `IF NOT EXISTS`, `DROP IF EXISTS`) y cuáles no
- Orden definido:
  1. schema.sql
  2. add_order_columns.sql (+ fix del CHECK CONSTRAINT de Fase 1)
  3. add_payment_method.sql
  4. delivery_management_schema.sql
  5. modifiers_schema.sql
  6. anon_ordering_rls.sql
  7. fix_tables_and_rls.sql
  8. expenses_create.sql
  9. expenses_rls.sql
  10. customer_notes_rls.sql
  11. reorganize_tables.sql
  12. loyalty_points_fix.sql
  13. enable_realtime.sql
  14. staff_pins_schema.sql (Fase 2)

**5.2 — Agregar cleanup de canales Realtime**
- Archivos: `adminSide/js/kitchen.js`, `adminSide/js/delivery.js`, `adminSide/js/orders.js`
- Agregar `window.addEventListener('beforeunload', () => supabase.removeAllChannels())`
- Una línea por archivo, no requiere reestructura

**5.3 — Agregar manejo de error en carga inicial**
- Archivos: todos los `init()` de admin
- Cambio: si el primer `Promise.all()` de carga falla, mostrar un mensaje en la página en lugar de pantalla en blanco
- Pattern: `try { await Promise.all([...]) } catch (e) { showLoadError(e.message) }`

**5.4 — Eliminar `adminSide/seed-runner.html` si está roto**
- Verificar si tiene script inline o si realmente es un huérfano
- Si está roto: eliminar del proyecto para no confundir

---

### Nota sobre arquitectura de archivos .html (deuda post-julio):

La estructura actual de 18+ archivos HTML con sidebar/nav repetido es funcional pero tiene un techo de mantenibilidad. Cualquier cambio en la navegación requiere editar todos los archivos manualmente. Esto es aceptable para la entrega del 1 de julio. **Post-julio**, evaluar una de estas opciones:
- Componente de sidebar via `fetch()` + `innerHTML` (sin framework, 5 líneas)
- Migrar a un SSG mínimo como Astro (compatible con el resto del stack)
- No se recomienda migrar a React/Next.js — el overhead supera el beneficio para este caso de uso

---

## RIESGOS Y DEPENDENCIAS

| Riesgo | Mitigación |
|--------|-----------|
| Las cuentas compartidas de Supabase Auth (Fase 2) tienen contraseñas que viven en la función RPC — si Supabase DB es comprometida, esas contraseñas quedan expuestas | Para producción post-julio: migrar a Supabase Vault para las credenciales |
| El portal de waiter tiene acceso de escritura completo (crear órdenes, cobrar) con la cuenta compartida `mesero@crunchies.sv` — si se filtra el PIN, alguien puede cobrar | Solución: rotar PINs regularmente desde admin panel |
| Fase 3 (UX) toca `orders.js` que es el módulo más grande — riesgo de regresión | Implementar cambios quirúrgicos, no refactors; verificar POS completo al final de cada tarea de Fase 3 |
| La Notificación 2 (orden lista > 5 min) requiere que el mesero tenga orders.html abierto — si cerró la pestaña, nunca se entera | Esto es una limitación conocida del modelo sin servidor push. Aceptable para este stack. |

---

## NOTAS DE STACK

No se encontró ningún caso que justifique migrar a React, Next.js o Laravel. Todos los requerimientos son implementables en Vanilla JS + Supabase:

- **Portales con PIN**: función RPC de Supabase + sessionStorage → resuelto sin framework
- **Notificaciones**: Notification API nativa → sin librerías
- **Realtime**: ya implementado con `postgres_changes` → funciona
- **Estado compartido entre páginas**: no necesario — cada portal es independiente

La única limitación real del stack actual es la deuda de los archivos HTML planos (Tarea 5.4), documentada como trabajo post-julio.
