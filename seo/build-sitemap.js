/**
 * sitemap.xml 재생성 — 기존 주요 페이지 + 정보센터 전체
 * 실행: node seo/build-sitemap.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://loan.brandplaton.com';
const pages = require('./pages.js');

// 기존 코어 페이지 (우선순위 수기 관리)
const CORE = [
    ['/', 'weekly', '1.0'],
    ['/loan-doctor.html', 'weekly', '0.9'],
    ['/loan-pharmacist.html', 'weekly', '0.9'],
    ['/loan-info.html', 'weekly', '0.9'],
    ['/products.html', 'weekly', '0.8'],
    ['/payment-agency.html', 'weekly', '0.8'],
    ['/guide.html', 'monthly', '0.8'],
    ['/products-biz.html', 'monthly', '0.7'],
    ['/products-realestate.html', 'monthly', '0.7'],
    ['/food-loan.html', 'weekly', '0.7'],
    ['/cases.html', 'weekly', '0.7'],
    ['/company.html', 'monthly', '0.6'],
    ['/tax-savings.html', 'monthly', '0.6'],
    ['/checklist-medical.html', 'monthly', '0.6'],
    ['/news.html', 'weekly', '0.6'],
    ['/promo.html', 'weekly', '0.6'],
    ['/marketing-medical.html', 'monthly', '0.5'],
    ['/marketing-biz.html', 'monthly', '0.5'],
    ['/partner.html', 'monthly', '0.5'],
    ['/agency.html', 'monthly', '0.5'],
];

// 카테고리별 우선순위
const CAT_PRIORITY = {
    '용어·상품': '0.8',
    '목적별': '0.75',
    '직역별': '0.75',
    '가이드': '0.7',
    '상황별': '0.7',
    '지역별': '0.6',
};

const entries = [];
CORE.forEach(([loc, freq, pri]) => {
    entries.push({ loc: SITE + loc, freq, pri });
});
pages.forEach((p) => {
    entries.push({
        loc: `${SITE}/${p.slug}.html`,
        freq: 'monthly',
        pri: CAT_PRIORITY[p.cat] || '0.6',
    });
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url>
    <loc>${e.loc}</loc>
    <changefreq>${e.freq}</changefreq>
    <priority>${e.pri}</priority>
  </url>`).join('\n')}
</urlset>
`;

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
console.log(`sitemap.xml 생성 — ${entries.length}개 URL (코어 ${CORE.length} + 정보센터 ${pages.length})`);
