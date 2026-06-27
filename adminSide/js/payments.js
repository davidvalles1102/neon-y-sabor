import { supabase, fmt } from '../../shared/supabase-client.js'
import { initAdminShell, toast } from './admin-auth.js'
import { modifiersSummary } from '../../shared/modifier-modal.js'

let allPayments     = []
let filterDate      = new Date().toISOString().split('T')[0]
let lastPaymentData = null   // snapshot para WhatsApp

async function init() {
  const ctx = await initAdminShell(['admin', 'waiter'])
  if (!ctx) return

  const dateInput = document.getElementById('filterDate')
  dateInput.value = filterDate
  dateInput.addEventListener('change', (e) => { filterDate = e.target.value; loadPayments() })

  document.getElementById('exportBtn').addEventListener('click', exportCSV)
  document.getElementById('receiptClose').addEventListener('click',  () => document.getElementById('receiptModal').classList.add('hidden'))
  document.getElementById('receiptClose2').addEventListener('click', () => document.getElementById('receiptModal').classList.add('hidden'))

  // WhatsApp modal
  document.getElementById('waModalClose').addEventListener('click', () => document.getElementById('waModal').classList.add('hidden'))
  document.getElementById('waCancel').addEventListener('click',     () => document.getElementById('waModal').classList.add('hidden'))
  document.getElementById('waConfirm').addEventListener('click',    confirmWhatsApp)
  document.getElementById('waPhone').addEventListener('keydown', e => { if (e.key === 'Enter') confirmWhatsApp() })

  await loadPayments()
}

async function loadPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*, orders(*, restaurant_tables(number), order_items(*, order_item_modifiers(*))), profiles!payments_processed_by_fkey(full_name)')
    .gte('created_at', `${filterDate}T00:00:00`)
    .lte('created_at', `${filterDate}T23:59:59`)
    .order('created_at', { ascending: false })

  if (error) { toast('Error al cargar pagos', 'error'); return }
  allPayments = data || []
  renderStats()
  renderTable()
}

function renderStats() {
  const total    = allPayments.reduce((s, p) => s + +p.amount, 0)
  const byCash   = allPayments.filter(p => p.method === 'cash').reduce((s, p) => s + +p.amount, 0)
  const byCard   = allPayments.filter(p => p.method === 'card').reduce((s, p) => s + +p.amount, 0)
  const byTrans  = allPayments.filter(p => p.method === 'transfer').reduce((s, p) => s + +p.amount, 0)

  document.getElementById('dayTotal').textContent       = fmt.currency(total)
  document.getElementById('cashTotal').textContent      = fmt.currency(byCash)
  document.getElementById('cardTotal').textContent      = fmt.currency(byCard)
  document.getElementById('transferTotal').textContent  = fmt.currency(byTrans)
}

function renderTable() {
  const methodIcon = { cash: '💵', card: '💳', transfer: '📲', points: '⭐' }
  const tbody = document.getElementById('paymentsTableBody')

  if (!allPayments.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-muted text-center" style="padding:32px">Sin pagos para esta fecha.</td></tr>'
    return
  }

  tbody.innerHTML = allPayments.map(p => `
    <tr>
      <td><span class="text-xs" style="font-family:monospace">${p.receipt_number}</span></td>
      <td>Mesa ${p.orders?.restaurant_tables?.number ?? '—'}</td>
      <td>${methodIcon[p.method] ?? ''} ${p.method}</td>
      <td class="neon-green" style="font-weight:700">${fmt.currency(p.amount)}</td>
      <td>${p.change_amount > 0 ? fmt.currency(p.change_amount) : '—'}</td>
      <td>${p.profiles?.full_name ?? '—'}</td>
      <td>${fmt.time(p.created_at)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="showReceipt('${p.id}')">🖨️</button>
      </td>
    </tr>
  `).join('')
}

window.showReceipt = (payId) => {
  const p = allPayments.find(x => x.id === payId)
  if (!p) return

  // Guardar snapshot para WhatsApp
  lastPaymentData = p

  document.getElementById('receiptContent').innerHTML = `
    <div class="receipt">
      <div class="receipt__logo">CRUNCHIES</div>
      <div class="receipt__address">${fmt.datetime(p.created_at)}</div>
      <hr class="receipt__divider">
      <div>Recibo: ${p.receipt_number}</div>
      <div>Mesa: ${p.orders?.restaurant_tables?.number ?? '—'}</div>
      <div>Cajero: ${p.profiles?.full_name ?? '—'}</div>
      <hr class="receipt__divider">
      <div class="receipt__item receipt__total"><span>TOTAL</span><span>${fmt.currency(p.amount)}</span></div>
      <div class="receipt__item"><span>Método</span><span>${p.method}</span></div>
      ${p.change_amount > 0 ? `<div class="receipt__item"><span>Cambio</span><span>${fmt.currency(p.change_amount)}</span></div>` : ''}
      <hr class="receipt__divider">
      <div class="receipt__thanks">¡Gracias por su visita!</div>
    </div>`
  document.getElementById('receiptModal').classList.remove('hidden')
}

// ─── PDF Receipt ──────────────────────────────────────────────────
function buildPaymentPDF(p) {
  if (!window.jspdf) return null
  const { jsPDF } = window.jspdf

  const orderItems = p.orders?.order_items ?? []
  const itemsH = orderItems.reduce((h, i) => h + Math.ceil((i.item_name || '').length / 26) * 5.2, 0)
  const pageH  = Math.max(170, 118 + itemsH)

  const doc = new jsPDF({ unit: 'mm', format: [80, pageH] })
  const W = 80
  let y = 0

  const fnt = (size, style = 'normal', r = 30, g = 30, b = 30) => {
    doc.setFontSize(size); doc.setFont('helvetica', style); doc.setTextColor(r, g, b)
  }
  const ctr = (text, size, bold = false) => {
    fnt(size, bold ? 'bold' : 'normal')
    doc.text(text, W / 2, y, { align: 'center' })
    y += size * 0.35 + 1.5
  }
  const hr = (light = false) => {
    doc.setDrawColor(light ? 220 : 170, light ? 220 : 170, light ? 220 : 170)
    doc.line(5, y, W - 5, y); y += 4
  }
  const row2 = (left, right, size = 8.5, bold = false) => {
    fnt(size, bold ? 'bold' : 'normal', bold ? 20 : 60, bold ? 20 : 60, bold ? 20 : 60)
    doc.text(String(left),  5,     y)
    doc.text(String(right), W - 5, y, { align: 'right' })
    y += size * 0.38 + 1.5
  }

  // Top bar
  doc.setFillColor(37, 211, 102); doc.rect(0, 0, W, 3.5, 'F')
  y = 11

  // Header
  fnt(15, 'bold', 20, 20, 20); ctr('CRUNCHIES', 15, true)
  fnt(8.5, 'normal', 100, 100, 100); ctr('Restaurante & Delivery', 8.5)
  y += 1; hr()

  // Meta
  row2('Recibo:', p.receipt_number, 8)
  row2('Fecha:',  fmt.datetime(p.created_at), 8)
  row2('Mesa:',   p.orders?.restaurant_tables?.number ? `Mesa ${p.orders.restaurant_tables.number}` : '—', 8)
  row2('Cajero:', p.profiles?.full_name ?? '—', 8)
  y += 1; hr()

  // Items (if available)
  if (orderItems.length) {
    fnt(7.5, 'bold', 90, 90, 90)
    doc.text('DESCRIPCIÓN', 5, y); doc.text('VALOR', W - 5, y, { align: 'right' })
    y += 5; hr(true)
    orderItems.forEach(item => {
      const mods  = (item.order_item_modifiers || []).map(m => ({ option_name: m.option_name }))
      const label = mods.length ? `${item.quantity}× ${item.item_name} (${modifiersSummary(mods)})` : `${item.quantity}× ${item.item_name}`
      const price = fmt.currency(item.item_price * item.quantity)
      fnt(8.5, 'normal', 30, 30, 30)
      const lines = doc.splitTextToSize(label, 50)
      lines.forEach((ln, idx) => {
        doc.text(ln, idx === 0 ? 5 : 8, y)
        if (idx === 0) { fnt(8.5, 'bold', 30, 30, 30); doc.text(price, W - 5, y, { align: 'right' }) }
        y += 5
      })
    })
    y += 1; hr()
  }

  // Total
  y += 1
  doc.setFillColor(245, 245, 245); doc.rect(3, y - 3.5, W - 6, 9.5, 'F')
  row2('TOTAL', fmt.currency(p.amount), 12, true)
  y += 2; hr()

  // Payment
  const mLabel = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', points: 'Puntos' }
  row2('Método de pago:', mLabel[p.method] ?? p.method, 8.5)
  if (p.change_amount > 0) row2('Cambio:', fmt.currency(p.change_amount), 8)
  hr()

  // Footer
  y += 2
  fnt(10, 'bold', 30, 30, 30); ctr('¡Gracias por su visita!', 10, true)
  fnt(7.5, 'normal', 150, 150, 150); ctr('crunchies.vercel.app', 7.5)

  doc.setFillColor(37, 211, 102); doc.rect(0, pageH - 3.5, W, 3.5, 'F')
  return doc
}

window.downloadPDF = function () {
  if (!lastPaymentData) return
  const doc = buildPaymentPDF(lastPaymentData)
  if (doc) doc.save(`recibo-${lastPaymentData.receipt_number}.pdf`)
}

// ─── WhatsApp ─────────────────────────────────────────────────────
window.openWhatsAppModal = function () {
  if (!lastPaymentData) return
  document.getElementById('waPhone').value = ''
  document.getElementById('waModal').classList.remove('hidden')
  document.getElementById('waPhone').focus()
}

function buildWhatsAppText(p) {
  const methodLabels = { cash: 'Efectivo 💵', card: 'Tarjeta 💳', transfer: 'Transferencia 📲', points: 'Puntos ⭐' }
  const changeLine = p.change_amount > 0 ? `\nCambio: ${fmt.currency(p.change_amount)}` : ''
  const orderItems = p.orders?.order_items ?? []
  const itemLines = orderItems.length
    ? orderItems.map(i => `${i.quantity}x ${i.item_name}  ${fmt.currency(i.item_price * i.quantity)}`).join('\n') + '\n─────────────────────'
    : ''
  return [
    `🍗 *CRUNCHIES*`,
    `Recibo: ${p.receipt_number}`,
    `📅 ${fmt.datetime(p.created_at)}`,
    `Mesa: ${p.orders?.restaurant_tables?.number ?? '—'}`,
    `─────────────────────`,
    itemLines,
    `*TOTAL: ${fmt.currency(p.amount)}*`,
    `Método: ${methodLabels[p.method] ?? p.method}${changeLine}`,
    `─────────────────────`,
    `¡Gracias por su visita! 🌟`
  ].filter(Boolean).join('\n')
}

function confirmWhatsApp() {
  const raw = document.getElementById('waPhone').value.trim().replace(/[\s\-\(\)+]/g, '')
  if (!raw) {
    toast('Ingresa un número de WhatsApp', 'warning')
    document.getElementById('waPhone').focus()
    return
  }
  // Generar y descargar PDF
  const doc = buildPaymentPDF(lastPaymentData)
  if (doc) {
    doc.save(`recibo-${lastPaymentData.receipt_number}.pdf`)
    toast('PDF descargado — adjúntalo en WhatsApp 📎', 'success')
  }
  window.open(`https://wa.me/${raw}`, '_blank')
  document.getElementById('waModal').classList.add('hidden')
}

function exportCSV() {
  const rows = [['Recibo', 'Mesa', 'Método', 'Monto', 'Cambio', 'Cajero', 'Fecha/Hora']]
  allPayments.forEach(p => {
    rows.push([
      p.receipt_number,
      `Mesa ${p.orders?.restaurant_tables?.number ?? ''}`,
      p.method,
      p.amount,
      p.change_amount,
      p.profiles?.full_name ?? '',
      fmt.datetime(p.created_at)
    ])
  })
  const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const link = document.createElement('a')
  link.href  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  link.download = `pagos-${filterDate}.csv`
  link.click()
}

init()
