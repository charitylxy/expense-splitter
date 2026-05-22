'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Group } from '@/lib/types'
import Link from 'next/link'
import { isLikelyWakeUpError } from '@/lib/utils'
import { useAuth } from '@/app/providers'

export default function HomePage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('Loading groups...')
  const [loadError, setLoadError] = useState('')
  const { session, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (!authLoading && !session) {
      router.push('/auth/login')
      return
    }
  }, [session, authLoading, router])

  useEffect(() => {
    if (!session?.user?.id) return

    let cancelled = false

    async function loadGroups() {
      setLoading(true)
      setLoadError('')

      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          setLoadingMessage('Waking up database... this can take up to a minute.')
          await new Promise((resolve) => setTimeout(resolve, 2500))
        } else {
          setLoadingMessage('Loading groups...')
        }

        if (!session?.user?.id) return

        // Fetch groups owned by user OR groups user is a member of
        const { data, error } = await supabase
          .from('groups')
          .select('*')
          .or(`created_by.eq.${session.user.id},id.in.(select group_id from group_members where user_id = '${session.user.id}')`)
          .order('created_at', { ascending: false })

        if (cancelled) return

        if (!error) {
          setGroups((data as Group[]) ?? [])
          setLoading(false)
          return
        }

        if (!isLikelyWakeUpError(error) || attempt === 2) {
          setLoadError(
            isLikelyWakeUpError(error)
              ? 'Database is waking up. Please refresh in a few seconds.'
              : error.message
          )
          setLoading(false)
          return
        }
      }
    }

    loadGroups()

    return () => {
      cancelled = true
    }
  }, [session?.user?.id, supabase])

  if (authLoading || !session) {
    return <div className="text-center py-20 text-gray-400">Loading...</div>
  }

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
        <div className="text-center py-20 text-gray-400">{loadingMessage}</div>
      ) : loadError ? (
        <div className="text-center py-12 bg-white border border-gray-100 rounded-xl">
          <p className="text-sm text-amber-700 bg-amber-50 inline-block px-3 py-2 rounded-lg">{loadError}</p>
        </div>
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
