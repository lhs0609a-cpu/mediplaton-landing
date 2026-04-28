(function () {
    'use strict';

    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.sb = sb;

    let currentAgent = null;
    let currentEditingAssignment = null;

    function $(id) { return document.getElementById(id); }
    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }
    function fmtDate(iso) {
        if (!iso) return '-';
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function fmtMoney(n) {
        if (n == null) return '-';
        return Number(n).toLocaleString() + '원';
    }
    function statusLabel(status) {
        const map = {
            'in_progress': { text: '진행중', bg: '#DBEAFE', color: '#1E40AF' },
            'contacting': { text: '연락중', bg: '#FEF3C7', color: '#92400E' },
            'contracted': { text: '계약완료', bg: '#D1FAE5', color: '#065F46' },
            'rejected': { text: '거절', bg: '#FEE2E2', color: '#991B1B' },
            'other_product': { text: '타상품', bg: '#E0E7FF', color: '#3730A3' },
            'no_answer': { text: '부재중', bg: '#FEF3C7', color: '#92400E' },
            'discarded': { text: '폐기', bg: '#E5E7EB', color: '#374151' }
        };
        const m = map[status] || { text: status || '-', bg: '#F3F4F6', color: '#374151' };
        return `<span class="badge" style="background:${m.bg};color:${m.color};">${m.text}</span>`;
    }
    function commStatusLabel(status) {
        const map = {
            'pending': { text: '정산 대기', bg: '#FEF3C7', color: '#92400E' },
            'paid': { text: '지급 완료', bg: '#D1FAE5', color: '#065F46' },
            'disputed': { text: '이의 제기', bg: '#FEE2E2', color: '#991B1B' },
            'penalty': { text: '위약벌 차감', bg: '#FEE2E2', color: '#991B1B' }
        };
        const m = map[status] || { text: status, bg: '#F3F4F6', color: '#374151' };
        return `<span class="badge" style="background:${m.bg};color:${m.color};">${m.text}</span>`;
    }

    async function init() {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { window.location.href = 'agent.html'; return; }

        const { data: agent } = await sb.from('agents').select('*').eq('id', user.id).maybeSingle();
        if (!agent || agent.status !== 'active') {
            window.location.href = 'agent.html';
            return;
        }

        currentAgent = agent;
        $('agentName').textContent = agent.name + ' 영업자';

        setupTabs();
        setupHandlers();
        await loadStats();
        await loadLeads();
    }

    function setupTabs() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const t = tab.dataset.tab;
                $('leadsPanel').style.display = t === 'leads' ? 'block' : 'none';
                $('commissionsPanel').style.display = t === 'commissions' ? 'block' : 'none';
                $('profilePanel').style.display = t === 'profile' ? 'block' : 'none';
                if (t === 'commissions') loadCommissions();
                if (t === 'profile') renderProfile();
            };
        });
    }

    function setupHandlers() {
        $('logoutBtn').onclick = async () => {
            await sb.auth.signOut();
            window.location.href = 'agent.html';
        };

        $('leadSearch').addEventListener('input', debounce(loadLeads, 400));
        $('leadStatusFilter').onchange = loadLeads;

        $('leadModalClose').onclick = closeLeadModal;
        $('leadCancelBtn').onclick = closeLeadModal;
        $('leadSaveBtn').onclick = saveLeadStatus;
    }

    function debounce(fn, ms) {
        let t;
        return function () { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), ms); };
    }

    async function loadStats() {
        const { data: assignments } = await sb.from('lead_assignments')
            .select('status').eq('agent_id', currentAgent.id);

        const total = (assignments || []).length;
        const inProgress = (assignments || []).filter(a => ['in_progress', 'contacting'].includes(a.status)).length;
        const contracted = (assignments || []).filter(a => a.status === 'contracted').length;

        $('statAssigned').textContent = total.toLocaleString();
        $('statInProgress').textContent = inProgress.toLocaleString();
        $('statContracted').textContent = contracted.toLocaleString();

        const { data: comms } = await sb.from('commission_records')
            .select('agent_share, settlement_status')
            .eq('agent_id', currentAgent.id)
            .eq('settlement_status', 'pending');

        const pendingComm = (comms || []).reduce((sum, c) => sum + Number(c.agent_share || 0), 0);
        $('statCommission').textContent = pendingComm.toLocaleString();
    }

    async function loadLeads() {
        const loading = $('leadsLoading');
        const table = $('leadsTable');
        const empty = $('leadsEmpty');

        loading.style.display = 'flex';
        table.style.display = 'none';
        empty.style.display = 'none';

        try {
            const search = $('leadSearch').value.trim();
            const statusFilter = $('leadStatusFilter').value;

            let query = sb.from('lead_assignments').select(`
                id, status, memo, next_action_at, assigned_at, last_status_at,
                lead_id,
                leads (
                    id, name, phone, business_type, region, source, created_at
                )
            `).eq('agent_id', currentAgent.id).order('assigned_at', { ascending: false });

            if (statusFilter !== 'all') query = query.eq('status', statusFilter);

            const { data, error } = await query;
            if (error) throw error;

            let rows = data || [];
            if (search) {
                const q = search.toLowerCase();
                rows = rows.filter(r => {
                    const name = (r.leads?.name || '').toLowerCase();
                    const phone = (r.leads?.phone || '').toLowerCase();
                    return name.includes(q) || phone.includes(q);
                });
            }

            await sb.rpc('log_lead_access', { p_lead_id: null, p_action: 'view_list' }).catch(() => {});

            loading.style.display = 'none';

            if (!rows.length) {
                empty.style.display = 'block';
                return;
            }

            table.style.display = 'table';
            $('leadsTableBody').innerHTML = rows.map(r => {
                const lead = r.leads || {};
                return `<tr data-assignment-id="${r.id}" data-lead-id="${r.lead_id}">
                    <td><strong>${escapeHtml(lead.name || '-')}</strong></td>
                    <td>${escapeHtml(lead.phone || '-')}</td>
                    <td>${escapeHtml(lead.business_type || '-')}</td>
                    <td>${escapeHtml(lead.region || '-')}</td>
                    <td><small>${escapeHtml(lead.source || '-')}</small></td>
                    <td>${fmtDate(r.assigned_at)}</td>
                    <td>${statusLabel(r.status)}</td>
                    <td>
                        <button class="btn btn-sm lead-detail-btn" data-id="${r.id}">상세/변경</button>
                    </td>
                </tr>`;
            }).join('');

            document.querySelectorAll('.lead-detail-btn').forEach(btn => {
                btn.onclick = () => openLeadModal(parseInt(btn.dataset.id));
            });
        } catch (err) {
            console.error(err);
            loading.style.display = 'none';
            empty.style.display = 'block';
            empty.innerHTML = `<h3>로드 실패</h3><p>${escapeHtml(err.message)}</p>`;
        }
    }

    async function openLeadModal(assignmentId) {
        const tr = document.querySelector(`tr[data-assignment-id="${assignmentId}"]`);
        if (!tr) return;
        const leadId = parseInt(tr.dataset.leadId);

        const { data, error } = await sb.from('lead_assignments').select(`
            id, status, memo, next_action_at, assigned_at, last_status_at,
            leads ( id, name, phone, business_type, revenue_band, region, source, raw_data, created_at )
        `).eq('id', assignmentId).single();

        if (error) {
            alert('상세 조회 실패: ' + error.message);
            return;
        }

        await sb.rpc('log_lead_access', { p_lead_id: leadId, p_action: 'view_detail' }).catch(() => {});

        currentEditingAssignment = data;
        const lead = data.leads || {};

        const rawHtml = data.leads.raw_data
            ? Object.entries(data.leads.raw_data).filter(([, v]) => v).map(([k, v]) =>
                `<div class="lead-detail-row"><div class="label">${escapeHtml(k)}</div><div class="value">${escapeHtml(String(v))}</div></div>`
            ).join('')
            : '';

        $('leadModalBody').innerHTML = `
            <div style="margin-bottom:16px;">
                <div class="lead-detail-row"><div class="label">성함</div><div class="value">${escapeHtml(lead.name || '-')}</div></div>
                <div class="lead-detail-row"><div class="label">연락처</div><div class="value"><a href="tel:${escapeHtml(lead.phone)}" style="color:var(--primary);">${escapeHtml(lead.phone || '-')}</a></div></div>
                <div class="lead-detail-row"><div class="label">업종</div><div class="value">${escapeHtml(lead.business_type || '-')}</div></div>
                <div class="lead-detail-row"><div class="label">매출구간</div><div class="value">${escapeHtml(lead.revenue_band || '-')}</div></div>
                <div class="lead-detail-row"><div class="label">지역</div><div class="value">${escapeHtml(lead.region || '-')}</div></div>
                <div class="lead-detail-row"><div class="label">출처</div><div class="value">${escapeHtml(lead.source || '-')}</div></div>
                <div class="lead-detail-row"><div class="label">할당일</div><div class="value">${fmtDate(data.assigned_at)}</div></div>
            </div>

            ${rawHtml ? `<details style="margin-bottom:16px;"><summary style="cursor:pointer;font-size:13px;color:var(--gray-500);">원본 데이터 펼치기</summary><div style="margin-top:8px;background:var(--gray-50);padding:8px;border-radius:4px;">${rawHtml}</div></details>` : ''}

            <div class="form-group">
                <label>진행 상태</label>
                <select id="modalStatus">
                    <option value="in_progress">진행중</option>
                    <option value="contacting">연락중</option>
                    <option value="contracted">계약완료</option>
                    <option value="rejected">거절</option>
                    <option value="other_product">타상품 소개</option>
                    <option value="no_answer">부재중</option>
                    <option value="discarded">폐기</option>
                </select>
            </div>
            <div class="form-group">
                <label>다음 액션 일시</label>
                <input type="datetime-local" id="modalNextAction">
            </div>
            <div class="form-group">
                <label>메모</label>
                <textarea id="modalMemo" rows="4" placeholder="상담 내용, 특이사항"></textarea>
            </div>
        `;

        $('modalStatus').value = data.status;
        if (data.next_action_at) {
            const dt = new Date(data.next_action_at);
            const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            $('modalNextAction').value = local;
        }
        $('modalMemo').value = data.memo || '';

        $('leadModal').classList.add('active');
    }

    function closeLeadModal() {
        $('leadModal').classList.remove('active');
        currentEditingAssignment = null;
    }

    async function saveLeadStatus() {
        if (!currentEditingAssignment) return;

        const newStatus = $('modalStatus').value;
        const newMemo = $('modalMemo').value.trim();
        const nextActionLocal = $('modalNextAction').value;
        const nextActionAt = nextActionLocal ? new Date(nextActionLocal).toISOString() : null;

        const btn = $('leadSaveBtn');
        btn.disabled = true; btn.textContent = '저장 중...';

        try {
            const { error } = await sb.from('lead_assignments').update({
                status: newStatus,
                memo: newMemo,
                next_action_at: nextActionAt
            }).eq('id', currentEditingAssignment.id);

            if (error) throw error;

            closeLeadModal();
            await loadStats();
            await loadLeads();
        } catch (err) {
            alert('저장 실패: ' + err.message);
        } finally {
            btn.disabled = false; btn.textContent = '저장';
        }
    }

    async function loadCommissions() {
        const loading = $('commLoading');
        const table = $('commTable');
        const empty = $('commEmpty');

        loading.style.display = 'flex';
        table.style.display = 'none';
        empty.style.display = 'none';

        try {
            const { data, error } = await sb.from('commission_records').select(`
                *,
                lead_match_events ( executed_amount, executed_product, executed_at, lead_id )
            `).eq('agent_id', currentAgent.id).order('created_at', { ascending: false });

            if (error) throw error;

            loading.style.display = 'none';

            if (!data || !data.length) {
                empty.style.display = 'block';
                return;
            }

            table.style.display = 'table';
            $('commTableBody').innerHTML = data.map(c => {
                const evt = c.lead_match_events || {};
                return `<tr>
                    <td>${fmtDate(c.created_at)}</td>
                    <td>${escapeHtml(evt.executed_product || '-')}</td>
                    <td>${fmtMoney(evt.executed_amount)}</td>
                    <td>${fmtMoney(c.total_revenue)}</td>
                    <td><strong style="color:var(--primary);">${fmtMoney(c.agent_share)}</strong></td>
                    <td>${commStatusLabel(c.settlement_status)}</td>
                </tr>`;
            }).join('');
        } catch (err) {
            console.error(err);
            loading.style.display = 'none';
            empty.style.display = 'block';
            empty.innerHTML = `<h3>로드 실패</h3><p>${escapeHtml(err.message)}</p>`;
        }
    }

    function renderProfile() {
        const a = currentAgent;
        $('profileBody').innerHTML = `
            <div style="background:var(--gray-50);padding:16px;border-radius:var(--radius);">
                <div class="lead-detail-row"><div class="label">성함</div><div class="value">${escapeHtml(a.name)}</div></div>
                <div class="lead-detail-row"><div class="label">이메일</div><div class="value">${escapeHtml(a.email)}</div></div>
                <div class="lead-detail-row"><div class="label">연락처</div><div class="value">${escapeHtml(a.phone)}</div></div>
                <div class="lead-detail-row"><div class="label">상태</div><div class="value"><span class="badge" style="background:#D1FAE5;color:#065F46;">활성</span></div></div>
                <div class="lead-detail-row"><div class="label">정산 계좌</div><div class="value">${a.bank_name ? escapeHtml(a.bank_name) + ' ' + escapeHtml(a.account_number || '') + ' (' + escapeHtml(a.account_holder || '') + ')' : '<span style="color:var(--gray-500);">미등록</span>'}</div></div>
                <div class="lead-detail-row"><div class="label">가입일</div><div class="value">${fmtDate(a.created_at)}</div></div>
                <div class="lead-detail-row"><div class="label">계약 상태</div><div class="value"><span class="badge" style="background:#D1FAE5;color:#065F46;">서명 완료</span> <button class="btn btn-sm" id="viewContractBtn" style="margin-left:8px;">계약서 보기</button></div></div>
            </div>
            <p style="margin-top:16px;font-size:12px;color:var(--gray-500);">
                ※ 계좌 정보 변경이 필요하시면 관리자에게 문의해 주세요. (0507-1434-3226)<br>
                ※ 본 시스템의 모든 활동은 로그로 기록됩니다.
            </p>
        `;

        const viewBtn = $('viewContractBtn');
        if (viewBtn) viewBtn.onclick = viewContract;
    }

    async function viewContract() {
        if (!currentAgent.contract_id) {
            alert('계약서를 찾을 수 없습니다.');
            return;
        }
        const { data, error } = await sb.from('agent_contracts')
            .select('*').eq('id', currentAgent.contract_id).single();
        if (error) { alert('조회 실패: ' + error.message); return; }

        const w = window.open('', '_blank');
        w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>영업위탁계약서</title>
            <style>
                body { font-family: 'Pretendard', sans-serif; max-width: 720px; margin: 32px auto; padding: 0 24px; line-height: 1.7; color: #111827; }
                h1 { font-size: 18px; text-align: center; margin-bottom: 24px; }
                h3 { font-size: 14px; margin: 16px 0 8px; }
                p { font-size: 13px; margin-bottom: 8px; }
                .meta { background: #F9FAFB; padding: 12px; border-radius: 6px; font-size: 12px; margin-bottom: 16px; }
                .signature-img { border: 1px solid #ddd; padding: 12px; max-width: 320px; }
            </style></head><body>
            <h1>영업위탁계약서 (서명본)</h1>
            <div class="meta">
                <div>영업자: ${escapeHtml(currentAgent.name)} (${escapeHtml(currentAgent.email)})</div>
                <div>계약 버전: ${escapeHtml(data.contract_version)}</div>
                <div>서명 일시: ${fmtDate(data.signed_at)} ${new Date(data.signed_at).toLocaleTimeString('ko-KR')}</div>
                <div>서명 IP: ${escapeHtml(data.signed_ip || '-')}</div>
                <div>해시값: <code style="font-size:10px;">${escapeHtml(data.body_hash)}</code></div>
            </div>
            <div>${data.contract_body}</div>
            <h3>전자서명</h3>
            <img class="signature-img" src="${data.signature_image}" alt="서명">
            </body></html>`);
        w.document.close();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
