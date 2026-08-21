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


// ── 후킹 카피 엔진 ────────────────────────────────────────
// 카테고리(p.cat)와 페이지 제목에서 주제를 뽑아, 페이지마다 다른 훅을 만든다.
// 같은 카테고리 안에서도 슬러그 해시로 변형을 돌려 인접 페이지가 겹치지 않게 한다.
function hashOf(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
}
const pick = (arr, seed) => arr[seed % arr.length];

const HOOKS = {
    '과목별 자금': ['견적서보다 한도를 먼저', '리스 이자, 알고 쓰십니까', '자금이 반토막 나는 구간'],
    '진료과목별': ['연봉이 아니라 매출로 봅니다', '진료과마다 기준이 다릅니다', '한도가 안 나오신다면'],
    '지역별': ['지역 사정을 아는 곳에서', '상권에 따라 조건이 달라집니다'],
    '상황별': ['아직 방법이 남아 있습니다', '거절에는 이유가 있습니다'],
    '용어·상품': ['이름만 보고 고르지 마세요', '구조를 알면 이자가 줄어듭니다'],
    '가이드': ['계약 전에 확인하세요', '실무에서 갈리는 지점'],
    '목적별': ['한 번에 잡는 편이 유리합니다', '나눠 빌릴수록 손해입니다'],
    '직역별': ['내 직역에 맞는 상품이 있습니다', '면허마다 산정이 다릅니다'],
};

const URG = {
    '과목별 자금': {
        h: '장비 계약서에 서명하기 전에,<br>내 한도부터 아셔야 합니다',
        p: '견적을 받고 나서 자금을 알아보면 이미 늦습니다. 리스나 할부로 급하게 메우면 <strong>연 10%대 이자</strong>를 몇 년간 부담하게 됩니다. 계약 전에 한도를 알고 협상하는 것과, 모르고 끌려가는 것은 총비용이 다릅니다.',
    },
    '진료과목별': {
        h: '매출이 좋아도 한도가<br>안 나오는 이유는 따로 있습니다',
        p: '은행은 원장님 <strong>개인 연소득</strong>으로 계산합니다. 병원이 아무리 잘 돌아가도 DSR에 걸리면 한도가 깎입니다. 저희는 <strong>카드매출 흐름</strong>을 봅니다. 기준이 다르면 결과도 달라집니다.',
    },
    '지역별': {
        h: '같은 조건인데<br>지역 따라 한도가 갈립니다',
        p: '임차 시세, 상권 규모, 제휴 금융기관 지점망에 따라 실행 조건이 달라집니다. 지역 사정을 모르는 곳에서 상담받으면 <strong>받을 수 있는 한도를 놓칩니다.</strong>',
    },
    '상황별': {
        h: '거절 사유를 모른 채<br>다시 신청하면 또 막힙니다',
        p: '거절은 대부분 신용 문제가 아니라 <strong>상품과 상황이 맞지 않아서</strong> 생깁니다. 무작정 여러 곳에 신청하면 조회 이력만 쌓이고 조건은 더 나빠집니다. 상황에 맞는 구조부터 잡아야 합니다.',
    },
    '용어·상품': {
        h: '이름이 비슷하다고<br>조건까지 같지 않습니다',
        p: '같은 이름으로 불려도 취급 기관에 따라 <strong>한도·금리·상환 방식이 전부 다릅니다.</strong> 구조를 모르고 고르면 몇 년간 이자로 그 차이를 부담하게 됩니다.',
    },
    '가이드': {
        h: '모르고 서명하면<br>그 차이는 몇 년을 갑니다',
        p: '금리 0.5%p, 거치기간 1년, 상환 방식 하나가 총부담을 크게 바꿉니다. <strong>계약서에 도장을 찍기 전에</strong> 확인해야 하는 항목들입니다.',
    },
    '목적별': {
        h: '용도를 쪼개서 여러 번 빌리면<br>총 이자만 늘어납니다',
        p: '급한 대로 나눠 빌리다 보면 각각 다른 금리와 상환일이 생깁니다. <strong>한 번에 필요한 만큼</strong> 잡는 편이 총비용과 관리 면에서 유리합니다.',
    },
    '직역별': {
        h: '면허는 같아도<br>상품은 직역마다 다릅니다',
        p: '의사·치과의사·한의사·약사·수의사는 각각 <strong>한도 산정 방식이 다릅니다.</strong> 내 직역에 맞지 않는 상품으로 신청하면 한도가 낮게 나오거나 거절됩니다.',
    },
};

const DEFAULT_HOOK = '조건부터 확인하세요';
const DEFAULT_URG = {
    h: '한도를 모르면<br>협상 자리에서 아무 말도 못 합니다',
    p: '계약금을 걸기 전에, 서명하기 전에 <strong>내 한도를 알고 있어야</strong> 합니다. 조회는 30초, 신용점수에는 영향이 없습니다.',
};

function hookOf(p) {
    const seed = hashOf(p.slug);
    const arr = HOOKS[p.cat];
    return arr ? pick(arr, seed) : DEFAULT_HOOK;
}
function urgOf(p) {
    return URG[p.cat] || DEFAULT_URG;
}


// ── 거래 병의원 로고 월 ───────────────────────────────────
// images/portfolio 에 있는 실제 거래처 로고 39개. 페이지마다 시작점을 돌려
// 같은 조합이 반복되지 않게 한다.
const NL = String.fromCharCode(10);
const LOGOS = (() => {
    const a = [];
    for (let i = 1; i <= 35; i++) a.push(`hospital-${String(i).padStart(2, '0')}.png`);
    for (let i = 36; i <= 39; i++) a.push(`hospital-${i}.jpg`);
    return a;
})();
function logoWall(p) {
    const start = hashOf(p.slug) % LOGOS.length;
    const items = [];
    for (let i = 0; i < 12; i++) items.push(LOGOS[(start + i) % LOGOS.length]);
    return `
    <section class="hl-wall">
        <div class="container">
            <div class="hl-wall-head">
                <span class="hl-wall-tag">Clients</span>
                <h2 class="hl-wall-h">이미 함께하고 있는 병의원입니다</h2>
                <p class="hl-wall-p">전국 1,700곳 이상의 병의원·약국이 메디플라톤을 통해 자금을 조달했습니다.</p>
            </div>
            <div class="hl-wall-grid">
${items.map((f) => `                <div class="hl-wall-i"><img src="images/portfolio/${f}" alt="거래 병의원" loading="lazy"></div>`).join(NL)}
            </div>
            <p class="hl-wall-foot">일부만 표기했으며, 로고는 각 의료기관의 자산입니다.</p>
        </div>
    </section>`;
}

// ── 페이지 렌더 ────────────────────────────────────────────
function render(p) {
    const url = `${SITE}/${p.slug}.html`;
    const kw = p.keywords.join(', ');
    // 요약표 제목용 짧은 이름 — h1 의 부제(— 뒤)를 떼고 쓴다
    const shortName = p.short || p.h1.split(' — ')[0].trim();

    // 한눈에 보기 표
    const summary = p.summary && p.summary.length ? `
    <section class="section">
        <div class="container">
            <h2>${esc(shortName)} 한눈에 보기</h2>
            <div class="table-wrap">
                <table class="data-table">
                    <caption class="sr-only">${esc(shortName)} 핵심 요약</caption>
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
    <link rel="stylesheet" href="design-v2.css">
    <link rel="stylesheet" href="hub-lp.css">
    <link rel="stylesheet" href="live-urgency.css">

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
            <span class="hl-hook"><i></i>${esc(hookOf(p))}</span>
            <h1>${esc(p.h1)}</h1>
            <p class="page-hero-sub">${p.lead}</p>
            <div class="hl-hero-trust">
                <span>신협중앙회 정식 제휴</span>
                <span>KB국민카드 공식 제휴</span>
                <span>금융위 등록 중개업</span>
            </div>
            <div class="page-hero-actions">
                <a href="index.html#consultation" class="btn btn-primary btn-lg">30초 한도 조회</a>
                <a href="tel:0507-1375-2717" class="btn btn-outline btn-lg">전화 상담 0507-1375-2717</a>
            </div>
            <div class="hl-metrics">
                <div class="hl-metric"><div class="hl-metric-n">최대 3억</div><div class="hl-metric-t">카드매출 기반 한도</div></div>
                <div class="hl-metric"><div class="hl-metric-n">3영업일</div><div class="hl-metric-t">평균 심사·입금</div></div>
                <div class="hl-metric"><div class="hl-metric-n">0원</div><div class="hl-metric-t">고객 부담 수수료</div></div>
            </div>
        </div>
    </section>

    <!-- 제휴 로고 -->
    <section class="hl-strip">
        <div class="container">
            <p class="hl-strip-lbl">정식 제휴 금융기관</p>
            <div class="hl-strip-row">
                <img src="logo/신협로고.png" alt="신협중앙회" loading="lazy">
                <img src="logo/kb-card.png" alt="KB국민카드" loading="lazy">
                <img src="logo/shinhan-card.png" alt="신한카드" loading="lazy">
                <img src="logo/samsung-card.png" alt="삼성카드" loading="lazy">
                <img src="logo/hyundai-card.png" alt="현대카드" loading="lazy">
                <img src="logo/lotte-card.png" alt="롯데카드" loading="lazy">
                <img src="logo/hana-card.png" alt="하나카드" loading="lazy">
            </div>
        </div>
    </section>

    <!-- 긴급성 · 손실 회피 -->
    <section class="hl-urgency">
        <div class="container">
            <div class="hl-urg-in">
                <div>
                    <span class="hl-urg-tag">지금 확인해야 하는 이유</span>
                    <h2 class="hl-urg-h">${urgOf(p).h}</h2>
                    <p class="hl-urg-p">${urgOf(p).p}</p>
                </div>
                <div class="hl-urg-card">
                    <div class="hl-urg-row"><span class="hl-urg-k">한도 조회 소요</span><span class="hl-urg-v hl-urg-v--ok">30초</span></div>
                    <div class="hl-urg-row"><span class="hl-urg-k">신용점수 영향</span><span class="hl-urg-v hl-urg-v--ok">없음</span></div>
                    <div class="hl-urg-row"><span class="hl-urg-k">필요 서류</span><span class="hl-urg-v">3장</span></div>
                    <div class="hl-urg-row"><span class="hl-urg-k">평균 심사·입금</span><span class="hl-urg-v">3영업일</span></div>
                    <div class="hl-urg-row"><span class="hl-urg-k">고객 부담 수수료</span><span class="hl-urg-v hl-urg-v--ok">0원</span></div>
                </div>
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

    <!-- 은행과 무엇이 다른가 -->
    <section class="section">
        <div class="container">
            <h2>은행과 무엇이 다릅니까</h2>
            <div class="hl-vs">
                <div class="hl-vs-row hl-vs-row--h">
                    <div class="hl-vs-k">구분</div>
                    <div class="hl-vs-b">은행 · 기존 상품</div>
                    <div class="hl-vs-c">메디플라톤</div>
                </div>
                <div class="hl-vs-row">
                    <div class="hl-vs-k">심사 기준</div>
                    <div class="hl-vs-b">개인 연소득 · 신용등급</div>
                    <div class="hl-vs-c">병의원·약국 카드매출 흐름</div>
                </div>
                <div class="hl-vs-row">
                    <div class="hl-vs-k">DSR</div>
                    <div class="hl-vs-b">연소득 기준으로 한도 차감</div>
                    <div class="hl-vs-c">별도 산정</div>
                </div>
                <div class="hl-vs-row">
                    <div class="hl-vs-k">필요 서류</div>
                    <div class="hl-vs-b">소득증빙 등 다수 · 보완 반복</div>
                    <div class="hl-vs-c">사업자등록증 · 신분증 · 매출자료</div>
                </div>
                <div class="hl-vs-row">
                    <div class="hl-vs-k">소요 기간</div>
                    <div class="hl-vs-b">서류 보완 시 2~3주</div>
                    <div class="hl-vs-c">평균 3영업일</div>
                </div>
                <div class="hl-vs-row">
                    <div class="hl-vs-k">고객 부담 수수료</div>
                    <div class="hl-vs-b">중개 수수료 요구 사례 있음</div>
                    <div class="hl-vs-c">0원 — 제휴 금융기관에서 수취</div>
                </div>
            </div>
        </div>
    </section>

${logoWall(p)}

    <!-- 절차 -->
    <section class="section section-alt">
        <div class="container">
            <h2>신청부터 입금까지 평균 3영업일</h2>
            <div class="hl-steps">
                <div class="hl-step"><div class="hl-step-n">1</div><h3>한도 조회</h3><p>성함과 연락처만 남기시면 됩니다. 30초면 끝나고 신용점수에 영향이 없습니다.</p></div>
                <div class="hl-step"><div class="hl-step-n">2</div><h3>전문 상담</h3><p>전담 상담사가 연락드려 자금 용도와 일정을 확인합니다.</p></div>
                <div class="hl-step"><div class="hl-step-n">3</div><h3>서류 · 심사</h3><p>서류 세 가지를 비대면으로 접수하고 제휴 금융기관이 심사합니다.</p></div>
                <div class="hl-step"><div class="hl-step-n">4</div><h3>약정 · 입금</h3><p>조건에 동의하시면 계좌로 입금됩니다.</p></div>
            </div>
        </div>
    </section>
${faq}
${related}

    <section class="hl-final">
        <div class="container">
            <div class="hl-final-panel">
                <div class="hl-final-badge"><i></i>전담 상담사 연결</div>
                <h2>${esc(p.ctaTitle || shortName + ', 한도부터 확인하세요')}</h2>
                <p>지금 조회해두면 계약이나 견적 자리에서 흔들리지 않습니다.<br>조회는 30초, 신용점수에는 영향이 없습니다.</p>
                <div class="page-hero-actions">
                    <a href="index.html#consultation" class="btn btn-primary btn-lg">무료 한도 조회</a>
                    <a href="https://open.kakao.com/o/sfat86jh" class="btn btn-outline btn-lg" target="_blank" rel="noopener noreferrer">카카오톡 상담</a>
                </div>
                <div class="hl-final-list">
                    <span>신용점수 영향 없음</span>
                    <span>고객 부담 수수료 0원</span>
                    <span>서류 3장</span>
                    <span>평균 3영업일</span>
                </div>
            </div>
        </div>
    </section>

    <section class="hl-notice">
        <div class="container">
            <h4>안내 및 유의사항</h4>
            <ul>
                <li>메디플라톤은 신협중앙회·KB국민카드 등 제휴 금융기관의 대출 상품을 안내하는 금융 중개 플랫폼이며, 대출 여부 및 조건은 각 금융기관의 심사 결과에 따릅니다.</li>
                <li>본문에 기재된 한도·금리·기간은 상품상 기준이며, 실제 조건은 매출 규모·신용 상태·자금 용도에 따라 달라집니다. 심사 결과에 따라 대출이 거절될 수 있습니다.</li>
                <li>과도한 대출은 개인신용에 부정적 영향을 미칠 수 있으며, 대출 취급 시 신용등급이 하락할 수 있습니다.</li>
                <li>고객 부담 수수료는 없으며, 어떠한 명목으로도 선입금을 요구하지 않습니다.</li>
            </ul>
        </div>
    </section>

    <div class="hl-dock">
        <div class="hl-dock-txt">
            <div class="hl-dock-t1">신용점수 영향 없음 · 수수료 0원</div>
            <div class="hl-dock-t2">30초 한도 조회</div>
        </div>
        <a href="index.html#consultation" class="hl-dock-btn">한도 조회</a>
    </div>
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
