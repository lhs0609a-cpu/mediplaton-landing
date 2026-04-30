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

        // 파트너인지 관리자인지 체크 후 라우팅
        const { data: partner, error: partnerError } = await sb
            .from('partners')
            .select('status')
            .eq('user_id', currentUser.id)
            .maybeSingle();

        // DB 에러 시 관리자로 잘못 진입하는 것 방지
        if (partnerError) {
            console.error('Partner check error:', partnerError);
            alert('데이터베이스 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            await sb.auth.signOut();
            currentUser = null;
            return;
        }

        if (partner?.status === 'approved') {
            window.location.href = 'partner-dashboard.html';
            return;
        } else if (partner && partner.status !== 'approved') {
            // 미승인 파트너는 세션 제거
            await sb.auth.signOut();
            currentUser = null;
        } else {
            // partners 테이블에 레코드 없음 = 관리자
            showDashboard();
        }
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
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
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

    // New Clinics
    document.getElementById('syncHiraBtn').addEventListener('click', syncHiraData);
    document.getElementById('openNewClinicFormBtn').addEventListener('click', () => openNewClinicForm());
    document.getElementById('csvUploadClinicBtn').addEventListener('click', () => document.getElementById('csvClinicModal').classList.add('active'));
    document.getElementById('exportClinicsBtn').addEventListener('click', exportClinicsCSV);
    document.getElementById('newClinicForm').addEventListener('submit', handleNewClinicSubmit);
    document.getElementById('csvClinicFile').addEventListener('change', handleCsvClinicPreview);
    document.getElementById('csvImportBtn').addEventListener('click', handleCsvClinicImport);
    document.getElementById('ncRegionFilter').addEventListener('change', loadAdminNewClinics);
    document.getElementById('ncSpecialtyFilter').addEventListener('change', loadAdminNewClinics);
    document.getElementById('ncClaimFilter').addEventListener('change', loadAdminNewClinics);
    document.getElementById('ncSearch').addEventListener('input', debounce(loadAdminNewClinics, 300));
}

// ─── Auth ───

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.authTab === tab);
    });
    document.getElementById('loginFormWrap').classList.toggle('active', tab === 'login');
    document.getElementById('registerFormWrap').classList.toggle('active', tab === 'register');

    // Clear messages
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('registerError').style.display = 'none';
    document.getElementById('registerSuccess').style.display = 'none';
}

async function handleRegister(e) {
    e.preventDefault();
    const errEl = document.getElementById('registerError');
    const successEl = document.getElementById('registerSuccess');
    const btn = document.getElementById('registerBtn');
    errEl.style.display = 'none';
    successEl.style.display = 'none';

    const name = document.getElementById('regName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const passwordConfirm = document.getElementById('regPasswordConfirm').value;
    const hospital_name = document.getElementById('regHospital').value.trim();
    const business = document.getElementById('regBusiness').value;
    const region = document.getElementById('regRegion').value;
    const bank_name = document.getElementById('regBankName').value || null;
    const bank_account = document.getElementById('regBankAccount').value.trim() || null;

    // Validation
    if (!name || !phone || !email || !password || !hospital_name || !business || !region) {
        errEl.textContent = '필수 항목을 모두 입력해주세요.';
        errEl.style.display = 'block';
        return;
    }
    if (password.length < 6) {
        errEl.textContent = '비밀번호는 6자 이상이어야 합니다.';
        errEl.style.display = 'block';
        return;
    }
    if (password !== passwordConfirm) {
        errEl.textContent = '비밀번호가 일치하지 않습니다.';
        errEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.textContent = '처리 중...';

    try {
        // 1. Sign up in Supabase Auth (이메일 인증 건너뛰기 위해 옵션 추가)
        const { data, error } = await sb.auth.signUp({
            email,
            password,
            options: {
                data: { name, phone, role: 'partner' }
            }
        });
        if (error) throw error;

        // signUp이 유저를 반환하지 않으면 이미 존재하는 이메일
        if (!data.user || !data.user.id) {
            throw new Error('이미 가입된 이메일입니다. 로그인을 시도해주세요.');
        }

        // 2. Insert partner record with pending status
        // (signUp으로 세션이 생겼을 수 있으므로 해당 세션으로 insert)
        const { error: insertError } = await sb.from('partners').insert({
            name,
            phone,
            email,
            hospital_name,
            business,
            region,
            bank_name,
            bank_account,
            user_id: data.user.id,
            status: 'pending'
        });
        if (insertError) throw insertError;

        // 3. Sign out (pending user should not have a session)
        await sb.auth.signOut();

        // 4. Show success
        successEl.textContent = '가입 신청이 완료되었습니다! 관리자 승인 후 로그인하실 수 있습니다.';
        successEl.style.display = 'block';
        document.getElementById('registerForm').reset();

        // 5. Auto-switch to login tab after 3 seconds
        setTimeout(() => switchAuthTab('login'), 3000);
    } catch (error) {
        errEl.textContent = error.message || '회원가입에 실패했습니다.';
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = '회원가입 신청';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user;
        loginError.style.display = 'none';

        // Check if this user is a partner
        const { data: partner } = await sb
            .from('partners')
            .select('status, rejection_reason')
            .eq('user_id', currentUser.id)
            .single();

        if (!partner) {
            // No partner record → admin
            showDashboard();
        } else if (partner.status === 'approved') {
            // Approved partner → redirect to partner dashboard
            window.location.href = 'partner-dashboard.html';
        } else if (partner.status === 'pending' || partner.status === 'reviewing') {
            // Pending/reviewing → show message and sign out
            loginError.textContent = '관리자 승인 대기 중입니다. 승인 후 다시 로그인해주세요.';
            loginError.style.display = 'block';
            await sb.auth.signOut();
            currentUser = null;
        } else if (partner.status === 'rejected') {
            // Rejected → show reason and sign out
            const reason = partner.rejection_reason ? ` (사유: ${partner.rejection_reason})` : '';
            loginError.textContent = `가입이 거절되었습니다${reason}. 자세한 내용은 고객센터에 문의하세요.`;
            loginError.style.display = 'block';
            await sb.auth.signOut();
            currentUser = null;
        } else {
            // Fallback: other statuses (new, etc.) treated like pending
            loginError.textContent = '관리자 승인 대기 중입니다. 승인 후 다시 로그인해주세요.';
            loginError.style.display = 'block';
            await sb.auth.signOut();
            currentUser = null;
        }
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
            { count: pendingPartner },
            { count: pendingAgency }
        ] = await Promise.all([
            sb.from('consultations').select('*', { count: 'exact', head: true }).gte('created_at', today),
            sb.from('consultations').select('*', { count: 'exact', head: true }),
            sb.from('partners').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
            sb.from('consultations').select('*', { count: 'exact', head: true }).eq('status', 'new'),
            sb.from('partners').select('*', { count: 'exact', head: true }).in('status', ['new', 'pending']),
            sb.from('agency_inquiries').select('*', { count: 'exact', head: true }).eq('status', 'new')
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
        const agencyBadgeEl = document.getElementById('agencyBadge');
        if (agencyBadgeEl) agencyBadgeEl.textContent = pendingAgency || 0;
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
    const agSec = document.getElementById('agenciesSection');
    if (agSec) agSec.style.display = tab === 'agencies' ? 'block' : 'none';
    document.getElementById('customersSection').style.display = tab === 'customers' ? 'block' : 'none';
    document.getElementById('adminSettlementsSection').style.display = tab === 'admin-settlements' ? 'block' : 'none';
    document.getElementById('partnerQnaSection').style.display = tab === 'partner-qna' ? 'block' : 'none';
    document.getElementById('boardManageSection').style.display = tab === 'board-manage' ? 'block' : 'none';
    document.getElementById('newClinicsSection').style.display = tab === 'new-clinics' ? 'block' : 'none';
    document.getElementById('analyticsSection').style.display = tab === 'analytics' ? 'block' : 'none';
    const leadSec = document.getElementById('leadManageSection');
    if (leadSec) leadSec.style.display = tab === 'lead-manage' ? 'block' : 'none';
    const agentSec = document.getElementById('agentManageSection');
    if (agentSec) agentSec.style.display = tab === 'agent-manage' ? 'block' : 'none';

    if (tab === 'all-inquiries') loadAllInquiries();
    if (tab === 'consultations') loadConsultations();
    if (tab === 'partners') loadPartners();
    if (tab === 'agencies') loadAgencies();
    if (tab === 'customers') loadCustomers();
    if (tab === 'admin-settlements') {
        loadAdminSettlements();
        loadAdminNotices();
    }
    if (tab === 'partner-qna' && !window._qnaInitialized) {
        setupAdminQNA();
        window._qnaInitialized = true;
    }
    if (tab === 'board-manage') loadAdminBoardPosts();
    if (tab === 'new-clinics') loadAdminNewClinics();
    if (tab === 'analytics') loadAnalytics();
    if (tab === 'lead-manage' && typeof loadLeadManagement === 'function') loadLeadManagement();
    if (tab === 'agent-manage' && typeof loadAgentManagement === 'function') loadAgentManagement();
    if (tab === 'match-events' && typeof loadMatchEvents === 'function') loadMatchEvents();
    if (tab === 'audit-penalty' && typeof loadAuditPenalty === 'function') loadAuditPenalty();

    const matchSec = document.getElementById('matchEventsSection');
    if (matchSec) matchSec.style.display = tab === 'match-events' ? 'block' : 'none';
    const auditSec = document.getElementById('auditPenaltySection');
    if (auditSec) auditSec.style.display = tab === 'audit-penalty' ? 'block' : 'none';
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
        // partner_contracts 테이블이 없을 수 있으므로 fallback 처리
        let query = sb.from('partners').select('*, partner_contracts(status)').order('created_at', { ascending: false });

        const statusFilter = document.getElementById('partnerStatusFilter').value;
        if (statusFilter !== 'all') query = query.eq('status', statusFilter);

        const search = document.getElementById('partnerSearch').value.trim();
        if (search) query = query.or(`name.ilike.%${search}%,hospital_name.ilike.%${search}%`);

        let { data, error } = await query;

        // partner_contracts 테이블이 없으면 계약 조인 없이 재시도
        if (error) {
            console.warn('partner_contracts join failed, loading without contracts:', error.message);
            let fallbackQuery = sb.from('partners').select('*').order('created_at', { ascending: false });
            if (statusFilter !== 'all') fallbackQuery = fallbackQuery.eq('status', statusFilter);
            if (search) fallbackQuery = fallbackQuery.or(`name.ilike.%${search}%,hospital_name.ilike.%${search}%`);
            const result = await fallbackQuery;
            data = result.data;
            error = result.error;
            if (error) throw error;
        }

        loading.style.display = 'none';

        if (!data || data.length === 0) {
            empty.style.display = 'block';
            return;
        }

        table.style.display = 'table';
        tbody.innerHTML = data.map(row => {
            const needsAction = ['new', 'pending', 'reviewing'].includes(row.status);

            // 계약 상태 배지 생성
            let contractBadge = '';
            if (row.status === 'approved' && row.partner_contracts && row.partner_contracts.length > 0) {
                const contractStatuses = row.partner_contracts.map(c => c.status);
                const priorityOrder = ['termination_requested', 'active', 'signed', 'sent', 'draft', 'expired', 'terminated'];
                const topStatus = priorityOrder.find(s => contractStatuses.includes(s)) || contractStatuses[0];
                contractBadge = `<span class="contract-status ${topStatus}" style="font-size:11px;margin-left:4px;">${getContractStatusLabel(topStatus)}</span>`;
            }

            return `
                <tr>
                    <td>${formatDate(row.created_at)}</td>
                    <td><strong>${escapeHtml(row.name)}</strong></td>
                    <td>${escapeHtml(row.phone)}</td>
                    <td>${escapeHtml(row.hospital_name || '-')}</td>
                    <td>${getBusinessLabel(row.business)}</td>
                    <td>${getRegionLabel(row.region)}</td>
                    <td><span class="status-badge status-${row.status}">${getPartnerStatusLabel(row.status)}</span>${contractBadge}</td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn view" onclick="viewPartner(${row.id})">상세</button>
                            ${needsAction ? `
                                <button class="action-btn approve" onclick="approvePartner(${row.id})">승인</button>
                                <button class="action-btn reject" onclick="openRejectModal(${row.id})">반려</button>
                            ` : ''}
                            ${row.status === 'approved' ? `<button class="action-btn edit" onclick="openContractManager(${row.id})">계약</button>` : ''}
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
    // 파트너 정보 조회 후 모달 표시
    const { data: partner } = await sb.from('partners').select('*').eq('id', id).single();
    if (!partner) { showToast('파트너 정보를 불러올 수 없습니다.', 'error'); return; }

    // 모달 초기값 설정
    document.getElementById('approvePartnerInfo').textContent = `${partner.name}${partner.hospital_name ? ' / ' + partner.hospital_name : ''}`;
    document.getElementById('approveContractRate').value = partner.commission_rate ? (Number(partner.commission_rate) * 100).toFixed(2) : '1.50';
    document.getElementById('approveContractPeriod').value = '12';
    document.getElementById('approveContractStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('approveContractAutoRenewal').checked = true;
    document.getElementById('approveContractAutoSend').checked = true;

    // 모달 열기
    document.getElementById('approveContractModal').classList.add('active');

    // 제출 핸들러 (매번 새로 바인딩)
    const confirmBtn = document.getElementById('confirmApproveContractBtn');
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

    newBtn.addEventListener('click', async () => {
        newBtn.disabled = true;
        newBtn.textContent = '처리 중...';

        try {
            // 1. 파트너 승인
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

            // 2. 승인 알림
            if (partner.user_id) {
                await sb.rpc('create_notification', {
                    p_user_id: partner.user_id,
                    p_type: 'partner_approved',
                    p_title: '파트너 승인 완료',
                    p_message: `${partner.name}님의 파트너 가입이 승인되었습니다. 파트너 대시보드를 이용하실 수 있습니다.`
                });
            }

            // 3. 모달에서 입력한 조건으로 계약서 생성
            const ratePercent = Number(document.getElementById('approveContractRate').value);
            const periodMonths = parseInt(document.getElementById('approveContractPeriod').value);
            const startDate = document.getElementById('approveContractStartDate').value;
            const autoRenewal = document.getElementById('approveContractAutoRenewal').checked;
            const autoSend = document.getElementById('approveContractAutoSend').checked;

            if (!startDate || ratePercent <= 0 || ratePercent > 100) {
                showToast('파트너는 승인되었습니다. 계약 조건을 확인 후 계약 관리에서 수동 생성하세요.', 'warning');
                document.getElementById('approveContractModal').classList.remove('active');
                loadPartners(); loadStats(); loadPartnersCache();
                return;
            }

            const contract = await autoCreateDraftContract(id, {
                rate: ratePercent / 100,
                periodMonths,
                startDate,
                autoRenewal
            });

            if (contract) {
                if (autoSend) {
                    // 즉시 발송 (confirm 없이)
                    await quickSendContractSilent(contract.id);
                    showToast(`파트너 승인 + 계약서(${contract.contract_number}) 발송 완료`, 'success');
                } else {
                    showToast(`파트너 승인 + 계약서(${contract.contract_number}) 생성 완료 (초안)`, 'success');
                }
            } else {
                showToast('파트너가 승인되었습니다. (기존 계약 존재로 자동 생성 생략)', 'success');
            }

            document.getElementById('approveContractModal').classList.remove('active');
            loadPartners();
            loadStats();
            loadPartnersCache();
        } catch (err) {
            showToast('승인 실패: ' + err.message, 'error');
        } finally {
            newBtn.disabled = false;
            newBtn.textContent = '승인 및 계약서 생성';
        }
    });
}

async function approvePartnerContractOnly(partnerId, partner) {
    // 이미 승인된 파트너에 대해 계약 조건 설정 모달만 열기
    if (!partner) {
        const { data } = await sb.from('partners').select('*').eq('id', partnerId).single();
        partner = data;
    }
    if (!partner) { showToast('파트너 정보를 불러올 수 없습니다.', 'error'); return; }

    document.getElementById('approvePartnerInfo').textContent = `${partner.name}${partner.hospital_name ? ' / ' + partner.hospital_name : ''}`;
    document.getElementById('approveContractRate').value = partner.commission_rate ? (Number(partner.commission_rate) * 100).toFixed(2) : '1.50';
    document.getElementById('approveContractPeriod').value = '12';
    document.getElementById('approveContractStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('approveContractAutoRenewal').checked = true;
    document.getElementById('approveContractAutoSend').checked = true;

    document.getElementById('approveContractModal').classList.add('active');

    const confirmBtn = document.getElementById('confirmApproveContractBtn');
    const newBtn = confirmBtn.cloneNode(true);
    newBtn.textContent = '계약서 생성';
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

    newBtn.addEventListener('click', async () => {
        newBtn.disabled = true;
        newBtn.textContent = '처리 중...';

        try {
            const ratePercent = Number(document.getElementById('approveContractRate').value);
            const periodMonths = parseInt(document.getElementById('approveContractPeriod').value);
            const startDate = document.getElementById('approveContractStartDate').value;
            const autoRenewal = document.getElementById('approveContractAutoRenewal').checked;
            const autoSend = document.getElementById('approveContractAutoSend').checked;

            const contract = await autoCreateDraftContract(partnerId, {
                rate: ratePercent / 100,
                periodMonths,
                startDate,
                autoRenewal
            });

            if (contract) {
                if (autoSend) {
                    await quickSendContractSilent(contract.id);
                    showToast(`계약서(${contract.contract_number}) 발송 완료`, 'success');
                } else {
                    showToast(`계약서(${contract.contract_number}) 생성 완료 (초안)`, 'success');
                }
            } else {
                showToast('기존 계약이 존재하여 자동 생성이 생략되었습니다.', 'success');
            }

            document.getElementById('approveContractModal').classList.remove('active');
            loadPartners();
        } catch (err) {
            showToast('계약서 생성 실패: ' + err.message, 'error');
        } finally {
            newBtn.disabled = false;
            newBtn.textContent = '계약서 생성';
        }
    });
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
            <span class="detail-label">상담 가능 시간</span>
            <span class="detail-value">${getPreferredTimeLabel(data.preferred_time)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">유입 경로</span>
            <span class="detail-value">${getInflowChannelLabel(data.inflow_channel)}</span>
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
        <div id="partnerContractsArea" style="border-top: 2px solid var(--gray-200); margin-top: 12px; padding-top: 12px;"></div>
    `;

    // 최근 계약 3건 로드
    if (data.status === 'approved') {
        loadPartnerRecentContracts(id);
    }

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

        // 파트너 승인 시 → 상세 모달 닫고, 계약 조건 설정 모달 열기
        if (currentDetailType === 'partner' && newStatus === 'approved') {
            const partnerId = currentDetailId;

            // 알림 발송
            const { data: partner } = await sb.from('partners').select('user_id, name').eq('id', partnerId).single();
            if (partner?.user_id) {
                await sb.rpc('create_notification', {
                    p_user_id: partner.user_id,
                    p_type: 'partner_approved',
                    p_title: '파트너 승인 완료',
                    p_message: `${partner.name}님의 파트너 가입이 승인되었습니다. 파트너 대시보드를 이용하실 수 있습니다.`
                });
            }

            showToast('파트너가 승인되었습니다. 계약 조건을 설정하세요.', 'success');
            closeModal();
            loadPartners(); loadPartnersCache(); loadStats();

            // 계약 조건 설정 모달 열기 (approvePartner 로직 재사용)
            approvePartnerContractOnly(partnerId, partner);
            return;
        } else {
            showToast('상태가 저장되었습니다.', 'success');
        }

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
    if (s === 'agency') return { text: '가맹점 신청', cls: 'source-agency' };
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
    if (row._table === 'agency_inquiries') return 'agency';
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
        const [consultRes, mktRes, partnerRes, promoRes, agencyRes] = await Promise.all([
            sb.from('consultations').select('*').order('created_at', { ascending: false }),
            sb.from('marketing_inquiries').select('*').order('created_at', { ascending: false }),
            sb.from('partner_inquiries').select('*').order('created_at', { ascending: false }),
            sb.from('promo_inquiries').select('*').order('created_at', { ascending: false }),
            sb.from('agency_inquiries').select('*').order('created_at', { ascending: false })
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
        if (agencyRes && agencyRes.data) {
            allData = allData.concat(agencyRes.data.map(r => ({
                ...r, _table: 'agency_inquiries',
                _business: r.business_type || '가맹점',
                _notes: [r.company_name, r.desired_region, r.team_size && (r.team_size + ' 조직')]
                    .filter(Boolean).join(' / ')
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

    let csv = '일시,출처,성함,연락처,업종/직업,상담가능시간,유입경로,상태,비고\n';
    csv += data.map(row => {
        const sourceInfo = getSourceLabel(normalizeSource(row));
        return `"${formatDate(row.created_at)}","${sourceInfo.text}","${row.name}","${row.phone}","${(row._business || '').replace(/"/g, '""')}","${getPreferredTimeLabel(row.preferred_time)}","${getInflowChannelLabel(row.inflow_channel)}","${getStatusLabel(row.status || 'new')}","${(row._notes || '').replace(/"/g, '""')}"`;
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
            csv = '신청일시,성함,연락처,업종,월매출,지역,관심상품,상담가능시간,유입경로,문의사항,상태\n';
            csv += data.map(row =>
                `"${formatDate(row.created_at)}","${row.name}","${row.phone}","${getBusinessLabel(row.business)}","${getRevenueLabel(row.revenue)}","${getRegionLabel(row.region)}","${getProductLabel(row.product)}","${getPreferredTimeLabel(row.preferred_time)}","${getInflowChannelLabel(row.inflow_channel)}","${(row.message || '').replace(/"/g, '""')}","${getStatusLabel(row.status)}"`
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
    const labels = { 'broker': '중개법인', 'accounting': '회계사/세무사', 'law': '변호사/법무사', 'insurance': '보험대리점', 'finance': '금융컨설팅', 'marketing': '마케팅대행', 'individual': '개인영업', 'other': '기타', 'hospital': '병원/의원', 'dental': '치과', 'oriental': '한의원', 'pharmacy': '약국', 'restaurant': '음식점', 'cafe': '카페', 'salon': '미용실', 'gym': '헬스장' };
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

function getPreferredTimeLabel(value) {
    const labels = { '09-10': '오전 9시~10시', '10-12': '오전 10시~12시', '12-14': '오후 12시~2시', '14-16': '오후 2시~4시', '16-18': '오후 4시~6시', 'anytime': '언제든 가능' };
    return labels[value] || value || '-';
}

function getInflowChannelLabel(value) {
    const labels = { 'blog': '블로그', 'search': '검색', 'email': '이메일', 'youtube': '유튜브', 'other': '기타' };
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

// ─── Admin QNA ───

function setupAdminQNA() {
    const section = document.getElementById('partnerQnaSection');
    if (!section) return;

    section.querySelectorAll('.qna-question').forEach(q => {
        q.addEventListener('click', () => {
            q.parentElement.classList.toggle('open');
        });
    });

    const searchInput = document.getElementById('adminQnaSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            const query = searchInput.value.trim().toLowerCase();
            section.querySelectorAll('.qna-item').forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = (!query || text.includes(query)) ? '' : 'none';
            });
            section.querySelectorAll('.qna-cat-title').forEach(title => {
                const next = [];
                let el = title.nextElementSibling;
                while (el && !el.classList.contains('qna-cat-title')) {
                    if (el.classList.contains('qna-item')) next.push(el);
                    el = el.nextElementSibling;
                }
                const anyVisible = next.some(n => n.style.display !== 'none');
                title.style.display = (!query || anyVisible) ? '' : 'none';
            });
        }, 200));
    }
}

// ─── Board Management (게시판 관리) ───

async function loadAdminBoardPosts() {
    const loading = document.getElementById('adminBoardLoading');
    const list = document.getElementById('adminBoardList');
    loading.style.display = 'flex';

    try {
        const { data: posts, error } = await sb
            .from('board_posts')
            .select('*, board_replies(*)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!posts || posts.length === 0) {
            list.innerHTML = '<div class="board-empty"><h3>게시글이 없습니다</h3></div>';
            return;
        }

        list.innerHTML = posts.map(post => {
            const date = new Date(post.created_at).toLocaleDateString('ko-KR');
            const replies = post.board_replies || [];
            const typeBadge = post.author_type === 'admin'
                ? '<span class="board-badge-admin">관리자</span>'
                : '<span class="board-badge-partner">파트너</span>';
            const statusBadge = post.is_answered
                ? '<span class="board-badge-answered">답변완료</span>'
                : '<span class="board-badge-waiting">대기중</span>';

            const repliesHtml = replies.map(r => {
                const rDate = new Date(r.created_at).toLocaleDateString('ko-KR');
                return `<div class="board-reply">
                    <div class="board-reply-label">관리자 답변</div>
                    <div class="board-reply-content">${escapeHtml(r.content)}</div>
                    <div class="board-reply-date">${rDate}</div>
                </div>`;
            }).join('');

            return `<div class="board-item">
                <div class="board-item-header" onclick="toggleAdminBoardItem(this)">
                    <div class="board-item-title">${escapeHtml(post.title)}</div>
                    <div class="board-item-meta">
                        ${typeBadge}
                        ${statusBadge}
                        <span>${post.author_name}</span>
                        <span>${date}</span>
                        <span class="board-arrow">&#9660;</span>
                    </div>
                </div>
                <div class="board-item-body">
                    <div class="board-content">${escapeHtml(post.content)}</div>
                    ${repliesHtml}
                    <div class="board-actions">
                        <button class="btn btn-primary btn-sm" onclick="openReplyModal(${post.id})">답변하기</button>
                        <button class="btn btn-outline btn-sm" onclick="deleteBoardPost(${post.id})" style="color:var(--danger);border-color:var(--danger);">삭제</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error('Admin board load error:', err);
        list.innerHTML = '<div class="board-empty"><h3>게시글을 불러올 수 없습니다</h3></div>';
    } finally {
        loading.style.display = 'none';
    }
}

function toggleAdminBoardItem(header) {
    const body = header.nextElementSibling;
    const arrow = header.querySelector('.board-arrow');
    body.classList.toggle('open');
    arrow.classList.toggle('open');
}

function openReplyModal(postId) {
    document.getElementById('replyPostId').value = postId;
    document.getElementById('boardReplyContent').value = '';
    document.getElementById('boardReplyModal').classList.add('active');
}

async function handleBoardReplySubmit(e) {
    e.preventDefault();
    const postId = document.getElementById('replyPostId').value;
    const content = document.getElementById('boardReplyContent').value.trim();
    if (!content) return;

    try {
        const { error: replyError } = await sb.from('board_replies').insert({
            post_id: parseInt(postId),
            content,
            author_name: '관리자'
        });

        if (replyError) throw replyError;

        const { error: updateError } = await sb
            .from('board_posts')
            .update({ is_answered: true })
            .eq('id', parseInt(postId));

        if (updateError) throw updateError;

        document.getElementById('boardReplyModal').classList.remove('active');
        document.getElementById('boardReplyForm').reset();
        showToast('답변이 등록되었습니다', 'success');
        loadAdminBoardPosts();
    } catch (err) {
        console.error('Reply error:', err);
        showToast('답변 등록에 실패했습니다', 'error');
    }
}

async function deleteBoardPost(id) {
    if (!confirm('이 게시글을 삭제하시겠습니까?')) return;

    try {
        const { error } = await sb
            .from('board_posts')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showToast('게시글이 삭제되었습니다', 'success');
        loadAdminBoardPosts();
    } catch (err) {
        console.error('Delete error:', err);
        showToast('삭제에 실패했습니다', 'error');
    }
}

async function handleAdminBoardPostSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('adminBoardPostTitle').value.trim();
    const content = document.getElementById('adminBoardPostContent').value.trim();
    if (!title || !content) return;

    try {
        const { data: { user } } = await sb.auth.getUser();
        const { error } = await sb.from('board_posts').insert({
            title,
            content,
            author_id: user.id,
            author_name: '관리자',
            author_type: 'admin'
        });

        if (error) throw error;

        document.getElementById('adminBoardPostModal').classList.remove('active');
        document.getElementById('adminBoardPostForm').reset();
        showToast('게시글이 등록되었습니다', 'success');
        loadAdminBoardPosts();
    } catch (err) {
        console.error('Admin board post error:', err);
        showToast('게시글 등록에 실패했습니다', 'error');
    }
}

function setupAdminBoard() {
    const openBtn = document.getElementById('openAdminBoardPostModal');
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            document.getElementById('adminBoardPostModal').classList.add('active');
        });
    }

    const replyForm = document.getElementById('boardReplyForm');
    if (replyForm) {
        replyForm.addEventListener('submit', handleBoardReplySubmit);
    }

    const postForm = document.getElementById('adminBoardPostForm');
    if (postForm) {
        postForm.addEventListener('submit', handleAdminBoardPostSubmit);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupAdminBoard();
});

// ─── Contract Management (계약 관리) ───

let currentContractPartnerId = null;
let currentContractId = null;

function getContractStatusLabel(status) {
    const labels = { draft: '작성중', sent: '발송', signed: '서명완료', active: '활성', expired: '만료', terminated: '해지', termination_requested: '해지신청' };
    return labels[status] || status;
}

const CONTRACT_TRANSITIONS = {
    draft: ['sent', 'terminated'],
    sent: ['signed', 'terminated'],
    signed: ['active', 'terminated'],
    active: ['expired', 'terminated'],
    expired: ['active'],
    terminated: [],
    termination_requested: ['terminated']
};

async function openContractManager(partnerId) {
    currentContractPartnerId = partnerId;

    const { data: partner, error } = await sb.from('partners').select('*').eq('id', partnerId).single();
    if (error) { showToast('파트너 정보를 불러올 수 없습니다.', 'error'); return; }

    document.getElementById('contractPartnerName').textContent = partner.name + (partner.hospital_name ? ' (' + partner.hospital_name + ')' : '');
    document.getElementById('contractPartnerPhone').textContent = partner.phone;
    document.getElementById('contractPartnerRate').textContent = partner.commission_rate ? (Number(partner.commission_rate) * 100).toFixed(2) + '%' : '1.50%';

    // 수수료율 기본값 설정
    document.getElementById('contractRate').value = partner.commission_rate ? (Number(partner.commission_rate) * 100).toFixed(2) : '1.50';

    // 시작일 기본값: 오늘
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('contractStartDate').value = today;
    updateContractEndDate();

    cancelContractForm();
    loadContracts(partnerId);
    document.getElementById('contractModal').classList.add('active');
}

async function loadContracts(partnerId) {
    const area = document.getElementById('contractHistoryArea');

    try {
        const { data, error } = await sb
            .from('partner_contracts')
            .select('*')
            .eq('partner_id', partnerId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            area.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray-500);">계약 이력이 없습니다.</div>';
            return;
        }

        area.innerHTML = `
            <table class="contract-history-table">
                <thead>
                    <tr>
                        <th>계약번호</th>
                        <th>기간</th>
                        <th>수수료율</th>
                        <th>상태</th>
                        <th>관리</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(c => `
                        <tr>
                            <td style="font-weight:600;">${escapeHtml(c.contract_number)}</td>
                            <td>${c.start_date} ~ ${c.end_date}</td>
                            <td>${(Number(c.commission_rate) * 100).toFixed(2)}%</td>
                            <td><span class="contract-status ${c.status}">${getContractStatusLabel(c.status)}</span></td>
                            <td>
                                <div class="action-btns">
                                    <button class="action-btn view" onclick="previewContract(${c.id})">미리보기</button>
                                    ${c.status === 'draft' ? `<button class="action-btn approve" onclick="quickSendContract(${c.id})">발송</button>` : ''}
                                    ${['draft', 'sent'].includes(c.status) ? `<button class="action-btn delete" onclick="deleteContract(${c.id})">삭제</button>` : ''}
                                    ${['active', 'signed', 'sent'].includes(c.status) ? `<button class="action-btn reject" onclick="terminateContract(${c.id})">해지</button>` : ''}
                                    ${c.status === 'termination_requested' ? `<button class="action-btn approve" onclick="approveTermination(${c.id})">승인</button><button class="action-btn reject" onclick="rejectTermination(${c.id})">반려</button>` : ''}
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) {
        console.error('Load contracts error:', err);
        area.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);">계약 이력을 불러올 수 없습니다.</div>';
    }
}

function showContractForm() {
    document.getElementById('contractFormArea').classList.add('show');
    document.getElementById('contractFormToggleBtn').style.display = 'none';
}

function cancelContractForm() {
    document.getElementById('contractFormArea').classList.remove('show');
    document.getElementById('contractFormToggleBtn').style.display = '';
    document.getElementById('contractAdminNotes').value = '';
    document.getElementById('contractAutoRenewal').checked = true;
    document.getElementById('contractPeriod').value = '12';
}

function updateContractEndDate() {
    const startStr = document.getElementById('contractStartDate').value;
    const months = parseInt(document.getElementById('contractPeriod').value) || 12;

    if (!startStr) return;

    const start = new Date(startStr);
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);
    end.setDate(end.getDate() - 1);

    document.getElementById('contractEndDate').value = end.toISOString().split('T')[0];
}

function generateContractBody(partner, options) {
    const { commissionRate, startDate, endDate, autoRenewal, periodMonths } = options;
    const ratePercent = (Number(commissionRate) * 100).toFixed(2);
    const bankInfo = partner.bank_name && partner.bank_account
        ? `${getBankLabel(partner.bank_name)} ${partner.bank_account}`
        : '(정산 계좌 미등록)';

    return `
<h2>업무 제휴 계약서</h2>
<div class="parties">
    <p><strong>갑 (위탁자):</strong> 주식회사 메디플라톤 (이하 "갑")</p>
    <p><strong>을 (수탁자):</strong> ${escapeHtml(partner.name)}${partner.hospital_name ? ' / ' + escapeHtml(partner.hospital_name) : ''} (이하 "을")</p>
    <p><strong>연락처:</strong> ${escapeHtml(partner.phone)}${partner.email ? ' / ' + escapeHtml(partner.email) : ''}</p>
</div>

<p>갑과 을은 상호 신뢰를 바탕으로 다음과 같이 업무 제휴 계약을 체결한다.</p>

<h3>제1조 (목적)</h3>
<p>본 계약은 갑이 제공하는 PG 결제 서비스 및 대출 중개 서비스의 영업 확대를 위해 을에게 업무를 위탁하고, 이에 따른 권리·의무를 규정함을 목적으로 한다.</p>

<h3>제2조 (을의 업무 범위)</h3>
<p>1. 갑의 서비스에 적합한 가맹점 후보 발굴 및 소개<br>
2. 갑이 제공하는 파트너 대시보드를 통한 고객 정보 등록<br>
3. 고객 초기 안내 및 필요 서류 수집 지원<br>
4. 기타 갑이 서면으로 요청한 영업 관련 업무<br>
5. 을은 갑이 제공하는 가이드라인 및 영업 매뉴얼을 준수하여야 한다.<br>
6. 을은 갑의 사전 서면 동의 없이 본 계약상 업무를 제3자에게 재위탁할 수 없다.<br>
7. 을은 갑이 승인한 자료 및 홍보물만을 사용하여야 한다.</p>

<h3>제3조 (갑의 업무 범위)</h3>
<p>1. 을이 소개한 고객에 대한 심사 및 서비스 제공<br>
2. 을의 영업 활동에 필요한 자료 및 교육 지원<br>
3. 파트너 대시보드를 통한 진행 상태 공유<br>
4. 수수료의 정확한 산정 및 적시 지급<br>
5. 갑은 사업 환경의 변화에 따라 서비스의 범위, 내용 및 조건을 변경할 수 있으며, 이 경우 을에게 사전 통보한다.</p>

<h3>제4조 (수수료)</h3>
<p>1. <strong>수수료율:</strong> 성사된 거래 금액의 <strong>${ratePercent}%</strong><br>
2. <strong>정산 주기:</strong> 매월 말일 마감, 익월 15일 지급<br>
3. <strong>정산 계좌:</strong> ${bankInfo}<br>
4. 수수료는 고객의 서비스가 정상 실행(PG 설치 완료 또는 대출 실행)된 건에 한해 발생한다.<br>
5. 고객의 중도 해지, 미납 등으로 갑에 손해가 발생한 경우, 해당 건의 수수료는 조정될 수 있다.<br>
6. 고객의 차지백(chargeback), 환불, 취소 등이 발생한 경우 해당 건에 대하여 이미 지급된 수수료를 환수할 수 있다.<br>
7. 수수료에 대한 세금(부가가치세, 소득세 등)은 을이 부담하며, 갑은 관련 법령에 따라 원천징수할 수 있다.<br>
8. 갑은 을에 대한 채권(환수금, 손해배상금 등)이 있는 경우 수수료에서 상계할 수 있다.</p>

<h3>제5조 (계약 기간)</h3>
<p>1. <strong>계약 기간:</strong> ${startDate} ~ ${endDate} (${periodMonths}개월)<br>
2. <strong>자동 갱신:</strong> ${autoRenewal ? '본 계약은 만료일 전까지 어느 일방이 서면으로 해지 의사를 통보하지 않는 한, 동일 조건으로 1년간 자동 갱신된다. 다만, 갑은 만료일 30일 전까지, 을은 만료일 60일 전까지 통보하여야 한다.' : '본 계약은 자동 갱신되지 않으며, 갱신 시 별도 합의가 필요하다.'}</p>

<h3>제6조 (비밀유지)</h3>
<p>1. 갑과 을은 본 계약의 이행 과정에서 알게 된 상대방의 영업비밀, 고객정보, 기술정보, 경영정보 등 일체의 비밀정보를 제3자에게 누설하거나 본 계약 이외의 목적으로 사용하지 아니한다.<br>
2. 본 조의 의무는 계약 종료 후 3년간 유효하다.<br>
3. 을이 본 조를 위반하는 경우 갑에게 위반 건당 금 1,000만 원의 위약벌을 지급하며, 이는 손해배상 청구권의 행사에 영향을 미치지 아니한다.<br>
4. 계약 종료 시 을은 갑으로부터 제공받은 일체의 자료(사본 포함)를 반환하거나 폐기하고, 그 사실을 서면으로 확인하여야 한다.</p>

<h3>제7조 (금지 행위)</h3>
<p>을은 다음 각 호의 행위를 하여서는 아니 된다:<br>
1. 갑의 서비스에 대한 허위 또는 과장 안내<br>
2. 고객 정보의 허위 등록 또는 위·변조<br>
3. 고객에게 별도의 수수료, 사례금 등을 요구하는 행위<br>
4. 갑의 사전 동의 없이 갑의 상호, 로고 등을 사용하는 행위<br>
5. 갑의 서비스와 경쟁하는 타사 서비스를 갑의 고객에게 홍보·권유하는 행위<br>
6. 갑을 통하지 아니하고 갑의 고객에게 직접 영업하거나 계약을 체결하는 행위<br>
7. 갑, 갑의 서비스, 갑의 임직원 또는 다른 파트너를 비방하는 행위<br>
8. 기타 갑의 신뢰와 명예를 훼손하는 행위</p>

<h3>제8조 (지식재산권)</h3>
<p>1. 본 계약의 이행과 관련하여 발생하는 모든 지식재산권(상표, 저작권, 노하우 등)은 갑에게 귀속된다.<br>
2. 을이 본 계약 수행 과정에서 수집·생성한 고객 데이터 및 영업 자료에 대한 소유권은 갑에게 귀속된다.<br>
3. 을은 갑의 지식재산(상표, 로고, 시스템, 콘텐츠 등)을 본 계약의 목적 범위 내에서만 사용할 수 있으며, 계약 종료 시 즉시 사용을 중단하여야 한다.</p>

<h3>제9조 (경업금지 및 고객유인금지)</h3>
<p>1. 을은 본 계약 기간 중 및 계약 종료 후 1년간, 갑의 사전 서면 동의 없이 갑의 서비스와 실질적으로 동일하거나 유사한 서비스에 관한 영업활동을 합리적 범위 내에서 제한받는다.<br>
2. 을은 본 계약 기간 중 및 계약 종료 후 1년간, 갑의 기존 고객을 갑의 경쟁 서비스로 유인하거나 이탈을 권유하여서는 아니 된다.<br>
3. 본 조 제1항의 제한은 을이 본 계약 체결 이전부터 영위하고 있던 기존 사업에는 적용되지 아니한다.</p>

<h3>제10조 (수수료 조정)</h3>
<p>1. 갑은 시장 환경, 경영 여건 등을 고려하여 수수료율을 조정할 수 있다.<br>
2. 갑이 수수료율을 조정하는 경우, 변경일로부터 30일 전까지 을에게 서면(이메일 또는 파트너 대시보드 알림 포함)으로 통보하여야 한다.<br>
3. 을은 변경된 수수료율에 이의가 있는 경우, 통보일로부터 14일 이내에 서면으로 이의를 제기할 수 있다.<br>
4. 을이 변경된 수수료율에 동의하지 않는 경우, 변경 적용일까지 서면 통보로 본 계약을 해지할 수 있으며, 이 경우 해지일까지의 수수료는 변경 전 수수료율을 적용한다.</p>

<h3>제11조 (개인정보보호)</h3>
<p>1. 을은 본 계약의 이행 과정에서 취득한 개인정보를 「개인정보 보호법」 등 관련 법령에 따라 적법하게 처리하여야 한다.<br>
2. 을은 개인정보의 유출, 도난, 분실 등의 사고가 발생한 경우 즉시 갑에게 통보하고 필요한 조치를 취하여야 한다.<br>
3. 계약 종료 시 을은 본 계약의 이행 과정에서 수집한 개인정보를 지체 없이 파기하고, 그 사실을 갑에게 서면으로 통보하여야 한다.</p>

<h3>제12조 (법령 준수)</h3>
<p>1. 을은 본 계약의 이행과 관련하여 「여신전문금융업법」, 「전자금융거래법」, 「대부업 등의 등록 및 금융이용자 보호에 관한 법률」 등 관련 법령을 준수하여야 한다.<br>
2. 을은 관련 법령의 변경으로 인하여 본 계약의 이행에 영향이 있는 경우 즉시 갑에게 통보하여야 한다.</p>

<h3>제13조 (손해배상)</h3>
<p>1. 갑 또는 을이 본 계약을 위반하여 상대방에게 손해를 입힌 경우, 직접 손해 및 간접 손해를 포함하여 그 손해를 배상할 책임을 진다.<br>
2. 갑의 을에 대한 손해배상 총액은 손해 발생일 이전 12개월간 을에게 지급한 수수료 총액을 상한으로 한다.<br>
3. 을의 고의 또는 중과실로 인한 손해배상에는 상한을 두지 아니한다.</p>

<h3>제14조 (면책 및 보증면제)</h3>
<p>1. 을의 귀책사유로 고객 또는 제3자에게 손해가 발생한 경우, 을이 독립적으로 그 책임을 부담하며, 갑은 이에 대하여 면책된다.<br>
2. 갑은 을의 영업활동을 통한 특정 수준의 수익이나 실적을 보증하지 아니한다.<br>
3. 갑의 시스템 장애, 정기 점검, 업데이트 등으로 인한 서비스 일시 중단에 대하여 갑은 을에 대한 손해배상 책임을 부담하지 아니한다. 다만, 갑의 고의 또는 중과실에 의한 경우는 그러하지 아니한다.</p>

<h3>제15조 (불가항력)</h3>
<p>1. 천재지변, 전쟁, 테러, 감염병 대유행, 정부의 규제 변경 등 당사자의 합리적 통제를 벗어난 사유(이하 "불가항력 사유")로 인하여 본 계약상 의무를 이행할 수 없는 경우, 그 이행 불능 기간 동안 해당 의무의 불이행에 대한 책임을 면한다.<br>
2. 불가항력 사유가 3개월 이상 계속되는 경우, 어느 일방은 서면 통보로 본 계약을 해지할 수 있다.<br>
3. 불가항력 사유로 인한 면제 기간 동안에는 수수료가 발생하지 아니한다.</p>

<h3>제16조 (계약 해지)</h3>
<p>1. 갑은 을에게 30일 전 서면 통보로, 을은 갑에게 60일 전 서면 통보로 본 계약을 해지할 수 있다.<br>
2. 다음 각 호에 해당하는 경우 갑은 별도 통보 없이 즉시 계약을 해지할 수 있다:<br>
&nbsp;&nbsp;가. 을이 제7조의 금지 행위를 한 경우<br>
&nbsp;&nbsp;나. 을이 제9조의 경업금지 또는 고객유인금지 의무를 위반한 경우<br>
&nbsp;&nbsp;다. 을이 파산, 회생절차 개시, 영업정지 등 정상적 영업이 불가능한 경우<br>
&nbsp;&nbsp;라. 을이 연속 3개월 이상 실적(고객 소개)이 없는 경우<br>
&nbsp;&nbsp;마. 을이 본 계약의 중대한 조항을 위반하고, 갑의 시정 요구에도 불구하고 14일 이내에 시정하지 아니한 경우<br>
3. 해지 시 이미 성사된 거래에 대한 수수료는 정상 지급한다. 다만, 갑은 을에 대한 채권이 확정될 때까지 수수료 지급을 보류할 수 있다.</p>

<h3>제17조 (계약 해지 후 의무)</h3>
<p>1. 계약 종료 시 을은 갑으로부터 제공받은 일체의 자료, 시스템 접근 권한, 홍보물 등을 즉시 반환 또는 폐기하여야 한다.<br>
2. 계약 종료 시점에 진행 중인 미완료 건(접수된 고객 건)에 대하여는 갑이 인수하며, 해당 건이 성사된 경우 수수료를 정상 지급한다.<br>
3. 을은 계약 종료 후 7일 이내에 상기 의무의 이행을 확인하는 서면 확인서를 갑에게 제출하여야 한다.</p>

<h3>제18조 (양도 금지)</h3>
<p>1. 을은 갑의 사전 서면 동의 없이 본 계약상 권리·의무의 전부 또는 일부를 제3자에게 양도하거나 담보로 제공할 수 없다.<br>
2. 갑은 갑의 관계회사(모회사, 자회사, 계열사)에 본 계약상 권리·의무를 양도할 수 있다.</p>

<h3>제19조 (독립 당사자 관계)</h3>
<p>을은 갑의 직원, 대리인이 아닌 독립된 사업자이며, 을의 영업 활동에 따른 비용, 세금, 보험 등 일체의 비용은 을이 부담한다.</p>

<h3>제20조 (통지)</h3>
<p>1. 본 계약에 따른 통지는 이메일 또는 파트너 대시보드 알림을 통하여 할 수 있으며, 이메일 발송 또는 대시보드 알림 게시 시 상대방에게 도달한 것으로 간주한다.<br>
2. 각 당사자는 연락처(이메일, 전화번호, 주소)가 변경된 경우 변경일로부터 7일 이내에 상대방에게 통보하여야 하며, 통보하지 아니한 경우 기존 연락처로의 통지는 유효한 것으로 본다.</p>

<h3>제21조 (준거법 및 관할)</h3>
<p>1. 본 계약은 대한민국 법률에 의하여 해석되고 적용된다.<br>
2. 본 계약과 관련하여 발생하는 분쟁은 서울중앙지방법원을 제1심 전속 관할법원으로 한다.</p>

<h3>제22조 (기타)</h3>
<p>1. 본 계약에 명시되지 아니한 사항은 갑과 을이 상호 협의하여 결정한다.<br>
2. 본 계약의 수정 또는 변경은 양 당사자의 서면 합의에 의해서만 효력을 갖는다.<br>
3. 본 계약의 일부 조항이 무효이거나 이행 불능인 경우에도 나머지 조항의 효력에는 영향을 미치지 아니한다.</p>

<div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 13px;">
    <p>본 계약의 체결을 증명하기 위해 본 계약서를 작성한다.</p>
    <p style="margin-top: 16px;">${startDate}</p>
</div>
`;
}

function getBankLabel(code) {
    const labels = { kb: 'KB국민', shinhan: '신한', woori: '우리', hana: '하나', nh: 'NH농협', ibk: 'IBK기업', kakao: '카카오뱅크', toss: '토스뱅크', other: '기타' };
    return labels[code] || code || '';
}

async function createContract() {
    if (!currentContractPartnerId) return;

    const rate = Number(document.getElementById('contractRate').value) / 100;
    const periodMonths = parseInt(document.getElementById('contractPeriod').value);
    const startDate = document.getElementById('contractStartDate').value;
    const endDate = document.getElementById('contractEndDate').value;
    const autoRenewal = document.getElementById('contractAutoRenewal').checked;
    const adminNotes = document.getElementById('contractAdminNotes').value.trim() || null;

    if (!startDate || !endDate) {
        showToast('시작일을 입력하세요.', 'error');
        return;
    }
    if (rate <= 0 || rate > 1) {
        showToast('수수료율을 올바르게 입력하세요. (0~100%)', 'error');
        return;
    }

    try {
        // 계약번호 채번
        const { data: numData, error: numError } = await sb.rpc('generate_contract_number');
        if (numError) throw numError;
        const contractNumber = numData;

        // 파트너 정보 조회
        const { data: partner } = await sb.from('partners').select('*').eq('id', currentContractPartnerId).single();
        if (!partner) throw new Error('파트너 정보를 찾을 수 없습니다.');

        // 계약서 본문 생성
        const contractBody = generateContractBody(partner, {
            commissionRate: rate,
            startDate,
            endDate,
            autoRenewal,
            periodMonths
        });

        // DB 삽입
        const { data: contract, error: insertError } = await sb.from('partner_contracts').insert({
            contract_number: contractNumber,
            partner_id: currentContractPartnerId,
            commission_rate: rate,
            contract_period_months: periodMonths,
            start_date: startDate,
            end_date: endDate,
            auto_renewal: autoRenewal,
            contract_body: contractBody,
            status: 'draft',
            admin_notes: adminNotes,
            created_by: currentUser.id
        }).select().single();

        if (insertError) throw insertError;

        // 상태 로그 기록
        await sb.from('contract_status_logs').insert({
            contract_id: contract.id,
            from_status: null,
            to_status: 'draft',
            changed_by: currentUser.id,
            notes: '계약서 신규 생성'
        });

        showToast(`계약서 ${contractNumber}이(가) 생성되었습니다.`, 'success');
        cancelContractForm();
        loadContracts(currentContractPartnerId);
    } catch (err) {
        console.error('Create contract error:', err);
        showToast('계약서 생성 실패: ' + err.message, 'error');
    }
}

async function autoCreateDraftContract(partnerId, options = {}) {
    try {
        // 기존 활성 계약(draft/sent/signed/active) 존재 시 중복 생성 방지
        const { data: existing, error: checkError } = await sb
            .from('partner_contracts')
            .select('id, status')
            .eq('partner_id', partnerId)
            .in('status', ['draft', 'sent', 'signed', 'active']);

        if (checkError) throw checkError;
        if (existing && existing.length > 0) {
            console.log('이미 활성 계약이 존재하여 자동 생성을 건너뜁니다:', existing);
            return null;
        }

        // 파트너 정보 조회
        const { data: partner } = await sb.from('partners').select('*').eq('id', partnerId).single();
        if (!partner) throw new Error('파트너 정보를 찾을 수 없습니다.');

        // 관리자 지정 값 > 파트너 저장 값 > 기본값
        const defaultRate = partner.commission_rate ? Number(partner.commission_rate) : 0.015;
        const actualRate = options.rate || defaultRate;
        const periodMonths = options.periodMonths || 12;
        const today = new Date();
        const startDate = options.startDate || today.toISOString().split('T')[0];
        const endDate = (() => {
            const start = new Date(startDate);
            const end = new Date(start);
            end.setMonth(end.getMonth() + periodMonths);
            end.setDate(end.getDate() - 1);
            return end.toISOString().split('T')[0];
        })();
        const autoRenewal = options.autoRenewal !== undefined ? options.autoRenewal : true;

        // 계약번호 채번
        const { data: numData, error: numError } = await sb.rpc('generate_contract_number');
        if (numError) throw numError;

        // 계약서 본문 생성
        const contractBody = generateContractBody(partner, {
            commissionRate: actualRate,
            startDate,
            endDate,
            autoRenewal,
            periodMonths
        });

        // DB 삽입
        const { data: contract, error: insertError } = await sb.from('partner_contracts').insert({
            contract_number: numData,
            partner_id: partnerId,
            commission_rate: actualRate,
            contract_period_months: periodMonths,
            start_date: startDate,
            end_date: endDate,
            auto_renewal: autoRenewal,
            contract_body: contractBody,
            status: 'draft',
            admin_notes: '파트너 승인 시 자동 생성',
            created_by: currentUser.id
        }).select().single();

        if (insertError) throw insertError;

        // 상태 로그 기록
        await sb.from('contract_status_logs').insert({
            contract_id: contract.id,
            from_status: null,
            to_status: 'draft',
            changed_by: currentUser.id,
            notes: '파트너 승인에 따른 계약서 자동 생성'
        });

        return contract;
    } catch (err) {
        console.error('Auto create draft contract error:', err);
        return null;
    }
}

async function quickSendContractSilent(contractId) {
    try {
        const { data: contract, error: fetchError } = await sb
            .from('partner_contracts')
            .select('*, partners(user_id, name)')
            .eq('id', contractId)
            .single();

        if (fetchError) throw fetchError;
        if (contract.status !== 'draft') return;

        const { error: updateError } = await sb
            .from('partner_contracts')
            .update({ status: 'sent' })
            .eq('id', contractId);

        if (updateError) throw updateError;

        await sb.from('contract_status_logs').insert({
            contract_id: contractId,
            from_status: 'draft',
            to_status: 'sent',
            changed_by: currentUser.id,
            notes: '승인 시 자동 발송'
        });

        if (contract.partners?.user_id) {
            await sb.rpc('create_notification', {
                p_user_id: contract.partners.user_id,
                p_type: 'contract_sent',
                p_title: '계약서 발송',
                p_message: `계약서(${contract.contract_number})가 발송되었습니다. 파트너 대시보드에서 확인 및 서명해주세요.`
            });
        }
    } catch (err) {
        console.error('Silent send contract error:', err);
    }
}

async function quickSendContract(contractId) {
    if (!confirm('이 계약서를 파트너에게 발송하시겠습니까?')) return;

    try {
        // 현재 계약 정보 조회
        const { data: contract, error: fetchError } = await sb
            .from('partner_contracts')
            .select('*, partners(user_id, name)')
            .eq('id', contractId)
            .single();

        if (fetchError) throw fetchError;
        if (contract.status !== 'draft') {
            showToast('작성중 상태의 계약서만 발송할 수 있습니다.', 'error');
            return;
        }

        // 상태 변경: draft → sent
        const { error: updateError } = await sb
            .from('partner_contracts')
            .update({ status: 'sent' })
            .eq('id', contractId);

        if (updateError) throw updateError;

        // 상태 로그 기록
        await sb.from('contract_status_logs').insert({
            contract_id: contractId,
            from_status: 'draft',
            to_status: 'sent',
            changed_by: currentUser.id,
            notes: '빠른 발송'
        });

        // 파트너에게 알림 발송
        if (contract.partners?.user_id) {
            await sb.rpc('create_notification', {
                p_user_id: contract.partners.user_id,
                p_type: 'contract_sent',
                p_title: '계약서 발송',
                p_message: `계약서(${contract.contract_number})가 발송되었습니다. 파트너 대시보드에서 확인 및 서명해주세요.`
            });
        }

        showToast('계약서가 발송되었습니다.', 'success');
        if (currentContractPartnerId) loadContracts(currentContractPartnerId);
    } catch (err) {
        console.error('Quick send contract error:', err);
        showToast('발송 실패: ' + err.message, 'error');
    }
}

async function previewContract(contractId) {
    currentContractId = contractId;

    try {
        const { data, error } = await sb.from('partner_contracts').select('*').eq('id', contractId).single();
        if (error) throw error;

        document.getElementById('contractPreviewTitle').textContent = `계약서 미리보기 — ${data.contract_number}`;
        let bodyHtml = data.contract_body || '<p style="color:var(--gray-500);">계약서 본문이 없습니다.</p>';

        // 서명 정보가 있으면 하단에 표시
        if (data.signer_name && data.signed_at) {
            const signedDate = new Date(data.signed_at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            bodyHtml += `
<div class="signature-display" style="margin-top:24px;padding:20px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
<p style="font-size:13px;font-weight:600;color:var(--gray-700);margin-bottom:12px;">서명 정보</p>
<p style="margin-bottom:8px;">서명자: <strong>${escapeHtml(data.signer_name)}</strong></p>
${data.signature_data ? `<div style="margin:12px 0;padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;display:inline-block;"><img src="${data.signature_data}" alt="서명" style="max-height:80px;max-width:300px;"></div>` : ''}
<p style="font-size:13px;color:var(--gray-500);">서명일시: ${signedDate}</p>
</div>`;
        }

        // 해지 신청 정보 표시
        if (data.status === 'termination_requested') {
            const reqDate = data.termination_requested_at
                ? new Date(data.termination_requested_at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                : '-';
            bodyHtml += `
<div style="margin-top:24px;padding:20px;background:#FFF7ED;border-radius:8px;border:1px solid #FB923C;">
<p style="font-size:14px;font-weight:700;color:#C2410C;margin-bottom:12px;">해지 신청 정보</p>
<p style="margin-bottom:8px;font-size:13px;"><strong>신청일:</strong> ${reqDate}</p>
<p style="margin-bottom:8px;font-size:13px;"><strong>사유:</strong> ${escapeHtml(data.termination_requested_reason || '-')}</p>
<p style="font-size:13px;"><strong>법적 고지 확인:</strong> ${data.termination_legal_acknowledged ? '확인 완료' : '미확인'}</p>
</div>`;
        }

        document.getElementById('contractPreviewBody').innerHTML = bodyHtml;

        // 상태 select 설정
        const statusSelect = document.getElementById('contractStatusSelect');
        const allowed = CONTRACT_TRANSITIONS[data.status] || [];

        statusSelect.innerHTML = `<option value="${data.status}">${getContractStatusLabel(data.status)} (현재)</option>`;
        allowed.forEach(s => {
            statusSelect.innerHTML += `<option value="${s}">${getContractStatusLabel(s)}</option>`;
        });
        statusSelect.value = data.status;

        document.getElementById('contractPreviewModal').classList.add('active');
    } catch (err) {
        console.error('Preview contract error:', err);
        showToast('계약서를 불러올 수 없습니다.', 'error');
    }
}

async function updateContractStatus() {
    if (!currentContractId) return;

    const newStatus = document.getElementById('contractStatusSelect').value;

    try {
        // 현재 계약 상태 확인
        const { data: contract, error: fetchError } = await sb.from('partner_contracts').select('status').eq('id', currentContractId).single();
        if (fetchError) throw fetchError;

        const currentStatus = contract.status;
        if (currentStatus === newStatus) {
            showToast('상태가 동일합니다.', 'error');
            return;
        }

        // 전이 유효성 검사
        const allowed = CONTRACT_TRANSITIONS[currentStatus] || [];
        if (!allowed.includes(newStatus)) {
            showToast(`${getContractStatusLabel(currentStatus)} → ${getContractStatusLabel(newStatus)} 전환은 허용되지 않습니다.`, 'error');
            return;
        }

        const updateData = { status: newStatus };
        if (newStatus === 'terminated') {
            updateData.terminated_at = new Date().toISOString();
            updateData.terminated_by = currentUser.id;
        }

        const { error: updateError } = await sb.from('partner_contracts').update(updateData).eq('id', currentContractId);
        if (updateError) throw updateError;

        // 상태 로그 기록
        await sb.from('contract_status_logs').insert({
            contract_id: currentContractId,
            from_status: currentStatus,
            to_status: newStatus,
            changed_by: currentUser.id
        });

        // 발송 상태로 변경 시 파트너에게 알림
        if (newStatus === 'sent') {
            const { data: contractFull } = await sb
                .from('partner_contracts')
                .select('contract_number, partners(user_id, name)')
                .eq('id', currentContractId)
                .single();

            if (contractFull?.partners?.user_id) {
                await sb.rpc('create_notification', {
                    p_user_id: contractFull.partners.user_id,
                    p_type: 'contract_sent',
                    p_title: '계약서 발송',
                    p_message: `계약서(${contractFull.contract_number})가 발송되었습니다. 파트너 대시보드에서 확인 및 서명해주세요.`
                });
            }
        }

        showToast(`상태가 ${getContractStatusLabel(newStatus)}(으)로 변경되었습니다.`, 'success');
        document.getElementById('contractPreviewModal').classList.remove('active');
        if (currentContractPartnerId) loadContracts(currentContractPartnerId);
    } catch (err) {
        console.error('Update contract status error:', err);
        showToast('상태 변경 실패: ' + err.message, 'error');
    }
}

async function deleteContract(contractId) {
    if (!confirm('이 계약서를 삭제하시겠습니까?')) return;

    try {
        // draft/sent 상태만 삭제 가능
        const { data: contract } = await sb.from('partner_contracts').select('status').eq('id', contractId).single();
        if (!['draft', 'sent'].includes(contract?.status)) {
            showToast('작성중 또는 발송 상태의 계약만 삭제할 수 있습니다.', 'error');
            return;
        }

        const { error } = await sb.from('partner_contracts').delete().eq('id', contractId);
        if (error) throw error;

        showToast('계약서가 삭제되었습니다.', 'success');
        if (currentContractPartnerId) loadContracts(currentContractPartnerId);
    } catch (err) {
        console.error('Delete contract error:', err);
        showToast('삭제 실패: ' + err.message, 'error');
    }
}

async function terminateContract(contractId) {
    const reason = prompt('해지 사유를 입력하세요:');
    if (reason === null) return;
    if (!reason.trim()) {
        showToast('해지 사유를 입력하세요.', 'error');
        return;
    }

    try {
        const { data: contract } = await sb.from('partner_contracts').select('status').eq('id', contractId).single();
        if (!contract || contract.status === 'terminated' || contract.status === 'termination_requested') {
            showToast(contract?.status === 'termination_requested' ? '파트너가 해지 신청한 계약입니다. 승인/반려로 처리해주세요.' : '이미 해지된 계약입니다.', 'error');
            return;
        }

        const fromStatus = contract.status;

        const { error } = await sb.from('partner_contracts').update({
            status: 'terminated',
            terminated_at: new Date().toISOString(),
            terminated_by: currentUser.id,
            termination_reason: reason.trim()
        }).eq('id', contractId);

        if (error) throw error;

        await sb.from('contract_status_logs').insert({
            contract_id: contractId,
            from_status: fromStatus,
            to_status: 'terminated',
            changed_by: currentUser.id,
            notes: '해지 사유: ' + reason.trim()
        });

        showToast('계약이 해지되었습니다.', 'success');
        if (currentContractPartnerId) loadContracts(currentContractPartnerId);
    } catch (err) {
        console.error('Terminate contract error:', err);
        showToast('해지 실패: ' + err.message, 'error');
    }
}

async function approveTermination(contractId) {
    if (!confirm('해지 신청을 승인하시겠습니까? 계약이 최종 해지됩니다.')) return;

    try {
        const { data: contract, error: fetchErr } = await sb
            .from('partner_contracts')
            .select('status, partner_id, contract_number, termination_requested_reason')
            .eq('id', contractId)
            .single();
        if (fetchErr) throw fetchErr;

        if (contract.status !== 'termination_requested') {
            showToast('해지 신청 상태가 아닙니다.', 'error');
            return;
        }

        const { error: updateErr } = await sb
            .from('partner_contracts')
            .update({
                status: 'terminated',
                terminated_at: new Date().toISOString(),
                terminated_by: currentUser.id,
                termination_reason: contract.termination_requested_reason
            })
            .eq('id', contractId);
        if (updateErr) throw updateErr;

        await sb.from('contract_status_logs').insert({
            contract_id: contractId,
            from_status: 'termination_requested',
            to_status: 'terminated',
            changed_by: currentUser.id,
            notes: '관리자 해지 승인'
        });

        // 파트너에게 알림
        const { data: partner } = await sb
            .from('partners')
            .select('user_id')
            .eq('id', contract.partner_id)
            .single();

        if (partner?.user_id) {
            await sb.rpc('create_notification', {
                p_user_id: partner.user_id,
                p_type: 'termination_approved',
                p_title: '계약 해지 승인',
                p_message: `계약서(${contract.contract_number})의 해지가 승인되었습니다. 제17조에 따른 해지 후 의무를 이행해주세요.`
            });
        }

        showToast('해지가 승인되었습니다.', 'success');
        if (currentContractPartnerId) loadContracts(currentContractPartnerId);
    } catch (err) {
        console.error('Approve termination error:', err);
        showToast('승인 실패: ' + err.message, 'error');
    }
}

async function rejectTermination(contractId) {
    const reason = prompt('반려 사유를 입력하세요:');
    if (reason === null) return;
    if (!reason.trim()) {
        showToast('반려 사유를 입력하세요.', 'error');
        return;
    }

    try {
        const { data: contract, error: fetchErr } = await sb
            .from('partner_contracts')
            .select('status, partner_id, contract_number')
            .eq('id', contractId)
            .single();
        if (fetchErr) throw fetchErr;

        if (contract.status !== 'termination_requested') {
            showToast('해지 신청 상태가 아닙니다.', 'error');
            return;
        }

        // 원래 상태 조회 (contract_status_logs에서 from_status)
        const { data: logs } = await sb
            .from('contract_status_logs')
            .select('from_status')
            .eq('contract_id', contractId)
            .eq('to_status', 'termination_requested')
            .order('created_at', { ascending: false })
            .limit(1);

        const restoreStatus = logs && logs.length > 0 ? logs[0].from_status : 'signed';

        const { error: updateErr } = await sb
            .from('partner_contracts')
            .update({
                status: restoreStatus,
                termination_requested_at: null,
                termination_requested_reason: null,
                termination_legal_acknowledged: false
            })
            .eq('id', contractId);
        if (updateErr) throw updateErr;

        await sb.from('contract_status_logs').insert({
            contract_id: contractId,
            from_status: 'termination_requested',
            to_status: restoreStatus,
            changed_by: currentUser.id,
            notes: '해지 반려: ' + reason.trim()
        });

        // 파트너에게 알림
        const { data: partner } = await sb
            .from('partners')
            .select('user_id')
            .eq('id', contract.partner_id)
            .single();

        if (partner?.user_id) {
            await sb.rpc('create_notification', {
                p_user_id: partner.user_id,
                p_type: 'termination_rejected',
                p_title: '계약 해지 반려',
                p_message: `계약서(${contract.contract_number})의 해지 신청이 반려되었습니다. 사유: ${reason.trim()}`
            });
        }

        showToast('해지 신청이 반려되었습니다.', 'success');
        if (currentContractPartnerId) loadContracts(currentContractPartnerId);
    } catch (err) {
        console.error('Reject termination error:', err);
        showToast('반려 실패: ' + err.message, 'error');
    }
}

async function loadPartnerRecentContracts(partnerId) {
    const area = document.getElementById('partnerContractsArea');
    if (!area) return;

    try {
        const { data, error } = await sb
            .from('partner_contracts')
            .select('contract_number, start_date, end_date, commission_rate, status')
            .eq('partner_id', partnerId)
            .order('created_at', { ascending: false })
            .limit(3);

        if (error) throw error;

        if (!data || data.length === 0) {
            area.innerHTML = `
                <div class="detail-row">
                    <span class="detail-label">최근 계약</span>
                    <span class="detail-value" style="color:var(--gray-500);">계약 이력 없음</span>
                </div>
                <div style="margin-top:8px;">
                    <button class="btn btn-outline btn-sm" onclick="closeModal(); openContractManager(${partnerId});">계약 관리</button>
                </div>
            `;
            return;
        }

        let html = '<div style="font-size:13px;font-weight:600;color:var(--gray-500);margin-bottom:8px;">최근 계약</div>';
        html += data.map(c => `
            <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13px;">
                <span style="font-weight:600;">${escapeHtml(c.contract_number)}</span>
                <span>${c.start_date} ~ ${c.end_date}</span>
                <span>${(Number(c.commission_rate) * 100).toFixed(2)}%</span>
                <span class="contract-status ${c.status}">${getContractStatusLabel(c.status)}</span>
            </div>
        `).join('');
        html += `<div style="margin-top:8px;">
            <button class="btn btn-outline btn-sm" onclick="closeModal(); openContractManager(${partnerId});">전체 계약 관리</button>
        </div>`;

        area.innerHTML = html;
    } catch (err) {
        console.error('Load recent contracts error:', err);
        area.innerHTML = '';
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// ─── New Clinic Openings (신규 개원) ───

let csvClinicData = [];

async function loadAdminNewClinics() {
    const loading = document.getElementById('ncLoading');
    const table = document.getElementById('ncTable');
    const empty = document.getElementById('ncEmpty');
    const tbody = document.getElementById('ncTableBody');

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    // 마지막 동기화 시간 표시
    try {
        const { data: logData } = await sb
            .from('hira_sync_logs')
            .select('sync_type, inserted_count, created_at')
            .order('created_at', { ascending: false })
            .limit(1);
        const syncEl = document.getElementById('lastSyncTime');
        if (logData && logData.length > 0) {
            const log = logData[0];
            const dt = new Date(log.created_at);
            const typeLabel = log.sync_type === 'auto' ? '자동' : '수동';
            syncEl.textContent = `마지막 동기화: ${dt.toLocaleString('ko-KR')} (${typeLabel}, ${log.inserted_count}건)`;
        } else {
            syncEl.textContent = '';
        }
    } catch (e) {
        console.warn('sync log load failed:', e);
    }

    try {
        const regionFilter = document.getElementById('ncRegionFilter').value;
        const specialtyFilter = document.getElementById('ncSpecialtyFilter').value;
        const claimFilter = document.getElementById('ncClaimFilter').value;
        const search = document.getElementById('ncSearch').value.trim();

        let query = sb
            .from('new_clinic_openings')
            .select('*, partners:claimed_by(name, hospital_name)')
            .order('opening_date', { ascending: false });

        if (regionFilter) query = query.eq('region', regionFilter);
        if (specialtyFilter) query = query.eq('specialty', specialtyFilter);
        if (claimFilter) query = query.eq('claim_status', claimFilter);
        if (search) query = query.or(`clinic_name.ilike.%${search}%,address.ilike.%${search}%`);

        let { data, error } = await query;

        // new_clinic_openings 테이블이 없으면 빈 상태로 표시
        if (error && (error.code === '404' || error.code === 'PGRST204' || error.message?.includes('relation') || error.code === '42P01')) {
            console.warn('new_clinic_openings table not found. Run supabase-migration-new-clinics.sql to create it.');
            loading.style.display = 'none';
            empty.style.display = 'block';
            empty.querySelector('h3').textContent = '신규 개원 테이블이 아직 생성되지 않았습니다.';
            return;
        }
        if (error) throw error;

        loading.style.display = 'none';

        if (!data || data.length === 0) {
            empty.style.display = 'block';
            return;
        }

        table.style.display = 'table';
        tbody.innerHTML = data.map(row => {
            const claimBadge = getClaimBadge(row.claim_status);
            const partnerName = row.partners ? escapeHtml(row.partners.name) : '-';
            const sourceBadge = row.data_source === 'hira_api'
                ? '<span style="color:var(--primary);font-size:12px;">API</span>'
                : row.data_source === 'csv_upload'
                    ? '<span style="color:var(--warning);font-size:12px;">CSV</span>'
                    : '<span style="color:var(--gray-500);font-size:12px;">수동</span>';
            return `
                <tr>
                    <td><strong>${escapeHtml(row.clinic_name)}</strong></td>
                    <td>${escapeHtml(row.representative_name || '-')}</td>
                    <td>${escapeHtml(row.specialty || '-')}</td>
                    <td>${getRegionLabel(row.region)}</td>
                    <td>${row.opening_date || '-'}</td>
                    <td>${claimBadge}</td>
                    <td>${partnerName}</td>
                    <td>${sourceBadge}</td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn view" onclick="viewClinicAdmin(${row.id})">상세</button>
                            <button class="action-btn edit" onclick="openNewClinicForm(${row.id})">수정</button>
                            <button class="action-btn delete" onclick="deleteClinic(${row.id})">삭제</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Load new clinics error:', error);
        loading.style.display = 'none';
        showToast('신규 개원 데이터를 불러오는데 실패했습니다.', 'error');
    }
}

function getClaimBadge(status) {
    const badges = {
        'unclaimed': '<span class="status-badge" style="background:#E8EDFF;color:var(--primary);">미선점</span>',
        'claimed': '<span class="status-badge" style="background:#DBEAFE;color:#1D4ED8;">선점됨</span>',
        'contacted': '<span class="status-badge" style="background:#EDE9FE;color:#7C3AED;">컨택완료</span>',
        'converted': '<span class="status-badge" style="background:#FEF3C7;color:#D97706;">고객전환</span>'
    };
    return badges[status] || status;
}

async function openNewClinicForm(editId) {
    const modal = document.getElementById('newClinicModal');
    const form = document.getElementById('newClinicForm');
    form.reset();
    document.getElementById('ncEditId').value = '';

    if (editId) {
        document.getElementById('newClinicModalTitle').textContent = '신규 개원 수정';
        const { data, error } = await sb.from('new_clinic_openings').select('*').eq('id', editId).single();
        if (error) { showToast('데이터를 불러올 수 없습니다.', 'error'); return; }

        document.getElementById('ncEditId').value = editId;
        document.getElementById('ncClinicName').value = data.clinic_name || '';
        document.getElementById('ncRepName').value = data.representative_name || '';
        document.getElementById('ncSpecialty').value = data.specialty || '';
        document.getElementById('ncAddress').value = data.address || '';
        document.getElementById('ncRegion').value = data.region || '';
        document.getElementById('ncOpeningDate').value = data.opening_date || '';
        document.getElementById('ncPhone').value = data.phone || '';
        document.getElementById('ncHiraCode').value = data.hira_ykiho || '';
        document.getElementById('ncAdminNotes').value = data.admin_notes || '';
    } else {
        document.getElementById('newClinicModalTitle').textContent = '신규 개원 등록';
    }

    modal.classList.add('active');
}

async function handleNewClinicSubmit(e) {
    e.preventDefault();

    const editId = document.getElementById('ncEditId').value;
    const record = {
        clinic_name: document.getElementById('ncClinicName').value.trim(),
        representative_name: document.getElementById('ncRepName').value.trim() || null,
        specialty: document.getElementById('ncSpecialty').value.trim() || null,
        address: document.getElementById('ncAddress').value.trim() || null,
        region: document.getElementById('ncRegion').value || null,
        opening_date: document.getElementById('ncOpeningDate').value || null,
        phone: document.getElementById('ncPhone').value.trim() || null,
        hira_ykiho: document.getElementById('ncHiraCode').value.trim() || null,
        admin_notes: document.getElementById('ncAdminNotes').value.trim() || null,
        data_source: 'manual'
    };

    if (!record.clinic_name) {
        showToast('의료기관명을 입력하세요.', 'error');
        return;
    }

    try {
        if (editId) {
            const { error } = await sb.from('new_clinic_openings').update(record).eq('id', editId);
            if (error) throw error;
            showToast('수정되었습니다.', 'success');
        } else {
            const { error } = await sb.from('new_clinic_openings').insert(record);
            if (error) throw error;
            showToast('등록되었습니다.', 'success');
        }

        document.getElementById('newClinicModal').classList.remove('active');
        loadAdminNewClinics();
    } catch (error) {
        showToast('저장 실패: ' + error.message, 'error');
    }
}

async function deleteClinic(id) {
    if (!confirm('이 신규 개원 정보를 삭제하시겠습니까?')) return;

    try {
        const { error } = await sb.from('new_clinic_openings').delete().eq('id', id);
        if (error) throw error;
        showToast('삭제되었습니다.', 'success');
        loadAdminNewClinics();
    } catch (error) {
        showToast('삭제 실패: ' + error.message, 'error');
    }
}

async function viewClinicAdmin(id) {
    const { data, error } = await sb
        .from('new_clinic_openings')
        .select('*, partners:claimed_by(name, hospital_name)')
        .eq('id', id)
        .single();

    if (error) { showToast('데이터를 불러올 수 없습니다.', 'error'); return; }

    const body = document.getElementById('clinicDetailBody');
    body.innerHTML = `
        <div class="detail-row"><span class="detail-label">의료기관명</span><span class="detail-value"><strong>${escapeHtml(data.clinic_name)}</strong></span></div>
        <div class="detail-row"><span class="detail-label">대표자명</span><span class="detail-value">${escapeHtml(data.representative_name || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">진료과목</span><span class="detail-value">${escapeHtml(data.specialty || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">주소</span><span class="detail-value">${escapeHtml(data.address || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">지역</span><span class="detail-value">${getRegionLabel(data.region)}</span></div>
        <div class="detail-row"><span class="detail-label">개설일자</span><span class="detail-value">${data.opening_date || '-'}</span></div>
        <div class="detail-row"><span class="detail-label">전화번호</span><span class="detail-value">${data.phone ? '<a href="tel:' + data.phone + '">' + escapeHtml(data.phone) + '</a>' : '-'}</span></div>
        <div class="detail-row"><span class="detail-label">HIRA 기호</span><span class="detail-value">${escapeHtml(data.hira_ykiho || '-')}</span></div>
        <div class="detail-row"><span class="detail-label">데이터 출처</span><span class="detail-value">${data.data_source || '-'}</span></div>
        <div class="detail-row" style="border-top:2px solid var(--gray-200);margin-top:12px;padding-top:12px;">
            <span class="detail-label">선점 상태</span><span class="detail-value">${getClaimBadge(data.claim_status)}</span>
        </div>
        ${data.partners ? `<div class="detail-row"><span class="detail-label">선점 파트너</span><span class="detail-value">${escapeHtml(data.partners.name)} ${data.partners.hospital_name ? '(' + escapeHtml(data.partners.hospital_name) + ')' : ''}</span></div>` : ''}
        ${data.claimed_at ? `<div class="detail-row"><span class="detail-label">선점 시각</span><span class="detail-value">${formatDate(data.claimed_at)}</span></div>` : ''}
        ${data.notes ? `<div class="detail-row"><span class="detail-label">파트너 메모</span><span class="detail-value">${escapeHtml(data.notes)}</span></div>` : ''}
        ${data.admin_notes ? `<div class="detail-row"><span class="detail-label">관리자 메모</span><span class="detail-value">${escapeHtml(data.admin_notes)}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">등록일</span><span class="detail-value">${formatDate(data.created_at)}</span></div>
    `;

    const deleteBtn = document.getElementById('deleteClinicBtn');
    deleteBtn.style.display = 'inline-block';
    deleteBtn.onclick = () => {
        deleteClinic(data.id);
        document.getElementById('clinicDetailModal').classList.remove('active');
    };

    document.getElementById('clinicDetailModal').classList.add('active');
}

// ─── HIRA API Sync ───

const SIDO_CODES = {
    'seoul': '110000', 'gyeonggi': '410000', 'incheon': '280000',
    'busan': '260000', 'daegu': '270000', 'daejeon': '300000',
    'gwangju': '290000', 'ulsan': '310000', 'sejong': '360000',
    'gangwon': '320000', 'chungbuk': '330000', 'chungnam': '340000',
    'jeonbuk': '350000', 'jeonnam': '460000', 'gyeongbuk': '370000',
    'gyeongnam': '380000', 'jeju': '390000'
};

const SIDO_REVERSE = Object.fromEntries(
    Object.entries(SIDO_CODES).map(([k, v]) => [v, k])
);

async function syncHiraData() {
    if (typeof HIRA_API_CONFIG === 'undefined' || HIRA_API_CONFIG.serviceKey === 'YOUR_HIRA_API_KEY') {
        showToast('config.js에서 HIRA API 키를 설정하세요.', 'error');
        return;
    }

    const statusEl = document.getElementById('hiraSyncStatus');
    statusEl.style.display = 'block';
    statusEl.textContent = '공공데이터 동기화를 시작합니다...';

    const btn = document.getElementById('syncHiraBtn');
    btn.disabled = true;

    const syncStartTime = Date.now();
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - (HIRA_API_CONFIG.recentMonths || 6));
    const cutoffStr = cutoffDate.toISOString().split('T')[0].replace(/-/g, '');

    let totalInserted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    try {
        // Fetch from each major region
        const sidoKeys = Object.keys(SIDO_CODES);

        for (let i = 0; i < sidoKeys.length; i++) {
            const region = sidoKeys[i];
            const sidoCd = SIDO_CODES[region];
            statusEl.textContent = `동기화 중... (${getRegionLabel(region)} - ${i + 1}/${sidoKeys.length})`;

            try {
                let pageNo = 1;
                let hasMore = true;

                while (hasMore) {
                    const params = new URLSearchParams({
                        ServiceKey: HIRA_API_CONFIG.serviceKey,
                        numOfRows: '100',
                        pageNo: String(pageNo),
                        sidoCd: sidoCd
                    });

                    const url = `${HIRA_API_CONFIG.baseUrl}?${params.toString()}`;
                    const response = await fetch(url);

                    if (!response.ok) {
                        totalErrors++;
                        break;
                    }

                    const text = await response.text();
                    const parser = new DOMParser();
                    const xml = parser.parseFromString(text, 'text/xml');

                    const items = xml.querySelectorAll('item');
                    if (items.length === 0) {
                        hasMore = false;
                        break;
                    }

                    const records = [];
                    items.forEach(item => {
                        const getVal = (tag) => {
                            const el = item.querySelector(tag);
                            return el ? el.textContent.trim() : null;
                        };

                        const estDt = getVal('estDt') || '';
                        // Filter: only recent openings
                        if (estDt && estDt >= cutoffStr) {
                            const formattedDate = estDt.length === 8
                                ? `${estDt.slice(0,4)}-${estDt.slice(4,6)}-${estDt.slice(6,8)}`
                                : null;

                            records.push({
                                clinic_name: getVal('yadmNm') || '(미상)',
                                representative_name: getVal('drNm') || null,
                                specialty: getVal('dgsbjtCdNm') || getVal('clCdNm') || null,
                                address: getVal('addr') || null,
                                region: region,
                                opening_date: formattedDate,
                                phone: getVal('telno') || null,
                                hira_ykiho: getVal('ykiho') || null,
                                data_source: 'hira_api'
                            });
                        }
                    });

                    if (records.length > 0) {
                        const { data, error } = await sb
                            .from('new_clinic_openings')
                            .upsert(records, { onConflict: 'hira_ykiho', ignoreDuplicates: true });

                        if (error) {
                            // Try individual inserts for rows without hira_ykiho
                            for (const rec of records) {
                                if (!rec.hira_ykiho) {
                                    await sb.from('new_clinic_openings').insert(rec);
                                    totalInserted++;
                                } else {
                                    const { error: singleErr } = await sb
                                        .from('new_clinic_openings')
                                        .upsert(rec, { onConflict: 'hira_ykiho', ignoreDuplicates: true });
                                    if (!singleErr) totalInserted++;
                                    else totalSkipped++;
                                }
                            }
                        } else {
                            totalInserted += records.length;
                        }
                    }

                    // Check if there are more pages
                    const totalCount = xml.querySelector('totalCount');
                    const total = totalCount ? parseInt(totalCount.textContent) : 0;
                    if (pageNo * 100 >= total || items.length < 100) {
                        hasMore = false;
                    } else {
                        pageNo++;
                    }
                }
            } catch (regionErr) {
                console.error(`HIRA sync error for ${region}:`, regionErr);
                totalErrors++;
            }
        }

        // 수동 동기화 로그 기록
        const syncDuration = Date.now() - syncStartTime;
        await sb.from('hira_sync_logs').insert({
            sync_type: 'manual',
            inserted_count: totalInserted,
            skipped_count: totalSkipped,
            error_count: totalErrors,
            duration_ms: syncDuration
        });

        statusEl.style.background = '#D1FAE5';
        statusEl.style.color = '#065F46';
        statusEl.textContent = `동기화 완료! 신규 ${totalInserted}건 추가, ${totalSkipped}건 중복 스킵, ${totalErrors}건 오류`;
        loadAdminNewClinics();
    } catch (error) {
        console.error('HIRA sync error:', error);
        statusEl.style.background = '#FEE2E2';
        statusEl.style.color = '#991B1B';
        statusEl.textContent = `동기화 실패: ${error.message}`;

        // 실패 로그 기록
        const syncDuration = Date.now() - syncStartTime;
        await sb.from('hira_sync_logs').insert({
            sync_type: 'manual',
            inserted_count: totalInserted,
            skipped_count: totalSkipped,
            error_count: totalErrors + 1,
            duration_ms: syncDuration,
            error_message: error.message
        }).catch(() => {});
    } finally {
        btn.disabled = false;
        setTimeout(() => { statusEl.style.display = 'none'; }, 10000);
    }
}

// ─── CSV Upload ───

function handleCsvClinicPreview(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const text = evt.target.result;
        const lines = text.split('\n').filter(l => l.trim());

        // Skip header if it looks like a header
        let startIdx = 0;
        if (lines[0] && (lines[0].includes('의료기관') || lines[0].includes('clinic_name'))) {
            startIdx = 1;
        }

        csvClinicData = [];
        for (let i = startIdx; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            if (cols.length >= 1 && cols[0].trim()) {
                csvClinicData.push({
                    clinic_name: cols[0]?.trim() || '',
                    representative_name: cols[1]?.trim() || null,
                    specialty: cols[2]?.trim() || null,
                    address: cols[3]?.trim() || null,
                    region: cols[4]?.trim() || null,
                    opening_date: cols[5]?.trim() || null,
                    phone: cols[6]?.trim() || null,
                    hira_ykiho: cols[7]?.trim() || null,
                    data_source: 'csv_upload'
                });
            }
        }

        // Show preview
        const previewArea = document.getElementById('csvPreviewArea');
        const previewBody = document.getElementById('csvPreviewBody');
        const totalCount = document.getElementById('csvTotalCount');

        if (csvClinicData.length === 0) {
            previewArea.style.display = 'none';
            showToast('CSV 파일에서 데이터를 찾을 수 없습니다.', 'error');
            return;
        }

        previewBody.innerHTML = csvClinicData.slice(0, 10).map(r => `
            <tr>
                <td>${escapeHtml(r.clinic_name)}</td>
                <td>${escapeHtml(r.representative_name || '-')}</td>
                <td>${escapeHtml(r.specialty || '-')}</td>
                <td>${escapeHtml(r.address || '-')}</td>
                <td>${getRegionLabel(r.region)}</td>
                <td>${r.opening_date || '-'}</td>
                <td>${escapeHtml(r.phone || '-')}</td>
                <td>${escapeHtml(r.hira_ykiho || '-')}</td>
            </tr>
        `).join('');

        totalCount.textContent = `총 ${csvClinicData.length}건`;
        previewArea.style.display = 'block';
    };
    reader.readAsText(file, 'UTF-8');
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

async function handleCsvClinicImport() {
    if (csvClinicData.length === 0) {
        showToast('업로드할 데이터가 없습니다.', 'error');
        return;
    }

    const btn = document.getElementById('csvImportBtn');
    btn.disabled = true;
    btn.textContent = '등록 중...';

    let inserted = 0;
    let skipped = 0;

    try {
        // Process in batches of 50
        for (let i = 0; i < csvClinicData.length; i += 50) {
            const batch = csvClinicData.slice(i, i + 50);
            const withHira = batch.filter(r => r.hira_ykiho);
            const withoutHira = batch.filter(r => !r.hira_ykiho);

            if (withHira.length > 0) {
                const { error } = await sb
                    .from('new_clinic_openings')
                    .upsert(withHira, { onConflict: 'hira_ykiho', ignoreDuplicates: true });
                if (!error) inserted += withHira.length;
                else skipped += withHira.length;
            }

            if (withoutHira.length > 0) {
                const { error } = await sb.from('new_clinic_openings').insert(withoutHira);
                if (!error) inserted += withoutHira.length;
                else skipped += withoutHira.length;
            }
        }

        showToast(`CSV 등록 완료: ${inserted}건 추가, ${skipped}건 스킵`, 'success');
        document.getElementById('csvClinicModal').classList.remove('active');
        csvClinicData = [];
        loadAdminNewClinics();
    } catch (error) {
        showToast('CSV 등록 실패: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '일괄 등록';
    }
}

async function exportClinicsCSV() {
    try {
        const { data, error } = await sb
            .from('new_clinic_openings')
            .select('*, partners:claimed_by(name)')
            .order('opening_date', { ascending: false });

        if (error) throw error;
        if (!data || data.length === 0) {
            showToast('내보낼 데이터가 없습니다.', 'error');
            return;
        }

        let csv = '의료기관명,대표자,진료과,주소,지역,개설일,전화번호,HIRA기호,선점상태,선점파트너,출처\n';
        csv += data.map(row =>
            `"${(row.clinic_name || '').replace(/"/g, '""')}","${(row.representative_name || '').replace(/"/g, '""')}","${(row.specialty || '').replace(/"/g, '""')}","${(row.address || '').replace(/"/g, '""')}","${getRegionLabel(row.region)}","${row.opening_date || ''}","${(row.phone || '').replace(/"/g, '""')}","${row.hira_ykiho || ''}","${row.claim_status}","${row.partners ? row.partners.name : ''}","${row.data_source || ''}"`
        ).join('\n');

        const bom = '\uFEFF';
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `new_clinics_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        showToast('다운로드가 시작되었습니다.', 'success');
    } catch (error) {
        showToast('CSV 내보내기 실패: ' + error.message, 'error');
    }
}

// ─── Analytics Dashboard ───

let analyticsCharts = {};
let analyticsPeriod = 'today';
let analyticsSubscription = null;

function changeAnalyticsPeriod(period) {
    analyticsPeriod = period;
    document.querySelectorAll('.an-period-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });
    loadAnalytics();
}

function getAnalyticsDateRange() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    if (analyticsPeriod === 'today') return todayStart;
    if (analyticsPeriod === '7d') {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        return d.toISOString();
    }
    if (analyticsPeriod === '30d') {
        const d = new Date(now); d.setDate(d.getDate() - 30);
        return d.toISOString();
    }
    return '2020-01-01T00:00:00Z'; // 전체
}

async function loadAnalytics() {
    try {
        const since = getAnalyticsDateRange();
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        // 병렬로 모든 데이터 조회
        const [sessionsRes, pageviewsRes, eventsRes, liveRes] = await Promise.all([
            sb.from('analytics_sessions').select('*').gte('started_at', since).order('started_at', { ascending: false }),
            sb.from('analytics_pageviews').select('*').gte('entered_at', since).order('entered_at', { ascending: false }),
            sb.from('analytics_events').select('*').gte('created_at', since).order('created_at', { ascending: false }),
            sb.from('analytics_sessions').select('id', { count: 'exact', head: true }).gte('last_active_at', fiveMinAgo)
        ]);

        const sessions = sessionsRes.data || [];
        const pageviews = pageviewsRes.data || [];
        const events = eventsRes.data || [];
        const liveCount = liveRes.count || 0;

        // 실시간 현황 카드
        document.getElementById('anLiveCount').textContent = liveCount;
        document.getElementById('anTodayVisitors').textContent = sessions.length;
        document.getElementById('anTodayPageviews').textContent = pageviews.length;

        // 평균 체류시간
        const pvWithTime = pageviews.filter(p => p.time_on_page > 0);
        const avgSec = pvWithTime.length > 0 ? Math.round(pvWithTime.reduce((s, p) => s + p.time_on_page, 0) / pvWithTime.length) : 0;
        const min = Math.floor(avgSec / 60);
        const sec = avgSec % 60;
        document.getElementById('anAvgTime').textContent = min + ':' + String(sec).padStart(2, '0');

        // 이탈률
        const bounced = sessions.filter(s => s.is_bounce).length;
        const bounceRate = sessions.length > 0 ? Math.round((bounced / sessions.length) * 100) : 0;
        document.getElementById('anBounceRate').textContent = bounceRate + '%';

        // 차트 렌더링
        renderVisitorChart(sessions, pageviews);
        renderPagesChart(pageviews);
        renderClicksTable(events);
        renderHourlyChart(pageviews);
        renderDeviceChart(sessions);
        renderReferrerChart(sessions);
        renderUtmTable(sessions);
        renderFunnel(sessions, events);

        // 실시간 구독
        setupRealtimeSubscription();
    } catch (error) {
        console.error('Analytics load error:', error);
        showToast('분석 데이터 로딩 실패', 'error');
    }
}

function destroyChart(key) {
    if (analyticsCharts[key]) { analyticsCharts[key].destroy(); analyticsCharts[key] = null; }
}

function renderVisitorChart(sessions, pageviews) {
    destroyChart('visitor');
    const ctx = document.getElementById('anVisitorChart');
    if (!ctx) return;

    // 일별 집계
    const dayMap = {};
    const pvDayMap = {};
    sessions.forEach(s => {
        const d = s.started_at.substring(0, 10);
        dayMap[d] = (dayMap[d] || 0) + 1;
    });
    pageviews.forEach(p => {
        const d = p.entered_at.substring(0, 10);
        pvDayMap[d] = (pvDayMap[d] || 0) + 1;
    });

    const allDays = [...new Set([...Object.keys(dayMap), ...Object.keys(pvDayMap)])].sort();
    const labels = allDays.map(d => d.substring(5)); // MM-DD
    const visitData = allDays.map(d => dayMap[d] || 0);
    const pvData = allDays.map(d => pvDayMap[d] || 0);

    analyticsCharts['visitor'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: '방문자', data: visitData, borderColor: '#1428A0', backgroundColor: 'rgba(20,40,160,0.1)', fill: true, tension: 0.3 },
                { label: '페이지뷰', data: pvData, borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function renderPagesChart(pageviews) {
    destroyChart('pages');
    const ctx = document.getElementById('anPagesChart');
    if (!ctx) return;

    const counts = {};
    pageviews.forEach(p => { counts[p.page_url] = (counts[p.page_url] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    analyticsCharts['pages'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(s => s[0]),
            datasets: [{ label: '페이지뷰', data: sorted.map(s => s[1]), backgroundColor: '#1428A0' }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function renderClicksTable(events) {
    const tbody = document.getElementById('anClicksBody');
    if (!tbody) return;

    const clickEvents = events.filter(e => ['click', 'cta_click', 'form_submit', 'form_open'].includes(e.event_type));
    const counts = {};
    clickEvents.forEach(e => {
        const key = (e.element_text || e.element_id || e.element_tag || 'unknown').substring(0, 40);
        if (!counts[key]) counts[key] = { count: 0, type: e.event_type };
        counts[key].count++;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
    const typeLabels = { click: '클릭', cta_click: 'CTA', form_submit: '폼제출', form_open: '폼오픈' };

    tbody.innerHTML = sorted.length === 0 ? '<tr><td colspan="3" style="text-align:center;color:var(--gray-500);">데이터 없음</td></tr>' :
        sorted.map(([text, info]) =>
            `<tr><td title="${text}">${text.length > 20 ? text.substring(0, 20) + '…' : text}</td><td><span class="status-badge" style="background:var(--primary-light);color:var(--primary);">${typeLabels[info.type] || info.type}</span></td><td style="font-weight:700;">${info.count}</td></tr>`
        ).join('');
}

function renderHourlyChart(pageviews) {
    destroyChart('hourly');
    const ctx = document.getElementById('anHourlyChart');
    if (!ctx) return;

    const hours = new Array(24).fill(0);
    pageviews.forEach(p => {
        const h = new Date(p.entered_at).getHours();
        hours[h]++;
    });

    analyticsCharts['hourly'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: hours.map((_, i) => i + '시'),
            datasets: [{ label: '페이지뷰', data: hours, backgroundColor: '#6366F1' }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function renderDeviceChart(sessions) {
    destroyChart('device');
    const ctx = document.getElementById('anDeviceChart');
    if (!ctx) return;

    const counts = { mobile: 0, desktop: 0, tablet: 0 };
    sessions.forEach(s => { if (counts.hasOwnProperty(s.device_type)) counts[s.device_type]++; else counts['desktop']++; });

    analyticsCharts['device'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['모바일', '데스크톱', '태블릿'],
            datasets: [{ data: [counts.mobile, counts.desktop, counts.tablet], backgroundColor: ['#3B82F6', '#1428A0', '#10B981'] }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: function(ctx) { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return ctx.label + ': ' + ctx.raw + ' (' + (total > 0 ? Math.round(ctx.raw / total * 100) : 0) + '%)'; } } }
            }
        }
    });
}

function renderReferrerChart(sessions) {
    destroyChart('referrer');
    const ctx = document.getElementById('anReferrerChart');
    if (!ctx) return;

    const counts = {};
    sessions.forEach(s => {
        let ref = '직접 방문';
        if (s.referrer) {
            try {
                const host = new URL(s.referrer).hostname.replace('www.', '');
                if (host.includes('naver')) ref = '네이버';
                else if (host.includes('google')) ref = '구글';
                else if (host.includes('kakao') || host.includes('daum')) ref = '카카오/다음';
                else if (host.includes('instagram')) ref = '인스타그램';
                else if (host.includes('facebook') || host.includes('fb')) ref = '페이스북';
                else ref = host;
            } catch(e) { ref = '기타'; }
        }
        counts[ref] = (counts[ref] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const colors = ['#1428A0', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6B7280'];

    analyticsCharts['referrer'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sorted.map(s => s[0]),
            datasets: [{ data: sorted.map(s => s[1]), backgroundColor: colors.slice(0, sorted.length) }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: function(ctx) { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return ctx.label + ': ' + ctx.raw + ' (' + (total > 0 ? Math.round(ctx.raw / total * 100) : 0) + '%)'; } } }
            }
        }
    });
}

function renderUtmTable(sessions) {
    const tbody = document.getElementById('anUtmBody');
    if (!tbody) return;

    const utmSessions = sessions.filter(s => s.utm_campaign || s.utm_source);
    const counts = {};
    utmSessions.forEach(s => {
        const key = (s.utm_campaign || '-') + '|' + (s.utm_source || '-') + '|' + (s.utm_medium || '-');
        counts[key] = (counts[key] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    tbody.innerHTML = sorted.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:var(--gray-500);">UTM 데이터 없음</td></tr>' :
        sorted.map(([key, count]) => {
            const [campaign, source, medium] = key.split('|');
            return `<tr><td>${campaign}</td><td>${source}</td><td>${medium}</td><td style="font-weight:700;">${count}</td></tr>`;
        }).join('');
}

function renderFunnel(sessions, events) {
    const totalVisits = sessions.length;
    const ctaClicks = events.filter(e => e.event_type === 'cta_click').length;
    const formOpens = events.filter(e => e.event_type === 'form_open').length;
    const formSubmits = events.filter(e => e.event_type === 'form_submit').length;

    document.getElementById('anFunnelVisit').textContent = totalVisits;
    document.getElementById('anFunnelCta').textContent = ctaClicks;
    document.getElementById('anFunnelForm').textContent = formOpens;
    document.getElementById('anFunnelSubmit').textContent = formSubmits;

    const convRate = totalVisits > 0 ? ((formSubmits / totalVisits) * 100).toFixed(1) : '0';
    document.getElementById('anConversionRate').textContent = convRate + '%';
    document.getElementById('anFunnelBar').style.width = Math.min(parseFloat(convRate), 100) + '%';
}

function setupRealtimeSubscription() {
    if (analyticsSubscription) return; // 이미 구독 중
    analyticsSubscription = sb.channel('analytics-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'analytics_sessions' }, () => {
            // 실시간 접속자 카운트만 갱신
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            sb.from('analytics_sessions').select('id', { count: 'exact', head: true }).gte('last_active_at', fiveMinAgo)
                .then(({ count }) => {
                    const el = document.getElementById('anLiveCount');
                    if (el) el.textContent = count || 0;
                });
        })
        .subscribe();
}

// ─── Agencies (가맹점 신청) ───

const AGENCY_BIZ_LABELS = {
    'loan-broker': '대출중개·금융영업',
    'medical-device': '의료기기·소모품',
    'hospital-consulting': '병원·약국 컨설팅',
    'opening-consulting': '개원·EMR 컨설팅',
    'marketing-agency': '병의원 마케팅',
    'accounting': '회계·세무·노무',
    'insurance': '보험·재무',
    'new-startup': '신규 창업·투자',
    'other': '기타'
};

const AGENCY_STATUS_LABELS = {
    'new': '신규',
    'contacted': '연락완료',
    'in_review': '실사중',
    'contracted': '계약체결',
    'rejected': '반려'
};

function getAgencyBizLabel(v) { return AGENCY_BIZ_LABELS[v] || v || '-'; }
function getAgencyStatusLabel(v) { return AGENCY_STATUS_LABELS[v] || v || '신규'; }

async function loadAgencies() {
    const loading = document.getElementById('agencyLoading');
    const table = document.getElementById('agencyTable');
    const empty = document.getElementById('agencyEmpty');
    const tbody = document.getElementById('agencyTableBody');
    if (!loading || !table || !empty || !tbody) return;

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    try {
        let query = sb.from('agency_inquiries').select('*').order('created_at', { ascending: false });
        const { data, error } = await query;
        if (error) throw error;

        const statusFilter = document.getElementById('agencyStatusFilter').value;
        const search = (document.getElementById('agencySearch').value || '').trim().toLowerCase();

        let rows = data || [];
        if (statusFilter !== 'all') rows = rows.filter(r => (r.status || 'new') === statusFilter);
        if (search) {
            rows = rows.filter(r =>
                (r.name || '').toLowerCase().includes(search) ||
                (r.phone || '').toLowerCase().includes(search) ||
                (r.company_name || '').toLowerCase().includes(search) ||
                (r.desired_region || '').toLowerCase().includes(search)
            );
        }

        loading.style.display = 'none';
        if (rows.length === 0) {
            empty.style.display = 'block';
            return;
        }

        table.style.display = 'table';
        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${formatDate(r.created_at)}</td>
                <td><strong>${escapeHtml(r.name || '')}</strong></td>
                <td>${escapeHtml(r.phone || '')}</td>
                <td>${escapeHtml(r.company_name || '-')}</td>
                <td>${escapeHtml(getAgencyBizLabel(r.business_type))}</td>
                <td>${escapeHtml(r.desired_region || '-')}</td>
                <td>${escapeHtml(r.team_size || '-')}</td>
                <td>${escapeHtml(r.monthly_capacity || '-')}</td>
                <td><span class="status-badge status-${r.status || 'new'}">${getAgencyStatusLabel(r.status || 'new')}</span></td>
                <td>
                    <select class="filter-select" data-agency-id="${r.id}" onchange="updateAgencyStatus(this)" style="font-size:12px;padding:4px 8px;">
                        ${Object.entries(AGENCY_STATUS_LABELS).map(([v, l]) =>
                            `<option value="${v}"${(r.status || 'new') === v ? ' selected' : ''}>${l}</option>`
                        ).join('')}
                    </select>
                </td>
            </tr>
        `).join('');

        window._agenciesData = rows;
    } catch (error) {
        console.error('Load agencies error:', error);
        loading.style.display = 'none';
        empty.style.display = 'block';
        showToast('가맹점 신청 데이터를 불러오는데 실패했습니다.', 'error');
    }
}

async function updateAgencyStatus(selectEl) {
    const id = selectEl.dataset.agencyId;
    const newStatus = selectEl.value;
    if (!id) return;

    try {
        const { error } = await sb.from('agency_inquiries').update({ status: newStatus }).eq('id', id);
        if (error) throw error;
        showToast('가맹점 상태가 업데이트되었습니다.', 'success');
        loadStats();
    } catch (error) {
        console.error('Update agency status error:', error);
        showToast('상태 업데이트에 실패했습니다.', 'error');
    }
}

async function exportAgencyCSV() {
    const data = window._agenciesData;
    if (!data || data.length === 0) {
        showToast('내보낼 데이터가 없습니다.', 'error');
        return;
    }
    let csv = '신청일시,대표자,연락처,이메일,상호,사업자번호,업종,사업경력,희망권역,조직규모,월매칭,영업경력,상담시간,유입경로,상태,추가문의\n';
    csv += data.map(r =>
        `"${formatDate(r.created_at)}","${r.name || ''}","${r.phone || ''}","${r.email || ''}","${(r.company_name || '').replace(/"/g, '""')}","${r.business_number || ''}","${getAgencyBizLabel(r.business_type)}","${r.years_in_business || ''}","${(r.desired_region || '').replace(/"/g, '""')}","${r.team_size || ''}","${r.monthly_capacity || ''}","${r.sales_experience || ''}","${getPreferredTimeLabel(r.preferred_time)}","${getInflowChannelLabel(r.inflow_channel)}","${getAgencyStatusLabel(r.status || 'new')}","${(r.message || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
    ).join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `agency_inquiries_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast('다운로드가 시작되었습니다.', 'success');
}

window.updateAgencyStatus = updateAgencyStatus;

// 가맹점 필터·검색·CSV 이벤트 (DOM 준비 후 한 번)
document.addEventListener('DOMContentLoaded', () => {
    const sf = document.getElementById('agencyStatusFilter');
    const sr = document.getElementById('agencySearch');
    const ex = document.getElementById('exportAgencyBtn');
    if (sf) sf.addEventListener('change', loadAgencies);
    if (sr) sr.addEventListener('input', debounce(loadAgencies, 300));
    if (ex) ex.addEventListener('click', exportAgencyCSV);
});
