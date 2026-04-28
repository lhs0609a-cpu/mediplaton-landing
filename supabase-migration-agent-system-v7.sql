CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT coalesce(
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
        false
    );
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, anon;

CREATE OR REPLACE FUNCTION is_active_agent()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM agents
        WHERE id = auth.uid() AND status = 'active'
    );
$$;

GRANT EXECUTE ON FUNCTION is_active_agent() TO authenticated;
