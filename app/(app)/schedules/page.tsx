'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getImportantScheduleColor } from '@/lib/importantScheduleColors'
import {
  getScheduleCategory,
  RECURRENCE_LABELS,
  SCHEDULE_CATEGORIES,
} from '@/lib/scheduleCategories'
import EditScheduleModal from '@/components/EditScheduleModal'
import AppLoading from '@/components/AppLoading'

interface Schedule {
  id: string
  household_id?: string | null
  title: string
  memo: string | null
  date: string
  time: string | null
  category: string | null
  recurrence: string | null
  is_important: boolean | null
  important_color: string | null
  important_order: number | null
}

interface ScheduleWithDday extends Schedule {
  occurrenceDate: string
  dday: number
}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function diffDays(date: string) {
  const target = new Date(`${date}T00:00:00`)
  return Math.round((target.getTime() - startOfToday().getTime()) / 86400000)
}

function dateWithClampedDay(year: number, month: number, day: number) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, lastDay))
}

function getNextOccurrence(schedule: Schedule) {
  const recurrence = schedule.recurrence ?? 'none'
  const start = new Date(`${schedule.date}T00:00:00`)
  const today = startOfToday()

  if (recurrence === 'none') return schedule.date

  let candidate = new Date(start)
  if (recurrence === 'weekly') {
    while (candidate < today) {
      candidate.setDate(candidate.getDate() + 7)
    }
  } else if (recurrence === 'monthly') {
    const originalDay = start.getDate()
    candidate = dateWithClampedDay(today.getFullYear(), today.getMonth(), originalDay)
    if (candidate < today) {
      candidate = dateWithClampedDay(today.getFullYear(), today.getMonth() + 1, originalDay)
    }
    if (candidate < start) candidate = new Date(start)
  } else if (recurrence === 'yearly') {
    candidate = dateWithClampedDay(today.getFullYear(), start.getMonth(), start.getDate())
    if (candidate < today) {
      candidate = dateWithClampedDay(today.getFullYear() + 1, start.getMonth(), start.getDate())
    }
    if (candidate < start) candidate = new Date(start)
  }

  return toDateString(candidate)
}

function formatDday(dday: number) {
  if (dday === 0) return 'D-Day'
  if (dday > 0) return `D-${dday}`
  return `D+${Math.abs(dday)}`
}

export default function TransactionsPage() {
  const supabase = createClient()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showPast, setShowPast] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [refetchTick, setRefetchTick] = useState(0)
  const categoryScrollerRef = useRef<HTMLDivElement | null>(null)

  const fetchSchedules = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: memberRows } = await supabase
        .from('household_members')
        .select('household_id, joined_at')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: false })

      const householdId = memberRows?.[0]?.household_id
      if (!householdId) return

      const { data, error } = await supabase
        .from('schedules')
        .select('id, title, memo, date, time, category, recurrence, is_important, important_color, important_order, household_id')
        .eq('household_id', householdId)
        .order('date', { ascending: true })

      if (error) throw error
      setSchedules((data as Schedule[]) || [])
    } catch (error) {
      console.error('일정 조회 실패:', error)
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchSchedules()
    })
  }, [fetchSchedules, refetchTick])

  const schedulesWithDday = useMemo<ScheduleWithDday[]>(() => {
    return schedules
      .map(schedule => {
        const occurrenceDate = getNextOccurrence(schedule)
        return {
          ...schedule,
          occurrenceDate,
          dday: diffDays(occurrenceDate),
        }
      })
      .filter(schedule => categoryFilter === 'all' || schedule.category === categoryFilter)
      .filter(schedule => showPast || schedule.dday >= 0 || (schedule.recurrence ?? 'none') !== 'none')
      .sort((a, b) => {
        if (a.dday !== b.dday) return a.dday - b.dday
        const at = a.time ?? '99:99'
        const bt = b.time ?? '99:99'
        return at < bt ? -1 : at > bt ? 1 : 0
      })
  }, [schedules, categoryFilter, showPast])

  const importantSchedules = schedulesWithDday
    .filter(schedule => schedule.is_important)
    .sort((a, b) => {
      const ao = a.important_order ?? Number.MAX_SAFE_INTEGER
      const bo = b.important_order ?? Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      if (a.dday !== b.dday) return a.dday - b.dday
      return a.title.localeCompare(b.title)
    })
  const regularSchedules = schedulesWithDday.filter(schedule => !schedule.is_important)
  const nextSchedule = regularSchedules.find(schedule => schedule.dday >= 0)

  const scrollCategoryFilter = (direction: 'left' | 'right') => {
    categoryScrollerRef.current?.scrollBy({
      left: direction === 'left' ? -180 : 180,
      behavior: 'smooth',
    })
  }

  if (isLoading) {
    return <AppLoading />
  }

  return (
    <div className="p-4 max-w-md mx-auto pb-24">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">중요일정</h1>

      {importantSchedules.length > 0 && (
        <section className="mb-5">
          <div className="space-y-2">
            {importantSchedules.map(schedule => {
              const category = getScheduleCategory(schedule.category)
              const recurrence = schedule.recurrence ?? 'none'
              const color = getImportantScheduleColor(schedule.important_color)
              return (
                <button
                  key={schedule.id}
                  type="button"
                  onClick={() => setEditingSchedule(schedule)}
                  className="w-full text-left text-white rounded-lg px-4 py-3.5 shadow-sm"
                  style={{ background: color.background }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl flex-shrink-0">{category.icon}</span>
                      <span className="text-base font-semibold whitespace-nowrap">
                        {schedule.occurrenceDate.slice(5).replace('-', '/')}
                      </span>
                      <span className="text-lg font-bold truncate">{schedule.title}</span>
                    </div>
                    <span className="text-lg font-bold whitespace-nowrap">
                      {formatDday(schedule.dday)}
                    </span>
                    {recurrence !== 'none' && (
                      <span className="sr-only">{RECURRENCE_LABELS[recurrence]}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {nextSchedule && (
        <button
          type="button"
          onClick={() => setEditingSchedule(nextSchedule)}
          className="w-full text-left p-4 rounded-lg border border-indigo-100 bg-gradient-to-br from-slate-50 to-indigo-50 hover:from-indigo-50 hover:to-blue-50 transition mb-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg">{getScheduleCategory(nextSchedule.category).icon}</span>
                <span className="font-semibold text-gray-900 truncate">
                  {nextSchedule.title}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                  가장 가까운 일정
                </span>
                {(nextSchedule.recurrence ?? 'none') !== 'none' && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-white/70 text-gray-600">
                    {RECURRENCE_LABELS[nextSchedule.recurrence ?? 'none']}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {nextSchedule.occurrenceDate}
                {nextSchedule.time ? ` · ${nextSchedule.time}` : ''}
              </p>
            </div>
            <span
              className={`text-sm font-bold whitespace-nowrap ${
                nextSchedule.dday < 0
                  ? 'text-gray-400'
                  : nextSchedule.dday === 0
                  ? 'text-red-600'
                  : 'text-indigo-600'
              }`}
            >
              {formatDday(nextSchedule.dday)}
            </span>
          </div>
        </button>
      )}

      <div className="relative mb-4">
        <div
          ref={categoryScrollerRef}
          className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex gap-2 min-w-max pb-1 pr-8">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                categoryFilter === 'all'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-700 bg-white'
              }`}
            >
              전체
            </button>
            {SCHEDULE_CATEGORIES.map(category => (
              <button
                key={category.key}
                type="button"
                onClick={() => setCategoryFilter(category.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                  categoryFilter === category.key
                    ? 'border-indigo-500 bg-indigo-50 text-gray-900'
                    : 'border-gray-200 text-gray-700 bg-white'
                }`}
                style={
                  categoryFilter === category.key
                    ? { borderColor: category.color, backgroundColor: `${category.color}15` }
                    : undefined
                }
              >
                {category.icon} {category.label}
              </button>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute right-0 top-0 h-10 w-8 bg-gradient-to-l from-white to-transparent" />
        <div className="mt-1 hidden justify-center gap-2 sm:flex">
          <button
            type="button"
            onClick={() => scrollCategoryFilter('left')}
            aria-label="카테고리 왼쪽으로 이동"
            className="flex h-5 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-300"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollCategoryFilter('right')}
            aria-label="카테고리 오른쪽으로 이동"
            className="flex h-5 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-300"
          >
            ›
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {schedulesWithDday.length.toLocaleString()}개 일정
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showPast}
            onChange={(e) => setShowPast(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          지난 일정 보기
        </label>
      </div>

      {schedulesWithDday.length === 0 ? (
        <p className="text-gray-500 text-center py-10">표시할 일정이 없습니다</p>
      ) : regularSchedules.length === 0 ? (
        <p className="text-gray-500 text-center py-10">그 외 일정이 없습니다</p>
      ) : (
        <div className="space-y-3">
          {regularSchedules.map(schedule => {
            const category = getScheduleCategory(schedule.category)
            const recurrence = schedule.recurrence ?? 'none'
            return (
              <button
                key={schedule.id}
                type="button"
                onClick={() => setEditingSchedule(schedule)}
                className="w-full text-left p-4 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">{category.icon}</span>
                      <span className="font-semibold text-gray-900 truncate">
                        {schedule.title}
                      </span>
                      {recurrence !== 'none' && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                          {RECURRENCE_LABELS[recurrence]}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {schedule.occurrenceDate}
                      {schedule.time ? ` · ${schedule.time}` : ''}
                    </p>
                    {schedule.memo && (
                      <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap break-words">
                        {schedule.memo}
                      </p>
                    )}
                  </div>
                  <span
                    className={`text-sm font-bold whitespace-nowrap ${
                      schedule.dday < 0
                        ? 'text-gray-400'
                        : schedule.dday === 0
                        ? 'text-red-600'
                        : 'text-indigo-600'
                    }`}
                  >
                    {formatDday(schedule.dday)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {editingSchedule && (
        <EditScheduleModal
          schedule={editingSchedule}
          supabase={supabase}
          onClose={() => setEditingSchedule(null)}
          onSaved={() => {
            setEditingSchedule(null)
            setRefetchTick(t => t + 1)
          }}
          onChanged={() => setRefetchTick(t => t + 1)}
        />
      )}
    </div>
  )
}
