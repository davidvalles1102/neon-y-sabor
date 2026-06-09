import { supabase, getCustomerSession } from '../../shared/supabase-client.js'
import { toast } from './utils.js'

// ─── Nav auth state ───────────────────────────────────────────────
;(async () => {
  const session = await getCustomerSession()
  const authBtn = document.getElementById('nav-auth-btn')
  if (session && authBtn) {
    authBtn.textContent = 'Mi Perfil'
    authBtn.href = 'profile.html'
  }

  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 40)
  })

  // Mobile nav toggle
  document.getElementById('navToggle')?.addEventListener('click', () => {
    const mobile  = document.getElementById('navMobile')
    const toggle  = document.getElementById('navToggle')
    mobile?.classList.toggle('open')
    toggle?.setAttribute('aria-expanded', String(mobile?.classList.contains('open') ?? false))
  })
})()

// ─── Load categories & menu ───────────────────────────────────────
let allItems = []
let activeCategory = 'all'
let searchQuery    = ''

async function loadMenu() {
  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from('categories').select('*').eq('active', true).order('display_order'),
    supabase.from('menu_items').select('*, categories(name)').eq('available', true)
  ])

  allItems = items || []

  // Build category tabs
  const tabsEl = document.getElementById('categoryTabs')
  categories?.forEach(cat => {
    const btn = document.createElement('button')
    btn.className = 'cat-tab'
    btn.dataset.cat = cat.id
    btn.textContent = `${cat.icon} ${cat.name}`
    btn.addEventListener('click', () => setCategory(cat.id, btn))
    tabsEl.appendChild(btn)
  })

  renderMenu()
}

function setCategory(catId, btn) {
  activeCategory = catId
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'))
  btn.classList.add('active')
  renderMenu()
}

function renderMenu() {
  const grid = document.getElementById('menuGrid')
  document.getElementById('menuSkeleton')?.remove()

  const filtered = allItems.filter(item => {
    const matchCat    = activeCategory === 'all' || item.category_id === activeCategory
    const matchSearch = item.name.toLowerCase().includes(searchQuery) ||
                        (item.description || '').toLowerCase().includes(searchQuery)
    return matchCat && matchSearch
  })

  if (filtered.length === 0) {
    grid.innerHTML = `<p class="text-muted text-sm" style="grid-column:1/-1;text-align:center;padding:40px">
      No se encontraron platillos.
    </p>`
    return
  }

  grid.innerHTML = filtered.map(item => `
    <div class="menu-card ${item.is_featured ? 'featured' : ''}">
      ${item.image_url
        ? `<img class="menu-card__img" src="${item.image_url}" alt="${item.name}" loading="lazy">`
        : `<div class="menu-card__img-placeholder">${item.categories?.icon ?? '🍽️'}</div>`
      }
      <div class="menu-card__body">
        <div class="menu-card__name">${item.name}</div>
        ${item.description ? `<div class="menu-card__desc">${item.description}</div>` : ''}
        <div class="menu-card__footer">
          <span class="menu-card__price">$${(+item.price).toFixed(2)}</span>
          ${item.is_featured ? `<span class="badge badge-amber menu-card__badge">⭐ Destacado</span>` : ''}
        </div>
      </div>
    </div>
  `).join('')
}

// Search
document.getElementById('menuSearch')?.addEventListener('input', (e) => {
  searchQuery = e.target.value.toLowerCase()
  renderMenu()
})

// All tab
document.querySelector('.cat-tab[data-cat="all"]')?.addEventListener('click', (e) => {
  setCategory('all', e.currentTarget)
})

loadMenu()
