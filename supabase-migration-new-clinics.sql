-- =====================================================
-- 신규 개원 의료기관 DB - Supabase Migration
-- =====================================================

-- 1. new_clinic_openings 테이블
CREATE TABLE IF NOT EXISTS new_clinic_openings (
    id BIGSERIAL PRIMARY KEY,
    clinic_name VARCHAR(200) NOT NULL,
    representative_name VARCHAR(100),
    specialty VARCHAR(100),
    address TEXT,
    region VARCHAR(20),
    opening_date DATE,
    phone VARCHAR(30),
    data_source VARCHAR(50) NOT NULL DEFAULT 'manual',
    hira_ykiho VARCHAR(20) UNIQUE,
    claimed_by BIGINT REFERENCES partners(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    claim_status VARCHAR(20) NOT NULL DEFAULT 'unclaimed'
        CHECK (claim_status IN ('unclaimed','claimed','contacted','converted')),
    notes TEXT,
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_new_clinics_region ON new_clinic_openings(region);
CREATE INDEX IF NOT EXISTS idx_new_clinics_specialty ON new_clinic_openings(specialty);
CREATE INDEX IF NOT EXISTS idx_new_clinics_opening_date ON new_clinic_openings(opening_date);
CREATE INDEX IF NOT EXISTS idx_new_clinics_claim_status ON new_clinic_openings(claim_status);
CREATE INDEX IF NOT EXISTS idx_new_clinics_claimed_by ON new_clinic_openings(claimed_by);
CREATE INDEX IF NOT EXISTS idx_new_clinics_hira_ykiho ON new_clinic_openings(hira_ykiho);

-- 3. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_new_clinics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_new_clinics_updated_at ON new_clinic_openings;
CREATE TRIGGER trigger_new_clinics_updated_at
    BEFORE UPDATE ON new_clinic_openings
    FOR EACH ROW
    EXECUTE FUNCTION update_new_clinics_updated_at();

-- 4. RLS 정책
ALTER TABLE new_clinic_openings ENABLE ROW LEVEL SECURITY;

-- Admin: 모든 CRUD 가능 (partners 테이블에 레코드가 없는 인증 사용자 = 관리자)
CREATE POLICY "Admin full access on new_clinic_openings"
    ON new_clinic_openings
    FOR ALL
    TO authenticated
    USING (
        NOT EXISTS (
            SELECT 1 FROM partners WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        NOT EXISTS (
            SELECT 1 FROM partners WHERE user_id = auth.uid()
        )
    );

-- Partner SELECT: 전체 열람 가능
CREATE POLICY "Partner select on new_clinic_openings"
    ON new_clinic_openings
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM partners WHERE user_id = auth.uid() AND status = 'approved'
        )
    );

-- Partner UPDATE: claim 관련 필드만, unclaimed이거나 본인이 claimed한 건만
CREATE POLICY "Partner update claim on new_clinic_openings"
    ON new_clinic_openings
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM partners WHERE user_id = auth.uid() AND status = 'approved'
        )
        AND (
            claim_status = 'unclaimed'
            OR claimed_by = (SELECT id FROM partners WHERE user_id = auth.uid() LIMIT 1)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM partners WHERE user_id = auth.uid() AND status = 'approved'
        )
    );

-- 5. Realtime 활성화 (Supabase 대시보드에서도 설정 가능)
ALTER PUBLICATION supabase_realtime ADD TABLE new_clinic_openings;

-- =====================================================
-- 6. HIRA 동기화 로그 테이블
-- =====================================================
CREATE TABLE IF NOT EXISTS hira_sync_logs (
    id BIGSERIAL PRIMARY KEY,
    sync_type VARCHAR(20) NOT NULL DEFAULT 'auto',
    inserted_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    duration_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: service_role만 INSERT, 관리자만 SELECT
ALTER TABLE hira_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select on hira_sync_logs"
    ON hira_sync_logs
    FOR SELECT
    TO authenticated
    USING (
        NOT EXISTS (
            SELECT 1 FROM partners WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Service role insert on hira_sync_logs"
    ON hira_sync_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);
