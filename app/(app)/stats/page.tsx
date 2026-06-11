'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import AppLoading from '@/components/AppLoading'
import EditTransactionModal from '@/components/EditTransactionModal'
import EditRecurringRuleModal from '@/components/EditRecurringRuleModal'
import type { ModalMemberOption } from '@/components/EditTransactionModal'
import { sortByDefaultOrder } from '@/lib/categories'

interface Transaction {
  id: string
  user_id: string | null
  type: 'income' | 'expense'
  amount: number
  memo: string | null
  date: string
  category_id: string | null
  categories: { name: string; icon: string } | null
  isRecurring?: boolean
  recurringRuleId?: string
}

interface RecurringRule {
  id: string
  user_id: string | null
  type: 'income' | 'expense'
  amount: number
  memo: string | null
  day_of_month: number
  category_id: string | null
  enabled: boolean
  last_executed_date: string | null
  categories: { name: string; icon: string } | null
}

interface Profile {
  id: string
  email: string
  nickname: string | null
}

interface Category {
  id: string
  name: string
  icon: string
  type: 'income' | 'expense'
}

interface ChartData {
  name: string
  수입: number
  지출: number
}

interface CategoryChartData {
  name: string
  value: number
}

interface MemberExpenseData {
  userId: string
  name: string
  value: number
  percent: number
}

interface TransactionListItem extends Transaction {
  memberName: string
}

interface MonthlySummary {
  income: number
  expense: number
  balance: number
}

type PeriodMode = 'month' | 'year' | 'all'

const TRANSACTION_PAGE_SIZE = 50

interface Insights {
  selTotal: number
  prevTotal: number
  totalChangePct: number | null
  dailyAvg: number
  projection: number | null
  topCategoryChanges: { name: string; diffPct: number; sel: number; prev: number }[]
  isCurrentMonth: boolean
  daysPassed: number
  daysInMonth: number
}

function getMonthEnd(monthPrefix: string) {
  const [year, month] = monthPrefix.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return `${monthPrefix}-${String(lastDay).padStart(2, '0')}`
}

function getYearMonths(year: number) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

function getRecentMonths(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (count - 1 - i))
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  })
}

function createVirtualRecurringTransactions(
  rules: RecurringRule[],
  monthPrefix: string
): Transaction[] {
  const [year, month] = monthPrefix.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()

  return rules
    .filter(r => !r.last_executed_date || !r.last_executed_date.startsWith(monthPrefix))
    .map(r => {
      const day = Math.min(r.day_of_month, daysInMonth)
      return {
        id: `recurring-${monthPrefix}-${r.id}`,
        user_id: r.user_id,
        type: r.type,
        amount: r.amount,
        memo: r.memo,
        date: `${monthPrefix}-${String(day).padStart(2, '0')}`,
        category_id: r.category_id,
        categories: r.categories,
        isRecurring: true,
        recurringRuleId: r.id,
      }
    })
}

export default function StatsPage() {
  const supabase = createClient()
  const currentYear = new Date().getFullYear()
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [categoryData, setCategoryData] = useState<CategoryChartData[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [memberOptions, setMemberOptions] = useState<ModalMemberOption[]>([])
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([])
  const [memberData, setMemberData] = useState<MemberExpenseData[]>([])
  const [transactionList, setTransactionList] = useState<TransactionListItem[]>([])
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null)
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all')
  const [selectedMemberFilter, setSelectedMemberFilter] = useState('all')
  const [visibleTransactionCount, setVisibleTransactionCount] = useState(TRANSACTION_PAGE_SIZE)
  const [refetchTick, setRefetchTick] = useState(0)
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary>({
    income: 0,
    expense: 0,
    balance: 0,
  })
  const [insights, setInsights] = useState<Insights | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6']
  const MEMBER_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2']

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: memberRows } = await supabase
          .from('household_members')
          .select('household_id, joined_at')
          .eq('user_id', user.id)
          .order('joined_at', { ascending: false })

        const members = memberRows?.[0]

        if (!members) return

        const { data: householdMemberRows, error: householdMembersError } = await supabase
          .from('household_members')
          .select('user_id')
          .eq('household_id', members.household_id)

        if (householdMembersError) throw householdMembersError

        const householdMemberIds = [
          ...new Set((householdMemberRows ?? []).map(row => row.user_id).filter(Boolean)),
        ]
        if (householdMemberIds.length > 0) {
          const { data: householdProfiles, error: householdProfilesError } = await supabase
            .from('profiles')
            .select('id, email, nickname')
            .in('id', householdMemberIds)

          if (householdProfilesError) throw householdProfilesError
          setMemberOptions(
            householdMemberIds.map(id => {
              const profile = householdProfiles?.find(p => p.id === id)
              return {
                id,
                label: profile?.nickname || profile?.email?.split('@')[0] || '멤버',
              }
            })
          )
        } else {
          setMemberOptions([])
        }

        const [selectedMonthYear, selectedMonthNumber] = selectedMonth.split('-').map(Number)
        const previousMonthDate = new Date(selectedMonthYear, selectedMonthNumber - 2, 1)
        const previousMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`
        const selectedPeriodMonths =
          periodMode === 'month'
            ? [selectedMonth]
            : periodMode === 'year'
            ? getYearMonths(selectedYear)
            : []
        const comparisonMonths =
          periodMode === 'month'
            ? [previousMonth]
            : periodMode === 'year'
            ? getYearMonths(selectedYear - 1)
            : []
        const chartMonths =
          periodMode === 'year'
            ? getYearMonths(selectedYear)
            : periodMode === 'month'
            ? getRecentMonths(6)
            : []
        const queryMonths =
          periodMode === 'all'
            ? []
            : [...new Set([...getRecentMonths(12), ...selectedPeriodMonths, ...comparisonMonths])].sort()

        let transactionsQuery = supabase
          .from('transactions')
          .select(`
            id,
            user_id,
            type,
            amount,
            memo,
            date,
            category_id,
            categories (name, icon)
          `)
          .eq('household_id', members.household_id)

        if (periodMode !== 'all') {
          transactionsQuery = transactionsQuery
            .gte('date', `${queryMonths[0]}-01`)
            .lte('date', getMonthEnd(queryMonths[queryMonths.length - 1]))
        }

        const { data: allTransactions, error: transactionsError } = await transactionsQuery

        if (transactionsError) throw transactionsError

        const { data: recurringData, error: recurringError } = await supabase
          .from('recurring_transactions')
          .select(`
            id, user_id, type, amount, memo, day_of_month, category_id, enabled, last_executed_date,
            categories (name, icon)
          `)
          .eq('household_id', members.household_id)
          .eq('enabled', true)

        if (recurringError) throw recurringError

        const { data: catData, error: categoriesError } = await supabase
          .from('categories')
          .select('id, name, icon, type')
          .eq('household_id', members.household_id)

        if (categoriesError) throw categoriesError
        if (catData) setCategories(sortByDefaultOrder(catData as Category[]))

        const recurringRules = (recurringData as unknown as RecurringRule[]) || []
        setRecurringRules(recurringRules)
        const virtualTransactions =
          periodMode === 'all'
            ? []
            : queryMonths.flatMap(monthPrefix =>
                createVirtualRecurringTransactions(recurringRules, monthPrefix)
              )
        const statsTransactions = [
          ...((allTransactions as unknown as Transaction[]) || []),
          ...virtualTransactions,
        ]

        const periodTransactions =
          periodMode === 'all'
            ? statsTransactions
            : statsTransactions.filter(t =>
                selectedPeriodMonths.some(monthPrefix => t.date.startsWith(monthPrefix))
              )
        const expenseTransactions = periodTransactions.filter(t => t.type === 'expense')
        const comparisonExpenseTransactions =
          periodMode === 'all'
            ? []
            : statsTransactions.filter(
                t =>
                  t.type === 'expense' &&
                  comparisonMonths.some(monthPrefix => t.date.startsWith(monthPrefix))
              )

        const chartDataFormatted =
          periodMode === 'all'
            ? Object.values(
                statsTransactions.reduce<Record<string, ChartData>>((acc, trans) => {
                  const year = trans.date.substring(0, 4)
                  acc[year] ??= { name: `${year}년`, 수입: 0, 지출: 0 }
                  if (trans.type === 'income') acc[year].수입 += trans.amount || 0
                  else acc[year].지출 += trans.amount || 0
                  return acc
                }, {})
              ).sort((a, b) => a.name.localeCompare(b.name))
            : chartMonths.map(monthPrefix => {
                const totals = statsTransactions
                  .filter(t => t.date.startsWith(monthPrefix))
                  .reduce(
                    (acc, trans) => {
                      if (trans.type === 'income') acc.수입 += trans.amount || 0
                      else acc.지출 += trans.amount || 0
                      return acc
                    },
                    { 수입: 0, 지출: 0 }
                  )
                return {
                  name:
                    periodMode === 'year'
                      ? `${Number(monthPrefix.split('-')[1])}월`
                      : monthPrefix.split('-')[1] + '월',
                  ...totals,
                }
              })

        setChartData(chartDataFormatted)

        const periodIncome = periodTransactions
          .filter(t => t.type === 'income')
          .reduce((sum, t) => sum + (t.amount || 0), 0)
        const periodExpense = expenseTransactions.reduce((sum, t) => sum + (t.amount || 0), 0)

        setMonthlySummary({
          income: periodIncome,
          expense: periodExpense,
          balance: periodIncome - periodExpense,
        })

        const categoryTotals: Record<string, number> = {}
        expenseTransactions.forEach(trans => {
          const catName = trans.categories?.name || '기타'
          categoryTotals[catName] = (categoryTotals[catName] || 0) + (trans.amount || 0)
        })

        const categoryDataFormatted = Object.entries(categoryTotals)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)

        setCategoryData(categoryDataFormatted)

        const selTotal = periodExpense
        const prevTotal = comparisonExpenseTransactions.reduce((s, t) => s + (t.amount || 0), 0)
        const totalChangePct =
          prevTotal > 0 ? ((selTotal - prevTotal) / prevTotal) * 100 : null

        // 멤버별 지출
        const profileIds = [...new Set(periodTransactions.map(t => t.user_id).filter(Boolean))]
        let profiles: Profile[] = []
        if (profileIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, email, nickname')
            .in('id', profileIds)

          if (profilesError) throw profilesError
          profiles = (profilesData as Profile[]) || []
        }

        const memberTotals: Record<string, number> = {}
        expenseTransactions.forEach(trans => {
          const memberKey = trans.user_id ?? 'shared'
          memberTotals[memberKey] = (memberTotals[memberKey] || 0) + (trans.amount || 0)
        })

        const memberDataFormatted = Object.entries(memberTotals)
          .map(([userId, value]) => {
            const profile = profiles.find(p => p.id === userId)
            const name =
              userId === 'shared'
                ? '공동'
                : profile?.nickname || profile?.email?.split('@')[0] || '멤버'
            return {
              userId,
              name,
              value,
              percent: selTotal > 0 ? (value / selTotal) * 100 : 0,
            }
          })
          .sort((a, b) => b.value - a.value)

        setMemberData(memberDataFormatted)

        const getMemberName = (userId: string | null) => {
          if (!userId) return '공동'
          const profile = profiles.find(p => p.id === userId)
          return profile?.nickname || profile?.email?.split('@')[0] || '멤버'
        }

        setTransactionList(
          periodTransactions
            .map(t => ({
              ...t,
              memberName: getMemberName(t.user_id),
            }))
            .sort((a, b) => {
              if (a.date !== b.date) return a.date < b.date ? 1 : -1
              return a.id < b.id ? 1 : -1
            })
        )

        // 카테고리별 변화
        const prevByCat: Record<string, number> = {}
        comparisonExpenseTransactions.forEach(t => {
          const n = t.categories?.name || '기타'
          prevByCat[n] = (prevByCat[n] || 0) + (t.amount || 0)
        })
        const allCatNames = new Set([
          ...Object.keys(categoryTotals),
          ...Object.keys(prevByCat),
        ])
        const topCategoryChanges = Array.from(allCatNames)
          .map(name => {
            const sel = categoryTotals[name] || 0
            const prev = prevByCat[name] || 0
            const diffPct =
              prev > 0 ? ((sel - prev) / prev) * 100 : sel > 0 ? Infinity : 0
            return { name, sel, prev, diffPct }
          })
          .filter(c => c.sel > 0 || c.prev > 0)
          .sort((a, b) => {
            const aMag = a.diffPct === Infinity ? Number.MAX_SAFE_INTEGER : Math.abs(a.diffPct)
            const bMag = b.diffPct === Infinity ? Number.MAX_SAFE_INTEGER : Math.abs(b.diffPct)
            return bMag - aMag
          })
          .slice(0, 3)

        if (periodMode === 'all') {
          setInsights(null)
        } else {
          const now = new Date()
          const [selY, selM] = selectedMonth.split('-').map(Number)
          const isCurrentPeriod =
            periodMode === 'month'
              ? selY === now.getFullYear() && selM === now.getMonth() + 1
              : selectedYear === now.getFullYear()
          const daysInPeriod =
            periodMode === 'month'
              ? new Date(selY, selM, 0).getDate()
              : new Date(selectedYear, 1, 29).getMonth() === 1
              ? 366
              : 365
          const daysPassed = isCurrentPeriod
            ? periodMode === 'month'
              ? now.getDate()
              : Math.floor(
                  (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
                    Date.UTC(now.getFullYear(), 0, 1)) /
                    86400000
                ) + 1
            : daysInPeriod
          const dailyAvg = daysPassed > 0 ? selTotal / daysPassed : 0
          const projection = isCurrentPeriod ? dailyAvg * daysInPeriod : null

          setInsights({
            selTotal,
            prevTotal,
            totalChangePct,
            dailyAvg,
            projection,
            topCategoryChanges,
            isCurrentMonth: isCurrentPeriod,
            daysPassed,
            daysInMonth: daysInPeriod,
          })
        }
      } catch (error) {
        console.error('통계 조회 실패:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [supabase, selectedMonth, selectedYear, periodMode, refetchTick])

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  })
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i)

  if (isLoading) {
    return <AppLoading />
  }

  const fmt = (n: number) => Math.round(n).toLocaleString()
  const periodLabel =
    periodMode === 'month'
      ? `${selectedMonth.split('-')[0]}년 ${Number(selectedMonth.split('-')[1])}월`
      : periodMode === 'year'
      ? `${selectedYear}년`
      : '전체 기간'
  const transactionCategoryOptions = Array.from(
    new Set(transactionList.map(t => t.categories?.name || '기타'))
  ).sort()
  const transactionMemberOptions = Array.from(
    new Map(transactionList.map(t => [t.user_id ?? 'shared', t.memberName])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]))
  const effectiveCategoryFilter = transactionCategoryOptions.includes(selectedCategoryFilter)
    ? selectedCategoryFilter
    : 'all'
  const effectiveMemberFilter = transactionMemberOptions.some(([id]) => id === selectedMemberFilter)
    ? selectedMemberFilter
    : 'all'
  const filteredTransactionList =
    transactionList.filter(t => {
      const matchesCategory =
        effectiveCategoryFilter === 'all' ||
        (t.categories?.name || '기타') === effectiveCategoryFilter
      const matchesMember =
        effectiveMemberFilter === 'all' || (t.user_id ?? 'shared') === effectiveMemberFilter
      return matchesCategory && matchesMember
    })
  const filteredIncomeTotal = filteredTransactionList
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + (t.amount || 0), 0)
  const filteredExpenseTotal = filteredTransactionList
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + (t.amount || 0), 0)
  const visibleTransactionList = filteredTransactionList.slice(0, visibleTransactionCount)
  const hasMoreTransactions = visibleTransactionCount < filteredTransactionList.length

  return (
    <div className="p-4 max-w-md mx-auto pb-24">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">통계</h1>

      <div className="mb-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {(['month', 'year', 'all'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setPeriodMode(mode)
                setVisibleTransactionCount(TRANSACTION_PAGE_SIZE)
              }}
              className={`py-2 rounded-lg text-sm font-medium border transition ${
                periodMode === mode
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {mode === 'month' ? '월' : mode === 'year' ? '년' : '전체'}
            </button>
          ))}
        </div>

        {periodMode === 'month' && (
          <select
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value)
              setVisibleTransactionCount(TRANSACTION_PAGE_SIZE)
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            {months.map(m => (
              <option key={m} value={m}>
                {m.split('-')[0]}년 {Number(m.split('-')[1])}월
              </option>
            ))}
          </select>
        )}

        {periodMode === 'year' && (
          <select
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(Number(e.target.value))
              setVisibleTransactionCount(TRANSACTION_PAGE_SIZE)
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            {years.map(y => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-3 mb-6">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg p-4">
          <p className="text-sm opacity-80">잔액</p>
          <p className="text-3xl font-bold mt-2">
            {monthlySummary.balance.toLocaleString()}원
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">지출</p>
            <p className="text-lg font-bold text-red-600 mt-1">
              -{monthlySummary.expense.toLocaleString()}원
            </p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">수입</p>
            <p className="text-lg font-bold text-green-600 mt-1">
              +{monthlySummary.income.toLocaleString()}원
            </p>
          </div>
        </div>
      </div>

      {/* 인사이트 */}
      {insights && insights.selTotal > 0 && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6 space-y-3">
          <h2 className="font-bold text-gray-900">💡 {periodLabel} 인사이트</h2>

          {/* 지난달 대비 변화 */}
          {insights.totalChangePct !== null && (
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-700">이전 기간 대비</span>
              <span
                className={`text-sm font-bold ${
                  insights.totalChangePct > 0
                    ? 'text-red-600'
                    : insights.totalChangePct < 0
                    ? 'text-green-600'
                    : 'text-gray-600'
                }`}
              >
                {insights.totalChangePct > 0 ? '▲' : insights.totalChangePct < 0 ? '▼' : '='}{' '}
                {Math.abs(insights.totalChangePct).toFixed(0)}%
                <span className="text-gray-500 font-normal ml-2">
                  ({fmt(insights.selTotal - insights.prevTotal)}원)
                </span>
              </span>
            </div>
          )}

          {/* 일 평균 + 예상 */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-700">
              일 평균 지출{' '}
              <span className="text-xs text-gray-400">
                ({insights.daysPassed}일)
              </span>
            </span>
            <span className="text-sm font-bold text-gray-900">{fmt(insights.dailyAvg)}원</span>
          </div>

          {insights.projection !== null && (
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-700">
                {periodMode === 'month' ? '월말 예상 지출' : '연말 예상 지출'}
              </span>
              <span className="text-sm font-bold text-indigo-600">
                {fmt(insights.projection)}원
              </span>
            </div>
          )}

          {/* 카테고리 변화 Top 3 */}
          {insights.topCategoryChanges.length > 0 && (
            <div className="pt-1">
              <p className="text-xs text-gray-500 mb-2">카테고리 변화 (지난달 대비)</p>
              <div className="space-y-1">
                {insights.topCategoryChanges.map(c => (
                  <div key={c.name} className="flex items-center justify-between text-sm">
                    <span className="text-gray-900">{c.name}</span>
                    <span
                      className={`font-medium ${
                        c.diffPct === Infinity
                          ? 'text-red-600'
                          : c.diffPct > 0
                          ? 'text-red-600'
                          : c.diffPct < 0
                          ? 'text-green-600'
                          : 'text-gray-600'
                      }`}
                    >
                      {c.diffPct === Infinity
                        ? '신규'
                        : c.sel === 0
                        ? '없음'
                        : `${c.diffPct > 0 ? '▲' : '▼'} ${Math.abs(c.diffPct).toFixed(0)}%`}
                      <span className="text-gray-400 font-normal ml-2 text-xs">
                        {fmt(c.sel)}원
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 멤버별 지출 */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">멤버별 지출 ({periodLabel})</h2>
        {memberData.length > 0 ? (
          <div className="space-y-4">
            {memberData.map((member, idx) => (
              <div key={member.userId}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: MEMBER_COLORS[idx % MEMBER_COLORS.length] }}
                    />
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {member.name}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">
                      {member.value.toLocaleString()}원
                    </p>
                    <p className="text-xs text-gray-500">
                      {member.percent.toFixed(0)}%
                    </p>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${Math.max(member.percent, 3)}%`,
                      backgroundColor: MEMBER_COLORS[idx % MEMBER_COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">이 기간 멤버별 지출이 없습니다</p>
        )}
      </div>

      {/* 카테고리별 지출 */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">카테고리별 지출 ({periodLabel})</h2>
        {categoryData.length > 0 ? (
          <div className="space-y-2">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: unknown) => `${Number(value).toLocaleString()}원`} />
              </PieChart>
            </ResponsiveContainer>

            <div className="mt-4 space-y-2">
              {categoryData.map((cat, idx) => (
                <div key={cat.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    />
                    <span className="text-sm text-gray-900">{cat.name}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {cat.value.toLocaleString()}원
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">이 기간 지출이 없습니다</p>
        )}
      </div>

      {/* 월별 수입/지출 차트 */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">월별 수입/지출</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={chartData}
              margin={{ top: 16, right: 8, left: -16, bottom: 0 }}
              barCategoryGap="25%"
            >
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.65} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.65} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickFormatter={(v: number) =>
                  v >= 100000000
                    ? `${(v / 100000000).toFixed(1).replace(/\.0$/, '')}억`
                    : v >= 10000
                    ? `${(v / 10000).toFixed(0)}만`
                    : `${v}`
                }
              />
              <Tooltip
                cursor={{ fill: 'rgba(99,102,241,0.05)' }}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  fontSize: 13,
                }}
                formatter={(value) => `${Number(value).toLocaleString()}원`}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ paddingTop: 8, fontSize: 13 }}
              />
              <Bar
                dataKey="수입"
                fill="url(#incomeGrad)"
                radius={[6, 6, 0, 0]}
                maxBarSize={32}
              />
              <Bar
                dataKey="지출"
                fill="url(#expenseGrad)"
                radius={[6, 6, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-center py-8">데이터가 없습니다</p>
        )}
      </div>

      {/* 거래내역 */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">거래내역 ({periodLabel})</h2>
        {transactionList.length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                <p className="text-[11px] text-gray-500">총 지출</p>
                <p className="text-sm font-bold text-red-600 mt-0.5">
                  -{filteredExpenseTotal.toLocaleString()}원
                </p>
              </div>
              <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2">
                <p className="text-[11px] text-gray-500">총 수입</p>
                <p className="text-sm font-bold text-green-600 mt-0.5">
                  +{filteredIncomeTotal.toLocaleString()}원
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  카테고리
                </label>
                <select
                  value={effectiveCategoryFilter}
                  onChange={(e) => {
                    setSelectedCategoryFilter(e.target.value)
                    setVisibleTransactionCount(TRANSACTION_PAGE_SIZE)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">전체</option>
                  {transactionCategoryOptions.map(category => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  멤버
                </label>
                <select
                  value={effectiveMemberFilter}
                  onChange={(e) => {
                    setSelectedMemberFilter(e.target.value)
                    setVisibleTransactionCount(TRANSACTION_PAGE_SIZE)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">전체</option>
                  {transactionMemberOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredTransactionList.length === 0 ? (
              <p className="text-gray-500 text-center py-8">선택한 필터의 거래내역이 없습니다</p>
            ) : (
              <>
                <p className="text-xs text-gray-500">
                  전체 {filteredTransactionList.length.toLocaleString()}건 중{' '}
                  {visibleTransactionList.length.toLocaleString()}건 표시
                </p>
                {visibleTransactionList.map(trans => (
                  <button
                    key={trans.id}
                    type="button"
                    onClick={() => {
                      if (trans.isRecurring) {
                        const rule = recurringRules.find(r => r.id === trans.recurringRuleId)
                        if (rule) setEditingRule(rule)
                        return
                      }
                      setEditing(trans)
                    }}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      trans.isRecurring
                        ? 'bg-white border-gray-100 opacity-70 hover:bg-gray-50'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    } w-full text-left transition`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {trans.isRecurring && <span title="매월 반복">🔁 </span>}
                        {trans.categories?.icon} {trans.categories?.name || '기타'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {trans.memberName} · {trans.date}
                      </p>
                      {trans.memo && (
                        <p className="text-xs text-gray-600 mt-1 truncate">{trans.memo}</p>
                      )}
                    </div>
                    <p
                      className={`text-right font-bold whitespace-nowrap ml-4 ${
                        trans.type === 'income' ? 'text-green-600' : 'text-gray-900'
                      }`}
                    >
                      {trans.type === 'income' ? '+' : '-'}
                      {trans.amount.toLocaleString()}원
                    </p>
                  </button>
                ))}
                {hasMoreTransactions && (
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleTransactionCount(count => count + TRANSACTION_PAGE_SIZE)
                    }
                    className="w-full py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    더 보기
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">이 기간 거래내역이 없습니다</p>
        )}
      </div>

      {editing && (
        <EditTransactionModal
          transaction={editing}
          categories={categories}
          memberOptions={memberOptions}
          supabase={supabase}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setRefetchTick(t => t + 1)
          }}
        />
      )}

      {editingRule && (
        <EditRecurringRuleModal
          rule={editingRule}
          categories={categories}
          memberOptions={memberOptions}
          supabase={supabase}
          onClose={() => setEditingRule(null)}
          onSaved={() => {
            setEditingRule(null)
            setRefetchTick(t => t + 1)
          }}
        />
      )}
    </div>
  )
}
