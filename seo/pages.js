/**
 * SEO 키워드 랜딩 페이지 데이터 (카테고리별 분할)
 */
module.exports = [].concat(
    require('./data/terms.js'),    // 용어·상품 정의
    require('./data/jobs.js'),     // 직역별
    require('./data/purpose.js'),  // 자금 목적별
    require('./data/cases.js'),    // 상황별
    require('./data/regions.js'),  // 지역별
    require('./data/guides.js'),   // 비교·가이드
    require('./data/specialties.js'),   // 진료과목별 1차
    require('./data/specialties2.js'),  // 진료과목별 2차
    require('./data/pharmacy-care.js'), // 약국·의료 인접 직역
    require('./data/purpose-ext.js'),   // 자금 목적별 확장
    require('./data/cases-ext.js'),     // 상황별 확장
    require('./data/terms-ext.js'),     // 용어·상품 확장
    require('./data/regions-seoul.js'), // 지역 세분화 — 서울
    require('./data/regions-metro.js'), // 지역 세분화 — 경기·인천·지방
    require('./data/combo.js')          // 조합 — 진료과목 × 자금용도
);
