-- Migration: Add preferred_time column to all inquiry tables
-- Run this in Supabase SQL Editor

-- 1. consultations 테이블
ALTER TABLE consultations
ADD COLUMN IF NOT EXISTS preferred_time TEXT DEFAULT '';

-- 2. marketing_inquiries 테이블
ALTER TABLE marketing_inquiries
ADD COLUMN IF NOT EXISTS preferred_time TEXT DEFAULT '';

-- 3. promo_inquiries 테이블
ALTER TABLE promo_inquiries
ADD COLUMN IF NOT EXISTS preferred_time TEXT DEFAULT '';

-- 4. partner_inquiries 테이블
ALTER TABLE partner_inquiries
ADD COLUMN IF NOT EXISTS preferred_time TEXT DEFAULT '';

-- Add comments
COMMENT ON COLUMN consultations.preferred_time IS '상담 가능 시간 (09-10, 10-12, 12-14, 14-16, 16-18, anytime)';
COMMENT ON COLUMN marketing_inquiries.preferred_time IS '상담 가능 시간';
COMMENT ON COLUMN promo_inquiries.preferred_time IS '상담 가능 시간';
COMMENT ON COLUMN partner_inquiries.preferred_time IS '상담 가능 시간';
