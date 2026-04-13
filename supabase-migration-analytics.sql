-- ============================================
-- 분석 테이블 3개 + RLS + 인덱스 마이그레이션
-- ============================================
-- 사용법: Supabase SQL Editor에서 실행
-- 설명: 자체 웹 분석 시스템용 테이블 (세션, 페이지뷰, 이벤트)

-- ─── 1) analytics_sessions: 세션 추적 ───

CREATE TABLE IF NOT EXISTS analytics_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    page_count INT DEFAULT 0,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    landing_page TEXT,
    is_bounce BOOLEAN DEFAULT TRUE
);

-- ─── 2) analytics_pageviews: 페이지뷰 ───

CREATE TABLE IF NOT EXISTS analytics_pageviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id UUID REFERENCES analytics_sessions(id) ON DELETE CASCADE,
    page_url TEXT NOT NULL,
    page_title TEXT,
    entered_at TIMESTAMPTZ DEFAULT NOW(),
    time_on_page INT DEFAULT 0,
    scroll_depth INT DEFAULT 0
);

-- ─── 3) analytics_events: 클릭/인터랙션 이벤트 ───

CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id UUID REFERENCES analytics_sessions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    element_tag TEXT,
    element_text TEXT,
    element_id TEXT,
    element_class TEXT,
    page_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 인덱스 ───

CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON analytics_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON analytics_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON analytics_sessions(last_active_at);
CREATE INDEX IF NOT EXISTS idx_pageviews_session ON analytics_pageviews(session_id);
CREATE INDEX IF NOT EXISTS idx_pageviews_entered ON analytics_pageviews(entered_at);
CREATE INDEX IF NOT EXISTS idx_pageviews_url ON analytics_pageviews(page_url);
CREATE INDEX IF NOT EXISTS idx_events_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON analytics_events(event_type);

-- ─── RLS 활성화 ───

ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_pageviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- ─── RLS 정책: 비인증 사용자 INSERT 허용 (추적 데이터 전송) ───

CREATE POLICY "analytics_sessions_anon_insert"
    ON analytics_sessions FOR INSERT
    TO anon
    WITH CHECK (true);

CREATE POLICY "analytics_sessions_anon_update"
    ON analytics_sessions FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

CREATE POLICY "analytics_pageviews_anon_insert"
    ON analytics_pageviews FOR INSERT
    TO anon
    WITH CHECK (true);

CREATE POLICY "analytics_pageviews_anon_update"
    ON analytics_pageviews FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

CREATE POLICY "analytics_events_anon_insert"
    ON analytics_events FOR INSERT
    TO anon
    WITH CHECK (true);

-- ─── RLS 정책: 인증된 사용자(관리자) SELECT 허용 ───

CREATE POLICY "analytics_sessions_auth_select"
    ON analytics_sessions FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "analytics_pageviews_auth_select"
    ON analytics_pageviews FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "analytics_events_auth_select"
    ON analytics_events FOR SELECT
    TO authenticated
    USING (true);

-- ─── Realtime 활성화 (실시간 접속자 카운터용) ───

ALTER PUBLICATION supabase_realtime ADD TABLE analytics_sessions;
