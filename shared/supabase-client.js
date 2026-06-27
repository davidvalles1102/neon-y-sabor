import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// ─── Replace these values with your Supabase project credentials ───────────
// Supabase → Project Settings → API
const SUPABASE_URL  = 'https://gnjwwhuuzwcxcuqzevyn.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imduand3aHV1endjeGN1cXpldnluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MjI1NDksImV4cCI6MjA5ODA5ODU0OX0.UEFxh2pz36s9VsXzZf--DdWaDQTyLGqAfVko87fgH6w'
// ───────────────────────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// ─── Auth helpers ────────────────────────────────────────────────────────────
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

const STAFF_ROLES = ['admin', 'waiter', 'kitchen']

// Igual que getSession pero devuelve null si el usuario es staff.
// Usar en todas las páginas del customer side para que el personal
// no aparezca como cliente logueado.
export async function getCustomerSession() {
  const session = await getSession()
  if (!session) return null
  const profile = await getProfile(session.user.id)
  if (profile && STAFF_ROLES.includes(profile.role)) return null
  return session
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data  // null if no profile row yet
}

export async function requireAuth(allowedRoles = []) {
  const session = await getSession()
  if (!session) {
    window.location.href = '/adminSide/login.html'
    return null
  }
  if (allowedRoles.length > 0) {
    const profile = await getProfile(session.user.id)
    if (!allowedRoles.includes(profile.role)) {
      window.location.href = '/adminSide/login.html'
      return null
    }
    return { session, profile }
  }
  return { session }
}

// ─── Tax config ──────────────────────────────────────────────────────────────
export const TAX_RATE = 0.08  // 8% IVA Colombia — restaurantes y bares

export function calcTotals(subtotal) {
  const tax   = Math.round(subtotal * TAX_RATE)
  const total = Math.round(subtotal + tax)
  return { subtotal: Math.round(subtotal), tax, total }
}

// ─── Format helpers ──────────────────────────────────────────────────────────
export const fmt = {
  currency: (n) => '$ ' + Math.round(+(n ?? 0)).toLocaleString('es-CO'),
  date: (d) => { const s = String(d); const dt = s.length === 10 ? new Date(s + 'T12:00:00') : new Date(s); return dt.toLocaleDateString('es-CO', { year:'numeric', month:'short', day:'numeric' }) },
  time: (d) => new Date(d).toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' }),
  datetime: (d) => `${fmt.date(d)} ${fmt.time(d)}`
}
