'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
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

interface WeddingChecklistItem {
  id: string
  household_id: string
  title: string
  category: string
  due_date: string | null
  estimated_amount: number | null
  memo: string | null
  completed: boolean
  created_at: string
}

type ChecklistFilter = 'all' | 'pending' | 'done'

const WEDDING_CHECKLIST_CATEGORIES = [
  '💒 웨딩홀',
  '📓 플래닝',
  '📸 스튜디오',
  '👗 드레스',
  '👔 예복',
  '💄 메이크업',
  '🌸 플라워디렉팅',
  '💇🏻‍♀️ 헤어변형',
  '🎞️ 본식스냅',
  '📹 본식DVD',
  '📱 아이폰스냅',
  '📮 포토부스',
  '⛰️ 제주스냅',
  '💌 청첩장',
  '🎼 식전영상',
  '기타',
]

const EMPTY_CHECKLIST_FORM = {
  title: '',
  category: '📓 플래닝',
  dueDate: '',
  estimatedAmount: '',
  memo: '',
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

function formatCurrency(amount: number) {
  return `${amount.toLocaleString()}원`
}

function getChecklistDday(dueDate: string | null) {
  if (!dueDate) return null
  return diffDays(dueDate)
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    return JSON.stringify(error, null, 2)
  }
  return String(error)
}

export default function TransactionsPage() {
  const supabase = createClient()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [householdId, setHouseholdId] = useState('')
  const [checklistItems, setChecklistItems] = useState<WeddingChecklistItem[]>([])
  const [checklistError, setChecklistError] = useState('')
  const [checklistFilter, setChecklistFilter] = useState<ChecklistFilter>('pending')
  const [editingChecklistItem, setEditingChecklistItem] = useState<WeddingChecklistItem | null>(null)
  const [isChecklistModalOpen, setIsChecklistModalOpen] = useState(false)
  const [checklistForm, setChecklistForm] = useState(EMPTY_CHECKLIST_FORM)
  const [isChecklistSaving, setIsChecklistSaving] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showPast, setShowPast] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [refetchTick, setRefetchTick] = useState(0)
  const categoryScrollerRef = useRef<HTMLDivElement | null>(null)

  const fetchChecklist = useCallback(
    async (hid: string) => {
      const { data, error } = await supabase
        .from('wedding_checklist_items')
        .select('id, household_id, title, category, due_date, estimated_amount, memo, completed, created_at')
        .eq('household_id', hid)
        .order('completed', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (error) throw error
      setChecklistError('')
      setChecklistItems((data as WeddingChecklistItem[]) || [])
    },
    [supabase]
  )

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
      setHouseholdId(householdId)

      const { data, error } = await supabase
        .from('schedules')
        .select('id, title, memo, date, time, category, recurrence, is_important, important_color, important_order, household_id')
        .eq('household_id', householdId)
        .order('date', { ascending: true })

      if (error) throw error
      setSchedules((data as Schedule[]) || [])
      try {
        await fetchChecklist(householdId)
      } catch (checklistError) {
        setChecklistError(formatUnknownError(checklistError))
        setChecklistItems([])
      }
    } catch (error) {
      console.error('일정 조회 실패:', formatUnknownError(error))
    } finally {
      setIsLoading(false)
    }
  }, [fetchChecklist, supabase])

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
  const completedChecklistCount = checklistItems.filter(item => item.completed).length
  const filteredChecklistItems = checklistItems
    .filter(item => {
      if (checklistFilter === 'pending') return !item.completed
      if (checklistFilter === 'done') return item.completed
      return true
    })
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      const ad = a.due_date ?? '9999-12-31'
      const bd = b.due_date ?? '9999-12-31'
      if (ad !== bd) return ad < bd ? -1 : 1
      return a.created_at < b.created_at ? -1 : 1
    })

  const scrollCategoryFilter = (direction: 'left' | 'right') => {
    categoryScrollerRef.current?.scrollBy({
      left: direction === 'left' ? -180 : 180,
      behavior: 'smooth',
    })
  }

  const openNewChecklistModal = () => {
    setEditingChecklistItem(null)
    setChecklistForm(EMPTY_CHECKLIST_FORM)
    setIsChecklistModalOpen(true)
  }

  const openEditChecklistModal = (item: WeddingChecklistItem) => {
    setEditingChecklistItem(item)
    setChecklistForm({
      title: item.title,
      category: item.category,
      dueDate: item.due_date ?? '',
      estimatedAmount: item.estimated_amount ? String(item.estimated_amount) : '',
      memo: item.memo ?? '',
    })
    setIsChecklistModalOpen(true)
  }

  const closeChecklistModal = () => {
    setIsChecklistModalOpen(false)
    setEditingChecklistItem(null)
    setChecklistForm(EMPTY_CHECKLIST_FORM)
  }

  const handleChecklistSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!householdId || !checklistForm.title.trim()) {
      alert('제목을 입력해주세요')
      return
    }
    const estimatedAmount = checklistForm.estimatedAmount
      ? Number(checklistForm.estimatedAmount)
      : null
    if (estimatedAmount !== null && !Number.isFinite(estimatedAmount)) {
      alert('예상 비용을 숫자로 입력해주세요')
      return
    }

    setIsChecklistSaving(true)
    const payload = {
      household_id: householdId,
      title: checklistForm.title.trim(),
      category: checklistForm.category,
      due_date: checklistForm.dueDate || null,
      estimated_amount:
        estimatedAmount !== null ? Math.max(0, Math.round(estimatedAmount)) : null,
      memo: checklistForm.memo.trim() || null,
    }

    const { error } = editingChecklistItem
      ? await supabase
          .from('wedding_checklist_items')
          .update(payload)
          .eq('id', editingChecklistItem.id)
      : await supabase
          .from('wedding_checklist_items')
          .insert({ ...payload, completed: false })

    setIsChecklistSaving(false)
    if (error) {
      alert('체크리스트 저장 실패: ' + error.message)
      return
    }

    closeChecklistModal()
    await fetchChecklist(householdId)
  }

  const handleToggleChecklist = async (item: WeddingChecklistItem) => {
    const { error } = await supabase
      .from('wedding_checklist_items')
      .update({ completed: !item.completed })
      .eq('id', item.id)

    if (error) {
      alert('완료 상태 변경 실패: ' + error.message)
      return
    }

    await fetchChecklist(item.household_id)
  }

  const handleDeleteChecklist = async () => {
    if (!editingChecklistItem) return
    if (!window.confirm('이 준비 항목을 삭제할까요?')) return

    const { error } = await supabase
      .from('wedding_checklist_items')
      .delete()
      .eq('id', editingChecklistItem.id)

    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }

    closeChecklistModal()
    await fetchChecklist(editingChecklistItem.household_id)
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

      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">결혼준비 체크리스트</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {completedChecklistCount.toLocaleString()}/{checklistItems.length.toLocaleString()} 완료
            </p>
          </div>
          <button
            type="button"
            onClick={openNewChecklistModal}
            disabled={Boolean(checklistError)}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-gray-300 disabled:text-gray-500"
          >
            + 준비 항목
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {(['pending', 'all', 'done'] as const).map(filter => (
            <button
              key={filter}
              type="button"
              onClick={() => setChecklistFilter(filter)}
              className={`py-2 rounded-lg border text-sm font-medium ${
                checklistFilter === filter
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              {filter === 'pending' ? '미완료' : filter === 'all' ? '전체' : '완료'}
            </button>
          ))}
        </div>

        {checklistError ? (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
            <p className="text-sm font-semibold text-indigo-900">
              체크리스트 DB 권한 확인이 필요합니다
            </p>
            <p className="text-xs text-indigo-700 mt-1">
              Supabase에서 wedding_checklist_items 테이블 권한을 열면 사용할 수 있어요
            </p>
          </div>
        ) : checklistItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
            <p className="text-sm font-medium text-gray-700">아직 준비 항목이 없습니다</p>
            <p className="text-xs text-gray-500 mt-1">
              스드메, 예식장, 청첩장 같은 할 일을 추가해보세요
            </p>
          </div>
        ) : filteredChecklistItems.length === 0 ? (
          <p className="text-gray-500 text-center py-6">표시할 준비 항목이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {filteredChecklistItems.map(item => {
              const dday = getChecklistDday(item.due_date)
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border p-3 transition ${
                    item.completed
                      ? 'border-gray-100 bg-gray-50 opacity-75'
                      : 'border-gray-200 bg-white shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => void handleToggleChecklist(item)}
                      aria-label={item.completed ? '미완료로 변경' : '완료로 변경'}
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                        item.completed
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {item.completed ? '✓' : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditChecklistModal(item)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className={`font-semibold truncate ${
                              item.completed ? 'text-gray-500 line-through' : 'text-gray-900'
                            }`}
                          >
                            {item.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {item.category}
                            {item.due_date ? ` · ${item.due_date}` : ' · 마감일 없음'}
                            {item.estimated_amount
                              ? ` · ${formatCurrency(item.estimated_amount)}`
                              : ''}
                          </p>
                          {item.memo && (
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2 whitespace-pre-wrap break-words">
                              {item.memo}
                            </p>
                          )}
                        </div>
                        {dday !== null && (
                          <span
                            className={`text-sm font-bold whitespace-nowrap ${
                              item.completed
                                ? 'text-gray-400'
                                : dday < 0
                                ? 'text-red-600'
                                : dday === 0
                                ? 'text-red-600'
                                : 'text-indigo-600'
                            }`}
                          >
                            {formatDday(dday)}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

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

      {isChecklistModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleChecklistSubmit}
            className="w-full max-w-md bg-white rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingChecklistItem ? '준비 항목 수정' : '준비 항목 추가'}
              </h2>
              <button
                type="button"
                onClick={closeChecklistModal}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">제목</label>
              <input
                type="text"
                value={checklistForm.title}
                onChange={(e) =>
                  setChecklistForm(form => ({ ...form, title: e.target.value }))
                }
                placeholder="예: 스튜디오 촬영 예약"
                maxLength={80}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">카테고리</label>
              <div className="grid grid-cols-2 gap-2">
                {WEDDING_CHECKLIST_CATEGORIES.map(category => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setChecklistForm(form => ({ ...form, category }))}
                    className={`min-w-0 py-2 px-2 rounded-lg border text-sm font-medium transition ${
                      checklistForm.category === category
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="block truncate">{category}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  마감일
                </label>
                <input
                  type="date"
                  value={checklistForm.dueDate}
                  onChange={(e) =>
                    setChecklistForm(form => ({ ...form, dueDate: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  예상 비용
                </label>
                <input
                  type="number"
                  value={checklistForm.estimatedAmount}
                  onChange={(e) =>
                    setChecklistForm(form => ({ ...form, estimatedAmount: e.target.value }))
                  }
                  placeholder="0"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">메모</label>
              <textarea
                value={checklistForm.memo}
                onChange={(e) =>
                  setChecklistForm(form => ({ ...form, memo: e.target.value }))
                }
                rows={3}
                maxLength={500}
                placeholder="선택사항"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              {editingChecklistItem && (
                <button
                  type="button"
                  onClick={() => void handleDeleteChecklist()}
                  className="px-4 py-3 rounded-lg font-medium text-red-600 border border-red-300 hover:bg-red-50"
                >
                  삭제
                </button>
              )}
              <button
                type="submit"
                disabled={isChecklistSaving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition"
              >
                {isChecklistSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
