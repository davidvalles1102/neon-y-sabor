import { supabase, fmt } from '../../shared/supabase-client.js'
import { initAdminShell } from './admin-auth.js'

async function init() {
  const ctx = await initAdminShell(['admin', 'waiter'])
  if (!ctx) return

  await loadDashboard()

  // Refresh every 60 s
  setInterval(loadDashboard, 60_000)
}

async function loadDashboard() {
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()

  const [
    { data: todayOrders },
    { data: weekOrders },
    { data: tables },
    { data: inKitchen },
    { data: todayPayments },
    { data: topItems },
    { data: todayExpenses }
  ] = await Promise.all([
    supabase.from('payments').select('amount').gte('created_at', `${today}T00:00:00`),
    supabase.from('payments').select('amount, created_at').gte('created_at', weekAgo),
    supabase.from('restaurant_tables').select('status'),
    supabase.from('orders').select('id').in('status', ['in_kitchen']),
    supabase.from('payments').select('method, amount').gte('created_at', `${today}T00:00:00`),
    supabase.from('order_items')
      .select('item_name, quantity, item_price')
      .gte('created_at', `${today}T00:00:00`),
    supabase.from('expenses').select('amount').eq('expense_date', today)
  ])

  // KPIs
  const dayRevenue  = (todayOrders || []).reduce((s, p) => s + +p.amount, 0)
  const weekRevenue = (weekOrders  || []).reduce((s, p) => s + +p.amount, 0)
  const occupied    = (tables || []).filter(t => t.status === 'occupied').length

  document.getElementById('salesToday').textContent    = fmt.currency(dayRevenue)
  document.getElementById('ordersToday').textContent   = `${todayOrders?.length ?? 0} órdenes`
  document.getElementById('salesWeek').textContent     = fmt.currency(weekRevenue)
  document.getElementById('tablesOccupied').textContent= occupied
  document.getElementById('tablesTotal').textContent   = `de ${tables?.length ?? 0} mesas`
  document.getElementById('inKitchen').textContent     = inKitchen?.length ?? 0
  document.getElementById('expensesToday').textContent = fmt.currency((todayExpenses || []).reduce((s, e) => s + +e.amount, 0))

  renderSalesChart(weekOrders || [])
  renderPaymentChart(todayPayments || [])
  renderTopItems(topItems || [])
  loadRecentOrders()
}

function renderSalesChart(payments) {
  const byDay = {}
  payments.forEach(p => {
    const d = p.created_at.slice(0, 10)
    byDay[d] = (byDay[d] || 0) + +p.amount
  })

  // Fill last 7 days even if empty
  const labels = []
  const values = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10)
    labels.push(d.slice(5))   // MM-DD
    values.push(+(byDay[d] || 0).toFixed(2))
  }

  const ctx = document.getElementById('salesChart').getContext('2d')
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Ventas',
        data: values,
        borderColor: '#39FF14',
        backgroundColor: 'rgba(57,255,20,0.08)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#39FF14',
        pointRadius: 4
      }]
    },
    options: neonChartOptions()
  })
}

function renderPaymentChart(payments) {
  const byMethod = {}
  payments.forEach(p => { byMethod[p.method] = (byMethod[p.method] || 0) + +p.amount })

  const ctx = document.getElementById('paymentChart').getContext('2d')
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(byMethod),
      datasets: [{
        data: Object.values(byMethod),
        backgroundColor: ['#39FF14', '#FFB300', '#00BFFF', '#FF3B3B'],
        borderColor: '#161616',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#9E9080', padding: 12, font: { size: 11 } } },
        tooltip: { backgroundColor: '#1e1e1e', titleColor: '#F2ECD8', bodyColor: '#9E9080' }
      }
    }
  })
}

function renderTopItems(items) {
  const byItem = {}
  items.forEach(i => {
    byItem[i.item_name] = (byItem[i.item_name] || 0) + i.quantity
  })
  const sorted = Object.entries(byItem).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const max    = sorted[0]?.[1] || 1

  const el = document.getElementById('topItemsList')
  if (!sorted.length) { el.innerHTML = '<p class="text-muted text-sm">Sin ventas hoy.</p>'; return }

  el.innerHTML = sorted.map(([name, qty], i) => `
    <div class="top-item-row">
      <div class="top-item-rank ${i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : ''}">${i + 1}</div>
      <span style="flex:1;font-size:.85rem">${name}</span>
      <div class="top-item-bar"><div class="top-item-bar__fill" style="width:${(qty/max*100).toFixed(0)}%"></div></div>
      <span class="text-sm text-muted" style="min-width:30px;text-align:right">${qty}x</span>
    </div>`).join('')
}

async function loadRecentOrders() {
  const { data } = await supabase
    .from('orders')
    .select('*, restaurant_tables(number)')
    .order('created_at', { ascending: false })
    .limit(8)

  const statusCls = { open:'badge-amber', in_kitchen:'badge-info', ready:'badge-green', delivered:'badge-muted', paid:'badge-green', cancelled:'badge-danger' }
  const el = document.getElementById('recentOrders')

  if (!data?.length) { el.innerHTML = '<p class="text-muted text-sm">Sin órdenes recientes.</p>'; return }

  el.innerHTML = data.map(o => `
    <div class="recent-order-row">
      <span>Mesa ${o.restaurant_tables?.number ?? '—'}</span>
      <span class="text-muted text-xs">${fmt.time(o.created_at)}</span>
      <span class="neon-amber" style="font-weight:700">${fmt.currency(o.total)}</span>
      <span class="badge ${statusCls[o.status] ?? 'badge-muted'}">${o.status}</span>
    </div>`).join('')
}

function neonChartOptions() {
  return {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e1e1e',
        borderColor: '#2e2e2e',
        borderWidth: 1,
        titleColor: '#F2ECD8',
        bodyColor: '#9E9080'
      }
    },
    scales: {
      x: { ticks: { color: '#5A5045', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#5A5045', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
    }
  }
}

init()
