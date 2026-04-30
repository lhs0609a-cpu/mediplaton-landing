-- =============================================
-- 가맹점 모집 테이블 마이그레이션
-- =============================================
-- 본사 직속 가맹점(영업 사업체) 신청 접수용 테이블.
-- partner_inquiries(개인 영업자 추천)와 분리.
-- =============================================

CREATE TABLE IF NOT EXISTS agency_inquiries (
    id BIGSERIAL PRIMARY KEY,

    -- 대표자 정보
    name VARCHAR(100) NOT NULL,                -- 대표자 성함
    phone VARCHAR(20) NOT NULL,                -- 대표 연락처
    email VARCHAR(150),                        -- 이메일 (선택)

    -- 사업자 정보
    company_name VARCHAR(200),                 -- 상호 (사업자등록증상)
    business_number VARCHAR(20),               -- 사업자등록번호
    business_type VARCHAR(80),                 -- 현재 영업 분야
    years_in_business VARCHAR(20),             -- 사업 경력 (1년 미만/1-3년/3-5년/5-10년/10년+)

    -- 영업 역량
    desired_region VARCHAR(100),               -- 희망 영업 권역
    team_size VARCHAR(30),                     -- 영업조직 인원 (1인/2-5/6-10/10+)
    monthly_capacity VARCHAR(30),              -- 예상 월 매칭 건수 (5-10/10-30/30-50/50+)
    sales_experience VARCHAR(30),              -- 금융영업 경력 (없음/1년/3년+/5년+)

    -- 일정·유입
    preferred_time VARCHAR(20),                -- 상담 가능 시간
    inflow_channel VARCHAR(50),                -- 유입 경로
    message TEXT,                              -- 자유 문의

    -- 관리
    status VARCHAR(20) DEFAULT 'new',          -- new / contacted / in_review / contracted / rejected
    admin_notes TEXT,
    source_page VARCHAR(50) DEFAULT 'agency',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_inquiries_status ON agency_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_agency_inquiries_created_at ON agency_inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agency_inquiries_phone ON agency_inquiries(phone);

ALTER TABLE agency_inquiries ENABLE ROW LEVEL SECURITY;

-- 누구나 INSERT 가능 (모집 폼 제출용)
DROP POLICY IF EXISTS "Anyone can insert agency_inquiries" ON agency_inquiries;
CREATE POLICY "Anyone can insert agency_inquiries"
    ON agency_inquiries FOR INSERT
    WITH CHECK (true);

-- 관리자만 SELECT/UPDATE/DELETE
DROP POLICY IF EXISTS "Admin can select agency_inquiries" ON agency_inquiries;
CREATE POLICY "Admin can select agency_inquiries"
    ON agency_inquiries FOR SELECT
    USING (auth.role() = 'authenticated' AND is_admin());

DROP POLICY IF EXISTS "Admin can update agency_inquiries" ON agency_inquiries;
CREATE POLICY "Admin can update agency_inquiries"
    ON agency_inquiries FOR UPDATE
    USING (auth.role() = 'authenticated' AND is_admin());

DROP POLICY IF EXISTS "Admin can delete agency_inquiries" ON agency_inquiries;
CREATE POLICY "Admin can delete agency_inquiries"
    ON agency_inquiries FOR DELETE
    USING (auth.role() = 'authenticated' AND is_admin());

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_agency_inquiries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agency_inquiries_updated_at ON agency_inquiries;
CREATE TRIGGER trg_agency_inquiries_updated_at
    BEFORE UPDATE ON agency_inquiries
    FOR EACH ROW
    EXECUTE FUNCTION update_agency_inquiries_updated_at();
