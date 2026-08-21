/**
 * 현재 페이지 동시 접속자 수 (실측)
 *
 * 브라우저가 20초마다 하트비트를 보내면 세션 단위로 기록하고,
 * 최근 60초 안에 신호가 있었던 세션 수를 세어 돌려준다.
 * 임의로 부풀린 숫자를 만들지 않는다.
 *
 * 필요한 테이블 (Supabase SQL 편집기에서 1회 실행):
 *
 *   create table if not exists page_presence (
 *     sid        text primary key,
 *     page       text not null,
 *     seen_at    timestamptz not null default now()
 *   );
 *   create index if not exists page_presence_page_seen
 *     on page_presence (page, seen_at desc);
 *
 * 테이블이 없으면 { ok:false } 를 돌려주고, 프런트는 표시를 숨긴다.
 */
const { createClient } = require('@supabase/supabase-js');

const WINDOW_SEC = 60;

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ ok: false });

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = null; }
    }
    const page = body && typeof body.page === 'string' ? body.page.slice(0, 120) : null;
    const sid = body && typeof body.sid === 'string' ? body.sid.slice(0, 64) : null;
    if (!page || !sid) return res.status(400).json({ ok: false });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(200).json({ ok: false });

    try {
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
        const nowIso = new Date().toISOString();

        // 세션 하트비트 기록 (같은 sid 는 갱신)
        const up = await supabase
            .from('page_presence')
            .upsert({ sid, page, seen_at: nowIso }, { onConflict: 'sid' });

        if (up.error) {
            // 테이블이 아직 없을 때 — 조용히 비활성
            return res.status(200).json({ ok: false, reason: 'table_missing' });
        }

        const since = new Date(Date.now() - WINDOW_SEC * 1000).toISOString();
        const cnt = await supabase
            .from('page_presence')
            .select('sid', { count: 'exact', head: true })
            .eq('page', page)
            .gte('seen_at', since);

        if (cnt.error) return res.status(200).json({ ok: false });

        // 오래된 기록 정리 (10분 경과분)
        const stale = new Date(Date.now() - 600 * 1000).toISOString();
        supabase.from('page_presence').delete().lt('seen_at', stale).then(() => {}, () => {});

        return res.status(200).json({ ok: true, count: cnt.count || 1 });
    } catch (e) {
        return res.status(200).json({ ok: false });
    }
};
