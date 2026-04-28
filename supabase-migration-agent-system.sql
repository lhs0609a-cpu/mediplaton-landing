CREATE TABLE agents (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    rrn_masked TEXT,
    bank_name TEXT,
    account_number TEXT,
    account_holder TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','contract_sent','contract_signed','active','suspended','terminated')),
    contract_id BIGINT,
    approved_at TIMESTAMPTZ,
    approved_by UUID,
    suspended_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_contracts (
    id BIGSERIAL PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    contract_version TEXT NOT NULL,
    contract_body TEXT NOT NULL,
    signature_image TEXT NOT NULL,
    signed_ip TEXT,
    signed_user_agent TEXT,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    body_hash TEXT NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT
);

CREATE TABLE leads (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    phone_normalized TEXT NOT NULL,
    business_type TEXT,
    revenue_band TEXT,
    region TEXT,
    source TEXT,
    source_batch_id BIGINT,
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (phone_normalized, name)
);
CREATE INDEX idx_leads_phone_name ON leads(phone_normalized, name);
CREATE INDEX idx_leads_source_batch ON leads(source_batch_id);

CREATE TABLE lead_upload_batches (
    id BIGSERIAL PRIMARY KEY,
    file_name TEXT,
    uploaded_by UUID,
    total_rows INTEGER NOT NULL DEFAULT 0,
    inserted_rows INTEGER NOT NULL DEFAULT 0,
    duplicate_rows INTEGER NOT NULL DEFAULT 0,
    error_rows INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lead_assignments (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by UUID,
    status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress','contacting','contracted','rejected','other_product','no_answer','discarded')),
    memo TEXT,
    next_action_at TIMESTAMPTZ,
    last_status_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lead_id, agent_id)
);
CREATE INDEX idx_assign_agent_status ON lead_assignments(agent_id, status);
CREATE INDEX idx_assign_lead ON lead_assignments(lead_id);

CREATE TABLE lead_status_history (
    id BIGSERIAL PRIMARY KEY,
    assignment_id BIGINT NOT NULL REFERENCES lead_assignments(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    memo TEXT,
    changed_by UUID NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_status_history_assignment ON lead_status_history(assignment_id, changed_at);

CREATE TABLE lead_access_logs (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT REFERENCES leads(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('view_list','view_detail','export_attempt','search')),
    ip TEXT,
    user_agent TEXT,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_access_agent_time ON lead_access_logs(agent_id, accessed_at);
CREATE INDEX idx_access_lead ON lead_access_logs(lead_id);

CREATE TABLE lead_match_events (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT NOT NULL REFERENCES leads(id),
    matched_agent_id UUID REFERENCES agents(id),
    matched_inquiry_table TEXT NOT NULL,
    matched_inquiry_id BIGINT NOT NULL,
    matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    executed BOOLEAN NOT NULL DEFAULT false,
    executed_amount NUMERIC,
    executed_product TEXT,
    executed_at TIMESTAMPTZ,
    executed_by UUID,
    UNIQUE (lead_id, matched_inquiry_table, matched_inquiry_id)
);
CREATE INDEX idx_match_agent ON lead_match_events(matched_agent_id);
CREATE INDEX idx_match_executed ON lead_match_events(executed) WHERE executed = true;

CREATE TABLE commission_records (
    id BIGSERIAL PRIMARY KEY,
    match_event_id BIGINT NOT NULL REFERENCES lead_match_events(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id),
    total_revenue NUMERIC NOT NULL,
    company_share NUMERIC NOT NULL,
    agent_share NUMERIC NOT NULL,
    settlement_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (settlement_status IN ('pending','paid','disputed','penalty')),
    paid_at TIMESTAMPTZ,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_commission_agent_status ON commission_records(agent_id, settlement_status);

CREATE TABLE penalty_records (
    id BIGSERIAL PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES agents(id),
    penalty_type TEXT NOT NULL CHECK (penalty_type IN ('nda_breach','undisclosed_execution','other')),
    penalty_amount NUMERIC NOT NULL,
    related_lead_id BIGINT REFERENCES leads(id),
    evidence JSONB,
    issued_by UUID,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'issued'
        CHECK (status IN ('issued','collected','litigation','waived')),
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT
);
CREATE INDEX idx_penalty_agent ON penalty_records(agent_id);

ALTER TABLE agents
    ADD CONSTRAINT fk_agents_contract FOREIGN KEY (contract_id) REFERENCES agent_contracts(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION normalize_phone(p TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
    SELECT regexp_replace(coalesce(p,''), '[^0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION trg_leads_normalize_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.phone_normalized := normalize_phone(NEW.phone);
    RETURN NEW;
END;
$$;

CREATE TRIGGER leads_normalize_phone
BEFORE INSERT OR UPDATE OF phone ON leads
FOR EACH ROW EXECUTE FUNCTION trg_leads_normalize_phone();

CREATE OR REPLACE FUNCTION trg_lead_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO lead_status_history (assignment_id, from_status, to_status, memo, changed_by)
        VALUES (NEW.id, OLD.status, NEW.status, NEW.memo, NEW.agent_id);
        NEW.last_status_at := now();
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER lead_assignments_status_log
BEFORE UPDATE ON lead_assignments
FOR EACH ROW EXECUTE FUNCTION trg_lead_status_history();

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
    SELECT coalesce((auth.jwt() ->> 'role') = 'admin', false)
        OR EXISTS (
            SELECT 1 FROM auth.users
            WHERE id = auth.uid()
              AND coalesce(raw_app_meta_data ->> 'role', '') = 'admin'
        );
$$;

CREATE OR REPLACE FUNCTION is_active_agent()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM agents
        WHERE id = auth.uid() AND status = 'active'
    );
$$;

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalty_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY agents_self_select ON agents
    FOR SELECT USING (id = auth.uid() OR is_admin());

CREATE POLICY agents_self_insert ON agents
    FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY agents_self_update_limited ON agents
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND status = (SELECT status FROM agents WHERE id = auth.uid()));

CREATE POLICY agents_admin_all ON agents
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY agent_contracts_self_select ON agent_contracts
    FOR SELECT USING (agent_id = auth.uid() OR is_admin());

CREATE POLICY agent_contracts_self_insert ON agent_contracts
    FOR INSERT WITH CHECK (agent_id = auth.uid());

CREATE POLICY agent_contracts_admin_all ON agent_contracts
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY leads_admin_all ON leads
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY leads_assigned_select ON leads
    FOR SELECT USING (
        is_active_agent()
        AND EXISTS (
            SELECT 1 FROM lead_assignments la
            WHERE la.lead_id = leads.id AND la.agent_id = auth.uid()
        )
    );

CREATE POLICY upload_batches_admin_all ON lead_upload_batches
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY assignments_admin_all ON lead_assignments
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY assignments_agent_select ON lead_assignments
    FOR SELECT USING (agent_id = auth.uid() AND is_active_agent());

CREATE POLICY assignments_agent_update ON lead_assignments
    FOR UPDATE USING (agent_id = auth.uid() AND is_active_agent())
    WITH CHECK (agent_id = auth.uid());

CREATE POLICY status_history_select ON lead_status_history
    FOR SELECT USING (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM lead_assignments la
            WHERE la.id = lead_status_history.assignment_id
              AND la.agent_id = auth.uid()
        )
    );

CREATE POLICY access_logs_admin_all ON lead_access_logs
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY access_logs_agent_insert ON lead_access_logs
    FOR INSERT WITH CHECK (agent_id = auth.uid());

CREATE POLICY access_logs_agent_select ON lead_access_logs
    FOR SELECT USING (agent_id = auth.uid());

CREATE POLICY match_events_admin_all ON lead_match_events
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY match_events_agent_select ON lead_match_events
    FOR SELECT USING (matched_agent_id = auth.uid() AND is_active_agent());

CREATE POLICY commission_admin_all ON commission_records
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY commission_agent_select ON commission_records
    FOR SELECT USING (agent_id = auth.uid() AND is_active_agent());

CREATE POLICY penalty_admin_all ON penalty_records
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY penalty_agent_select ON penalty_records
    FOR SELECT USING (agent_id = auth.uid());

CREATE OR REPLACE FUNCTION match_inquiry_to_lead(
    p_inquiry_table TEXT,
    p_inquiry_id BIGINT,
    p_name TEXT,
    p_phone TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_phone_norm TEXT := normalize_phone(p_phone);
    v_lead_id BIGINT;
    v_agent_id UUID;
    v_match_id BIGINT;
BEGIN
    SELECT id INTO v_lead_id
    FROM leads
    WHERE phone_normalized = v_phone_norm
      AND name = p_name
    LIMIT 1;

    IF v_lead_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT agent_id INTO v_agent_id
    FROM lead_assignments
    WHERE lead_id = v_lead_id
    ORDER BY assigned_at ASC
    LIMIT 1;

    INSERT INTO lead_match_events (lead_id, matched_agent_id, matched_inquiry_table, matched_inquiry_id)
    VALUES (v_lead_id, v_agent_id, p_inquiry_table, p_inquiry_id)
    ON CONFLICT (lead_id, matched_inquiry_table, matched_inquiry_id) DO NOTHING
    RETURNING id INTO v_match_id;

    RETURN v_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION mark_match_executed(
    p_match_id BIGINT,
    p_amount NUMERIC,
    p_product TEXT,
    p_total_revenue NUMERIC
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_agent_id UUID;
    v_commission_id BIGINT;
    v_company NUMERIC;
    v_agent_share NUMERIC;
BEGIN
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

    INSERT INTO commission_records (match_event_id, agent_id, total_revenue, company_share, agent_share)
    VALUES (p_match_id, v_agent_id, p_total_revenue, v_company, v_agent_share)
    RETURNING id INTO v_commission_id;

    RETURN v_commission_id;
END;
$$;
