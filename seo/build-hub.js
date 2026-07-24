/**
 * 대출 정보센터 허브 페이지 생성 — loan-info.html
 * 실행: node seo/build-hub.js  (build.js 이후에 실행)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://loan.brandplaton.com';
const pages = require('./pages.js');

const tpl = fs.readFileSync(path.join(ROOT, 'loan-doctor.html'), 'utf8');
const chromeTop = tpl.slice(tpl.indexOf('<body'), tpl.indexOf('<main id="main-content">') + '<main id="main-content">'.length);
const chromeBottom = tpl.slice(tpl.indexOf('</main>'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// 카테고리 순서와 설명
const CATS = [
    ['용어·상품', '메디칼론·닥터론·카드매출 담보대출 등 상품과 용어의 정의를 정리했습니다.'],
    ['직역별', '진료과목과 면허 직역에 따라 자금 구조가 어떻게 달라지는지 정리했습니다.'],
    ['목적별', '개원·장비·운영·세금 등 자금의 용도별 조달 전략입니다.'],
    ['상황별', '거절, 신용점수, 개원 직후 등 상황에 맞는 대응 방법입니다.'],
    ['가이드', '서류·절차·한도 계산·금융권 비교 등 실무 가이드입니다.'],
    ['지역별', '권역별 자금 구조 특성과 상담 안내입니다.'],
];

const grouped = {};
pages.forEach((p) => {
    (grouped[p.cat] = grouped[p.cat] || []).push(p);
});

const sections = CATS.filter(([c]) => grouped[c]).map(([cat, desc]) => `
            <div class="hub-cat">
                <h2>${esc(cat)} <span class="hub-count">${grouped[cat].length}건</span></h2>
                <p class="hub-desc">${esc(desc)}</p>
                <ul class="hub-list">
${grouped[cat].map((p) => `                    <li><a href="${p.slug}.html"><strong>${esc(p.h1)}</strong><span>${esc(plain(p.answer).slice(0, 95))}…</span></a></li>`).join('\n')}
                </ul>
            </div>`).join('');

const ld = {
    '@context': 'https://schema.org',
    '@graph': [
        {
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: '홈', item: SITE },
                { '@type': 'ListItem', position: 2, name: '대출 정보센터', item: `${SITE}/loan-info.html` },
            ],
        },
        {
            '@type': 'CollectionPage',
            name: '대출 정보센터 — 병의원·약국 금융 지식베이스',
            description: '메디칼론·닥터론·약사대출부터 DSR·팩토링·지급대행까지, 병의원과 약국의 자금 조달에 필요한 정보를 주제별로 정리한 지식베이스입니다.',
            inLanguage: 'ko-KR',
            url: `${SITE}/loan-info.html`,
            isPartOf: { '@type': 'WebSite', name: '메디플라톤', url: SITE },
            hasPart: pages.map((p) => ({
                '@type': 'Article',
                headline: p.h1,
                url: `${SITE}/${p.slug}.html`,
                about: p.keywords,
            })),
        },
    ],
};

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=AW-18162012600"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'AW-18162012600');
    </script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>대출 정보센터 — 병의원·약국 금융 지식베이스 | 메디플라톤</title>
    <meta name="description" content="메디칼론·닥터론·약사대출부터 DSR·카드매출 담보·팩토링·지급대행까지. 병의원과 약국의 자금 조달에 필요한 ${pages.length}개 주제를 정리한 지식베이스입니다.">
    <meta name="keywords" content="메디칼론, 닥터론, 약사대출, 병원대출, 개원자금, DSR, 카드매출 담보대출, 의료기기 리스, 팩토링, 지급대행, 대출 정보">
    <meta name="author" content="메디플라톤">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${SITE}/loan-info.html">
    <link rel="alternate" type="application/rss+xml" title="메디플라톤 RSS" href="${SITE}/rss.xml" />

    <meta property="og:type" content="website">
    <meta property="og:title" content="대출 정보센터 — 병의원·약국 금융 지식베이스 | 메디플라톤">
    <meta property="og:description" content="병의원·약국 자금 조달에 필요한 ${pages.length}개 주제를 정리한 지식베이스.">
    <meta property="og:url" content="${SITE}/loan-info.html">
    <meta property="og:site_name" content="메디플라톤">
    <meta property="og:locale" content="ko_KR">
    <meta property="og:image" content="${SITE}/images/og-image.jpg">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="대출 정보센터 | 메디플라톤">
    <meta name="twitter:description" content="병의원·약국 자금 조달 지식베이스 ${pages.length}개 주제.">
    <meta name="twitter:image" content="${SITE}/images/og-image.jpg">

    <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" as="style">
    <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
    <link rel="stylesheet" href="styles.css">

    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="shortcut icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <meta name="theme-color" content="#1A3A8F">

    <script type="application/ld+json">
${JSON.stringify(ld, null, 4)}
    </script>
</head>
${chromeTop}

    <section class="page-hero">
        <div class="container">
            <nav class="breadcrumb" aria-label="현재 위치">
                <a href="index.html">홈</a> &rsaquo; <span>대출 정보센터</span>
            </nav>
            <h1>대출 정보센터</h1>
            <p class="page-hero-sub">
                병의원·약국 원장님이 자금을 다룰 때 필요한 내용을 <strong>${pages.length}개 주제</strong>로 정리했습니다.
                상품 정의부터 한도 산식, 서류, 거절 대응, 불법 사금융 구분까지 — 상담 전에 먼저 읽어보세요.
            </p>
            <div class="page-hero-actions">
                <a href="index.html#consultation" class="btn btn-primary btn-lg">30초 한도 조회</a>
                <a href="tel:0507-1434-3226" class="btn btn-outline btn-lg">전화 상담 0507-1434-3226</a>
            </div>
        </div>
    </section>

    <section class="section">
        <div class="container">
            <div class="answer-box">
                <p class="answer-lead"><strong>어디부터 봐야 할지 모르겠다면 —</strong>
                개원을 준비 중이면 <a href="opening-fund.html">개원자금 대출</a>,
                한도가 안 나오면 <a href="dsr-exempt-loan.html">DSR 한도 초과</a>,
                운영자금이 필요하면 <a href="working-capital.html">병의원 운영자금</a>,
                용어가 어렵다면 <a href="loan-glossary.html">금융 용어사전</a>부터 보세요.</p>
            </div>
        </div>
    </section>

    <section class="section">
        <div class="container">
${sections}
        </div>
    </section>

    <section class="section cta-band">
        <div class="container">
            <h2>읽어봐도 내 경우가 애매하다면, 물어보세요</h2>
            <p>신용점수에 영향 없는 한도 조회. 고객 부담 수수료 0원. 평균 3영업일 내 결과 안내.</p>
            <div class="page-hero-actions">
                <a href="index.html#consultation" class="btn btn-primary btn-lg">무료 한도 조회</a>
                <a href="https://open.kakao.com/o/sfat86jh" class="btn btn-outline btn-lg" target="_blank" rel="noopener noreferrer">카카오톡 상담</a>
            </div>
        </div>
    </section>
${chromeBottom}`;

fs.writeFileSync(path.join(ROOT, 'loan-info.html'), html, 'utf8');
console.log(`loan-info.html 생성 — ${pages.length}개 문서 / ${CATS.filter(([c]) => grouped[c]).length}개 카테고리`);
