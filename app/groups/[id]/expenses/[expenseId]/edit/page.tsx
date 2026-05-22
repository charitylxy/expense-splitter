"use client"

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Category, Member } from '@/lib/types'
import { CURRENCIES, fetchExchangeRate } from '@/lib/utils'

type SplitMode = 'equal' | 'custom' | 'percentage'

type SplitRow = {
  id: string
  member_id: string
  amount: number
}

type ExpenseData = {
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
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export default function EditExpensePage({ params }: { params: Promise<{ id: string; expenseId: string }> }) {
  const { id, expenseId } = use(params)
  const router = useRouter()

  const [groupCurrency, setGroupCurrency] = useState('USD')
  const [members, setMembers] = useState<Member[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [splits, setSplits] = useState<SplitRow[]>([])

  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [categoryId, setCategoryId] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [splitMode, setSplitMode] = useState<SplitMode>('custom')
  const [splitValues, setSplitValues] = useState<Record<string, string>>({})
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [baseExchangeRate, setBaseExchangeRate] = useState(1)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: group } = await supabase
        .from('groups')
        .select('default_currency')
        .eq('id', id)
        .maybeSingle()

      if (group) {
        setGroupCurrency(group.default_currency)
      }

      const { data: membersData } = await supabase
        .from('members')
        .select('*')
        .eq('group_id', id)
        .order('created_at')

      const { data: categoryData } = await supabase
        .from('categories')
        .select('*')
        .order('name')

      const { data: expenseData } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', expenseId)
        .eq('group_id', id)
        .maybeSingle()

      const { data: splitData } = await supabase
        .from('expense_splits')
        .select('id, member_id, amount')
        .eq('expense_id', expenseId)
        .order('id')

      const memberRows = (membersData as Member[]) ?? []
      const splitRows = (splitData as SplitRow[]) ?? []

      if (memberRows.length > 0) {
        setMembers(memberRows)

        const selected =
          splitRows.length > 0
            ? splitRows.map((s) => s.member_id)
            : memberRows.map((m) => m.id)
        setSelectedMembers(selected)

        const values: Record<string, string> = {}
        memberRows.forEach((member) => {
          const row = splitRows.find((s) => s.member_id === member.id)
          values[member.id] = row ? String(row.amount) : ''
        })
        setSplitValues(values)
      }

      if (categoryData) setCategories(categoryData as Category[])
      setSplits(splitRows)

      if (!expenseData) {
        setLoading(false)
        return
      }

      const expense = expenseData as ExpenseData
      setTitle(expense.title)
      setAmount(String(expense.amount))
      setCurrency(expense.currency)
      setCategoryId(expense.category_id ?? '')
      setPaidBy(expense.paid_by)
      setDate(expense.date)
      setNotes(expense.notes ?? '')
      setBaseExchangeRate(expense.exchange_rate)

      if (memberRows.length > 0 && !expense.paid_by) {
        setPaidBy(memberRows[0].id)
      }

      setLoading(false)
    }

    load()
  }, [id, expenseId])

  function toggleMember(memberId: string) {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    )
  }

  function computedSplits(): Record<string, number> {
    const numAmount = parseFloat(amount) || 0
    const result: Record<string, number> = {}

    if (splitMode === 'equal') {
      const each = selectedMembers.length > 0 ? numAmount / selectedMembers.length : 0
      selectedMembers.forEach((id) => {
        result[id] = round2(each)
      })
    } else if (splitMode === 'percentage') {
      selectedMembers.forEach((id) => {
        const pct = parseFloat(splitValues[id] || '0') / 100
        result[id] = round2(numAmount * pct)
      })
    } else {
      selectedMembers.forEach((id) => {
        result[id] = parseFloat(splitValues[id] || '0')
      })
    }

    return result
  }

  async function persistSplits(nextSplits: Record<string, number>) {
    const selectedSet = new Set(selectedMembers)
    const toDeleteIds = splits
      .filter((row) => !selectedSet.has(row.member_id))
      .map((row) => row.id)

    if (toDeleteIds.length > 0) {
      const { error: deleteErr } = await supabase
        .from('expense_splits')
        .delete()
        .in('id', toDeleteIds)

      if (deleteErr) throw new Error(deleteErr.message)
    }

    const existingByMember = new Map(splits.map((row) => [row.member_id, row]))

    for (const memberId of selectedMembers) {
      const amountValue = nextSplits[memberId] ?? 0
      const existing = existingByMember.get(memberId)

      if (existing) {
        const { error: updateErr } = await supabase
          .from('expense_splits')
          .update({ amount: amountValue })
          .eq('id', existing.id)

        if (updateErr) throw new Error(updateErr.message)
      } else {
        const { error: insertErr } = await supabase
          .from('expense_splits')
          .insert({
            expense_id: expenseId,
            member_id: memberId,
            amount: amountValue,
          })

        if (insertErr) throw new Error(insertErr.message)
      }
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const numAmount = parseFloat(amount)
    if (!title.trim()) return setError('Title is required')
    if (isNaN(numAmount) || numAmount <= 0) return setError('Enter a valid amount')
    if (!paidBy) return setError('Select who paid')

    if (selectedMembers.length === 0) {
      return setError('Select at least one member to split with')
    }

    const nextSplits = computedSplits()
    const splitTotal = Object.values(nextSplits).reduce((sum, value) => sum + value, 0)
    if (Math.abs(splitTotal - numAmount) > 0.02) {
      return setError(`Split amounts (${splitTotal.toFixed(2)}) must equal the total (${numAmount.toFixed(2)})`)
    }

    setSaving(true)

    const exchangeRate =
      currency === groupCurrency
        ? 1
        : await fetchExchangeRate(currency, groupCurrency)

    const { error: updateErr } = await supabase
      .from('expenses')
      .update({
        title: title.trim(),
        amount: numAmount,
        currency,
        exchange_rate: exchangeRate,
        category_id: categoryId || null,
        paid_by: paidBy,
        date,
        notes: notes.trim() || null,
      })
      .eq('id', expenseId)
      .eq('group_id', id)

    if (updateErr) {
      setSaving(false)
      setError(updateErr.message)
      return
    }

    try {
      await persistSplits(nextSplits)
    } catch (splitErr) {
      setSaving(false)
      setError(splitErr instanceof Error ? splitErr.message : 'Failed to update splits')
      return
    }

    setSaving(false)
    router.push(`/groups/${id}`)
  }

  async function handleDelete() {
    const ok = window.confirm('Delete this expense? This cannot be undone.')
    if (!ok) return

    setSaving(true)
    const { error: deleteErr } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .eq('group_id', id)

    setSaving(false)

    if (deleteErr) {
      setError(deleteErr.message)
      return
    }

    router.push(`/groups/${id}`)
  }

  if (loading) {
    return <div className="text-gray-500">Loading expense...</div>
  }

  if (!title) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-800">Expense not found</h1>
        <Link href={`/groups/${id}`} className="mt-4 inline-block text-indigo-600 text-sm font-medium hover:underline">
          Back to group
        </Link>
      </div>
    )
  }

  const currentSplits = computedSplits()
  const currentSplitTotal = Object.values(currentSplits).reduce((sum, value) => sum + value, 0)
  const currentAmount = parseFloat(amount) || 0

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/groups/${id}`} className="text-sm text-indigo-600 hover:underline">← Back to Group</Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-1">Edit Expense</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-5 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {error && <p className="text-red-600 text-sm bg-red-50 rounded p-3">{error}</p>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </div>
        </div>

        {currency !== groupCurrency && (
          <p className="text-xs text-blue-700 bg-blue-50 rounded px-3 py-2">
            Exchange rate will be updated from {currency} to {groupCurrency} on save.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">— None —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Paid by *</label>
          <select
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Split</label>
            <div className="flex gap-1">
              {(['equal', 'custom', 'percentage'] as SplitMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSplitMode(mode)}
                  className={`text-xs px-3 py-1 rounded-full font-medium transition ${
                    splitMode === mode
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(member.id)}
                  onChange={() => toggleMember(member.id)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 flex-1">{member.name}</span>

                {splitMode === 'equal' ? (
                  <span className="text-sm text-gray-500 w-28 text-right">
                    {selectedMembers.includes(member.id) && currentAmount > 0
                      ? `${currency} ${(currentAmount / selectedMembers.length).toFixed(2)}`
                      : '—'}
                  </span>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!selectedMembers.includes(member.id)}
                      value={splitValues[member.id] ?? ''}
                      onChange={(e) =>
                        setSplitValues({
                          ...splitValues,
                          [member.id]: e.target.value,
                        })
                      }
                      placeholder="0"
                      className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right disabled:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <span className="text-xs text-gray-400">
                      {splitMode === 'percentage' ? '%' : currency}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {splitMode !== 'equal' && currentAmount > 0 && (
            <div className={`mt-2 text-xs text-right font-medium ${Math.abs(currentSplitTotal - currentAmount) > 0.02 ? 'text-red-500' : 'text-green-600'}`}>
              Total split: {currentSplitTotal.toFixed(2)} / {currentAmount.toFixed(2)} {currency}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
          Current exchange rate: {baseExchangeRate.toFixed(4)}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 transition disabled:opacity-50"
          >
            Delete Expense
          </button>
        </div>
      </form>
    </div>
  )
}
