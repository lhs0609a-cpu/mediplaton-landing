-- ============================================
-- 파트너 자가 회원가입 RLS 정책
-- Supabase SQL Editor에서 실행하세요.
-- ============================================

-- 인증된 사용자가 자기 user_id로 파트너 레코드 생성 (status는 반드시 'pending')
CREATE POLICY "Auth users can insert own partner record"
  ON partners FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND status = 'pending'
  );

-- 인증된 사용자가 자기 파트너 레코드를 읽을 수 있도록 (로그인 시 상태 확인용)
CREATE POLICY "Users can select own partner record"
  ON partners FOR SELECT
  USING (user_id = auth.uid());
