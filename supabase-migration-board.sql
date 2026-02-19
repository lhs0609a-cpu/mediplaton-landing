-- ============================================
-- 게시판 테이블 + RLS 마이그레이션
-- ============================================

-- 게시판 글
CREATE TABLE board_posts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id UUID REFERENCES auth.users(id),
    author_name TEXT NOT NULL,
    author_type TEXT NOT NULL CHECK (author_type IN ('admin', 'partner')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_answered BOOLEAN DEFAULT FALSE
);

-- 답변 (관리자 전용)
CREATE TABLE board_replies (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id BIGINT REFERENCES board_posts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    author_name TEXT DEFAULT '관리자',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: board_posts
ALTER TABLE board_posts ENABLE ROW LEVEL SECURITY;
-- 인증된 사용자: 전체 읽기
CREATE POLICY "board_posts_read" ON board_posts FOR SELECT TO authenticated USING (true);
-- 인증된 사용자: 본인 글 작성
CREATE POLICY "board_posts_insert" ON board_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
-- 관리자: 전체 삭제
CREATE POLICY "board_posts_admin_delete" ON board_posts FOR DELETE TO authenticated USING (is_admin());

-- RLS: board_replies
ALTER TABLE board_replies ENABLE ROW LEVEL SECURITY;
-- 인증된 사용자: 전체 읽기
CREATE POLICY "board_replies_read" ON board_replies FOR SELECT TO authenticated USING (true);
-- 관리자만 답변 작성
CREATE POLICY "board_replies_admin_insert" ON board_replies FOR INSERT TO authenticated WITH CHECK (is_admin());
-- 관리자만 삭제
CREATE POLICY "board_replies_admin_delete" ON board_replies FOR DELETE TO authenticated USING (is_admin());
