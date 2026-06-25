import { supabase, getSession, getProfile, calcTotals, fmt } from '../../shared/supabase-client.js'
import { toast } from './utils.js'
import { getItemModifierGroups, openModifierModal, modifiersExtraPrice, modifiersSummary, buildLineKey } from '../../shared/modifier-modal.js'

const params  = new URLSearchParams(location.search)
const tableId = params.get('table')

let profile   = null
let tableInfo = null
let menuItems = []
let activeCat = 'all'
let cart      = []   // [{ id, name, price, qty }]
let myOrders  = []   // [{ id, shortId, status, items, total, notes }]

// Roles de personal — nunca se muestran como "cliente"
const STAFF_ROLES = ['admin', 'waiter', 'kitchen']

// ─── Boot ─────────────────────────────────────────────────────────
async function init() {
  if (!tableId) { showError('Código QR inválido. No se encontró la mesa.'); return }

  // Auth opcional — cualquiera puede escanear el QR y ordenar sin cuenta
  const session = await getSession()
  if (session) {
    const p = await getProfile(session.user.id)
    // Solo usar perfil si es cliente real, no personal del restaurante
    if (p && !STAFF_ROLES.includes(p.role)) {
      profile = p
    }
  }

  const { data: tbl } = await supabase
    .from('restaurant_tables').select('*').eq('id', tableId).maybeSingle()

  if (!tbl) { showError('Mesa no encontrada. Escanea el código QR correcto.'); return }

  tableInfo = tbl
  document.getElementById('tableName').textContent        = `Mesa ${tbl.number}`
  document.getElementById('desktopTableName').textContent  = `Mesa ${tbl.number}`
  document.getElementById('tableLocation').textContent    = tbl.location
  document.getElementById('userGreet').textContent        = profile?.full_name
    ? `Hola, ${profile.full_name}`
    : ''

  // Marcar mesa ocupada al escanear
  if (tbl.status !== 'occupied') {
    await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', tableId)
  }

  await loadMenu()
  showMain()
  setupEvents()
}

function showError(msg) {
  document.getElementById('loadingScreen').classList.add('hidden')
  document.getElementById('errorMsg').textContent = msg
  document.getElementById('errorScreen').classList.remove('hidden')
}

function showMain() {
  document.getElementById('loadingScreen').classList.add('hidden')
  document.getElementById('mainContent').classList.remove('hidden')
}

// ─── Menu ─────────────────────────────────────────────────────────
async function loadMenu() {
  const [{ data: cats }, { data: items }] = await Promise.all([
    supabase.from('categories').select('*').eq('active', true).order('display_order'),
    supabase.from('menu_items').select('*').eq('available', true).order('name')
  ])

  const tabs = document.getElementById('catTabs')
  ;(cats || []).forEach(cat => {
    const btn = document.createElement('button')
    btn.className = 'pos-cat'
    btn.dataset.cat = cat.id
    btn.textContent = `${cat.icon} ${cat.name}`
    btn.addEventListener('click', () => { activeCat = cat.id; renderGrid(); setActiveTab(btn) })
    tabs.appendChild(btn)
  })
  tabs.querySelector('[data-cat="all"]').addEventListener('click', (e) => {
    activeCat = 'all'; renderGrid(); setActiveTab(e.currentTarget)
  })

  menuItems = items || []
  renderGrid()
}

function setActiveTab(active) {
  document.querySelectorAll('#catTabs .pos-cat').forEach(b => b.classList.remove('active'))
  active.classList.add('active')
}

function renderGrid() {
  const q = document.getElementById('menuSearch').value.toLowerCase()
  const filtered = menuItems.filter(i =>
    (activeCat === 'all' || i.category_id === activeCat) &&
    (i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
  )

  const grid = document.getElementById('menuGrid')
  if (!filtered.length) {
    grid.innerHTML = '<p class="text-muted text-sm" style="grid-column:1/-1;padding:20px">Sin resultados.</p>'
    return
  }

  grid.innerHTML = filtered.map(i => {
    const cartQty = cart.filter(c => c.id === i.id).reduce((s, c) => s + c.qty, 0)
    return `
      <div class="order-item-card ${cartQty ? 'in-cart' : ''}"
           onclick="addToCart('${i.id}','${i.name.replace(/'/g, "\\'")}',${i.price})">
        <div class="order-item-img">
          ${i.image_url
            ? `<img src="${i.image_url}" alt="${i.name}" style="width:100%;height:100%;object-fit:cover">`
            : `<span>${i.emoji || '🍽️'}</span>`}
        </div>
        <div class="order-item-body">
          <div class="order-item-name">${i.name}</div>
          ${i.description ? `<div class="order-item-desc">${i.description}</div>` : ''}
          <div class="order-item-footer">
            <span class="order-item-price">${fmt.currency(i.price)}</span>
            <span class="order-item-add ${cartQty ? 'in-cart' : ''}">
              ${cartQty ? `✓ ${cartQty}` : '+'}
            </span>
          </div>
        </div>
      </div>`
  }).join('')
}

// ─── Cart ──────────────────────────────────────────────────────────
window.addToCart = async (id, name, price) => {
  const item = { id, name, price: parseFloat(price) }
  const groups = await getItemModifierGroups(id)
  let modifiers = []
  if (groups.length) {
    const selections = await openModifierModal(item, groups)
    if (selections === null) return
    modifiers = selections
  }

  const lineKey = buildLineKey(id, modifiers)
  const existing = cart.find(c => c.lineKey === lineKey)
  if (existing) existing.qty++
  else cart.push({ ...item, price: item.price + modifiersExtraPrice(modifiers), modifiers, lineKey, qty: 1 })

  renderGrid()
  renderDesktopCart()
  updateMobileBar()
  toast(`${name} agregado`, 'success', 1500)
}

window.changeQty = (lineKey, delta) => {
  const item = cart.find(c => c.lineKey === lineKey)
  if (!item) return
  item.qty += delta
  if (item.qty <= 0) cart = cart.filter(c => c.lineKey !== lineKey)
  renderGrid()
  renderDesktopCart()
  renderMobileCart()
  updateMobileBar()
  if (!cart.length) closeMobileCart()
}

function cartTotals() {
  const raw = cart.reduce((s, c) => s + c.price * c.qty, 0)
  return calcTotals(raw)
}

function cartItemsHTML() {
  if (!cart.length) return '<p class="text-muted text-sm" style="padding:12px 0">Sin productos.</p>'
  return cart.map(c => `
    <div class="cart-item">
      <span class="cart-item__name">${c.name}${c.modifiers?.length ? `<div class="text-xs text-muted">${modifiersSummary(c.modifiers)}</div>` : ''}</span>
      <div class="cart-item__qty">
        <button class="btn btn-ghost btn-sm" style="padding:2px 8px" onclick="changeQty('${c.lineKey}',-1)">−</button>
        <span>${c.qty}</span>
        <button class="btn btn-ghost btn-sm" style="padding:2px 8px" onclick="changeQty('${c.lineKey}',1)">+</button>
      </div>
      <span class="cart-item__price">${fmt.currency(c.price * c.qty)}</span>
    </div>`).join('')
}

function renderDesktopCart() {
  const { subtotal, tax, total } = cartTotals()
  document.getElementById('desktopCartItems').innerHTML = cart.length
    ? cartItemsHTML()
    : '<div class="cart-empty"><div style="font-size:2.5rem">🧾</div><p class="text-muted text-sm mt-8">Agrega platillos para empezar</p></div>'
  document.getElementById('desktopCartCount').textContent = `${cart.reduce((s, c) => s + c.qty, 0)} items`
  document.getElementById('desktopSubtotal').textContent = fmt.currency(subtotal)
  document.getElementById('desktopTax').textContent      = fmt.currency(tax)
  document.getElementById('desktopTotal').textContent    = fmt.currency(total)
  document.getElementById('desktopConfirmBtn').disabled  = !cart.length
}

function renderMobileCart() {
  const { subtotal, tax, total } = cartTotals()
  document.getElementById('mobileCartItems').innerHTML = cartItemsHTML()
  document.getElementById('mobileSubtotal').textContent = fmt.currency(subtotal)
  document.getElementById('mobileTax').textContent      = fmt.currency(tax)
  document.getElementById('mobileTotal').textContent    = fmt.currency(total)
}

function updateMobileBar() {
  const bar   = document.getElementById('mobileCartBar')
  const count = cart.reduce((s, c) => s + c.qty, 0)
  if (!count) { bar.classList.remove('visible'); return }
  bar.classList.add('visible')
  document.getElementById('mobileCartCount').textContent = `${count} ${count === 1 ? 'item' : 'items'}`
  document.getElementById('mobileCartTotal').textContent = fmt.currency(cartTotals().total)
}

function closeMobileCart() {
  document.getElementById('mobileCartBackdrop').classList.remove('visible')
}

// ─── Submit ────────────────────────────────────────────────────────
async function submitOrder(notesId, msgId, btnId) {
  if (!cart.length) return
  const btn = document.getElementById(btnId)
  btn.disabled = true
  btn.textContent = 'Enviando...'

  const notes = document.getElementById(notesId).value.trim() || null
  const { subtotal, tax, total } = cartTotals()

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      table_id:    tableId,
      customer_id: profile?.id ?? null,
      order_type:  'dine_in',
      status:      'in_kitchen',
      notes,
      subtotal,
      tax,
      total
    })
    .select()
    .single()

  if (orderErr) {
    const msgEl = document.getElementById(msgId)
    msgEl.textContent = 'Error al enviar el pedido. Intenta de nuevo.'
    msgEl.className = 'alert alert-error'
    msgEl.classList.remove('hidden')
    btn.disabled = false
    btn.textContent = 'Enviar Pedido a Cocina'
    return
  }

  const { data: insertedItems } = await supabase.from('order_items').insert(
    cart.map(c => ({
      order_id:     order.id,
      menu_item_id: c.id,
      item_name:    c.name,
      item_price:   c.price,
      quantity:     c.qty
    }))
  ).select()

  const modifierRows = []
  ;(insertedItems || []).forEach((row, idx) => {
    (cart[idx].modifiers || []).forEach(m => {
      modifierRows.push({ order_item_id: row.id, option_name: m.option_name, price_delta: m.price_delta })
    })
  })
  if (modifierRows.length) await supabase.from('order_item_modifiers').insert(modifierRows)

  // Track this order
  myOrders.push({
    id:      order.id,
    shortId: order.id.slice(0, 8).toUpperCase(),
    status:  'in_kitchen',
    items:   cart.map(c => ({ name: c.name, qty: c.qty, price: c.price, modifiers: c.modifiers })),
    total,
    notes
  })
  updateTrackerBtn()

  // Show success
  closeMobileCart()
  document.getElementById('successOrderNum').textContent = `#${order.id.slice(0, 8).toUpperCase()}`
  document.getElementById('successScreen').classList.remove('hidden')
  cart = []
}

// ─── Events ────────────────────────────────────────────────────────
function setupEvents() {
  document.getElementById('menuSearch').addEventListener('input', renderGrid)
  document.getElementById('mobileCartBar').addEventListener('click', () => {
    renderMobileCart()
    document.getElementById('mobileCartBackdrop').classList.add('visible')
  })
  document.getElementById('mobileCartClose').addEventListener('click', closeMobileCart)
  document.getElementById('mobileCartBackdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeMobileCart()
  })
  document.getElementById('desktopConfirmBtn').addEventListener('click', () =>
    submitOrder('desktopNotes', 'desktopOrderMsg', 'desktopConfirmBtn'))
  document.getElementById('mobileConfirmBtn').addEventListener('click', () =>
    submitOrder('mobileNotes', 'mobileOrderMsg', 'mobileConfirmBtn'))
  document.getElementById('orderMoreBtn').addEventListener('click', () => {
    document.getElementById('successScreen').classList.add('hidden')
    renderGrid()
    renderDesktopCart()
    updateMobileBar()
  })

  document.getElementById('myOrdersBtn').addEventListener('click', () => {
    renderTracker()
    document.getElementById('trackerBackdrop').classList.add('visible')
  })
  document.getElementById('trackerClose').addEventListener('click', () => {
    document.getElementById('trackerBackdrop').classList.remove('visible')
  })
  document.getElementById('trackerBackdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('trackerBackdrop').classList.remove('visible')
  })
}

// ─── Order Tracker ─────────────────────────────────────────────────
const TRACKER_STATUS = {
  in_kitchen: { cls: 'tracker-status--kitchen', icon: '🍳', text: 'En cocina...' },
  ready:      { cls: 'tracker-status--ready',   icon: '✅', text: '¡Listo! El mesero viene en camino' },
  delivered:  { cls: 'tracker-status--done',    icon: '🍽️', text: 'Entregado en tu mesa' },
  paid:       { cls: 'tracker-status--done',    icon: '✓',  text: 'Completado' }
}

function updateTrackerBtn() {
  const btn = document.getElementById('myOrdersBtn')
  if (!myOrders.length) { btn.style.display = 'none'; return }
  btn.style.display = ''
  const readyCount = myOrders.filter(o => o.status === 'ready').length
  if (readyCount) {
    btn.innerHTML = `🔔 <strong style="color:var(--green)">${readyCount} listo${readyCount > 1 ? 's' : ''}</strong>`
  } else {
    btn.textContent = `📋 Mis pedidos (${myOrders.length})`
  }
}

function renderTracker() {
  const list = document.getElementById('trackerList')
  if (!myOrders.length) {
    list.innerHTML = '<p class="text-muted text-sm" style="padding:12px 0">Sin pedidos aún.</p>'
    return
  }
  list.innerHTML = [...myOrders].reverse().map(o => {
    const s = TRACKER_STATUS[o.status] || { cls: 'tracker-status--kitchen', icon: '⏳', text: o.status }
    return `
      <div class="tracker-order-card ${o.status === 'ready' ? 'tracker-order-card--ready' : ''}">
        <div class="tracker-order-header">
          <span class="tracker-order-num">#${o.shortId}</span>
          <span class="tracker-status ${s.cls}">${s.icon} ${s.text}</span>
        </div>
        <div class="tracker-items">${o.items.map(i => `${i.qty}× ${i.name}${i.modifiers?.length ? ` (${modifiersSummary(i.modifiers)})` : ''}`).join('<br>')}</div>
        <div class="tracker-footer">
          ${o.notes ? `<span style="color:var(--text-secondary)">📝 ${o.notes}</span>` : '<span></span>'}
          <span class="tracker-total">${fmt.currency(o.total)}</span>
        </div>
      </div>`
  }).join('')
}

// Escuchar cambios de estado en tiempo real para los pedidos de esta mesa
if (tableId) {
  supabase.channel(`table-tracker-${tableId}`)
    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'orders',
      filter: `table_id=eq.${tableId}`
    }, payload => {
      const o = myOrders.find(x => x.id === payload.new.id)
      if (!o) return
      const prev = o.status
      o.status = payload.new.status
      updateTrackerBtn()
      const backdrop = document.getElementById('trackerBackdrop')
      if (backdrop?.classList.contains('visible')) renderTracker()
      if (prev !== 'ready' && payload.new.status === 'ready') {
        toast('¡Tu pedido está listo! 🍽️ El mesero lo traerá pronto', 'success', 6000)
      }
    })
    .subscribe()
}

init()
