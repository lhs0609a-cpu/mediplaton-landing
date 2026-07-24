/**
 * SEO 키워드 랜딩 페이지 데이터 (카테고리별 분할)
 */
module.exports = [].concat(
    require('./data/terms.js'),    // 용어·상품 정의
    require('./data/jobs.js'),     // 직역별
    require('./data/purpose.js'),  // 자금 목적별
    require('./data/cases.js'),    // 상황별
    require('./data/regions.js'),  // 지역별
    require('./data/guides.js')    // 비교·가이드
);
