'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ensureDefaultCategories } from '@/lib/categories'
import Link from 'next/link'
import AppLoading from '@/components/AppLoading'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)
  const [dashboardDate, setDashboardDate] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (!session || error) {
        router.push('/login')
        setIsLoading(false)
        return
      }

      // 현재 가계부에 누락된 기본 카테고리 자동 동기화
      const { data: memberRows } = await supabase
        .from('household_members')
        .select('household_id, joined_at')
        .eq('user_id', session.user.id)
        .order('joined_at', { ascending: false })

      const householdId = memberRows?.[0]?.household_id
      if (householdId) {
        await ensureDefaultCategories(supabase, householdId)
      }

      setIsLoading(false)
    }

    init()
  }, [router, supabase])

  useEffect(() => {
    const handleDateChange = (event: Event) => {
      const selectedDate = (event as CustomEvent<string>).detail
      if (/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
        setDashboardDate(selectedDate)
      }
    }

    window.addEventListener('budget-tracker:dashboard-date', handleDateChange)
    return () => {
      window.removeEventListener('budget-tracker:dashboard-date', handleDateChange)
    }
  }, [])

  if (isLoading) {
    return <AppLoading />
  }

  const isActive = (path: string) => pathname === path
  const addHref =
    pathname === '/dashboard' && dashboardDate
      ? `/transactions/new?date=${dashboardDate}`
      : '/transactions/new'

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <main className="flex-1 pb-20">
        {children}
      </main>

      {/* 하단 탭 네비게이션 */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white z-50">
        <div className="flex justify-around max-w-full">
          <NavLink href="/dashboard" label="달력" icon="📅" isActive={isActive('/dashboard')} />
          <NavLink href="/schedules" label="일정" icon="⭐" isActive={isActive('/schedules')} />
          <NavLink href={addHref} label="추가" icon="➕" isActive={isActive('/transactions/new')} />
          <NavLink href="/stats" label="통계" icon="📊" isActive={isActive('/stats')} />
          <NavLink href="/settings" label="설정" icon="⚙️" isActive={isActive('/settings')} />
        </div>
      </nav>
    </div>
  )
}

function NavLink({
  href,
  label,
  icon,
  isActive,
}: {
  href: string
  label: string
  icon: string
  isActive: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex-1 py-3 flex flex-col items-center justify-center text-xs font-medium transition ${
        isActive
          ? 'text-indigo-600 border-t-2 border-indigo-600'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      <span className="text-xl mb-1">{icon}</span>
      <span>{label}</span>
    </Link>
  )
}
