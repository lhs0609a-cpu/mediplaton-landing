-- =============================================
-- 파트너 대시보드 마이그레이션
-- =============================================
-- Supabase Dashboard → SQL Editor → New Query
-- 이 파일 전체를 복사하여 실행하세요.
-- 기존 데이터를 삭제하지 않습니다.
-- =============================================


-- ─────────────────────────────────────────────
-- 1. 기존 테이블에 컬럼 추가
-- ─────────────────────────────────────────────

-- partners 테이블
ALTER TABLE partners ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,4) DEFAULT 0.015;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS email VARCHAR(200);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS bank_name VARCHAR(50);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50);

-- consultations 테이블
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS partner_id BIGINT REFERENCES partners(id);
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS pipeline_status VARCHAR(30) DEFAULT 'received';
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS transaction_amount DECIMAL(15,0);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_partners_user_id ON partners(user_id);
CREATE INDEX IF NOT EXISTS idx_consultations_partner_id ON consultations(partner_id);
CREATE INDEX IF NOT EXISTS idx_consultations_pipeline_status ON consultations(pipeline_status);


-- ─────────────────────────────────────────────
-- 2. 신규 테이블 생성
-- ─────────────────────────────────────────────

-- 정산 테이블
CREATE TABLE IF NOT EXISTS settlements (
    id BIGSERIAL PRIMARY KEY,
    partner_id BIGINT NOT NULL REFERENCES partners(id),
    consultation_id BIGINT REFERENCES consultations(id),
    month VARCHAR(7) NOT NULL,
    client_name VARCHAR(100),
    transaction_amount DECIMAL(15,0),
    commission_rate DECIMAL(5,4),
    commission_amount DECIMAL(15,0),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlements_partner_id ON settlements(partner_id);
CREATE INDEX IF NOT EXISTS idx_settlements_month ON settlements(month);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);

-- 공지사항 테이블
CREATE TABLE IF NOT EXISTS notices (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────
-- 3. RLS 헬퍼 함수
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_partner_id()
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT id FROM partners WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM partners WHERE user_id = auth.uid()
    ) AND auth.uid() IS NOT NULL
$$;


-- ─────────────────────────────────────────────
-- 4. RLS 정책 업데이트
-- ─────────────────────────────────────────────

-- === consultations ===
-- 기존 SELECT/UPDATE/DELETE 정책 삭제 (INSERT는 유지 - 공개 폼 제출용)
DROP POLICY IF EXISTS "Authenticated users can select consultations" ON consultations;
DROP POLICY IF EXISTS "Authenticated users can update consultations" ON consultations;
DROP POLICY IF EXISTS "Authenticated users can delete consultations" ON consultations;

-- Admin 정책
CREATE POLICY "Admin can select all consultations"
    ON consultations FOR SELECT
    USING (auth.role() = 'authenticated' AND is_admin());

CREATE POLICY "Admin can update all consultations"
    ON consultations FOR UPDATE
    USING (auth.role() = 'authenticated' AND is_admin());

CREATE POLICY "Admin can delete all consultations"
    ON consultations FOR DELETE
    USING (auth.role() = 'authenticated' AND is_admin());

-- Partner 정책
CREATE POLICY "Partner can select own consultations"
    ON consultations FOR SELECT
    USING (auth.role() = 'authenticated' AND partner_id = get_my_partner_id());

CREATE POLICY "Partner can insert own consultations"
    ON consultations FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        AND partner_id = get_my_partner_id()
    );

-- === partners ===
DROP POLICY IF EXISTS "Authenticated users can select partners" ON partners;
DROP POLICY IF EXISTS "Authenticated users can update partners" ON partners;
DROP POLICY IF EXISTS "Authenticated users can delete partners" ON partners;

CREATE POLICY "Admin can select all partners"
    ON partners FOR SELECT
    USING (auth.role() = 'authenticated' AND is_admin());

CREATE POLICY "Admin can update all partners"
    ON partners FOR UPDATE
    USING (auth.role() = 'authenticated' AND is_admin());

CREATE POLICY "Admin can delete all partners"
    ON partners FOR DELETE
    USING (auth.role() = 'authenticated' AND is_admin());

CREATE POLICY "Partner can select own record"
    ON partners FOR SELECT
    USING (auth.role() = 'authenticated' AND user_id = auth.uid());

-- === settlements ===
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on settlements"
    ON settlements FOR ALL
    USING (auth.role() = 'authenticated' AND is_admin())
    WITH CHECK (auth.role() = 'authenticated' AND is_admin());

CREATE POLICY "Partner can select own settlements"
    ON settlements FOR SELECT
    USING (auth.role() = 'authenticated' AND partner_id = get_my_partner_id());

-- === notices ===
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select notices"
    ON notices FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage notices"
    ON notices FOR ALL
    USING (auth.role() = 'authenticated' AND is_admin())
    WITH CHECK (auth.role() = 'authenticated' AND is_admin());


-- ─────────────────────────────────────────────
-- 완료!
-- ─────────────────────────────────────────────
-- 다음 단계:
-- 1. Authentication → Users에서 파트너용 계정 생성
-- 2. admin.html에서 파트너 상세 → "계정 연결" 버튼으로 UUID 연결
-- 3. partner-dashboard.html에서 로그인 테스트
-- ─────────────────────────────────────────────
