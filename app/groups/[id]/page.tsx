"use client"

import { use, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { calculateBalances, formatAmount } from '@/lib/utils'
import { Expense, Member, Settlement } from '@/lib/types'

type GroupData = {
  id: string
  name: string
  description: string | null
  default_currency: string
}

function formatCurrencyBreakdown(values: Record<string, number>) {
  const parts = Object.entries(values)
    .filter(([, amount]) => amount > 0.005)
    .map(([currency, amount]) => formatAmount(amount, currency))
  return parts.length > 0 ? parts.join(' • ') : '—'
}

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [group, setGroup] = useState<GroupData | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [settlementFeatureReady, setSettlementFeatureReady] = useState(true)
  const [settlementError, setSettlementError] = useState('')
  const [convertExpenses, setConvertExpenses] = useState(true)
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('all')
  const [expensePaidByFilter, setExpensePaidByFilter] = useState('all')
  const [expenseSortBy, setExpenseSortBy] = useState<'date' | 'category' | 'paid_by'>('date')
  const [expenseSortOrder, setExpenseSortOrder] = useState<'desc' | 'asc'>('desc')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(`group:${id}:convert`)
    if (saved !== null) {
      setConvertExpenses(saved === 'true')
    }
  }, [id])

  useEffect(() => {
    async function loadGroup() {
      const { data: groupData } = await supabase
        .from('groups')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (!groupData) {
        setGroup(null)
        setLoading(false)
        return
      }

      const { data: membersData } = await supabase
        .from('members')
        .select('*')
        .eq('group_id', id)
        .order('created_at')

      const { data: expensesData } = await supabase
        .from('expenses')
        .select(`
          *,
          category:categories(id, name),
          payer:members!expenses_paid_by_fkey(id, name),
          splits:expense_splits(id, member_id, amount, member:members(id, name))
        `)
        .eq('group_id', id)
        .order('date', { ascending: false })

      const { data: settlementsData, error: settlementsErr } = await supabase
        .from('settlements')
        .select('*')
        .eq('group_id', id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (settlementsErr) {
        const missingTable =
          settlementsErr.code === '42P01' ||
          settlementsErr.code === 'PGRST205' ||
          settlementsErr.message.toLowerCase().includes('settlements')

        if (missingTable) {
          setSettlementFeatureReady(false)
          setSettlementError('Settlements table is missing. Run supabase/settlements_migration.sql in Supabase SQL Editor.')
        } else {
          setSettlementFeatureReady(false)
          setSettlementError(settlementsErr.message)
        }
      } else {
        setSettlementFeatureReady(true)
        setSettlementError('')
        setSettlements((settlementsData as Settlement[]) ?? [])
      }

      setGroup(groupData as GroupData)
      setMembers((membersData as Member[]) ?? [])
      setExpenses((expensesData as Expense[]) ?? [])
      setLoading(false)
    }

    loadGroup()
  }, [id])

  function handleConversionChange(enabled: boolean) {
    setConvertExpenses(enabled)
    localStorage.setItem(`group:${id}:convert`, String(enabled))
  }

  if (loading) {
    return <div className="text-gray-500">Loading group...</div>
  }

  if (!group) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-800">Group not found</h1>
        <p className="text-sm text-gray-500 mt-1">
          This group may have been deleted, or your previous create request did not complete.
        </p>
        <Link href="/groups/new" className="mt-4 inline-block text-indigo-600 text-sm font-medium hover:underline">
          Create a new group
        </Link>
      </div>
    )
  }

  const allMembers: Member[] = members
  const allExpenses: Expense[] = expenses
  const memberNameById = Object.fromEntries(allMembers.map((m) => [m.id, m.name]))
  const availableExpenseCategories = Array.from(
    new Set(allExpenses.map((e) => e.category?.name ?? 'Other'))
  ).sort((a, b) => a.localeCompare(b))

  const visibleExpenses = [...allExpenses]
    .filter((expense) => {
      if (expenseCategoryFilter !== 'all') {
        const categoryName = expense.category?.name ?? 'Other'
        if (categoryName !== expenseCategoryFilter) return false
      }

      if (expensePaidByFilter !== 'all' && expense.paid_by !== expensePaidByFilter) {
        return false
      }

      return true
    })
    .sort((a, b) => {
      let compare = 0

      if (expenseSortBy === 'date') {
        compare = a.date.localeCompare(b.date)
      } else if (expenseSortBy === 'category') {
        const aCategory = a.category?.name ?? 'Other'
        const bCategory = b.category?.name ?? 'Other'
        compare = aCategory.localeCompare(bCategory)
      } else {
        const aPayer = memberNameById[a.paid_by] ?? ''
        const bPayer = memberNameById[b.paid_by] ?? ''
        compare = aPayer.localeCompare(bPayer)
      }

      return expenseSortOrder === 'asc' ? compare : -compare
    })

  const settlementTransactions = settlements.map((s) => ({
    amount: s.amount,
    currency: s.currency,
    exchange_rate: s.exchange_rate,
    // Settlement means from_member paid to_member.
    paid_by: s.from_member,
    splits: [{ member_id: s.to_member, amount: s.amount }],
  }))

  const balanceSections = convertExpenses
    ? [
        {
          currency: group.default_currency,
          balances: calculateBalances(
            [
              ...allExpenses.map((e) => ({
                amount: e.amount,
                currency: e.currency,
                exchange_rate: e.exchange_rate,
                paid_by: e.paid_by,
                splits: e.splits ?? [],
              })),
              ...settlementTransactions,
            ],
            allMembers,
            group.default_currency
          ),
        },
      ]
    : Array.from(new Set([...allExpenses.map((e) => e.currency), ...settlements.map((s) => s.currency)])).map((currency) => ({
        currency,
        balances: calculateBalances(
          [
            ...allExpenses
              .filter((e) => e.currency === currency)
              .map((e) => ({
                amount: e.amount,
                currency: e.currency,
                exchange_rate: 1,
                paid_by: e.paid_by,
                splits: e.splits ?? [],
              })),
            ...settlementTransactions
              .filter((s) => s.currency === currency)
              .map((s) => ({
                amount: s.amount,
                currency: s.currency,
                exchange_rate: 1,
                paid_by: s.paid_by,
                splits: s.splits,
              })),
          ],
          allMembers,
          currency
        ),
      }))

  const totalSpendConverted = allExpenses.reduce(
    (sum, e) => sum + e.amount * e.exchange_rate,
    0
  )

  const totalSpendByCurrency: Record<string, number> = {}
  for (const expense of allExpenses) {
    totalSpendByCurrency[expense.currency] =
      (totalSpendByCurrency[expense.currency] ?? 0) + expense.amount
  }

  const totalSettledByCurrency: Record<string, number> = {}
  for (const settlement of settlements) {
    totalSettledByCurrency[settlement.currency] =
      (totalSettledByCurrency[settlement.currency] ?? 0) + settlement.amount
  }

  const totalSettledConverted = settlements.reduce(
    (sum, s) => sum + s.amount * s.exchange_rate,
    0
  )

  const spendSummary: Record<
    string,
    {
      name: string
      total: number
      totalByCurrency: Record<string, number>
      categories: Record<string, number>
      categoriesByCurrency: Record<string, Record<string, number>>
    }
  > = {}

  for (const member of allMembers) {
    spendSummary[member.id] = {
      name: member.name,
      total: 0,
      totalByCurrency: {},
      categories: {},
      categoriesByCurrency: {},
    }
  }

  for (const expense of allExpenses) {
    const category = expense.category?.name ?? 'Other'
    const splitRows = expense.splits ?? []

    if (splitRows.length === 0) {
      continue
    }

    for (const split of splitRows) {
      const summary = spendSummary[split.member_id]
      if (!summary) continue

      summary.total += split.amount * expense.exchange_rate
      summary.totalByCurrency[expense.currency] =
        (summary.totalByCurrency[expense.currency] ?? 0) + split.amount

      summary.categories[category] =
        (summary.categories[category] ?? 0) + split.amount * expense.exchange_rate

      if (!summary.categoriesByCurrency[category]) {
        summary.categoriesByCurrency[category] = {}
      }
      summary.categoriesByCurrency[category][expense.currency] =
        (summary.categoriesByCurrency[category][expense.currency] ?? 0) + split.amount
    }
  }
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/" className="text-sm text-indigo-600 hover:underline">← Groups</Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">{group.name}</h1>
          {group.description && <p className="text-gray-500 text-sm">{group.description}</p>}
          <p className="text-xs text-gray-400 mt-1">Base currency: {group.default_currency}</p>

          <div className="mt-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Members</h2>
            <div className="flex flex-wrap gap-2">
              {allMembers.map((m) => (
                <span key={m.id} className="bg-indigo-50 text-indigo-700 text-sm px-3 py-1 rounded-full font-medium">
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/groups/${group.id}/edit`}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition whitespace-nowrap"
          >
            Edit Group
          </Link>
          <Link
            href={`/groups/${group.id}/settle-up`}
            className="bg-[#ff6a00] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#f1ad63] hover:text-[#1f2937] transition whitespace-nowrap"
          >
            Settle Up
          </Link>
          <Link
            href={`/groups/${group.id}/add-expense`}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition whitespace-nowrap"
          >
            + Add Expense
          </Link>
        </div>
      </div>

      {!settlementFeatureReady && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-4">
          <h2 className="text-sm font-semibold text-red-700 mb-1">Settlements unavailable</h2>
          <p className="text-xs text-red-600">{settlementError}</p>
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-700">Currency Display</p>
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => handleConversionChange(true)}
            className={`text-sm px-3 py-1.5 rounded-full font-medium transition ${
              convertExpenses ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Auto Convert ({group.default_currency})
          </button>
          <button
            type="button"
            onClick={() => handleConversionChange(false)}
            className={`text-sm px-3 py-1.5 rounded-full font-medium transition ${
              !convertExpenses ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Keep Original Currencies
          </button>
        </div>
      </div>

      {/* Balances */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Who Owes Who {convertExpenses ? `(${group.default_currency})` : '(Per Currency)'}
        </h2>
        {balanceSections.every((s) => s.balances.length === 0) ? (
          <p className="text-gray-400 text-sm">All settled up! 🎉</p>
        ) : (
          <div className="space-y-4">
            {balanceSections.map((section) => (
              <div key={section.currency} className="space-y-2">
                {!convertExpenses && (
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {section.currency}
                  </p>
                )}
                {section.balances.length === 0 ? (
                  <p className="text-xs text-gray-400">No balances in this currency.</p>
                ) : (
                  section.balances.map((b, i) => (
                    <div
                      key={`${section.currency}-${i}`}
                      className="bg-white border border-gray-100 rounded-xl px-5 py-3 shadow-sm flex items-center justify-between"
                    >
                      <span className="text-sm text-gray-700">
                        <span className="font-semibold text-red-500">{b.fromName}</span>
                        {' owes '}
                        <span className="font-semibold text-green-600">{b.toName}</span>
                      </span>
                      <span className="text-sm font-bold text-gray-800">
                        {formatAmount(b.amount, b.currency)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {settlementFeatureReady && (
        <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Settlements
          </h2>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-600">
                {settlements.length === 0
                  ? 'No settlements recorded yet.'
                  : `${settlements.length} settlement${settlements.length === 1 ? '' : 's'} recorded.`}
              </p>
              {settlements.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Latest: {settlements[0].date}
                  {memberNameById[settlements[0].from_member]
                    ? ` · ${memberNameById[settlements[0].from_member]} paid ${memberNameById[settlements[0].to_member] ?? settlements[0].to_member}`
                    : ''}
                </p>
              )}
            </div>
            <Link
              href={`/groups/${group.id}/settlements`}
              className="text-sm text-indigo-600 hover:underline font-medium whitespace-nowrap"
            >
              View all settlements →
            </Link>
          </div>

          <p className="text-sm font-semibold text-gray-600 mt-3">
            Total Settled:{' '}
            {convertExpenses
              ? formatAmount(totalSettledConverted, group.default_currency)
              : formatCurrencyBreakdown(totalSettledByCurrency)}
          </p>
        </div>
      )}

      {/* Spend Summary */}
      {Object.keys(spendSummary).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Spent by Person {convertExpenses ? `(${group.default_currency})` : '(Per Currency)'}
          </h2>
          <div className="space-y-3">
            {Object.values(spendSummary).map((summary) => {
              const convertedCategoryEntries = Object.entries(summary.categories)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
              const perCurrencyCategoryEntries = Object.entries(summary.categoriesByCurrency)

              const hasEntries = convertExpenses
                ? convertedCategoryEntries.length > 0
                : perCurrencyCategoryEntries.length > 0
              return (
                <div key={summary.name} className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-800">{summary.name}</p>
                    <p className="text-sm font-bold text-gray-800">
                      {convertExpenses
                        ? formatAmount(summary.total, group.default_currency)
                        : formatCurrencyBreakdown(summary.totalByCurrency)}
                    </p>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {!hasEntries ? (
                      <span className="text-xs text-gray-400">No paid expenses yet.</span>
                    ) : convertExpenses ? (
                      convertedCategoryEntries.map(([cat, amount]) => (
                        <span key={cat} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                          {cat}: {formatAmount(amount, group.default_currency)}
                        </span>
                      ))
                    ) : (
                      perCurrencyCategoryEntries.map(([cat, values]) => (
                        <span key={cat} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                          {cat}: {formatCurrencyBreakdown(values)}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-sm font-semibold text-gray-600 mt-3 text-right">
            Total Spent:{' '}
            {convertExpenses
              ? formatAmount(totalSpendConverted, group.default_currency)
              : formatCurrencyBreakdown(totalSpendByCurrency)}
          </p>
        </div>
      )}

      {/* Expenses List */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Expenses ({visibleExpenses.length}/{allExpenses.length})
        </h2>

        <div className="bg-[#f3efeb] border border-[#e5d9cd] rounded-xl px-4 py-3 shadow-sm mb-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <select
              value={expenseCategoryFilter}
              onChange={(e) => setExpenseCategoryFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All categories</option>
              {availableExpenseCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Paid By</label>
            <select
              value={expensePaidByFilter}
              onChange={(e) => setExpensePaidByFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">Everyone</option>
              {allMembers.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sort By</label>
            <select
              value={expenseSortBy}
              onChange={(e) => setExpenseSortBy(e.target.value as 'date' | 'category' | 'paid_by')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="date">Date</option>
              <option value="category">Category</option>
              <option value="paid_by">Paid By</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Order</label>
            <select
              value={expenseSortOrder}
              onChange={(e) => setExpenseSortOrder(e.target.value as 'desc' | 'asc')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>

        {allExpenses.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p>No expenses yet.</p>
            <Link href={`/groups/${group.id}/add-expense`} className="text-indigo-600 text-sm mt-1 inline-block hover:underline">
              Add the first one →
            </Link>
          </div>
        ) : visibleExpenses.length === 0 ? (
          <div className="text-center py-8 text-gray-400 bg-white border border-gray-100 rounded-xl">
            <p>No expenses match the selected filters.</p>
          </div>
        ) : (
          <div className="bg-white border border-[#e5d9cd] rounded-2xl overflow-hidden shadow-sm">
            <div className="hidden md:grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] gap-3 px-5 py-3 bg-[#efe6df] border-b border-[#e5d9cd] text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <span>Expense</span>
              <span>Paid by</span>
              <span>Category</span>
              <span>Date</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Action</span>
            </div>

            {visibleExpenses.map((expense) => (
              <div
                key={expense.id}
                className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] gap-3 px-5 py-4 border-b border-[#f0e8e1] last:border-b-0"
              >
                <div>
                  <p className="font-semibold text-gray-800">{expense.title}</p>
                  {expense.notes && <p className="text-xs text-gray-400 mt-0.5">{expense.notes}</p>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(expense.splits ?? []).slice(0, 3).map((s) => (
                      <span key={s.id} className="text-[11px] bg-[#f3efeb] text-gray-600 rounded-full px-2 py-0.5">
                        {s.member?.name}: {formatAmount(s.amount, expense.currency)}
                      </span>
                    ))}
                  </div>
                </div>

                <p className="text-sm text-gray-600 self-center">{expense.payer?.name ?? '-'}</p>
                <p className="text-sm text-gray-600 self-center">{expense.category?.name ?? 'Other'}</p>
                <p className="text-sm text-gray-600 self-center">{expense.date}</p>

                <div className="text-left md:text-right self-center">
                  <p className="font-bold text-gray-800">{formatAmount(expense.amount, expense.currency)}</p>
                  {expense.currency !== group.default_currency && (
                    <p className="text-xs text-gray-400">
                      ≈ {formatAmount(expense.amount * expense.exchange_rate, group.default_currency)}
                    </p>
                  )}
                </div>

                <div className="text-left md:text-right self-center">
                  <Link
                    href={`/groups/${group.id}/expenses/${expense.id}/edit`}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
