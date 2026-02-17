-- ============================================================
-- 전체 문의 통합 조회 마이그레이션
-- Supabase SQL Editor에서 이 파일 전체를 복사하여 실행하세요
-- ============================================================

-- 1. 기존 테이블에 source_page 컬럼 추가
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS source_page TEXT DEFAULT 'website';
ALTER TABLE marketing_inquiries ADD COLUMN IF NOT EXISTS source_page TEXT DEFAULT 'marketing';

-- 2. partner_inquiries 테이블 생성
CREATE TABLE IF NOT EXISTS partner_inquiries (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  occupation TEXT,
  expected_leads TEXT,
  source_page TEXT DEFAULT 'partner',
  status TEXT DEFAULT 'new',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE partner_inquiries ENABLE ROW LEVEL SECURITY;

-- 3. promo_inquiries 테이블 생성
CREATE TABLE IF NOT EXISTS promo_inquiries (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  business_type TEXT,
  monthly_sales TEXT,
  source_page TEXT DEFAULT 'promo',
  status TEXT DEFAULT 'new',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE promo_inquiries ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책: 관리자 전체 접근
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access partner_inquiries') THEN
    CREATE POLICY "Admin full access partner_inquiries" ON partner_inquiries
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access promo_inquiries') THEN
    CREATE POLICY "Admin full access promo_inquiries" ON promo_inquiries
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 5. RLS 정책: 익명 삽입 (폼 제출용)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon insert partner_inquiries') THEN
    CREATE POLICY "Anon insert partner_inquiries" ON partner_inquiries
      FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon insert promo_inquiries') THEN
    CREATE POLICY "Anon insert promo_inquiries" ON promo_inquiries
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 6. consultations 테이블에도 익명 삽입 정책 확인 (consultForm용)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon insert consultations' AND tablename = 'consultations') THEN
    CREATE POLICY "Anon insert consultations" ON consultations
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 완료 확인
SELECT 'partner_inquiries' AS table_name, count(*) AS row_count FROM partner_inquiries
UNION ALL
SELECT 'promo_inquiries', count(*) FROM promo_inquiries
UNION ALL
SELECT 'consultations', count(*) FROM consultations
UNION ALL
SELECT 'marketing_inquiries', count(*) FROM marketing_inquiries;
