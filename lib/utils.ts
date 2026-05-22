import { ExpenseSplit, Member, Balance } from './types'

export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
]

export const DEFAULT_CATEGORIES = [
  'Food & Drinks',
  'Transport',
  'Accommodation',
  'Activities',
  'Shopping',
  'Utilities',
  'Other',
]

export function formatAmount(amount: number, currency: string): string {
  const curr = CURRENCIES.find((c) => c.code === currency)
  const sym = curr?.symbol ?? currency
  return `${sym}${amount.toFixed(2)}`
}

export function calculateBalances(
  expenses: {
    amount: number
    currency: string
    exchange_rate: number
    paid_by: string
    splits: ExpenseSplit[]
  }[],
  members: Member[],
  baseCurrency: string
): Balance[] {
  // net[memberId] = how much they are owed (positive) or owe (negative) in base currency
  const net: Record<string, number> = {}
  members.forEach((m) => (net[m.id] = 0))

  for (const expense of expenses) {
    const baseAmount = expense.amount * expense.exchange_rate
    net[expense.paid_by] = (net[expense.paid_by] ?? 0) + baseAmount
    for (const split of expense.splits) {
      const splitBase = split.amount * expense.exchange_rate
      net[split.member_id] = (net[split.member_id] ?? 0) - splitBase
    }
  }

  // Simplify debts using greedy algorithm
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0.005)
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount)

  const debtors = Object.entries(net)
    .filter(([, v]) => v < -0.005)
    .map(([id, amount]) => ({ id, amount: -amount }))
    .sort((a, b) => b.amount - a.amount)

  const balances: Balance[] = []
  let i = 0,
    j = 0

  while (i < creditors.length && j < debtors.length) {
    const credit = creditors[i]
    const debt = debtors[j]
    const settled = Math.min(credit.amount, debt.amount)

    const fromMember = members.find((m) => m.id === debt.id)
    const toMember = members.find((m) => m.id === credit.id)

    if (fromMember && toMember && settled > 0.005) {
      balances.push({
        from: debt.id,
        fromName: fromMember.name,
        to: credit.id,
        toName: toMember.name,
        amount: Math.round(settled * 100) / 100,
        currency: baseCurrency,
      })
    }

    credit.amount -= settled
    debt.amount -= settled
    if (credit.amount < 0.005) i++
    if (debt.amount < 0.005) j++
  }

  return balances
}

export async function fetchExchangeRate(
  from: string,
  to: string
): Promise<number> {
  if (from === to) return 1
  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/${from}`
    )
    const data = await res.json()
    return data.rates?.[to] ?? 1
  } catch {
    return 1
  }
}
