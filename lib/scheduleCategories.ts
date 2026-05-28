export interface ScheduleCategory {
  key: string
  label: string
  icon: string
  color: string
}

export const SCHEDULE_CATEGORIES: ScheduleCategory[] = [
  { key: 'general', label: '일반', icon: '📌', color: '#6366f1' },
  { key: 'bill', label: '공과금/납부', icon: '💳', color: '#ef4444' },
  { key: 'anniversary', label: '기념일', icon: '🎉', color: '#ec4899' },
  { key: 'birthday', label: '생일', icon: '🎂', color: '#f472b6' },
  { key: 'gathering', label: '모임', icon: '🍻', color: '#14b8a6' },
  { key: 'travel', label: '여행', icon: '✈️', color: '#0ea5e9' },
  { key: 'event', label: '이벤트', icon: '🎯', color: '#f59e0b' },
  { key: 'health', label: '건강/병원', icon: '🏥', color: '#10b981' },
  { key: 'other', label: '기타', icon: '📝', color: '#6b7280' },
]

export function getScheduleCategory(key: string | null | undefined): ScheduleCategory {
  return SCHEDULE_CATEGORIES.find(c => c.key === key) ?? SCHEDULE_CATEGORIES[0]
}

export const RECURRENCE_LABELS: Record<string, string> = {
  none: '한 번',
  weekly: '매주',
  monthly: '매월',
  yearly: '매년',
}

export function scheduleMatchesDate(
  s: { date: string; recurrence?: string | null },
  dateStr: string
): boolean {
  const rec = s.recurrence ?? 'none'
  if (rec === 'none') return s.date === dateStr
  const start = new Date(s.date + 'T00:00:00')
  const target = new Date(dateStr + 'T00:00:00')
  if (target < start) return false
  if (rec === 'weekly') return start.getDay() === target.getDay()
  if (rec === 'monthly') return start.getDate() === target.getDate()
  if (rec === 'yearly')
    return start.getMonth() === target.getMonth() && start.getDate() === target.getDate()
  return false
}
