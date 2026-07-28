-- =====================================================
-- 누락 테이블 통합 마이그레이션
-- =====================================================
-- 실행 방법: Supabase Dashboard → SQL Editor → New Query
-- 이 파일 전체를 복사하여 붙여넣기 → Run 클릭
--
-- IF NOT EXISTS를 사용하므로 이미 있는 테이블은 건너뜁니다.
-- 안전하게 여러 번 실행 가능합니다.
-- =====================================================


-- =====================================================
-- PART 1: partner_contracts (파트너 제휴 계약서)
-- =====================================================

CREATE TABLE IF NOT EXISTS partner_contracts (
    id BIGSERIAL PRIMARY KEY,
    contract_number VARCHAR(20) UNIQUE NOT NULL,
    partner_id BIGINT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0150,
    contract_period_months INTEGER NOT NULL DEFAULT 12,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    auto_renewal BOOLEAN NOT NULL DEFAULT true,
    contract_body TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','sent','signed','active','expired','terminated','termination_requested')),
    terminated_at TIMESTAMPTZ,
    terminated_by UUID,
    termination_reason TEXT,
    admin_notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_partner_id ON partner_contracts(partner_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON partner_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON partner_contracts(end_date);

-- contract_status_logs (계약 상태 이력)
CREATE TABLE IF NOT EXISTS contract_status_logs (
    id BIGSERIAL PRIMARY KEY,
    contract_id BIGINT NOT NULL REFERENCES partner_contracts(id) ON DELETE CASCADE,
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,
    changed_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_logs_contract_id ON contract_status_logs(contract_id);

-- 계약번호 자동 채번 함수
CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS VARCHAR AS $$
DECLARE
    current_year TEXT;
    seq_num INTEGER;
    new_number VARCHAR;
BEGIN
    current_year := TO_CHAR(NOW(), 'YYYY');
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(contract_number FROM 'MPC-' || current_year || '-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM partner_contracts
    WHERE contract_number LIKE 'MPC-' || current_year || '-%';
    new_number := 'MPC-' || current_year || '-' || LPAD(seq_num::TEXT, 4, '0');
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- 만료 계약 자동 처리 함수
CREATE OR REPLACE FUNCTION check_expired_contracts()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    WITH expired AS (
        UPDATE partner_contracts
        SET status = 'expired', updated_at = now()
        WHERE status = 'active' AND end_date < CURRENT_DATE
        RETURNING id
    )
    SELECT COUNT(*) INTO expired_count FROM expired;

    INSERT INTO contract_status_logs (contract_id, from_status, to_status, notes)
    SELECT id, 'active', 'expired', '계약 만료일 경과로 자동 처리'
    FROM partner_contracts
    WHERE status = 'expired' AND updated_at >= now() - INTERVAL '1 minute';

    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_contracts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contracts_updated_at ON partner_contracts;
CREATE TRIGGER trigger_contracts_updated_at
    BEFORE UPDATE ON partner_contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_contracts_updated_at();

-- RLS
ALTER TABLE partner_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_status_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated full access on partner_contracts') THEN
        CREATE POLICY "Allow authenticated full access on partner_contracts"
            ON partner_contracts FOR ALL TO authenticated
            USING (true) WITH CHECK (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated full access on contract_status_logs') THEN
        CREATE POLICY "Allow authenticated full access on contract_status_logs"
            ON contract_status_logs FOR ALL TO authenticated
            USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 해지 신청 관련 컬럼
ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS termination_requested_at TIMESTAMPTZ;
ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS termination_requested_reason TEXT;
ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS termination_legal_acknowledged BOOLEAN DEFAULT false;

-- 서명 관련 컬럼
ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS signer_name VARCHAR(50);
ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS signature_data TEXT;


-- =====================================================
-- PART 2: board_posts / board_replies (게시판)
-- =====================================================

CREATE TABLE IF NOT EXISTS board_posts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id UUID REFERENCES auth.users(id),
    author_name TEXT NOT NULL,
    author_type TEXT NOT NULL CHECK (author_type IN ('admin', 'partner')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_answered BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS board_replies (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id BIGINT REFERENCES board_posts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    author_name TEXT DEFAULT '관리자',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE board_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_replies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_posts_read') THEN
        CREATE POLICY "board_posts_read" ON board_posts FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_posts_insert') THEN
        CREATE POLICY "board_posts_insert" ON board_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_posts_admin_delete') THEN
        CREATE POLICY "board_posts_admin_delete" ON board_posts FOR DELETE TO authenticated USING (is_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_replies_read') THEN
        CREATE POLICY "board_replies_read" ON board_replies FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_replies_admin_insert') THEN
        CREATE POLICY "board_replies_admin_insert" ON board_replies FOR INSERT TO authenticated WITH CHECK (is_admin());
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_replies_admin_delete') THEN
        CREATE POLICY "board_replies_admin_delete" ON board_replies FOR DELETE TO authenticated USING (is_admin());
    END IF;
END $$;


-- =====================================================
-- PART 3: new_clinic_openings (신규 개원 의료기관)
-- =====================================================

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

CREATE INDEX IF NOT EXISTS idx_new_clinics_region ON new_clinic_openings(region);
CREATE INDEX IF NOT EXISTS idx_new_clinics_specialty ON new_clinic_openings(specialty);
CREATE INDEX IF NOT EXISTS idx_new_clinics_opening_date ON new_clinic_openings(opening_date);
CREATE INDEX IF NOT EXISTS idx_new_clinics_claim_status ON new_clinic_openings(claim_status);
CREATE INDEX IF NOT EXISTS idx_new_clinics_claimed_by ON new_clinic_openings(claimed_by);
CREATE INDEX IF NOT EXISTS idx_new_clinics_hira_ykiho ON new_clinic_openings(hira_ykiho);

-- updated_at 트리거
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

-- RLS
ALTER TABLE new_clinic_openings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access on new_clinic_openings') THEN
        CREATE POLICY "Admin full access on new_clinic_openings"
            ON new_clinic_openings FOR ALL TO authenticated
            USING (NOT EXISTS (SELECT 1 FROM partners WHERE user_id = auth.uid()))
            WITH CHECK (NOT EXISTS (SELECT 1 FROM partners WHERE user_id = auth.uid()));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Partner select on new_clinic_openings') THEN
        CREATE POLICY "Partner select on new_clinic_openings"
            ON new_clinic_openings FOR SELECT TO authenticated
            USING (EXISTS (SELECT 1 FROM partners WHERE user_id = auth.uid() AND status = 'approved'));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Partner update claim on new_clinic_openings') THEN
        CREATE POLICY "Partner update claim on new_clinic_openings"
            ON new_clinic_openings FOR UPDATE TO authenticated
            USING (
                EXISTS (SELECT 1 FROM partners WHERE user_id = auth.uid() AND status = 'approved')
                AND (
                    claim_status = 'unclaimed'
                    OR claimed_by = (SELECT id FROM partners WHERE user_id = auth.uid() LIMIT 1)
                )
            )
            WITH CHECK (
                EXISTS (SELECT 1 FROM partners WHERE user_id = auth.uid() AND status = 'approved')
            );
    END IF;
END $$;

-- Realtime (에러 시 무시)
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE new_clinic_openings;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- =====================================================
-- PART 4: hira_sync_logs (HIRA 동기화 로그)
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

ALTER TABLE hira_sync_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin select on hira_sync_logs') THEN
        CREATE POLICY "Admin select on hira_sync_logs"
            ON hira_sync_logs FOR SELECT TO authenticated
            USING (NOT EXISTS (SELECT 1 FROM partners WHERE user_id = auth.uid()));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role insert on hira_sync_logs') THEN
        CREATE POLICY "Service role insert on hira_sync_logs"
            ON hira_sync_logs FOR INSERT TO authenticated
            WITH CHECK (true);
    END IF;
END $$;


-- =====================================================
-- 완료! 모든 누락 테이블이 생성되었습니다.
-- =====================================================
