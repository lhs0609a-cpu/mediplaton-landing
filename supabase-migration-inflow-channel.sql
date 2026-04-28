-- Migration: Add inflow_channel column to all inquiry tables
-- 유입 경로: 블로그(blog), 검색(search), 이메일(email), 유튜브(youtube), 기타(other)
-- Run this in Supabase SQL Editor

-- 1. consultations 테이블
ALTER TABLE consultations
ADD COLUMN IF NOT EXISTS inflow_channel TEXT DEFAULT '';

-- 2. marketing_inquiries 테이블
ALTER TABLE marketing_inquiries
ADD COLUMN IF NOT EXISTS inflow_channel TEXT DEFAULT '';

-- 3. promo_inquiries 테이블
ALTER TABLE promo_inquiries
ADD COLUMN IF NOT EXISTS inflow_channel TEXT DEFAULT '';

-- 4. partner_inquiries 테이블
ALTER TABLE partner_inquiries
ADD COLUMN IF NOT EXISTS inflow_channel TEXT DEFAULT '';

-- Add comments
COMMENT ON COLUMN consultations.inflow_channel IS '유입 경로 (blog, search, email, youtube, other)';
COMMENT ON COLUMN marketing_inquiries.inflow_channel IS '유입 경로';
COMMENT ON COLUMN promo_inquiries.inflow_channel IS '유입 경로';
COMMENT ON COLUMN partner_inquiries.inflow_channel IS '유입 경로';
