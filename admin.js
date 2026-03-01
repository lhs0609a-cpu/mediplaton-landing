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
        const { data: partner } = await sb
            .from('partners')
            .select('status')
            .eq('user_id', currentUser.id)
            .single();

        if (partner?.status === 'approved') {
            window.location.href = 'partner-dashboard.html';
            return;
        } else if (partner && partner.status !== 'approved') {
            // 미승인 파트너는 세션 제거
            await sb.auth.signOut();
            currentUser = null;
        } else {
            // 관리자
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
    document.getElementById('partnerQnaSection').style.display = tab === 'partner-qna' ? 'block' : 'none';
    document.getElementById('boardManageSection').style.display = tab === 'board-manage' ? 'block' : 'none';

    if (tab === 'all-inquiries') loadAllInquiries();
    if (tab === 'partners') loadPartners();
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
        const { data: posts, error } = await supabase
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
        const { error: replyError } = await supabase.from('board_replies').insert({
            post_id: parseInt(postId),
            content,
            author_name: '관리자'
        });

        if (replyError) throw replyError;

        const { error: updateError } = await supabase
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
        const { error } = await supabase
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
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('board_posts').insert({
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
    const labels = { draft: '작성중', sent: '발송', signed: '서명완료', active: '활성', expired: '만료', terminated: '해지' };
    return labels[status] || status;
}

const CONTRACT_TRANSITIONS = {
    draft: ['sent', 'terminated'],
    sent: ['signed', 'terminated'],
    signed: ['active', 'terminated'],
    active: ['expired', 'terminated'],
    expired: ['active'],
    terminated: []
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
                                    ${['draft', 'sent'].includes(c.status) ? `<button class="action-btn delete" onclick="deleteContract(${c.id})">삭제</button>` : ''}
                                    ${['active', 'signed', 'sent'].includes(c.status) ? `<button class="action-btn reject" onclick="terminateContract(${c.id})">해지</button>` : ''}
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
4. 기타 갑이 서면으로 요청한 영업 관련 업무</p>

<h3>제3조 (갑의 업무 범위)</h3>
<p>1. 을이 소개한 고객에 대한 심사 및 서비스 제공<br>
2. 을의 영업 활동에 필요한 자료 및 교육 지원<br>
3. 파트너 대시보드를 통한 진행 상태 공유<br>
4. 수수료의 정확한 산정 및 적시 지급</p>

<h3>제4조 (수수료)</h3>
<p>1. <strong>수수료율:</strong> 성사된 거래 금액의 <strong>${ratePercent}%</strong><br>
2. <strong>정산 주기:</strong> 매월 말일 마감, 익월 15일 지급<br>
3. <strong>정산 계좌:</strong> ${bankInfo}<br>
4. 수수료는 고객의 서비스가 정상 실행(PG 설치 완료 또는 대출 실행)된 건에 한해 발생한다.<br>
5. 고객의 중도 해지, 미납 등으로 갑에 손해가 발생한 경우, 해당 건의 수수료는 조정될 수 있다.</p>

<h3>제5조 (계약 기간)</h3>
<p>1. <strong>계약 기간:</strong> ${startDate} ~ ${endDate} (${periodMonths}개월)<br>
2. <strong>자동 갱신:</strong> ${autoRenewal ? '본 계약은 만료일 30일 전까지 어느 일방이 서면으로 해지 의사를 통보하지 않는 한, 동일 조건으로 1년간 자동 갱신된다.' : '본 계약은 자동 갱신되지 않으며, 갱신 시 별도 합의가 필요하다.'}</p>

<h3>제6조 (비밀유지)</h3>
<p>1. 갑과 을은 본 계약의 이행 과정에서 알게 된 상대방의 영업비밀, 고객정보 등을 제3자에게 누설하거나 본 계약 이외의 목적으로 사용하지 아니한다.<br>
2. 본 조의 의무는 계약 종료 후 2년간 유효하다.</p>

<h3>제7조 (금지 행위)</h3>
<p>을은 다음 각 호의 행위를 하여서는 아니 된다:<br>
1. 갑의 서비스에 대한 허위 또는 과장 안내<br>
2. 고객 정보의 허위 등록 또는 위·변조<br>
3. 고객에게 별도의 수수료, 사례금 등을 요구하는 행위<br>
4. 갑의 사전 동의 없이 갑의 상호, 로고 등을 사용하는 행위<br>
5. 기타 갑의 신뢰와 명예를 훼손하는 행위</p>

<h3>제8조 (계약 해지)</h3>
<p>1. 갑 또는 을은 상대방에게 30일 전 서면 통보로 본 계약을 해지할 수 있다.<br>
2. 다음 각 호에 해당하는 경우 갑은 별도 통보 없이 즉시 계약을 해지할 수 있다:<br>
&nbsp;&nbsp;가. 을이 제7조의 금지 행위를 한 경우<br>
&nbsp;&nbsp;나. 을이 파산, 회생절차 개시 등 정상적 영업이 불가능한 경우<br>
&nbsp;&nbsp;다. 을이 본 계약의 중대한 조항을 위반한 경우<br>
3. 해지 시 이미 성사된 거래에 대한 수수료는 정상 지급한다.</p>

<h3>제9조 (손해배상)</h3>
<p>갑 또는 을이 본 계약을 위반하여 상대방에게 손해를 입힌 경우, 그 손해를 배상할 책임을 진다.</p>

<h3>제10조 (독립 당사자 관계)</h3>
<p>을은 갑의 직원, 대리인이 아닌 독립된 사업자이며, 을의 영업 활동에 따른 비용, 세금 등은 을이 부담한다.</p>

<h3>제11조 (분쟁 해결)</h3>
<p>본 계약과 관련하여 발생하는 분쟁은 서울중앙지방법원을 관할법원으로 한다.</p>

<h3>제12조 (기타)</h3>
<p>1. 본 계약에 명시되지 아니한 사항은 갑과 을이 상호 협의하여 결정한다.<br>
2. 본 계약의 수정 또는 변경은 양 당사자의 서면 합의에 의해서만 효력을 갖는다.</p>

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

async function previewContract(contractId) {
    currentContractId = contractId;

    try {
        const { data, error } = await sb.from('partner_contracts').select('*').eq('id', contractId).single();
        if (error) throw error;

        document.getElementById('contractPreviewTitle').textContent = `계약서 미리보기 — ${data.contract_number}`;
        document.getElementById('contractPreviewBody').innerHTML = data.contract_body || '<p style="color:var(--gray-500);">계약서 본문이 없습니다.</p>';

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
        if (!contract || contract.status === 'terminated') {
            showToast('이미 해지된 계약입니다.', 'error');
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
