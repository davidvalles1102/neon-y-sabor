import { supabase, fmt } from '../../shared/supabase-client.js'
import { initAdminShell, toast } from './admin-auth.js'

let allReservations = []
let allTables       = []
let filterDate      = new Date().toISOString().split('T')[0]
let filterStatus    = ''
let pendingAssignId = null

const statusConfig = {
  pending:   { label: 'Pendiente',   cls: 'badge-amber',  icon: '🕐' },
  confirmed: { label: 'Confirmada',  cls: 'badge-green',  icon: '✅' },
  seated:    { label: 'En Mesa',     cls: 'badge-info',   icon: '🪑' },
  cancelled: { label: 'Cancelada',   cls: 'badge-danger', icon: '❌' },
  no_show:   { label: 'No Show',     cls: 'badge-muted',  icon: '👻' }
}

async function init() {
  const ctx = await initAdminShell(['admin', 'waiter'])
  if (!ctx) return

  // Default date filter = today
  const dateInput = document.getElementById('filterDate')
  dateInput.value = filterDate
  dateInput.addEventListener('change', (e) => { filterDate = e.target.value; loadReservations() })

  document.getElementById('filterStatus').addEventListener('change', (e) => {
    filterStatus = e.target.value
    renderTable()
  })

  document.getElementById('reservModalClose').addEventListener('click',  () => document.getElementById('reservModal').classList.add('hidden'))
  document.getElementById('assignModalClose').addEventListener('click',  () => document.getElementById('assignTableModal').classList.add('hidden'))
  document.getElementById('assignCancel').addEventListener('click',      () => document.getElementById('assignTableModal').classList.add('hidden'))
  document.getElementById('assignConfirm').addEventListener('click',     confirmAssignTable)

  await Promise.all([loadReservations(), loadTables()])
  subscribeRealtime()
}

// ─── Load ─────────────────────────────────────────────────────────
async function loadReservations() {
  let query = supabase
    .from('reservations')
    .select(`
      *,
      profiles ( full_name, phone, loyalty_points ),
      restaurant_tables ( number, location, capacity )
    `)
    .order('reservation_date', { ascending: true })
    .order('reservation_time', { ascending: true })

  // Filter by date if set
  if (filterDate) {
    query = query.eq('reservation_date', filterDate)
  }

  const { data, error } = await query
  if (error) { toast('Error al cargar reservaciones', 'error'); return }

  allReservations = data || []
  renderStats()
  renderTable()
}

async function loadTables() {
  const { data } = await supabase
    .from('restaurant_tables')
    .select('*')
    .eq('status', 'available')
    .order('number')
  allTables = data || []

  const sel = document.getElementById('assignTableSelect')
  sel.innerHTML = '<option value="">Sin asignar</option>'
  allTables.forEach(t => {
    const opt = document.createElement('option')
    opt.value = t.id
    opt.textContent = `Mesa ${t.number} — ${t.location} (cap. ${t.capacity})`
    sel.appendChild(opt)
  })
}

// ─── Stats ────────────────────────────────────────────────────────
function renderStats() {
  const count = (s) => allReservations.filter(r => r.status === s).length
  document.getElementById('statTotal').textContent     = allReservations.length
  document.getElementById('statPending').textContent   = count('pending')
  document.getElementById('statConfirmed').textContent = count('confirmed')
  document.getElementById('statSeated').textContent    = count('seated')
  document.getElementById('statCancelled').textContent = count('cancelled')
}

// ─── Table ────────────────────────────────────────────────────────
function renderTable() {
  const filtered = filterStatus
    ? allReservations.filter(r => r.status === filterStatus)
    : allReservations

  const tbody = document.getElementById('reservationsBody')

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-muted text-center" style="padding:40px">
      Sin reservaciones para esta fecha / filtro.
    </td></tr>`
    return
  }

  tbody.innerHTML = filtered.map(r => {
    const sc  = statusConfig[r.status] ?? { label: r.status, cls: 'badge-muted', icon: '' }
    const p   = r.profiles
    const tb  = r.restaurant_tables

    // Highlight if status changed to cancelled (customer cancelled)
    const rowCls = r.status === 'cancelled' ? 'style="opacity:.6"' : ''

    return `
      <tr ${rowCls}>
        <td>
          <div style="font-weight:600">${p?.full_name || '(Sin nombre)'}</div>
          ${p?.loyalty_points > 0 ? `<span class="badge badge-amber text-xs">${p.loyalty_points} pts</span>` : ''}
        </td>
        <td>${p?.phone || '<span class="text-muted">—</span>'}</td>
        <td>${fmt.date(r.reservation_date)}</td>
        <td style="font-weight:600">${r.reservation_time.slice(0,5)}</td>
        <td style="text-align:center">${r.party_size}</td>
        <td>${tb ? `Mesa ${tb.number}` : '<span class="text-muted">Sin asignar</span>'}</td>
        <td>${tb?.location ?? '<span class="text-muted">—</span>'}</td>
        <td class="text-sm text-muted" style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${r.notes || '—'}
        </td>
        <td><span class="badge ${sc.cls}">${sc.icon} ${sc.label}</span></td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" onclick="openDetail('${r.id}')">Ver</button>
            ${r.status === 'pending' ? `
              <button class="btn btn-primary btn-sm" onclick="updateStatus('${r.id}','confirmed')">✓ Confirmar</button>
            ` : ''}
            ${r.status === 'confirmed' ? `
              <button class="btn btn-amber btn-sm" onclick="updateStatus('${r.id}','seated')">🪑 Sentar</button>
            ` : ''}
            ${['pending','confirmed'].includes(r.status) ? `
              <button class="btn btn-danger btn-sm" onclick="updateStatus('${r.id}','cancelled')">✕</button>
            ` : ''}
          </div>
        </td>
      </tr>`
  }).join('')
}

// ─── Actions ──────────────────────────────────────────────────────
window.updateStatus = async (id, newStatus) => {
  const { error } = await supabase
    .from('reservations')
    .update({ status: newStatus })
    .eq('id', id)

  if (error) { toast('Error al actualizar', 'error'); return }

  const labels = { confirmed: 'Reservación confirmada ✅', seated: 'Cliente sentado 🪑', cancelled: 'Reservación cancelada' }
  toast(labels[newStatus] ?? 'Actualizado', newStatus === 'cancelled' ? 'warning' : 'success')
  await loadReservations()
}

window.openDetail = (id) => {
  const r  = allReservations.find(x => x.id === id)
  if (!r) return
  const sc = statusConfig[r.status] ?? { label: r.status, cls: 'badge-muted', icon: '' }
  const p  = r.profiles
  const tb = r.restaurant_tables

  document.getElementById('reservModalBody').innerHTML = `
    <div class="flex-col gap-16">

      <!-- Customer info -->
      <div class="card" style="border-color:var(--green-dim)">
        <h4 class="mb-12" style="color:var(--green)">👤 Información del Cliente</h4>
        <div class="flex-col gap-8 text-sm">
          <div class="flex justify-between">
            <span class="text-muted">Nombre</span>
            <span style="font-weight:600">${p?.full_name || 'Sin nombre'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Teléfono</span>
            <span>${p?.phone || '—'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Puntos de lealtad</span>
            <span class="neon-amber" style="font-weight:700">${p?.loyalty_points ?? 0} pts</span>
          </div>
        </div>
      </div>

      <!-- Reservation info -->
      <div class="card">
        <h4 class="mb-12" style="color:var(--amber)">📅 Detalle de la Reservación</h4>
        <div class="flex-col gap-8 text-sm">
          <div class="flex justify-between">
            <span class="text-muted">Fecha</span>
            <span style="font-weight:600">${fmt.date(r.reservation_date)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Hora</span>
            <span style="font-weight:600">${r.reservation_time.slice(0,5)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Personas</span>
            <span>${r.party_size}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Mesa asignada</span>
            <span>${tb ? `Mesa ${tb.number} (${tb.location})` : 'Sin asignar'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Estado</span>
            <span class="badge ${sc.cls}">${sc.icon} ${sc.label}</span>
          </div>
          ${r.notes ? `
          <div style="padding-top:8px;border-top:1px solid var(--border)">
            <div class="text-muted" style="margin-bottom:4px">Notas del cliente:</div>
            <div style="color:var(--amber)">"${r.notes}"</div>
          </div>` : ''}
          <div class="flex justify-between" style="padding-top:8px;border-top:1px solid var(--border)">
            <span class="text-muted">Creada</span>
            <span>${fmt.datetime(r.created_at)}</span>
          </div>
        </div>
      </div>
    </div>`

  // Action buttons in footer
  const footer = document.getElementById('reservModalFooter')
  footer.innerHTML = `
    <button class="btn btn-outline" onclick="document.getElementById('reservModal').classList.add('hidden')">Cerrar</button>
    ${!tb ? `<button class="btn btn-amber" onclick="openAssignTable('${r.id}')">🪑 Asignar Mesa</button>` : ''}
    ${r.status === 'pending'   ? `<button class="btn btn-primary" onclick="updateStatus('${r.id}','confirmed');document.getElementById('reservModal').classList.add('hidden')">✓ Confirmar</button>` : ''}
    ${r.status === 'confirmed' ? `<button class="btn btn-amber"   onclick="updateStatus('${r.id}','seated');document.getElementById('reservModal').classList.add('hidden')">🪑 Sentar</button>` : ''}
    ${['pending','confirmed'].includes(r.status) ? `<button class="btn btn-danger" onclick="updateStatus('${r.id}','no_show');document.getElementById('reservModal').classList.add('hidden')">👻 No Show</button>` : ''}
  `

  document.getElementById('reservModal').classList.remove('hidden')
}

window.openAssignTable = (id) => {
  pendingAssignId = id
  document.getElementById('reservModal').classList.add('hidden')
  document.getElementById('assignTableModal').classList.remove('hidden')
}

async function confirmAssignTable() {
  const tableId = document.getElementById('assignTableSelect').value
  if (!pendingAssignId) return

  const { error } = await supabase
    .from('reservations')
    .update({ table_id: tableId || null })
    .eq('id', pendingAssignId)

  if (error) { toast('Error al asignar mesa', 'error'); return }
  toast('Mesa asignada correctamente')
  document.getElementById('assignTableModal').classList.add('hidden')
  pendingAssignId = null
  await loadReservations()
}

// ─── Supabase Realtime ────────────────────────────────────────────
function subscribeRealtime() {
  const dot = document.getElementById('realtimeDot')

  supabase
    .channel('admin-reservations')
    .on('postgres_changes', {
      event:  '*',
      schema: 'public',
      table:  'reservations'
    }, async (payload) => {
      // Flash the dot to indicate an update
      dot.classList.add('dot--active')
      setTimeout(() => dot.classList.remove('dot--active'), 2000)

      const ev = payload.eventType
      if (ev === 'INSERT') toast('Nueva reservación recibida 📅', 'info')
      if (ev === 'UPDATE' && payload.new?.status === 'cancelled') toast('Un cliente canceló su reservación ❌', 'warning')

      await loadReservations()
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') dot.style.opacity = '1'
    })
}

init()
