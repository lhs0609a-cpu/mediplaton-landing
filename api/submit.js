const { createClient } = require('@supabase/supabase-js');

const TABLE_SCHEMAS = {
    consultation: {
        table: 'consultations',
        allowed: ['name', 'phone', 'business', 'revenue', 'region', 'product',
                  'message', 'preferred_time', 'inflow_channel', 'source_page'],
        required: ['name', 'phone']
    },
    marketing: {
        table: 'marketing_inquiries',
        allowed: ['name', 'phone', 'business_type', 'clinic_size', 'interests',
                  'preferred_time', 'inflow_channel', 'source_page'],
        required: ['name', 'phone', 'business_type', 'clinic_size']
    },
    partner_inquiry: {
        table: 'partner_inquiries',
        allowed: ['name', 'phone', 'occupation', 'expected_leads',
                  'preferred_time', 'inflow_channel', 'source_page'],
        required: ['name', 'phone']
    },
    promo: {
        table: 'promo_inquiries',
        allowed: ['name', 'phone', 'business_type', 'monthly_sales',
                  'preferred_time', 'inflow_channel', 'source_page'],
        required: ['name', 'phone']
    },
    agency: {
        table: 'agency_inquiries',
        allowed: ['name', 'phone', 'email', 'company_name', 'business_number',
                  'business_type', 'years_in_business', 'desired_region', 'team_size',
                  'monthly_capacity', 'sales_experience', 'preferred_time',
                  'inflow_channel', 'message', 'source_page'],
        required: ['name', 'phone']
    }
};

function extractIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
    return req.headers['x-real-ip']
        || req.socket?.remoteAddress
        || null;
}

function pickAllowed(payload, allowed) {
    const out = {};
    for (const key of allowed) {
        if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
            out[key] = payload[key];
        }
    }
    return out;
}

module.exports = async function handler(req, res) {
    // CORS (동일 도메인이지만 안전망)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    }
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body required' });

    const { type, payload } = body;
    const schema = TABLE_SCHEMAS[type];
    if (!schema) return res.status(400).json({ error: 'Unknown type' });
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'payload required' });

    for (const f of schema.required) {
        if (!payload[f]) return res.status(400).json({ error: `필수 항목 누락: ${f}` });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
        console.error('Supabase env not configured');
        return res.status(500).json({ error: 'Server not configured' });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const ip = extractIp(req);
    const ua = req.headers['user-agent'] || null;

    const insertRow = {
        ...pickAllowed(payload, schema.allowed),
        ip_address: ip,
        user_agent: ua
    };

    const { data, error } = await supabase
        .from(schema.table)
        .insert(insertRow)
        .select('id')
        .single();

    if (error) {
        console.error(`Insert error (${schema.table}):`, error);
        return res.status(500).json({ error: 'DB 저장 오류', detail: error.message });
    }

    // 동일 IP 누적 카운트 (이번 건 포함). 클라이언트엔 카운트만 반환 (IP 미공개).
    let duplicateIpCount = 0;
    if (ip) {
        const { data: countData } = await supabase
            .from('ip_submission_counts')
            .select('total_count')
            .eq('ip_address', ip)
            .maybeSingle();
        duplicateIpCount = countData?.total_count || 0;
    }

    return res.status(200).json({
        success: true,
        id: data?.id,
        duplicateIpCount,
        ip
    });
};
