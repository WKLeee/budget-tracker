# 가계부 웹앱 - SQL 설정

## ✅ 완료된 항목
- [x] Supabase 프로젝트 생성 (WKLeee's Project)
- [x] 환경변수 설정 (.env.local)
- [ ] **SQL 스크립트 실행** ← 지금 해야 할 것!

---

## 🔧 SQL 스크립트 실행 (3분)

### 1단계: Supabase 대시보드 열기
1. [https://supabase.com](https://supabase.com) 접속
2. **WKLeee's Project** 클릭
3. 왼쪽 메뉴에서 **SQL Editor** 클릭

### 2단계: SQL 코드 복붙

아래 **전체 코드를 복사**하여 Supabase SQL Editor에 붙여넣으세요:

```sql
-- Create tables
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(household_id, user_id)
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT '💰',
  is_default BOOLEAN DEFAULT false
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  memo TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  month TEXT NOT NULL,
  UNIQUE(household_id, category_id, month)
);

-- Enable RLS
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "households_access" ON households
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = households.id
      AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "household_members_access" ON household_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM household_members hm2
      WHERE hm2.household_id = household_members.household_id
      AND hm2.user_id = auth.uid()
    )
  );

CREATE POLICY "categories_access" ON categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = categories.household_id
      AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "transactions_access" ON transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = transactions.household_id
      AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "budgets_access" ON budgets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = budgets.household_id
      AND household_members.user_id = auth.uid()
    )
  );

-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_access" ON profiles
  FOR ALL USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.user_id = profiles.id
      AND EXISTS (
        SELECT 1 FROM household_members hm2
        WHERE hm2.household_id = household_members.household_id
        AND hm2.user_id = auth.uid()
      )
    )
  );

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 3단계: 실행
1. SQL을 모두 붙여넣으면 SQL Editor의 **RUN** 버튼을 클릭
2. 완료될 때까지 대기 (20초 정도)
3. ✅ 에러 없이 완료되면 성공!

---

## 🚀 앱 테스트

터미널에서:
```bash
cd C:\Users\User\budgetTracker
npm run dev -- -p 3003
```

브라우저: **http://localhost:3003**

### 테스트 순서:
1. ✍️ **회원가입** - 이메일/비밀번호
2. ✍️ **로그인**
3. ⚙️ **설정** → "새 가계부 생성" → 이름 입력 (예: "철수 & 영희")
4. ➕ **추가** → 거래 입력 (금액, 카테고리, 날짜)
5. 🏠 **홈** → 대시보드 확인
6. 📊 **통계** → 차트 확인

---

## 📌 도움말

**에러가 나면:**
1. Supabase 대시보드의 **Logs** 탭 확인
2. 또는 `SELECT * FROM households;` 실행해서 테이블 생성 확인

**초대코드 공유:**
1. ⚙️ 설정 → "초대코드" 복사
2. 연인/가족에게 카톡/메일로 전달
3. 상대방이 ⚙️ 설정 → "초대코드로 참여" → 입력

---

SQL 실행 후 앱 테스트해보세요! 🚀
