import { supabase, getSession, getProfile } from '../../shared/supabase-client.js'

// ─── Shared: sidebar user, logout, clock, toggle ─────────────────
export async function initAdminShell(allowedRoles = ['admin', 'waiter', 'kitchen']) {
  const session = await getSession()
  if (!session) { window.location.href = 'login.html'; return null }

  const profile = await getProfile(session.user.id)
  if (!allowedRoles.includes(profile.role)) {
    window.location.href = 'login.html'
    return null
  }

  // Sidebar user label
  const el = document.getElementById('sidebarUser')
  if (el) el.textContent = `${profile.full_name || session.user.email} · ${profile.role}`

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await supabase.auth.signOut()
    window.location.href = 'login.html'
  })

  // Live clock
  const clockEl = document.getElementById('liveClock')
  if (clockEl) {
    const tick = () => {
      clockEl.textContent = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
    tick()
    setInterval(tick, 1000)
  }

  // Mobile sidebar toggle
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open')
  })

  return { session, profile }
}

// ─── Login page handler ──────────────────────────────────────────
;(async () => {
  const form = document.getElementById('loginForm')
  if (!form) return  // Not on login page

  const session = await getSession()
  if (session) {
    const p = await getProfile(session.user.id)
    if (!['admin', 'waiter', 'kitchen'].includes(p?.role)) {
      await supabase.auth.signOut()
      return  // Stay on login page
    }
    redirectByRole(p.role)
    return
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = document.getElementById('loginBtn')
    const err = document.getElementById('loginError')
    btn.disabled = true
    btn.textContent = 'Verificando...'
    err.classList.add('hidden')

    const { data, error } = await supabase.auth.signInWithPassword({
      email:    document.getElementById('email').value.trim(),
      password: document.getElementById('password').value
    })

    if (error) {
      err.textContent = 'Credenciales incorrectas.'
      err.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = 'Ingresar al Panel'
      return
    }

    const profile = await getProfile(data.user.id)
    if (!profile) {
      await supabase.auth.signOut()
      err.textContent = 'Perfil de usuario no encontrado. Contacta al administrador.'
      err.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = 'Ingresar al Panel'
      return
    }
    if (!['admin', 'waiter', 'kitchen'].includes(profile.role)) {
      await supabase.auth.signOut()
      err.textContent = 'No tienes permiso para acceder al panel.'
      err.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = 'Ingresar al Panel'
      return
    }

    redirectByRole(profile.role)
  })
})()

function redirectByRole(role) {
  if (role === 'kitchen') { window.location.href = 'kitchen.html'; return }
  window.location.href = 'dashboard.html'
}

// ─── Toast helper shared across admin ────────────────────────────
export function toast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toast-container')
  if (!container) return
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.textContent = message
  container.appendChild(el)
  setTimeout(() => {
    el.style.animation = 'fadeOut .3s ease forwards'
    setTimeout(() => el.remove(), 300)
  }, duration)
}
