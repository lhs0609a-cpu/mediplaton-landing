/**
 * SEO 콘텐츠 허브 빌더
 *
 * loan-doctor.html 을 크롬(헤더/네비/푸터/스크립트) 소스로 삼아,
 * seo/pages.js 의 데이터로 키워드 랜딩 페이지를 대량 생성한다.
 *
 * 실행: node seo/build.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://loan.brandplaton.com';
const TEMPLATE = path.join(ROOT, 'loan-doctor.html');

const pages = require('./pages.js');

// ── 크롬 추출 ──────────────────────────────────────────────
const tpl = fs.readFileSync(TEMPLATE, 'utf8');
const bodyOpen = tpl.indexOf('<body');
const mainOpen = tpl.indexOf('<main id="main-content">');
const mainClose = tpl.indexOf('</main>');
if (bodyOpen < 0 || mainOpen < 0 || mainClose < 0) {
    throw new Error('템플릿에서 <body>/<main> 경계를 찾지 못했습니다.');
}
const chromeTop = tpl.slice(bodyOpen, mainOpen + '<main id="main-content">'.length);
const chromeBottom = tpl.slice(mainClose);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// JSON-LD 안에 들어갈 평문(태그 제거)
const plain = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const byslug = {};
pages.forEach((p) => { byslug[p.slug] = p; });

// ── 페이지 렌더 ────────────────────────────────────────────
function render(p) {
    const url = `${SITE}/${p.slug}.html`;
    const kw = p.keywords.join(', ');

    // 한눈에 보기 표
    const summary = p.summary && p.summary.length ? `
    <section class="section">
        <div class="container">
            <h2>${esc(p.h1)} 한눈에 보기</h2>
            <div class="table-wrap">
                <table class="data-table">
                    <caption class="sr-only">${esc(p.h1)} 핵심 요약</caption>
                    <tbody>
${p.summary.map(([k, v]) => `                        <tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('\n')}
                    </tbody>
                </table>
            </div>
        </div>
    </section>` : '';

    // 본문 블록
    const blocks = p.blocks.map((b, i) => `
    <section class="section${i % 2 === 0 ? ' section-alt' : ''}">
        <div class="container">
            <h2>${b.h}</h2>
${b.p ? `            <p>${b.p}</p>` : ''}
${b.list ? `            <ul class="check-list">\n${b.list.map((li) => `                <li>${li}</li>`).join('\n')}\n            </ul>` : ''}
${b.sub ? b.sub.map((s) => `            <h3>${s.h}</h3>\n            <p>${s.p}</p>`).join('\n') : ''}
        </div>
    </section>`).join('');

    // FAQ
    const faq = `
    <section class="section">
        <div class="container">
            <h2>자주 묻는 질문 (FAQ)</h2>
            <div class="faq-list">
${p.faq.map((f) => `                <details class="faq-item">
                    <summary>${f.q}</summary>
                    <div class="faq-answer"><p>${f.a}</p></div>
                </details>`).join('\n')}
            </div>
        </div>
    </section>`;

    // 관련 문서 (내부 링크 메시)
    const rel = (p.related || []).filter((s) => byslug[s]);
    const related = `
    <section class="section section-alt">
        <div class="container">
            <h2>함께 보면 좋은 문서</h2>
            <ul class="link-grid">
${rel.map((s) => `                <li><a href="${s}.html">${esc(byslug[s].h1)}</a></li>`).join('\n')}
                <li><a href="loan-info.html">대출 정보센터 전체 목록</a></li>
            </ul>
        </div>
    </section>`;

    // JSON-LD
    const ld = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: '홈', item: SITE },
                    { '@type': 'ListItem', position: 2, name: '대출 정보센터', item: `${SITE}/loan-info.html` },
                    { '@type': 'ListItem', position: 3, name: p.h1, item: url },
                ],
            },
            {
                '@type': 'Article',
                headline: p.h1,
                description: plain(p.metaDesc),
                inLanguage: 'ko-KR',
                mainEntityOfPage: url,
                author: { '@type': 'Organization', name: '메디플라톤', url: SITE },
                publisher: { '@type': 'Organization', name: '메디플라톤', url: SITE },
                about: p.keywords,
                isPartOf: { '@type': 'WebSite', name: '메디플라톤', url: SITE },
            },
            {
                '@type': 'FAQPage',
                mainEntity: p.faq.map((f) => ({
                    '@type': 'Question',
                    name: plain(f.q),
                    acceptedAnswer: { '@type': 'Answer', text: plain(f.a) },
                })),
            },
        ],
    };

    return `<!DOCTYPE html>
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
    <title>${esc(p.metaTitle)}</title>
    <meta name="description" content="${esc(plain(p.metaDesc))}">
    <meta name="keywords" content="${esc(kw)}">
    <meta name="author" content="메디플라톤">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${url}">
    <link rel="alternate" type="application/rss+xml" title="메디플라톤 RSS" href="${SITE}/rss.xml" />

    <meta property="og:type" content="article">
    <meta property="og:title" content="${esc(p.metaTitle)}">
    <meta property="og:description" content="${esc(plain(p.metaDesc))}">
    <meta property="og:url" content="${url}">
    <meta property="og:site_name" content="메디플라톤">
    <meta property="og:locale" content="ko_KR">
    <meta property="og:image" content="${SITE}/images/og-image.jpg">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(p.metaTitle)}">
    <meta name="twitter:description" content="${esc(plain(p.metaDesc))}">
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

    <!-- Hero -->
    <section class="page-hero">
        <div class="container">
            <nav class="breadcrumb" aria-label="현재 위치">
                <a href="index.html">홈</a> &rsaquo; <a href="loan-info.html">대출 정보센터</a> &rsaquo; <span>${esc(p.h1)}</span>
            </nav>
            <h1>${esc(p.h1)}</h1>
            <p class="page-hero-sub">${p.lead}</p>
            <div class="page-hero-actions">
                <a href="index.html#consultation" class="btn btn-primary btn-lg">30초 한도 조회</a>
                <a href="tel:0507-1434-3226" class="btn btn-outline btn-lg">전화 상담 0507-1434-3226</a>
            </div>
        </div>
    </section>

    <!-- 요약 정의 (AI 인용 최적화) -->
    <section class="section">
        <div class="container">
            <div class="answer-box">
                <p class="answer-lead"><strong>한 줄 요약 —</strong> ${p.answer}</p>
            </div>
            <p>${p.intro}</p>
        </div>
    </section>
${summary}
${blocks}
${faq}
${related}

    <section class="section cta-band">
        <div class="container">
            <h2>${esc(p.ctaTitle || p.h1 + ', 한도부터 확인하세요')}</h2>
            <p>신용점수에 영향 없는 한도 조회. 고객 부담 수수료 0원. 평균 3영업일 내 결과 안내.</p>
            <div class="page-hero-actions">
                <a href="index.html#consultation" class="btn btn-primary btn-lg">무료 한도 조회</a>
                <a href="https://open.kakao.com/o/sfat86jh" class="btn btn-outline btn-lg" target="_blank" rel="noopener noreferrer">카카오톡 상담</a>
            </div>
        </div>
    </section>
${chromeBottom}`;
}

// ── 실행 ──────────────────────────────────────────────────
let n = 0;
pages.forEach((p) => {
    const out = path.join(ROOT, `${p.slug}.html`);
    fs.writeFileSync(out, render(p), 'utf8');
    n++;
});
console.log(`생성 완료: ${n} 페이지`);

// 허브 페이지에서 쓸 목록을 JSON 으로도 남긴다
fs.writeFileSync(
    path.join(__dirname, 'pages.index.json'),
    JSON.stringify(pages.map((p) => ({ slug: p.slug, h1: p.h1, cat: p.cat, desc: plain(p.metaDesc) })), null, 2),
    'utf8'
);
console.log('pages.index.json 갱신');
