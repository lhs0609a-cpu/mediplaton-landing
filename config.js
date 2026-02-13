/**
 * ============================================================
 * 메디플라톤 Supabase 설정 파일
 * ============================================================
 *
 * ⚠️  중요: 이 파일을 설정하지 않으면 상담 신청 데이터가 저장되지 않습니다!
 *
 * ============================================================
 * 📋 Supabase 프로젝트 생성 가이드 (5분 소요)
 * ============================================================
 *
 * Step 1: Supabase 가입 및 프로젝트 생성
 *   1. https://supabase.com 접속
 *   2. "Start your project" 클릭 → GitHub로 로그인
 *   3. "New Project" 클릭
 *   4. 프로젝트 이름: mediplaton (또는 원하는 이름)
 *   5. Database Password: 강력한 비밀번호 설정 (메모해두세요)
 *   6. Region: Northeast Asia (Tokyo) 선택 → "Create new project"
 *
 * Step 2: 데이터베이스 테이블 생성
 *   1. 왼쪽 메뉴에서 "SQL Editor" 클릭
 *   2. "New Query" 클릭
 *   3. 프로젝트 폴더의 supabase-schema.sql 파일 내용을 복사하여 붙여넣기
 *   4. "Run" 버튼 클릭
 *
 * Step 3: API 키 가져오기
 *   1. 왼쪽 메뉴에서 "Project Settings" (톱니바퀴 아이콘) 클릭
 *   2. "API" 탭 클릭
 *   3. "Project URL" 복사 → 아래 url에 붙여넣기
 *   4. "anon public" 키 복사 → 아래 anonKey에 붙여넣기
 *
 * Step 4: 관리자 계정 생성 (admin.html 사용 시)
 *   1. 왼쪽 메뉴에서 "Authentication" 클릭
 *   2. "Users" 탭 → "Add User" → "Create new user"
 *   3. 이메일/비밀번호 입력 후 생성
 *
 * ============================================================
 */

const SUPABASE_CONFIG = {
    // ▼▼▼ 여기에 실제 Supabase URL을 붙여넣으세요 ▼▼▼
    // 예시: 'https://abcdefghijk.supabase.co'
    url: 'https://rtjklelozdxznngjgedr.supabase.co',

    // ▼▼▼ 여기에 실제 anon key를 붙여넣으세요 ▼▼▼
    // 예시: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSI...'
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0amtsZWxvemR4em5uZ2pnZWRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDc5OTksImV4cCI6MjA4NjUyMzk5OX0.l4RZLS5PkvDX3Sq2xWw-VdEs9p_-9zfLKJtxn9J7RKY'
};

/**
 * ============================================================
 * 📊 Google Sheets 연동 설정
 * ============================================================
 *
 * Step 1: 구글 시트 생성
 *   1. Google Drive에서 새 스프레드시트 생성
 *   2. 첫 번째 행에 헤더 입력: 타임스탬프 | 성함 | 연락처 | 소속 | 예상 월 연결건수
 *
 * Step 2: Apps Script 설정
 *   1. 스프레드시트에서 [확장 프로그램] → [Apps Script] 클릭
 *   2. 기존 코드 전체 삭제 후, 아래 코드를 붙여넣기:
 *
 * ─────────────────────────────────────────────────────────────
 * function doPost(e) {
 *   var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
 *   var data = JSON.parse(e.postData.contents);
 *
 *   sheet.appendRow([
 *     new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}),
 *     data.name,
 *     data.phone,
 *     data.occupation,
 *     data.expected_leads
 *   ]);
 *
 *   return ContentService
 *     .createTextOutput(JSON.stringify({result: 'success'}))
 *     .setMimeType(ContentService.MimeType.JSON);
 * }
 * ─────────────────────────────────────────────────────────────
 *
 * Step 3: 웹 앱으로 배포
 *   1. [배포] → [새 배포] 클릭
 *   2. 유형 선택: "웹 앱"
 *   3. 설명: "파트너 폼 연동" (아무거나)
 *   4. 실행 주체: "나"
 *   5. 액세스 권한: "모든 사용자" ← 중요!
 *   6. [배포] 클릭 → 권한 승인
 *   7. 웹 앱 URL 복사 → 아래 webAppUrl에 붙여넣기
 *
 * ============================================================
 */
const GOOGLE_SHEETS_CONFIG = {
    // ▼▼▼ 여기에 Google Apps Script 웹 앱 URL을 붙여넣으세요 ▼▼▼
    // 예시: 'https://script.google.com/macros/s/AKfycbx.../exec'
    webAppUrl: 'https://script.google.com/macros/s/AKfycbyYo5YPoeIA-3a_Vc8ILvtluU0EHCr9eZQ5mPz5eS-SHFvZNGjGgmUHGbJgi02Pj-HT/exec'
};

/**
 * Google Sheets 설정 여부 확인
 */
function isGoogleSheetsConfigured() {
    return GOOGLE_SHEETS_CONFIG.webAppUrl !== 'YOUR_GOOGLE_SHEETS_WEB_APP_URL' &&
           GOOGLE_SHEETS_CONFIG.webAppUrl.includes('script.google.com');
}

/**
 * Supabase 설정 여부 확인
 * @returns {boolean} 설정되었으면 true
 */
function isSupabaseConfigured() {
    const isConfigured = SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL' &&
                         SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY' &&
                         SUPABASE_CONFIG.url.includes('supabase.co');

    if (!isConfigured) {
        console.warn('⚠️ [메디플라톤] Supabase가 설정되지 않았습니다!');
        console.warn('📋 config.js 파일의 가이드를 따라 설정해주세요.');
        console.warn('🔗 Supabase 가입: https://supabase.com');
    }

    return isConfigured;
}

/**
 * 미설정 시 로컬 스토리지에 임시 저장 (데이터 유실 방지)
 * - Supabase 설정 전까지 브라우저에 데이터 보관
 * - 설정 후 관리자가 수동으로 확인 가능
 */
function saveToLocalBackup(type, data) {
    try {
        const key = `mediplaton_backup_${type}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.push({
            ...data,
            saved_at: new Date().toISOString(),
            synced: false
        });
        localStorage.setItem(key, JSON.stringify(existing));
        console.log(`📦 [백업] ${type} 데이터가 로컬에 임시 저장되었습니다.`);
        return true;
    } catch (e) {
        console.error('로컬 백업 저장 실패:', e);
        return false;
    }
}

/**
 * 로컬 백업 데이터 조회 (개발자 도구 Console에서 사용)
 * 사용법: getLocalBackup('consultations') 또는 getLocalBackup('partners')
 */
function getLocalBackup(type) {
    const key = `mediplaton_backup_${type}`;
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    console.table(data);
    return data;
}
