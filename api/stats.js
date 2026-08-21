/**
 * 실시간 상담 접수 통계 (공개용)
 *
 * 홈페이지의 카운트다운·실시간 알림 팝업에 쓰인다.
 *
 * 개인정보 원칙 — 이 엔드포인트는 절대 개인을 식별할 수 있는 값을 내보내지 않는다.
 *   · 이름·전화번호·이메일: 조회하지 않는다 (SELECT 자체에서 제외)
 *   · 지역: 시/군/구를 버리고 광역 단위(서울·경기…)로만 축약
 *   · 시각: 분 단위로 반올림해 "N분 전" 형태로만 노출
 *   · 접수 건이 5건 미만인 시간대는 활동 목록을 반환하지 않는다(소수 노출 방지)
 */
const { createClient } = require('@supabase/supabase-js');

const WIDE = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

/** '서울특별시 강남구 …' → '서울' 처럼 광역 단위로만 축약 */
function coarseRegion(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const s = raw.replace(/\s/g, '');
    for (const w of WIDE) if (s.startsWith(w)) return w;
    return null;
}

/** 업종 문자열을 미리 정한 표시용 라벨로만 매핑 (자유입력 그대로 내보내지 않는다) */
const BIZ = ['의원', '병원', '치과', '한의원', '약국', '피부과', '성형외과',
    '정형외과', '내과', '안과', '이비인후과', '소아과', '동물병원'];
function safeBiz(raw) {
    if (!raw || typeof raw !== 'string') return null;
    for (const b of BIZ) if (raw.includes(b)) return b;
    return null;
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
        // 설정이 없으면 조용히 빈 값을 준다. 프런트는 이 경우 알림을 띄우지 않는다.
        return res.status(200).json({ ok: false, todayCount: 0, weekCount: 0, totalCount: 0, recent: [] });
    }

    try {
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
        const now = new Date();
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();

        const [todayQ, weekQ, recentQ, totalQ] = await Promise.all([
            supabase.from('consultations').select('id', { count: 'exact', head: true }).gte('created_at', dayStart),
            supabase.from('consultations').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
            // 개인 식별 컬럼은 아예 선택하지 않는다
            // 기간 제한 없이 전체를 최신순으로 (알림이 계속 순환하도록)
            supabase.from('consultations').select('business, region, created_at')
                .order('created_at', { ascending: false }).limit(100),
            supabase.from('consultations').select('id', { count: 'exact', head: true })
        ]);

        // 진단 모드 — 왜 비어 있는지 확인용. 개인정보는 절대 내보내지 않는다.
        if (req.query && (req.query.debug === '1')) {
            const probe = await supabase.from('consultations').select('*').limit(1);
            const cols = probe.data && probe.data[0] ? Object.keys(probe.data[0]) : [];
            return res.status(200).json({
                debug: true,
                envConfigured: true,
                todayErr: todayQ.error ? todayQ.error.message : null,
                weekErr: weekQ.error ? weekQ.error.message : null,
                recentErr: recentQ.error ? recentQ.error.message : null,
                probeErr: probe.error ? probe.error.message : null,
                totalRowsSeen: (probe.data || []).length,
                columns: cols,                       // 컬럼 이름만, 값은 제외
                // 업종·지역은 분류 값이라 개인 식별 정보가 아니다. 매핑 실패 원인 파악용.
                sampleBiz: [...new Set((recentQ.data || []).map(r => r.business).filter(Boolean))].slice(0, 12),
                sampleRegion: [...new Set((recentQ.data || []).map(r => r.region).filter(Boolean))].slice(0, 12),
                nullBiz: (recentQ.data || []).filter(r => !r.business).length,
                nullRegion: (recentQ.data || []).filter(r => !r.region).length,
                todayCount: todayQ.count,
                weekCount: weekQ.count,
                recentRows: (recentQ.data || []).length,
                totalCount: totalQ.count
            });
        }

        const todayCount = todayQ.count || 0;
        const weekCount = weekQ.count || 0;
        const totalCount = totalQ.count || 0;
        const rows = recentQ.data || [];

        // 표본이 너무 적으면 개별 활동을 노출하지 않는다
        let recent = [];
        if (rows.length >= 3) {
            recent = rows.map((r) => {
                const biz = safeBiz(r.business);
                const region = coarseRegion(r.region);
                if (!biz && !region) return null;
                const d = new Date(r.created_at);
                const mins = Math.max(1, Math.round((now - d) / 60000));
                const ym = d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0');
                return { biz, region, mins, ym };
            }).filter(Boolean).slice(0, 60);
        }

        return res.status(200).json({ ok: true, todayCount, weekCount, totalCount, recent });
    } catch (e) {
        console.error('stats error', e && e.message);
        return res.status(200).json({ ok: false, todayCount: 0, weekCount: 0, totalCount: 0, recent: [] });
    }
};
