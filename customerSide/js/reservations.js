import { supabase, getSession, fmt } from '../../shared/supabase-client.js'
import { toast } from './utils.js'

let currentUser = null

async function init() {
  const session = await getSession()
  currentUser = session?.user ?? null

  const authGate  = document.getElementById('authGate')
  const reservForm= document.getElementById('reservForm')

  if (!currentUser) {
    authGate?.classList.remove('hidden')
    reservForm?.classList.add('hidden')
    return
  }

  // Set min date to today
  const dateInput = document.getElementById('resDate')
  if (dateInput) dateInput.min = new Date().toISOString().split('T')[0]

  await loadMyReservations()
}

// ─── Submit reservation ───────────────────────────────────────────
document.getElementById('reservForm')?.addEventListener('submit', async (e) => {
  e.preventDefault()
  const msgEl = document.getElementById('reservMsg')
  msgEl.classList.add('hidden')

  const date     = document.getElementById('resDate').value
  const time     = document.getElementById('resTime').value
  const party    = parseInt(document.getElementById('resParty').value)
  const zone     = document.getElementById('resZone').value
  const notes    = document.getElementById('resNotes').value.trim()

  // Find an available table that fits the party
  let query = supabase
    .from('restaurant_tables')
    .select('id')
    .eq('status', 'available')
    .gte('capacity', party)
    .order('capacity')
    .limit(1)

  if (zone) query = query.eq('location', zone)

  const { data: tables, error: tableErr } = await query

  if (tableErr || !tables?.length) {
    // Assign null table_id, staff will assign manually
  }

  const tableId = tables?.[0]?.id ?? null

  const { error } = await supabase.from('reservations').insert({
    customer_id:      currentUser.id,
    table_id:         tableId,
    reservation_date: date,
    reservation_time: time,
    party_size:       party,
    notes,
    status:           'pending'
  })

  if (error) {
    msgEl.textContent = 'Error al guardar reservación: ' + error.message
    msgEl.className = 'alert alert-error'
    msgEl.classList.remove('hidden')
    return
  }

  msgEl.textContent = '¡Reservación enviada! Te confirmaremos pronto.'
  msgEl.className = 'alert alert-success'
  msgEl.classList.remove('hidden')
  e.target.reset()
  await loadMyReservations()
})

// ─── Load user reservations ───────────────────────────────────────
async function loadMyReservations() {
  if (!currentUser) return
  const { data, error } = await supabase
    .from('reservations')
    .select('*, restaurant_tables(number, location)')
    .eq('customer_id', currentUser.id)
    .order('reservation_date', { ascending: false })
    .limit(10)

  const el = document.getElementById('myReservations')
  if (error || !data?.length) {
    el.innerHTML = '<p class="text-muted text-sm">Sin reservaciones aún.</p>'
    return
  }

  const statusLabels = {
    pending:   { label: 'Pendiente', cls: 'badge-amber' },
    confirmed: { label: 'Confirmada', cls: 'badge-green' },
    seated:    { label: 'En Mesa', cls: 'badge-info' },
    cancelled: { label: 'Cancelada', cls: 'badge-danger' },
    no_show:   { label: 'No Show',   cls: 'badge-muted' }
  }

  el.innerHTML = data.map(r => {
    const s = statusLabels[r.status] ?? { label: r.status, cls: 'badge-muted' }
    return `
      <div class="reservation-item">
        <div>
          <div style="font-weight:600">${fmt.date(r.reservation_date)}</div>
          <div class="reservation-item__meta">
            ${r.reservation_time.slice(0,5)} · ${r.party_size} personas
            ${r.restaurant_tables ? `· Mesa ${r.restaurant_tables.number}` : ''}
          </div>
          ${r.notes ? `<div class="text-xs text-muted mt-4">${r.notes}</div>` : ''}
        </div>
        <div class="flex-col items-center gap-8">
          <span class="badge ${s.cls}">${s.label}</span>
          ${r.status === 'pending' ? `
            <button class="btn btn-danger btn-sm" onclick="cancelReserv('${r.id}')">Cancelar</button>
          ` : ''}
        </div>
      </div>`
  }).join('')
}

window.cancelReserv = async (id) => {
  if (!confirm('¿Cancelar esta reservación?')) return
  const { error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('customer_id', currentUser.id)

  if (error) { toast('Error al cancelar', 'error'); return }
  toast('Reservación cancelada')
  await loadMyReservations()
}

init()
