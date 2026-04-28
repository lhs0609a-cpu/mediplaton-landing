(function () {
    'use strict';

    let parsedRows = [];
    let parsedHeaders = [];
    let columnMap = {};
    let selectedLeadIds = new Set();
    let agentCache = [];

    function $(id) { return document.getElementById(id); }
    function showToast(msg, type) {
        if (typeof window.showToast === 'function') return window.showToast(msg, type);
        alert(msg);
    }

    function normalizePhone(p) {
        return String(p || '').replace(/[^0-9]/g, '');
    }

    function detectColumn(headers, candidates) {
        for (const cand of candidates) {
            const idx = headers.findIndex(h => String(h || '').trim().toLowerCase().includes(cand));
            if (idx >= 0) return idx;
        }
        return -1;
    }

    function autoMapColumns(headers) {
        return {
            name: detectColumn(headers, ['이름', '성함', '대표', 'name']),
            phone: detectColumn(headers, ['전화', '연락처', '핸드폰', '휴대폰', 'phone', 'tel']),
            business_type: detectColumn(headers, ['업종', '직업', '진료', 'business']),
            revenue_band: detectColumn(headers, ['매출', '월매출', 'revenue']),
            region: detectColumn(headers, ['지역', '주소', '소재지', 'region']),
            note: detectColumn(headers, ['비고', '메모', 'note', 'memo'])
        };
    }

    function setupUploadUI() {
        const showBtn = $('leadShowUploadBtn');
        const area = $('leadUploadArea');
        const fileInput = $('leadFileInput');
        const cancelBtn = $('leadCancelUploadBtn');
        const confirmBtn = $('leadConfirmUploadBtn');

        if (!showBtn) return;

        showBtn.onclick = () => {
            area.style.display = area.style.display === 'none' ? 'block' : 'none';
        };

        cancelBtn.onclick = () => {
            area.style.display = 'none';
            $('leadPreviewArea').style.display = 'none';
            $('leadUploadResult').style.display = 'none';
            fileInput.value = '';
            parsedRows = [];
        };

        fileInput.onchange = handleFileSelect;
        confirmBtn.onclick = handleConfirmUpload;
    }

    async function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

            if (!rows.length) {
                showToast('빈 파일입니다.', 'error');
                return;
            }

            parsedHeaders = rows[0].map(h => String(h || '').trim());
            parsedRows = rows.slice(1).filter(r => r.some(c => String(c || '').trim() !== ''));
            columnMap = autoMapColumns(parsedHeaders);

            renderPreview();
        } catch (err) {
            console.error(err);
            showToast('파일 파싱 실패: ' + err.message, 'error');
        }
    }

    function renderPreview() {
        const head = $('leadPreviewHead');
        const body = $('leadPreviewBody');
        const summary = $('leadPreviewSummary');

        head.innerHTML = parsedHeaders.map((h, i) => {
            const matched = Object.entries(columnMap).find(([, idx]) => idx === i);
            const tag = matched ? `<span style="font-size:11px;color:var(--primary);font-weight:600;">[${matched[0]}]</span>` : '';
            return `<th>${escapeHtml(h)} ${tag}</th>`;
        }).join('');

        body.innerHTML = parsedRows.slice(0, 10).map(row => {
            return '<tr>' + parsedHeaders.map((_, i) => `<td>${escapeHtml(row[i] || '')}</td>`).join('') + '</tr>';
        }).join('');

        const validCount = parsedRows.filter(r => {
            const name = columnMap.name >= 0 ? String(r[columnMap.name] || '').trim() : '';
            const phone = columnMap.phone >= 0 ? normalizePhone(r[columnMap.phone]) : '';
            return name && phone.length >= 10;
        }).length;

        let warnings = [];
        if (columnMap.name < 0) warnings.push('이름 열을 찾지 못했습니다');
        if (columnMap.phone < 0) warnings.push('전화번호 열을 찾지 못했습니다');

        summary.innerHTML = `총 ${parsedRows.length}건 · 유효 ${validCount}건 · 무효 ${parsedRows.length - validCount}건` +
            (warnings.length ? `<br><span style="color:var(--danger);">⚠ ${warnings.join(', ')}</span>` : '');

        $('leadPreviewArea').style.display = 'block';
    }

    async function handleConfirmUpload() {
        if (!parsedRows.length) {
            showToast('업로드할 데이터가 없습니다.', 'error');
            return;
        }
        if (columnMap.name < 0 || columnMap.phone < 0) {
            showToast('이름과 전화번호 열이 필요합니다.', 'error');
            return;
        }

        const sourceLabel = $('leadSourceLabel').value.trim() || `엑셀_${new Date().toISOString().slice(0, 10)}`;
        const fileName = $('leadFileInput').files[0]?.name || '';

        const validRows = parsedRows.map(r => {
            const name = String(r[columnMap.name] || '').trim();
            const phone = String(r[columnMap.phone] || '').trim();
            const phone_normalized = normalizePhone(phone);
            if (!name || phone_normalized.length < 10) return null;
            return {
                name,
                phone,
                phone_normalized,
                business_type: columnMap.business_type >= 0 ? String(r[columnMap.business_type] || '').trim() || null : null,
                revenue_band: columnMap.revenue_band >= 0 ? String(r[columnMap.revenue_band] || '').trim() || null : null,
                region: columnMap.region >= 0 ? String(r[columnMap.region] || '').trim() || null : null,
                source: sourceLabel,
                raw_data: parsedHeaders.reduce((acc, h, i) => {
                    acc[h || `col_${i}`] = r[i] || '';
                    return acc;
                }, {})
            };
        }).filter(Boolean);

        if (!validRows.length) {
            showToast('유효한 행이 없습니다.', 'error');
            return;
        }

        const btn = $('leadConfirmUploadBtn');
        btn.disabled = true;
        btn.textContent = '적재 중...';

        try {
            const { data: batch, error: batchErr } = await sb.from('lead_upload_batches').insert({
                file_name: fileName,
                total_rows: parsedRows.length,
                note: sourceLabel
            }).select().single();
            if (batchErr) throw batchErr;

            const rowsWithBatch = validRows.map(r => ({ ...r, source_batch_id: batch.id }));

            let inserted = 0;
            let duplicates = 0;
            const chunkSize = 500;

            for (let i = 0; i < rowsWithBatch.length; i += chunkSize) {
                const chunk = rowsWithBatch.slice(i, i + chunkSize);
                const { data, error } = await sb.from('leads').upsert(chunk, {
                    onConflict: 'phone_normalized,name',
                    ignoreDuplicates: true
                }).select('id');
                if (error) throw error;
                inserted += (data || []).length;
                duplicates += chunk.length - (data || []).length;
            }

            await sb.from('lead_upload_batches').update({
                inserted_rows: inserted,
                duplicate_rows: duplicates,
                error_rows: parsedRows.length - validRows.length
            }).eq('id', batch.id);

            const result = $('leadUploadResult');
            result.style.display = 'block';
            result.style.background = '#D1FAE5';
            result.innerHTML = `<strong>✓ 적재 완료</strong><br>
                전체 ${parsedRows.length}건 · 신규 ${inserted}건 · 중복 ${duplicates}건 · 무효 ${parsedRows.length - validRows.length}건`;

            $('leadPreviewArea').style.display = 'none';
            $('leadFileInput').value = '';
            parsedRows = [];

            await loadLeadManagement();
        } catch (err) {
            console.error(err);
            const result = $('leadUploadResult');
            result.style.display = 'block';
            result.style.background = '#FEE2E2';
            result.innerHTML = `<strong>✗ 오류</strong><br>${escapeHtml(err.message)}`;
        } finally {
            btn.disabled = false;
            btn.textContent = 'DB에 적재';
        }
    }

    async function loadLeadManagement() {
        const loading = $('leadLoading');
        const table = $('leadTable');
        const empty = $('leadEmpty');
        const tbody = $('leadTableBody');

        loading.style.display = 'flex';
        table.style.display = 'none';
        empty.style.display = 'none';

        try {
            await loadAgentCache();
            await renderBatchHistory();

            const search = ($('leadSearch')?.value || '').trim();
            const statusFilter = $('leadStatusFilter')?.value || 'all';

            let query = sb.from('leads').select(`
                id, name, phone, business_type, region, source, created_at,
                lead_assignments (
                    id, agent_id, status, assigned_at,
                    agents ( name )
                )
            `).order('created_at', { ascending: false }).limit(500);

            if (search) {
                query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
            }

            const { data, error } = await query;
            if (error) throw error;

            let filtered = data || [];
            if (statusFilter === 'unassigned') {
                filtered = filtered.filter(d => !d.lead_assignments || d.lead_assignments.length === 0);
            } else if (statusFilter === 'assigned') {
                filtered = filtered.filter(d => d.lead_assignments && d.lead_assignments.length > 0);
            } else if (statusFilter === 'contracted') {
                filtered = filtered.filter(d => d.lead_assignments?.some(a => a.status === 'contracted'));
            } else if (statusFilter === 'discarded') {
                filtered = filtered.filter(d => d.lead_assignments?.some(a => a.status === 'discarded'));
            }

            $('leadBadge').textContent = filtered.length;

            loading.style.display = 'none';

            if (!filtered.length) {
                empty.style.display = 'block';
                return;
            }

            table.style.display = 'table';
            tbody.innerHTML = filtered.map(lead => renderLeadRow(lead)).join('');

            renderBulkAssignSelect();
            attachLeadRowHandlers();
        } catch (err) {
            console.error(err);
            loading.style.display = 'none';
            showToast('DB 로드 실패: ' + err.message, 'error');
        }
    }

    function renderLeadRow(lead) {
        const assignment = lead.lead_assignments?.[0];
        const agentName = assignment?.agents?.name || '<span style="color:var(--gray-400);">미할당</span>';
        const status = assignment ? statusLabel(assignment.status) : '<span class="badge" style="background:var(--gray-100);color:var(--gray-700);">미할당</span>';

        return `<tr data-lead-id="${lead.id}">
            <td><input type="checkbox" class="lead-row-check" value="${lead.id}"></td>
            <td>${formatDate(lead.created_at)}</td>
            <td>${escapeHtml(lead.name)}</td>
            <td>${escapeHtml(lead.phone)}</td>
            <td>${escapeHtml(lead.business_type || '-')}</td>
            <td>${escapeHtml(lead.region || '-')}</td>
            <td><span style="font-size:12px;color:var(--gray-500);">${escapeHtml(lead.source || '-')}</span></td>
            <td>${agentName}</td>
            <td>${status}</td>
            <td>
                <button class="btn btn-outline btn-sm lead-assign-btn" data-lead-id="${lead.id}">할당</button>
            </td>
        </tr>`;
    }

    function statusLabel(status) {
        const map = {
            'in_progress': { text: '진행중', bg: '#DBEAFE', color: '#1E40AF' },
            'contacting': { text: '연락중', bg: '#FEF3C7', color: '#92400E' },
            'contracted': { text: '계약완료', bg: '#D1FAE5', color: '#065F46' },
            'rejected': { text: '거절', bg: '#FEE2E2', color: '#991B1B' },
            'other_product': { text: '타상품', bg: '#E0E7FF', color: '#3730A3' },
            'no_answer': { text: '부재중', bg: '#FEF3C7', color: '#92400E' },
            'discarded': { text: '폐기', bg: 'var(--gray-200)', color: 'var(--gray-700)' }
        };
        const m = map[status] || { text: status, bg: 'var(--gray-100)', color: 'var(--gray-700)' };
        return `<span class="badge" style="background:${m.bg};color:${m.color};padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;">${m.text}</span>`;
    }

    function attachLeadRowHandlers() {
        document.querySelectorAll('.lead-row-check').forEach(cb => {
            cb.onchange = () => {
                if (cb.checked) selectedLeadIds.add(parseInt(cb.value));
                else selectedLeadIds.delete(parseInt(cb.value));
                updateBulkBar();
            };
        });

        const selectAll = $('leadSelectAll');
        if (selectAll) {
            selectAll.onchange = () => {
                document.querySelectorAll('.lead-row-check').forEach(cb => {
                    cb.checked = selectAll.checked;
                    cb.dispatchEvent(new Event('change'));
                });
            };
        }

        document.querySelectorAll('.lead-assign-btn').forEach(btn => {
            btn.onclick = () => quickAssignLead(parseInt(btn.dataset.leadId));
        });
    }

    function updateBulkBar() {
        const bar = $('leadBulkAssignBar');
        const count = $('leadSelectedCount');
        if (selectedLeadIds.size > 0) {
            bar.style.display = 'flex';
            count.textContent = `${selectedLeadIds.size}건 선택됨`;
        } else {
            bar.style.display = 'none';
        }
    }

    async function loadAgentCache() {
        const { data, error } = await sb.from('agents')
            .select('id, name, status')
            .eq('status', 'active');
        if (!error) agentCache = data || [];
    }

    function renderBulkAssignSelect() {
        const sel = $('leadBulkAgentSelect');
        if (!sel) return;
        sel.innerHTML = '<option value="">영업자 선택...</option>' +
            agentCache.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');

        const btn = $('leadBulkAssignBtn');
        if (btn) {
            btn.onclick = async () => {
                const agentId = sel.value;
                if (!agentId) { showToast('영업자를 선택하세요.', 'error'); return; }
                if (!selectedLeadIds.size) { showToast('할당할 DB를 선택하세요.', 'error'); return; }
                if (!confirm(`${selectedLeadIds.size}건을 선택한 영업자에게 할당하시겠습니까?`)) return;

                const rows = [...selectedLeadIds].map(lid => ({
                    lead_id: lid,
                    agent_id: agentId,
                    assigned_by: (await sb.auth.getUser()).data.user?.id
                }));

                const { error } = await sb.from('lead_assignments').upsert(rows, {
                    onConflict: 'lead_id,agent_id',
                    ignoreDuplicates: true
                });

                if (error) {
                    showToast('할당 실패: ' + error.message, 'error');
                } else {
                    showToast(`${selectedLeadIds.size}건 할당 완료`, 'success');
                    selectedLeadIds.clear();
                    await loadLeadManagement();
                }
            };
        }
    }

    async function quickAssignLead(leadId) {
        if (!agentCache.length) {
            showToast('활성 영업자가 없습니다.', 'error');
            return;
        }
        const list = agentCache.map((a, i) => `${i + 1}. ${a.name}`).join('\n');
        const choice = prompt(`할당할 영업자 번호 입력:\n${list}`);
        if (!choice) return;
        const idx = parseInt(choice) - 1;
        if (isNaN(idx) || !agentCache[idx]) { showToast('잘못된 선택', 'error'); return; }

        const { error } = await sb.from('lead_assignments').upsert({
            lead_id: leadId,
            agent_id: agentCache[idx].id
        }, { onConflict: 'lead_id,agent_id', ignoreDuplicates: true });

        if (error) {
            showToast('할당 실패: ' + error.message, 'error');
        } else {
            showToast(`${agentCache[idx].name} 영업자에게 할당`, 'success');
            await loadLeadManagement();
        }
    }

    async function renderBatchHistory() {
        const { data } = await sb.from('lead_upload_batches')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
        if (!data || !data.length) return;

        const html = `
            <details style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius);padding:12px 16px;">
                <summary style="cursor:pointer;font-weight:600;font-size:14px;">최근 업로드 이력 (${data.length}건)</summary>
                <table style="width:100%;margin-top:12px;font-size:13px;">
                    <thead><tr style="text-align:left;color:var(--gray-500);">
                        <th style="padding:6px 4px;">일시</th>
                        <th style="padding:6px 4px;">파일/라벨</th>
                        <th style="padding:6px 4px;">전체</th>
                        <th style="padding:6px 4px;">신규</th>
                        <th style="padding:6px 4px;">중복</th>
                        <th style="padding:6px 4px;">무효</th>
                    </tr></thead>
                    <tbody>${data.map(b => `<tr>
                        <td style="padding:6px 4px;">${formatDate(b.created_at)}</td>
                        <td style="padding:6px 4px;">${escapeHtml(b.note || b.file_name || '-')}</td>
                        <td style="padding:6px 4px;">${b.total_rows}</td>
                        <td style="padding:6px 4px;color:var(--success);font-weight:600;">${b.inserted_rows}</td>
                        <td style="padding:6px 4px;color:var(--gray-500);">${b.duplicate_rows}</td>
                        <td style="padding:6px 4px;color:var(--danger);">${b.error_rows}</td>
                    </tr>`).join('')}</tbody>
                </table>
            </details>
        `;
        $('leadBatchHistory').innerHTML = html;
    }

    async function loadAgentManagement() {
        const loading = $('agentLoading');
        const table = $('agentTable');
        const empty = $('agentEmpty');
        const tbody = $('agentTableBody');

        loading.style.display = 'flex';
        table.style.display = 'none';
        empty.style.display = 'none';

        try {
            const statusFilter = $('agentStatusFilter')?.value || 'all';
            const search = ($('agentSearch')?.value || '').trim();

            let query = sb.from('agents').select(`
                *,
                agent_contracts ( id, contract_version, signed_at, revoked_at )
            `).order('created_at', { ascending: false });

            if (statusFilter !== 'all') query = query.eq('status', statusFilter);
            if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);

            const { data, error } = await query;
            if (error) throw error;

            $('agentBadge').textContent = (data || []).filter(a => a.status === 'pending').length;

            loading.style.display = 'none';

            if (!data || !data.length) {
                empty.style.display = 'block';
                return;
            }

            table.style.display = 'table';

            const counts = await Promise.all(data.map(a =>
                sb.from('lead_assignments').select('id', { count: 'exact', head: true }).eq('agent_id', a.id)
            ));

            tbody.innerHTML = data.map((agent, i) => {
                const cnt = counts[i].count || 0;
                const contract = agent.agent_contracts?.find(c => !c.revoked_at);
                const contractCell = contract
                    ? `<span style="color:var(--success);font-size:12px;">서명됨<br><small>${formatDate(contract.signed_at)}</small></span>`
                    : `<span style="color:var(--gray-400);font-size:12px;">미서명</span>`;

                return `<tr data-agent-id="${agent.id}">
                    <td>${formatDate(agent.created_at)}</td>
                    <td><strong>${escapeHtml(agent.name)}</strong></td>
                    <td>${escapeHtml(agent.phone)}</td>
                    <td><small>${escapeHtml(agent.email)}</small></td>
                    <td><small>${agent.bank_name ? escapeHtml(agent.bank_name) + ' ' + escapeHtml(agent.account_number || '') : '-'}</small></td>
                    <td>${agentStatusBadge(agent.status)}</td>
                    <td>${cnt}건</td>
                    <td>${contractCell}</td>
                    <td>
                        ${agent.status === 'pending' ? `<button class="btn btn-success btn-sm agent-approve-btn" data-id="${agent.id}">승인</button>` : ''}
                        ${agent.status === 'active' ? `<button class="btn btn-warning btn-sm agent-suspend-btn" data-id="${agent.id}">정지</button>` : ''}
                        ${agent.status === 'suspended' ? `<button class="btn btn-success btn-sm agent-activate-btn" data-id="${agent.id}">활성화</button>` : ''}
                    </td>
                </tr>`;
            }).join('');

            attachAgentHandlers();
        } catch (err) {
            console.error(err);
            loading.style.display = 'none';
            showToast('영업자 로드 실패: ' + err.message, 'error');
        }
    }

    function agentStatusBadge(status) {
        const map = {
            'pending': { text: '승인대기', bg: '#FEF3C7', color: '#92400E' },
            'contract_sent': { text: '계약서 발송', bg: '#DBEAFE', color: '#1E40AF' },
            'contract_signed': { text: '서명완료', bg: '#E0E7FF', color: '#3730A3' },
            'active': { text: '활성', bg: '#D1FAE5', color: '#065F46' },
            'suspended': { text: '정지', bg: '#FEE2E2', color: '#991B1B' },
            'terminated': { text: '해지', bg: 'var(--gray-200)', color: 'var(--gray-700)' }
        };
        const m = map[status] || { text: status, bg: 'var(--gray-100)', color: 'var(--gray-700)' };
        return `<span class="badge" style="background:${m.bg};color:${m.color};padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;">${m.text}</span>`;
    }

    function attachAgentHandlers() {
        document.querySelectorAll('.agent-approve-btn').forEach(btn => {
            btn.onclick = async () => {
                if (!confirm('승인하시겠습니까? 영업자는 계약서 서명 후 활성화됩니다.')) return;
                const { error } = await sb.from('agents').update({
                    status: 'contract_sent',
                    approved_at: new Date().toISOString()
                }).eq('id', btn.dataset.id);
                if (error) showToast('승인 실패: ' + error.message, 'error');
                else { showToast('승인됨. 영업자가 로그인하여 계약서 서명 시 활성화됩니다.', 'success'); loadAgentManagement(); }
            };
        });

        document.querySelectorAll('.agent-suspend-btn').forEach(btn => {
            btn.onclick = async () => {
                const reason = prompt('정지 사유:');
                if (!reason) return;
                const { error } = await sb.from('agents').update({
                    status: 'suspended',
                    suspended_reason: reason
                }).eq('id', btn.dataset.id);
                if (error) showToast('정지 실패: ' + error.message, 'error');
                else { showToast('정지 처리됨', 'success'); loadAgentManagement(); }
            };
        });

        document.querySelectorAll('.agent-activate-btn').forEach(btn => {
            btn.onclick = async () => {
                if (!confirm('정지를 해제하시겠습니까?')) return;
                const { error } = await sb.from('agents').update({
                    status: 'active',
                    suspended_reason: null
                }).eq('id', btn.dataset.id);
                if (error) showToast('활성화 실패: ' + error.message, 'error');
                else { showToast('활성화됨', 'success'); loadAgentManagement(); }
            };
        });
    }

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    function formatDate(iso) {
        if (!iso) return '-';
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    function init() {
        setupUploadUI();

        const search = $('leadSearch');
        if (search) search.addEventListener('input', debounce(loadLeadManagement, 400));
        const sf = $('leadStatusFilter');
        if (sf) sf.onchange = loadLeadManagement;

        const agentSearch = $('agentSearch');
        if (agentSearch) agentSearch.addEventListener('input', debounce(loadAgentManagement, 400));
        const af = $('agentStatusFilter');
        if (af) af.onchange = loadAgentManagement;
    }

    function debounce(fn, ms) {
        let t;
        return function () {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, arguments), ms);
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.loadLeadManagement = loadLeadManagement;
    window.loadAgentManagement = loadAgentManagement;
})();
