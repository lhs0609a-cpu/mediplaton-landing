DROP POLICY IF EXISTS agents_self_insert ON agents;
CREATE POLICY agents_self_insert ON agents
    FOR INSERT WITH CHECK (id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS agents_self_update_limited ON agents;
CREATE POLICY agents_self_update_limited ON agents
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND status = (SELECT status FROM agents WHERE id = auth.uid())
    );

CREATE OR REPLACE FUNCTION agent_sign_contract(
    p_contract_body TEXT,
    p_signature_image TEXT,
    p_body_hash TEXT,
    p_signed_ip TEXT,
    p_signed_user_agent TEXT,
    p_contract_version TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_contract_id BIGINT;
    v_status TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT status INTO v_status FROM agents WHERE id = v_user_id;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Agent profile not found';
    END IF;
    IF v_status NOT IN ('contract_sent', 'pending') THEN
        RAISE EXCEPTION 'Cannot sign contract in current status: %', v_status;
    END IF;

    INSERT INTO agent_contracts (
        agent_id, contract_version, contract_body,
        signature_image, signed_ip, signed_user_agent, body_hash
    ) VALUES (
        v_user_id, p_contract_version, p_contract_body,
        p_signature_image, p_signed_ip, p_signed_user_agent, p_body_hash
    ) RETURNING id INTO v_contract_id;

    UPDATE agents
    SET status = 'active',
        contract_id = v_contract_id,
        updated_at = now()
    WHERE id = v_user_id;

    RETURN v_contract_id;
END;
$$;

GRANT EXECUTE ON FUNCTION agent_sign_contract TO authenticated;

CREATE OR REPLACE FUNCTION log_lead_access(
    p_lead_id BIGINT,
    p_action TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN RETURN; END IF;
    INSERT INTO lead_access_logs (lead_id, agent_id, action)
    VALUES (p_lead_id, v_user_id, p_action);
END;
$$;

GRANT EXECUTE ON FUNCTION log_lead_access TO authenticated;
