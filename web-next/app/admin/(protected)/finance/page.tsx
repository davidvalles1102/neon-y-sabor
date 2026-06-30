import type { Metadata } from 'next'
import FinanceClient from './FinanceClient'

export const metadata: Metadata = { title: 'Finanzas' }

export default function FinancePage() {
  return <FinanceClient />
}
