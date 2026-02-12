/**
 * 메디플라톤 파트너 대시보드 JavaScript
 */

let supabase = null;
let currentUser = null;
let currentPartner = null;
let currentTab = 'home';

// DOM
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('partnerDashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

document.addEventListener('DOMContentLoaded', async () => {
    if (!isSupabaseConfigured()) return;

    supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        await initPartner();
    }

    setupEventListeners();
});

// ─── Event Listeners ───

function setupEventListeners() {
    loginForm.addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('clientForm').addEventListener('submit', handleClientSubmit);
    document.getElementById('clientPipelineFilter').addEventListener('change', loadClients);
    document.getElementById('clientSearch').addEventListener('input', debounce(loadClients, 300));
    document.getElementById('settlementMonth').addEventListener('change', loadSettlements);

    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('detailModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('detailModal')) closeModal();
    });
}

// ─── Auth ───

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        currentUser = data.user;

        // 파트너 레코드 확인
        const { data: partner, error: pErr } = await supabase
            .from('partners')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();

        if (pErr || !partner) {
            await supabase.auth.signOut();
            currentUser = null;
            loginError.textContent = '파트너 계정이 연결되지 않았습니다. 관리자에게 문의하세요.';
            loginError.style.display = 'block';
            return;
        }

        currentPartner = partner;
        loginError.style.display = 'none';
        showDashboard();
    } catch (error) {
        loginError.textContent = error.message || '로그인에 실패했습니다.';
        loginError.style.display = 'block';
    }
}

async function handleLogout() {
    await supabase.auth.signOut();
    currentUser = null;
    currentPartner = null;
    dashboard.style.display = 'none';
    loginScreen.style.display = 'flex';
    loginForm.reset();
}

async function initPartner() {
    const { data: partner, error } = await supabase
        .from('partners')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();

    if (error || !partner) {
        await handleLogout();
        return;
    }
    currentPartner = partner;
    showDashboard();
}

function showDashboard() {
    loginScreen.style.display = 'none';
    dashboard.style.display = 'block';
    document.getElementById('partnerName').textContent = currentPartner.name || '파트너';
    document.getElementById('partnerEmail').textContent = currentUser.email;

    loadStats();
    loadNotices();
    loadPipelineSummary();
    initSettlementMonths();
}

// ─── Tabs ───

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.getElementById('homeSection').style.display = tab === 'home' ? 'block' : 'none';
    document.getElementById('clientsSection').style.display = tab === 'clients' ? 'block' : 'none';
    document.getElementById('settlementsSection').style.display = tab === 'settlements' ? 'block' : 'none';

    if (tab === 'clients') loadClients();
    if (tab === 'settlements') loadSettlements();
}

// ─── Stats ───

async function loadStats() {
    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        // 이번 달 연결 고객
        const { count: monthClients } = await supabase
            .from('consultations')
            .select('*', { count: 'exact', head: true })
            .eq('partner_id', currentPartner.id)
            .gte('created_at', monthStart);

        // 누적 거래액
        const { data: amountData } = await supabase
            .from('consultations')
            .select('transaction_amount')
            .eq('partner_id', currentPartner.id)
            .not('transaction_amount', 'is', null);

        const totalAmount = (amountData || []).reduce((sum, r) => sum + Number(r.transaction_amount || 0), 0);

        // 예상 수수료
        const rate = Number(currentPartner.commission_rate || 0.015);
        const commission = Math.round(totalAmount * rate);

        // 진행 중 건수
        const { count: inProgress } = await supabase
            .from('consultations')
            .select('*', { count: 'exact', head: true })
            .eq('partner_id', currentPartner.id)
            .in('pipeline_status', ['received', 'reviewing']);

        document.getElementById('statMonthClients').textContent = monthClients || 0;
        document.getElementById('statTotalAmount').textContent = formatCurrency(totalAmount);
        document.getElementById('statCommission').textContent = formatCurrency(commission);
        document.getElementById('statInProgress').textContent = inProgress || 0;
    } catch (error) {
        console.error('Stats error:', error);
    }
}

// ─── Pipeline Summary ───

async function loadPipelineSummary() {
    try {
        const { data } = await supabase
            .from('consultations')
            .select('pipeline_status')
            .eq('partner_id', currentPartner.id);

        const counts = { received: 0, reviewing: 0, approved: 0, installed: 0, rejected: 0 };
        (data || []).forEach(r => {
            const s = r.pipeline_status || 'received';
            if (counts[s] !== undefined) counts[s]++;
        });

        const labels = { received: '접수', reviewing: '심사 중', approved: '승인', installed: 'PG 설치 완료', rejected: '반려' };
        const colors = { received: '#1D4ED8', reviewing: '#B45309', approved: '#047857', installed: '#4338CA', rejected: '#B91C1C' };

        document.getElementById('pipelineSummary').innerHTML = Object.entries(labels).map(([key, label]) => `
            <div class="stat-card">
                <h3>${label}</h3>
                <div class="stat-value" style="color: ${colors[key]}">${counts[key]}</div>
                <div class="stat-sub">건</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Pipeline summary error:', error);
    }
}

// ─── Notices ───

async function loadNotices() {
    try {
        const { data, error } = await supabase
            .from('notices')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        const container = document.getElementById('noticeList');
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="empty-state"><h3>공지사항이 없습니다</h3></div>';
            return;
        }

        container.innerHTML = data.map(n => `
            <div class="notice-item" onclick="toggleNotice(this)">
                <h4>${escapeHtml(n.title)}</h4>
                <span class="notice-date">${formatDate(n.created_at)}</span>
            </div>
            <div class="notice-content">${escapeHtml(n.content || '').replace(/\n/g, '<br>')}</div>
        `).join('');
    } catch (error) {
        console.error('Notices error:', error);
    }
}

function toggleNotice(el) {
    const content = el.nextElementSibling;
    content.classList.toggle('open');
}

// ─── Clients ───

async function loadClients() {
    const loading = document.getElementById('clientLoading');
    const table = document.getElementById('clientTable');
    const empty = document.getElementById('clientEmpty');
    const tbody = document.getElementById('clientTableBody');

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    try {
        let query = supabase
            .from('consultations')
            .select('*')
            .eq('partner_id', currentPartner.id)
            .order('created_at', { ascending: false });

        const pipelineFilter = document.getElementById('clientPipelineFilter').value;
        if (pipelineFilter !== 'all') {
            query = query.eq('pipeline_status', pipelineFilter);
        }

        const search = document.getElementById('clientSearch').value.trim();
        if (search) {
            query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
        }

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
                <td><strong>${escapeHtml(row.name)}</strong></td>
                <td>${escapeHtml(row.phone)}</td>
                <td>${getBusinessLabel(row.business)}</td>
                <td>${renderPipeline(row.pipeline_status)}</td>
                <td>
                    <button class="action-btn view" onclick="viewClient(${row.id})">상세</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Load clients error:', error);
        loading.style.display = 'none';
        showToast('데이터를 불러오는데 실패했습니다.', 'error');
    }
}

async function handleClientSubmit(e) {
    e.preventDefault();

    const payload = {
        name: document.getElementById('clientName').value.trim(),
        phone: document.getElementById('clientPhone').value.trim(),
        business: document.getElementById('clientBusiness').value || null,
        revenue: document.getElementById('clientRevenue').value || null,
        region: document.getElementById('clientRegion').value || null,
        product: document.getElementById('clientProduct').value || null,
        message: document.getElementById('clientMessage').value.trim() || null,
        partner_id: currentPartner.id,
        pipeline_status: 'received',
        status: 'new'
    };

    try {
        const { error } = await supabase.from('consultations').insert([payload]);
        if (error) throw error;

        showToast('고객이 등록되었습니다.', 'success');
        e.target.reset();
        loadClients();
        loadStats();
        loadPipelineSummary();
    } catch (error) {
        console.error('Client submit error:', error);
        showToast('등록에 실패했습니다: ' + error.message, 'error');
    }
}

async function viewClient(id) {
    const { data, error } = await supabase
        .from('consultations')
        .select('*')
        .eq('id', id)
        .eq('partner_id', currentPartner.id)
        .single();

    if (error || !data) {
        showToast('데이터를 불러올 수 없습니다.', 'error');
        return;
    }

    document.getElementById('modalTitle').textContent = '고객 상세 정보';
    document.getElementById('modalBody').innerHTML = `
        <div class="detail-row">
            <span class="detail-label">등록일</span>
            <span class="detail-value">${formatDate(data.created_at)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">고객명</span>
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
            <span class="detail-label">메모</span>
            <span class="detail-value">${escapeHtml(data.message) || '-'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">진행 상태</span>
            <span class="detail-value">${renderPipeline(data.pipeline_status)}</span>
        </div>
        ${data.transaction_amount ? `
        <div class="detail-row">
            <span class="detail-label">거래액</span>
            <span class="detail-value">${formatCurrency(data.transaction_amount)}원</span>
        </div>` : ''}
    `;

    document.getElementById('detailModal').classList.add('active');
}

// ─── Settlements ───

function initSettlementMonths() {
    const select = document.getElementById('settlementMonth');
    const now = new Date();
    select.innerHTML = '';
    for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
        select.innerHTML += `<option value="${val}">${label}</option>`;
    }
}

async function loadSettlements() {
    const month = document.getElementById('settlementMonth').value;
    if (!month) return;

    const loading = document.getElementById('settlementLoading');
    const table = document.getElementById('settlementTable');
    const empty = document.getElementById('settlementEmpty');
    const tbody = document.getElementById('settlementTableBody');

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    try {
        const { data, error } = await supabase
            .from('settlements')
            .select('*')
            .eq('partner_id', currentPartner.id)
            .eq('month', month)
            .order('created_at', { ascending: false });

        if (error) throw error;

        loading.style.display = 'none';

        if (!data || data.length === 0) {
            empty.style.display = 'block';
            document.getElementById('settleTotalAmount').textContent = '0원';
            document.getElementById('settleRate').textContent = '-';
            document.getElementById('settleTotalCommission').textContent = '0원';
            document.getElementById('settleStatus').textContent = '-';
            return;
        }

        // Summary
        const totalAmt = data.reduce((s, r) => s + Number(r.transaction_amount || 0), 0);
        const totalComm = data.reduce((s, r) => s + Number(r.commission_amount || 0), 0);
        const rate = data[0].commission_rate ? (Number(data[0].commission_rate) * 100).toFixed(2) + '%' : '-';
        const statusCounts = {};
        data.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
        const mainStatus = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0][0];

        document.getElementById('settleTotalAmount').textContent = formatCurrency(totalAmt) + '원';
        document.getElementById('settleRate').textContent = rate;
        document.getElementById('settleTotalCommission').textContent = formatCurrency(totalComm) + '원';
        document.getElementById('settleStatus').innerHTML = `<span class="status-badge status-${mainStatus}">${getSettlementStatusLabel(mainStatus)}</span>`;

        // Table
        table.style.display = 'table';
        tbody.innerHTML = data.map(row => `
            <tr>
                <td>${escapeHtml(row.client_name || '-')}</td>
                <td>${formatCurrency(row.transaction_amount)}원</td>
                <td>${row.commission_rate ? (Number(row.commission_rate) * 100).toFixed(2) + '%' : '-'}</td>
                <td>${formatCurrency(row.commission_amount)}원</td>
                <td><span class="status-badge status-${row.status}">${getSettlementStatusLabel(row.status)}</span></td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Settlements error:', error);
        loading.style.display = 'none';
        showToast('정산 데이터를 불러오는데 실패했습니다.', 'error');
    }
}

// ─── Pipeline Render ───

function renderPipeline(status) {
    const steps = [
        { key: 'received', label: '접수' },
        { key: 'reviewing', label: '심사 중' },
        { key: 'approved', label: '승인' },
        { key: 'installed', label: 'PG 설치 완료' }
    ];

    if (status === 'rejected') {
        return `<div class="pipeline">
            ${steps.map((s, i) => {
                if (s.key === 'received') return `<span class="pipeline-step done">${s.label}</span>`;
                return (i > 0 ? '<span class="pipeline-arrow">&rarr;</span>' : '') +
                    `<span class="pipeline-step">${s.label}</span>`;
            }).join('')}
            <span class="pipeline-arrow">&rarr;</span>
            <span class="pipeline-step fail">반려</span>
        </div>`;
    }

    const currentIdx = steps.findIndex(s => s.key === status);
    return `<div class="pipeline">
        ${steps.map((s, i) => {
            let cls = '';
            if (i < currentIdx) cls = 'done';
            else if (i === currentIdx) cls = 'active';
            const arrow = i > 0 ? '<span class="pipeline-arrow">&rarr;</span>' : '';
            return `${arrow}<span class="pipeline-step ${cls}">${s.label}</span>`;
        }).join('')}
    </div>`;
}

// ─── Modal ───

function closeModal() {
    document.getElementById('detailModal').classList.remove('active');
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
    const labels = {
        'hospital': '병원/의원', 'dental': '치과', 'oriental': '한의원',
        'pharmacy': '약국', 'plastic': '성형외과', 'derma': '피부과',
        'eye': '안과', 'ortho': '정형외과', 'other': '기타 의료'
    };
    return labels[value] || value || '-';
}

function getRevenueLabel(value) {
    const labels = {
        'under3000': '3천만원 미만', '3000-5000': '3천~5천만원',
        '5000-1': '5천만원~1억', '1-2': '1억~2억',
        '2-3': '2억~3억', 'over3': '3억 이상'
    };
    return labels[value] || value || '-';
}

function getRegionLabel(value) {
    const labels = {
        'seoul': '서울', 'gyeonggi': '경기', 'incheon': '인천',
        'busan': '부산', 'daegu': '대구', 'daejeon': '대전',
        'gwangju': '광주', 'ulsan': '울산', 'sejong': '세종',
        'gangwon': '강원', 'chungbuk': '충북', 'chungnam': '충남',
        'jeonbuk': '전북', 'jeonnam': '전남', 'gyeongbuk': '경북',
        'gyeongnam': '경남', 'jeju': '제주'
    };
    return labels[value] || value || '-';
}

function getProductLabel(value) {
    const labels = {
        'loan': '카드매출 담보대출', 'credit': '신협 데일리론',
        'kb': 'KB국민카드 특별한도', 'rental': '의료장비 렌탈',
        'deposit': '임차보증금 담보', 'purchase': '구매자금',
        'consult': '모름 (상담 필요)'
    };
    return labels[value] || value || '-';
}

function getSettlementStatusLabel(status) {
    const labels = { 'pending': '대기', 'confirmed': '확정', 'paid': '지급완료' };
    return labels[status] || status;
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}
