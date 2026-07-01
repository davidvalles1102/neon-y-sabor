import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import NavBar from '../components/NavBar'
import OrderClient from './OrderClient'
import type { Category, OrderMenuItem, DeliveryZone } from '@/lib/types'

export const metadata: Metadata = { title: 'Ordenar' }
export const revalidate = 0

export default async function OrderPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: items }, { data: zones }] = await Promise.all([
    supabase.from('categories').select('*').eq('active', true).order('display_order'),
    supabase.from('menu_items').select('*, categories(name, icon)').eq('available', true),
    supabase.from('delivery_zones').select('*').eq('active', true).order('display_order'),
  ])

  return (
    <>
      <NavBar />

      <OrderClient
        categories={(categories ?? []) as Category[]}
        items={(items ?? []) as OrderMenuItem[]}
        zones={(zones ?? []) as DeliveryZone[]}
      />

      <footer className="cust-footer">
        <div className="footer-brand">CRUNCHIES</div>
        <div className="footer-details">
          <span>📍 Ave La Reyna, Entre PJE 7 Y 1de Mayo, San Salvador, El Salvador</span>
          <span>📞 +503 7311 8276</span>
          <span>🕐 Lun–Vie: 11:00 AM – 2:30 PM · 6:00 PM – 10:30 PM | Sáb–Dom: 11:00 AM – 10:30 PM</span>
        </div>
        <div className="footer-divider"></div>
        <p className="footer-copy">© 2026 Crunchies — Todos los derechos reservados</p>
      </footer>
    </>
  )
}
