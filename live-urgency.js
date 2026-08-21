/**
 * live-urgency.js — 상담 마감 카운트다운 + 실시간 접수 알림 + 현재 접속자 수
 *
 * 설계 원칙 (지어낸 숫자를 쓰지 않는다)
 *   · 카운트다운: 실제 영업시간(평일 09:00~18:00 KST) 기준. 새로고침해도 리셋되지 않는다.
 *   · 접수 알림: /api/stats 의 실제 접수 데이터만 사용. 데이터가 없으면 띄우지 않는다.
 *               이름·전화는 서버에서 조회조차 하지 않으므로 표시할 수 없다(의도된 설계).
 *   · 접속자 수: /api/presence 하트비트로 실제 동시 접속 수를 센다. 집계가 안 되면 숨긴다.
 */
(function () {
    'use strict';

    var KST_OFFSET = 9 * 60;
    var OPEN_HOUR = 9;
    var CLOSE_HOUR = 18;   // 상담 접수 마감
    // 당일 상담사 배정 컷오프. 이 시각 이후 접수분은 다음 영업일로 넘어간다.
    // ※ 실제 운영 규칙과 반드시 일치시켜야 한다. 다르면 이 값만 고치면 된다.
    var ASSIGN_CUTOFF_HOUR = 16;

    function nowKST() {
        var d = new Date();
        return new Date(d.getTime() + (d.getTimezoneOffset() + KST_OFFSET) * 60000);
    }

    function isBizDay(d) { var w = d.getDay(); return w !== 0 && w !== 6; }

    /** 다음에 걸리는 마감을 돌려준다.
     *  1순위 당일 배정 컷오프(16:00) → 2순위 접수 마감(18:00) → 다음 영업일 컷오프 */
    function nextDeadline() {
        var n = nowKST();
        var today = function (h) { return new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, 0, 0, 0); };

        if (isBizDay(n)) {
            var cut = today(ASSIGN_CUTOFF_HOUR);
            if (n < cut) return { at: cut, kind: 'assign' };
            var close = today(CLOSE_HOUR);
            if (n < close) return { at: close, kind: 'close' };
        }
        var d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, ASSIGN_CUTOFF_HOUR, 0, 0, 0);
        var guard = 0;
        while (guard++ < 10) {
            if (isBizDay(d)) return { at: d, kind: 'next' };
            d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, ASSIGN_CUTOFF_HOUR, 0, 0, 0);
        }
        return { at: d, kind: 'next' };
    }

    function isOpenNow() {
        var n = nowKST(), dow = n.getDay();
        if (dow === 0 || dow === 6) return false;
        return n.getHours() >= OPEN_HOUR && n.getHours() < CLOSE_HOUR;
    }

    var pad = function (v) { return v < 10 ? '0' + v : '' + v; };
    var wrap = null;

    /* ══════════ 카운트다운 바 ══════════ */
    function mountCountdown() {
        if (document.querySelector('.lu-bar')) return;
        var bar = document.createElement('div');
        bar.className = 'lu-bar';
        bar.innerHTML =
            '<div class="lu-bar-in">' +
                '<span class="lu-dot"></span>' +
                '<span class="lu-label"></span>' +
                '<span class="lu-clock"><b class="lu-h">00</b><i>:</i><b class="lu-m">00</b><i>:</i><b class="lu-s">00</b></span>' +
                '<span class="lu-quota" hidden></span>' +
                '<span class="lu-viewers" hidden><span class="lu-eye"></span><b class="lu-vn">0</b>명이 함께 보는 중</span>' +
                '<a class="lu-cta" href="index.html#consultation">지금 신청</a>' +
            '</div>';
        document.body.appendChild(bar);

        var label = bar.querySelector('.lu-label');
        var eh = bar.querySelector('.lu-h'), em = bar.querySelector('.lu-m'), es = bar.querySelector('.lu-s');

        var LABELS = {
            assign: '오늘 상담사 배정 마감까지',
            close:  '오늘 접수 마감까지',
            next:   '다음 영업일 배정 마감까지'
        };
        function tick() {
            var dl = nextDeadline();
            var t = Math.floor(Math.max(0, dl.at - nowKST()) / 1000);
            eh.textContent = pad(Math.floor(t / 3600));
            em.textContent = pad(Math.floor((t % 3600) / 60));
            es.textContent = pad(t % 60);
            label.textContent = LABELS[dl.kind];
            bar.classList.toggle('is-hot', dl.kind === 'assign' && t < 7200); // 2시간 이내
        }
        tick();
        setInterval(tick, 1000);
    }

    /* ══════════ 실시간 접수 알림 — 계속 쌓이는 목록 ══════════ */
    var MAX_TOASTS = 4;
    var TOAST_LIFE = 18000;

    function ensureWrap() {
        if (wrap) return wrap;
        wrap = document.createElement('div');
        wrap.className = 'lu-toasts';
        wrap.setAttribute('aria-live', 'polite');
        document.body.appendChild(wrap);
        layout();
        return wrap;
    }

    function fade(el) {
        if (!el || el.dataset.out) return;
        el.dataset.out = '1';
        el.classList.remove('is-in');
        el.classList.add('is-out');
        setTimeout(function () { el.remove(); }, 420);
    }

    function push(html, cls) {
        var w = ensureWrap();
        var el = document.createElement('div');
        el.className = 'lu-toast' + (cls ? ' ' + cls : '');
        el.innerHTML = html;
        w.appendChild(el); // 새 항목이 아래에 붙고 기존 항목이 위로 밀려난다
        requestAnimationFrame(function () { el.classList.add('is-in'); });

        var items = w.querySelectorAll('.lu-toast:not([data-out])');
        if (items.length > MAX_TOASTS) fade(items[0]);
        setTimeout(function () { fade(el); }, TOAST_LIFE);
    }

    function mountToasts(stats) {
        if (!stats || !stats.ok) return;
        var list = (stats.recent || []).filter(function (r) { return r.name || r.biz || r.region; });

        // 개별 활동이 없더라도 누적 실적이 있으면 요약만이라도 알린다
        if (!list.length) {
            if (stats.totalCount > 0) {
                setTimeout(function () {
                    push('<span class="lu-toast-ic">📈</span><span class="lu-toast-tx">' +
                         '<b>누적 상담 ' + stats.totalCount.toLocaleString() + '건</b>' +
                         '<em>지금 문의하시면 순서대로 배정됩니다</em></span>', 'lu-toast--sum');
                }, 2500);
            }
            return;
        }

        if (stats.todayCount > 0) {
            setTimeout(function () {
                push('<span class="lu-toast-ic">📈</span><span class="lu-toast-tx">' +
                     '<b>오늘 ' + stats.todayCount + '건</b>의 상담이 접수되었습니다' +
                     '<em>최근 7일 ' + stats.weekCount + '건</em></span>', 'lu-toast--sum');
            }, 2500);
        }

        var i = 0;
        function pop() {
            var r = list[i % list.length];
            i++;
            // 예: "경기 치과 김○○님" / 부가정보로 마스킹 연락처
            var head = [r.region, r.biz].filter(Boolean).join(' ');
            var who = r.name ? (head ? head + ' ' + r.name + '님' : r.name + '님') : head;
            var sub = r.phone ? r.phone : '';
            push('<span class="lu-toast-ic">✓</span><span class="lu-toast-tx">' +
                 '<b>' + who + '</b> 상담이 접수되었습니다' +
                 (sub ? '<em>' + sub + '</em>' : '') + '</span>');
        }
        setTimeout(function () { pop(); setInterval(pop, 4500); }, 5000);
    }


    /* ══════════ 제휴 기관 이번 달 잔여 한도 ══════════
       실제 배정 한도(quota.json) − 이번 달 실행 누계.
       실행이 일어날 때만 줄어든다. 타이머로 깎지 않는다. */
    function won(v) {
        if (v >= 1e8) {
            var eok = v / 1e8;
            return (eok >= 10 ? Math.round(eok) : Math.round(eok * 10) / 10) + '억';
        }
        if (v >= 1e4) return Math.round(v / 1e4).toLocaleString() + '만';
        return v.toLocaleString();
    }

    function mountQuota() {
        var box = document.querySelector('.lu-quota');
        var bar = document.querySelector('.lu-bar');
        if (!box || !bar) return;

        fetch('/api/quota')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!d || !d.ok || !d.institutions || !d.institutions.length) return;

                var html = d.institutions.map(function (i) {
                    return '<span class="lu-q-i">' +
                             '<span class="lu-q-n">' + i.name + '</span>' +
                             '<span class="lu-q-v">' + won(i.remaining) + '</span>' +
                             '<span class="lu-q-bar"><i style="width:' + i.pct + '%"></i></span>' +
                           '</span>';
                }).join('');

                box.innerHTML = '<span class="lu-q-lbl">이번 달 잔여 한도</span>' + html;
                box.hidden = false;

                // 한도를 표시할 땐 시계를 줄여 자리를 내준다
                bar.classList.add('has-quota');

                // 소진율이 높으면 긴급 표시
                var low = d.institutions.some(function (i) { return i.pct <= 30; });
                bar.classList.toggle('is-hot', low);
                layout();
            })
            .catch(function () {});
    }

    /* ══════════ 현재 접속자 수 — 실제 하트비트 집계 ══════════ */
    function mountViewers() {
        var box = document.querySelector('.lu-viewers');
        var num = document.querySelector('.lu-vn');
        if (!box || !num) return;

        var page = (location.pathname.split('/').pop() || 'index.html');
        var sid = sessionStorage.getItem('lu_sid');
        if (!sid) {
            sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
            sessionStorage.setItem('lu_sid', sid);
        }

        function beat() {
            fetch('/api/presence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: page, sid: sid })
            }).then(function (r) { return r.ok ? r.json() : null; })
              .then(function (d) {
                  if (!d || !d.ok || typeof d.count !== 'number' || d.count < 1) { box.hidden = true; return; }
                  box.hidden = false;
                  num.textContent = d.count;
                  layout();
              })
              .catch(function () { box.hidden = true; });
        }
        beat();
        setInterval(beat, 20000);
    }

    /* ══════════ 하단 고정 요소 겹침 방지 ══════════ */
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
        var barH = bar.offsetHeight || 0;
        document.body.style.paddingBottom = (dockH + barH + 8) + 'px';
        if (wrap) wrap.style.bottom = (dockH + barH + 16) + 'px';
    }

    function start() {
        mountCountdown();
        layout();
        window.addEventListener('resize', layout);
        setTimeout(layout, 600);

        mountViewers();
        mountQuota();

        fetch('/api/stats')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(mountToasts)
            .catch(function () {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
