/**
 * 메디플라톤 관리자 페이지 JavaScript (v2)
 */

let sb = null;
let currentUser = null;
let currentTab = 'all-inquiries';
let currentDetailId = null;
let currentDetailType = null;
let rejectTargetId = null;
let partnersCache = [];

const loginScreen = document.getElementById('loginScreen');
const adminDashboard = document.getElementById('adminDashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const userEmailEl = document.getElementById('userEmail');
const setupGuide = document.getElementById('setupGuide');

// ─── Init ───

document.addEventListener('DOMContentLoaded', async () => {
    if (!isSupabaseConfigured()) {
        showSetupGuide();
        return;
    }

    sb = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        currentUser = session.user;
        showDashboard();
    }

    setupEventListeners();
});

function showSetupGuide() {
    loginScreen.style.display = 'none';
    adminDashboard.style.display = 'block';
    setupGuide.style.display = 'block';
    document.querySelector('.stats-grid').style.display = 'none';
    document.querySelector('.tabs').style.display = 'none';
    document.getElementById('consultationsSection').style.display = 'none';
}

// ─── Event Listeners ───

function setupEventListeners() {
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // All inquiries filters
    document.getElementById('allSourceFilter').addEventListener('change', loadAllInquiries);
    document.getElementById('allStatusFilter').addEventListener('change', loadAllInquiries);
    document.getElementById('allSearch').addEventListener('input', debounce(loadAllInquiries, 300));
    document.getElementById('exportAllBtn').addEventListener('click', exportAllInquiriesCSV);

    // Consultation filters
    document.getElementById('consultStatusFilter').addEventListener('change', loadConsultations);
    document.getElementById('consultSearch').addEventListener('input', debounce(loadConsultations, 300));

    // Partner filters
    document.getElementById('partnerStatusFilter').addEventListener('change', loadPartners);
    document.getElementById('partnerSearch').addEventListener('input', debounce(loadPartners, 300));

    // Customer filters
    document.getElementById('custPartnerFilter').addEventListener('change', loadCustomers);
    document.getElementById('custPipelineFilter').addEventListener('change', loadCustomers);
    document.getElementById('custSearch').addEventListener('input', debounce(loadCustomers, 300));

    // Modal
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('saveStatusBtn').addEventListener('click', saveStatus);
    document.getElementById('detailModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('detailModal')) closeModal();
    });

    // CSV export
    document.getElementById('exportConsultBtn').addEventListener('click', () => exportToCSV('consultations'));
    document.getElementById('exportPartnerBtn').addEventListener('click', () => exportToCSV('partners'));
    document.getElementById('exportCustBtn').addEventListener('click', () => exportToCSV('customers'));

    // Settlements
    document.getElementById('addSettlementBtn').addEventListener('click', openSettlementModal);
    document.getElementById('settlementForm').addEventListener('submit', handleSettlementSubmit);
    document.getElementById('adminPartnerFilter').addEventListener('change', loadAdminSettlements);
    document.getElementById('adminMonthFilter').addEventListener('change', loadAdminSettlements);

    // Notices
    document.getElementById('addNoticeBtn').addEventListener('click', openNoticeModal);
    document.getElementById('noticeForm').addEventListener('submit', handleNoticeSubmit);

    // Settlement auto calc
    document.getElementById('settleAmount').addEventListener('input', function() {
        formatAmountInput(this);
        autoCalcCommission();
    });
    document.getElementById('settleRate').addEventListener('input', autoCalcCommission);

    document.getElementById('settlePartnerSelect').addEventListener('change', function() {
        const opt = this.selectedOptions[0];
        if (opt && opt.dataset.rate) {
            document.getElementById('settleRate').value = (Number(opt.dataset.rate) * 100).toFixed(2);
            autoCalcCommission();
        }
    });
}

// ─── Auth ───

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user;
        loginError.style.display = 'none';
        showDashboard();
    } catch (error) {
        loginError.textContent = error.message || '로그인에 실패했습니다.';
        loginError.style.display = 'block';
    }
}

async function handleLogout() {
    await sb.auth.signOut();
    currentUser = null;
    adminDashboard.style.display = 'none';
    loginScreen.style.display = 'flex';
    loginForm.reset();
}

function showDashboard() {
    loginScreen.style.display = 'none';
    adminDashboard.style.display = 'block';
    userEmailEl.textContent = currentUser.email;

    loadStats();
    loadAllInquiries();
    initAdminSettlementFilters();
    loadPartnersCache();
}

// ─── Partners Cache (for filters) ───

async function loadPartnersCache() {
    try {
        const { data } = await sb
            .from('partners')
            .select('id, name, hospital_name, commission_rate, status')
            .order('name');
        partnersCache = data || [];
        updatePartnerFilters();
    } catch (e) {
        console.error('Partners cache error:', e);
    }
}

function updatePartnerFilters() {
    const approved = partnersCache.filter(p => p.status === 'approved');
    const options = approved.map(p =>
        `<option value="${p.id}" data-rate="${p.commission_rate || 0.015}">${escapeHtml(p.name)}${p.hospital_name ? ' (' + escapeHtml(p.hospital_name) + ')' : ''}</option>`
    ).join('');

    document.getElementById('adminPartnerFilter').innerHTML = '<option value="">파트너 선택</option>' + options;
    document.getElementById('settlePartnerSelect').innerHTML = '<option value="">파트너 선택</option>' + options;

    // Customer filter - all partners
    const allOptions = partnersCache.map(p =>
        `<option value="${p.id}">${escapeHtml(p.name)}${p.hospital_name ? ' (' + escapeHtml(p.hospital_name) + ')' : ''}</option>`
    ).join('');
    document.getElementById('custPartnerFilter').innerHTML = '<option value="">전체 파트너</option>' + allOptions;
}

// ─── Stats ───

async function loadStats() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const monthStart = new Date();
        monthStart.setDate(1);
        const monthStr = monthStart.toISOString().split('T')[0];

        const [
            { count: todayCount },
            { count: totalConsult },
            { count: activePartners },
            { count: pendingConsult },
            { count: pendingPartner }
        ] = await Promise.all([
            sb.from('consultations').select('*', { count: 'exact', head: true }).gte('created_at', today),
            sb.from('consultations').select('*', { count: 'exact', head: true }),
            sb.from('partners').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
            sb.from('consultations').select('*', { count: 'exact', head: true }).eq('status', 'new'),
            sb.from('partners').select('*', { count: 'exact', head: true }).in('status', ['new', 'pending'])
        ]);

        // Monthly transaction amount
        const { data: monthlyData } = await sb
            .from('consultations')
            .select('transaction_amount')
            .not('transaction_amount', 'is', null)
            .eq('pipeline_status', 'installed')
            .gte('status_changed_at', monthStr);

        const monthlyTotal = (monthlyData || []).reduce((s, r) => s + Number(r.transaction_amount || 0), 0);

        document.getElementById('todayConsult').textContent = todayCount || 0;
        document.getElementById('totalConsult').textContent = totalConsult || 0;
        document.getElementById('activePartners').textContent = activePartners || 0;
        document.getElementById('monthlyAmount').textContent = formatCurrency(monthlyTotal);
        document.getElementById('pendingCount').textContent = (pendingConsult || 0) + (pendingPartner || 0);

        document.getElementById('consultBadge').textContent = pendingConsult || 0;
        document.getElementById('partnerBadge').textContent = pendingPartner || 0;
    } catch (error) {
        console.error('Stats error:', error);
    }
}

// ─── Tabs ───

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.getElementById('allInquiriesSection').style.display = tab === 'all-inquiries' ? 'block' : 'none';
    document.getElementById('consultationsSection').style.display = tab === 'consultations' ? 'block' : 'none';
    document.getElementById('partnersSection').style.display = tab === 'partners' ? 'block' : 'none';
    document.getElementById('customersSection').style.display = tab === 'customers' ? 'block' : 'none';
    document.getElementById('adminSettlementsSection').style.display = tab === 'admin-settlements' ? 'block' : 'none';

    if (tab === 'all-inquiries') loadAllInquiries();
    if (tab === 'partners') loadPartners();
    if (tab === 'customers') loadCustomers();
    if (tab === 'admin-settlements') {
        loadAdminSettlements();
        loadAdminNotices();
    }
}

// ─── Consultations ───

async function loadConsultations() {
    const loading = document.getElementById('consultLoading');
    const table = document.getElementById('consultTable');
    const empty = document.getElementById('consultEmpty');
    const tbody = document.getElementById('consultTableBody');

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    try {
        let query = sb.from('consultations').select('*').order('created_at', { ascending: false });

        const statusFilter = document.getElementById('consultStatusFilter').value;
        if (statusFilter !== 'all') query = query.eq('status', statusFilter);

        const search = document.getElementById('consultSearch').value.trim();
        if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);

        const { data, error } = await query;
        if (error) throw error;

        loading.style.display = 'none';

        if (!data || data.length === 0) {
            empty.style.display = 'block';
            return;
        }

        table.style.display = 'table';
        tbody.innerHTML = data.map(row => `
            <tr>
                <td>${formatDate(row.created_at)}</td>
                <td>${getSourceBadge(row.source_page || 'consultation')}</td>
                <td><strong>${escapeHtml(row.name)}</strong></td>
                <td>${escapeHtml(row.phone)}</td>
                <td>${getBusinessLabel(row.business)}</td>
                <td>${getRevenueLabel(row.revenue)}</td>
                <td>${getRegionLabel(row.region)}</td>
                <td>${getProductLabel(row.product)}</td>
                <td><span class="status-badge status-${row.status}">${getStatusLabel(row.status)}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn view" onclick="viewConsultation(${row.id})">상세</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Load consultations error:', error);
        loading.style.display = 'none';
        showToast('데이터를 불러오는데 실패했습니다.', 'error');
    }
}

// ─── Partners ───

async function loadPartners() {
    const loading = document.getElementById('partnerLoading');
    const table = document.getElementById('partnerTable');
    const empty = document.getElementById('partnerEmpty');
    const tbody = document.getElementById('partnerTableBody');

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    try {
        let query = sb.from('partners').select('*').order('created_at', { ascending: false });

        const statusFilter = document.getElementById('partnerStatusFilter').value;
        if (statusFilter !== 'all') query = query.eq('status', statusFilter);

        const search = document.getElementById('partnerSearch').value.trim();
        if (search) query = query.or(`name.ilike.%${search}%,hospital_name.ilike.%${search}%`);

        const { data, error } = await query;
        if (error) throw error;

        loading.style.display = 'none';

        if (!data || data.length === 0) {
            empty.style.display = 'block';
            return;
        }

        table.style.display = 'table';
        tbody.innerHTML = data.map(row => {
            const needsAction = ['new', 'pending', 'reviewing'].includes(row.status);
            return `
                <tr>
                    <td>${formatDate(row.created_at)}</td>
                    <td><strong>${escapeHtml(row.name)}</strong></td>
                    <td>${escapeHtml(row.phone)}</td>
                    <td>${escapeHtml(row.hospital_name || '-')}</td>
                    <td>${getBusinessLabel(row.business)}</td>
                    <td>${getRegionLabel(row.region)}</td>
                    <td><span class="status-badge status-${row.status}">${getPartnerStatusLabel(row.status)}</span></td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn view" onclick="viewPartner(${row.id})">상세</button>
                            ${needsAction ? `
                                <button class="action-btn approve" onclick="approvePartner(${row.id})">승인</button>
                                <button class="action-btn reject" onclick="openRejectModal(${row.id})">반려</button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Load partners error:', error);
        loading.style.display = 'none';
        showToast('데이터를 불러오는데 실패했습니다.', 'error');
    }
}

// ─── Partner Approve / Reject ───

async function approvePartner(id) {
    if (!confirm('이 파트너를 승인하시겠습니까?')) return;

    try {
        // Get partner's user_id for notification
        const { data: partner } = await sb.from('partners').select('user_id, name').eq('id', id).single();

        const { error } = await sb
            .from('partners')
            .update({
                status: 'approved',
                approved_at: new Date().toISOString(),
                approved_by: currentUser.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;

        // Send notification if partner has user_id
        if (partner?.user_id) {
            await sb.rpc('create_notification', {
                p_user_id: partner.user_id,
                p_type: 'partner_approved',
                p_title: '파트너 승인 완료',
                p_message: `${partner.name}님의 파트너 가입이 승인되었습니다. 파트너 대시보드를 이용하실 수 있습니다.`
            });
        }

        showToast('파트너가 승인되었습니다.', 'success');
        loadPartners();
        loadStats();
        loadPartnersCache();
    } catch (error) {
        showToast('승인 실패: ' + error.message, 'error');
    }
}

function openRejectModal(id) {
    rejectTargetId = id;
    document.getElementById('rejectReason').value = '';
    document.getElementById('rejectModal').classList.add('active');

    document.getElementById('confirmRejectBtn').onclick = async () => {
        const reason = document.getElementById('rejectReason').value.trim();
        if (!reason) {
            showToast('반려 사유를 입력하세요.', 'error');
            return;
        }

        try {
            const { data: partner } = await sb.from('partners').select('user_id, name').eq('id', rejectTargetId).single();

            const { error } = await sb
                .from('partners')
                .update({
                    status: 'rejected',
                    rejection_reason: reason,
                    updated_at: new Date().toISOString()
                })
                .eq('id', rejectTargetId);

            if (error) throw error;

            // Send notification
            if (partner?.user_id) {
                await sb.rpc('create_notification', {
                    p_user_id: partner.user_id,
                    p_type: 'partner_rejected',
                    p_title: '파트너 가입 반려',
                    p_message: `반려 사유: ${reason}`
                });
            }

            showToast('파트너가 반려되었습니다.', 'success');
            document.getElementById('rejectModal').classList.remove('active');
            loadPartners();
            loadStats();
        } catch (error) {
            showToast('반려 실패: ' + error.message, 'error');
        }
    };
}

// ─── Customers (All Partners' Clients) ───

async function loadCustomers() {
    const loading = document.getElementById('custLoading');
    const table = document.getElementById('custTable');
    const empty = document.getElementById('custEmpty');
    const tbody = document.getElementById('custTableBody');

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    try {
        let query = sb
            .from('consultations')
            .select('*, partners(name, hospital_name)')
            .not('partner_id', 'is', null)
            .order('created_at', { ascending: false });

        const partnerFilter = document.getElementById('custPartnerFilter').value;
        if (partnerFilter) query = query.eq('partner_id', partnerFilter);

        const pipelineFilter = document.getElementById('custPipelineFilter').value;
        if (pipelineFilter !== 'all') query = query.eq('pipeline_status', pipelineFilter);

        const search = document.getElementById('custSearch').value.trim();
        if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);

        const { data, error } = await query;
        if (error) throw error;

        loading.style.display = 'none';

        if (!data || data.length === 0) {
            empty.style.display = 'block';
            return;
        }

        table.style.display = 'table';
        tbody.innerHTML = data.map(row => `
            <tr>
                <td>${formatDate(row.created_at)}</td>
                <td>${row.partners ? escapeHtml(row.partners.name) : '-'}</td>
                <td><strong>${escapeHtml(row.name)}</strong></td>
                <td>${escapeHtml(row.phone)}</td>
                <td>${getBusinessLabel(row.business)}</td>
                <td>
                    <select class="inline-select" onchange="updatePipelineStatus(${row.id}, this.value)">
                        <option value="received" ${row.pipeline_status === 'received' ? 'selected' : ''}>접수</option>
                        <option value="reviewing" ${row.pipeline_status === 'reviewing' ? 'selected' : ''}>심사 중</option>
                        <option value="approved" ${row.pipeline_status === 'approved' ? 'selected' : ''}>승인</option>
                        <option value="installed" ${row.pipeline_status === 'installed' ? 'selected' : ''}>설치완료</option>
                        <option value="rejected" ${row.pipeline_status === 'rejected' ? 'selected' : ''}>반려</option>
                    </select>
                </td>
                <td>
                    <input type="number" class="inline-input" value="${row.transaction_amount || ''}"
                        placeholder="거래액" onchange="updateTransactionAmount(${row.id}, this.value)">
                </td>
                <td>
                    <button class="action-btn view" onclick="viewConsultation(${row.id})">상세</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Load customers error:', error);
        loading.style.display = 'none';
        showToast('고객 데이터를 불러오는데 실패했습니다.', 'error');
    }
}

async function updatePipelineStatus(id, status) {
    try {
        const { error } = await sb
            .from('consultations')
            .update({
                pipeline_status: status,
                status_changed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', id);
        if (error) throw error;
        showToast('진행 상태가 변경되었습니다.', 'success');
    } catch (error) {
        showToast('상태 변경 실패: ' + error.message, 'error');
        loadCustomers();
    }
}

async function updateTransactionAmount(id, value) {
    const amount = value ? Number(value) : null;
    try {
        const { error } = await sb
            .from('consultations')
            .update({
                transaction_amount: amount,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);
        if (error) throw error;
        showToast('거래액이 저장되었습니다.', 'success');
    } catch (error) {
        showToast('거래액 저장 실패: ' + error.message, 'error');
    }
}

// ─── Detail Views ───

async function viewConsultation(id) {
    currentDetailId = id;
    currentDetailType = 'consultation';

    const { data, error } = await sb.from('consultations').select('*, partners(name)').eq('id', id).single();
    if (error) { showToast('데이터를 불러오는데 실패했습니다.', 'error'); return; }

    document.getElementById('modalTitle').textContent = '상담 신청 상세';
    document.getElementById('modalBody').innerHTML = `
        <div class="detail-row">
            <span class="detail-label">신청일시</span>
            <span class="detail-value">${formatDate(data.created_at)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">성함</span>
            <span class="detail-value">${escapeHtml(data.name)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">연락처</span>
            <span class="detail-value"><a href="tel:${data.phone}">${escapeHtml(data.phone)}</a></span>
        </div>
        <div class="detail-row">
            <span class="detail-label">업종</span>
            <span class="detail-value">${getBusinessLabel(data.business)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">월 카드매출</span>
            <span class="detail-value">${getRevenueLabel(data.revenue)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">지역</span>
            <span class="detail-value">${getRegionLabel(data.region)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">관심 상품</span>
            <span class="detail-value">${getProductLabel(data.product)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">문의사항</span>
            <span class="detail-value">${escapeHtml(data.message) || '-'}</span>
        </div>
        ${data.partner_id ? `
        <div class="detail-row" style="border-top: 2px solid var(--gray-200); margin-top: 12px; padding-top: 12px;">
            <span class="detail-label">파트너</span>
            <span class="detail-value">${data.partners ? escapeHtml(data.partners.name) : 'ID: ' + data.partner_id}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">파이프라인</span>
            <span class="detail-value">
                <select class="filter-select" id="pipelineSelect">
                    <option value="received" ${data.pipeline_status === 'received' ? 'selected' : ''}>접수</option>
                    <option value="reviewing" ${data.pipeline_status === 'reviewing' ? 'selected' : ''}>심사 중</option>
                    <option value="approved" ${data.pipeline_status === 'approved' ? 'selected' : ''}>승인</option>
                    <option value="installed" ${data.pipeline_status === 'installed' ? 'selected' : ''}>PG 설치 완료</option>
                    <option value="rejected" ${data.pipeline_status === 'rejected' ? 'selected' : ''}>반려</option>
                </select>
            </span>
        </div>
        <div class="detail-row">
            <span class="detail-label">거래액</span>
            <span class="detail-value">
                <input type="number" id="transactionAmount" value="${data.transaction_amount || ''}" placeholder="거래액 입력"
                    style="padding:8px 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:14px;width:200px;">
            </span>
        </div>
        ` : ''}
        ${data.admin_notes !== undefined ? `
        <div class="detail-row">
            <span class="detail-label">관리 메모</span>
            <span class="detail-value">
                <textarea id="adminNotes" rows="2" placeholder="관리자 메모"
                    style="width:100%;padding:8px 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:14px;font-family:inherit;">${escapeHtml(data.admin_notes || '')}</textarea>
            </span>
        </div>
        ` : ''}
    `;

    const statusSelect = document.getElementById('statusSelect');
    statusSelect.innerHTML = `
        <option value="new">신규</option>
        <option value="contacted">연락완료</option>
        <option value="completed">상담완료</option>
        <option value="cancelled">취소</option>
    `;
    statusSelect.value = data.status;

    document.getElementById('detailModal').classList.add('active');
}

async function viewPartner(id) {
    currentDetailId = id;
    currentDetailType = 'partner';

    const { data, error } = await sb.from('partners').select('*').eq('id', id).single();
    if (error) { showToast('데이터를 불러오는데 실패했습니다.', 'error'); return; }

    document.getElementById('modalTitle').textContent = '파트너 상세';
    document.getElementById('modalBody').innerHTML = `
        <div class="detail-row">
            <span class="detail-label">신청일시</span>
            <span class="detail-value">${formatDate(data.created_at)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">성함</span>
            <span class="detail-value">${escapeHtml(data.name)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">연락처</span>
            <span class="detail-value"><a href="tel:${data.phone}">${escapeHtml(data.phone)}</a></span>
        </div>
        <div class="detail-row">
            <span class="detail-label">이메일</span>
            <span class="detail-value">${escapeHtml(data.email || '-')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">병원/약국명</span>
            <span class="detail-value">${escapeHtml(data.hospital_name) || '-'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">업종</span>
            <span class="detail-value">${getBusinessLabel(data.business)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">지역</span>
            <span class="detail-value">${getRegionLabel(data.region)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">문의사항</span>
            <span class="detail-value">${escapeHtml(data.message) || '-'}</span>
        </div>
        ${data.rejection_reason ? `
        <div class="detail-row">
            <span class="detail-label">반려 사유</span>
            <span class="detail-value" style="color:var(--danger);">${escapeHtml(data.rejection_reason)}</span>
        </div>` : ''}
        ${data.approved_at ? `
        <div class="detail-row">
            <span class="detail-label">승인일시</span>
            <span class="detail-value">${formatDate(data.approved_at)}</span>
        </div>` : ''}
        <div class="detail-row" style="border-top: 2px solid var(--gray-200); margin-top: 12px; padding-top: 12px;">
            <span class="detail-label">계정 연결</span>
            <span class="detail-value">
                ${data.user_id
                    ? '<span style="color:var(--success);font-weight:600;">연결됨</span> (ID: ' + data.user_id.substring(0, 8) + '...)'
                    : '<span style="color:var(--gray-500);">미연결</span>'
                }
            </span>
        </div>
    `;

    const statusSelect = document.getElementById('statusSelect');
    statusSelect.innerHTML = `
        <option value="new">신규</option>
        <option value="pending">승인 대기</option>
        <option value="reviewing">검토중</option>
        <option value="approved">승인</option>
        <option value="rejected">반려</option>
    `;
    statusSelect.value = data.status;

    document.getElementById('detailModal').classList.add('active');
}

// ─── Save Status ───

async function saveStatus() {
    const newStatus = document.getElementById('statusSelect').value;
    const table = currentDetailType === 'consultation' ? 'consultations' : 'partners';

    try {
        const updateData = { status: newStatus, updated_at: new Date().toISOString() };

        if (currentDetailType === 'consultation') {
            const pipelineSelect = document.getElementById('pipelineSelect');
            const transactionAmountInput = document.getElementById('transactionAmount');
            const adminNotesInput = document.getElementById('adminNotes');

            if (pipelineSelect) updateData.pipeline_status = pipelineSelect.value;
            if (transactionAmountInput && transactionAmountInput.value) {
                updateData.transaction_amount = Number(transactionAmountInput.value);
            }
            if (adminNotesInput) updateData.admin_notes = adminNotesInput.value.trim() || null;
        }

        if (currentDetailType === 'partner' && newStatus === 'approved') {
            updateData.approved_at = new Date().toISOString();
            updateData.approved_by = currentUser.id;
        }

        const { error } = await sb.from(table).update(updateData).eq('id', currentDetailId);
        if (error) throw error;

        showToast('상태가 저장되었습니다.', 'success');
        closeModal();

        if (currentDetailType === 'consultation') loadConsultations();
        else { loadPartners(); loadPartnersCache(); }
        loadStats();
    } catch (error) {
        showToast('저장에 실패했습니다.', 'error');
    }
}

function closeModal() {
    document.getElementById('detailModal').classList.remove('active');
    currentDetailId = null;
    currentDetailType = null;
}

// ─── Settlements ───

function initAdminSettlementFilters() {
    const monthSelect = document.getElementById('adminMonthFilter');
    const now = new Date();
    monthSelect.innerHTML = '';
    for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
        monthSelect.innerHTML += `<option value="${val}">${label}</option>`;
    }
    document.getElementById('settleMonthSelect').innerHTML = monthSelect.innerHTML;
}

async function loadAdminSettlements() {
    const partnerId = document.getElementById('adminPartnerFilter').value;
    const month = document.getElementById('adminMonthFilter').value;

    const loading = document.getElementById('adminSettlementLoading');
    const table = document.getElementById('adminSettlementTable');
    const empty = document.getElementById('adminSettlementEmpty');
    const tbody = document.getElementById('adminSettlementTableBody');

    if (!partnerId) {
        table.style.display = 'none';
        empty.style.display = 'block';
        empty.querySelector('h3').textContent = '파트너를 선택하세요';
        return;
    }

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    try {
        let query = sb
            .from('settlements')
            .select('*, partners(name)')
            .eq('month', month)
            .order('created_at', { ascending: false });

        if (partnerId) query = query.eq('partner_id', partnerId);

        const { data, error } = await query;
        if (error) throw error;

        loading.style.display = 'none';

        if (!data || data.length === 0) {
            empty.style.display = 'block';
            empty.querySelector('h3').textContent = '정산 내역이 없습니다';
            return;
        }

        table.style.display = 'table';
        tbody.innerHTML = data.map(row => `
            <tr>
                <td>${row.partners ? escapeHtml(row.partners.name) : '-'}</td>
                <td>${escapeHtml(row.client_name || '-')}</td>
                <td>${formatCurrency(row.transaction_amount)}원</td>
                <td>${row.commission_rate ? (Number(row.commission_rate) * 100).toFixed(2) + '%' : '-'}</td>
                <td>${formatCurrency(row.commission_amount)}원</td>
                <td>
                    <select class="inline-select" onchange="updateSettlementStatus(${row.id}, this.value)">
                        <option value="pending" ${row.status === 'pending' ? 'selected' : ''}>대기</option>
                        <option value="confirmed" ${row.status === 'confirmed' ? 'selected' : ''}>확정</option>
                        <option value="paid" ${row.status === 'paid' ? 'selected' : ''}>지급완료</option>
                    </select>
                </td>
                <td>
                    <button class="action-btn delete" onclick="deleteSettlement(${row.id})">삭제</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Admin settlements error:', error);
        loading.style.display = 'none';
        showToast('정산 데이터를 불러오는데 실패했습니다.', 'error');
    }
}

function openSettlementModal() {
    const partnerVal = document.getElementById('adminPartnerFilter').value;
    const monthVal = document.getElementById('adminMonthFilter').value;
    if (partnerVal) document.getElementById('settlePartnerSelect').value = partnerVal;
    if (monthVal) document.getElementById('settleMonthSelect').value = monthVal;

    const partnerOption = document.getElementById('settlePartnerSelect').selectedOptions[0];
    if (partnerOption && partnerOption.dataset.rate) {
        document.getElementById('settleRate').value = (Number(partnerOption.dataset.rate) * 100).toFixed(2);
    }

    document.getElementById('settleAmount').value = '';
    document.getElementById('settleCommission').value = '';
    document.getElementById('settleAmountDisplay').textContent = '';
    document.getElementById('settleCommissionDisplay').textContent = '';
    document.getElementById('settleSummary').style.display = 'none';

    document.getElementById('settlementModal').classList.add('active');
}

function formatAmountInput(input) {
    const raw = input.value.replace(/[^0-9]/g, '');
    if (!raw) { input.value = ''; return; }
    input.value = Number(raw).toLocaleString('ko-KR');
}

function parseAmount(str) {
    return Number(String(str).replace(/[^0-9]/g, '')) || 0;
}

function formatKoreanAmount(num) {
    if (!num || num <= 0) return '';
    const uk = Math.floor(num / 100000000);
    const man = Math.floor((num % 100000000) / 10000);
    const rest = num % 10000;
    let result = '';
    if (uk > 0) result += uk.toLocaleString('ko-KR') + '억 ';
    if (man > 0) result += man.toLocaleString('ko-KR') + '만 ';
    if (rest > 0) result += rest.toLocaleString('ko-KR');
    return result.trim() + '원';
}

function autoCalcCommission() {
    const amount = parseAmount(document.getElementById('settleAmount').value);
    const ratePercent = Number(document.getElementById('settleRate').value) || 0;
    const rateDecimal = ratePercent / 100;
    const commission = Math.round(amount * rateDecimal);

    document.getElementById('settleCommission').value = commission > 0 ? commission.toLocaleString('ko-KR') : '';

    document.getElementById('settleAmountDisplay').textContent = amount > 0 ? formatKoreanAmount(amount) : '';
    document.getElementById('settleCommissionDisplay').textContent = commission > 0 ? formatKoreanAmount(commission) : '';

    const summary = document.getElementById('settleSummary');
    if (amount > 0 && ratePercent > 0) {
        summary.style.display = 'block';
        document.getElementById('summaryAmount').textContent = amount.toLocaleString('ko-KR') + '원';
        document.getElementById('summaryRate').textContent = ratePercent + '%';
        document.getElementById('summaryCommission').textContent = commission.toLocaleString('ko-KR') + '원';
    } else {
        summary.style.display = 'none';
    }
}

async function handleSettlementSubmit(e) {
    e.preventDefault();

    const partnerId = document.getElementById('settlePartnerSelect').value;
    if (!partnerId) { showToast('파트너를 선택하세요.', 'error'); return; }

    const amount = parseAmount(document.getElementById('settleAmount').value);
    const ratePercent = Number(document.getElementById('settleRate').value) || 0;
    const rateDecimal = ratePercent / 100;
    const commission = Math.round(amount * rateDecimal);

    const payload = {
        partner_id: Number(partnerId),
        month: document.getElementById('settleMonthSelect').value,
        client_name: document.getElementById('settleClientName').value.trim(),
        transaction_amount: amount,
        commission_rate: rateDecimal,
        commission_amount: commission,
        status: document.getElementById('settleStatusSelect').value
    };

    try {
        const { error } = await sb.from('settlements').insert([payload]);
        if (error) throw error;

        showToast('정산이 추가되었습니다.', 'success');
        document.getElementById('settlementModal').classList.remove('active');
        e.target.reset();
        document.getElementById('settleRate').value = '1.5';
        document.getElementById('settleSummary').style.display = 'none';
        loadAdminSettlements();
    } catch (error) {
        showToast('정산 추가 실패: ' + error.message, 'error');
    }
}

async function updateSettlementStatus(id, status) {
    try {
        const { error } = await sb
            .from('settlements')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
        showToast('정산 상태가 변경되었습니다.', 'success');
    } catch (error) {
        showToast('상태 변경 실패', 'error');
    }
}

async function deleteSettlement(id) {
    if (!confirm('이 정산 내역을 삭제하시겠습니까?')) return;
    try {
        const { error } = await sb.from('settlements').delete().eq('id', id);
        if (error) throw error;
        showToast('삭제되었습니다.', 'success');
        loadAdminSettlements();
    } catch (error) {
        showToast('삭제 실패', 'error');
    }
}

// ─── Notices ───

async function loadAdminNotices() {
    try {
        const { data, error } = await sb.from('notices').select('*').order('created_at', { ascending: false });
        if (error) throw error;

        const table = document.getElementById('noticeTable');
        const empty = document.getElementById('noticeEmpty');
        const tbody = document.getElementById('noticeTableBody');

        if (!data || data.length === 0) {
            table.style.display = 'none';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        table.style.display = 'table';
        tbody.innerHTML = data.map(row => `
            <tr>
                <td><strong>${escapeHtml(row.title)}</strong></td>
                <td><span class="status-badge ${row.is_active ? 'status-completed' : 'status-cancelled'}">${row.is_active ? '활성' : '비활성'}</span></td>
                <td>${formatDate(row.created_at)}</td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn edit" onclick="editNotice(${row.id})">수정</button>
                        <button class="action-btn delete" onclick="deleteNotice(${row.id})">삭제</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Load notices error:', error);
    }
}

function openNoticeModal() {
    document.getElementById('noticeModalTitle').textContent = '공지 추가';
    document.getElementById('noticeEditId').value = '';
    document.getElementById('noticeTitle').value = '';
    document.getElementById('noticeContent').value = '';
    document.getElementById('noticeActive').checked = true;
    document.getElementById('noticeModal').classList.add('active');
}

async function editNotice(id) {
    const { data, error } = await sb.from('notices').select('*').eq('id', id).single();
    if (error) { showToast('공지를 불러올 수 없습니다.', 'error'); return; }

    document.getElementById('noticeModalTitle').textContent = '공지 수정';
    document.getElementById('noticeEditId').value = id;
    document.getElementById('noticeTitle').value = data.title;
    document.getElementById('noticeContent').value = data.content || '';
    document.getElementById('noticeActive').checked = data.is_active;
    document.getElementById('noticeModal').classList.add('active');
}

async function handleNoticeSubmit(e) {
    e.preventDefault();

    const editId = document.getElementById('noticeEditId').value;
    const payload = {
        title: document.getElementById('noticeTitle').value.trim(),
        content: document.getElementById('noticeContent').value.trim(),
        is_active: document.getElementById('noticeActive').checked
    };

    try {
        if (editId) {
            const { error } = await sb.from('notices').update(payload).eq('id', Number(editId));
            if (error) throw error;
            showToast('공지가 수정되었습니다.', 'success');
        } else {
            const { error } = await sb.from('notices').insert([payload]);
            if (error) throw error;
            showToast('공지가 추가되었습니다.', 'success');
        }

        document.getElementById('noticeModal').classList.remove('active');
        loadAdminNotices();
    } catch (error) {
        showToast('저장 실패: ' + error.message, 'error');
    }
}

async function deleteNotice(id) {
    if (!confirm('이 공지를 삭제하시겠습니까?')) return;
    try {
        const { error } = await sb.from('notices').delete().eq('id', id);
        if (error) throw error;
        showToast('삭제되었습니다.', 'success');
        loadAdminNotices();
    } catch (error) {
        showToast('삭제 실패', 'error');
    }
}

// ─── All Inquiries (통합 문의) ───

function getSourceLabel(source) {
    if (!source) return { text: '일반상담', cls: 'source-consultation' };

    const s = source.toLowerCase();
    if (s === 'partner') return { text: '파트너 신청', cls: 'source-partner' };
    if (s === 'promo') return { text: 'DSR 프로모', cls: 'source-promo' };
    if (s.includes('marketing-medical') || s.includes('marketing_medical')) return { text: '병의원 마케팅', cls: 'source-marketing-medical' };
    if (s.includes('marketing-biz') || s.includes('marketing_biz')) return { text: '소상공인 마케팅', cls: 'source-marketing-biz' };
    if (s.includes('marketing')) return { text: '마케팅', cls: 'source-marketing-medical' };
    return { text: '일반상담', cls: 'source-consultation' };
}

function getSourceBadge(source) {
    const info = getSourceLabel(source);
    return `<span class="source-badge ${info.cls}">${info.text}</span>`;
}

function normalizeSource(row) {
    if (row._table === 'partner_inquiries') return 'partner';
    if (row._table === 'promo_inquiries') return 'promo';
    const sp = (row.source_page || '').toLowerCase();
    if (sp.includes('marketing-medical')) return 'marketing-medical';
    if (sp.includes('marketing-biz')) return 'marketing-biz';
    if (row._table === 'marketing_inquiries') {
        if (sp.includes('medical')) return 'marketing-medical';
        if (sp.includes('biz')) return 'marketing-biz';
        return 'marketing-medical';
    }
    return 'consultation';
}

async function loadAllInquiries() {
    const loading = document.getElementById('allLoading');
    const table = document.getElementById('allTable');
    const empty = document.getElementById('allEmpty');
    const tbody = document.getElementById('allTableBody');

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    try {
        const [consultRes, mktRes, partnerRes, promoRes] = await Promise.all([
            sb.from('consultations').select('*').order('created_at', { ascending: false }),
            sb.from('marketing_inquiries').select('*').order('created_at', { ascending: false }),
            sb.from('partner_inquiries').select('*').order('created_at', { ascending: false }),
            sb.from('promo_inquiries').select('*').order('created_at', { ascending: false })
        ]);

        let allData = [];

        if (consultRes.data) {
            allData = allData.concat(consultRes.data.map(r => ({
                ...r, _table: 'consultations',
                _business: getBusinessLabel(r.business),
                _notes: r.message || r.admin_notes || ''
            })));
        }
        if (mktRes.data) {
            allData = allData.concat(mktRes.data.map(r => ({
                ...r, _table: 'marketing_inquiries',
                _business: r.business_type || '',
                _notes: r.clinic_size ? '평수: ' + r.clinic_size : ''
            })));
        }
        if (partnerRes.data) {
            allData = allData.concat(partnerRes.data.map(r => ({
                ...r, _table: 'partner_inquiries',
                _business: r.occupation || '',
                _notes: r.expected_leads ? '예상 월 ' + r.expected_leads + '건' : ''
            })));
        }
        if (promoRes.data) {
            allData = allData.concat(promoRes.data.map(r => ({
                ...r, _table: 'promo_inquiries',
                _business: r.business_type || '',
                _notes: r.monthly_sales || ''
            })));
        }

        // Sort by created_at DESC
        allData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // Apply source filter
        const sourceFilter = document.getElementById('allSourceFilter').value;
        if (sourceFilter !== 'all') {
            allData = allData.filter(row => normalizeSource(row) === sourceFilter);
        }

        // Apply status filter
        const statusFilter = document.getElementById('allStatusFilter').value;
        if (statusFilter !== 'all') {
            allData = allData.filter(row => row.status === statusFilter);
        }

        // Apply search
        const search = document.getElementById('allSearch').value.trim().toLowerCase();
        if (search) {
            allData = allData.filter(row =>
                (row.name || '').toLowerCase().includes(search) ||
                (row.phone || '').toLowerCase().includes(search)
            );
        }

        loading.style.display = 'none';

        if (allData.length === 0) {
            empty.style.display = 'block';
            return;
        }

        table.style.display = 'table';
        tbody.innerHTML = allData.map(row => `
            <tr>
                <td>${formatDate(row.created_at)}</td>
                <td>${getSourceBadge(normalizeSource(row))}</td>
                <td><strong>${escapeHtml(row.name)}</strong></td>
                <td>${escapeHtml(row.phone)}</td>
                <td>${escapeHtml(row._business)}</td>
                <td><span class="status-badge status-${row.status || 'new'}">${getStatusLabel(row.status || 'new')}</span></td>
                <td>${escapeHtml(row._notes)}</td>
            </tr>
        `).join('');

        // Store for CSV export
        window._allInquiriesData = allData;
    } catch (error) {
        console.error('Load all inquiries error:', error);
        loading.style.display = 'none';
        showToast('전체 문의 데이터를 불러오는데 실패했습니다.', 'error');
    }
}

async function exportAllInquiriesCSV() {
    const data = window._allInquiriesData;
    if (!data || data.length === 0) {
        showToast('내보낼 데이터가 없습니다.', 'error');
        return;
    }

    let csv = '일시,출처,성함,연락처,업종/직업,상태,비고\n';
    csv += data.map(row => {
        const sourceInfo = getSourceLabel(normalizeSource(row));
        return `"${formatDate(row.created_at)}","${sourceInfo.text}","${row.name}","${row.phone}","${(row._business || '').replace(/"/g, '""')}","${getStatusLabel(row.status || 'new')}","${(row._notes || '').replace(/"/g, '""')}"`;
    }).join('\n');

    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `all_inquiries_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast('다운로드가 시작되었습니다.', 'success');
}

// ─── CSV Export ───

async function exportToCSV(type) {
    try {
        let data, csv;

        if (type === 'consultations') {
            const result = await sb.from('consultations').select('*').order('created_at', { ascending: false });
            if (result.error) throw result.error;
            data = result.data;
            if (!data?.length) { showToast('내보낼 데이터가 없습니다.', 'error'); return; }
            csv = '신청일시,성함,연락처,업종,월매출,지역,관심상품,문의사항,상태\n';
            csv += data.map(row =>
                `"${formatDate(row.created_at)}","${row.name}","${row.phone}","${getBusinessLabel(row.business)}","${getRevenueLabel(row.revenue)}","${getRegionLabel(row.region)}","${getProductLabel(row.product)}","${(row.message || '').replace(/"/g, '""')}","${getStatusLabel(row.status)}"`
            ).join('\n');
        } else if (type === 'partners') {
            const result = await sb.from('partners').select('*').order('created_at', { ascending: false });
            if (result.error) throw result.error;
            data = result.data;
            if (!data?.length) { showToast('내보낼 데이터가 없습니다.', 'error'); return; }
            csv = '신청일시,성함,연락처,병원명,업종,지역,상태\n';
            csv += data.map(row =>
                `"${formatDate(row.created_at)}","${row.name}","${row.phone}","${row.hospital_name || ''}","${getBusinessLabel(row.business)}","${getRegionLabel(row.region)}","${getPartnerStatusLabel(row.status)}"`
            ).join('\n');
        } else if (type === 'customers') {
            const result = await sb
                .from('consultations')
                .select('*, partners(name)')
                .not('partner_id', 'is', null)
                .order('created_at', { ascending: false });
            if (result.error) throw result.error;
            data = result.data;
            if (!data?.length) { showToast('내보낼 데이터가 없습니다.', 'error'); return; }
            csv = '등록일,파트너,고객명,연락처,업종,진행상태,거래액\n';
            csv += data.map(row =>
                `"${formatDate(row.created_at)}","${row.partners?.name || ''}","${row.name}","${row.phone}","${getBusinessLabel(row.business)}","${getPipelineLabel(row.pipeline_status)}","${row.transaction_amount || ''}"`
            ).join('\n');
        }

        const bom = '\uFEFF';
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${type}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        showToast('다운로드가 시작되었습니다.', 'success');
    } catch (error) {
        showToast('내보내기에 실패했습니다.', 'error');
    }
}

// ─── Utilities ───

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatCurrency(amount) {
    return Number(amount || 0).toLocaleString('ko-KR');
}

function getBusinessLabel(value) {
    const labels = { 'hospital': '병원/의원', 'dental': '치과', 'oriental': '한의원', 'pharmacy': '약국', 'plastic': '성형외과', 'derma': '피부과', 'eye': '안과', 'ortho': '정형외과', 'other': '기타 의료' };
    return labels[value] || value || '-';
}

function getRevenueLabel(value) {
    const labels = { 'under3000': '3천만원 미만', '3000-5000': '3천~5천만원', '5000-1': '5천만원~1억', '1-2': '1억~2억', '2-3': '2억~3억', 'over3': '3억 이상' };
    return labels[value] || value || '-';
}

function getRegionLabel(value) {
    const labels = { 'seoul': '서울', 'gyeonggi': '경기', 'incheon': '인천', 'busan': '부산', 'daegu': '대구', 'daejeon': '대전', 'gwangju': '광주', 'ulsan': '울산', 'sejong': '세종', 'gangwon': '강원', 'chungbuk': '충북', 'chungnam': '충남', 'jeonbuk': '전북', 'jeonnam': '전남', 'gyeongbuk': '경북', 'gyeongnam': '경남', 'jeju': '제주' };
    return labels[value] || value || '-';
}

function getProductLabel(value) {
    const labels = { 'loan': '카드매출 담보대출', 'credit': '신협 데일리론', 'kb': 'KB국민카드 특별한도', 'rental': '의료장비 렌탈', 'deposit': '임차보증금 담보', 'purchase': '구매자금', 'consult': '모름 (상담 필요)' };
    return labels[value] || value || '-';
}

function getStatusLabel(status) {
    const labels = { 'new': '신규', 'contacted': '연락완료', 'completed': '상담완료', 'cancelled': '취소' };
    return labels[status] || status;
}

function getPartnerStatusLabel(status) {
    const labels = { 'new': '신규', 'pending': '승인 대기', 'reviewing': '검토중', 'approved': '승인', 'rejected': '반려' };
    return labels[status] || status;
}

function getPipelineLabel(status) {
    const labels = { 'received': '접수', 'reviewing': '심사 중', 'approved': '승인', 'installed': 'PG 설치 완료', 'rejected': '반려' };
    return labels[status] || status || '-';
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}
