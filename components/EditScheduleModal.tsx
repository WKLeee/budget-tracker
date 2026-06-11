'use client'

import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_IMPORTANT_SCHEDULE_COLOR,
  IMPORTANT_SCHEDULE_COLORS,
} from '@/lib/importantScheduleColors'
import { SCHEDULE_CATEGORIES } from '@/lib/scheduleCategories'

export interface EditableSchedule {
  id: string
  household_id?: string | null
  title: string
  memo: string | null
  date: string
  time: string | null
  category: string | null
  recurrence: string | null
  is_important?: boolean | null
  important_color?: string | null
  important_order?: number | null
}

type Recurrence = 'none' | 'weekly' | 'monthly' | 'yearly'

interface ImportantOrderRow {
  id: string
  important_order: number | null
  date: string
  time: string | null
  title: string
}

interface Props {
  schedule: EditableSchedule
  supabase: SupabaseClient
  onClose: () => void
  onSaved: () => void
  onChanged?: () => void
}

export default function EditScheduleModal({
  schedule,
  supabase,
  onClose,
  onSaved,
  onChanged,
}: Props) {
  const [title, setTitle] = useState(schedule.title)
  const [date, setDate] = useState(schedule.date)
  const [time, setTime] = useState(schedule.time ?? '')
  const [memo, setMemo] = useState(schedule.memo ?? '')
  const [category, setCategory] = useState(schedule.category ?? 'general')
  const [recurrence, setRecurrence] = useState<Recurrence>(
    (schedule.recurrence as Recurrence) ?? 'none'
  )
  const [isImportant, setIsImportant] = useState(Boolean(schedule.is_important))
  const [importantColor, setImportantColor] = useState(
    schedule.important_color ?? DEFAULT_IMPORTANT_SCHEDULE_COLOR
  )
  const [importantOrder, setImportantOrder] = useState(schedule.important_order ?? null)
  const [isSaving, setIsSaving] = useState(false)
  const [isMoving, setIsMoving] = useState(false)

  const getNextImportantOrder = async () => {
    if (!schedule.household_id) return 1
    const { data } = await supabase
      .from('schedules')
      .select('important_order')
      .eq('household_id', schedule.household_id)
      .eq('is_important', true)
      .order('important_order', { ascending: false, nullsFirst: false })
      .limit(1)

    return (data?.[0]?.important_order ?? 0) + 1
  }

  const handleUpdate = async () => {
    if (!title.trim()) {
      alert('제목을 입력해주세요')
      return
    }
    setIsSaving(true)
    const nextImportantOrder = isImportant
      ? schedule.is_important
        ? importantOrder ?? await getNextImportantOrder()
        : await getNextImportantOrder()
      : null

    const { error } = await supabase
      .from('schedules')
      .update({
        title: title.trim(),
        date,
        time: time || null,
        memo: memo.trim() || null,
        category,
        recurrence,
        is_important: isImportant,
        important_color: isImportant ? importantColor : null,
        important_order: nextImportantOrder,
      })
      .eq('id', schedule.id)
    setIsSaving(false)
    if (error) {
      alert('수정 실패: ' + error.message)
      return
    }
    onSaved()
  }

  const handleMoveImportant = async (direction: 'up' | 'down') => {
    if (!schedule.household_id) {
      alert('순서를 변경하려면 일정을 다시 열어주세요')
      return
    }

    setIsMoving(true)
    const { data, error } = await supabase
      .from('schedules')
      .select('id, important_order, date, time, title')
      .eq('household_id', schedule.household_id)
      .eq('is_important', true)

    if (error) {
      setIsMoving(false)
      alert('순서 변경 실패: ' + error.message)
      return
    }

    const rows = ((data as ImportantOrderRow[]) || []).sort((a, b) => {
      const ao = a.important_order ?? Number.MAX_SAFE_INTEGER
      const bo = b.important_order ?? Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      const at = a.time ?? '99:99'
      const bt = b.time ?? '99:99'
      if (at !== bt) return at < bt ? -1 : 1
      return a.title.localeCompare(b.title)
    })

    const currentIndex = rows.findIndex(row => row.id === schedule.id)
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= rows.length) {
      setIsMoving(false)
      return
    }

    const reordered = [...rows]
    const [current] = reordered.splice(currentIndex, 1)
    reordered.splice(targetIndex, 0, current)

    const results = await Promise.all(
      reordered.map((row, index) =>
        supabase
          .from('schedules')
          .update({ important_order: index + 1 })
          .eq('id', row.id)
      )
    )

    setIsMoving(false)
    const updateError = results.find(result => result.error)?.error
    if (updateError) {
      alert('순서 변경 실패: ' + updateError.message)
      return
    }

    setImportantOrder(targetIndex + 1)
    onChanged?.()
  }

  const handleDelete = async () => {
    if (!window.confirm('이 일정을 삭제할까요?')) return
    const { error } = await supabase.from('schedules').delete().eq('id', schedule.id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">일정 수정</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={50}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">카테고리</label>
          <div className="grid grid-cols-3 gap-2">
            {SCHEDULE_CATEGORIES.map(cat => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategory(cat.key)}
                className={`flex items-center justify-center gap-1 py-2 rounded-lg border text-sm transition ${
                  category === cat.key
                    ? 'border-indigo-500 bg-indigo-50 text-gray-900'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
                style={
                  category === cat.key
                    ? { borderColor: cat.color, backgroundColor: `${cat.color}15` }
                    : undefined
                }
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">반복</label>
          <div className="grid grid-cols-4 gap-2">
            {(['none', 'weekly', 'monthly', 'yearly'] as const).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRecurrence(r)}
                className={`py-2 rounded-lg text-sm font-medium border transition ${
                  recurrence === r
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {r === 'none'
                  ? '한 번'
                  : r === 'weekly'
                  ? '매주'
                  : r === 'monthly'
                  ? '매월'
                  : '매년'}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3">
          <span>
            <span className="block text-sm font-medium text-gray-900">중요 일정</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              일정 탭 최상단에 따로 표시돼요
            </span>
          </span>
          <input
            type="checkbox"
            checked={isImportant}
            onChange={(e) => setIsImportant(e.target.checked)}
            className="h-5 w-5 accent-indigo-600"
          />
        </label>

        {isImportant && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              중요 일정 색상
            </label>
            <div className="grid grid-cols-5 gap-2">
              {IMPORTANT_SCHEDULE_COLORS.map(color => (
                <button
                  key={color.key}
                  type="button"
                  onClick={() => setImportantColor(color.key)}
                  title={color.label}
                  aria-label={color.label}
                  className={`h-10 rounded-lg border-2 transition ${
                    importantColor === color.key
                      ? 'border-gray-900 scale-105'
                      : 'border-white shadow-sm'
                  }`}
                  style={{ background: color.background }}
                />
              ))}
            </div>
          </div>
        )}

        {isImportant && schedule.is_important && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              중요 일정 순서
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleMoveImportant('up')}
                disabled={isMoving}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                위로
              </button>
              <button
                type="button"
                onClick={() => void handleMoveImportant('down')}
                disabled={isMoving}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                아래로
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              시간 <span className="text-gray-400 text-xs">(선택)</span>
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">메모</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="선택사항"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-3 rounded-lg font-medium text-red-600 border border-red-300 hover:bg-red-50"
          >
            삭제
          </button>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={isSaving}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
