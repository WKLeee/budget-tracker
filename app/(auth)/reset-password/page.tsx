'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [checking, setChecking] = useState(true)
  const [valid, setValid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function checkSession() {
      try {
        if (new URLSearchParams(window.location.search).has('error')) return
        const { data, error } = await createClient().auth.getUser()
        if (active && !error && data.user) setValid(true)
      } catch {
        // The invalid-link state also covers a failed session check.
      } finally {
        if (active) setChecking(false)
      }
    }
    void checkSession()
    return () => { active = false }
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    setError('')
    if (password.length < 8) {
      setError('비밀번호는 8자 이상 입력해 주세요.')
      return
    }
    if (password !== confirmation) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }
    setSaving(true)
    try {
      const { error } = await createClient().auth.updateUser({ password })
      if (error) {
        setError(error.code === 'same_password'
          ? '기존 비밀번호와 다른 비밀번호를 입력해 주세요.'
          : '변경하지 못했습니다. 비밀번호 보안 조건을 확인하거나 재설정 메일을 다시 요청해 주세요.')
        return
      }
      setPassword('')
      setConfirmation('')
      setDone(true)
    } catch {
      setError('네트워크 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">비밀번호 재설정</h1>
        {checking ? <p role="status" className="text-sm text-gray-600">링크 확인 중...</p> : done ? (
          <div role="status" className="space-y-4 text-center">
            <p className="text-sm text-gray-700">비밀번호가 변경되었습니다.</p>
            <Link href="/dashboard" className="inline-block text-indigo-600 font-medium">가계부로 이동</Link>
          </div>
        ) : !valid ? (
          <div className="space-y-4 text-sm">
            <p role="alert" className="text-red-700">링크가 만료되었거나 유효하지 않습니다. 메일을 다시 요청한 뒤 같은 브라우저에서 열어 주세요.</p>
            <Link href="/forgot-password" className="inline-block text-indigo-600 font-medium">재설정 메일 다시 요청</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p role="alert" className="p-3 bg-red-50 rounded text-red-700 text-sm">{error}</p>}
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
              <input id="new-password" type="password" autoComplete="new-password" required minLength={8}
                value={password} onChange={event => setPassword(event.target.value)} disabled={saving}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 확인</label>
              <input id="confirm-password" type="password" autoComplete="new-password" required minLength={8}
                value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={saving}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button type="submit" disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium py-2 rounded-lg transition">
              {saving ? '변경 중...' : '비밀번호 변경'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
