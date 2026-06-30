import type { Metadata } from 'next'
import OrdersClient from './OrdersClient'

export const metadata: Metadata = { title: 'Órdenes' }

export default function OrdersPage() {
  return <OrdersClient />
}
