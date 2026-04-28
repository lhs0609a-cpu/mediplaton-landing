CREATE OR REPLACE VIEW v_access_anomalies AS
WITH hourly AS (
    SELECT
        agent_id,
        date_trunc('hour', accessed_at) AS bucket,
        count(*) AS cnt
    FROM lead_access_logs
    WHERE action IN ('view_detail','view_list','search')
    GROUP BY agent_id, date_trunc('hour', accessed_at)
),
daily AS (
    SELECT
        agent_id,
        date_trunc('day', accessed_at) AS bucket,
        count(*) AS cnt
    FROM lead_access_logs
    WHERE action IN ('view_detail','view_list','search')
    GROUP BY agent_id, date_trunc('day', accessed_at)
)
SELECT
    'hour_50' AS rule,
    h.agent_id,
    a.name AS agent_name,
    h.bucket AS detected_at,
    h.cnt,
    '시간당 50건 초과 열람' AS description
FROM hourly h
JOIN agents a ON a.id = h.agent_id
WHERE h.cnt >= 50
UNION ALL
SELECT
    'day_200' AS rule,
    d.agent_id,
    a.name AS agent_name,
    d.bucket AS detected_at,
    d.cnt,
    '일일 200건 초과 열람' AS description
FROM daily d
JOIN agents a ON a.id = d.agent_id
WHERE d.cnt >= 200;

GRANT SELECT ON v_access_anomalies TO authenticated;

CREATE OR REPLACE VIEW v_agent_monthly_summary AS
SELECT
    cr.agent_id,
    a.name AS agent_name,
    a.bank_name,
    a.account_number,
    a.account_holder,
    date_trunc('month', cr.created_at) AS month,
    count(*) AS deal_count,
    sum(cr.total_revenue) AS total_revenue,
    sum(cr.agent_share) AS agent_share_total,
    sum(cr.company_share) AS company_share_total,
    sum(CASE WHEN cr.settlement_status = 'paid' THEN cr.agent_share ELSE 0 END) AS paid_amount,
    sum(CASE WHEN cr.settlement_status = 'pending' THEN cr.agent_share ELSE 0 END) AS pending_amount,
    sum(CASE WHEN cr.settlement_status = 'penalty' THEN cr.agent_share ELSE 0 END) AS penalty_offset_amount
FROM commission_records cr
JOIN agents a ON a.id = cr.agent_id
GROUP BY cr.agent_id, a.name, a.bank_name, a.account_number, a.account_holder, date_trunc('month', cr.created_at);

GRANT SELECT ON v_agent_monthly_summary TO authenticated;

CREATE OR REPLACE VIEW v_agent_penalty_summary AS
SELECT
    p.agent_id,
    a.name AS agent_name,
    count(*) AS penalty_count,
    sum(p.penalty_amount) AS total_amount,
    sum(CASE WHEN p.status = 'issued' THEN p.penalty_amount ELSE 0 END) AS outstanding_amount,
    sum(CASE WHEN p.status = 'collected' THEN p.penalty_amount ELSE 0 END) AS collected_amount,
    sum(CASE WHEN p.status = 'waived' THEN p.penalty_amount ELSE 0 END) AS waived_amount,
    max(p.issued_at) AS last_issued_at
FROM penalty_records p
JOIN agents a ON a.id = p.agent_id
GROUP BY p.agent_id, a.name;

GRANT SELECT ON v_agent_penalty_summary TO authenticated;

CREATE OR REPLACE FUNCTION admin_issue_penalty(
    p_agent_id UUID,
    p_type TEXT,
    p_amount NUMERIC,
    p_lead_id BIGINT,
    p_evidence JSONB
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
    v_id BIGINT;
BEGIN
    SELECT coalesce(raw_app_meta_data ->> 'role', '')
    INTO v_caller_role
    FROM auth.users WHERE id = auth.uid();
    IF v_caller_role <> 'admin' THEN
        RAISE EXCEPTION 'Admin role required';
    END IF;

    INSERT INTO penalty_records (
        agent_id, penalty_type, penalty_amount, related_lead_id, evidence, issued_by
    ) VALUES (
        p_agent_id, p_type, p_amount, p_lead_id, p_evidence, auth.uid()
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_issue_penalty TO authenticated;

CREATE OR REPLACE FUNCTION admin_resolve_penalty(
    p_penalty_id BIGINT,
    p_status TEXT,
    p_note TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT coalesce(raw_app_meta_data ->> 'role', '')
    INTO v_caller_role
    FROM auth.users WHERE id = auth.uid();
    IF v_caller_role <> 'admin' THEN
        RAISE EXCEPTION 'Admin role required';
    END IF;

    IF p_status NOT IN ('issued','collected','litigation','waived') THEN
        RAISE EXCEPTION 'Invalid status';
    END IF;

    UPDATE penalty_records
    SET status = p_status,
        resolved_at = CASE WHEN p_status <> 'issued' THEN now() ELSE NULL END,
        resolution_note = p_note
    WHERE id = p_penalty_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_resolve_penalty TO authenticated;

CREATE OR REPLACE FUNCTION admin_bulk_pay_commissions(
    p_commission_ids BIGINT[]
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
    v_count INTEGER;
BEGIN
    SELECT coalesce(raw_app_meta_data ->> 'role', '')
    INTO v_caller_role
    FROM auth.users WHERE id = auth.uid();
    IF v_caller_role <> 'admin' THEN
        RAISE EXCEPTION 'Admin role required';
    END IF;

    UPDATE commission_records
    SET settlement_status = 'paid',
        paid_at = now()
    WHERE id = ANY(p_commission_ids)
      AND settlement_status = 'pending';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_bulk_pay_commissions TO authenticated;

CREATE OR REPLACE FUNCTION admin_offset_penalty_to_commission(
    p_commission_id BIGINT,
    p_penalty_id BIGINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT coalesce(raw_app_meta_data ->> 'role', '')
    INTO v_caller_role
    FROM auth.users WHERE id = auth.uid();
    IF v_caller_role <> 'admin' THEN
        RAISE EXCEPTION 'Admin role required';
    END IF;

    UPDATE commission_records
    SET settlement_status = 'penalty',
        note = coalesce(note, '') || E'\n위약벌 #' || p_penalty_id::TEXT || ' 차감 처리'
    WHERE id = p_commission_id;

    UPDATE penalty_records
    SET status = 'collected',
        resolved_at = now(),
        resolution_note = coalesce(resolution_note, '') || E'\n수익 #' || p_commission_id::TEXT || ' 차감으로 회수'
    WHERE id = p_penalty_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_offset_penalty_to_commission TO authenticated;
