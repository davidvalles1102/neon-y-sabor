import { supabase, fmt } from '../../shared/supabase-client.js'
import { initAdminShell, toast } from './admin-auth.js'

let allCustomers   = []
let selectedCustId = null
let activeFilter   = 'all'   // 'all' | 'vip' | 'inactive' | 'new'
let searchQuery    = ''

const INACTIVE_DAYS = 30
const NEW_DAYS      = 7
const VIP_POINTS    = 500

async function init() {
  const ctx = await initAdminShell(['admin'])
  if (!ctx) return

  document.getElementById('customerSearch').addEventListener('input', (e) => { searchQuery = e.target.value; renderTable() })
  document.getElementById('exportCustomersBtn').addEventListener('click', exportCSV)
  document.getElementById('custModalClose').addEventListener('click', () => document.getElementById('customerModal').classList.add('hidden'))
  document.getElementById('applyPointsBtn').addEventListener('click', applyPointsAdjust)
  document.getElementById('addNoteBtn').addEventListener('click', addCustomerNote)

  document.querySelectorAll('.cust-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter
      document.querySelectorAll('.cust-filter').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      renderTable()
    })
  })

  await loadCustomers()
}

async function loadCustomers() {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .or('role.eq.customer,role.is.null')
    .order('loyalty_points', { ascending: false })

  // Fetch visit counts per customer — include delivery/takeout (delivered) and dine-in (paid)
  const { data: orders } = await supabase
    .from('orders')
    .select('customer_id, total, created_at')
    .in('status', ['paid', 'delivered'])
    .not('customer_id', 'is', null)

  const visitMap     = {}
  const spentMap      = {}
  const lastVisitMap = {}
  orders?.forEach(o => {
    visitMap[o.customer_id] = (visitMap[o.customer_id] || 0) + 1
    spentMap[o.customer_id] = (spentMap[o.customer_id] || 0) + +o.total
    if (!lastVisitMap[o.customer_id] || o.created_at > lastVisitMap[o.customer_id]) {
      lastVisitMap[o.customer_id] = o.created_at
    }
  })

  const now = Date.now()
  allCustomers = (profiles || []).map(p => {
    const lastVisit    = lastVisitMap[p.id] || null
    const daysSinceLast = lastVisit ? Math.floor((now - new Date(lastVisit)) / 86400_000) : null
    const daysSinceSignup = Math.floor((now - new Date(p.created_at)) / 86400_000)
    return {
      ...p,
      visits:        visitMap[p.id] || 0,
      total_spent:   spentMap[p.id] || 0,
      last_visit:    lastVisit,
      is_vip:        (p.loyalty_points || 0) >= VIP_POINTS,
      is_inactive:   lastVisit !== null && daysSinceLast >= INACTIVE_DAYS,
      is_new:        daysSinceSignup <= NEW_DAYS
    }
  })

  renderStats()
  renderTable()
}

function renderStats() {
  document.getElementById('totalCustomers').textContent = allCustomers.length
  const totalPts = allCustomers.reduce((s, c) => s + (c.loyalty_points || 0), 0)
  document.getElementById('totalPoints').textContent   = totalPts.toLocaleString()
  document.getElementById('vipCustomers').textContent  = allCustomers.filter(c => c.is_vip).length
  document.getElementById('inactiveCustomers').textContent = allCustomers.filter(c => c.is_inactive).length
}

function renderTable() {
  const q = searchQuery.toLowerCase()
  const filtered = allCustomers.filter(c => {
    const matchQuery = (c.full_name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
    const matchFilter = activeFilter === 'all' ? true
                       : activeFilter === 'vip' ? c.is_vip
                       : activeFilter === 'inactive' ? c.is_inactive
                       : activeFilter === 'new' ? c.is_new
                       : true
    return matchQuery && matchFilter
  })

  const tbody = document.getElementById('customersTableBody')
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted text-center" style="padding:32px">Sin clientes encontrados.</td></tr>'
    return
  }

  tbody.innerHTML = filtered.map(c => `
    <tr>
      <td>
        <div style="font-weight:600">${c.full_name || '(Sin nombre)'}</div>
        <div class="flex gap-4 mt-4">
          ${c.is_vip ? '<span class="badge badge-amber text-xs">VIP</span>' : ''}
          ${c.is_inactive ? '<span class="badge badge-danger text-xs">Inactivo</span>' : ''}
          ${c.is_new ? '<span class="badge badge-info text-xs">Nuevo</span>' : ''}
        </div>
      </td>
      <td>${c.phone || '—'}</td>
      <td>
        <span class="neon-green" style="font-weight:700">${c.loyalty_points || 0}</span>
        <span class="text-muted text-xs"> pts</span>
      </td>
      <td>${c.visits}</td>
      <td>${fmt.currency(c.total_spent)}</td>
      <td>${c.last_visit ? fmt.date(c.last_visit) : '—'}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openCustomer('${c.id}')">Ver</button>
      </td>
    </tr>
  `).join('')
}

window.openCustomer = async (id) => {
  selectedCustId = id
  const c = allCustomers.find(x => x.id === id)
  document.getElementById('custModalName').textContent = c?.full_name || 'Cliente'
  document.getElementById('customerModal').classList.remove('hidden')
  document.getElementById('pointsAdjust').value = ''
  document.getElementById('pointsNote').value   = ''
  document.getElementById('newNoteInput').value = ''

  const [{ data: loyalty }, { data: reservations }, { data: orderHistory }, { data: notes }] = await Promise.all([
    supabase.from('loyalty_transactions').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(10),
    supabase.from('reservations').select('*').eq('customer_id', id).order('reservation_date', { ascending: false }).limit(5),
    supabase.from('orders').select('*, order_items(item_name, quantity, item_price)').eq('customer_id', id).in('status', ['paid', 'delivered']).order('created_at', { ascending: false }).limit(15),
    supabase.from('customer_notes').select('*, profiles!customer_notes_created_by_fkey(full_name)').eq('customer_id', id).order('created_at', { ascending: false })
  ])

  // Plato favorito — derivado del historial de pedidos
  const itemCounts = {}
  orderHistory?.forEach(o => o.order_items?.forEach(i => { itemCounts[i.item_name] = (itemCounts[i.item_name] || 0) + i.quantity }))
  const favorite = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]

  const daysSinceLast = c?.last_visit ? Math.floor((Date.now() - new Date(c.last_visit)) / 86400_000) : null

  document.getElementById('custModalContent').innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      <div class="stat-card" style="padding:12px"><div class="stat-label">Puntos</div><div class="stat-value" style="font-size:1.4rem;color:var(--green)">${c?.loyalty_points ?? 0}</div></div>
      <div class="stat-card" style="padding:12px"><div class="stat-label">Visitas</div><div class="stat-value" style="font-size:1.4rem">${c?.visits ?? 0}</div></div>
      <div class="stat-card" style="padding:12px"><div class="stat-label">Gastado</div><div class="stat-value" style="font-size:1.4rem;color:var(--amber)">${fmt.currency(c?.total_spent ?? 0)}</div></div>
      <div class="stat-card" style="padding:12px"><div class="stat-label">Última visita</div><div class="stat-value" style="font-size:1.4rem">${daysSinceLast === null ? '—' : `${daysSinceLast}d`}</div></div>
    </div>

    ${favorite ? `<div class="alert" style="background:var(--amber-dim);border-color:var(--amber-dim);color:var(--amber);margin-bottom:16px">⭐ Plato favorito: <strong>${favorite[0]}</strong> (${favorite[1]}x pedido)</div>` : ''}

    <h4 style="margin-bottom:8px">Historial de Pedidos</h4>
    <div style="max-height:200px;overflow-y:auto">
    ${orderHistory?.length ? orderHistory.map(o => {
      const typeLabel = o.order_type === 'delivery' ? '🛵' : o.order_type === 'takeout' ? '🥡' : '🍽️'
      const itemsText = (o.order_items || []).map(i => `${i.quantity}× ${i.item_name}`).join(', ')
      return `
      <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:.85rem">
        <div class="flex justify-between"><span>${typeLabel} ${fmt.date(o.created_at)}</span><span style="font-weight:700">${fmt.currency(o.total)}</span></div>
        <div class="text-muted text-xs mt-4">${itemsText || 'Sin items'}</div>
      </div>`
    }).join('') : '<p class="text-muted text-sm">Sin pedidos registrados.</p>'}
    </div>

    <h4 style="margin:16px 0 8px">Historial de Puntos</h4>
    ${loyalty?.length ? loyalty.map(l => `
      <div class="loyalty-item ${l.type}" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.85rem">
        <span>${fmt.date(l.created_at)}</span>
        <span style="font-weight:700;color:${l.type === 'earned' ? 'var(--green)' : 'var(--amber)'}">${l.type === 'earned' ? '+' : '-'}${l.points} pts</span>
      </div>`).join('') : '<p class="text-muted text-sm">Sin movimientos.</p>'}

    <h4 style="margin:16px 0 8px">Reservaciones</h4>
    ${reservations?.length ? reservations.map(r => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.85rem">
        <span>${fmt.date(r.reservation_date)} ${r.reservation_time.slice(0,5)}</span>
        <span class="badge badge-${r.status === 'confirmed' ? 'green' : r.status === 'cancelled' ? 'danger' : 'amber'}">${r.status}</span>
      </div>`).join('') : '<p class="text-muted text-sm">Sin reservaciones.</p>'}

    <h4 style="margin:16px 0 8px">📝 Notas (alergias, preferencias, incidentes)</h4>
    <div id="custNotesList">
      ${notes?.length ? notes.map(n => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:.85rem">
          <div>${n.note}</div>
          <div class="text-muted text-xs mt-4">${n.profiles?.full_name ?? '—'} · ${fmt.datetime(n.created_at)}</div>
        </div>`).join('') : '<p class="text-muted text-sm">Sin notas.</p>'}
    </div>
  `
}

async function addCustomerNote() {
  if (!selectedCustId) return
  const note = document.getElementById('newNoteInput').value.trim()
  if (!note) { toast('Escribe una nota', 'warning'); return }

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('customer_notes').insert({ customer_id: selectedCustId, note, created_by: user.id })
  if (error) { toast('Error al guardar la nota', 'error'); return }

  toast('Nota agregada')
  document.getElementById('newNoteInput').value = ''
  await openCustomer(selectedCustId)
}

async function applyPointsAdjust() {
  if (!selectedCustId) return
  const pts  = parseInt(document.getElementById('pointsAdjust').value)
  if (!pts || isNaN(pts)) { toast('Ingresa un valor válido', 'warning'); return }

  const c = allCustomers.find(x => x.id === selectedCustId)
  const newPts = Math.max(0, (c?.loyalty_points || 0) + pts)

  const { error } = await supabase.from('profiles').update({ loyalty_points: newPts }).eq('id', selectedCustId)
  if (error) { toast('Error', 'error'); return }

  await supabase.from('loyalty_transactions').insert({
    customer_id: selectedCustId,
    points:      Math.abs(pts),
    type:        pts > 0 ? 'earned' : 'redeemed'
  })

  toast(`Puntos ${pts > 0 ? 'agregados' : 'descontados'} correctamente`)
  await loadCustomers()
  await openCustomer(selectedCustId)
}

function exportCSV() {
  const rows = [['Nombre', 'Teléfono', 'Puntos', 'Visitas', 'Total Gastado', 'Última Visita', 'Estado', 'Registro']]
  allCustomers.forEach(c => {
    const estado = c.is_vip ? 'VIP' : c.is_inactive ? 'Inactivo' : c.is_new ? 'Nuevo' : ''
    rows.push([c.full_name || '', c.phone || '', c.loyalty_points || 0, c.visits, c.total_spent.toFixed(2), c.last_visit ? fmt.date(c.last_visit) : '', estado, fmt.date(c.created_at)])
  })
  const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const link = document.createElement('a')
  link.href  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  link.download = `clientes-${new Date().toISOString().slice(0,10)}.csv`
  link.click()
}

init()
