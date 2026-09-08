import { createClient } from './supabase/client'

type SupabaseClient = ReturnType<typeof createClient>

export interface DefaultCategory {
  name: string
  type: 'income' | 'expense'
  icon: string
}

// 기본 카테고리 — 여기에 추가하면 새 가계부 생성 시, 그리고 기존 가계부에도 앱 진입 시 자동 반영됨
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: '급여', type: 'income', icon: '💰' },
  { name: '용돈', type: 'income', icon: '💵' },
  { name: '보너스', type: 'income', icon: '🎉' },
  { name: '부수입/이자', type: 'income', icon: '🏦' },
  { name: '식비', type: 'expense', icon: '🍜' },
  { name: '카페', type: 'expense', icon: '☕' },
  { name: '교통', type: 'expense', icon: '🚗' },
  { name: '쇼핑', type: 'expense', icon: '🛍️' },
  { name: '문화생활', type: 'expense', icon: '🎬' },
  { name: '생활용품', type: 'expense', icon: '🧻' },
  { name: '의료/건강', type: 'expense', icon: '💊' },
  { name: '헤어샵', type: 'expense', icon: '💇' },
  { name: '통신비', type: 'expense', icon: '📱' },
  { name: '주거/공과금', type: 'expense', icon: '🏠' },
  { name: '보험', type: 'expense', icon: '🛡️' },
  { name: '경조사', type: 'expense', icon: '🙏' },
  { name: '선물', type: 'expense', icon: '🎀' },
  { name: '결혼준비', type: 'expense', icon: '💍' },
  { name: '용돈 지급', type: 'expense', icon: '💸' },
  { name: '기타', type: 'expense', icon: '📌' },
]

// DEFAULT_CATEGORIES 배열 순서대로 정렬 (목록에 없는 카테고리는 맨 뒤)
const DEFAULT_ORDER = new Map(DEFAULT_CATEGORIES.map((c, i) => [c.name, i]))

export function sortByDefaultOrder<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      (DEFAULT_ORDER.get(a.name) ?? Infinity) - (DEFAULT_ORDER.get(b.name) ?? Infinity)
  )
}

// 현재 가계부에 없는 기본 카테고리만 골라 한 번에 추가
export async function ensureDefaultCategories(
  supabase: SupabaseClient,
  householdId: string
) {
  const { data: existing } = await supabase
    .from('categories')
    .select('name')
    .eq('household_id', householdId)

  const existingNames = new Set((existing ?? []).map(c => c.name))
  const missing = DEFAULT_CATEGORIES.filter(c => !existingNames.has(c.name))

  if (missing.length === 0) return

  await supabase.from('categories').insert(
    missing.map(c => ({
      household_id: householdId,
      name: c.name,
      type: c.type,
      icon: c.icon,
      is_default: true,
    }))
  )
}
