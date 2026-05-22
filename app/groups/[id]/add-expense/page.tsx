'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Member, Category } from '@/lib/types'
import { CURRENCIES, fetchExchangeRate } from '@/lib/utils'

type SplitMode = 'equal' | 'custom' | 'percentage'

export default function AddExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [groupCurrency, setGroupCurrency] = useState('USD')

  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [categoryId, setCategoryId] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [splitMode, setSplitMode] = useState<SplitMode>('equal')
  const [splitValues, setSplitValues] = useState<Record<string, string>>({})
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [exchangeRate, setExchangeRate] = useState(1)
  const [loadingRate, setLoadingRate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: group } = await supabase
        .from('groups')
        .select('default_currency')
        .eq('id', id)
        .single()
      if (group) {
        setGroupCurrency(group.default_currency)
        setCurrency(group.default_currency)
      }
      const { data: m } = await supabase
        .from('members')
        .select('*')
        .eq('group_id', id)
        .order('created_at')
      const { data: c } = await supabase.from('categories').select('*').order('name')
      if (m) {
        setMembers(m)
        setSelectedMembers(m.map((x: Member) => x.id))
        setPaidBy(m[0]?.id ?? '')
        const vals: Record<string, string> = {}
        m.forEach((x: Member) => (vals[x.id] = ''))
        setSplitValues(vals)
      }
      if (c) setCategories(c)
    }
    load()
  }, [id])

  useEffect(() => {
    async function getRate() {
      if (currency === groupCurrency) { setExchangeRate(1); return }
      setLoadingRate(true)
      const rate = await fetchExchangeRate(currency, groupCurrency)
      setExchangeRate(rate)
      setLoadingRate(false)
    }
    getRate()
  }, [currency, groupCurrency])

  function toggleMember(id: string) {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function computedSplits(): Record<string, number> {
    const num = parseFloat(amount) || 0
    const result: Record<string, number> = {}

    if (splitMode === 'equal') {
      const each = selectedMembers.length > 0 ? num / selectedMembers.length : 0
      selectedMembers.forEach((id) => (result[id] = Math.round(each * 100) / 100))
    } else if (splitMode === 'percentage') {
      selectedMembers.forEach((id) => {
        const pct = parseFloat(splitValues[id] || '0') / 100
        result[id] = Math.round(num * pct * 100) / 100
      })
    } else {
      selectedMembers.forEach((id) => {
        result[id] = parseFloat(splitValues[id] || '0')
      })
    }
    return result
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const num = parseFloat(amount)
    if (!title.trim()) return setError('Title is required')
    if (isNaN(num) || num <= 0) return setError('Enter a valid amount')
    if (!paidBy) return setError('Select who paid')
    if (selectedMembers.length === 0) return setError('Select at least one member to split with')

    const splits = computedSplits()
    const total = Object.values(splits).reduce((a, b) => a + b, 0)
    if (Math.abs(total - num) > 0.02) return setError(`Split amounts (${total.toFixed(2)}) must equal the total (${num.toFixed(2)})`)

    setLoading(true)
    const { data: expense, error: expErr } = await supabase
      .from('expenses')
      .insert({
        group_id: id,
        title: title.trim(),
        amount: num,
        currency,
        exchange_rate: exchangeRate,
        category_id: categoryId || null,
        paid_by: paidBy,
        date,
        notes: notes.trim() || null,
      })
      .select()
      .single()

    if (expErr || !expense) {
      setError(expErr?.message ?? 'Failed to save expense')
      setLoading(false)
      return
    }

    const splitsPayload = Object.entries(splits).map(([member_id, splitAmount]) => ({
      expense_id: expense.id,
      member_id,
      amount: splitAmount,
    }))

    const { error: splitErr } = await supabase.from('expense_splits').insert(splitsPayload)
    if (splitErr) {
      setError(splitErr.message)
      setLoading(false)
      return
    }

    router.push(`/groups/${id}`)
  }

  const splits = computedSplits()
  const splitTotal = Object.values(splits).reduce((a, b) => a + b, 0)
  const num = parseFloat(amount) || 0

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Add Expense</h1>
      <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {error && <p className="text-red-600 text-sm bg-red-50 rounded p-3">{error}</p>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Dinner at Ramen Place"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
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
          <div className="bg-blue-50 text-blue-700 text-xs rounded-lg px-3 py-2">
            {loadingRate
              ? 'Fetching exchange rate…'
              : `Exchange rate: 1 ${currency} = ${exchangeRate.toFixed(4)} ${groupCurrency}`}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
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
            placeholder="Optional notes"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        {/* Split Section */}
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
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(m.id)}
                  onChange={() => toggleMember(m.id)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 flex-1">{m.name}</span>
                {splitMode === 'equal' ? (
                  <span className="text-sm text-gray-500 w-24 text-right">
                    {selectedMembers.includes(m.id) && num > 0
                      ? `${currency} ${(num / selectedMembers.length).toFixed(2)}`
                      : '—'}
                  </span>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!selectedMembers.includes(m.id)}
                      value={splitValues[m.id] ?? ''}
                      onChange={(e) =>
                        setSplitValues({ ...splitValues, [m.id]: e.target.value })
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

          {splitMode !== 'equal' && num > 0 && (
            <div className={`mt-2 text-xs text-right font-medium ${Math.abs(splitTotal - num) > 0.02 ? 'text-red-500' : 'text-green-600'}`}>
              Total split: {splitTotal.toFixed(2)} / {num.toFixed(2)} {currency}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save Expense'}
          </button>
        </div>
      </form>
    </div>
  )
}
