'use client'

import { createClient } from './supabase/client'

export type PinSession = {
  staff_id: string
  full_name: string
  role: 'kitchen' | 'delivery' | 'waiter'
}

const SESSION_KEY = 'crunchies_pin_session'

export function getPinSession(): PinSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as PinSession) : null
  } catch { return null }
}

export async function loginWithPin(pin: string): Promise<PinSession | null> {
  const supabase = createClient()

  const { data: staff, error: e1 } = await supabase.rpc('verify_staff_pin', { p_pin: pin })
  if (e1) console.error('[PIN] verify_staff_pin error:', e1.message)
  if (!staff) { console.warn('[PIN] PIN no encontrado o inactivo'); return null }

  const { data: creds, error: e2 } = await supabase.rpc('get_role_credentials', { p_pin: pin })
  if (e2) console.error('[PIN] get_role_credentials error:', e2.message)
  if (!creds) { console.warn('[PIN] Sin credenciales para el rol'); return null }

  const { email, password } = creds as { email: string; password: string }
  const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
  if (authErr) { console.error('[PIN] signInWithPassword error:', authErr.message, '| email:', email); return null }

  const s = staff as { staff_id: string; full_name: string; role: 'kitchen' | 'delivery' | 'waiter' }
  const session: PinSession = { staff_id: s.staff_id, full_name: s.full_name, role: s.role }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export async function logoutPin(): Promise<void> {
  const supabase = createClient()
  await supabase.auth.signOut()
  sessionStorage.removeItem(SESSION_KEY)
}

export async function logEvent(
  orderId: string,
  event: string,
  staffId: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const supabase = createClient()
  // fire-and-forget — don't block UI
  supabase.from('order_events').insert({ order_id: orderId, event, staff_id: staffId, metadata }).then()
}
