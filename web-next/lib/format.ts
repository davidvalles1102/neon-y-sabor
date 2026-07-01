export const TAX_RATE = 0.08 // 8% IVA

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function calcTotals(subtotal: number) {
  const tax = round2(subtotal * TAX_RATE)
  const total = round2(subtotal + tax)
  return { subtotal: round2(subtotal), tax, total }
}

export const fmt = {
  currency: (n: number) => '$' + (+(n ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  date: (d: string) => {
    const s = String(d)
    const dt = s.length === 10 ? new Date(s + 'T12:00:00') : new Date(s)
    return dt.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
  },
  time: (d: string) => new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
  datetime: (d: string) => `${fmt.date(d)} ${fmt.time(d)}`,
}
