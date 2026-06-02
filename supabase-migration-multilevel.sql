-- =====================================================================
-- 다단계(MLM) 파트너 구조 마이그레이션
-- =====================================================================
-- 목적:
--   1. partners 트리 구조 (parent_partner_id + materialized path)
--   2. 셀프 초대를 위한 referral_code
--   3. 상품/레벨별 수수료 정책 (commission_policies)
--   4. settlements 확장: originator/level/공급가/VAT/실지급
--   5. 계약 확정 시 다단계 자동 분배 트리거
--   6. RLS: 본인 + 본인 하위만 노출, 상위 정보·상위 수수료 차단
-- =====================================================================
-- 실행: Supabase Dashboard → SQL Editor → New Query → 전체 붙여넣기 → Run
-- 기존 데이터는 보존됩니다.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- 1. partners 테이블 확장
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE partners ADD COLUMN IF NOT EXISTS parent_partner_id BIGINT REFERENCES partners(id) ON DELETE SET NULL;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS referral_code VARCHAR(16) UNIQUE;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS depth INTEGER DEFAULT 0;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS path TEXT DEFAULT '';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS business_type VARCHAR(20) DEFAULT 'individual';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS tax_id VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_partners_parent ON partners(parent_partner_id);
CREATE INDEX IF NOT EXISTS idx_partners_path ON partners(path);
CREATE INDEX IF NOT EXISTS idx_partners_referral_code ON partners(referral_code);


-- ─────────────────────────────────────────────────────────────────────
-- 2. referral_code 자동 생성 + path/depth 자동 계산 트리거
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION gen_referral_code()
RETURNS VARCHAR LANGUAGE plpgsql AS $$
DECLARE
    code VARCHAR(8);
    attempts INTEGER := 0;
BEGIN
    LOOP
        code := upper(substring(md5(random()::text || clock_timestamp()::text), 1, 8));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM partners WHERE referral_code = code);
        attempts := attempts + 1;
        IF attempts > 10 THEN
            RAISE EXCEPTION 'Failed to generate unique referral code';
        END IF;
    END LOOP;
    RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION partners_set_tree_meta()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    parent_path TEXT;
    parent_depth INTEGER;
BEGIN
    IF NEW.referral_code IS NULL THEN
        NEW.referral_code := gen_referral_code();
    END IF;

    IF NEW.parent_partner_id IS NULL THEN
        NEW.depth := 0;
        NEW.path := '/' || NEW.id::text;
    ELSE
        SELECT path, depth INTO parent_path, parent_depth
        FROM partners WHERE id = NEW.parent_partner_id;
        IF parent_path IS NULL OR parent_path = '' THEN
            parent_path := '/' || NEW.parent_partner_id::text;
            parent_depth := 0;
        END IF;
        NEW.depth := parent_depth + 1;
        NEW.path := parent_path || '/' || NEW.id::text;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partners_set_tree_meta ON partners;
CREATE TRIGGER trg_partners_set_tree_meta
    BEFORE INSERT OR UPDATE OF parent_partner_id ON partners
    FOR EACH ROW EXECUTE FUNCTION partners_set_tree_meta();

-- BEFORE INSERT 시점에 id가 없으므로 AFTER INSERT 로 path 보정
CREATE OR REPLACE FUNCTION partners_fix_path_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.parent_partner_id IS NULL THEN
        UPDATE partners SET path = '/' || NEW.id::text WHERE id = NEW.id AND (path = '' OR path IS NULL OR path = '/');
    ELSE
        UPDATE partners
        SET path = (SELECT path FROM partners WHERE id = NEW.parent_partner_id) || '/' || NEW.id::text
        WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partners_fix_path_after_insert ON partners;
CREATE TRIGGER trg_partners_fix_path_after_insert
    AFTER INSERT ON partners
    FOR EACH ROW EXECUTE FUNCTION partners_fix_path_after_insert();

-- 기존 데이터의 referral_code/path/depth 채우기 (루트는 parent=null)
UPDATE partners SET referral_code = gen_referral_code() WHERE referral_code IS NULL;
UPDATE partners SET path = '/' || id::text, depth = 0 WHERE path IS NULL OR path = '';


-- ─────────────────────────────────────────────────────────────────────
-- 3. 수수료 정책 테이블 (상품별 × 레벨별)
-- ─────────────────────────────────────────────────────────────────────
-- product_category: 'pg', 'credit', 'rental', 'deposit', 'kb', 'purchase', 'consult', '*'(전체기본)
-- level: 1=originator(본인), 2=직속 상위, 3=그 위, ...
-- rate: 0.0150 = 1.5%

CREATE TABLE IF NOT EXISTS commission_policies (
    id BIGSERIAL PRIMARY KEY,
    product_category VARCHAR(50) NOT NULL DEFAULT '*',
    level INTEGER NOT NULL CHECK (level >= 1 AND level <= 10),
    rate DECIMAL(6,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
    label VARCHAR(100),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_category, level)
);

CREATE INDEX IF NOT EXISTS idx_policies_product_level ON commission_policies(product_category, level, active);

-- 기본 정책 시드 (필요시 관리자가 수정)
INSERT INTO commission_policies (product_category, level, rate, label) VALUES
    ('*', 1, 0.0150, '기본 - 본인'),
    ('*', 2, 0.0030, '기본 - 직속 상위'),
    ('*', 3, 0.0010, '기본 - 차상위')
ON CONFLICT (product_category, level) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────
-- 4. settlements 확장 (다단계 / 세금계산서)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE settlements ADD COLUMN IF NOT EXISTS originator_partner_id BIGINT REFERENCES partners(id);
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS supply_amount DECIMAL(15,0);
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(15,0) DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS total_payout DECIMAL(15,0);
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS tax_invoice_required BOOLEAN DEFAULT false;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS tax_invoice_issued BOOLEAN DEFAULT false;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS product_category VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_settlements_originator ON settlements(originator_partner_id);
CREATE INDEX IF NOT EXISTS idx_settlements_level ON settlements(level);


-- ─────────────────────────────────────────────────────────────────────
-- 5. consultations 확장: product_category (분배 정책 매칭용)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS product_category VARCHAR(50);


-- ─────────────────────────────────────────────────────────────────────
-- 6. 다단계 자동 분배 트리거
-- ─────────────────────────────────────────────────────────────────────
-- 발동 조건: consultations.pipeline_status 가 'contracted' (계약/성사) 로 바뀔 때
-- 동작:
--   1) NEW.partner_id 부터 parent 따라 올라가며 level 1, 2, 3 ... 생성
--   2) 정책 조회: 해당 상품 카테고리 우선, 없으면 '*' 기본
--   3) 사업자(business_type='corporate')면 VAT 10% 별도 산정

CREATE OR REPLACE FUNCTION distribute_commission()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    current_pid    BIGINT;
    current_level  INTEGER := 1;
    policy_rate    DECIMAL(6,4);
    commission     DECIMAL(15,0);
    vat            DECIMAL(15,0);
    p              RECORD;
    product        VARCHAR(50);
    cycle_guard    INTEGER := 0;
    settle_month   VARCHAR(7);
BEGIN
    -- 'contracted' 상태로 새로 진입할 때만
    IF NEW.pipeline_status IS DISTINCT FROM 'contracted' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.pipeline_status = 'contracted' THEN
        RETURN NEW;  -- 이미 분배됨, 중복 방지
    END IF;
    IF NEW.partner_id IS NULL OR NEW.transaction_amount IS NULL OR NEW.transaction_amount <= 0 THEN
        RETURN NEW;
    END IF;

    -- 기존 분배 기록이 있으면 스킵 (안전망)
    IF EXISTS (SELECT 1 FROM settlements WHERE consultation_id = NEW.id) THEN
        RETURN NEW;
    END IF;

    -- product_category 우선, 없으면 기존 product 컬럼, 그것도 없으면 '*'(폴백)
    product := COALESCE(NEW.product_category, NEW.product, '*');
    settle_month := to_char(COALESCE(NEW.updated_at, NOW()), 'YYYY-MM');
    current_pid := NEW.partner_id;

    WHILE current_pid IS NOT NULL AND cycle_guard < 15 LOOP
        SELECT id, parent_partner_id, business_type, commission_rate
          INTO p
          FROM partners WHERE id = current_pid;

        -- 정책 조회: 상품 매칭 우선, 없으면 '*' 폴백
        SELECT rate INTO policy_rate
          FROM commission_policies
         WHERE level = current_level
           AND active = true
           AND (product_category = product OR product_category = '*')
         ORDER BY (product_category = product) DESC, id ASC
         LIMIT 1;

        IF policy_rate IS NULL OR policy_rate <= 0 THEN
            -- 해당 레벨 정책 없음 → 더 올라가도 의미 없음
            EXIT;
        END IF;

        commission := round(NEW.transaction_amount * policy_rate);
        IF p.business_type = 'corporate' THEN
            vat := round(commission * 0.1);
        ELSE
            vat := 0;
        END IF;

        INSERT INTO settlements (
            partner_id, consultation_id, month, client_name,
            transaction_amount, commission_rate, commission_amount,
            originator_partner_id, level,
            supply_amount, vat_amount, total_payout,
            tax_invoice_required, product_category, status
        ) VALUES (
            current_pid, NEW.id, settle_month, NEW.name,
            NEW.transaction_amount, policy_rate, commission,
            NEW.partner_id, current_level,
            commission, vat, commission + vat,
            p.business_type = 'corporate', product, 'pending'
        );

        current_pid := p.parent_partner_id;
        current_level := current_level + 1;
        cycle_guard := cycle_guard + 1;
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_distribute_commission ON consultations;
CREATE TRIGGER trg_distribute_commission
    AFTER INSERT OR UPDATE OF pipeline_status ON consultations
    FOR EACH ROW EXECUTE FUNCTION distribute_commission();


-- ─────────────────────────────────────────────────────────────────────
-- 7. RLS 헬퍼: 내 하위(본인 포함) 여부 판정
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_in_my_downline(target_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (
        SELECT 1
          FROM partners me
          JOIN partners target ON (target.id = target_id)
         WHERE me.user_id = auth.uid()
           AND (target.id = me.id OR target.path LIKE me.path || '/%')
    );
$$;

CREATE OR REPLACE FUNCTION my_downline_ids()
RETURNS SETOF BIGINT LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT target.id
      FROM partners me
      JOIN partners target
        ON (target.id = me.id OR target.path LIKE me.path || '/%')
     WHERE me.user_id = auth.uid();
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 8. RLS 정책 갱신
-- ─────────────────────────────────────────────────────────────────────

-- === partners ===
DROP POLICY IF EXISTS "Partner can select own record" ON partners;
DROP POLICY IF EXISTS "Partner can select downline" ON partners;

CREATE POLICY "Partner can select downline"
    ON partners FOR SELECT
    USING (
        auth.role() = 'authenticated'
        AND (
            user_id = auth.uid()
            OR id IN (SELECT my_downline_ids())
        )
    );

-- 셀프 초대로 새 파트너가 본인 user_id 로 가입할 수 있도록 (parent_partner_id 자동 매핑은 트리거/RPC 에서 처리)
DROP POLICY IF EXISTS "Partner can insert downline" ON partners;
CREATE POLICY "Partner can insert downline"
    ON partners FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        AND user_id = auth.uid()
    );

-- 본인 정보(연락처/계좌 등) 수정 허용. parent_partner_id 변경은 admin 에서만.
DROP POLICY IF EXISTS "Partner can update own basic" ON partners;
CREATE POLICY "Partner can update own basic"
    ON partners FOR UPDATE
    USING (auth.role() = 'authenticated' AND user_id = auth.uid())
    WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

-- === consultations ===
DROP POLICY IF EXISTS "Partner can select own consultations" ON consultations;
DROP POLICY IF EXISTS "Partner can select downline consultations" ON consultations;

CREATE POLICY "Partner can select downline consultations"
    ON consultations FOR SELECT
    USING (
        auth.role() = 'authenticated'
        AND partner_id IN (SELECT my_downline_ids())
    );

-- 본인 명의 등록은 기존 정책 유지

-- === settlements ===
-- 핵심: 파트너는 본인이 받는 정산만 본다 (상위·하위가 얼마 받는지 안 보임)
DROP POLICY IF EXISTS "Partner can select own settlements" ON settlements;
CREATE POLICY "Partner can select own settlements"
    ON settlements FOR SELECT
    USING (
        auth.role() = 'authenticated'
        AND partner_id = get_my_partner_id()
    );

-- === commission_policies ===
ALTER TABLE commission_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access policies" ON commission_policies;
CREATE POLICY "Admin full access policies"
    ON commission_policies FOR ALL
    USING (auth.role() = 'authenticated' AND is_admin())
    WITH CHECK (auth.role() = 'authenticated' AND is_admin());
-- 파트너에게는 노출 안 함 (상위가 몇 % 가져가는지 차단)


-- ─────────────────────────────────────────────────────────────────────
-- 9. 셀프 초대용 RPC: 초대코드로 부모 찾아서 본인 partner 생성
-- ─────────────────────────────────────────────────────────────────────
-- partner-register.html 에서 referral_code 입력 시 사용.
-- SECURITY DEFINER 로 referral_code → parent_id 조회 후 INSERT.

CREATE OR REPLACE FUNCTION register_partner_with_referral(
    p_name VARCHAR,
    p_phone VARCHAR,
    p_email VARCHAR,
    p_hospital_name VARCHAR,
    p_business VARCHAR,
    p_region VARCHAR,
    p_message TEXT,
    p_referral_code VARCHAR
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    parent_id BIGINT;
    new_id BIGINT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_referral_code IS NOT NULL AND length(trim(p_referral_code)) > 0 THEN
        SELECT id INTO parent_id
          FROM partners
         WHERE upper(referral_code) = upper(trim(p_referral_code))
           AND status = 'approved';
        IF parent_id IS NULL THEN
            RAISE EXCEPTION 'Invalid referral code';
        END IF;
    END IF;

    INSERT INTO partners (
        name, phone, email, hospital_name, business, region, message,
        status, user_id, commission_rate, parent_partner_id
    ) VALUES (
        p_name, p_phone, p_email, p_hospital_name, p_business, p_region, p_message,
        'pending', auth.uid(), 0.015, parent_id
    )
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION register_partner_with_referral(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 10. 관리자/파트너 공용 VIEW
-- ─────────────────────────────────────────────────────────────────────

-- 전체 트리 (관리자용)
CREATE OR REPLACE VIEW v_partner_tree AS
SELECT
    p.id,
    p.name,
    p.email,
    p.phone,
    p.status,
    p.parent_partner_id,
    p.depth,
    p.path,
    p.referral_code,
    p.business_type,
    p.commission_rate,
    parent.name AS parent_name,
    (SELECT count(*) FROM partners c WHERE c.parent_partner_id = p.id) AS direct_children,
    (SELECT count(*) FROM partners d WHERE d.path LIKE p.path || '/%') AS total_descendants,
    (SELECT COALESCE(sum(transaction_amount),0) FROM consultations co
        WHERE co.partner_id IN (SELECT id FROM partners x WHERE x.id = p.id OR x.path LIKE p.path || '/%')
          AND co.pipeline_status = 'contracted') AS line_volume
FROM partners p
LEFT JOIN partners parent ON parent.id = p.parent_partner_id;

GRANT SELECT ON v_partner_tree TO authenticated;

-- 내 하위 라인 요약 (파트너 대시보드용) — RLS 가 자동 적용됨
CREATE OR REPLACE VIEW v_my_line_summary AS
SELECT
    p.id,
    p.name,
    p.depth,
    p.parent_partner_id,
    p.status,
    p.created_at,
    (SELECT count(*) FROM consultations co WHERE co.partner_id = p.id) AS total_clients,
    (SELECT count(*) FROM consultations co WHERE co.partner_id = p.id AND co.pipeline_status = 'contracted') AS contracted_clients,
    (SELECT COALESCE(sum(transaction_amount),0) FROM consultations co
        WHERE co.partner_id = p.id AND co.pipeline_status = 'contracted') AS contracted_volume
FROM partners p;

GRANT SELECT ON v_my_line_summary TO authenticated;


-- =====================================================================
-- 완료
-- =====================================================================
-- 다음 단계:
--   1) 관리자 화면에서 commission_policies 편집 (상품별 × 레벨별 요율)
--   2) 파트너 대시보드에 referral_code 노출 + 라인 트리 탭 추가
--   3) partner-register.html 에 ?ref=CODE 자동 입력 처리
--
-- 검증 쿼리:
--   SELECT id, name, depth, path, referral_code FROM partners ORDER BY path;
--   SELECT * FROM v_partner_tree ORDER BY path;
--   SELECT * FROM commission_policies;
-- =====================================================================
