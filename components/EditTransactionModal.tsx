'use client'

import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface EditableTransaction {
  id: string
  user_id?: string | null
  type: 'income' | 'expense'
  amount: number
  memo: string | null
  date: string
  category_id: string | null
}

export interface ModalCategory {
  id: string
  name: string
  icon: string
  type: 'income' | 'expense'
}

export interface ModalMemberOption {
  id: string
  label: string
}

interface Props {
  transaction: EditableTransaction
  categories: ModalCategory[]
  memberOptions?: ModalMemberOption[]
  supabase: SupabaseClient
  onClose: () => void
  onSaved: () => void
}

export default function EditTransactionModal({
  transaction,
  categories,
  memberOptions,
  supabase,
  onClose,
  onSaved,
}: Props) {
  const [type, setType] = useState<'income' | 'expense'>(transaction.type)
  const [amount, setAmount] = useState(String(transaction.amount))
  const [categoryId, setCategoryId] = useState(transaction.category_id ?? '')
  const [date, setDate] = useState(transaction.date)
  const [memo, setMemo] = useState(transaction.memo ?? '')
  const [ownerId, setOwnerId] = useState(transaction.user_id ?? 'shared')
  const [isSaving, setIsSaving] = useState(false)

  const filteredCategories = categories.filter(c => c.type === type)

  const handleUpdate = async () => {
    if (!amount || !categoryId) {
      alert('금액과 카테고리를 입력해주세요')
      return
    }
    setIsSaving(true)
    const { error } = await supabase
      .from('transactions')
      .update({
        type,
        amount: Math.round(Number(amount)),
        category_id: categoryId,
        date,
        memo,
        ...(memberOptions
          ? { user_id: ownerId === 'shared' ? null : ownerId }
          : {}),
      })
      .eq('id', transaction.id)
    setIsSaving(false)
    if (error) {
      alert('수정 실패: ' + error.message)
      return
    }
    onSaved()
  }

  const handleDelete = async () => {
    if (!window.confirm('이 거래를 삭제할까요?')) return
    const { error } = await supabase.from('transactions').delete().eq('id', transaction.id)
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
          <h2 className="text-lg font-bold text-gray-900">거래 수정</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setType('expense')
              setCategoryId('')
            }}
            className={`flex-1 py-2 rounded-lg font-medium transition ${
              type === 'expense'
                ? 'bg-red-700 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            지출
          </button>
          <button
            type="button"
            onClick={() => {
              setType('income')
              setCategoryId('')
            }}
            className={`flex-1 py-2 rounded-lg font-medium transition ${
              type === 'income'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            수입
          </button>
        </div>

        {memberOptions && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">멤버</label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="shared">공동</option>
              {memberOptions.map(member => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">금액 (원)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">카테고리</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">선택해주세요</option>
            {filteredCategories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
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
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="선택사항"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
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
