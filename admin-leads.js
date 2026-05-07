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
            await renderLeadStatusCards();
            await renderAgentMatrix();

            const search = ($('leadSearch')?.value || '').trim();
            const statusFilter = $('leadStatusFilter')?.value || 'all';

            const DISPLAY_LIMIT = 5000;
            let query = sb.from('leads').select(`
                id, name, phone, business_type, region, source, created_at,
                lead_assignments (
                    id, agent_id, status, assigned_at,
                    agents ( name )
                )
            `).order('created_at', { ascending: false }).limit(DISPLAY_LIMIT);

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

            const { count: totalLeadCount } = await sb.from('leads')
                .select('id', { count: 'exact', head: true });
            $('leadBadge').textContent = totalLeadCount != null ? totalLeadCount : filtered.length;

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
        const detailBtn = assignment
            ? `<button class="btn btn-outline btn-sm lead-detail-btn" data-assignment-id="${assignment.id}">상세</button>`
            : '';

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
                ${detailBtn}
            </td>
        </tr>`;
    }

    const STATUS_DEFS = [
        { key: 'unassigned',    label: '미할당',     bg: '#F3F4F6', color: '#374151' },
        { key: 'in_progress',   label: '진행중',     bg: '#DBEAFE', color: '#1E40AF' },
        { key: 'contacting',    label: '연락중',     bg: '#FEF3C7', color: '#92400E' },
        { key: 'no_answer',     label: '부재중',     bg: '#FEF3C7', color: '#92400E' },
        { key: 'contracted',    label: '계약완료',   bg: '#D1FAE5', color: '#065F46' },
        { key: 'other_product', label: '타상품',     bg: '#E0E7FF', color: '#3730A3' },
        { key: 'rejected',      label: '거절',       bg: '#FEE2E2', color: '#991B1B' },
        { key: 'discarded',     label: '폐기',       bg: '#E5E7EB', color: '#6B7280' }
    ];

    async function renderLeadStatusCards() {
        const container = $('leadStatusCards');
        if (!container) return;
        const { data, error } = await sb.from('v_lead_status_counts').select('*');
        if (error) {
            container.innerHTML = `<div style="color:var(--danger);font-size:12px;">상태 집계 로드 실패: ${escapeHtml(error.message)}</div>`;
            return;
        }
        const map = {};
        let total = 0;
        for (const r of (data || [])) { map[r.status] = r.count; total += r.count; }

        const cards = STATUS_DEFS.map(def => {
            const cnt = map[def.key] || 0;
            return `<div style="background:var(--white);border:1px solid var(--gray-200);border-left:4px solid ${def.color};border-radius:var(--radius);padding:10px 12px;">
                <div style="font-size:11px;color:var(--gray-500);">${def.label}</div>
                <div style="font-size:20px;font-weight:700;color:${def.color};">${cnt.toLocaleString()}</div>
            </div>`;
        }).join('');

        container.innerHTML = `<div style="background:var(--primary);color:white;border-radius:var(--radius);padding:10px 12px;">
            <div style="font-size:11px;opacity:0.9;">전체 DB</div>
            <div style="font-size:20px;font-weight:700;">${total.toLocaleString()}</div>
        </div>` + cards;
    }

    async function renderAgentMatrix() {
        const body = $('leadAgentMatrixBody');
        if (!body) return;
        const { data, error } = await sb.from('v_agent_lead_summary')
            .select('*').order('total', { ascending: false });
        if (error) {
            body.innerHTML = `<div style="color:var(--danger);font-size:12px;">매트릭스 로드 실패: ${escapeHtml(error.message)}</div>`;
            return;
        }
        if (!data || !data.length) {
            body.innerHTML = `<div style="color:var(--gray-500);font-size:13px;">영업자 없음</div>`;
            return;
        }

        const headers = ['영업자', '상태', '총', '진행중', '연락중', '부재중', '계약완료', '타상품', '거절', '폐기', '최근 활동', '다음 액션'];
        const rows = data.map(r => `<tr>
            <td><strong>${escapeHtml(r.agent_name || '-')}</strong></td>
            <td>${agentStatusBadge(r.agent_status)}</td>
            <td><strong>${r.total || 0}</strong></td>
            <td>${r.in_progress || 0}</td>
            <td>${r.contacting || 0}</td>
            <td>${r.no_answer || 0}</td>
            <td style="color:#065F46;font-weight:600;">${r.contracted || 0}</td>
            <td>${r.other_product || 0}</td>
            <td>${r.rejected || 0}</td>
            <td style="color:var(--gray-500);">${r.discarded || 0}</td>
            <td><small>${r.last_activity_at ? formatDate(r.last_activity_at) : '-'}</small></td>
            <td><small>${r.next_action_at ? formatDate(r.next_action_at) : '-'}</small></td>
        </tr>`).join('');

        body.innerHTML = `<table class="data-table" style="margin:0;font-size:13px;">
            <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    async function openLeadDetailModal(assignmentId) {
        const modal = $('adminLeadDetailModal');
        const body = $('adminLeadDetailBody');
        if (!modal || !body) return;

        body.innerHTML = `<div style="text-align:center;padding:24px;color:var(--gray-500);">불러오는 중...</div>`;
        modal.classList.add('active');

        const { data, error } = await sb.from('v_lead_assignment_overview')
            .select('*').eq('assignment_id', assignmentId).maybeSingle();
        if (error || !data) {
            body.innerHTML = `<div style="color:var(--danger);">조회 실패: ${escapeHtml(error?.message || 'not found')}</div>`;
            return;
        }

        const { data: history } = await sb.from('lead_status_history')
            .select('*').eq('assignment_id', assignmentId).order('changed_at', { ascending: false }).limit(20);

        const histHtml = (history && history.length)
            ? `<div style="margin-top:16px;">
                <h4 style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--gray-700);">상태 변경 이력</h4>
                <table class="data-table" style="margin:0;font-size:12px;">
                    <thead><tr><th>일시</th><th>이전</th><th>이후</th><th>메모</th></tr></thead>
                    <tbody>${history.map(h => `<tr>
                        <td>${formatDate(h.changed_at)}</td>
                        <td>${escapeHtml(h.previous_status || '-')}</td>
                        <td>${escapeHtml(h.new_status || '-')}</td>
                        <td><small>${escapeHtml(h.memo_snapshot || '-')}</small></td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>`
            : `<div style="margin-top:16px;color:var(--gray-500);font-size:12px;">변경 이력 없음</div>`;

        body.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:13px;margin-bottom:16px;">
                <div><span style="color:var(--gray-500);">고객명</span><br><strong>${escapeHtml(data.lead_name)}</strong></div>
                <div><span style="color:var(--gray-500);">연락처</span><br><a href="tel:${escapeHtml(data.lead_phone)}" style="color:var(--primary);">${escapeHtml(data.lead_phone)}</a></div>
                <div><span style="color:var(--gray-500);">업종</span><br>${escapeHtml(data.business_type || '-')}</div>
                <div><span style="color:var(--gray-500);">지역</span><br>${escapeHtml(data.region || '-')}</div>
                <div><span style="color:var(--gray-500);">출처</span><br><small>${escapeHtml(data.source || '-')}</small></div>
                <div><span style="color:var(--gray-500);">담당 영업자</span><br><strong>${escapeHtml(data.agent_name)}</strong></div>
                <div><span style="color:var(--gray-500);">현재 상태</span><br>${statusLabel(data.status)}</div>
                <div><span style="color:var(--gray-500);">할당일</span><br>${formatDate(data.assigned_at)}</div>
                <div><span style="color:var(--gray-500);">최근 활동</span><br>${formatDate(data.last_status_at)}</div>
                <div><span style="color:var(--gray-500);">다음 액션</span><br>${data.next_action_at ? formatDate(data.next_action_at) : '<span style="color:var(--gray-400);">미설정</span>'}</div>
            </div>
            <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius);padding:12px;">
                <div style="font-size:12px;color:var(--gray-500);margin-bottom:6px;">영업자 메모</div>
                <div style="white-space:pre-wrap;font-size:13px;line-height:1.6;">${escapeHtml(data.memo || '-') || '<span style="color:var(--gray-400);">메모 없음</span>'}</div>
            </div>
            ${histHtml}
        `;
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

        document.querySelectorAll('.lead-detail-btn').forEach(btn => {
            btn.onclick = () => openLeadDetailModal(parseInt(btn.dataset.assignmentId));
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

                const { data: { user } } = await sb.auth.getUser();
                const adminId = user?.id || null;
                const rows = [...selectedLeadIds].map(lid => ({
                    lead_id: lid,
                    agent_id: agentId,
                    assigned_by: adminId
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

    async function bulkAssignAllUnassigned() {
        await loadAgentCache();
        if (!agentCache.length) {
            showToast('활성 영업자가 없습니다.', 'error');
            return;
        }

        const list = agentCache.map((a, i) => `${i + 1}. ${a.name}`).join('\n');
        const choice = prompt(`전체 미할당 DB를 받을 영업자 번호 입력:\n${list}`);
        if (!choice) return;
        const idx = parseInt(choice) - 1;
        if (isNaN(idx) || !agentCache[idx]) {
            showToast('잘못된 선택', 'error');
            return;
        }
        const targetAgent = agentCache[idx];

        const btn = $('leadAssignAllUnassignedBtn');
        if (btn) { btn.disabled = true; btn.textContent = '미할당 조회 중...'; }

        try {
            const allUnassignedIds = [];
            const pageSize = 1000;
            let page = 0;
            while (true) {
                const { data, error } = await sb.from('leads')
                    .select('id, lead_assignments(id)')
                    .range(page * pageSize, (page + 1) * pageSize - 1);
                if (error) throw error;
                if (!data || !data.length) break;
                for (const lead of data) {
                    if (!lead.lead_assignments || lead.lead_assignments.length === 0) {
                        allUnassignedIds.push(lead.id);
                    }
                }
                if (data.length < pageSize) break;
                page++;
            }

            if (!allUnassignedIds.length) {
                showToast('미할당 DB가 없습니다.', 'info');
                return;
            }

            if (!confirm(`미할당 ${allUnassignedIds.length}건을 [${targetAgent.name}] 영업자에게 모두 할당하시겠습니까?`)) return;

            if (btn) btn.textContent = `할당 중 (0/${allUnassignedIds.length})...`;

            const { data: { user } } = await sb.auth.getUser();
            const adminId = user?.id || null;

            const rows = allUnassignedIds.map(lid => ({
                lead_id: lid,
                agent_id: targetAgent.id,
                assigned_by: adminId
            }));

            const chunkSize = 500;
            let inserted = 0;
            for (let i = 0; i < rows.length; i += chunkSize) {
                const chunk = rows.slice(i, i + chunkSize);
                const { data, error } = await sb.from('lead_assignments').upsert(chunk, {
                    onConflict: 'lead_id,agent_id',
                    ignoreDuplicates: true
                }).select('id');
                if (error) throw error;
                inserted += (data || []).length;
                if (btn) btn.textContent = `할당 중 (${Math.min(i + chunkSize, rows.length)}/${rows.length})...`;
            }

            showToast(`${inserted}건 일괄 할당 완료 → ${targetAgent.name}`, 'success');
            await loadLeadManagement();
        } catch (err) {
            console.error(err);
            showToast('일괄 할당 실패: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '전체 미할당 일괄 할당'; }
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
                agent_contracts!agent_id ( id, contract_version, signed_at, revoked_at )
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

        const assignAllBtn = $('leadAssignAllUnassignedBtn');
        if (assignAllBtn) assignAllBtn.onclick = bulkAssignAllUnassigned;

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

    async function loadMatchEvents() {
        const loading = $('matchLoading');
        const table = $('matchTable');
        const empty = $('matchEmpty');

        loading.style.display = 'flex';
        table.style.display = 'none';
        empty.style.display = 'none';

        try {
            const filter = $('matchFilter')?.value || 'pending';

            let query = sb.from('lead_match_events').select(`
                id, matched_at, matched_inquiry_table, matched_inquiry_id, executed,
                executed_amount, executed_product, executed_at,
                leads ( name, phone, business_type, region, source ),
                agents ( name )
            `).order('matched_at', { ascending: false });

            if (filter === 'pending') query = query.eq('executed', false);
            if (filter === 'executed') query = query.eq('executed', true);

            const { data, error } = await query;
            if (error) throw error;

            const pendingCount = (data || []).filter(d => !d.executed).length;
            $('matchBadge').textContent = pendingCount;

            loading.style.display = 'none';

            if (!data || !data.length) {
                empty.style.display = 'block';
                return;
            }

            table.style.display = 'table';
            $('matchTableBody').innerHTML = data.map(m => {
                const lead = m.leads || {};
                const agent = m.agents || {};
                const statusBadge = m.executed
                    ? `<span class="badge" style="background:#D1FAE5;color:#065F46;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;">실행완료 (${m.executed_amount?.toLocaleString() || 0}원)</span>`
                    : `<span class="badge" style="background:#FEF3C7;color:#92400E;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;">대기</span>`;

                const action = m.executed
                    ? `<button class="btn btn-outline btn-sm match-view-btn" data-id="${m.id}">상세</button>`
                    : `<button class="btn btn-success btn-sm match-execute-btn" data-id="${m.id}">실행 마킹</button>`;

                return `<tr>
                    <td>${formatDate(m.matched_at)}</td>
                    <td><strong>${escapeHtml(lead.name || '-')}</strong></td>
                    <td>${escapeHtml(lead.phone || '-')}</td>
                    <td><small>${escapeHtml(m.matched_inquiry_table)} #${m.matched_inquiry_id}</small></td>
                    <td>${escapeHtml(agent.name || '<span style="color:var(--gray-400);">미할당</span>')}</td>
                    <td>${statusBadge}</td>
                    <td>${action}</td>
                </tr>`;
            }).join('');

            document.querySelectorAll('.match-execute-btn').forEach(btn => {
                btn.onclick = () => openExecuteDialog(parseInt(btn.dataset.id));
            });
        } catch (err) {
            console.error(err);
            loading.style.display = 'none';
            showToast('매칭 이벤트 로드 실패: ' + err.message, 'error');
        }
    }

    async function openExecuteDialog(matchId) {
        const product = prompt('실행 상품명 (예: 카드매출 담보대출):');
        if (!product) return;

        const amountStr = prompt('실행 금액 (원, 숫자만):');
        if (!amountStr) return;
        const amount = parseInt(amountStr.replace(/[^0-9]/g, ''));
        if (!amount) { showToast('금액이 올바르지 않습니다.', 'error'); return; }

        const revenueStr = prompt('회사가 수령할 수수료 등 총 수익 (원):\n(이 금액의 50%가 영업자에게 자동 분배됩니다)');
        if (!revenueStr) return;
        const revenue = parseInt(revenueStr.replace(/[^0-9]/g, ''));
        if (!revenue) { showToast('수익이 올바르지 않습니다.', 'error'); return; }

        if (!confirm(`실행 마킹: ${product}\n실행 금액: ${amount.toLocaleString()}원\n총 수익: ${revenue.toLocaleString()}원\n영업자 분배: ${Math.round(revenue * 0.5).toLocaleString()}원\n\n진행하시겠습니까?`)) return;

        try {
            const { data, error } = await sb.rpc('admin_mark_executed', {
                p_match_id: matchId,
                p_amount: amount,
                p_product: product,
                p_total_revenue: revenue
            });
            if (error) throw error;
            showToast(`실행 처리 완료. 수수료 분배 #${data}`, 'success');
            await loadMatchEvents();
        } catch (err) {
            showToast('실행 처리 실패: ' + err.message, 'error');
        }
    }

    const matchFilter = $('matchFilter');
    if (matchFilter) matchFilter.onchange = loadMatchEvents;

    let selectedCommissionIds = new Set();

    async function loadCommissions() {
        const filter = $('commFilter')?.value || 'pending';
        let query = sb.from('commission_records').select(`
            *,
            agents ( name ),
            lead_match_events ( executed_amount, executed_product, executed_at )
        `).order('created_at', { ascending: false }).limit(500);

        if (filter === 'pending') query = query.eq('settlement_status', 'pending');
        if (filter === 'paid') query = query.eq('settlement_status', 'paid');

        const { data, error } = await query;
        if (error) { showToast('정산 로드 실패: ' + error.message, 'error'); return; }

        const tbody = $('commTableBody');
        const empty = $('commEmpty');
        const table = $('commTable');

        if (!data || !data.length) {
            empty.style.display = 'block';
            table.style.display = 'none';
            return;
        }

        empty.style.display = 'none';
        table.style.display = 'table';

        tbody.innerHTML = data.map(c => {
            const evt = c.lead_match_events || {};
            const statusMap = {
                'pending': '<span class="badge" style="background:#FEF3C7;color:#92400E;padding:3px 8px;border-radius:10px;font-size:11px;">대기</span>',
                'paid': '<span class="badge" style="background:#D1FAE5;color:#065F46;padding:3px 8px;border-radius:10px;font-size:11px;">지급완료</span>',
                'disputed': '<span class="badge" style="background:#FEE2E2;color:#991B1B;padding:3px 8px;border-radius:10px;font-size:11px;">이의</span>',
                'penalty': '<span class="badge" style="background:#FEE2E2;color:#991B1B;padding:3px 8px;border-radius:10px;font-size:11px;">위약벌차감</span>'
            };
            return `<tr>
                <td><input type="checkbox" class="comm-check" value="${c.id}" ${c.settlement_status !== 'pending' ? 'disabled' : ''}></td>
                <td>${formatDate(c.created_at)}</td>
                <td><strong>${escapeHtml(c.agents?.name || '-')}</strong></td>
                <td>${escapeHtml(evt.executed_product || '-')}</td>
                <td>${(evt.executed_amount || 0).toLocaleString()}원</td>
                <td>${(c.total_revenue || 0).toLocaleString()}원</td>
                <td>${(c.company_share || 0).toLocaleString()}원</td>
                <td><strong style="color:var(--primary);">${(c.agent_share || 0).toLocaleString()}원</strong></td>
                <td>${statusMap[c.settlement_status] || c.settlement_status}</td>
                <td>${c.paid_at ? formatDate(c.paid_at) : '-'}</td>
            </tr>`;
        }).join('');

        document.querySelectorAll('.comm-check').forEach(cb => {
            cb.onchange = () => {
                if (cb.checked) selectedCommissionIds.add(parseInt(cb.value));
                else selectedCommissionIds.delete(parseInt(cb.value));
            };
        });

        const sa = $('commSelectAll');
        if (sa) sa.onchange = () => {
            document.querySelectorAll('.comm-check:not(:disabled)').forEach(cb => {
                cb.checked = sa.checked;
                cb.dispatchEvent(new Event('change'));
            });
        };
    }

    async function bulkPayCommissions() {
        if (!selectedCommissionIds.size) { showToast('선택된 정산이 없습니다.', 'error'); return; }
        if (!confirm(`${selectedCommissionIds.size}건을 지급완료 처리하시겠습니까?`)) return;

        try {
            const { data, error } = await sb.rpc('admin_bulk_pay_commissions', {
                p_commission_ids: [...selectedCommissionIds]
            });
            if (error) throw error;
            showToast(`${data}건 지급 처리 완료`, 'success');
            selectedCommissionIds.clear();
            await loadCommissions();
            await loadMonthlyMatrix();
        } catch (err) {
            showToast('지급 실패: ' + err.message, 'error');
        }
    }

    async function loadMonthlyMatrix() {
        const { data, error } = await sb.from('v_agent_monthly_summary')
            .select('*').order('month', { ascending: false }).limit(60);

        if (error || !data) return;
        const tbody = $('monthlyTableBody');
        if (!tbody) return;

        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--gray-500);padding:24px;">데이터 없음</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(r => `<tr>
            <td>${r.month ? r.month.slice(0, 7) : '-'}</td>
            <td><strong>${escapeHtml(r.agent_name || '-')}</strong></td>
            <td>${r.deal_count}건</td>
            <td>${(r.total_revenue || 0).toLocaleString()}원</td>
            <td><strong style="color:var(--primary);">${(r.agent_share_total || 0).toLocaleString()}원</strong></td>
            <td style="color:var(--success);">${(r.paid_amount || 0).toLocaleString()}원</td>
            <td style="color:var(--warning);">${(r.pending_amount || 0).toLocaleString()}원</td>
            <td style="color:var(--danger);">${(r.penalty_offset_amount || 0).toLocaleString()}원</td>
        </tr>`).join('');
    }

    async function loadAuditPenalty() {
        await Promise.all([
            loadAnomalies(),
            loadPenalties(),
            loadPenaltySummary(),
            loadAccessLogs()
        ]);
    }

    async function loadAnomalies() {
        const { data, error } = await sb.from('v_access_anomalies').select('*').limit(100);
        const tbody = $('anomalyTableBody');
        const empty = $('anomalyEmpty');
        const table = $('anomalyTable');
        if (error || !data || !data.length) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            table.style.display = 'none';
            const badge = $('auditBadge'); if (badge) badge.textContent = 0;
            return;
        }
        empty.style.display = 'none';
        table.style.display = 'table';

        const badge = $('auditBadge');
        if (badge) badge.textContent = data.length;

        tbody.innerHTML = data.map(a => `<tr style="background:#FEF3C7;">
            <td>${formatDate(a.detected_at)}</td>
            <td><strong>${escapeHtml(a.agent_name || '-')}</strong></td>
            <td><span class="badge" style="background:#FEE2E2;color:#991B1B;padding:3px 8px;border-radius:10px;font-size:11px;">${a.rule}</span></td>
            <td><strong>${a.cnt}건</strong></td>
            <td>${escapeHtml(a.description)}</td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="window._issuePenaltyForAgent && window._issuePenaltyForAgent('${a.agent_id}')">위약벌 발행</button>
            </td>
        </tr>`).join('');
    }

    async function loadPenalties() {
        const { data, error } = await sb.from('penalty_records').select(`
            *, agents ( name ), leads ( name, phone )
        `).order('issued_at', { ascending: false }).limit(200);

        const tbody = $('penaltyTableBody');
        const empty = $('penaltyEmpty');
        const table = $('penaltyTable');

        if (error || !data || !data.length) {
            empty.style.display = 'block';
            table.style.display = 'none';
            return;
        }
        empty.style.display = 'none';
        table.style.display = 'table';

        const typeMap = {
            'nda_breach': 'NDA 위반',
            'undisclosed_execution': '묵인실행',
            'other': '기타'
        };
        const statusMap = {
            'issued': '<span class="badge" style="background:#FEE2E2;color:#991B1B;padding:3px 8px;border-radius:10px;font-size:11px;">미수</span>',
            'collected': '<span class="badge" style="background:#D1FAE5;color:#065F46;padding:3px 8px;border-radius:10px;font-size:11px;">회수</span>',
            'litigation': '<span class="badge" style="background:#E0E7FF;color:#3730A3;padding:3px 8px;border-radius:10px;font-size:11px;">소송</span>',
            'waived': '<span class="badge" style="background:var(--gray-200);color:var(--gray-700);padding:3px 8px;border-radius:10px;font-size:11px;">면제</span>'
        };

        tbody.innerHTML = data.map(p => {
            const lead = p.leads ? `${escapeHtml(p.leads.name)} (${escapeHtml(p.leads.phone)})` : '-';
            return `<tr>
                <td>${formatDate(p.issued_at)}</td>
                <td><strong>${escapeHtml(p.agents?.name || '-')}</strong></td>
                <td>${typeMap[p.penalty_type] || p.penalty_type}</td>
                <td><strong style="color:var(--danger);">${(p.penalty_amount || 0).toLocaleString()}원</strong></td>
                <td><small>${lead}</small></td>
                <td>${statusMap[p.status] || p.status}</td>
                <td>
                    ${p.status === 'issued' ? `
                        <button class="btn btn-success btn-sm" onclick="window._resolvePenalty && window._resolvePenalty(${p.id}, 'collected')">회수완료</button>
                        <button class="btn btn-outline btn-sm" onclick="window._resolvePenalty && window._resolvePenalty(${p.id}, 'waived')">면제</button>
                    ` : ''}
                </td>
            </tr>`;
        }).join('');
    }

    async function loadPenaltySummary() {
        const { data } = await sb.from('v_agent_penalty_summary').select('*');
        const tbody = $('penaltySummaryTableBody');
        if (!tbody) return;

        if (!data || !data.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:24px;">데이터 없음</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(s => `<tr>
            <td><strong>${escapeHtml(s.agent_name || '-')}</strong></td>
            <td>${s.penalty_count}건</td>
            <td>${(s.total_amount || 0).toLocaleString()}원</td>
            <td style="color:var(--danger);">${(s.outstanding_amount || 0).toLocaleString()}원</td>
            <td style="color:var(--success);">${(s.collected_amount || 0).toLocaleString()}원</td>
            <td style="color:var(--gray-500);">${(s.waived_amount || 0).toLocaleString()}원</td>
            <td>${formatDate(s.last_issued_at)}</td>
        </tr>`).join('');
    }

    async function loadAccessLogs() {
        const { data } = await sb.from('lead_access_logs').select(`
            *, agents ( name ), leads ( name )
        `).order('accessed_at', { ascending: false }).limit(200);

        const tbody = $('accessLogTableBody');
        if (!tbody) return;

        if (!data || !data.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gray-500);padding:24px;">로그 없음</td></tr>';
            return;
        }

        const actionMap = { 'view_list': '목록', 'view_detail': '상세', 'search': '검색', 'export_attempt': '내보내기 시도' };
        tbody.innerHTML = data.map(l => `<tr>
            <td>${formatDate(l.accessed_at)}</td>
            <td>${escapeHtml(l.agents?.name || '-')}</td>
            <td>${actionMap[l.action] || l.action}</td>
            <td>${escapeHtml(l.leads?.name || '-')}</td>
            <td><small>${escapeHtml(l.ip || '-')}</small></td>
        </tr>`).join('');
    }

    async function issuePenaltyDialog(agentIdHint) {
        const { data: agents } = await sb.from('agents').select('id, name').order('name');
        if (!agents || !agents.length) { showToast('영업자가 없습니다.', 'error'); return; }

        const agentList = agents.map((a, i) => `${i + 1}. ${a.name}`).join('\n');
        let agentIdx;
        if (agentIdHint) {
            agentIdx = agents.findIndex(a => a.id === agentIdHint);
        }
        if (agentIdx == null || agentIdx < 0) {
            const choice = prompt(`영업자 번호 선택:\n${agentList}`);
            if (!choice) return;
            agentIdx = parseInt(choice) - 1;
            if (isNaN(agentIdx) || !agents[agentIdx]) { showToast('잘못된 선택', 'error'); return; }
        }

        const typeChoice = prompt('위약벌 유형 입력:\n1. NDA 위반 (DB 외부 반출/캡처)\n2. 묵인실행 (외부 채널 실행 미신고)\n3. 기타');
        const typeMap = { '1': 'nda_breach', '2': 'undisclosed_execution', '3': 'other' };
        const penaltyType = typeMap[typeChoice];
        if (!penaltyType) { showToast('잘못된 선택', 'error'); return; }

        const amountStr = prompt('위약벌 금액 (원, 기본 5,000,000):', '5000000');
        if (!amountStr) return;
        const amount = parseInt(amountStr.replace(/[^0-9]/g, ''));
        if (!amount) { showToast('금액이 올바르지 않습니다.', 'error'); return; }

        const evidence = prompt('근거/사유 (간략 메모):') || '';

        if (!confirm(`${agents[agentIdx].name} 영업자에게 ${amount.toLocaleString()}원 위약벌을 발행합니다. 진행?`)) return;

        try {
            const { error } = await sb.rpc('admin_issue_penalty', {
                p_agent_id: agents[agentIdx].id,
                p_type: penaltyType,
                p_amount: amount,
                p_lead_id: null,
                p_evidence: { note: evidence, issued_via: 'admin_ui' }
            });
            if (error) throw error;
            showToast('위약벌 발행됨', 'success');
            await loadPenalties();
            await loadPenaltySummary();
        } catch (err) {
            showToast('발행 실패: ' + err.message, 'error');
        }
    }

    async function resolvePenalty(penaltyId, newStatus) {
        const note = prompt(`${newStatus === 'collected' ? '회수' : newStatus === 'waived' ? '면제' : '처리'} 사유:`) || '';
        if (newStatus !== 'collected' && newStatus !== 'waived') return;

        try {
            const { error } = await sb.rpc('admin_resolve_penalty', {
                p_penalty_id: penaltyId,
                p_status: newStatus,
                p_note: note
            });
            if (error) throw error;
            showToast('처리 완료', 'success');
            await loadPenalties();
            await loadPenaltySummary();
        } catch (err) {
            showToast('처리 실패: ' + err.message, 'error');
        }
    }

    const commFilter = $('commFilter');
    if (commFilter) commFilter.onchange = loadCommissions;
    const commPayBtn = $('commBulkPayBtn');
    if (commPayBtn) commPayBtn.onclick = bulkPayCommissions;
    const issuePBtn = $('issuePenaltyBtn');
    if (issuePBtn) issuePBtn.onclick = () => issuePenaltyDialog();

    const origLoadMatchEvents = loadMatchEvents;
    loadMatchEvents = async function () {
        await origLoadMatchEvents();
        await loadCommissions();
        await loadMonthlyMatrix();
    };

    window._issuePenaltyForAgent = issuePenaltyDialog;
    window._resolvePenalty = resolvePenalty;

    window.loadLeadManagement = loadLeadManagement;
    window.loadAgentManagement = loadAgentManagement;
    window.loadMatchEvents = loadMatchEvents;
    window.loadAuditPenalty = loadAuditPenalty;
})();
