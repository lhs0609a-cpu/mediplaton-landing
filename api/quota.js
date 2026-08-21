/**
 * 제휴 금융기관 이번 달 잔여 한도
 *
 *   잔여액 = 배정 한도(quota.json) − 이번 달 실행 누계
 *
 * 실행 누계는 consultations.transaction_amount 합계로 계산한다.
 * 즉 이 숫자는 실제로 대출이 실행될 때만 줄어든다.
 * 타이머로 임의로 깎아 내리지 않는다 — 그건 허위 표시다.
 *
 * quota.json 의 enabled 가 false 이거나 total 이 0 이면 { ok:false } 를 돌려주고
 * 프런트는 아무것도 표시하지 않는다.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadConfig() {
    try {
        const p = path.join(process.cwd(), 'quota.json');
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        return null;
    }
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=120');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const cfg = loadConfig();
    if (!cfg || !cfg.enabled) return res.status(200).json({ ok: false, reason: 'disabled' });

    const insts = (cfg.institutions || []).filter((i) => i && i.total > 0);
    if (!insts.length) return res.status(200).json({ ok: false, reason: 'no_total' });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 이번 달 범위 (KST 기준)
    const now = new Date();
    const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
    const monthStart = new Date(kst.getFullYear(), kst.getMonth(), 1).toISOString();

    let usedFromDb = 0;
    let seenStatuses = [];
    let dbErr = null;

    if (SUPABASE_URL && SERVICE_KEY) {
        try {
            const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
            const q = await supabase
                .from('consultations')
                .select('transaction_amount, status, pipeline_status')
                .gte('created_at', monthStart)
                .limit(1000);

            if (q.error) {
                dbErr = q.error.message;
            } else {
                const rows = q.data || [];
                const ok = (cfg.executedStatuses || []).map((s) => String(s).toLowerCase());
                seenStatuses = [...new Set(rows.flatMap((r) => [r.status, r.pipeline_status]).filter(Boolean))];
                usedFromDb = rows.reduce((sum, r) => {
                    const st = [r.status, r.pipeline_status].filter(Boolean).map((v) => String(v).toLowerCase());
                    const isDone = ok.length === 0 || st.some((v) => ok.includes(v));
                    const amt = Number(r.transaction_amount) || 0;
                    return isDone ? sum + amt : sum;
                }, 0);
            }
        } catch (e) {
            dbErr = e && e.message;
        }
    }

    const out = insts.map((i) => {
        const used = i.usedManual !== null && i.usedManual !== undefined
            ? Number(i.usedManual) || 0
            : Math.round(usedFromDb * (i.total / insts.reduce((s, x) => s + x.total, 0)));
        const remaining = Math.max(0, i.total - used);
        return {
            key: i.key,
            name: i.name,
            total: i.total,
            used,
            remaining,
            pct: i.total > 0 ? Math.round((remaining / i.total) * 100) : 0
        };
    });

    if (req.query && req.query.debug === '1') {
        return res.status(200).json({
            debug: true, month: cfg.month, dbErr,
            usedFromDb, seenStatuses, institutions: out
        });
    }

    return res.status(200).json({ ok: true, month: cfg.month, institutions: out });
};
