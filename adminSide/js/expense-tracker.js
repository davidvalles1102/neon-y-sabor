import { supabase, fmt } from '../../shared/supabase-client.js'
import { initAdminShell, toast } from './admin-auth.js'

const CAT_LABELS = {
  insumos:       '🥩 Insumos',
  servicios:     '💡 Servicios',
  nomina:        '👥 Nómina',
  renta:         '🏠 Renta',
  mantenimiento: '🔧 Mantenimiento',
  marketing:     '📣 Marketing',
  transporte:    '🛵 Transporte',
  otros:         '📦 Otros'
}

const RECURRENCE_LABELS = { daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual' }

let allExpenses = []
let rangeDays   = 30
let categoryChart, dailyChart

async function init() {
  const ctx = await initAdminShell(['admin'])
  if (!ctx) return

  document.getElementById('filterRange').addEventListener('change', (e) => {
    rangeDays = parseInt(e.target.value)
    loadExpenses()
  })

  document.getElementById('exportBtn').addEventListener('click', exportCSV)
  document.getElementById('newExpenseBtn').addEventListener('click', () => openModal())
  document.getElementById('expenseModalClose').addEventListener('click', closeModal)
  document.getElementById('expenseCancel').addEventListener('click', closeModal)
  document.getElementById('expenseSave').addEventListener('click', saveExpense)
  document.getElementById('expenseRecurring').addEventListener('change', (e) => {
    document.getElementById('recurrenceGroup').classList.toggle('hidden', !e.target.checked)
  })

  await loadExpenses()
}

async function loadExpenses() {
  const since = new Date(Date.now() - rangeDays * 86400_000).toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .gte('expense_date', since)
    .order('expense_date', { ascending: false })

  if (error && error.code === '42P01') {
    document.getElementById('expensesTableBody').innerHTML =
      '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--amber)">⚠️ La tabla de gastos no existe aún. Ejecuta <strong>supabase/expenses_create.sql</strong> en Supabase SQL Editor.</td></tr>'
    return
  }
  if (error) { toast('Error al cargar gastos', 'error'); return }
  allExpenses = data || []
  renderStats()
  renderCharts()
  renderTable()
}

function renderStats() {
  const today = new Date().toISOString().split('T')[0]
  const total      = allExpenses.reduce((s, e) => s + +e.amount, 0)
  const todayTotal = allExpenses.filter(e => e.expense_date === today).reduce((s, e) => s + +e.amount, 0)
  const recurring  = allExpenses.filter(e => e.is_recurring)

  const byCat = {}
  allExpenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + +e.amount })
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]

  document.getElementById('periodTotal').textContent    = fmt.currency(total)
  document.getElementById('periodCount').textContent    = `${allExpenses.length} registros`
  document.getElementById('todayTotal').textContent     = fmt.currency(todayTotal)
  document.getElementById('topCategory').textContent    = topCat ? CAT_LABELS[topCat[0]] : '—'
  document.getElementById('recurringCount').textContent = recurring.length
  document.getElementById('recurringTotal').textContent = `${fmt.currency(recurring.reduce((s, e) => s + +e.amount, 0))} / período`
}

function renderCharts() {
  const byCat = {}
  allExpenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + +e.amount })
  const catLabels = Object.keys(byCat).map(k => CAT_LABELS[k] ?? k)
  const catValues = Object.values(byCat)

  const catCtx = document.getElementById('categoryExpenseChart').getContext('2d')
  if (categoryChart) categoryChart.destroy()
  categoryChart = new Chart(catCtx, {
    type: 'bar',
    data: {
      labels: catLabels,
      datasets: [{
        label: 'Gastos ($)',
        data: catValues,
        backgroundColor: 'rgba(255,59,59,0.7)',
        borderColor: '#FF3B3B',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: { ...chartOptions('$'), indexAxis: 'y' }
  })

  const byDay = {}
  allExpenses.forEach(e => { byDay[e.expense_date] = (byDay[e.expense_date] || 0) + +e.amount })
  const dayLabels = Object.keys(byDay).sort()
  const dayValues = dayLabels.map(d => byDay[d])

  const dayCtx = document.getElementById('dailyExpenseChart').getContext('2d')
  if (dailyChart) dailyChart.destroy()
  dailyChart = new Chart(dayCtx, {
    type: 'line',
    data: {
      labels: dayLabels,
      datasets: [{
        label: 'Gastos ($)',
        data: dayValues,
        borderColor: '#FF3B3B',
        backgroundColor: 'rgba(255,59,59,0.08)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#FF3B3B',
        pointRadius: 4
      }]
    },
    options: chartOptions('$')
  })
}

function renderTable() {
  const methodIcon = { cash: '💵', card: '💳', transfer: '📲' }
  const tbody = document.getElementById('expensesTableBody')

  if (!allExpenses.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-muted text-center" style="padding:32px">Sin gastos registrados en este período.</td></tr>'
    return
  }

  tbody.innerHTML = allExpenses.map(e => `
    <tr>
      <td>${fmt.date(e.expense_date)}</td>
      <td>${CAT_LABELS[e.category] ?? e.category}</td>
      <td>${e.description}</td>
      <td>${methodIcon[e.payment_method] ?? '—'}</td>
      <td class="text-danger" style="font-weight:700">${fmt.currency(e.amount)}</td>
      <td>${e.is_recurring ? `<span class="badge badge-amber">${RECURRENCE_LABELS[e.recurrence] ?? 'Sí'}</span>` : '—'}</td>
      <td>${e.profiles?.full_name ?? '—'}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="editExpense('${e.id}')">✎</button>
        <button class="btn btn-danger btn-sm" onclick="deleteExpense('${e.id}')">✕</button>
      </td>
    </tr>
  `).join('')
}

function openModal(expense = null) {
  document.getElementById('expenseModalTitle').textContent = expense ? 'Editar Gasto' : 'Nuevo Gasto'
  document.getElementById('expenseId').value             = expense?.id ?? ''
  document.getElementById('expenseCategory').value       = expense?.category ?? 'insumos'
  document.getElementById('expenseDescription').value    = expense?.description ?? ''
  document.getElementById('expenseAmount').value         = expense?.amount ?? ''
  document.getElementById('expensePaymentMethod').value  = expense?.payment_method ?? 'cash'
  document.getElementById('expenseDate').value           = expense?.expense_date ?? new Date().toISOString().split('T')[0]
  document.getElementById('expenseRecurring').checked    = expense?.is_recurring ?? false
  document.getElementById('expenseRecurrence').value     = expense?.recurrence ?? 'monthly'
  document.getElementById('recurrenceGroup').classList.toggle('hidden', !(expense?.is_recurring))
  document.getElementById('expenseModal').classList.remove('hidden')
}

function closeModal() {
  document.getElementById('expenseModal').classList.add('hidden')
}

async function saveExpense() {
  const id            = document.getElementById('expenseId').value
  const description   = document.getElementById('expenseDescription').value.trim()
  const amount        = parseFloat(document.getElementById('expenseAmount').value)
  const isRecurring   = document.getElementById('expenseRecurring').checked

  if (!description) { toast('Ingresa una descripción', 'warning'); return }
  if (!amount || amount <= 0) { toast('Ingresa un monto válido', 'warning'); return }

  const payload = {
    category:       document.getElementById('expenseCategory').value,
    description,
    amount,
    payment_method: document.getElementById('expensePaymentMethod').value,
    expense_date:   document.getElementById('expenseDate').value,
    is_recurring:   isRecurring,
    recurrence:     isRecurring ? document.getElementById('expenseRecurrence').value : null
  }

  let error
  if (id) {
    ;({ error } = await supabase.from('expenses').update(payload).eq('id', id))
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    ;({ error } = await supabase.from('expenses').insert({ ...payload, registered_by: user.id }))
  }

  if (error) { toast('Error al guardar el gasto', 'error'); return }
  toast(id ? 'Gasto actualizado' : 'Gasto registrado', 'success')
  closeModal()
  await loadExpenses()
}

window.editExpense = (id) => {
  const expense = allExpenses.find(e => e.id === id)
  if (expense) openModal(expense)
}

window.deleteExpense = async (id) => {
  if (!confirm('¿Eliminar este gasto permanentemente?')) return
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) { toast('Error al eliminar', 'error'); return }
  toast('Gasto eliminado', 'success')
  await loadExpenses()
}

function exportCSV() {
  const rows = [['Fecha', 'Categoría', 'Descripción', 'Método', 'Monto', 'Recurrente', 'Registrado por']]
  allExpenses.forEach(e => {
    rows.push([
      e.expense_date,
      CAT_LABELS[e.category] ?? e.category,
      e.description,
      e.payment_method ?? '',
      e.amount,
      e.is_recurring ? (RECURRENCE_LABELS[e.recurrence] ?? 'Sí') : 'No',
      e.profiles?.full_name ?? ''
    ])
  })
  const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const link = document.createElement('a')
  link.href  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  link.download = `gastos-${rangeDays}d.csv`
  link.click()
}

function chartOptions(prefix = '') {
  return {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#261510',
        borderColor: '#3A1913',
        borderWidth: 1,
        titleColor: '#FFFFFF',
        bodyColor: '#BFA099',
        callbacks: {
          label: (ctx) => ` ${prefix}${(+ctx.parsed.y || +ctx.parsed).toFixed(2)}`
        }
      }
    },
    scales: {
      x: { ticks: { color: '#7A5248', font: { size: 11 } }, grid: { color: 'rgba(255,150,80,0.05)' } },
      y: { ticks: { color: '#7A5248', font: { size: 11 } }, grid: { color: 'rgba(255,150,80,0.05)' } }
    }
  }
}

init()
