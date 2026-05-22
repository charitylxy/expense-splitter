export interface Group {
  id: string
  name: string
  description: string | null
  default_currency: string
  created_by: string | null
  created_at: string
}

export interface GroupMember {
  id: string
  group_id: string
  user_id: string
  role: 'owner' | 'member'
  created_at: string
}

export interface Member {
  id: string
  group_id: string
  name: string
  created_at: string
}

export interface Category {
  id: string
  name: string
}

export interface Expense {
  id: string
  group_id: string
  title: string
  amount: number
  currency: string
  exchange_rate: number
  category_id: string | null
  paid_by: string
  date: string
  notes: string | null
  created_at: string
  category?: Category
  payer?: Member
  splits?: ExpenseSplit[]
}

export interface ExpenseSplit {
  id: string
  expense_id: string
  member_id: string
  amount: number
  member?: Member
}

export interface Settlement {
  id: string
  group_id: string
  from_member: string
  to_member: string
  amount: number
  currency: string
  exchange_rate: number
  date: string
  notes: string | null
  created_at: string
}

export interface Balance {
  from: string
  fromName: string
  to: string
  toName: string
  amount: number
  currency: string
}

export interface CategorySummary {
  category: string
  member: string
  total: number
}
