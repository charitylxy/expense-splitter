'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Member } from '@/lib/types'
import { CURRENCIES, fetchExchangeRate } from '@/lib/utils'

export default function SettleUpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [members, setMembers] = useState<Member[]>([])
  const [groupCurrency, setGroupCurrency] = useState('USD')

  const [fromMember, setFromMember] = useState('')
  const [toMember, setToMember] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')

  const [exchangeRate, setExchangeRate] = useState(1)
  const [loadingRate, setLoadingRate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [featureReady, setFeatureReady] = useState(true)
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
        setCurrency(group.default_currency)
      }

      const { data: membersData } = await supabase
        .from('members')
        .select('*')
        .eq('group_id', id)
        .order('created_at')

      const memberRows = (membersData as Member[]) ?? []
      setMembers(memberRows)

      if (memberRows.length > 0) {
        setFromMember(memberRows[0].id)
        const second = memberRows.find((m) => m.id !== memberRows[0].id)
        setToMember(second?.id ?? memberRows[0].id)
      }

      const { error: settlementsErr } = await supabase
        .from('settlements')
        .select('id')
        .eq('group_id', id)
        .limit(1)

      if (settlementsErr) {
        const missingTable =
          settlementsErr.code === '42P01' ||
          settlementsErr.code === 'PGRST205' ||
          settlementsErr.message.toLowerCase().includes('settlements')

        setFeatureReady(false)
        setError(
          missingTable
            ? 'Settlements table is missing. Run supabase/settlements_migration.sql in Supabase SQL Editor.'
            : settlementsErr.message
        )
      } else {
        setFeatureReady(true)
      }

      setLoading(false)
    }

    load()
  }, [id])

  useEffect(() => {
    async function getRate() {
      if (currency === groupCurrency) {
        setExchangeRate(1)
        return
      }
      setLoadingRate(true)
      const rate = await fetchExchangeRate(currency, groupCurrency)
      setExchangeRate(rate)
      setLoadingRate(false)
    }

    getRate()
  }, [currency, groupCurrency])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!featureReady) return

    if (!fromMember || !toMember) return setError('Select both members.')
    if (fromMember === toMember) return setError('Paid by and received by must be different members.')

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) return setError('Enter a valid amount.')

    setSaving(true)
    const rate = currency === groupCurrency ? 1 : exchangeRate

    const { error: insertErr } = await supabase
      .from('settlements')
      .insert({
        group_id: id,
        from_member: fromMember,
        to_member: toMember,
        amount: numAmount,
        currency,
        exchange_rate: rate,
        date,
        notes: notes.trim() || null,
      })

    setSaving(false)

    if (insertErr) {
      setError(insertErr.message)
      return
    }

    router.push(`/groups/${id}`)
  }

  if (loading) {
    return <div className="text-gray-500">Loading settle up...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/groups/${id}`} className="text-sm text-indigo-600 hover:underline">← Back to Group</Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-1">Settle Up</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
        {error && <p className="text-red-600 text-sm bg-red-50 rounded p-3">{error}</p>}

        {!featureReady && (
          <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">
            Settlements are currently unavailable for this project.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paid By *</label>
            <select
              value={fromMember}
              onChange={(e) => setFromMember(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Received By *</label>
            <select
              value={toMember}
              onChange={(e) => setToMember(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>

        {currency !== groupCurrency && (
          <div className="bg-blue-50 text-blue-700 text-xs rounded-lg px-3 py-2">
            {loadingRate
              ? 'Fetching exchange rate…'
              : `Exchange rate: 1 ${currency} = ${exchangeRate.toFixed(4)} ${groupCurrency}`}
          </div>
        )}

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

        <button
          type="submit"
          disabled={saving || !featureReady}
          className="w-full bg-[#ff6a00] text-white rounded-lg py-2 text-sm font-medium hover:bg-[#f1ad63] hover:text-[#1f2937] transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Record Settlement'}
        </button>
      </form>
    </div>
  )
}
