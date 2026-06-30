import type { Metadata } from 'next'
import PaymentsClient from './PaymentsClient'

export const metadata: Metadata = { title: 'Pagos' }

export default function PaymentsPage() {
  return <PaymentsClient />
}
