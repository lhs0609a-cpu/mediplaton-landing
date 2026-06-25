-- ============================================
-- 히트맵용 클릭 좌표 컬럼 추가 마이그레이션
-- ============================================
-- 사용법: Supabase SQL Editor에서 실행
-- 설명: analytics_events 테이블에 클릭 좌표(x,y)·뷰포트·디바이스 추가
--       → heatmap.html에서 클릭 분포도(히트맵) 렌더링용

-- ─── 클릭 좌표 컬럼 추가 ───
-- click_x   : 페이지 가로폭 대비 클릭 위치 비율 (0~100, %) — 반응형 폭 차이 보정용
-- click_y   : 페이지 최상단 기준 절대 세로 위치 (px) — 스크롤 포함
-- viewport_w: 클릭 당시 브라우저 가로폭 (px) — 디바이스별 그룹핑용
-- device_type: mobile / tablet / desktop — 레이아웃별 필터링용

ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS click_x REAL;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS click_y INT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS viewport_w INT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS device_type TEXT;

-- ─── 히트맵 조회 성능 인덱스 ───
-- (page_url, device_type)로 필터 + 좌표 존재하는 행만
CREATE INDEX IF NOT EXISTS idx_events_heatmap
    ON analytics_events(page_url, device_type)
    WHERE click_x IS NOT NULL;

-- 끝. 기존 RLS 정책(anon insert / authenticated select)이 그대로 적용됩니다.
