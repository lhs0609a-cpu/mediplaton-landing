CREATE OR REPLACE FUNCTION trg_auto_match_inquiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_phone_norm TEXT;
    v_lead_id BIGINT;
    v_agent_id UUID;
BEGIN
    IF NEW.phone IS NULL OR NEW.name IS NULL THEN
        RETURN NEW;
    END IF;

    v_phone_norm := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
    IF length(v_phone_norm) < 10 THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_lead_id
    FROM leads
    WHERE phone_normalized = v_phone_norm
      AND name = NEW.name
    LIMIT 1;

    IF v_lead_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT agent_id INTO v_agent_id
    FROM lead_assignments
    WHERE lead_id = v_lead_id
    ORDER BY assigned_at ASC
    LIMIT 1;

    INSERT INTO lead_match_events (
        lead_id, matched_agent_id, matched_inquiry_table, matched_inquiry_id
    ) VALUES (
        v_lead_id, v_agent_id, TG_TABLE_NAME, NEW.id
    ) ON CONFLICT (lead_id, matched_inquiry_table, matched_inquiry_id) DO NOTHING;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'auto_match_inquiry failed for %.%: %', TG_TABLE_NAME, NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_match_consultations ON consultations;
CREATE TRIGGER auto_match_consultations
AFTER INSERT ON consultations
FOR EACH ROW EXECUTE FUNCTION trg_auto_match_inquiry();

DROP TRIGGER IF EXISTS auto_match_marketing ON marketing_inquiries;
CREATE TRIGGER auto_match_marketing
AFTER INSERT ON marketing_inquiries
FOR EACH ROW EXECUTE FUNCTION trg_auto_match_inquiry();

DROP TRIGGER IF EXISTS auto_match_promo ON promo_inquiries;
CREATE TRIGGER auto_match_promo
AFTER INSERT ON promo_inquiries
FOR EACH ROW EXECUTE FUNCTION trg_auto_match_inquiry();

DROP TRIGGER IF EXISTS auto_match_partner ON partner_inquiries;
CREATE TRIGGER auto_match_partner
AFTER INSERT ON partner_inquiries
FOR EACH ROW EXECUTE FUNCTION trg_auto_match_inquiry();

CREATE OR REPLACE FUNCTION admin_mark_executed(
    p_match_id BIGINT,
    p_amount NUMERIC,
    p_product TEXT,
    p_total_revenue NUMERIC
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agent_id UUID;
    v_commission_id BIGINT;
    v_company NUMERIC;
    v_agent_share NUMERIC;
    v_caller_role TEXT;
BEGIN
    SELECT coalesce(raw_app_meta_data ->> 'role', '')
    INTO v_caller_role
    FROM auth.users
    WHERE id = auth.uid();

    IF v_caller_role <> 'admin' THEN
        RAISE EXCEPTION 'Admin role required';
    END IF;

    UPDATE lead_match_events
    SET executed = true,
        executed_amount = p_amount,
        executed_product = p_product,
        executed_at = now(),
        executed_by = auth.uid()
    WHERE id = p_match_id
    RETURNING matched_agent_id INTO v_agent_id;

    IF v_agent_id IS NULL THEN
        RETURN NULL;
    END IF;

    v_company := round(p_total_revenue * 0.5);
    v_agent_share := p_total_revenue - v_company;

    INSERT INTO commission_records (
        match_event_id, agent_id, total_revenue, company_share, agent_share
    ) VALUES (
        p_match_id, v_agent_id, p_total_revenue, v_company, v_agent_share
    ) RETURNING id INTO v_commission_id;

    RETURN v_commission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_mark_executed TO authenticated;

CREATE OR REPLACE VIEW v_pending_match_events AS
SELECT
    me.id AS match_event_id,
    me.matched_at,
    me.matched_inquiry_table,
    me.matched_inquiry_id,
    me.executed,
    l.id AS lead_id,
    l.name AS lead_name,
    l.phone AS lead_phone,
    l.business_type,
    l.region,
    a.id AS agent_id,
    a.name AS agent_name,
    a.phone AS agent_phone
FROM lead_match_events me
JOIN leads l ON l.id = me.lead_id
LEFT JOIN agents a ON a.id = me.matched_agent_id
WHERE me.executed = false
ORDER BY me.matched_at DESC;

GRANT SELECT ON v_pending_match_events TO authenticated;
