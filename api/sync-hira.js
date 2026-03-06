const { createClient } = require('@supabase/supabase-js');
const { DOMParser } = require('@xmldom/xmldom');

// 17개 시도 코드
const SIDO_CODES = {
    seoul: '110000', gyeonggi: '410000', incheon: '280000',
    busan: '260000', daegu: '270000', daejeon: '300000',
    gwangju: '290000', ulsan: '310000', sejong: '360000',
    gangwon: '420000', chungbuk: '430000', chungnam: '440000',
    jeonbuk: '350000', jeonnam: '460000', gyeongbuk: '370000',
    gyeongnam: '380000', jeju: '390000'
};

const HIRA_BASE_URL = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';
const RECENT_MONTHS = 6;
const BATCH_SIZE = 4; // 4개 시도 병렬 처리

module.exports = async function handler(req, res) {
    const startTime = Date.now();

    // 인증 검증: Vercel Cron은 Authorization: Bearer <CRON_SECRET> 헤더를 자동 전송
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const hiraServiceKey = process.env.HIRA_SERVICE_KEY;
    if (!hiraServiceKey) {
        return res.status(500).json({ error: 'HIRA_SERVICE_KEY not configured' });
    }

    // cutoffDate: 6개월 전
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - RECENT_MONTHS);
    const cutoffStr = cutoffDate.toISOString().split('T')[0].replace(/-/g, '');

    let totalInserted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let errorMessage = null;

    try {
        const sidoKeys = Object.keys(SIDO_CODES);

        // 4개씩 병렬 처리
        for (let i = 0; i < sidoKeys.length; i += BATCH_SIZE) {
            const batch = sidoKeys.slice(i, i + BATCH_SIZE);

            const results = await Promise.allSettled(
                batch.map(region => fetchRegion(hiraServiceKey, region, SIDO_CODES[region], cutoffStr, supabase))
            );

            for (const result of results) {
                if (result.status === 'fulfilled') {
                    totalInserted += result.value.inserted;
                    totalSkipped += result.value.skipped;
                    totalErrors += result.value.errors;
                } else {
                    totalErrors++;
                    console.error('Region batch error:', result.reason);
                }
            }
        }
    } catch (err) {
        console.error('HIRA sync fatal error:', err);
        errorMessage = err.message;
        totalErrors++;
    }

    const durationMs = Date.now() - startTime;

    // 동기화 결과를 hira_sync_logs에 기록
    await supabase.from('hira_sync_logs').insert({
        sync_type: 'auto',
        inserted_count: totalInserted,
        skipped_count: totalSkipped,
        error_count: totalErrors,
        duration_ms: durationMs,
        error_message: errorMessage
    });

    return res.status(200).json({
        inserted: totalInserted,
        skipped: totalSkipped,
        errors: totalErrors,
        duration: `${durationMs}ms`
    });
};

/**
 * 시도별 HIRA API 페이지네이션 fetch + upsert
 */
async function fetchRegion(serviceKey, region, sidoCd, cutoffStr, supabase) {
    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    let pageNo = 1;
    let hasMore = true;

    while (hasMore) {
        const params = new URLSearchParams({
            ServiceKey: serviceKey,
            numOfRows: '100',
            pageNo: String(pageNo),
            sidoCd: sidoCd
        });

        const url = `${HIRA_BASE_URL}?${params.toString()}`;
        const response = await fetch(url);

        if (!response.ok) {
            errors++;
            break;
        }

        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');

        const items = xml.getElementsByTagName('item');
        if (items.length === 0) {
            hasMore = false;
            break;
        }

        const records = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const getVal = (tag) => {
                const els = item.getElementsByTagName(tag);
                return els.length > 0 && els[0].textContent ? els[0].textContent.trim() : null;
            };

            const estDt = getVal('estDt') || '';
            if (estDt && estDt >= cutoffStr) {
                const formattedDate = estDt.length === 8
                    ? `${estDt.slice(0, 4)}-${estDt.slice(4, 6)}-${estDt.slice(6, 8)}`
                    : null;

                records.push({
                    clinic_name: getVal('yadmNm') || '(미상)',
                    representative_name: getVal('drNm') || null,
                    specialty: getVal('dgsbjtCdNm') || getVal('clCdNm') || null,
                    address: getVal('addr') || null,
                    region: region,
                    opening_date: formattedDate,
                    phone: getVal('telno') || null,
                    hira_ykiho: getVal('ykiho') || null,
                    data_source: 'hira_api'
                });
            }
        }

        if (records.length > 0) {
            const { error } = await supabase
                .from('new_clinic_openings')
                .upsert(records, { onConflict: 'hira_ykiho', ignoreDuplicates: true });

            if (error) {
                // Fallback: 개별 upsert
                for (const rec of records) {
                    if (!rec.hira_ykiho) {
                        const { error: insertErr } = await supabase
                            .from('new_clinic_openings')
                            .insert(rec);
                        if (!insertErr) inserted++;
                        else skipped++;
                    } else {
                        const { error: singleErr } = await supabase
                            .from('new_clinic_openings')
                            .upsert(rec, { onConflict: 'hira_ykiho', ignoreDuplicates: true });
                        if (!singleErr) inserted++;
                        else skipped++;
                    }
                }
            } else {
                inserted += records.length;
            }
        }

        // 페이지네이션 체크
        const totalCountEls = xml.getElementsByTagName('totalCount');
        const total = totalCountEls.length > 0 ? parseInt(totalCountEls[0].textContent) : 0;
        if (pageNo * 100 >= total || items.length < 100) {
            hasMore = false;
        } else {
            pageNo++;
        }
    }

    return { inserted, skipped, errors };
}
