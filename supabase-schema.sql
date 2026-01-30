-- =============================================
-- 메디플라톤 Supabase 데이터베이스 스키마
-- =============================================
-- 사용법:
-- 1. Supabase Dashboard → SQL Editor
-- 2. 이 파일 내용 전체 복사 후 실행
-- =============================================

-- 상담 신청 테이블
CREATE TABLE IF NOT EXISTS consultations (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    business VARCHAR(50),
    revenue VARCHAR(50),
    region VARCHAR(50),
    product VARCHAR(50),
    message TEXT,
    status VARCHAR(20) DEFAULT 'new',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 파트너 신청 테이블
CREATE TABLE IF NOT EXISTS partners (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    hospital_name VARCHAR(200),
    business VARCHAR(50),
    region VARCHAR(50),
    revenue VARCHAR(50),
    message TEXT,
    status VARCHAR(20) DEFAULT 'new',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);
CREATE INDEX IF NOT EXISTS idx_consultations_created_at ON consultations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_phone ON consultations(phone);

CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(status);
CREATE INDEX IF NOT EXISTS idx_partners_created_at ON partners(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partners_phone ON partners(phone);

-- Row Level Security (RLS) 활성화
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

-- 정책: 누구나 INSERT 가능 (폼 제출용)
CREATE POLICY "Anyone can insert consultations"
    ON consultations FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Anyone can insert partners"
    ON partners FOR INSERT
    WITH CHECK (true);

-- 정책: 인증된 사용자만 SELECT/UPDATE/DELETE 가능 (관리자용)
CREATE POLICY "Authenticated users can select consultations"
    ON consultations FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update consultations"
    ON consultations FOR UPDATE
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete consultations"
    ON consultations FOR DELETE
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can select partners"
    ON partners FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update partners"
    ON partners FOR UPDATE
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete partners"
    ON partners FOR DELETE
    USING (auth.role() = 'authenticated');

-- =============================================
-- 설정 완료 후 해야 할 일:
-- =============================================
-- 1. Supabase Dashboard → Authentication → Users
--    → "Add User" 버튼으로 관리자 계정 생성
--    예: admin@mediplaton.co.kr / 안전한비밀번호
--
-- 2. config.js 파일에 Supabase URL과 API Key 입력
--    → Project Settings → API 에서 확인
--
-- 3. (선택) 이메일 알림 설정
--    → Database → Webhooks 또는 Edge Functions 활용
-- =============================================
