-- ============================================================
-- 메디플라톤 무료 마케팅 신청 테이블
-- ============================================================
-- 사용법: Supabase Dashboard > SQL Editor에서 실행

-- 마케팅 신청 테이블
CREATE TABLE IF NOT EXISTS marketing_inquiries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    business_type TEXT NOT NULL,
    clinic_size TEXT NOT NULL,
    interests TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'in_progress', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_marketing_inquiries_status ON marketing_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_marketing_inquiries_created ON marketing_inquiries(created_at DESC);

-- RLS 활성화
ALTER TABLE marketing_inquiries ENABLE ROW LEVEL SECURITY;

-- 누구나 INSERT 가능 (폼 제출)
CREATE POLICY "Anyone can insert marketing inquiries"
    ON marketing_inquiries
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- 인증된 관리자만 SELECT 가능
CREATE POLICY "Authenticated users can view marketing inquiries"
    ON marketing_inquiries
    FOR SELECT
    TO authenticated
    USING (true);

-- 인증된 관리자만 UPDATE 가능
CREATE POLICY "Authenticated users can update marketing inquiries"
    ON marketing_inquiries
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_marketing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_marketing_updated_at
    BEFORE UPDATE ON marketing_inquiries
    FOR EACH ROW
    EXECUTE FUNCTION update_marketing_updated_at();
