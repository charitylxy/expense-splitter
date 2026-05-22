'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CURRENCIES } from '@/lib/utils'
import { useAuth } from '@/app/providers'

export default function NewGroupPage() {
  const router = useRouter()
  const { session } = useAuth()
  const supabase = createClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [members, setMembers] = useState(['', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function addMember() {
    setMembers([...members, ''])
  }

  function removeMember(i: number) {
    setMembers(members.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!session?.user?.id) {
      setError('You must be logged in to create a group')
      return
    }

    const validMembers = members.map((m) => m.trim()).filter(Boolean)
    if (!name.trim()) return setError('Group name is required')
    if (validMembers.length < 2) return setError('Add at least 2 members')

    setLoading(true)
    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        default_currency: currency,
        created_by: session.user.id,
      })
      .select()
      .single()

    if (groupErr || !group) {
      setError(groupErr?.message ?? 'Failed to create group')
      setLoading(false)
      return
    }

    const { error: membersErr } = await supabase
      .from('members')
      .insert(validMembers.map((m) => ({ group_id: group.id, name: m })))

    if (membersErr) {
      setError(membersErr.message)
      setLoading(false)
      return
    }

    router.push(`/groups/${group.id}`)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">New Group</h1>
      <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {error && <p className="text-red-600 text-sm bg-red-50 rounded p-3">{error}</p>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Group Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Japan Trip 2025"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Base Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Members *</label>
          <div className="space-y-2">
            {members.map((member, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={member}
                  onChange={(e) => {
                    const updated = [...members]
                    updated[i] = e.target.value
                    setMembers(updated)
                  }}
                  placeholder={`Member ${i + 1}`}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                {members.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeMember(i)}
                    className="text-red-400 hover:text-red-600 px-2 text-lg"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addMember}
            className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            + Add Member
          </button>
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
            {loading ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </form>
    </div>
  )
}

