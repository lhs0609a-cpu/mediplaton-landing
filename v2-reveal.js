/* ==========================================================================
   v2-reveal.js — 스크롤 진입 리빌
   --------------------------------------------------------------------------
   안전 설계: 숨김 클래스를 JS가 직접 붙인다.
   → 스크립트가 실행되지 않으면 아무것도 숨겨지지 않는다(콘텐츠 유실 없음).
   ========================================================================== */
(function () {
    'use strict';

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    // 히어로와 헤더는 제외한다. 첫 화면이 비어 보이면 안 된다.
    var SKIP = '.header,header,.hero,.footer,footer,.modal-overlay,.sticky-cta,.breadcrumb,[data-no-reveal]';

    // 리빌 대상: 섹션 안의 큰 블록들
    var TARGETS = [
        '.section-header',
        '.card', '.feature-card', '.product-card', '.case-card', '.guide-card',
        '.info-card', '.stat-card', '.service-card', '.benefit-card', '.step-card',
        '.hub-card', '.region-card', '.combo-card',
        '.faq-item', '.table-wrap', '.table-container'
    ].join(',');

    function run() {
        var nodes = document.querySelectorAll(TARGETS);
        if (!nodes.length) return;

        var io = new IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].isIntersecting) {
                    entries[i].target.classList.add('is-in');
                    io.unobserve(entries[i].target);
                }
            }
        }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

        var vh = window.innerHeight || 800;

        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];

            if (el.closest && el.closest(SKIP)) continue;

            // 이미 화면 안에 있는 요소는 애니메이션 없이 그대로 둔다.
            var top = el.getBoundingClientRect().top;
            if (top < vh * 0.92) continue;

            el.classList.add('v2-reveal');
            io.observe(el);
        }

        // 안전장치: 3초 뒤에도 남아 있는 요소는 강제로 보이게 한다.
        window.setTimeout(function () {
            var stuck = document.querySelectorAll('.v2-reveal:not(.is-in)');
            for (var j = 0; j < stuck.length; j++) {
                var r = stuck[j].getBoundingClientRect();
                if (r.top < (window.innerHeight || 800)) stuck[j].classList.add('is-in');
            }
        }, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
