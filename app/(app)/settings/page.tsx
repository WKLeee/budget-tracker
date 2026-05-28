'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ensureDefaultCategories } from '@/lib/categories'
import {
  isPushSupported,
  isSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push'

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
  const [birthday, setBirthday] = useState('')
  const [savingBirthday, setSavingBirthday] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)

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
            // 생일: profile 우선, 없으면 user_metadata에서 가져와 자동 동기화
            const profileBirthday = me?.birthday ?? null
            const metaBirthday = (user.user_metadata as { birthday?: string } | null)?.birthday ?? null
            if (profileBirthday) {
              setBirthday(profileBirthday)
            } else if (metaBirthday) {
              setBirthday(metaBirthday)
              // 회원가입 시 메타데이터에 있던 생일을 profile에 1회성 복사
              await supabase
                .from('profiles')
                .update({ birthday: metaBirthday })
                .eq('id', user.id)
              // 매년 생일 일정도 자동 생성 (없을 때만)
              const { data: existingSched } = await supabase
                .from('schedules')
                .select('id')
                .eq('household_id', memberData.household_id)
                .eq('user_id', user.id)
                .eq('category', 'birthday')
                .eq('recurrence', 'yearly')
                .limit(1)
              if (!existingSched || existingSched.length === 0) {
                const displayName = me?.nickname?.trim() || '내'
                await supabase.from('schedules').insert({
                  household_id: memberData.household_id,
                  user_id: user.id,
                  title: `${displayName} 생일`,
                  date: metaBirthday,
                  category: 'birthday',
                  recurrence: 'yearly',
                })
              }
            }
          }
        }
        // 가계부가 없으면 선택 화면(생성 / 초대코드로 참여)이 표시됨

        // 관리자 여부 확인
        try {
          const res = await fetch('/api/admin/check')
          if (res.ok) {
            const data = await res.json()
            setIsAdmin(!!data.isAdmin)
          }
        } catch {
          // 무시
        }
      } catch (error) {
        console.error('데이터 조회 실패:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [supabase])

  useEffect(() => {
    setPushSupported(isPushSupported())
    isSubscribed()
      .then(setPushOn)
      .catch(() => {})
  }, [])

  const handleTogglePush = async () => {
    if (!household || !myId) return
    setPushBusy(true)
    try {
      if (pushOn) {
        await unsubscribeFromPush(supabase)
        setPushOn(false)
      } else {
        await subscribeToPush(supabase, myId, household.id)
        setPushOn(true)
      }
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setPushBusy(false)
    }
  }

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
    if (!inviteCode) return

    // RLS상 비멤버는 households를 조회할 수 없으므로, 가입은 SECURITY DEFINER 함수로 처리
    const { data: hid, error } = await supabase.rpc('join_household', {
      p_invite_code: inviteCode.toUpperCase(),
    })

    if (error) {
      alert('참여 실패: ' + error.message)
      return
    }
    if (!hid) {
      alert('유효하지 않은 초대코드입니다')
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

  const handleSaveBirthday = async () => {
    if (!myId || !household) return
    setSavingBirthday(true)

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ birthday: birthday || null })
      .eq('id', myId)
    if (profileErr) {
      setSavingBirthday(false)
      alert('생일 저장 실패: ' + profileErr.message)
      return
    }

    // 기존 생일 일정(내가 생성, category=birthday, recurrence=yearly) 찾기
    const { data: existing } = await supabase
      .from('schedules')
      .select('id')
      .eq('household_id', household.id)
      .eq('user_id', myId)
      .eq('category', 'birthday')
      .eq('recurrence', 'yearly')
      .limit(1)

    const existingId = existing?.[0]?.id ?? null
    const displayName = nickname.trim() || '내'
    const title = `${displayName} 생일`

    if (!birthday) {
      // 생일 비웠으면 기존 일정 삭제
      if (existingId) {
        await supabase.from('schedules').delete().eq('id', existingId)
      }
    } else if (existingId) {
      await supabase
        .from('schedules')
        .update({ title, date: birthday })
        .eq('id', existingId)
    } else {
      await supabase.from('schedules').insert({
        household_id: household.id,
        user_id: myId,
        title,
        date: birthday,
        category: 'birthday',
        recurrence: 'yearly',
      })
    }

    setSavingBirthday(false)
    alert('생일이 저장되었습니다')
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
    const iAmOwner = members.find(m => m.user_id === myId)?.role === 'owner'
    if (!iAmOwner) {
      alert('가계부 삭제는 가계부주만 가능합니다.')
      return
    }
    if (!window.confirm(`"${household.name}" 가계부를 삭제하시겠습니까?\n모든 거래/일정/예산이 영구 삭제됩니다.`)) return

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
      alert('삭제 실패: ' + (error as Error).message)
    }
  }

  const handleLeaveHousehold = async () => {
    if (!household) return
    const myMembership = members.find(m => m.user_id === myId)
    if (!myMembership) return
    if (myMembership.role === 'owner') {
      alert('가계부주는 나갈 수 없습니다. 가계부 삭제를 사용하거나 다른 멤버에게 권한을 넘기세요.')
      return
    }
    if (!window.confirm(`"${household.name}" 가계부에서 나가시겠습니까?\n내가 기록한 거래/일정은 가계부에 그대로 남습니다.`)) return

    try {
      const { error } = await supabase
        .from('household_members')
        .delete()
        .eq('id', myMembership.id)

      if (error) throw error

      alert('가계부에서 나왔습니다')
      window.location.reload()
    } catch (error) {
      console.error('나가기 실패:', error)
      alert('나가기 실패: ' + (error as Error).message)
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

          {/* 내 생년월일 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              내 생년월일
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleSaveBirthday}
                disabled={savingBirthday}
                className="px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium rounded-lg whitespace-nowrap"
              >
                {savingBirthday ? '저장 중' : '저장'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              매년 생일에 자동으로 일정/알림이 등록됩니다
            </p>
          </div>

          {/* 알림 */}
          {pushSupported && (
            <div>
              <button
                onClick={handleTogglePush}
                disabled={pushBusy}
                className={`w-full font-medium py-3 rounded-lg border transition disabled:opacity-50 ${
                  pushOn
                    ? 'border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
                    : 'border-gray-300 text-gray-900 hover:bg-gray-50'
                }`}
              >
                {pushBusy ? '처리 중...' : pushOn ? '🔔 알림 켜짐 (끄기)' : '🔕 알림 받기'}
              </button>
              <p className="text-xs text-gray-500 mt-1">
                멤버가 일정/거래를 추가하면 푸시 알림을 받습니다
              </p>
            </div>
          )}

          {/* 멤버 목록 */}
          <div>
            <h3 className="font-bold text-gray-900 mb-3">멤버 ({members.length}명)</h3>
            <div className="space-y-2">
              {members.map(member => {
                const iAmOwner = members.find(m => m.user_id === myId)?.role === 'owner'
                const canRemove =
                  iAmOwner && member.role !== 'owner' && member.user_id !== myId
                return (
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
                    <div className="flex items-center gap-2">
                      {member.role === 'owner' && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                          가계부주
                        </span>
                      )}
                      {canRemove && (
                        <button
                          type="button"
                          onClick={async () => {
                            const name =
                              member.profiles?.nickname ||
                              member.profiles?.email ||
                              '이 멤버'
                            if (
                              !window.confirm(
                                `${name}을(를) 가계부에서 제외할까요?\n기존 거래/일정은 그대로 남습니다.`
                              )
                            )
                              return
                            const { error } = await supabase
                              .from('household_members')
                              .delete()
                              .eq('id', member.id)
                            if (error) {
                              alert('제외 실패: ' + error.message)
                              return
                            }
                            setMembers(members.filter(m => m.id !== member.id))
                          }}
                          className="text-xs text-red-600 hover:text-red-700 border border-red-300 hover:bg-red-50 px-2 py-1 rounded"
                        >
                          제외
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 가계부 삭제 (가계부주) / 나가기 (일반 멤버) */}
          {members.find(m => m.user_id === myId)?.role === 'owner' ? (
            <button
              onClick={handleDeleteHousehold}
              className="w-full text-red-600 hover:text-red-700 font-medium py-2 border border-red-300 rounded-lg hover:bg-red-50"
            >
              가계부 삭제
            </button>
          ) : (
            <button
              onClick={handleLeaveHousehold}
              className="w-full text-gray-700 hover:text-gray-900 font-medium py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              가계부 나가기
            </button>
          )}
        </div>
      )}

      {/* 관리자 링크 */}
      {isAdmin && (
        <button
          onClick={() => router.push('/admin')}
          className="mt-8 w-full font-medium py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          🛠️ 관리자 페이지
        </button>
      )}

      {/* 로그아웃 */}
      <button
        onClick={handleLogout}
        className={`${isAdmin ? 'mt-3' : 'mt-8'} w-full text-red-600 hover:text-red-700 font-medium py-2`}
      >
        로그아웃
      </button>
    </div>
  )
}
