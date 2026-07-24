/**
 * 전 페이지 네비게이션에 「대출 정보센터」 링크 삽입.
 * 상단 탭은 추가하지 않는다 — 기존 '이용안내' 드롭다운 안에만 넣는다.
 * 실행: node seo/patch-nav.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// 데스크톱: 이용안내 드롭다운의 FAQ 링크 뒤에 삽입
const DESKTOP_ANCHOR = '<a href="guide.html#faq">자주 묻는 질문</a>';
const DESKTOP_ADD = '\n                                <a href="loan-info.html">대출 정보센터</a>';

// 모바일: '이용안내' 그룹 뒤에 삽입
const MOBILE_ANCHOR = '<div class="mobile-nav-group"><a href="guide.html" class="mobile-nav-title single">이용안내</a></div>';
const MOBILE_ADD = '\n                <div class="mobile-nav-group"><a href="loan-info.html" class="mobile-nav-title single">대출 정보센터</a></div>';

// 플랫형 네비(드롭다운 없는 페이지): '이용안내' li 를 드롭다운으로 승격
const FLAT_RE = /<li class="nav-item"><a href="guide\.html" class="nav-link"([^>]*)>이용안내<\/a><\/li>/;
const flatReplace = (attrs) => `<li class="nav-item">
                            <a href="guide.html" class="nav-link"${attrs}>이용안내</a>
                            <div class="nav-dropdown">
                                <a href="guide.html">이용안내 전체</a>
                                <a href="guide.html#process">신청 절차</a>
                                <a href="guide.html#documents">필요 서류</a>
                                <a href="guide.html#faq">자주 묻는 질문</a>
                                <a href="loan-info.html">대출 정보센터</a>
                            </div>
                        </li>`;

const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
let patched = 0, skipped = 0, noNav = 0;

files.forEach((f) => {
    const p = path.join(ROOT, f);
    let c = fs.readFileSync(p, 'utf8');

    const hasDesktop = c.includes(DESKTOP_ANCHOR);
    const hasFlat = FLAT_RE.test(c);
    const hasMobile = c.includes(MOBILE_ANCHOR);
    if (!hasDesktop && !hasFlat && !hasMobile) { noNav++; return; }

    let changed = false;

    // 플랫형을 먼저 승격 (승격 후에는 DESKTOP_ANCHOR 가 생기므로 아래 분기에서 처리됨)
    if (hasFlat) {
        c = c.replace(FLAT_RE, (_m, attrs) => flatReplace(attrs));
        changed = true;
    }

    if (c.includes(DESKTOP_ANCHOR) && !c.includes(DESKTOP_ANCHOR + DESKTOP_ADD) && !c.includes('<a href="loan-info.html">대출 정보센터</a>')) {
        c = c.replace(DESKTOP_ANCHOR, DESKTOP_ANCHOR + DESKTOP_ADD);
        changed = true;
    }
    if (hasMobile && !c.includes(MOBILE_ANCHOR + MOBILE_ADD)) {
        c = c.replace(MOBILE_ANCHOR, MOBILE_ANCHOR + MOBILE_ADD);
        changed = true;
    }

    if (changed) { fs.writeFileSync(p, c, 'utf8'); patched++; }
    else skipped++;
});

console.log(`nav 패치: ${patched}개 수정 / ${skipped}개 이미 적용 / ${noNav}개 네비 없음 (총 ${files.length})`);
