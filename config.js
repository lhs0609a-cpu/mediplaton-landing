/**
 * Supabase 설정 파일
 *
 * 설정 방법:
 * 1. https://supabase.com 에서 무료 프로젝트 생성
 * 2. Project Settings → API 에서 URL과 anon key 복사
 * 3. 아래 값들을 실제 값으로 교체
 */

const SUPABASE_CONFIG = {
    // Supabase 프로젝트 URL (예: https://xxxxx.supabase.co)
    url: 'YOUR_SUPABASE_URL',

    // Supabase anon/public key (예: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...)
    anonKey: 'YOUR_SUPABASE_ANON_KEY'
};

// 설정 확인 함수
function isSupabaseConfigured() {
    return SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL' &&
           SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY';
}
