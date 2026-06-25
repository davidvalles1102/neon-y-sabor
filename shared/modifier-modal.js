import { supabase, fmt } from './supabase-client.js'

const groupsCache = {}   // menu_item_id → modifier_groups[]

export async function getItemModifierGroups(menuItemId) {
  if (groupsCache[menuItemId]) return groupsCache[menuItemId]

  const { data, error } = await supabase
    .from('menu_item_modifier_groups')
    .select('modifier_groups(id, name, selection_type, required, max_select, modifier_options(id, name, price_delta, is_default, display_order))')
    .eq('menu_item_id', menuItemId)

  if (error || !data) { groupsCache[menuItemId] = []; return [] }

  const groups = data
    .map(row => row.modifier_groups)
    .filter(Boolean)
    .map(g => ({
      ...g,
      modifier_options: [...(g.modifier_options || [])].sort((a, b) => a.display_order - b.display_order)
    }))

  groupsCache[menuItemId] = groups
  return groups
}

// Resuelve con un array de { option_name, price_delta } o null si el usuario cancela.
export function openModifierModal(item, groups) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div')
    backdrop.className = 'modal-backdrop'
    backdrop.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h3>${item.name}</h3>
          <button class="modal-close" data-mm-action="cancel">✕</button>
        </div>
        <div class="modal-body">
          ${groups.map(g => `
            <div class="mm-group" data-group="${g.id}" style="margin-bottom:18px">
              <div style="font-weight:600;margin-bottom:8px">
                ${g.name}${g.required ? ' <span class="text-danger">*</span>' : ''}
                ${g.selection_type === 'multiple' && g.max_select ? `<span class="text-muted text-xs"> (máx ${g.max_select})</span>` : ''}
              </div>
              <div class="flex-col gap-8">
                ${g.modifier_options.map((o, i) => {
                  const inputType = g.selection_type === 'single' ? 'radio' : 'checkbox'
                  const defaultChecked = g.selection_type === 'single'
                    ? (o.is_default || (i === 0 && !g.modifier_options.some(x => x.is_default)))
                    : o.is_default
                  const deltaLabel = +o.price_delta > 0 ? `+${fmt.currency(o.price_delta)}`
                                    : +o.price_delta < 0 ? fmt.currency(o.price_delta) : ''
                  return `
                    <label class="checkbox-label" style="justify-content:space-between;cursor:pointer">
                      <span style="display:flex;align-items:center;gap:8px">
                        <input type="${inputType}" name="mm-group-${g.id}" value="${o.id}"
                               data-name="${o.name}" data-delta="${o.price_delta}" ${defaultChecked ? 'checked' : ''}>
                        ${o.name}
                      </span>
                      <span class="text-muted text-sm">${deltaLabel}</span>
                    </label>`
                }).join('')}
              </div>
            </div>
          `).join('')}
          <div class="alert alert-error hidden" id="mmError">Selecciona las opciones requeridas.</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-mm-action="cancel">Cancelar</button>
          <button class="btn btn-primary" data-mm-action="confirm">Agregar</button>
        </div>
      </div>`
    document.body.appendChild(backdrop)

    const close = (result) => { backdrop.remove(); resolve(result) }

    backdrop.querySelectorAll('[data-mm-action="cancel"]').forEach(b => b.addEventListener('click', () => close(null)))
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null) })

    backdrop.querySelector('[data-mm-action="confirm"]').addEventListener('click', () => {
      const selections = []
      let missingRequired = false

      groups.forEach(g => {
        const checked = [...backdrop.querySelectorAll(`input[name="mm-group-${g.id}"]:checked`)]
        if (g.required && !checked.length) missingRequired = true
        checked.forEach(inp => selections.push({ option_name: inp.dataset.name, price_delta: parseFloat(inp.dataset.delta) }))
      })

      if (missingRequired) { backdrop.querySelector('#mmError').classList.remove('hidden'); return }
      close(selections)
    })
  })
}

export function modifiersExtraPrice(selections) {
  return (selections || []).reduce((s, m) => s + +m.price_delta, 0)
}

export function modifiersSummary(selections) {
  return (selections || []).map(m => m.option_name).join(', ')
}

export function buildLineKey(menuItemId, selections) {
  return menuItemId + '::' + (selections || []).map(m => m.option_name).sort().join(',')
}
