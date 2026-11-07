'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/recovery`,
      })
      if (error) {
        setError(error.status === 429
          ? '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
          : '메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }
      setSent(true)
    } catch {
      setError('네트워크 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">비밀번호 찾기</h1>
        {sent ? (
          <p role="status" className="text-sm text-gray-700 leading-6">
            등록된 이메일이라면 재설정 메일이 발송됩니다. 스팸함도 확인해 주세요.
            메일을 요청한 브라우저에서 링크를 열어 주세요.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p role="alert" className="p-3 bg-red-50 rounded text-red-700 text-sm">{error}</p>}
            <div>
              <label htmlFor="recovery-email" className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
              <input id="recovery-email" type="email" autoComplete="email" required value={email}
                onChange={event => setEmail(event.target.value)} disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium py-2 rounded-lg transition">
              {loading ? '발송 중...' : '재설정 메일 보내기'}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm"><Link href="/login" className="text-indigo-600 hover:text-indigo-700">로그인으로 돌아가기</Link></p>
      </div>
    </main>
  )
}
