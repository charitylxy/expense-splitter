'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Member, Settlement } from '@/lib/types'
import { formatAmount } from '@/lib/utils'

type GroupData = {
  id: string
  name: string
  default_currency: string
}

export default function SettlementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [group, setGroup] = useState<GroupData | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: groupData } = await supabase
        .from('groups')
        .select('id, name, default_currency')
        .eq('id', id)
        .maybeSingle()

      if (!groupData) {
        setGroup(null)
        setLoading(false)
        return
      }

      const { data: memberData } = await supabase
        .from('members')
        .select('*')
        .eq('group_id', id)
        .order('created_at')

      const { data: settlementData, error: settlementErr } = await supabase
        .from('settlements')
        .select('*')
        .eq('group_id', id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (settlementErr) {
        const missingTable =
          settlementErr.code === '42P01' ||
          settlementErr.code === 'PGRST205' ||
          settlementErr.message.toLowerCase().includes('settlements')

        setError(
          missingTable
            ? 'Settlements table is missing. Run supabase/settlements_migration.sql in Supabase SQL Editor.'
            : settlementErr.message
        )
      }

      setGroup(groupData as GroupData)
      setMembers((memberData as Member[]) ?? [])
      setSettlements((settlementData as Settlement[]) ?? [])
      setLoading(false)
    }

    load()
  }, [id])

  async function handleDeleteSettlement(settlementId: string) {
    const ok = window.confirm('Delete this settlement entry?')
    if (!ok) return

    const { error: deleteErr } = await supabase
      .from('settlements')
      .delete()
      .eq('id', settlementId)
      .eq('group_id', id)

    if (deleteErr) {
      setError(deleteErr.message)
      return
    }

    setSettlements((prev) => prev.filter((s) => s.id !== settlementId))
  }

  if (loading) {
    return <div className="text-gray-500">Loading settlements...</div>
  }

  if (!group) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-800">Group not found</h1>
        <Link href="/" className="mt-4 inline-block text-indigo-600 text-sm font-medium hover:underline">
          Back to groups
        </Link>
      </div>
    )
  }

  const memberNameById = Object.fromEntries(members.map((m) => [m.id, m.name]))
  const totalSettled = settlements.reduce((sum, s) => sum + s.amount * s.exchange_rate, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/groups/${group.id}`} className="text-sm text-indigo-600 hover:underline">← Back to Group</Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">All Settlements</h1>
          <p className="text-sm text-gray-500">{group.name}</p>
        </div>
        <Link
          href={`/groups/${group.id}/settle-up`}
          className="bg-[#ff6a00] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#f1ad63] hover:text-[#1f2937] transition whitespace-nowrap"
        >
          + New Settlement
        </Link>
      </div>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 rounded p-3">{error}</p>
      )}

      {settlements.length === 0 ? (
        <div className="text-center py-10 text-gray-400 bg-white border border-gray-100 rounded-xl">
          <p>No settlements recorded yet.</p>
          <Link href={`/groups/${group.id}/settle-up`} className="text-indigo-600 text-sm mt-1 inline-block hover:underline">
            Record your first settlement →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {settlements.map((settlement) => (
            <div
              key={settlement.id}
              className="bg-white border border-gray-100 rounded-xl px-5 py-3 shadow-sm flex items-center justify-between"
            >
              <div>
                <p className="text-sm text-gray-700">
                  <span className="font-semibold text-red-500">{memberNameById[settlement.from_member] ?? settlement.from_member}</span>
                  {' paid '}
                  <span className="font-semibold text-green-600">{memberNameById[settlement.to_member] ?? settlement.to_member}</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {settlement.date}
                  {settlement.notes ? ` · ${settlement.notes}` : ''}
                </p>
              </div>
              <div className="text-right ml-4">
                <p className="text-sm font-bold text-gray-800">{formatAmount(settlement.amount, settlement.currency)}</p>
                {settlement.currency !== group.default_currency && (
                  <p className="text-xs text-gray-400">
                    ≈ {formatAmount(settlement.amount * settlement.exchange_rate, group.default_currency)}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => handleDeleteSettlement(settlement.id)}
                  className="text-xs text-red-600 hover:underline mt-1"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-sm font-semibold text-gray-600 text-right">
        Total Settled (in {group.default_currency}): {formatAmount(totalSettled, group.default_currency)}
      </p>
    </div>
  )
}
