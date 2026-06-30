import { supabase } from '../../shared/supabase-client.js'
import { initAdminShell, toast } from './admin-auth.js'

let categories   = []
let menuItems    = []
let modGroups    = []   // [{ id, name, selection_type, required, max_select, modifier_options: [...] }]
let activeCat    = 'all'
let editingId    = null

async function init() {
  const ctx = await initAdminShell(['admin'])
  if (!ctx) return
  await Promise.all([loadCategories(), loadItems(), loadModGroups()])
  setupModals()
}

// ─── Categories ───────────────────────────────────────────────────
async function loadCategories() {
  const { data } = await supabase.from('categories').select('*').order('display_order')
  categories = data || []
  buildCatTabs()
  buildCatSelect()
}

function buildCatTabs() {
  const el = document.getElementById('menuCatTabs')
  el.innerHTML = `<button class="cat-tab ${activeCat === 'all' ? 'active' : ''}" data-cat="all">Todos</button>`
  categories.forEach(c => {
    const btn = document.createElement('button')
    btn.className = `cat-tab ${activeCat === c.id ? 'active' : ''}`
    btn.dataset.cat = c.id
    btn.textContent = `${c.icon ?? ''} ${c.name}`
    el.appendChild(btn)
  })
  el.querySelectorAll('.cat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCat = btn.dataset.cat
      el.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      renderGrid()
    })
  })
}

function buildCatSelect() {
  const sel = document.getElementById('itemCategory')
  sel.innerHTML = '<option value="">Seleccionar...</option>'
  categories.forEach(c => {
    const opt = document.createElement('option')
    opt.value = c.id
    opt.textContent = `${c.icon} ${c.name}`
    sel.appendChild(opt)
  })
}

// ─── Items ────────────────────────────────────────────────────────
async function loadItems() {
  const { data } = await supabase.from('menu_items').select('*, categories(name, icon)').order('created_at', { ascending: false })
  menuItems = data || []
  renderGrid()
}

function renderGrid() {
  const grid = document.getElementById('menuMgmtGrid')
  const filtered = activeCat === 'all' ? menuItems : menuItems.filter(i => i.category_id === activeCat)

  if (!filtered.length) {
    grid.innerHTML = '<p class="text-muted text-sm">No hay platillos en esta categoría.</p>'
    return
  }

  grid.innerHTML = filtered.map(item => `
    <div class="mgmt-card ${!item.available ? 'mgmt-card--inactive' : ''}">
      ${item.image_url
        ? `<img class="mgmt-card__img" src="${item.image_url}" alt="${item.name}" loading="lazy">`
        : `<div class="mgmt-card__img">${item.categories?.icon ?? '🍽️'}</div>`
      }
      <div class="mgmt-card__body">
        <div class="mgmt-card__name">${item.name}${item.is_featured ? ' ⭐' : ''}</div>
        <div class="mgmt-card__cat">${item.categories?.name ?? '—'}</div>
        <div class="mgmt-card__price">$${(+item.price).toFixed(2)}</div>
      </div>
      <div class="mgmt-card__actions">
        <button class="btn btn-outline btn-sm" onclick="editItem('${item.id}')">✏️ Editar</button>
        <button class="btn btn-sm ${item.available ? 'btn-ghost' : 'btn-amber'}" onclick="toggleAvail('${item.id}', ${!item.available})">
          ${item.available ? '🔴 Pausar' : '🟢 Activar'}
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteItem('${item.id}')">✕</button>
      </div>
    </div>
  `).join('')
}

// ─── Item Modal ───────────────────────────────────────────────────
function setupModals() {
  document.getElementById('addItemBtn').addEventListener('click', () => openItemModal())
  document.getElementById('itemModalClose').addEventListener('click',   closeItemModal)
  document.getElementById('itemModalCancel').addEventListener('click',  closeItemModal)
  document.getElementById('saveItemBtn').addEventListener('click',      saveItem)

  document.getElementById('manageCatsBtn').addEventListener('click', () => {
    renderCatList()
    document.getElementById('catsModal').classList.remove('hidden')
  })
  document.getElementById('catsModalClose').addEventListener('click', () => document.getElementById('catsModal').classList.add('hidden'))
  document.getElementById('addCatForm').addEventListener('submit', addCategory)

  document.getElementById('manageModsBtn').addEventListener('click', () => {
    renderModGroupsList()
    document.getElementById('modsModal').classList.remove('hidden')
  })
  document.getElementById('modsModalClose').addEventListener('click', () => document.getElementById('modsModal').classList.add('hidden'))
  document.getElementById('addModGroupForm').addEventListener('submit', addModGroup)
  document.getElementById('newModGroupType').addEventListener('change', (e) => {
    document.getElementById('newModGroupMaxWrap').classList.toggle('hidden', e.target.value !== 'multiple')
  })
}

async function openItemModal(item = null) {
  editingId = item?.id ?? null
  document.getElementById('itemModalTitle').textContent = item ? 'Editar Platillo' : 'Nuevo Platillo'
  document.getElementById('itemId').value          = item?.id ?? ''
  document.getElementById('itemName').value         = item?.name ?? ''
  document.getElementById('itemCategory').value     = item?.category_id ?? ''
  document.getElementById('itemDescription').value  = item?.description ?? ''
  document.getElementById('itemPrice').value        = item?.price ?? ''
  document.getElementById('itemImageUrl').value     = item?.image_url ?? ''
  document.getElementById('itemAvailable').checked  = item?.available ?? true
  document.getElementById('itemFeatured').checked   = item?.is_featured ?? false
  document.getElementById('itemFormMsg').classList.add('hidden')

  let assignedGroupIds = []
  if (item) {
    const { data } = await supabase.from('menu_item_modifier_groups').select('modifier_group_id').eq('menu_item_id', item.id)
    assignedGroupIds = (data || []).map(r => r.modifier_group_id)
  }
  renderItemModGroups(assignedGroupIds)

  document.getElementById('itemModal').classList.remove('hidden')
}

function renderItemModGroups(assignedGroupIds = []) {
  const el = document.getElementById('itemModGroups')
  if (!modGroups.length) {
    el.innerHTML = '<p class="text-muted text-sm">Sin grupos de modificadores creados. Usa "Modificadores" en la barra superior.</p>'
    return
  }
  el.innerHTML = modGroups.map(g => `
    <label class="checkbox-label" style="cursor:pointer">
      <input type="checkbox" class="item-mod-group-cb" value="${g.id}" ${assignedGroupIds.includes(g.id) ? 'checked' : ''}>
      <span>${g.name} <span class="text-muted text-xs">(${g.selection_type === 'single' ? 'única' : 'múltiple'}${g.required ? ', obligatorio' : ''})</span></span>
    </label>
  `).join('')
}

function closeItemModal() { document.getElementById('itemModal').classList.add('hidden') }

async function saveItem() {
  const msgEl = document.getElementById('itemFormMsg')
  msgEl.classList.add('hidden')

  const payload = {
    name:        document.getElementById('itemName').value.trim(),
    category_id: document.getElementById('itemCategory').value || null,
    description: document.getElementById('itemDescription').value.trim() || null,
    price:       parseFloat(document.getElementById('itemPrice').value),
    image_url:   document.getElementById('itemImageUrl').value.trim() || null,
    available:   document.getElementById('itemAvailable').checked,
    is_featured: document.getElementById('itemFeatured').checked,
    updated_at:  new Date().toISOString()
  }

  if (!payload.name || isNaN(payload.price)) {
    msgEl.textContent = 'Nombre y precio son requeridos.'
    msgEl.className = 'alert alert-error'
    msgEl.classList.remove('hidden')
    return
  }

  let error, itemId = editingId
  if (editingId) {
    ;({ error } = await supabase.from('menu_items').update(payload).eq('id', editingId))
  } else {
    const { data, error: insertErr } = await supabase.from('menu_items').insert(payload).select().single()
    error = insertErr
    itemId = data?.id
  }

  if (error) {
    msgEl.textContent = error.message
    msgEl.className = 'alert alert-error'
    msgEl.classList.remove('hidden')
    return
  }

  const selectedGroupIds = [...document.querySelectorAll('.item-mod-group-cb:checked')].map(cb => cb.value)
  await supabase.from('menu_item_modifier_groups').delete().eq('menu_item_id', itemId)
  if (selectedGroupIds.length) {
    await supabase.from('menu_item_modifier_groups').insert(
      selectedGroupIds.map(gid => ({ menu_item_id: itemId, modifier_group_id: gid }))
    )
  }

  closeItemModal()
  toast(editingId ? 'Platillo actualizado' : 'Platillo agregado')
  await loadItems()
}

window.editItem = (id) => {
  const item = menuItems.find(i => i.id === id)
  if (item) openItemModal(item)
}

window.toggleAvail = async (id, newVal) => {
  const { error } = await supabase.from('menu_items').update({ available: newVal }).eq('id', id)
  if (error) { toast('Error', 'error'); return }
  toast(newVal ? 'Platillo activado' : 'Platillo pausado')
  await loadItems()
}

window.deleteItem = async (id) => {
  if (!confirm('¿Eliminar este platillo permanentemente?')) return
  const { error } = await supabase.from('menu_items').delete().eq('id', id)
  if (error) { toast('Error al eliminar', 'error'); return }
  toast('Platillo eliminado')
  await loadItems()
}

// ─── Categories management ────────────────────────────────────────
function renderCatList() {
  const el = document.getElementById('catsList')
  el.innerHTML = categories.map(c => `
    <div class="cat-list-item">
      <span>${c.icon} ${c.name}</span>
      <button class="btn btn-danger btn-sm" onclick="deleteCat('${c.id}')">✕</button>
    </div>
  `).join('')
}

async function addCategory(e) {
  e.preventDefault()
  const name = document.getElementById('newCatName').value.trim()
  const icon = document.getElementById('newCatIcon').value.trim() || '🍽️'
  if (!name) return
  const { error } = await supabase.from('categories').insert({ name, icon, display_order: categories.length + 1 })
  if (error) { toast('Error', 'error'); return }
  toast('Categoría agregada')
  e.target.reset()
  await loadCategories()
  renderCatList()
}

window.deleteCat = async (id) => {
  if (!confirm('¿Eliminar categoría? Los platillos quedarán sin categoría.')) return
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) { toast('Error', 'error'); return }
  toast('Categoría eliminada')
  await loadCategories()
  renderCatList()
}

// ─── Modifier Groups management ────────────────────────────────────
async function loadModGroups() {
  const { data } = await supabase
    .from('modifier_groups')
    .select('*, modifier_options(*)')
    .order('display_order')
  modGroups = (data || []).map(g => ({
    ...g,
    modifier_options: [...(g.modifier_options || [])].sort((a, b) => a.display_order - b.display_order)
  }))
}

function renderModGroupsList() {
  const el = document.getElementById('modGroupsList')
  if (!modGroups.length) {
    el.innerHTML = '<p class="text-muted text-sm">Sin grupos creados todavía.</p>'
    return
  }
  el.innerHTML = modGroups.map(g => `
    <div class="card" style="padding:14px">
      <div class="flex justify-between items-center">
        <div>
          <strong>${g.name}</strong>
          <span class="text-muted text-xs"> — ${g.selection_type === 'single' ? 'Selección única' : 'Selección múltiple'}${g.required ? ', obligatorio' : ''}${g.max_select ? `, máx ${g.max_select}` : ''}</span>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteModGroup('${g.id}')">✕</button>
      </div>
      <div class="flex-col gap-4 mt-8">
        ${g.modifier_options.map(o => `
          <div class="flex justify-between items-center text-sm">
            <span>${o.name}${o.is_default ? ' <span class="text-muted text-xs">(default)</span>' : ''}</span>
            <span class="flex items-center gap-8">
              <span class="text-muted">${+o.price_delta >= 0 ? '+' : ''}${(+o.price_delta).toFixed(2)}</span>
              <button class="btn btn-ghost btn-sm" onclick="deleteModOption('${o.id}')">✕</button>
            </span>
          </div>
        `).join('') || '<p class="text-muted text-xs">Sin opciones.</p>'}
      </div>
      <form class="flex gap-8 mt-8" onsubmit="return addModOption(event, '${g.id}')">
        <input type="text" class="form-control" placeholder="Opción (ej: Doble)" style="flex:1" required>
        <input type="number" class="form-control" placeholder="+/- $" step="0.01" style="width:90px" required>
        <button type="submit" class="btn btn-outline btn-sm">+ Opción</button>
      </form>
    </div>
  `).join('')
}

async function addModGroup(e) {
  e.preventDefault()
  const name     = document.getElementById('newModGroupName').value.trim()
  const type     = document.getElementById('newModGroupType').value
  const required = document.getElementById('newModGroupRequired').checked
  const max      = document.getElementById('newModGroupMax').value
  if (!name) return

  const { error } = await supabase.from('modifier_groups').insert({
    name,
    selection_type: type,
    required,
    max_select: type === 'multiple' && max ? parseInt(max) : null,
    display_order: modGroups.length
  })
  if (error) { toast('Error al crear grupo', 'error'); return }

  toast('Grupo creado')
  e.target.reset()
  document.getElementById('newModGroupMaxWrap').classList.add('hidden')
  await loadModGroups()
  renderModGroupsList()
}

window.addModOption = (e, groupId) => {
  e.preventDefault()
  const form   = e.target
  const name   = form.querySelector('input[type="text"]').value.trim()
  const delta  = parseFloat(form.querySelector('input[type="number"]').value) || 0
  if (!name) return

  supabase.from('modifier_options').insert({ group_id: groupId, name, price_delta: delta })
    .then(({ error }) => {
      if (error) { toast('Error al agregar opción', 'error'); return }
      toast('Opción agregada')
      loadModGroups().then(renderModGroupsList)
    })
  return false
}

window.deleteModGroup = async (id) => {
  if (!confirm('¿Eliminar este grupo y todas sus opciones? Se quitará de los platillos asignados.')) return
  const { error } = await supabase.from('modifier_groups').delete().eq('id', id)
  if (error) { toast('Error al eliminar', 'error'); return }
  toast('Grupo eliminado')
  await loadModGroups()
  renderModGroupsList()
}

window.deleteModOption = async (id) => {
  const { error } = await supabase.from('modifier_options').delete().eq('id', id)
  if (error) { toast('Error al eliminar', 'error'); return }
  await loadModGroups()
  renderModGroupsList()
}

init()
