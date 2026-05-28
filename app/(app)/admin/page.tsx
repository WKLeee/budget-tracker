'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Stats {
  db_size_bytes: number
  user_count: number
  household_count: number
  member_count: number
  transaction_count: number
  transaction_count_this_month: number
  schedule_count: number
  recurring_count: number
  push_count: number
  recent_users: { email: string; created_at: string }[]
  recent_active_users?: { email: string; last_sign_in_at: string }[]
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function fmtDateTime(value: string) {
  return new Date(value).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const SUPABASE_FREE_DB_LIMIT = 500 * 1024 * 1024 // 500MB
const VERCEL_HOBBY_BANDWIDTH = 100 * 1024 * 1024 * 1024 // 100GB / month

export default function AdminPage() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/stats')
        if (res.status === 401) {
          router.push('/login')
          return
        }
        if (res.status === 403) {
          router.push('/dashboard')
          return
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error || `요청 실패 (${res.status})`)
          return
        }
        const data = await res.json()
        setStats(data)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [router])

  if (loading) {
    return <div className="p-4">로딩 중...</div>
  }
  if (error) {
    return <div className="p-4 text-red-600">에러: {error}</div>
  }
  if (!stats) return null

  const dbPct = (stats.db_size_bytes / SUPABASE_FREE_DB_LIMIT) * 100
  const recentActiveUsers = stats.recent_active_users ?? []

  return (
    <div className="p-4 max-w-md mx-auto pb-24">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">🛠️ 관리자</h1>

      {/* DB 용량 (Supabase 무료 500MB 기준) */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
        <p className="text-sm text-gray-600 mb-2">Supabase DB 용량</p>
        <p className="text-2xl font-bold text-gray-900">{fmtBytes(stats.db_size_bytes)}</p>
        <div className="w-full bg-gray-100 h-2 rounded-full mt-3 overflow-hidden">
          <div
            className={`h-2 rounded-full ${
              dbPct > 90 ? 'bg-red-500' : dbPct > 70 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(dbPct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {dbPct.toFixed(1)}% / 무료 한도 500MB
        </p>
      </div>

      {/* 카운트 그리드 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="사용자" value={stats.user_count} />
        <StatCard label="가계부" value={stats.household_count} />
        <StatCard label="멤버" value={stats.member_count} />
        <StatCard label="푸시 구독" value={stats.push_count} />
        <StatCard label="거래 (전체)" value={stats.transaction_count} />
        <StatCard label="거래 (이번 달)" value={stats.transaction_count_this_month} />
        <StatCard label="일정" value={stats.schedule_count} />
        <StatCard label="고정 거래" value={stats.recurring_count} />
      </div>

      {/* 최근 가입자 */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
        <h2 className="font-bold text-gray-900 mb-3">최근 가입 (최신 10명)</h2>
        {stats.recent_users.length === 0 ? (
          <p className="text-sm text-gray-500">데이터 없음</p>
        ) : (
          <div className="space-y-2">
            {stats.recent_users.map(u => (
              <div key={u.email + u.created_at} className="flex justify-between text-sm">
                <span className="text-gray-900 truncate">{u.email}</span>
                <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                  {fmtDateTime(u.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 최근 활동 계정 */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
        <h2 className="font-bold text-gray-900 mb-3">최근 활동 계정 (최신 10명)</h2>
        {recentActiveUsers.length === 0 ? (
          <p className="text-sm text-gray-500">데이터 없음</p>
        ) : (
          <div className="space-y-2">
            {recentActiveUsers.map(u => (
              <div key={u.email + u.last_sign_in_at} className="flex justify-between text-sm">
                <span className="text-gray-900 truncate">{u.email}</span>
                <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                  {fmtDateTime(u.last_sign_in_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 외부 대시보드 링크 */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h2 className="font-bold text-gray-900 mb-3">상세 대시보드</h2>
        <div className="space-y-2 text-sm">
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-indigo-600 hover:underline"
          >
            ↗ Supabase (DB, Auth, API 사용량)
          </a>
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-indigo-600 hover:underline"
          >
            ↗ Vercel (함수 호출, 대역폭, 빌드)
          </a>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Vercel Hobby: 대역폭 {fmtBytes(VERCEL_HOBBY_BANDWIDTH)}/월, 함수 100,000 호출/일
        </p>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white p-3 rounded-lg border border-gray-200">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value.toLocaleString()}</p>
    </div>
  )
}
