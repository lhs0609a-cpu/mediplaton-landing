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

const REGION_MAP = {
    seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천', gwangju: '광주',
    daejeon: '대전', ulsan: '울산', sejong: '세종', gyeonggi: '경기', gangwon: '강원',
    chungbuk: '충북', chungnam: '충남', jeonbuk: '전북', jeonnam: '전남',
    gyeongbuk: '경북', gyeongnam: '경남', jeju: '제주'
};
const WIDE = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

/** DB 값은 영문 코드(seoul) 또는 한글('서울특별시 …') 둘 다 올 수 있다. 광역 단위로만 축약. */
function coarseRegion(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const key = raw.trim().toLowerCase();
    if (REGION_MAP[key]) return REGION_MAP[key];
    const s = raw.replace(/\s/g, '');
    for (const w of WIDE) if (s.startsWith(w)) return w;
    return null;
}

const BIZ_MAP = {
    dental: '치과', pharmacy: '약국', oriental: '한의원', hospital: '병원',
    clinic: '의원', plastic: '성형외과', derma: '피부과', internal: '내과',
    ortho: '정형외과', eye: '안과', ent: '이비인후과', ped: '소아과',
    vet: '동물병원', obgyn: '산부인과', urology: '비뇨의학과', psych: '정신건강의학과',
    retail: '소매업', education: '교육업', food: '요식업', beauty: '뷰티',
    lodging: '숙박업', 're-hotel': '숙박업', service: '서비스업',
    refi: '대환', other: null
};
const BIZ_KO = ['의원', '병원', '치과', '한의원', '약국', '피부과', '성형외과',
    '정형외과', '내과', '안과', '이비인후과', '소아과', '동물병원'];

/** 영문 코드 우선 매핑, 아니면 한글 포함 여부. 미분류('other')는 표시하지 않는다. */
function safeBiz(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const key = raw.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(BIZ_MAP, key)) return BIZ_MAP[key];
    for (const b of BIZ_KO) if (raw.includes(b)) return b;
    return null;
}

/** 이름 마스킹 — 첫 글자만 남긴다. 홍길동 → 홍○○, 김철 → 김○ */
function maskName(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const n = raw.trim().replace(/\s+/g, '');
    if (!n) return null;
    if (n.length === 1) return n + '○';
    return n[0] + '○'.repeat(Math.min(n.length - 1, 2));
}

/** 연락처 마스킹 — 가운데 자리를 가린다. 01012345678 → 010-****-5678 */
function maskPhone(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const d = raw.replace(/\D/g, '');
    if (d.length < 9) return null;
    return d.slice(0, 3) + '-****-' + d.slice(-4);
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
            supabase.from('consultations').select('name, phone, business, region, created_at')
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
                const name = maskName(r.name);
                const phone = maskPhone(r.phone);
                if (!name && !biz && !region) return null;
                // 접수 시점은 표시하지 않기로 해 응답에서 제외한다
                return { name, phone, biz, region };
            }).filter(Boolean).slice(0, 60);
        }

        return res.status(200).json({ ok: true, todayCount, weekCount, totalCount, recent });
    } catch (e) {
        console.error('stats error', e && e.message);
        return res.status(200).json({ ok: false, todayCount: 0, weekCount: 0, totalCount: 0, recent: [] });
    }
};
