/**
 * live-urgency.js — 당일 상담 마감 카운트다운 + 실시간 접수 알림
 *
 * 설계 원칙
 *   · 카운트다운은 실제 영업시간(평일 09:00~18:00, KST)을 기준으로 한다.
 *     새로고침해도 리셋되지 않으며, 마감 후에는 다음 영업일을 가리킨다.
 *     페이지를 열 때마다 되살아나는 가짜 마감 타이머는 쓰지 않는다.
 *   · 알림은 /api/stats 의 실제 접수 데이터만 쓴다. 데이터가 없으면 아무것도 띄우지 않는다.
 *     이름은 서버에서 아예 조회하지 않으므로 표시할 수 없다(의도된 설계).
 */
(function () {
    'use strict';

    var KST_OFFSET = 9 * 60; // 분
    var OPEN_HOUR = 9;
    var CLOSE_HOUR = 18;

    /* ── 한국 시간 기준 현재 시각 ───────────────────────── */
    function nowKST() {
        var d = new Date();
        return new Date(d.getTime() + (d.getTimezoneOffset() + KST_OFFSET) * 60000);
    }

    /* ── 다음 마감 시각(평일 18:00 KST) ─────────────────── */
    function nextDeadline() {
        var n = nowKST();
        var d = new Date(n.getFullYear(), n.getMonth(), n.getDate(), CLOSE_HOUR, 0, 0, 0);
        // 오늘이 주말이거나 이미 마감했으면 다음 영업일로
        var guard = 0;
        while (guard++ < 10) {
            var dow = d.getDay(); // 0 일, 6 토
            if (dow !== 0 && dow !== 6 && d > n) return d;
            d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, CLOSE_HOUR, 0, 0, 0);
        }
        return d;
    }

    function isOpenNow() {
        var n = nowKST();
        var dow = n.getDay();
        if (dow === 0 || dow === 6) return false;
        return n.getHours() >= OPEN_HOUR && n.getHours() < CLOSE_HOUR;
    }

    var pad = function (v) { return v < 10 ? '0' + v : '' + v; };

    /* ── 카운트다운 바 ──────────────────────────────────── */
    function mountCountdown() {
        if (document.querySelector('.lu-bar')) return;

        var bar = document.createElement('div');
        bar.className = 'lu-bar';
        bar.innerHTML =
            '<div class="lu-bar-in">' +
                '<span class="lu-dot"></span>' +
                '<span class="lu-label"></span>' +
                '<span class="lu-clock" aria-live="off">' +
                    '<b class="lu-h">00</b><i>:</i><b class="lu-m">00</b><i>:</i><b class="lu-s">00</b>' +
                '</span>' +
                '<a class="lu-cta" href="index.html#consultation">지금 신청</a>' +
            '</div>';
        document.body.appendChild(bar);

        var label = bar.querySelector('.lu-label');
        var eh = bar.querySelector('.lu-h');
        var em = bar.querySelector('.lu-m');
        var es = bar.querySelector('.lu-s');

        function tick() {
            var dl = nextDeadline();
            var diff = Math.max(0, dl - nowKST());
            var total = Math.floor(diff / 1000);
            var h = Math.floor(total / 3600);
            var m = Math.floor((total % 3600) / 60);
            var s = total % 60;

            eh.textContent = pad(h);
            em.textContent = pad(m);
            es.textContent = pad(s);

            label.textContent = isOpenNow()
                ? '오늘 상담 접수 마감까지'
                : '다음 상담 접수 시작까지';
        }
        tick();
        setInterval(tick, 1000);
    }

    /* ── 실시간 접수 알림 ───────────────────────────────── */
    function mountToasts(stats) {
        if (!stats || !stats.ok) return;
        var list = (stats.recent || []).filter(function (r) { return r.biz || r.region; });
        if (!list.length) return;

        var wrap = document.createElement('div');
        wrap.className = 'lu-toasts';
        wrap.setAttribute('aria-live', 'polite');
        document.body.appendChild(wrap);
        layout(); // 토스트는 fetch 이후에 생기므로 위치를 다시 잡아준다

        function ago(mins) {
            if (mins < 60) return mins + '분 전';
            var h = Math.floor(mins / 60);
            if (h < 24) return h + '시간 전';
            return Math.floor(h / 24) + '일 전';
        }

        var i = 0;
        function pop() {
            var r = list[i % list.length];
            i++;

            var who = [r.region, r.biz].filter(Boolean).join(' ');
            var el = document.createElement('div');
            el.className = 'lu-toast';
            el.innerHTML =
                '<span class="lu-toast-ic">✓</span>' +
                '<span class="lu-toast-tx">' +
                    '<b>' + who + '</b> 상담이 접수되었습니다' +
                    '<em>' + ago(r.mins) + '</em>' +
                '</span>';
            wrap.appendChild(el);

            requestAnimationFrame(function () { el.classList.add('is-in'); });
            setTimeout(function () {
                el.classList.remove('is-in');
                setTimeout(function () { el.remove(); }, 400);
            }, 5000);
        }

        // 오늘 접수 건수를 먼저 한 번 알린다
        if (stats.todayCount > 0) {
            setTimeout(function () {
                var el = document.createElement('div');
                el.className = 'lu-toast lu-toast--sum';
                el.innerHTML = '<span class="lu-toast-ic">📈</span><span class="lu-toast-tx">' +
                    '<b>오늘 ' + stats.todayCount + '건</b>의 상담이 접수되었습니다<em>최근 7일 ' + stats.weekCount + '건</em></span>';
                wrap.appendChild(el);
                requestAnimationFrame(function () { el.classList.add('is-in'); });
                setTimeout(function () {
                    el.classList.remove('is-in');
                    setTimeout(function () { el.remove(); }, 400);
                }, 6000);
            }, 4000);
        }

        setTimeout(function () {
            pop();
            setInterval(pop, 11000);
        }, 12000);
    }

    /* ── 기존 하단 고정 CTA(.hl-dock/.pt-dock/.px-dock)와 겹치지 않게 배치 ──
       CSS 의 :has() 를 지원하지 않는 브라우저를 위한 이중 안전장치이자,
       본문이 고정 요소에 가리지 않도록 body 하단 여백을 실제 높이로 잡아준다. */
    function layout() {
        var dock = document.querySelector('.hl-dock, .pt-dock, .px-dock');
        var bar = document.querySelector('.lu-bar');
        if (!bar) return;

        var dockH = 0;
        if (dock && getComputedStyle(dock).display !== 'none') {
            dockH = dock.offsetHeight || 0;
            document.body.classList.add('lu-has-dock');
            bar.style.bottom = dockH + 'px';
        } else {
            document.body.classList.remove('lu-has-dock');
            bar.style.bottom = '0px';
        }
        document.body.style.paddingBottom = (dockH + (bar.offsetHeight || 0) + 8) + 'px';

        var toasts = document.querySelector('.lu-toasts');
        if (toasts) toasts.style.bottom = (dockH + (bar.offsetHeight || 0) + 16) + 'px';
    }

    function start() {
        mountCountdown();
        layout();
        window.addEventListener('resize', layout);
        setTimeout(layout, 600);
        fetch('/api/stats')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(mountToasts)
            .catch(function () { /* 통계를 못 가져오면 알림은 띄우지 않는다 */ });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
