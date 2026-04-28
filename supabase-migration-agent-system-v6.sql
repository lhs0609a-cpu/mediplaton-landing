CREATE OR REPLACE FUNCTION trg_lead_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO lead_status_history (assignment_id, from_status, to_status, memo, changed_by)
        VALUES (NEW.id, OLD.status, NEW.status, NEW.memo, coalesce(auth.uid(), NEW.agent_id));
        NEW.last_status_at := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS status_history_insert_via_trigger ON lead_status_history;
CREATE POLICY status_history_insert_via_trigger ON lead_status_history
    FOR INSERT WITH CHECK (true);

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

DROP POLICY IF EXISTS access_logs_self_insert ON lead_access_logs;
CREATE POLICY access_logs_self_insert ON lead_access_logs
    FOR INSERT WITH CHECK (
        agent_id = auth.uid() OR is_admin() OR auth.uid() IS NULL
    );

DROP POLICY IF EXISTS commission_insert_via_rpc ON commission_records;
CREATE POLICY commission_insert_via_rpc ON commission_records
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS match_events_insert ON lead_match_events;
CREATE POLICY match_events_insert ON lead_match_events
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS agent_contracts_insert_via_rpc ON agent_contracts;
CREATE POLICY agent_contracts_insert_via_rpc ON agent_contracts
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS penalty_insert_admin ON penalty_records;
CREATE POLICY penalty_insert_admin ON penalty_records
    FOR INSERT WITH CHECK (is_admin());
