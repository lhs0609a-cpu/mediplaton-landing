/**
 * rss.xml 생성 — 네이버 RSS 수집용
 * 실행: node seo/build-rss.js  (build.js 이후)
 *
 * 설계 메모
 * - RSS 는 「최근 콘텐츠」 피드다. 전체 색인은 sitemap.xml 이 담당한다.
 *   따라서 최신순 MAX_ITEMS 개만 싣는다.
 * - pubDate 는 지어내지 않는다. 각 문서 데이터 파일이 저장소에 들어온
 *   실제 커밋 날짜(PUBLISHED)를 쓴다. 새 데이터 파일을 추가하면
 *   PUBLISHED 에 날짜를 함께 등록해야 한다.
 * - lastBuildDate 는 빌드 시각이 아니라 가장 최근 항목의 발행일을 쓴다.
 *   내용이 안 바뀌었는데 파일만 바뀌어 git 이력이 지저분해지는 것을 막는다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://loan.brandplaton.com';
const MAX_ITEMS = 100;

const pages = require('./pages.js');

// ── 문서 발행일 — 데이터 파일이 저장소에 들어온 실제 커밋 날짜 ──────
// 새 데이터 파일 추가 시 여기에 날짜를 등록한다. 없으면 DEFAULT 사용.
const PUBLISHED = {
    'terms.js':          '2026-07-24T19:32:22+09:00',
    'jobs.js':           '2026-07-24T19:32:22+09:00',
    'purpose.js':        '2026-07-24T19:32:22+09:00',
    'cases.js':          '2026-07-24T19:32:22+09:00',
    'regions.js':        '2026-07-24T19:32:22+09:00',
    'guides.js':         '2026-07-24T19:32:22+09:00',
    'specialties.js':    '2026-08-18T19:08:20+09:00',
    'specialties2.js':   '2026-08-18T19:08:20+09:00',
    'pharmacy-care.js':  '2026-08-18T19:08:20+09:00',
    'purpose-ext.js':    '2026-08-18T19:08:20+09:00',
    'cases-ext.js':      '2026-08-18T19:08:20+09:00',
    'terms-ext.js':      '2026-08-18T19:08:20+09:00',
    'regions-seoul.js':  '2026-08-18T19:37:27+09:00',
    'regions-metro.js':  '2026-08-18T19:37:27+09:00',
    'combo.js':          '2026-08-18T19:37:27+09:00',
    'combo-extra.js':    '2026-08-19T08:23:36+09:00',
    'combo-extra2.js':   '2026-08-19T08:23:36+09:00',
    'guides-ext.js':     '2026-08-19T08:43:48+09:00',
    'guides-ext2.js':    '2026-08-19T08:43:48+09:00',
};
const DEFAULT_DATE = '2026-07-24T19:32:22+09:00';

// ── 어느 슬러그가 어느 데이터 파일에서 왔는지 역인덱스 ──────────────
const fileOf = {};
fs.readdirSync(path.join(__dirname, 'data'))
    .filter((f) => f.endsWith('.js'))
    .forEach((f) => {
        let mod;
        try {
            mod = require(path.join(__dirname, 'data', f));
        } catch (e) {
            throw new Error(`데이터 파일 로드 실패: ${f} — ${e.message}`);
        }
        const list = Array.isArray(mod) ? mod : [];
        list.forEach((p) => { if (p && p.slug) fileOf[p.slug] = f; });
    });

// combo.js 는 combo-extra*.js 를 병합해 하나의 배열로 내보낸다.
// 위 루프에서는 전부 combo.js 로 잡히므로, 추가분 파일의 키를 직접 읽어
// 해당 슬러그를 실제 출처 파일로 되돌린다.
[['combo-extra.js', (m) => m], ['combo-extra2.js', (m) => m.combo]].forEach(([file, pick]) => {
    const table = pick(require(path.join(__dirname, 'data', file))) || {};
    Object.keys(table).forEach((key) => {
        const [spec, purpose] = key.split('|');
        fileOf[`${spec}-${purpose}-fund`] = file;
    });
});

// ── 코어 페이지 (수기 관리) ────────────────────────────────────────
const CORE = [
    ['loan-doctor.html', '의사대출·닥터론 한도·금리·조건 총정리', '의사·치과의사·한의사 대상 카드매출 기반 대출. 한도 최대 3억원, 금리 연 5.3%~6.9%, DSR 한도와 별도 산정, 평균 3영업일 입금.', '2026-06-10T09:00:00+09:00'],
    ['loan-pharmacist.html', '약사대출·약국대출 한도·금리·조건 총정리', '약사·약국 대상 카드매출 기반 대출. 약국 개설·인수·운영자금. 한도 최대 3억원, 금리 연 5.3%~6.9%, DSR 별도 산정.', '2026-06-10T09:00:00+09:00'],
    ['products.html', '병의원 전용 금융상품 안내', '카드매출 담보대출, KB국민카드 제휴 상품, 의료기기 렌탈 등 병의원·약국 원장님을 위한 금융상품 일람.', '2026-06-09T09:00:00+09:00'],
    ['guide.html', '이용안내 — 신청 절차·자격·서류·FAQ', '의사대출·약사대출 신청 절차, 자격 조건, 필요 서류, 자주 묻는 질문(FAQ)을 한눈에.', '2026-06-08T09:00:00+09:00'],
    ['cases.html', '병의원·약국 대출 성공사례', 'DSR에 막혔던 원장님들의 실제 병의원·약국 대출 승인 사례.', '2026-06-07T09:00:00+09:00'],
    ['company.html', '메디플라톤 회사소개 및 제휴기관', '신협중앙회·KB국민카드 등 정식 제휴 금융기관 안내, 메디플라톤 소개, 오시는 길.', '2026-06-06T09:00:00+09:00'],
    ['tax-savings.html', '병의원 원장 절세 계산기', '병의원 원장님을 위한 세금 절감 시뮬레이션 계산기.', '2026-06-05T09:00:00+09:00'],
];

// ── 유틸 ──────────────────────────────────────────────────────────
const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const plain = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO(+09:00) → RFC 822. KST 고정이므로 문자열에서 직접 조립한다. */
function rfc822(iso) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (!m) throw new Error(`날짜 형식 오류: ${iso}`);
    const [, Y, M, D, h, mi, s] = m;
    const dow = DAY[new Date(Date.UTC(+Y, +M - 1, +D)).getUTCDay()];
    return `${dow}, ${D} ${MON[+M - 1]} ${Y} ${h}:${mi}:${s} +0900`;
}

// ── 항목 수집 ──────────────────────────────────────────────────────
const items = [];

CORE.forEach(([file, title, desc, date]) => {
    items.push({ url: `${SITE}/${file}`, title, desc, date });
});

pages.forEach((p) => {
    const src = fileOf[p.slug];
    const date = (src && PUBLISHED[src]) || DEFAULT_DATE;
    items.push({
        url: `${SITE}/${p.slug}.html`,
        title: plain(p.h1),
        desc: plain(p.metaDesc),
        date,
    });
});

// 최신순 정렬 후 상한 적용 (동일 날짜는 등록 순서 유지)
items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
const feed = items.slice(0, MAX_ITEMS);
const lastBuild = feed.length ? feed[0].date : DEFAULT_DATE;

// ── 출력 ──────────────────────────────────────────────────────────
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>메디플라톤 | 병의원·약국 전문 금융</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
    <description>의사·치과의사·한의사·약사 원장님을 위한 카드매출 기반 대출(의사대출·닥터론·약사대출·약국대출). 신협중앙회·KB국민카드 정식 제휴, DSR 별도 산정, 한도 최대 3억원, 금리 연 5.3%~6.9%.</description>
    <language>ko</language>
    <copyright>© 2026 메디플라톤</copyright>
    <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>
    <generator>Mediplaton SEO Builder</generator>

${feed.map((it) => `    <item>
      <title>${esc(it.title)}</title>
      <link>${it.url}</link>
      <guid isPermaLink="true">${it.url}</guid>
      <pubDate>${rfc822(it.date)}</pubDate>
      <description>${esc(it.desc)}</description>
    </item>`).join('\n\n')}

  </channel>
</rss>
`;

fs.writeFileSync(path.join(ROOT, 'rss.xml'), xml, 'utf8');
console.log(`rss.xml 생성 — ${feed.length}개 항목 (전체 ${items.length}개 중 최신순 상한 ${MAX_ITEMS})`);

// 발행일이 등록되지 않은 데이터 파일 경고
const missing = [...new Set(Object.values(fileOf))].filter((f) => !PUBLISHED[f]);
if (missing.length) {
    console.log(`  주의: PUBLISHED 에 날짜 미등록 → ${missing.join(', ')} (기본값 사용)`);
}
