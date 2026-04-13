/**
 * 메디플라톤 경량 분석 추적기 (~4KB)
 * config.js의 Supabase 설정 재사용
 */
(function() {
    'use strict';

    if (typeof SUPABASE_CONFIG === 'undefined' || !isSupabaseConfigured()) return;

    var sb = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    var sessionId = null;
    var pageviewId = null;
    var maxScroll = 0;
    var heartbeatTimer = null;
    var pageStart = Date.now();

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
            // 페이지 카운트 증가, 바운스 해제
            sb.from('analytics_sessions')
                .update({ page_count: undefined, last_active_at: new Date().toISOString(), is_bounce: false })
                .eq('id', sessionId);
            // RPC 대신 직접 읽어서 page_count+1 업데이트
            var { data: sess } = await sb.from('analytics_sessions').select('page_count').eq('id', sessionId).single();
            if (sess) {
                sb.from('analytics_sessions').update({ page_count: sess.page_count + 1, is_bounce: false, last_active_at: new Date().toISOString() }).eq('id', sessionId);
            }
        } else {
            var utm = getUtm();
            var dev = getDevice();
            var { data, error } = await sb.from('analytics_sessions').insert({
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
            }).select('id').single();
            if (data) {
                sessionId = data.id;
                sessionStorage.setItem('_mp_sid', sessionId);
            }
        }
    }

    // ─── 페이지뷰 기록 ───
    async function trackPageview() {
        if (!sessionId) return;
        var { data } = await sb.from('analytics_pageviews').insert({
            session_id: sessionId,
            page_url: pagePath(),
            page_title: document.title
        }).select('id').single();
        if (data) pageviewId = data.id;
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

    // ─── Heartbeat (30초마다) ───
    function startHeartbeat() {
        heartbeatTimer = setInterval(function() {
            if (!sessionId) return;
            var elapsed = Math.round((Date.now() - pageStart) / 1000);
            sb.from('analytics_sessions').update({ last_active_at: new Date().toISOString() }).eq('id', sessionId);
            if (pageviewId) {
                sb.from('analytics_pageviews').update({ time_on_page: elapsed, scroll_depth: maxScroll }).eq('id', pageviewId);
            }
        }, 30000);
    }

    // ─── 탭 비활성 시 heartbeat 중지 ───
    function initVisibility() {
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
                // 마지막 업데이트
                if (sessionId && pageviewId) {
                    var elapsed = Math.round((Date.now() - pageStart) / 1000);
                    sb.from('analytics_pageviews').update({ time_on_page: elapsed, scroll_depth: maxScroll }).eq('id', pageviewId);
                    sb.from('analytics_sessions').update({ last_active_at: new Date().toISOString() }).eq('id', sessionId);
                }
            } else {
                pageStart = Date.now() - ((pageviewId ? 0 : 0)); // 복귀시 재시작
                if (!heartbeatTimer) startHeartbeat();
            }
        });
    }

    // ─── 페이지 이탈 시 마지막 데이터 저장 ───
    function initUnload() {
        window.addEventListener('beforeunload', function() {
            if (!sessionId || !pageviewId) return;
            var elapsed = Math.round((Date.now() - pageStart) / 1000);
            // sendBeacon으로 확실한 전송
            var url = SUPABASE_CONFIG.url + '/rest/v1/analytics_pageviews?id=eq.' + pageviewId;
            var body = JSON.stringify({ time_on_page: elapsed, scroll_depth: maxScroll });
            navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        });
    }

    // ─── 초기화 ───
    async function init() {
        await initSession();
        await trackPageview();
        initClickTracking();
        initScrollTracking();
        startHeartbeat();
        initVisibility();
        initUnload();
    }

    // DOM 로드 후 실행
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
