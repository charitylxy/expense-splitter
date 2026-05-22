"use client"

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Category, Member } from '@/lib/types'
import { CURRENCIES, fetchExchangeRate } from '@/lib/utils'

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

      if (membersData) setMembers(membersData as Member[])
      if (categoryData) setCategories(categoryData as Category[])
      if (splitData) setSplits(splitData as SplitRow[])

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

      setLoading(false)
    }

    load()
  }, [id, expenseId])

  async function updateSplitAmounts(newAmount: number) {
    if (splits.length === 0) return

    const oldTotal = splits.reduce((sum, s) => sum + s.amount, 0)
    let updates: { id: string; amount: number }[] = []

    if (oldTotal <= 0) {
      const even = round2(newAmount / splits.length)
      let acc = 0
      updates = splits.map((s, index) => {
        if (index < splits.length - 1) {
          acc += even
          return { id: s.id, amount: even }
        }
        return { id: s.id, amount: round2(newAmount - acc) }
      })
    } else {
      let acc = 0
      updates = splits.map((s, index) => {
        if (index < splits.length - 1) {
          const nextAmount = round2((s.amount / oldTotal) * newAmount)
          acc += nextAmount
          return { id: s.id, amount: nextAmount }
        }
        return { id: s.id, amount: round2(newAmount - acc) }
      })
    }

    await Promise.all(
      updates.map((u) =>
        supabase.from('expense_splits').update({ amount: u.amount }).eq('id', u.id)
      )
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const numAmount = parseFloat(amount)
    if (!title.trim()) return setError('Title is required')
    if (isNaN(numAmount) || numAmount <= 0) return setError('Enter a valid amount')
    if (!paidBy) return setError('Select who paid')

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

    await updateSplitAmounts(numAmount)

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

        <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
          Split rows will be kept and rebalanced proportionally if you change the amount.
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
