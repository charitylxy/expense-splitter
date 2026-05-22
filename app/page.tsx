"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Group } from '@/lib/types'
import Link from 'next/link'

export default function HomePage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadGroups() {
      const { data } = await supabase
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false })

      setGroups((data as Group[]) ?? [])
      setLoading(false)
    }

    loadGroups()
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Your Groups</h1>
        <Link
          href="/groups/new"
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          + New Group
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading groups...</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">🧳</div>
          <p className="text-lg font-medium">No groups yet</p>
          <p className="text-sm">Create a group for your next trip or event</p>
          <Link
            href="/groups/new"
            className="mt-4 inline-block bg-indigo-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-indigo-700 transition"
          >
            Create a Group
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <Link
              key={group.id}
              href={`/groups/${group.id}`}
              className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4 hover:border-indigo-300 transition"
            >
              <div>
                <p className="font-semibold text-gray-800">{group.name}</p>
                {group.description && (
                  <p className="text-sm text-gray-500">{group.description}</p>
                )}
              </div>
              <div className="text-sm text-gray-400 font-medium">
                {group.default_currency} →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
