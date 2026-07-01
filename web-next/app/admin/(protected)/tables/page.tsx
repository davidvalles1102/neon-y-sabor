import type { Metadata } from 'next'
import TablesClient from './TablesClient'

export const metadata: Metadata = { title: 'Mesas & QR' }

export default function TablesPage() {
  return <TablesClient />
}
