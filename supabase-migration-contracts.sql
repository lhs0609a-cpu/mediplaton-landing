-- =====================================================
-- 파트너 제휴 계약서 관리 - Supabase Migration
-- =====================================================

-- 1. partner_contracts 테이블
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
        CHECK (status IN ('draft','sent','signed','active','expired','terminated')),
    terminated_at TIMESTAMPTZ,
    terminated_by UUID,
    termination_reason TEXT,
    admin_notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_contracts_partner_id ON partner_contracts(partner_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON partner_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON partner_contracts(end_date);

-- 2. contract_status_logs 테이블 (이력)
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

-- 3. 계약번호 자동 채번 함수
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

-- 4. 만료 계약 자동 처리 함수
CREATE OR REPLACE FUNCTION check_expired_contracts()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    WITH expired AS (
        UPDATE partner_contracts
        SET status = 'expired',
            updated_at = now()
        WHERE status = 'active'
          AND end_date < CURRENT_DATE
        RETURNING id
    )
    SELECT COUNT(*) INTO expired_count FROM expired;

    -- 만료된 계약에 대해 상태 로그 기록
    INSERT INTO contract_status_logs (contract_id, from_status, to_status, notes)
    SELECT id, 'active', 'expired', '계약 만료일 경과로 자동 처리'
    FROM partner_contracts
    WHERE status = 'expired'
      AND updated_at >= now() - INTERVAL '1 minute';

    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- 5. updated_at 자동 갱신 트리거
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

-- 6. RLS 정책
ALTER TABLE partner_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_status_logs ENABLE ROW LEVEL SECURITY;

-- partner_contracts: 인증된 사용자 전체 접근 (관리자 페이지 전용)
CREATE POLICY "Allow authenticated full access on partner_contracts"
    ON partner_contracts
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- contract_status_logs: 인증된 사용자 전체 접근
CREATE POLICY "Allow authenticated full access on contract_status_logs"
    ON contract_status_logs
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
