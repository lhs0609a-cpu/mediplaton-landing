ALTER TABLE agents
    DROP CONSTRAINT IF EXISTS agents_active_requires_contract;

ALTER TABLE agents
    ADD CONSTRAINT agents_active_requires_contract
    CHECK (status <> 'active' OR contract_id IS NOT NULL);

CREATE OR REPLACE FUNCTION register_agent_profile(
    p_name TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_rrn_masked TEXT,
    p_bank_name TEXT,
    p_account_holder TEXT,
    p_account_number TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION 'Name is required';
    END IF;
    IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
        RAISE EXCEPTION 'Phone is required';
    END IF;
    IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
        RAISE EXCEPTION 'Email is required';
    END IF;

    INSERT INTO agents (
        id, name, phone, email,
        rrn_masked, bank_name, account_holder, account_number,
        status
    ) VALUES (
        v_user_id, trim(p_name), trim(p_phone), trim(p_email),
        nullif(trim(coalesce(p_rrn_masked, '')), ''),
        nullif(trim(coalesce(p_bank_name, '')), ''),
        nullif(trim(coalesce(p_account_holder, '')), ''),
        nullif(trim(coalesce(p_account_number, '')), ''),
        'pending'
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        rrn_masked = EXCLUDED.rrn_masked,
        bank_name = EXCLUDED.bank_name,
        account_holder = EXCLUDED.account_holder,
        account_number = EXCLUDED.account_number,
        updated_at = now()
    WHERE agents.status = 'pending';

    RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION register_agent_profile TO authenticated;

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

    IF p_contract_body IS NULL OR p_signature_image IS NULL OR p_body_hash IS NULL THEN
        RAISE EXCEPTION 'Contract body, signature, and hash are required';
    END IF;

    SELECT status INTO v_status FROM agents WHERE id = v_user_id FOR UPDATE;
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
