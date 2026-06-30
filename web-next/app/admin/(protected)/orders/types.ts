import type { Selection } from '@/lib/modifiers'

export type TicketItem = {
  dbId: string
  id: string
  name: string
  price: number
  qty: number
  notes: string
  modifiers: Selection[]
  lineKey: string
}

export type CurrentOrder = {
  id: string
  table_id: string | null
  items: TicketItem[]
  subtotal: number
  tax: number
  total: number
}

export type ReceiptData = {
  receiptNo: string
  change: number
  cashIn: number
  items: TicketItem[]
  subtotal: number
  tax: number
  total: number
  chargeTotal: number
  redeemedPts: number
  redeemedValue: number
  earnedPts: number
  customerName: string | null
  method: string
  orderType: 'dine_in' | 'takeout' | 'delivery'
  tableNum: number | null
  custPhone: string | null
  date: Date
}
