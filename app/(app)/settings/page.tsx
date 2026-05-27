'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ensureDefaultCategories } from '@/lib/categories'

interface Household {
  id: string
  name: string
  invite_code: string
}

interface Member {
  id: string
  user_id: string
  role: string
  profiles: {
    email: string
    nickname: string | null
  } | null
}

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showNewHousehold, setShowNewHousehold] = useState(false)
  const [householdName, setHouseholdName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [myId, setMyId] = useState('')
  const [nickname, setNickname] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setMyId(user.id)

        const { data: memberRows } = await supabase
          .from('household_members')
          .select('household_id, joined_at')
          .eq('user_id', user.id)
          .order('joined_at', { ascending: false })

        const memberData = memberRows?.[0]

        if (memberData) {
          // 기존 가계부가 있음
          const { data: householdData } = await supabase
            .from('households')
            .select('*')
            .eq('id', memberData.household_id)
            .single()

          const { data: membersData } = await supabase
            .from('household_members')
            .select('id, user_id, role')
            .eq('household_id', memberData.household_id)

          if (householdData) setHousehold(householdData)

          if (membersData) {
            const { data: profilesData } = await supabase
              .from('profiles')
              .select('*')
              .in('id', membersData.map(m => m.user_id))

            setMembers(
              membersData.map(m => {
                const profile = profilesData?.find(p => p.id === m.user_id)
                return {
                  id: m.id,
                  user_id: m.user_id,
                  role: m.role,
                  profiles: profile
                    ? { email: profile.email, nickname: profile.nickname ?? null }
                    : null,
                }
              })
            )

            const me = profilesData?.find(p => p.id === user.id)
            setNickname(me?.nickname ?? '')
          }
        }
        // 가계부가 없으면 선택 화면(생성 / 초대코드로 참여)이 표시됨
      } catch (error) {
        console.error('데이터 조회 실패:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [supabase])

  const handleCreateHousehold = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !householdName) return

    const code = Math.random().toString(36).substring(2, 8).toUpperCase()

    const { data: newHousehold, error } = await supabase
      .from('households')
      .insert({
        name: householdName,
        invite_code: code,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      alert('가계부 생성 실패: ' + error.message)
      return
    }

    // 생성자를 멤버로 추가
    await supabase.from('household_members').insert({
      household_id: newHousehold.id,
      user_id: user.id,
      role: 'owner',
    })

    // 기본 카테고리 생성
    await ensureDefaultCategories(supabase, newHousehold.id)

    setHousehold(newHousehold)
    setShowNewHousehold(false)
    setHouseholdName('')
  }

  const handleJoinHousehold = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !inviteCode) return

    const { data: householdData } = await supabase
      .from('households')
      .select('id')
      .eq('invite_code', inviteCode.toUpperCase())
      .single()

    if (!householdData) {
      alert('유효하지 않은 초대코드입니다')
      return
    }

    const { error } = await supabase.from('household_members').insert({
      household_id: householdData.id,
      user_id: user.id,
      role: 'member',
    })

    if (error) {
      if (error.message.includes('duplicate')) {
        alert('이미 이 가계부에 참여 중입니다')
      } else {
        alert('참여 실패: ' + error.message)
      }
      return
    }

    setInviteCode('')
    setShowInviteForm(false)
    window.location.reload()
  }

  const handleSaveNickname = async () => {
    if (!myId) return
    setSavingNickname(true)
    const { error } = await supabase
      .from('profiles')
      .update({ nickname: nickname.trim() || null })
      .eq('id', myId)
    setSavingNickname(false)

    if (error) {
      alert('닉네임 저장 실패: ' + error.message)
      return
    }

    alert('닉네임이 저장되었습니다')
    window.location.reload()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const copyInviteLink = async () => {
    if (!household) return
    const code = household.invite_code
    await navigator.clipboard.writeText(code)
    alert(`초대코드 복사됨: ${code}`)
  }

  const handleDeleteHousehold = async () => {
    if (!household) return
    if (!window.confirm(`"${household.name}" 가계부를 삭제하시겠습니까?\n(모든 데이터가 삭제됩니다)`)) return

    try {
      const { error } = await supabase
        .from('households')
        .delete()
        .eq('id', household.id)

      if (error) throw error

      alert('가계부가 삭제되었습니다')
      window.location.reload()
    } catch (error) {
      console.error('삭제 실패:', error)
      alert('삭제 실패: ' + (error as any).message)
    }
  }

  if (isLoading) {
    return <div className="p-4">로딩 중...</div>
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">설정</h1>

      {/* 가계부 없음 */}
      {!household && !showNewHousehold && !showInviteForm && (
        <div className="space-y-3">
          <button
            onClick={() => setShowNewHousehold(true)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-lg"
          >
            새 가계부 생성
          </button>
          <button
            onClick={() => setShowInviteForm(true)}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium py-3 rounded-lg"
          >
            초대코드로 참여
          </button>
        </div>
      )}

      {/* 새 가계부 생성 폼 */}
      {showNewHousehold && (
        <form onSubmit={handleCreateHousehold} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              가계부 이름
            </label>
            <input
              type="text"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder="예: 철수 & 영희"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg"
          >
            생성
          </button>
          <button
            type="button"
            onClick={() => setShowNewHousehold(false)}
            className="w-full bg-gray-200 text-gray-900 font-medium py-2 rounded-lg"
          >
            취소
          </button>
        </form>
      )}

      {/* 초대코드로 참여 */}
      {showInviteForm && !household && (
        <form onSubmit={handleJoinHousehold} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              초대코드
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="6자리 코드"
              maxLength={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-center text-lg tracking-widest"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg"
          >
            참여
          </button>
          <button
            type="button"
            onClick={() => setShowInviteForm(false)}
            className="w-full bg-gray-200 text-gray-900 font-medium py-2 rounded-lg"
          >
            취소
          </button>
        </form>
      )}

      {/* 기존 가계부 정보 */}
      {household && (
        <div className="space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-2">{household.name}</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-600 mb-1">초대코드</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-indigo-600 tracking-widest">
                    {household.invite_code}
                  </p>
                  <button
                    onClick={copyInviteLink}
                    className="text-xs bg-white border border-gray-300 hover:bg-gray-100 px-3 py-1 rounded text-gray-700"
                  >
                    복사
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  이 코드를 가족/연인에게 공유하면 함께 가계부를 쓸 수 있습니다
                </p>
              </div>
            </div>
          </div>

          {/* 내 닉네임 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              내 닉네임
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="예: 철수"
                maxLength={20}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleSaveNickname}
                disabled={savingNickname}
                className="px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium rounded-lg whitespace-nowrap"
              >
                {savingNickname ? '저장 중' : '저장'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              거래 내역에 이메일 대신 닉네임이 표시됩니다
            </p>
          </div>

          {/* 멤버 목록 */}
          <div>
            <h3 className="font-bold text-gray-900 mb-3">멤버 ({members.length}명)</h3>
            <div className="space-y-2">
              {members.map(member => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <p className="text-gray-900">
                    {member.profiles?.nickname || member.profiles?.email || '(unknown)'}
                    {member.user_id === myId && (
                      <span className="text-xs text-gray-500 ml-1">(나)</span>
                    )}
                  </p>
                  {member.role === 'owner' && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                      가계부주
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 가계부 삭제 */}
          <button
            onClick={handleDeleteHousehold}
            className="w-full text-red-600 hover:text-red-700 font-medium py-2 border border-red-300 rounded-lg hover:bg-red-50"
          >
            가계부 삭제
          </button>
        </div>
      )}

      {/* 로그아웃 */}
      <button
        onClick={handleLogout}
        className="mt-8 w-full text-red-600 hover:text-red-700 font-medium py-2"
      >
        로그아웃
      </button>
    </div>
  )
}
