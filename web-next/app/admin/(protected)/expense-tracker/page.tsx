import type { Metadata } from 'next'
import ExpenseTrackerClient from './ExpenseTrackerClient'

export const metadata: Metadata = { title: 'Gastos' }

export default function ExpenseTrackerPage() {
  return <ExpenseTrackerClient />
}
