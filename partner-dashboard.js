/**
 * 메디플라톤 파트너 대시보드 JavaScript
 * (localStorage 기반 - Supabase 불필요)
 */

let currentPartner = null;
let currentTab = 'home';

// LocalStorage keys
const LS_SESSION = 'mp_partner_session';
const LS_CLIENTS = 'mp_partner_clients';
const LS_NOTICES = 'mp_partner_notices';
const LS_SETTLEMENTS = 'mp_partner_settlements';

// DOM
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('partnerDashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

document.addEventListener('DOMContentLoaded', () => {
    // 기존 세션 확인
    const saved = localStorage.getItem(LS_SESSION);
    if (saved) {
        try {
            currentPartner = JSON.parse(saved);
            showDashboard();
        } catch (e) {
            localStorage.removeItem(LS_SESSION);
        }
    }

    initDefaultData();
    setupEventListeners();
});

// ─── Default Data (최초 1회) ───

function initDefaultData() {
    if (!localStorage.getItem(LS_NOTICES)) {
        localStorage.setItem(LS_NOTICES, JSON.stringify([
            { id: 1, title: '파트너 대시보드 오픈 안내', content: '파트너 대시보드가 오픈되었습니다.\n고객 등록 및 진행 현황을 확인하실 수 있습니다.', is_active: true, created_at: new Date().toISOString() }
        ]));
    }
    if (!localStorage.getItem(LS_CLIENTS)) {
        localStorage.setItem(LS_CLIENTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(LS_SETTLEMENTS)) {
        localStorage.setItem(LS_SETTLEMENTS, JSON.stringify([]));
    }
}

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

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const account = PARTNER_ACCOUNTS.find(a => a.email === email && a.password === password);

    if (!account) {
        loginError.textContent = '이메일 또는 비밀번호가 올바르지 않습니다.';
        loginError.style.display = 'block';
        return;
    }

    currentPartner = {
        id: account.id,
        name: account.name,
        email: account.email,
        commission_rate: account.commission_rate
    };

    localStorage.setItem(LS_SESSION, JSON.stringify(currentPartner));
    loginError.style.display = 'none';
    showDashboard();
}

function handleLogout() {
    currentPartner = null;
    localStorage.removeItem(LS_SESSION);
    dashboard.style.display = 'none';
    loginScreen.style.display = 'flex';
    loginForm.reset();
}

function showDashboard() {
    loginScreen.style.display = 'none';
    dashboard.style.display = 'block';
    document.getElementById('partnerName').textContent = currentPartner.name || '파트너';
    document.getElementById('partnerEmail').textContent = currentPartner.email;

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

// ─── Data Helpers ───

function getClients() {
    try { return JSON.parse(localStorage.getItem(LS_CLIENTS) || '[]'); }
    catch { return []; }
}

function saveClients(clients) {
    localStorage.setItem(LS_CLIENTS, JSON.stringify(clients));
}

function getSettlementsData() {
    try { return JSON.parse(localStorage.getItem(LS_SETTLEMENTS) || '[]'); }
    catch { return []; }
}

function getNoticesData() {
    try { return JSON.parse(localStorage.getItem(LS_NOTICES) || '[]'); }
    catch { return []; }
}

// ─── Stats ───

function loadStats() {
    const clients = getClients().filter(c => c.partner_id === currentPartner.id);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 이번 달 연결 고객
    const monthClients = clients.filter(c => new Date(c.created_at) >= monthStart).length;

    // 누적 거래액
    const totalAmount = clients.reduce((sum, r) => sum + Number(r.transaction_amount || 0), 0);

    // 예상 수수료
    const rate = Number(currentPartner.commission_rate || 0.015);
    const commission = Math.round(totalAmount * rate);

    // 진행 중 건수
    const inProgress = clients.filter(c => ['received', 'reviewing'].includes(c.pipeline_status)).length;

    document.getElementById('statMonthClients').textContent = monthClients;
    document.getElementById('statTotalAmount').textContent = formatCurrency(totalAmount);
    document.getElementById('statCommission').textContent = formatCurrency(commission);
    document.getElementById('statInProgress').textContent = inProgress;
}

// ─── Pipeline Summary ───

function loadPipelineSummary() {
    const clients = getClients().filter(c => c.partner_id === currentPartner.id);
    const counts = { received: 0, reviewing: 0, approved: 0, installed: 0, rejected: 0 };
    clients.forEach(r => {
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
}

// ─── Notices ───

function loadNotices() {
    const data = getNoticesData().filter(n => n.is_active);
    const container = document.getElementById('noticeList');

    if (data.length === 0) {
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
}

function toggleNotice(el) {
    const content = el.nextElementSibling;
    content.classList.toggle('open');
}

// ─── Clients ───

function loadClients() {
    const loading = document.getElementById('clientLoading');
    const table = document.getElementById('clientTable');
    const empty = document.getElementById('clientEmpty');
    const tbody = document.getElementById('clientTableBody');

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    let clients = getClients().filter(c => c.partner_id === currentPartner.id);

    // 최신순 정렬
    clients.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // 파이프라인 필터
    const pipelineFilter = document.getElementById('clientPipelineFilter').value;
    if (pipelineFilter !== 'all') {
        clients = clients.filter(c => c.pipeline_status === pipelineFilter);
    }

    // 검색
    const search = document.getElementById('clientSearch').value.trim().toLowerCase();
    if (search) {
        clients = clients.filter(c =>
            (c.name || '').toLowerCase().includes(search) ||
            (c.phone || '').includes(search)
        );
    }

    loading.style.display = 'none';

    if (clients.length === 0) {
        empty.style.display = 'block';
        return;
    }

    table.style.display = 'table';
    tbody.innerHTML = clients.map(row => `
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
}

function handleClientSubmit(e) {
    e.preventDefault();

    const clients = getClients();
    const newId = clients.length > 0 ? Math.max(...clients.map(c => c.id)) + 1 : 1;

    const payload = {
        id: newId,
        name: document.getElementById('clientName').value.trim(),
        phone: document.getElementById('clientPhone').value.trim(),
        business: document.getElementById('clientBusiness').value || null,
        revenue: document.getElementById('clientRevenue').value || null,
        region: document.getElementById('clientRegion').value || null,
        product: document.getElementById('clientProduct').value || null,
        message: document.getElementById('clientMessage').value.trim() || null,
        partner_id: currentPartner.id,
        pipeline_status: 'received',
        status: 'new',
        transaction_amount: null,
        created_at: new Date().toISOString()
    };

    clients.push(payload);
    saveClients(clients);

    showToast('고객이 등록되었습니다.', 'success');
    e.target.reset();
    loadClients();
    loadStats();
    loadPipelineSummary();
}

function viewClient(id) {
    const clients = getClients();
    const data = clients.find(c => c.id === id && c.partner_id === currentPartner.id);

    if (!data) {
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

function loadSettlements() {
    const month = document.getElementById('settlementMonth').value;
    if (!month) return;

    const loading = document.getElementById('settlementLoading');
    const table = document.getElementById('settlementTable');
    const empty = document.getElementById('settlementEmpty');
    const tbody = document.getElementById('settlementTableBody');

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    const data = getSettlementsData()
        .filter(s => s.partner_id === currentPartner.id && s.month === month)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    loading.style.display = 'none';

    if (data.length === 0) {
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
