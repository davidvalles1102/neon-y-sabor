import { supabase } from '../../shared/supabase-client.js'
import { initAdminShell, toast } from './admin-auth.js'

let tables   = []
let activeQR = null

const STATUS_LABEL = { available: 'Disponible', occupied: 'Ocupada', reserved: 'Reservada', maintenance: 'Mantenimiento' }
const STATUS_BADGE = { available: 'badge-green', occupied: 'badge-danger', reserved: 'badge-amber', maintenance: 'badge-muted' }

async function init() {
  const ctx = await initAdminShell(['admin'])
  if (!ctx) return
  await loadTables()
  setupModal()
}

async function loadTables() {
  const { data } = await supabase.from('restaurant_tables').select('*').order('number')
  tables = data || []
  renderTables()
}

function renderTables() {
  const grid = document.getElementById('tablesGrid')
  if (!tables.length) {
    grid.innerHTML = '<p class="text-muted">No hay mesas registradas en la base de datos.</p>'
    return
  }
  grid.innerHTML = tables.map(t => `
    <div class="tbl-card tbl-card--${t.status}">
      <div class="tbl-card__top">
        <div class="tbl-card__num">Mesa ${t.number}</div>
        <span class="badge ${STATUS_BADGE[t.status] ?? 'badge-muted'}">${STATUS_LABEL[t.status] ?? t.status}</span>
      </div>
      <div class="tbl-card__meta">📍 ${t.location} &nbsp;·&nbsp; 👤 ${t.capacity} personas</div>
      <div class="tbl-card__actions">
        <button class="btn btn-primary btn-sm" onclick="showQR('${t.id}', ${t.number})">📱 Ver QR</button>
        ${t.status !== 'occupied'
          ? `<button class="btn btn-outline btn-sm" onclick="toggleMaintenance('${t.id}','${t.status}')">
               ${t.status === 'maintenance' ? '✓ Activar' : '⚙ Mantenimiento'}
             </button>`
          : ''}
      </div>
    </div>
  `).join('')
}

function setupModal() {
  document.getElementById('qrModalClose').addEventListener('click', () => {
    document.getElementById('qrModal').classList.add('hidden')
    activeQR = null
  })

  document.getElementById('downloadQrBtn').addEventListener('click', () => {
    if (!activeQR?.dataUrl) return
    const a = document.createElement('a')
    a.href = activeQR.dataUrl
    a.download = `mesa-${activeQR.number}-qr.png`
    a.click()
  })
}

window.showQR = async (id, number) => {
  activeQR = { id, number, dataUrl: null }
  const url = `${location.origin}/customerSide/table-order.html?table=${id}`

  document.getElementById('qrModalTitle').textContent = `QR — Mesa ${number}`
  document.getElementById('qrUrl').textContent = url
  document.getElementById('qrModal').classList.remove('hidden')

  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    })
    document.getElementById('qrImg').src = dataUrl
    activeQR.dataUrl = dataUrl
  } catch (err) {
    console.error('QR generation error:', err)
    toast('Error al generar código QR', 'error')
  }
}

window.toggleMaintenance = async (id, currentStatus) => {
  const newStatus = currentStatus === 'maintenance' ? 'available' : 'maintenance'
  const { error } = await supabase.from('restaurant_tables').update({ status: newStatus }).eq('id', id)
  if (error) { toast('Error al actualizar la mesa', 'error'); return }
  const t = tables.find(x => x.id === id)
  if (t) t.status = newStatus
  renderTables()
  toast(newStatus === 'maintenance' ? 'Mesa en mantenimiento' : 'Mesa activada')
}

init()
