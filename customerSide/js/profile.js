import { supabase, getSession, getProfile, fmt } from '../../shared/supabase-client.js'
import { toast } from './utils.js'

let profile = null

async function init() {
  const session = await getSession()
  if (!session) {
    document.getElementById('authGate')?.classList.remove('hidden')
    return
  }

  profile = await getProfile(session.user.id)
  document.getElementById('profileContent')?.classList.remove('hidden')

  renderProfile()
  await Promise.all([loadStats(), loadReservations(), loadLoyalty()])
}

function renderProfile() {
  document.getElementById('profileName').textContent  = profile.full_name || 'Sin nombre'
  document.getElementById('profileEmail').textContent = profile.id        // email from auth
  document.getElementById('loyaltyPoints').textContent = profile.loyalty_points ?? 0
  document.getElementById('loyaltyValue').textContent  = ((profile.loyalty_points ?? 0) * 0.01).toFixed(2)

  const initials = (profile.full_name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)
  document.getElementById('avatarCircle').textContent = initials

  // Pre-fill edit form
  document.getElementById('editName').value  = profile.full_name || ''
  document.getElementById('editPhone').value = profile.phone || ''
}

async function loadStats() {
  const { data } = await supabase
    .from('orders')
    .select('total')
    .eq('customer_id', profile.id)
    .eq('status', 'paid')

  document.getElementById('totalVisits').textContent  = data?.length ?? 0
  const spent = data?.reduce((s, o) => s + (+o.total), 0) ?? 0
  document.getElementById('totalSpent').textContent   = `$${spent.toFixed(2)}`
}

async function loadReservations() {
  const { data } = await supabase
    .from('reservations')
    .select('*, restaurant_tables(number)')
    .eq('customer_id', profile.id)
    .order('reservation_date', { ascending: false })
    .limit(5)

  const el = document.getElementById('reservationsList')
  if (!data?.length) { el.innerHTML = '<p class="text-muted text-sm">Sin reservaciones.</p>'; return }

  const statusCls = { pending:'badge-amber', confirmed:'badge-green', seated:'badge-info', cancelled:'badge-danger' }

  el.innerHTML = data.map(r => `
    <div class="reservation-item">
      <div>
        <div style="font-weight:600">${fmt.date(r.reservation_date)} ${r.reservation_time.slice(0,5)}</div>
        <div class="reservation-item__meta">${r.party_size} personas${r.restaurant_tables ? ` · Mesa ${r.restaurant_tables.number}` : ''}</div>
      </div>
      <span class="badge ${statusCls[r.status] ?? 'badge-muted'}">${r.status}</span>
    </div>
  `).join('')
}

async function loadLoyalty() {
  const { data } = await supabase
    .from('loyalty_transactions')
    .select('*')
    .eq('customer_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(15)

  let redeemed = 0
  data?.filter(d => d.type === 'redeemed').forEach(d => redeemed += d.points)
  document.getElementById('totalRedeemed').textContent = redeemed

  const el = document.getElementById('loyaltyList')
  if (!data?.length) { el.innerHTML = '<p class="text-muted text-sm">Sin movimientos.</p>'; return }

  el.innerHTML = data.map(d => `
    <div class="loyalty-item ${d.type}">
      <span>${fmt.date(d.created_at)}</span>
      <span class="loyalty-item__points">${d.type === 'earned' ? '+' : '-'}${d.points} pts</span>
    </div>
  `).join('')
}

// ─── Edit profile ─────────────────────────────────────────────────
document.getElementById('editProfileBtn')?.addEventListener('click', () => {
  document.getElementById('editModal').classList.remove('hidden')
})
document.getElementById('editModalClose')?.addEventListener('click', () => {
  document.getElementById('editModal').classList.add('hidden')
})

document.getElementById('editForm')?.addEventListener('submit', async (e) => {
  e.preventDefault()
  const name  = document.getElementById('editName').value.trim()
  const phone = document.getElementById('editPhone').value.trim()
  const msg   = document.getElementById('editMsg')
  msg.classList.add('hidden')

  const { error } = await supabase.from('profiles').update({ full_name: name, phone }).eq('id', profile.id)

  if (error) {
    msg.textContent = error.message
    msg.className = 'alert alert-error'
    msg.classList.remove('hidden')
    return
  }

  profile.full_name = name
  profile.phone     = phone
  renderProfile()
  document.getElementById('editModal').classList.add('hidden')
  toast('Perfil actualizado')
})

// ─── Logout ───────────────────────────────────────────────────────
const logout = async () => {
  await supabase.auth.signOut()
  window.location.href = 'index.html'
}
document.getElementById('logoutBtn')?.addEventListener('click',     logout)
document.getElementById('logoutBtnSide')?.addEventListener('click', logout)

init()
