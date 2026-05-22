"use client"

import { use, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { calculateBalances, formatAmount, isLikelyWakeUpError } from '@/lib/utils'
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
  const [expenseFiltersOpen, setExpenseFiltersOpen] = useState(false)
  const [expandedSplits, setExpandedSplits] = useState<Record<string, boolean>>({})
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [personModalCategories, setPersonModalCategories] = useState<string[]>([])
  const [personModalSortBy, setPersonModalSortBy] = useState<'date' | 'category'>('date')
  const [personModalSortOrder, setPersonModalSortOrder] = useState<'desc' | 'asc'>('desc')
  const [loadingMessage, setLoadingMessage] = useState('Loading group...')
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(`group:${id}:convert`)
    if (saved !== null) {
      setConvertExpenses(saved === 'true')
    }
  }, [id])

  useEffect(() => {
    let cancelled = false

    async function loadGroup() {
      setLoading(true)
      setLoadError('')

      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          setLoadingMessage('Waking up database... this can take up to a minute.')
          await new Promise((resolve) => setTimeout(resolve, 2500))
        } else {
          setLoadingMessage('Loading group...')
        }

        const { data: groupData, error: groupErr } = await supabase
          .from('groups')
          .select('*')
          .eq('id', id)
          .maybeSingle()

        if (cancelled) return

        if (groupErr) {
          if (isLikelyWakeUpError(groupErr) && attempt < 2) {
            continue
          }
          setLoadError(
            isLikelyWakeUpError(groupErr)
              ? 'Database is waking up. Please refresh in a few seconds.'
              : groupErr.message
          )
          setLoading(false)
          return
        }

        if (!groupData) {
          setGroup(null)
          setLoading(false)
          return
        }

        const { data: membersData, error: membersErr } = await supabase
          .from('members')
          .select('*')
          .eq('group_id', id)
          .order('created_at')

        const { data: expensesData, error: expensesErr } = await supabase
          .from('expenses')
          .select(`
            *,
            category:categories(id, name),
            payer:members!expenses_paid_by_fkey(id, name),
            splits:expense_splits(id, member_id, amount, member:members(id, name))
          `)
          .eq('group_id', id)
          .order('date', { ascending: false })

        const criticalErr = membersErr ?? expensesErr
        if (criticalErr) {
          if (isLikelyWakeUpError(criticalErr) && attempt < 2) {
            continue
          }
          setLoadError(
            isLikelyWakeUpError(criticalErr)
              ? 'Database is waking up. Please refresh in a few seconds.'
              : criticalErr.message
          )
          setLoading(false)
          return
        }

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
        return
      }
    }

    loadGroup()

    return () => {
      cancelled = true
    }
  }, [id])

  function handleConversionChange(enabled: boolean) {
    setConvertExpenses(enabled)
    localStorage.setItem(`group:${id}:convert`, String(enabled))
  }

  function toggleExpenseSplits(expenseId: string) {
    setExpandedSplits((prev) => ({
      ...prev,
      [expenseId]: !prev[expenseId],
    }))
  }

  if (loading) {
    return <div className="text-gray-500">{loadingMessage}</div>
  }

  if (loadError) {
    return (
      <div className="bg-white border border-amber-200 rounded-xl p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-amber-800">Database Waking Up</h1>
        <p className="text-sm text-amber-700 mt-1">{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 bg-amber-100 text-amber-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-200 transition"
        >
          Retry
        </button>
      </div>
    )
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
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <Link href="/" className="text-sm text-indigo-600 hover:underline">← Groups</Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">{group.name}</h1>
          {group.description && <p className="text-gray-500 text-sm">{group.description}</p>}
          <p className="text-xs text-gray-400 mt-1">Base currency: {group.default_currency}</p>

          <div className="mt-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Members</h2>
            <div className="flex flex-wrap gap-2">
              {allMembers.map((m) => (
                <span key={m.id} className="bg-indigo-50 text-indigo-700 text-sm px-3 py-1 rounded-full font-medium whitespace-nowrap">
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto md:justify-end">
          <Link
            href={`/groups/${group.id}/edit`}
            className="flex-1 sm:flex-none text-center bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition whitespace-nowrap"
          >
            Edit Group
          </Link>
          <Link
            href={`/groups/${group.id}/settle-up`}
            className="flex-1 sm:flex-none text-center bg-[#ff6a00] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#f1ad63] hover:text-[#1f2937] transition whitespace-nowrap"
          >
            Settle Up
          </Link>
          <Link
            href={`/groups/${group.id}/add-expense`}
            className="flex-1 sm:flex-none text-center bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition whitespace-nowrap"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          <button
            type="button"
            onClick={() => handleConversionChange(true)}
            className={`w-full text-sm px-3 py-1.5 rounded-full font-medium transition ${
              convertExpenses ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Auto Convert ({group.default_currency})
          </button>
          <button
            type="button"
            onClick={() => handleConversionChange(false)}
            className={`w-full text-sm px-3 py-1.5 rounded-full font-medium transition ${
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

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
              className="text-sm text-indigo-600 hover:underline font-medium whitespace-nowrap self-start"
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
            {Object.entries(spendSummary).map(([memberId, summary]) => {
              const convertedCategoryEntries = Object.entries(summary.categories)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
              const perCurrencyCategoryEntries = Object.entries(summary.categoriesByCurrency)

              const hasEntries = convertExpenses
                ? convertedCategoryEntries.length > 0
                : perCurrencyCategoryEntries.length > 0
              return (
                <button
                  key={summary.name}
                  type="button"
                  onClick={() => {
                    setSelectedPersonId(memberId)
                    setPersonModalCategories([])
                    setPersonModalSortBy('date')
                    setPersonModalSortOrder('desc')
                  }}
                  className="w-full text-left bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm hover:border-[#6794c1] hover:shadow-md transition cursor-pointer"
                >
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
                </button>
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Expenses ({visibleExpenses.length}/{allExpenses.length})
          </h2>
          <button
            type="button"
            onClick={() => setExpenseFiltersOpen((prev) => !prev)}
            className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium"
          >
            {expenseFiltersOpen ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>

        {expenseFiltersOpen && (
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
        )}

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
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full table-fixed">
                <colgroup>
                  <col className="w-[32%]" />
                  <col className="w-[14%]" />
                  <col className="w-[15%]" />
                  <col className="w-[18%]" />
                  <col className="w-[14%]" />
                  <col className="w-[7%]" />
                </colgroup>
                <thead className="bg-[#efe6df] border-b border-[#e5d9cd]">
                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="text-left px-4 py-2">Expense</th>
                    <th className="text-left px-4 py-2">Paid by</th>
                    <th className="text-left px-4 py-2">Category</th>
                    <th className="text-left px-4 py-2">Date</th>
                    <th className="text-right px-4 py-2">Amount</th>
                    <th className="text-right px-4 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleExpenses.map((expense) => (
                    <tr key={expense.id} className="border-b border-[#f0e8e1] last:border-b-0 align-top">
                      <td className="px-4 py-2.5">
                        <p className="text-sm font-semibold text-gray-800 leading-tight">{expense.title}</p>
                        {expense.notes && <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{expense.notes}</p>}
                        {(expense.splits?.length ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleExpenseSplits(expense.id)}
                            className="text-[11px] text-indigo-600 hover:underline mt-1"
                          >
                            {expandedSplits[expense.id]
                              ? `Hide splits`
                              : `View splits (${expense.splits?.length ?? 0})`}
                          </button>
                        )}
                        {expandedSplits[expense.id] && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(expense.splits ?? []).map((s) => (
                              <span key={s.id} className="text-[10px] bg-[#f3efeb] text-gray-600 rounded-full px-1.5 py-0.5">
                                {s.member?.name}: {formatAmount(s.amount, expense.currency)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-600">{expense.payer?.name ?? '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-600">{expense.category?.name ?? 'Other'}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">{expense.date}</td>
                      <td className="px-4 py-2.5 text-right">
                        <p className="font-bold text-gray-800 leading-tight">{formatAmount(expense.amount, expense.currency)}</p>
                        {expense.currency !== group.default_currency && (
                          <p className="text-[11px] text-gray-400 leading-tight">
                            ≈ {formatAmount(expense.amount * expense.exchange_rate, group.default_currency)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/groups/${group.id}/expenses/${expense.id}/edit`}
                          className="text-[11px] text-indigo-600 hover:underline"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden">
              {visibleExpenses.map((expense) => (
                <div key={expense.id} className="px-3 py-3 border-b border-[#f0e8e1] last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 break-words leading-tight">{expense.title}</p>
                      <p className="text-[11px] text-gray-500 mt-1 leading-tight">
                        {expense.date} · {expense.category?.name ?? 'Other'} · {expense.payer?.name ?? '-'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-800 leading-tight">{formatAmount(expense.amount, expense.currency)}</p>
                      <Link
                        href={`/groups/${group.id}/expenses/${expense.id}/edit`}
                        className="text-[11px] text-indigo-600 hover:underline mt-1 inline-block"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>

                  {(expense.splits?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleExpenseSplits(expense.id)}
                      className="text-[11px] text-indigo-600 hover:underline mt-1"
                    >
                      {expandedSplits[expense.id]
                        ? `Hide splits`
                        : `View splits (${expense.splits?.length ?? 0})`}
                    </button>
                  )}

                  {expandedSplits[expense.id] && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(expense.splits ?? []).map((s) => (
                        <span key={s.id} className="text-[10px] bg-[#f3efeb] text-gray-600 rounded-full px-1.5 py-0.5">
                          {s.member?.name}: {formatAmount(s.amount, expense.currency)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Person Expense Modal */}
      {selectedPersonId && (() => {
        const person = spendSummary[selectedPersonId]
        if (!person) return null

        // All expenses this person has a split in
        const personExpenses = allExpenses.filter((e) =>
          (e.splits ?? []).some((s) => s.member_id === selectedPersonId)
        )

        // All unique categories for this person
        const personCategories = Array.from(
          new Set(personExpenses.map((e) => e.category?.name ?? 'Other'))
        ).sort((a, b) => a.localeCompare(b))

        // Filtered expenses
        const filteredExpenses = personExpenses
          .filter((e) => {
            if (personModalCategories.length === 0) return true
            return personModalCategories.includes(e.category?.name ?? 'Other')
          })
          .sort((a, b) => {
            let cmp = 0
            if (personModalSortBy === 'date') {
              cmp = a.date.localeCompare(b.date)
            } else {
              cmp = (a.category?.name ?? 'Other').localeCompare(b.category?.name ?? 'Other')
            }
            return personModalSortOrder === 'asc' ? cmp : -cmp
          })

        // Total: sum of this person's split amounts for filtered expenses
        const filteredTotal = filteredExpenses.reduce((sum, e) => {
          const split = (e.splits ?? []).find((s) => s.member_id === selectedPersonId)
          if (!split) return sum
          return sum + split.amount * e.exchange_rate
        }, 0)

        const filteredTotalByCurrency: Record<string, number> = {}
        for (const e of filteredExpenses) {
          const split = (e.splits ?? []).find((s) => s.member_id === selectedPersonId)
          if (!split) continue
          filteredTotalByCurrency[e.currency] = (filteredTotalByCurrency[e.currency] ?? 0) + split.amount
        }

        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4"
            onClick={() => setSelectedPersonId(null)}
          >
            <div
              className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Expenses for</p>
                  <h3 className="text-lg font-bold text-[#0b3d6e]">{person.name}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPersonId(null)}
                  className="text-gray-400 hover:text-gray-600 transition text-xl leading-none px-1"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Filters */}
              <div className="px-5 py-3 border-b border-gray-100 space-y-3">
                {/* Category multi-select */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Filter by Category</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPersonModalCategories([])}
                      className={`text-xs px-3 py-1 rounded-full font-medium transition ${personModalCategories.length === 0 ? 'bg-[#0b3d6e] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      All
                    </button>
                    {personCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() =>
                          setPersonModalCategories((prev) =>
                            prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                          )
                        }
                        className={`text-xs px-3 py-1 rounded-full font-medium transition ${personModalCategories.includes(cat) ? 'bg-[#0b3d6e] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort controls */}
                <div className="flex gap-2 items-center flex-wrap">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sort:</p>
                  {(['date', 'category'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setPersonModalSortBy(opt)}
                      className={`text-xs px-3 py-1 rounded-full font-medium transition ${personModalSortBy === opt ? 'bg-[#3a4f64] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPersonModalSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                    className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium transition"
                  >
                    {personModalSortOrder === 'desc' ? '↓ Desc' : '↑ Asc'}
                  </button>
                </div>
              </div>

              {/* Expense list */}
              <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
                {filteredExpenses.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">No expenses match the selected filters.</p>
                ) : (
                  filteredExpenses.map((expense) => {
                    const split = (expense.splits ?? []).find((s) => s.member_id === selectedPersonId)
                    return (
                      <div key={expense.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-b-0">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 leading-tight">{expense.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {expense.date} · {expense.category?.name ?? 'Other'} · Paid by {expense.payer?.name ?? '-'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-gray-800">
                            {split ? formatAmount(split.amount, expense.currency) : '—'}
                          </p>
                          {split && expense.currency !== group.default_currency && (
                            <p className="text-[11px] text-gray-400">
                              ≈ {formatAmount(split.amount * expense.exchange_rate, group.default_currency)}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Total footer */}
              <div className="px-5 py-4 border-t border-gray-100 bg-[#f8f6f4] rounded-b-2xl">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-600">
                    Total ({filteredExpenses.length} expense{filteredExpenses.length !== 1 ? 's' : ''})
                  </p>
                  <p className="text-base font-bold text-[#0b3d6e]">
                    {convertExpenses
                      ? formatAmount(filteredTotal, group.default_currency)
                      : formatCurrencyBreakdown(filteredTotalByCurrency)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
