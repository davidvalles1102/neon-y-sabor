import { supabase } from '../../shared/supabase-client.js'
import { toast } from './admin-auth.js'

// Kitchen display — no role gate, but requires authenticated staff
;(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { window.location.href = 'login.html'; return }
})()

// Live clock
const clockEl = document.getElementById('liveClock')
const tick = () => {
  clockEl.textContent = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
tick()
setInterval(tick, 1000)

// Elapsed timer map: orderId → startTimestamp
const startTimes = new Map()
// Order metadata needed for handleAction
const orderMeta  = new Map()  // orderId → { order_type }

// ─── Load active kitchen orders ────────────────────────────────
async function loadOrders() {
  const { data } = await supabase
    .from('orders')
    .select('*, restaurant_tables(number), order_items(*)')
    .in('status', ['in_kitchen', 'ready'])
    .order('created_at')

  const inKitchen = (data || []).filter(o => o.status === 'in_kitchen')
  const ready     = (data || []).filter(o => o.status === 'ready')

  document.getElementById('countInKitchen').textContent = inKitchen.length
  document.getElementById('countReady').textContent     = ready.length

  renderColumn('ordersInKitchen', inKitchen)
  renderColumn('ordersReady',     ready)
}

function renderColumn(elId, orders) {
  const el = document.getElementById(elId)
  if (!orders.length) {
    el.innerHTML = '<div class="kitchen-empty">Sin órdenes</div>'
    return
  }
  el.innerHTML = orders.map(o => buildCard(o)).join('')
  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action, btn.dataset.id))
  })
}

function buildCard(order) {
  if (!startTimes.has(order.id)) startTimes.set(order.id, new Date(order.updated_at || order.created_at))
  orderMeta.set(order.id, { order_type: order.order_type })

  const elapsed   = Math.floor((Date.now() - startTimes.get(order.id)) / 1000 / 60)
  const timerCls  = elapsed < 10 ? 'timer--ok' : elapsed < 20 ? 'timer--warn' : 'timer--urgent'
  const cardCls   = order.status === 'ready' ? 'kitchen-card--ready' : (elapsed >= 20 ? 'kitchen-card--urgent' : '')
  const items     = order.order_items || []
  const isExternal = ['delivery', 'takeout'].includes(order.order_type)

  // Header: show table for dine-in, customer name + type for delivery/takeout
  const headerLabel = isExternal
    ? `${order.order_type === 'delivery' ? '🛵' : '🥡'} ${order.delivery_name || 'Sin nombre'}`
    : `Mesa ${order.restaurant_tables?.number ?? '—'}`

  // Footer actions differ by type and status
  let actions = ''
  if (order.status === 'in_kitchen') {
    actions = `
      <button class="btn btn-primary btn-sm btn-full" data-action="ready" data-id="${order.id}">✅ Marcar Listo</button>`
  } else if (isExternal) {
    // Delivery/takeout ready — delivery board handles next step
    actions = `
      <div class="text-xs text-muted" style="text-align:center;padding:6px 0">✅ Listo — esperando al repartidor</div>
      <button class="btn btn-ghost btn-sm btn-full" data-action="back" data-id="${order.id}">↩ Regresar a cocina</button>`
  } else {
    // Dine-in ready
    actions = `
      <button class="btn btn-outline btn-sm btn-full" data-action="delivered" data-id="${order.id}">🍽️ Entregado en mesa</button>
      <button class="btn btn-ghost btn-sm" data-action="back" data-id="${order.id}" title="Regresar a cocina">↩</button>`
  }

  return `
    <div class="kitchen-card ${cardCls}" id="kcard-${order.id}">
      <div class="kitchen-card__header">
        <div class="kitchen-card__table">${headerLabel}</div>
        <div class="kitchen-card__timer ${timerCls}" data-orderid="${order.id}">⏱ ${elapsed}m</div>
      </div>
      <div class="kitchen-card__items">
        ${items.map(i => `
          <div class="kitchen-item">
            <span class="kitchen-item__qty">${i.quantity}</span>
            <div>
              <div>${i.item_name}</div>
              ${i.notes ? `<div class="kitchen-item__note">📝 ${i.notes}</div>` : ''}
            </div>
          </div>
        `).join('')}
        ${order.notes ? `<div class="kitchen-item" style="color:var(--amber)">📋 ${order.notes}</div>` : ''}
      </div>
      <div class="kitchen-card__actions">
        ${actions}
      </div>
    </div>`
}

async function handleAction(action, orderId) {
  const statusMap = { ready: 'ready', delivered: 'delivered', back: 'in_kitchen' }
  const newStatus = statusMap[action]
  if (!newStatus) return

  const updates = { status: newStatus, updated_at: new Date().toISOString() }

  // Sync delivery_status so the delivery board and customer tracking update too
  const meta = orderMeta.get(orderId)
  if (meta && ['delivery', 'takeout'].includes(meta.order_type)) {
    if (action === 'ready') updates.delivery_status = 'ready'
    if (action === 'back')  updates.delivery_status = 'preparing'
    // 'delivered' for delivery/takeout is handled by the delivery board, not kitchen
  }

  const { error } = await supabase.from('orders').update(updates).eq('id', orderId)

  if (error) { toast('Error al actualizar', 'error'); return }
  if (action === 'delivered') startTimes.delete(orderId)
  await loadOrders()
}

// ─── Realtime subscription ─────────────────────────────────────
supabase
  .channel('kitchen-orders')
  .on('postgres_changes', {
    event:  '*',
    schema: 'public',
    table:  'orders',
    filter: `status=in.(in_kitchen,ready)`
  }, () => loadOrders())
  .subscribe()

// ─── Timer refresh every 30 seconds ────────────────────────────
setInterval(() => {
  document.querySelectorAll('[data-orderid]').forEach(el => {
    const id      = el.dataset.orderid
    const start   = startTimes.get(id)
    if (!start) return
    const elapsed = Math.floor((Date.now() - start) / 1000 / 60)
    el.textContent = `⏱ ${elapsed}m`
    el.className   = `kitchen-card__timer ${elapsed < 10 ? 'timer--ok' : elapsed < 20 ? 'timer--warn' : 'timer--urgent'}`
  })
}, 30_000)

loadOrders()
