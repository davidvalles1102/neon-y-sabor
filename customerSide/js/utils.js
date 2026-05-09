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

export function setLoading(btn, loading, defaultText) {
  btn.disabled = loading
  btn.textContent = loading ? 'Cargando...' : defaultText
}
