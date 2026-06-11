export interface ImportantScheduleColor {
  key: string
  label: string
  background: string
}

export const IMPORTANT_SCHEDULE_COLORS: ImportantScheduleColor[] = [
  { key: 'indigo', label: '인디고', background: 'linear-gradient(135deg, #4f46e5, #6d28d9)' },
  { key: 'blue', label: '블루', background: 'linear-gradient(135deg, #2563eb, #0891b2)' },
  { key: 'teal', label: '틸', background: 'linear-gradient(135deg, #0f766e, #059669)' },
  { key: 'green', label: '그린', background: 'linear-gradient(135deg, #16a34a, #65a30d)' },
  { key: 'rose', label: '로즈', background: 'linear-gradient(135deg, #e11d48, #db2777)' },
  { key: 'pink', label: '핑크', background: 'linear-gradient(135deg, #db2777, #9333ea)' },
  { key: 'red', label: '레드', background: 'linear-gradient(135deg, #dc2626, #ea580c)' },
  { key: 'orange', label: '오렌지', background: 'linear-gradient(135deg, #ea580c, #d97706)' },
  { key: 'slate', label: '슬레이트', background: 'linear-gradient(135deg, #334155, #475569)' },
  { key: 'dark', label: '다크', background: 'linear-gradient(135deg, #111827, #374151)' },
]

export const DEFAULT_IMPORTANT_SCHEDULE_COLOR = IMPORTANT_SCHEDULE_COLORS[0].key

export function getImportantScheduleColor(key: string | null | undefined) {
  return (
    IMPORTANT_SCHEDULE_COLORS.find(color => color.key === key) ??
    IMPORTANT_SCHEDULE_COLORS[0]
  )
}
