-- =============================================
-- 메디플라톤 파트너 관리 시스템 v2 마이그레이션
-- =============================================
-- 기존 migration-partner-dashboard.sql 실행 후 이 파일을 실행하세요.
-- Supabase Dashboard → SQL Editor → New Query
-- =============================================


-- ─────────────────────────────────────────────
-- 1. 기존 테이블 컬럼 추가
-- ─────────────────────────────────────────────

-- partners 테이블: 승인 관련 컬럼
ALTER TABLE partners ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- consultations 테이블: 관리 메모, 상태 변경 시각
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;


-- ─────────────────────────────────────────────
-- 2. 신규 테이블
-- ─────────────────────────────────────────────

-- 감사 로그 테이블
CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID REFERENCES auth.users(id),
    action VARCHAR(100) NOT NULL,
    target_table VARCHAR(50),
    target_id BIGINT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_target ON activity_logs(target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);

-- 알림 테이블
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);


-- ─────────────────────────────────────────────
-- 3. RLS 정책 (신규 테이블)
-- ─────────────────────────────────────────────

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- activity_logs: 관리자만 조회, 시스템(SECURITY DEFINER 함수)만 INSERT
CREATE POLICY "Admin can select activity_logs"
    ON activity_logs FOR SELECT
    USING (auth.role() = 'authenticated' AND is_admin());

CREATE POLICY "System insert activity_logs"
    ON activity_logs FOR INSERT
    WITH CHECK (true);

-- notifications: 본인 알림만 조회/업데이트
CREATE POLICY "User can select own notifications"
    ON notifications FOR SELECT
    USING (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "User can update own notifications"
    ON notifications FOR UPDATE
    USING (auth.role() = 'authenticated' AND user_id = auth.uid())
    WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "System insert notifications"
    ON notifications FOR INSERT
    WITH CHECK (true);

-- consultations: 파트너는 접수 상태인 건만 UPDATE 가능
DROP POLICY IF EXISTS "Partner can update received consultations" ON consultations;
CREATE POLICY "Partner can update received consultations"
    ON consultations FOR UPDATE
    USING (
        auth.role() = 'authenticated'
        AND partner_id = get_my_partner_id()
        AND pipeline_status = 'received'
    );


-- ─────────────────────────────────────────────
-- 4. DB 함수 (SECURITY DEFINER)
-- ─────────────────────────────────────────────

-- 중복 연락처 확인
CREATE OR REPLACE FUNCTION check_duplicate_phone(p_phone TEXT)
RETURNS TABLE(is_duplicate BOOLEAN, existing_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) > 0 AS is_duplicate,
        COUNT(*) AS existing_count
    FROM consultations
    WHERE phone = p_phone;
END;
$$;

-- 익명화 통계 (파트너A/B/C 방식)
CREATE OR REPLACE FUNCTION get_anonymized_stats()
RETURNS TABLE(
    partner_label TEXT,
    is_me BOOLEAN,
    total_clients BIGINT,
    approved_clients BIGINT,
    installed_clients BIGINT,
    total_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    my_partner_id BIGINT;
    r RECORD;
    idx INT := 0;
    labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
BEGIN
    SELECT get_my_partner_id() INTO my_partner_id;

    FOR r IN
        SELECT
            p.id AS pid,
            COUNT(c.id) AS total,
            COUNT(c.id) FILTER (WHERE c.pipeline_status = 'approved') AS approved,
            COUNT(c.id) FILTER (WHERE c.pipeline_status = 'installed') AS installed,
            COALESCE(SUM(c.transaction_amount) FILTER (WHERE c.pipeline_status = 'installed'), 0) AS amount
        FROM partners p
        LEFT JOIN consultations c ON c.partner_id = p.id
        WHERE p.status = 'approved'
        GROUP BY p.id
        ORDER BY p.id
    LOOP
        idx := idx + 1;
        partner_label := labels[LEAST(idx, array_length(labels, 1))];
        is_me := (r.pid = my_partner_id);
        total_clients := r.total;
        approved_clients := r.approved;
        installed_clients := r.installed;
        total_amount := r.amount;
        RETURN NEXT;
    END LOOP;
END;
$$;

-- 월간 순위 (리더보드)
CREATE OR REPLACE FUNCTION get_monthly_leaderboard(p_month TEXT)
RETURNS TABLE(
    rank BIGINT,
    partner_label TEXT,
    is_me BOOLEAN,
    client_count BIGINT,
    total_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    my_partner_id BIGINT;
    r RECORD;
    idx INT := 0;
    labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
BEGIN
    SELECT get_my_partner_id() INTO my_partner_id;

    FOR r IN
        SELECT
            p.id AS pid,
            COUNT(c.id) AS cnt,
            COALESCE(SUM(c.transaction_amount), 0) AS amount
        FROM partners p
        LEFT JOIN consultations c
            ON c.partner_id = p.id
            AND TO_CHAR(c.created_at, 'YYYY-MM') = p_month
        WHERE p.status = 'approved'
        GROUP BY p.id
        ORDER BY cnt DESC, amount DESC
    LOOP
        idx := idx + 1;
        rank := idx;
        partner_label := labels[LEAST(idx, array_length(labels, 1))];
        is_me := (r.pid = my_partner_id);
        client_count := r.cnt;
        total_amount := r.amount;
        RETURN NEXT;
    END LOOP;
END;
$$;

-- 알림 생성 헬퍼
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_id BIGINT;
BEGIN
    INSERT INTO notifications (user_id, type, title, message)
    VALUES (p_user_id, p_type, p_title, p_message)
    RETURNING id INTO new_id;
    RETURN new_id;
END;
$$;


-- ─────────────────────────────────────────────
-- 5. DB 트리거
-- ─────────────────────────────────────────────

-- 트리거 함수: pipeline_status 변경 시 파트너에게 알림
CREATE OR REPLACE FUNCTION notify_pipeline_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    partner_user_id UUID;
    status_label TEXT;
BEGIN
    -- pipeline_status가 변경되지 않았으면 스킵
    IF OLD.pipeline_status = NEW.pipeline_status THEN
        RETURN NEW;
    END IF;

    -- 파트너에게 연결된 건이 아니면 스킵
    IF NEW.partner_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 파트너의 user_id 조회
    SELECT user_id INTO partner_user_id
    FROM partners
    WHERE id = NEW.partner_id;

    IF partner_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 상태 한글 라벨
    SELECT CASE NEW.pipeline_status
        WHEN 'received' THEN '접수'
        WHEN 'reviewing' THEN '심사 중'
        WHEN 'approved' THEN '승인'
        WHEN 'installed' THEN 'PG 설치 완료'
        WHEN 'rejected' THEN '반려'
        ELSE NEW.pipeline_status
    END INTO status_label;

    -- 상태 변경 시각 기록
    NEW.status_changed_at := NOW();

    -- 알림 생성
    PERFORM create_notification(
        partner_user_id,
        'pipeline_change',
        '고객 상태 변경: ' || COALESCE(NEW.name, '(이름없음)'),
        COALESCE(NEW.name, '') || ' 고객의 진행 상태가 "' || status_label || '"(으)로 변경되었습니다.'
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_pipeline_change ON consultations;
CREATE TRIGGER trg_notify_pipeline_change
    BEFORE UPDATE ON consultations
    FOR EACH ROW
    EXECUTE FUNCTION notify_pipeline_change();


-- 트리거 함수: installed + 거래액 존재 시 정산 자동 생성
CREATE OR REPLACE FUNCTION auto_create_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    p_commission_rate DECIMAL(5,4);
    p_commission_amount DECIMAL(15,0);
    settle_month TEXT;
    existing_count INT;
BEGIN
    -- installed 상태 + 거래액 있을 때만
    IF NEW.pipeline_status != 'installed' OR NEW.transaction_amount IS NULL OR NEW.transaction_amount <= 0 THEN
        RETURN NEW;
    END IF;

    -- 파트너 건이 아니면 스킵
    IF NEW.partner_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 이미 정산이 존재하면 스킵
    SELECT COUNT(*) INTO existing_count
    FROM settlements
    WHERE consultation_id = NEW.id;

    IF existing_count > 0 THEN
        RETURN NEW;
    END IF;

    -- 파트너 수수료율 조회
    SELECT COALESCE(commission_rate, 0.015) INTO p_commission_rate
    FROM partners
    WHERE id = NEW.partner_id;

    -- 수수료 계산
    p_commission_amount := ROUND(NEW.transaction_amount * p_commission_rate);

    -- 정산 월 (현재 월)
    settle_month := TO_CHAR(NOW(), 'YYYY-MM');

    -- 정산 자동 생성
    INSERT INTO settlements (
        partner_id, consultation_id, month, client_name,
        transaction_amount, commission_rate, commission_amount, status
    ) VALUES (
        NEW.partner_id, NEW.id, settle_month, NEW.name,
        NEW.transaction_amount, p_commission_rate, p_commission_amount, 'pending'
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_settlement ON consultations;
CREATE TRIGGER trg_auto_create_settlement
    AFTER UPDATE ON consultations
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_settlement();


-- ─────────────────────────────────────────────
-- 완료!
-- ─────────────────────────────────────────────
-- 실행 순서:
-- 1. supabase-schema.sql (최초 1회)
-- 2. migration-partner-dashboard.sql (최초 1회)
-- 3. 이 파일 (supabase-schema-v2.sql)
-- ─────────────────────────────────────────────
