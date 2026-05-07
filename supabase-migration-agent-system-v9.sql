-- ============================================
-- 영업자 시스템 v9: 관리자 한눈 현황 view
-- ============================================
-- 추가 사항:
--   1. v_lead_status_counts        : 전체 lead 상태별 카운트
--   2. v_agent_lead_summary        : 영업자별 진행 매트릭스 (상태별 + 최근 활동)
--   3. v_lead_assignment_overview  : 행 클릭 시 메모·이력 빠른 조회
-- ============================================

-- 1) 전체 영업 DB 상태별 카운트
--    화면 상단 통계 카드용. 미할당은 status NULL → 'unassigned' 라벨로 매핑.
CREATE OR REPLACE VIEW v_lead_status_counts AS
SELECT
    coalesce(la.status::text, 'unassigned') AS status,
    count(*) AS count
FROM leads l
LEFT JOIN lead_assignments la ON la.lead_id = l.id
GROUP BY coalesce(la.status::text, 'unassigned');

GRANT SELECT ON v_lead_status_counts TO authenticated;

-- 2) 영업자별 진행 매트릭스
--    영업자 1명 = 1행. 상태별 건수 + 마지막 활동 시각 + 다음 액션 가장 빠른 시각.
CREATE OR REPLACE VIEW v_agent_lead_summary AS
SELECT
    a.id                                                                    AS agent_id,
    a.name                                                                  AS agent_name,
    a.status                                                                AS agent_status,
    count(la.id)                                                            AS total,
    count(*) FILTER (WHERE la.status = 'in_progress')                       AS in_progress,
    count(*) FILTER (WHERE la.status = 'contacting')                        AS contacting,
    count(*) FILTER (WHERE la.status = 'contracted')                        AS contracted,
    count(*) FILTER (WHERE la.status = 'rejected')                          AS rejected,
    count(*) FILTER (WHERE la.status = 'other_product')                     AS other_product,
    count(*) FILTER (WHERE la.status = 'no_answer')                         AS no_answer,
    count(*) FILTER (WHERE la.status = 'discarded')                         AS discarded,
    max(la.last_status_at)                                                  AS last_activity_at,
    min(la.next_action_at) FILTER (WHERE la.next_action_at > now())         AS next_action_at
FROM agents a
LEFT JOIN lead_assignments la ON la.agent_id = a.id
GROUP BY a.id, a.name, a.status;

GRANT SELECT ON v_agent_lead_summary TO authenticated;

-- 3) lead 행 상세 (관리자가 메모·이력 빠르게 볼 때)
CREATE OR REPLACE VIEW v_lead_assignment_overview AS
SELECT
    la.id                       AS assignment_id,
    la.lead_id,
    la.agent_id,
    a.name                      AS agent_name,
    l.name                      AS lead_name,
    l.phone                     AS lead_phone,
    l.business_type,
    l.region,
    l.source,
    la.status,
    la.memo,
    la.assigned_at,
    la.last_status_at,
    la.next_action_at,
    (SELECT count(*) FROM lead_status_history h WHERE h.assignment_id = la.id) AS history_count
FROM lead_assignments la
JOIN leads  l ON l.id = la.lead_id
JOIN agents a ON a.id = la.agent_id;

GRANT SELECT ON v_lead_assignment_overview TO authenticated;
