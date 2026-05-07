-- ============================================
-- 영업자 시스템 v8: 관리자 권한 식별 보강
-- ============================================
-- 문제: v7의 is_admin() 함수는 auth.jwt() -> 'app_metadata' ->> 'role' = 'admin' 만 체크
--       그러나 운영자 계정에는 app_metadata.role 이 설정되어 있지 않아 RLS가 차단됨
--       (예: lead_upload_batches 에 INSERT 시 'row violates row-level security policy')
--
-- 수정: is_admin() 을 SECURITY DEFINER 로 변경하고 auth.users.raw_app_meta_data 도 함께 검증.
--       JWT 갱신(재로그인) 없이도 raw_app_meta_data 변경이 즉시 반영됨.
--       동시에 운영자 이메일에 raw_app_meta_data.role = 'admin' 을 박아 줌.
-- ============================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
        OR EXISTS (
            SELECT 1 FROM auth.users
            WHERE id = auth.uid()
              AND coalesce(raw_app_meta_data ->> 'role', '') = 'admin'
        );
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, anon;

-- 운영자 계정에 admin role 부여 (없으면 추가, 있으면 그대로 둠)
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
WHERE email IN ('lhs0609c@naver.com', 'lhs0609a@gmail.com');
