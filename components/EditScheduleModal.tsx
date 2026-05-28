'use client'

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SCHEDULE_CATEGORIES } from '@/lib/scheduleCategories'

export interface EditableSchedule {
  id: string
  title: string
  memo: string | null
  date: string
  category: string | null
  recurrence: string | null
}

type Recurrence = 'none' | 'weekly' | 'monthly' | 'yearly'

interface Props {
  schedule: EditableSchedule
  supabase: SupabaseClient
  onClose: () => void
  onSaved: () => void
}

export default function EditScheduleModal({
  schedule,
  supabase,
  onClose,
  onSaved,
}: Props) {
  const [title, setTitle] = useState(schedule.title)
  const [date, setDate] = useState(schedule.date)
  const [memo, setMemo] = useState(schedule.memo ?? '')
  const [category, setCategory] = useState(schedule.category ?? 'general')
  const [recurrence, setRecurrence] = useState<Recurrence>(
    (schedule.recurrence as Recurrence) ?? 'none'
  )
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setTitle(schedule.title)
    setDate(schedule.date)
    setMemo(schedule.memo ?? '')
    setCategory(schedule.category ?? 'general')
    setRecurrence((schedule.recurrence as Recurrence) ?? 'none')
  }, [schedule])

  const handleUpdate = async () => {
    if (!title.trim()) {
      alert('제목을 입력해주세요')
      return
    }
    setIsSaving(true)
    const { error } = await supabase
      .from('schedules')
      .update({
        title: title.trim(),
        date,
        memo: memo.trim() || null,
        category,
        recurrence,
      })
      .eq('id', schedule.id)
    setIsSaving(false)
    if (error) {
      alert('수정 실패: ' + error.message)
      return
    }
    onSaved()
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
