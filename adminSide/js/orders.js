import { supabase, calcTotals, fmt } from '../../shared/supabase-client.js'
import { initAdminShell, toast } from './admin-auth.js'

let profile      = null
let categories   = []
let menuItems    = []
let tables       = []
let currentOrder = null   // { id, table_id, items: [] }
let selectedTable= null
let activeCat    = 'all'
let selectedPayMethod = 'cash'
let linkedCustomer    = null

async function init() {
  const ctx = await initAdminShell(['admin', 'waiter'])
  if (!ctx) return
  profile = ctx.profile

  await Promise.all([loadTables(), loadMenu()])
  setupTicket()
  setupPayModal()
}

// ─── Tables ───────────────────────────────────────────────────────
async function loadTables() {
  const { data } = await supabase.from('restaurant_tables').select('*').order('number')
  tables = data || []
  const sel = document.getElementById('tablePicker')
  tables.forEach(t => {
    const opt = document.createElement('option')
    opt.value = t.id
    opt.textContent = `Mesa ${t.number} (${t.location}) — ${t.status}`
    sel.appendChild(opt)
  })
}

// ─── Menu ─────────────────────────────────────────────────────────
async function loadMenu() {
  const [{ data: cats }, { data: items }] = await Promise.all([
    supabase.from('categories').select('*').eq('active', true).order('display_order'),
    supabase.from('menu_items').select('*').eq('available', true)
  ])
  categories = cats || []
  menuItems  = items || []

  const tabsEl = document.getElementById('posCatTabs')
  categories.forEach(cat => {
    const btn = document.createElement('button')
    btn.className = 'pos-cat'
    btn.dataset.cat = cat.id
    btn.textContent = `${cat.icon} ${cat.name}`
    btn.addEventListener('click', () => { activeCat = cat.id; renderMenuGrid(); setActiveTab(btn) })
    tabsEl.appendChild(btn)
  })

  document.querySelector('.pos-cat[data-cat="all"]').addEventListener('click', (e) => {
    activeCat = 'all'; renderMenuGrid(); setActiveTab(e.currentTarget)
  })

  document.getElementById('posSearch').addEventListener('input', () => renderMenuGrid())

  renderMenuGrid()
}

function setActiveTab(btn) {
  document.querySelectorAll('.pos-cat').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
}

function renderMenuGrid() {
  const q = document.getElementById('posSearch').value.toLowerCase()
  const filtered = menuItems.filter(i =>
    (activeCat === 'all' || i.category_id === activeCat) &&
    (i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
  )

  const grid = document.getElementById('posItemsGrid')
  if (!filtered.length) {
    grid.innerHTML = '<p class="text-muted text-sm" style="grid-column:1/-1">Sin resultados.</p>'
    return
  }

  grid.innerHTML = filtered.map(item => `
    <div class="pos-item-card ${!item.available ? 'pos-item-card--unavail' : ''}"
         data-id="${item.id}" data-name="${item.name}" data-price="${item.price}">
      <div class="pos-item-name">${item.name}</div>
      <div class="pos-item-price">${fmt.currency(item.price)}</div>
    </div>
  `).join('')

  grid.querySelectorAll('.pos-item-card').forEach(card => {
    card.addEventListener('click', () => {
      if (!currentOrder) { toast('Selecciona una mesa primero', 'warning'); return }
      addItemToTicket({
        id:    card.dataset.id,
        name:  card.dataset.name,
        price: parseFloat(card.dataset.price)
      })
    })
  })
}

// ─── Ticket ───────────────────────────────────────────────────────
function setupTicket() {
  document.getElementById('tablePicker').addEventListener('change', async (e) => {
    selectedTable = tables.find(t => t.id === e.target.value) || null
    if (!selectedTable) return
    await loadOrCreateOrder()
  })

  document.getElementById('newOrderBtn').addEventListener('click', async () => {
    if (!selectedTable) { toast('Selecciona una mesa', 'warning'); return }
    currentOrder = null
    await loadOrCreateOrder(true)
  })

  document.getElementById('sendKitchenBtn').addEventListener('click', sendToKitchen)
  document.getElementById('payBtn').addEventListener('click', openPayModal)
  document.getElementById('clearTicketBtn').addEventListener('click', clearTicket)
}

async function loadOrCreateOrder(forceNew = false) {
  if (!forceNew) {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('table_id', selectedTable.id)
      .in('status', ['open', 'in_kitchen', 'ready', 'delivered'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (data?.length) {
      currentOrder = { id: data[0].id, table_id: selectedTable.id, items: mapItems(data[0].order_items) }
      renderTicket()
      return
    }
  }

  const { data, error } = await supabase.from('orders').insert({
    table_id:  selectedTable.id,
    waiter_id: profile.id,
    status:    'open'
  }).select().single()

  if (error) { toast('Error al crear orden', 'error'); return }
  currentOrder = { id: data.id, table_id: selectedTable.id, items: [] }
  renderTicket()
  toast(`Orden nueva — Mesa ${selectedTable.number}`)
}

function mapItems(rawItems) {
  return (rawItems || []).map(i => ({
    dbId:  i.id,
    id:    i.menu_item_id,
    name:  i.item_name,
    price: parseFloat(i.item_price),
    qty:   i.quantity,
    notes: i.notes || ''
  }))
}

async function addItemToTicket(item) {
  const existing = currentOrder.items.find(i => i.id === item.id)
  if (existing) {
    existing.qty++
    await supabase.from('order_items').update({ quantity: existing.qty }).eq('id', existing.dbId)
  } else {
    const { data } = await supabase.from('order_items').insert({
      order_id:     currentOrder.id,
      menu_item_id: item.id,
      item_name:    item.name,
      item_price:   item.price,
      quantity:     1
    }).select().single()
    currentOrder.items.push({ dbId: data.id, ...item, qty: 1, notes: '' })
  }
  await recalcOrder()
  renderTicket()
}

async function changeQty(dbId, delta) {
  const it = currentOrder.items.find(i => i.dbId === dbId)
  if (!it) return
  it.qty += delta
  if (it.qty <= 0) {
    await supabase.from('order_items').delete().eq('id', dbId)
    currentOrder.items = currentOrder.items.filter(i => i.dbId !== dbId)
  } else {
    await supabase.from('order_items').update({ quantity: it.qty }).eq('id', dbId)
  }
  await recalcOrder()
  renderTicket()
}

async function recalcOrder() {
  const subtotal = currentOrder.items.reduce((s, i) => s + i.price * i.qty, 0)
  const { tax, total } = calcTotals(subtotal)
  await supabase.from('orders').update({ subtotal, tax, total }).eq('id', currentOrder.id)
  currentOrder.subtotal = subtotal
  currentOrder.tax      = tax
  currentOrder.total    = total
}

function renderTicket() {
  const table  = selectedTable
  document.getElementById('ticketTable').textContent   = table ? `Mesa ${table.number}` : 'Mesa —'
  document.getElementById('ticketWaiter').textContent  = profile.full_name || '—'
  document.getElementById('ticketOrderId').textContent = currentOrder ? `#${currentOrder.id.slice(0,8)}` : ''

  const itemsEl = document.getElementById('ticketItems')
  if (!currentOrder?.items.length) {
    itemsEl.innerHTML = `<div class="ticket-empty"><div style="font-size:2.5rem">🧾</div><p class="text-muted text-sm mt-8">Agrega platillos de la izquierda</p></div>`
  } else {
    itemsEl.innerHTML = currentOrder.items.map(i => `
      <div class="ticket-item">
        <span class="ticket-item__name">${i.name}</span>
        <div class="ticket-item__qty">
          <button class="qty-btn minus" onclick="changeQty('${i.dbId}', -1)">−</button>
          <span class="qty-num">${i.qty}</span>
          <button class="qty-btn" onclick="changeQty('${i.dbId}', 1)">+</button>
        </div>
        <span class="ticket-item__price">${fmt.currency(i.price * i.qty)}</span>
        <span class="ticket-item__del" onclick="changeQty('${i.dbId}', -${i.qty})">✕</span>
      </div>
    `).join('')
  }

  const sub = currentOrder?.subtotal ?? 0
  const tax = currentOrder?.tax      ?? 0
  const tot = currentOrder?.total    ?? 0
  document.getElementById('subtotal').textContent = fmt.currency(sub)
  document.getElementById('tax').textContent      = fmt.currency(tax)
  document.getElementById('total').textContent    = fmt.currency(tot)

  const hasItems = !!currentOrder?.items.length
  document.getElementById('sendKitchenBtn').disabled = !hasItems
  document.getElementById('payBtn').disabled         = !hasItems
}

async function sendToKitchen() {
  if (!currentOrder) return
  const notes = document.getElementById('orderNotes').value.trim()
  const { error } = await supabase.from('orders').update({ status: 'in_kitchen', notes }).eq('id', currentOrder.id)
  if (error) { toast('Error al enviar a cocina', 'error'); return }
  toast('Orden enviada a cocina 👨‍🍳', 'success')
  document.getElementById('sendKitchenBtn').disabled = true
}

function clearTicket() {
  if (!confirm('¿Limpiar la orden actual?')) return
  currentOrder = null
  selectedTable = null
  document.getElementById('tablePicker').value = ''
  renderTicket()
}

// ─── Pay Modal ────────────────────────────────────────────────────
function setupPayModal() {
  document.getElementById('payBtn').addEventListener('click', openPayModal)
  document.getElementById('payModalClose').addEventListener('click', () => document.getElementById('payModal').classList.add('hidden'))
  document.getElementById('payCancel').addEventListener('click',      () => document.getElementById('payModal').classList.add('hidden'))
  document.getElementById('receiptClose').addEventListener('click',   () => document.getElementById('receiptModal').classList.add('hidden'))
  document.getElementById('receiptClose2').addEventListener('click',  () => document.getElementById('receiptModal').classList.add('hidden'))

  document.querySelectorAll('.pay-method').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-method').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      selectedPayMethod = btn.dataset.method
      document.getElementById('cashSection').style.display = selectedPayMethod === 'cash' ? '' : 'none'
    })
  })

  document.getElementById('cashReceived').addEventListener('input', updateChange)
  document.getElementById('confirmPayBtn').addEventListener('click', processPayment)

  // Customer search
  document.getElementById('payCustomerSearch').addEventListener('input', searchCustomers)
}

function openPayModal() {
  if (!currentOrder?.items.length) return
  document.getElementById('payTotalAmount').textContent = fmt.currency(currentOrder.total)
  document.getElementById('payModal').classList.remove('hidden')
  document.getElementById('cashReceived').value = ''
  document.getElementById('changeAmount').textContent = '$0.00'
}

function updateChange() {
  const received = parseFloat(document.getElementById('cashReceived').value) || 0
  const change   = Math.max(0, received - (currentOrder?.total || 0))
  document.getElementById('changeAmount').textContent = fmt.currency(change)
}

async function searchCustomers() {
  const q = document.getElementById('payCustomerSearch').value.trim()
  const suggestEl = document.getElementById('customerSuggestions')
  if (q.length < 2) { suggestEl.style.display = 'none'; return }

  const { data } = await supabase.from('profiles')
    .select('id, full_name, loyalty_points')
    .eq('role', 'customer')
    .ilike('full_name', `%${q}%`)
    .limit(5)

  if (!data?.length) { suggestEl.style.display = 'none'; return }

  suggestEl.style.display = 'block'
  suggestEl.innerHTML = data.map(c => `
    <div class="suggestion-item" data-id="${c.id}" data-name="${c.full_name}" data-points="${c.loyalty_points}">
      ${c.full_name} — ${c.loyalty_points} pts
    </div>
  `).join('')

  suggestEl.querySelectorAll('.suggestion-item').forEach(el => {
    el.addEventListener('click', () => {
      linkedCustomer = { id: el.dataset.id, name: el.dataset.name, points: parseInt(el.dataset.points) }
      document.getElementById('payCustomerSearch').value = el.dataset.name
      suggestEl.style.display = 'none'
    })
  })
}

async function processPayment() {
  if (!currentOrder) return
  const btn = document.getElementById('confirmPayBtn')
  btn.disabled = true

  const received = parseFloat(document.getElementById('cashReceived').value) || currentOrder.total
  const change   = Math.max(0, received - currentOrder.total)
  const receipt  = `REC-${Date.now()}`

  const { error: payErr } = await supabase.from('payments').insert({
    order_id:      currentOrder.id,
    processed_by:  profile.id,
    amount:        currentOrder.total,
    method:        selectedPayMethod,
    receipt_number:receipt,
    change_amount: change
  })

  if (payErr) { toast('Error al procesar pago', 'error'); btn.disabled = false; return }

  await supabase.from('orders').update({ status: 'paid' }).eq('id', currentOrder.id)
  await supabase.from('restaurant_tables').update({ status: 'available' }).eq('id', selectedTable.id)

  // Award loyalty points (1 pt per $1 spent)
  if (linkedCustomer) {
    const pts = Math.floor(currentOrder.total)
    await supabase.from('loyalty_transactions').insert({ customer_id: linkedCustomer.id, order_id: currentOrder.id, points: pts, type: 'earned' })
    await supabase.from('profiles').update({ loyalty_points: linkedCustomer.points + pts }).eq('id', linkedCustomer.id)
  }

  document.getElementById('payModal').classList.add('hidden')
  renderReceipt(receipt, change)
  toast('Pago procesado ✓', 'success')

  currentOrder  = null
  selectedTable = null
  linkedCustomer= null
  document.getElementById('tablePicker').value = ''
  renderTicket()
  btn.disabled = false
}

function renderReceipt(receiptNo, change) {
  const items = currentOrder?.items ?? []
  document.getElementById('receiptContent').innerHTML = `
    <div class="receipt">
      <div class="receipt__logo">Neón y Sabor Mi Rancho</div>
      <div class="receipt__address">Su restaurante favorito<br>${fmt.datetime(new Date())}</div>
      <hr class="receipt__divider">
      <div>Mesa: ${selectedTable?.number ?? '—'} | Mesero: ${profile.full_name}</div>
      <div>Recibo: ${receiptNo}</div>
      <hr class="receipt__divider">
      ${items.map(i => `<div class="receipt__item"><span>${i.qty}x ${i.name}</span><span>${fmt.currency(i.price * i.qty)}</span></div>`).join('')}
      <hr class="receipt__divider">
      <div class="receipt__item"><span>Subtotal</span><span>${fmt.currency(currentOrder?.subtotal ?? 0)}</span></div>
      <div class="receipt__item"><span>IVA 13%</span><span>${fmt.currency(currentOrder?.tax ?? 0)}</span></div>
      <div class="receipt__item receipt__total"><span>TOTAL</span><span>${fmt.currency(currentOrder?.total ?? 0)}</span></div>
      ${selectedPayMethod === 'cash' ? `
        <div class="receipt__item"><span>Efectivo</span><span>${fmt.currency(parseFloat(document.getElementById('cashReceived').value)||0)}</span></div>
        <div class="receipt__item"><span>Cambio</span><span>${fmt.currency(change)}</span></div>
      ` : `<div class="receipt__item"><span>Método</span><span>${selectedPayMethod}</span></div>`}
      ${linkedCustomer ? `<div style="margin-top:6px">Puntos otorgados: +${Math.floor(currentOrder?.total??0)} pts a ${linkedCustomer.name}</div>` : ''}
      <hr class="receipt__divider">
      <div class="receipt__thanks">¡Gracias por su visita!<br>Vuelva pronto 🌟</div>
    </div>`
  document.getElementById('receiptModal').classList.remove('hidden')
}

// Expose for inline onclick
window.changeQty = changeQty

init()
