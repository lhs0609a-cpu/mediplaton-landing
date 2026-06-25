/**
 * 메디플라톤 경량 분석 추적기 (~4KB)
 * config.js의 Supabase 설정 재사용
 */
(function() {
    'use strict';

    if (typeof SUPABASE_CONFIG === 'undefined' || !isSupabaseConfigured()) return;
    if (typeof window.supabase === 'undefined') return;

    var sb = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    var sessionId = null;
    var pageviewTs = null; // 페이지뷰 식별용 타임스탬프
    var maxScroll = 0;
    var heartbeatTimer = null;
    var pageStart = Date.now();
    var deviceType = null; // 히트맵 디바이스 필터용 (init에서 채움)

    // ─── UUID 생성 (클라이언트 사이드) ───
    function genUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    // ─── 방문자 ID (localStorage 기반, 재방문 추적) ───
    function getVisitorId() {
        var id = localStorage.getItem('_mp_vid');
        if (!id) {
            id = 'v_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
            localStorage.setItem('_mp_vid', id);
        }
        return id;
    }

    // ─── UTM 파라미터 추출 ───
    function getUtm() {
        var p = new URLSearchParams(window.location.search);
        return {
            source: p.get('utm_source') || null,
            medium: p.get('utm_medium') || null,
            campaign: p.get('utm_campaign') || null
        };
    }

    // ─── 디바이스/브라우저/OS 감지 ───
    function getDevice() {
        var ua = navigator.userAgent;
        var device = /Mobi|Android/i.test(ua) ? (/Tablet|iPad/i.test(ua) ? 'tablet' : 'mobile') : 'desktop';
        var browser = 'other';
        if (/Edg\//i.test(ua)) browser = 'Edge';
        else if (/Chrome/i.test(ua)) browser = 'Chrome';
        else if (/Safari/i.test(ua)) browser = 'Safari';
        else if (/Firefox/i.test(ua)) browser = 'Firefox';
        var os = 'other';
        if (/Windows/i.test(ua)) os = 'Windows';
        else if (/Mac/i.test(ua)) os = 'macOS';
        else if (/Android/i.test(ua)) os = 'Android';
        else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
        else if (/Linux/i.test(ua)) os = 'Linux';
        return { device: device, browser: browser, os: os };
    }

    // ─── 페이지 경로 (짧게) ───
    function pagePath() {
        return window.location.pathname.replace(/\/$/, '') || '/';
    }

    // ─── 세션 시작 또는 복원 ───
    async function initSession() {
        var existingId = sessionStorage.getItem('_mp_sid');
        if (existingId) {
            sessionId = existingId;
            var cnt = parseInt(sessionStorage.getItem('_mp_pc') || '1', 10) + 1;
            sessionStorage.setItem('_mp_pc', String(cnt));
            await sb.from('analytics_sessions').update({
                page_count: cnt,
                is_bounce: false,
                last_active_at: new Date().toISOString()
            }).eq('id', sessionId);
        } else {
            sessionId = genUUID();
            var utm = getUtm();
            var dev = getDevice();
            var { error } = await sb.from('analytics_sessions').insert({
                id: sessionId,
                visitor_id: getVisitorId(),
                page_count: 1,
                referrer: document.referrer || null,
                utm_source: utm.source,
                utm_medium: utm.medium,
                utm_campaign: utm.campaign,
                device_type: dev.device,
                browser: dev.browser,
                os: dev.os,
                landing_page: pagePath(),
                is_bounce: true
            });
            if (!error) {
                sessionStorage.setItem('_mp_sid', sessionId);
                sessionStorage.setItem('_mp_pc', '1');
            } else {
                sessionId = null;
            }
        }
    }

    // ─── 페이지뷰 기록 ───
    async function trackPageview() {
        if (!sessionId) return;
        pageviewTs = new Date().toISOString();
        await sb.from('analytics_pageviews').insert({
            session_id: sessionId,
            page_url: pagePath(),
            page_title: document.title,
            entered_at: pageviewTs
        });
    }

    // ─── 클릭 추적 ───
    function initClickTracking() {
        document.addEventListener('click', function(e) {
            if (!sessionId) return;
            var el = e.target.closest('a, button, [data-track], .cta-btn, .btn, .floating-btn, input[type="submit"]');
            if (!el) return;

            var eventType = 'click';
            if (el.matches('[data-track]')) eventType = el.getAttribute('data-track');
            else if (el.matches('form input[type="submit"], form button[type="submit"]')) eventType = 'form_submit';
            else if (el.matches('.cta-btn, .btn-primary, .floating-btn, [class*="cta"]')) eventType = 'cta_click';

            var text = (el.textContent || '').trim().substring(0, 100);

            sb.from('analytics_events').insert({
                session_id: sessionId,
                event_type: eventType,
                element_tag: el.tagName,
                element_text: text,
                element_id: el.id || null,
                element_class: (el.className && typeof el.className === 'string') ? el.className.substring(0, 200) : null,
                page_url: pagePath()
            });
        }, true);
    }

    // ─── 히트맵 클릭 좌표 추적 (모든 클릭) ───
    // 페이지 어디를 클릭하든 좌표를 기록 → heatmap.html에서 분포도 렌더링
    function initHeatmapTracking() {
        document.addEventListener('click', function(e) {
            if (!sessionId) return;
            // 좌표 정보가 없는 합성 클릭(키보드 엔터 등)은 제외
            if (!e.pageX && !e.pageY) return;
            var docW = document.documentElement.scrollWidth || window.innerWidth || 1;
            var xPct = Math.max(0, Math.min(100, (e.pageX / docW) * 100));
            sb.from('analytics_events').insert({
                session_id: sessionId,
                event_type: 'heatmap_click',
                page_url: pagePath(),
                click_x: Math.round(xPct * 100) / 100,
                click_y: Math.round(e.pageY),
                viewport_w: window.innerWidth,
                device_type: deviceType
            });
        }, true);
    }

    // ─── 스크롤 깊이 추적 ───
    function initScrollTracking() {
        window.addEventListener('scroll', function() {
            var scrollTop = window.scrollY || document.documentElement.scrollTop;
            var docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            if (docHeight > 0) {
                var depth = Math.round((scrollTop / docHeight) * 100);
                if (depth > maxScroll) maxScroll = depth;
            }
        }, { passive: true });
    }

    // ─── 체류시간·스크롤 저장 (PATCH) ───
    // keepalive fetch 사용: 페이지 이탈 중에도 전송 보장 + 헤더 설정 가능
    //   (sendBeacon은 POST만 가능 → PATCH 불가, apikey 헤더 불가 → 저장 실패했었음)
    function flush(useKeepalive) {
        if (!sessionId || !pageviewTs) return;
        var elapsed = Math.round((Date.now() - pageStart) / 1000);
        var url = SUPABASE_CONFIG.url + '/rest/v1/analytics_pageviews?session_id=eq.' + sessionId +
                  '&entered_at=eq.' + encodeURIComponent(pageviewTs);
        try {
            fetch(url, {
                method: 'PATCH',
                keepalive: !!useKeepalive,
                headers: {
                    'apikey': SUPABASE_CONFIG.anonKey,
                    'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ time_on_page: elapsed, scroll_depth: maxScroll })
            }).catch(function() {});
            sb.from('analytics_sessions').update({ last_active_at: new Date().toISOString() }).eq('id', sessionId);
        } catch (e) {}
    }

    // ─── Heartbeat (10초마다 — 짧은 방문도 데이터 확보) ───
    function startHeartbeat() {
        if (heartbeatTimer) return;
        heartbeatTimer = setInterval(function() { flush(false); }, 10000);
    }

    // ─── 탭 비활성/전환 시 즉시 저장 ───
    function initVisibility() {
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
                flush(true); // 이탈 가능성 → keepalive로 확실히 전송
            } else {
                startHeartbeat();
            }
        });
    }

    // ─── 페이지 이탈 시 마지막 저장 (pagehide가 beforeunload보다 신뢰도 높음) ───
    function initUnload() {
        window.addEventListener('pagehide', function() { flush(true); });
        window.addEventListener('beforeunload', function() { flush(true); });
    }

    // ─── 초기화 ───
    async function init() {
        try {
            deviceType = getDevice().device;
            await initSession();
            await trackPageview();
            initClickTracking();
            initHeatmapTracking();
            initScrollTracking();
            startHeartbeat();
            initVisibility();
            initUnload();
        } catch(e) {
            // 추적 실패 시 사이트 동작에 영향 없도록
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
