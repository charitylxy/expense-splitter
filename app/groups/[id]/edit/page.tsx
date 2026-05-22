"use client"

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CURRENCIES } from '@/lib/utils'

type GroupData = {
  id: string
  name: string
  description: string | null
  default_currency: string
}

type EditableMember = {
  id?: string
  name: string
  isNew: boolean
}

type ExistingMember = {
  id: string
  name: string
}

export default function EditGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [group, setGroup] = useState<GroupData | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [members, setMembers] = useState<EditableMember[]>([])
  const [originalMembers, setOriginalMembers] = useState<ExistingMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('groups')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      const { data: memberData } = await supabase
        .from('members')
        .select('id, name')
        .eq('group_id', id)
        .order('created_at')

      if (!data) {
        setGroup(null)
        setLoading(false)
        return
      }

      const groupData = data as GroupData
      setGroup(groupData)
      setName(groupData.name)
      setDescription(groupData.description ?? '')
      setCurrency(groupData.default_currency)
      setMembers(
        (memberData ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          isNew: false,
        }))
      )
      setOriginalMembers((memberData ?? []) as ExistingMember[])
      setLoading(false)
    }

    load()
  }, [id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Group name is required')
      return
    }

    const normalizedMembers = members.map((m) => ({ ...m, name: m.name.trim() }))
    if (normalizedMembers.length === 0) {
      setError('Add at least one member')
      return
    }
    if (normalizedMembers.some((m) => !m.name)) {
      setError('Member names cannot be empty')
      return
    }

    setSaving(true)
    const { error: updateErr } = await supabase
      .from('groups')
      .update({
        name: name.trim(),
        description: description.trim() || null,
        default_currency: currency,
      })
      .eq('id', id)

    setSaving(false)

    if (updateErr) {
      setError(updateErr.message)
      return
    }

    const existingMembers = normalizedMembers.filter((m) => !m.isNew && m.id)
    const newMembers = normalizedMembers.filter((m) => m.isNew)
    const existingIdsAfterEdit = new Set(existingMembers.map((m) => m.id as string))
    const removedExistingMembers = originalMembers.filter(
      (m) => !existingIdsAfterEdit.has(m.id)
    )

    if (removedExistingMembers.length > 0) {
      const removedIds = removedExistingMembers.map((m) => m.id)

      const [{ data: splitRefs, error: splitRefErr }, { data: payerRefs, error: payerRefErr }] =
        await Promise.all([
          supabase
            .from('expense_splits')
            .select('member_id')
            .in('member_id', removedIds)
            .limit(1),
          supabase
            .from('expenses')
            .select('paid_by')
            .eq('group_id', id)
            .in('paid_by', removedIds)
            .limit(1),
        ])

      if (splitRefErr || payerRefErr) {
        setSaving(false)
        setError(splitRefErr?.message ?? payerRefErr?.message ?? 'Failed to validate member deletion safety')
        return
      }

      if ((splitRefs?.length ?? 0) > 0 || (payerRefs?.length ?? 0) > 0) {
        setSaving(false)
        setError(
          `Cannot remove member(s) with existing expense history: ${removedExistingMembers
            .map((m) => m.name)
            .join(', ')}`
        )
        return
      }

      const { error: deleteMembersErr } = await supabase
        .from('members')
        .delete()
        .in('id', removedIds)
        .eq('group_id', id)

      if (deleteMembersErr) {
        setSaving(false)
        setError(deleteMembersErr.message)
        return
      }
    }

    if (existingMembers.length > 0) {
      const updateResults = await Promise.all(
        existingMembers.map((member) =>
          supabase
            .from('members')
            .update({ name: member.name })
            .eq('id', member.id as string)
            .eq('group_id', id)
        )
      )

      const failedUpdate = updateResults.find((res) => res.error)
      if (failedUpdate?.error) {
        setSaving(false)
        setError(failedUpdate.error.message)
        return
      }
    }

    if (newMembers.length > 0) {
      const { error: insertErr } = await supabase
        .from('members')
        .insert(newMembers.map((member) => ({ group_id: id, name: member.name })))

      if (insertErr) {
        setSaving(false)
        setError(insertErr.message)
        return
      }
    }

    setSaving(false)

    router.push(`/groups/${id}`)
  }

  function handleMemberNameChange(index: number, value: string) {
    setMembers((prev) =>
      prev.map((member, i) => (i === index ? { ...member, name: value } : member))
    )
  }

  function handleAddMember() {
    setMembers((prev) => [...prev, { name: '', isNew: true }])
  }

  function handleRemoveMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleDelete() {
    const ok = window.confirm('Delete this group and all its expenses? This cannot be undone.')
    if (!ok) return

    setSaving(true)
    const { error: deleteErr } = await supabase
      .from('groups')
      .delete()
      .eq('id', id)

    setSaving(false)

    if (deleteErr) {
      setError(deleteErr.message)
      return
    }

    router.push('/')
  }

  if (loading) {
    return <div className="text-gray-500">Loading group...</div>
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

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/groups/${id}`} className="text-sm text-indigo-600 hover:underline">← Back to Group</Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-1">Edit Group</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-5 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {error && <p className="text-red-600 text-sm bg-red-50 rounded p-3">{error}</p>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Group Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
          <label className="block text-sm font-medium text-gray-700 mb-2">Members</label>
          <div className="space-y-2">
            {members.map((member, index) => (
              <div key={member.id ?? `new-${index}`} className="flex items-center gap-2">
                <input
                  type="text"
                  value={member.name}
                  onChange={(e) => handleMemberNameChange(index, e.target.value)}
                  placeholder={`Member ${index + 1}`}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveMember(index)}
                  disabled={members.length <= 1}
                  className="px-2 text-red-500 hover:text-red-700 disabled:text-gray-300 text-lg"
                  title={members.length <= 1 ? 'At least one member is required' : 'Remove member'}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddMember}
            className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            + Add Member
          </button>
        </div>

        <div className="flex gap-3 pt-2">
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
            Delete Group
          </button>
        </div>
      </form>
    </div>
  )
}
