-- =============================================
-- IP 추적 마이그레이션
-- =============================================
-- 모든 공개 폼 제출 테이블에 IP/UA 컬럼 추가.
-- 허위 접수 식별 및 동일 IP 다회 접수 적발 목적.
-- Supabase SQL Editor 에서 전체 실행하세요.
-- =============================================

-- 1. 컬럼 추가 (5개 테이블)
ALTER TABLE consultations        ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE consultations        ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE marketing_inquiries  ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE marketing_inquiries  ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE partner_inquiries    ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE partner_inquiries    ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE promo_inquiries      ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE promo_inquiries      ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE agency_inquiries     ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE agency_inquiries     ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 2. 인덱스 (동일 IP 카운트 쿼리 가속)
CREATE INDEX IF NOT EXISTS idx_consultations_ip       ON consultations(ip_address);
CREATE INDEX IF NOT EXISTS idx_marketing_ip           ON marketing_inquiries(ip_address);
CREATE INDEX IF NOT EXISTS idx_partner_inq_ip         ON partner_inquiries(ip_address);
CREATE INDEX IF NOT EXISTS idx_promo_inq_ip           ON promo_inquiries(ip_address);
CREATE INDEX IF NOT EXISTS idx_agency_inq_ip          ON agency_inquiries(ip_address);

-- 3. 익명 INSERT 정책 차단 (서버 API 만이 service_role 로 INSERT)
-- 클라이언트가 직접 INSERT 하면 IP 우회 가능하므로, anon INSERT 권한을 회수합니다.
DROP POLICY IF EXISTS "Anon insert consultations" ON consultations;
DROP POLICY IF EXISTS "Anyone can insert consultations" ON consultations;

DROP POLICY IF EXISTS "Anyone can insert marketing inquiries" ON marketing_inquiries;

DROP POLICY IF EXISTS "Anon insert partner_inquiries" ON partner_inquiries;

DROP POLICY IF EXISTS "Anon insert promo_inquiries" ON promo_inquiries;

DROP POLICY IF EXISTS "Anyone can insert agency_inquiries" ON agency_inquiries;

-- 참고: service_role 키는 RLS 를 우회하므로 별도 정책 불필요.
-- 클라이언트는 /api/submit 경유로만 INSERT 가능해집니다.

-- 4. 동일 IP 카운트 헬퍼 뷰 (관리자 화면용)
-- 모든 폼 테이블을 union 하여 IP 별 총 접수 건수 집계
CREATE OR REPLACE VIEW ip_submission_counts AS
SELECT ip_address, COUNT(*)::int AS total_count
FROM (
    SELECT ip_address FROM consultations       WHERE ip_address IS NOT NULL
    UNION ALL
    SELECT ip_address FROM marketing_inquiries WHERE ip_address IS NOT NULL
    UNION ALL
    SELECT ip_address FROM partner_inquiries   WHERE ip_address IS NOT NULL
    UNION ALL
    SELECT ip_address FROM promo_inquiries     WHERE ip_address IS NOT NULL
    UNION ALL
    SELECT ip_address FROM agency_inquiries    WHERE ip_address IS NOT NULL
) all_ips
GROUP BY ip_address;

GRANT SELECT ON ip_submission_counts TO authenticated;

-- 완료 확인
SELECT 'consultations'        AS table_name, COUNT(*) AS rows_with_ip FROM consultations       WHERE ip_address IS NOT NULL
UNION ALL SELECT 'marketing_inquiries',          COUNT(*) FROM marketing_inquiries WHERE ip_address IS NOT NULL
UNION ALL SELECT 'partner_inquiries',            COUNT(*) FROM partner_inquiries   WHERE ip_address IS NOT NULL
UNION ALL SELECT 'promo_inquiries',              COUNT(*) FROM promo_inquiries     WHERE ip_address IS NOT NULL
UNION ALL SELECT 'agency_inquiries',             COUNT(*) FROM agency_inquiries    WHERE ip_address IS NOT NULL;
