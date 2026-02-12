/**
 * 메디플라톤 관리자 페이지 JavaScript
 */

// Supabase 클라이언트 초기화
let supabase = null;
let currentUser = null;
let currentTab = 'consultations';
let currentDetailId = null;
let currentDetailType = null;

// DOM 요소
const loginScreen = document.getElementById('loginScreen');
const adminDashboard = document.getElementById('adminDashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const userEmailEl = document.getElementById('userEmail');
const setupGuide = document.getElementById('setupGuide');

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
    // Supabase 설정 확인
    if (!isSupabaseConfigured()) {
        showSetupGuide();
        return;
    }

    // Supabase 클라이언트 생성
    supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

    // 세션 확인
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        showDashboard();
    }

    // 이벤트 리스너 설정
    setupEventListeners();
});

// 설정 가이드 표시
function showSetupGuide() {
    loginScreen.style.display = 'none';
    adminDashboard.style.display = 'block';
    setupGuide.style.display = 'block';
    document.querySelector('.stats-grid').style.display = 'none';
    document.querySelector('.tabs').style.display = 'none';
    document.getElementById('consultationsSection').style.display = 'none';
}

// 이벤트 리스너
function setupEventListeners() {
    // 로그인 폼
    loginForm.addEventListener('submit', handleLogin);

    // 로그아웃
    logoutBtn.addEventListener('click', handleLogout);

    // 탭 전환
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 상담 필터
    document.getElementById('consultStatusFilter').addEventListener('change', loadConsultations);
    document.getElementById('consultSearch').addEventListener('input', debounce(loadConsultations, 300));

    // 파트너 필터
    document.getElementById('partnerStatusFilter').addEventListener('change', loadPartners);
    document.getElementById('partnerSearch').addEventListener('input', debounce(loadPartners, 300));

    // 모달
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('saveStatusBtn').addEventListener('click', saveStatus);
    document.getElementById('detailModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('detailModal')) closeModal();
    });

    // 엑셀 다운로드
    document.getElementById('exportConsultBtn').addEventListener('click', () => exportToCSV('consultations'));
    document.getElementById('exportPartnerBtn').addEventListener('click', () => exportToCSV('partners'));

    // 정산 관리
    document.getElementById('addSettlementBtn').addEventListener('click', openSettlementModal);
    document.getElementById('settlementForm').addEventListener('submit', handleSettlementSubmit);
    document.getElementById('adminPartnerFilter').addEventListener('change', loadAdminSettlements);
    document.getElementById('adminMonthFilter').addEventListener('change', loadAdminSettlements);

    // 공지사항 관리
    document.getElementById('addNoticeBtn').addEventListener('click', openNoticeModal);
    document.getElementById('noticeForm').addEventListener('submit', handleNoticeSubmit);

    // 정산 자동 계산
    document.getElementById('settleAmount').addEventListener('input', autoCalcCommission);
    document.getElementById('settleRate').addEventListener('input', autoCalcCommission);

    // 정산 모달 파트너 변경 시 수수료율 자동 반영
    document.getElementById('settlePartnerSelect').addEventListener('change', function() {
        const opt = this.selectedOptions[0];
        if (opt && opt.dataset.rate) {
            document.getElementById('settleRate').value = opt.dataset.rate;
            autoCalcCommission();
        }
    });
}

// 로그인 처리
async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        currentUser = data.user;
        loginError.style.display = 'none';
        showDashboard();
    } catch (error) {
        loginError.textContent = error.message || '로그인에 실패했습니다.';
        loginError.style.display = 'block';
    }
}

// 로그아웃 처리
async function handleLogout() {
    await supabase.auth.signOut();
    currentUser = null;
    adminDashboard.style.display = 'none';
    loginScreen.style.display = 'flex';
    loginForm.reset();
}

// 대시보드 표시
function showDashboard() {
    loginScreen.style.display = 'none';
    adminDashboard.style.display = 'block';
    userEmailEl.textContent = currentUser.email;

    loadStats();
    loadConsultations();
    initAdminSettlementFilters();
}

// 통계 로드
async function loadStats() {
    try {
        // 오늘 날짜
        const today = new Date().toISOString().split('T')[0];

        // 오늘 상담
        const { count: todayCount } = await supabase
            .from('consultations')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today);

        // 전체 상담
        const { count: totalConsult } = await supabase
            .from('consultations')
            .select('*', { count: 'exact', head: true });

        // 전체 파트너
        const { count: totalPartner } = await supabase
            .from('partners')
            .select('*', { count: 'exact', head: true });

        // 미처리 (신규 상태)
        const { count: pendingConsult } = await supabase
            .from('consultations')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'new');

        const { count: pendingPartner } = await supabase
            .from('partners')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'new');

        document.getElementById('todayConsult').textContent = todayCount || 0;
        document.getElementById('totalConsult').textContent = totalConsult || 0;
        document.getElementById('totalPartner').textContent = totalPartner || 0;
        document.getElementById('pendingCount').textContent = (pendingConsult || 0) + (pendingPartner || 0);

        // 배지 업데이트
        document.getElementById('consultBadge').textContent = pendingConsult || 0;
        document.getElementById('partnerBadge').textContent = pendingPartner || 0;

    } catch (error) {
        console.error('Stats error:', error);
    }
}

// 탭 전환
function switchTab(tab) {
    currentTab = tab;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.getElementById('consultationsSection').style.display = tab === 'consultations' ? 'block' : 'none';
    document.getElementById('partnersSection').style.display = tab === 'partners' ? 'block' : 'none';
    document.getElementById('adminSettlementsSection').style.display = tab === 'admin-settlements' ? 'block' : 'none';

    if (tab === 'partners') loadPartners();
    if (tab === 'admin-settlements') {
        loadAdminSettlements();
        loadAdminNotices();
    }
}

// 상담 목록 로드
async function loadConsultations() {
    const loading = document.getElementById('consultLoading');
    const table = document.getElementById('consultTable');
    const empty = document.getElementById('consultEmpty');
    const tbody = document.getElementById('consultTableBody');

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    try {
        let query = supabase
            .from('consultations')
            .select('*')
            .order('created_at', { ascending: false });

        // 상태 필터
        const statusFilter = document.getElementById('consultStatusFilter').value;
        if (statusFilter !== 'all') {
            query = query.eq('status', statusFilter);
        }

        // 검색
        const search = document.getElementById('consultSearch').value.trim();
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

// 파트너 목록 로드
async function loadPartners() {
    const loading = document.getElementById('partnerLoading');
    const table = document.getElementById('partnerTable');
    const empty = document.getElementById('partnerEmpty');
    const tbody = document.getElementById('partnerTableBody');

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    try {
        let query = supabase
            .from('partners')
            .select('*')
            .order('created_at', { ascending: false });

        // 상태 필터
        const statusFilter = document.getElementById('partnerStatusFilter').value;
        if (statusFilter !== 'all') {
            query = query.eq('status', statusFilter);
        }

        // 검색
        const search = document.getElementById('partnerSearch').value.trim();
        if (search) {
            query = query.or(`name.ilike.%${search}%,hospital_name.ilike.%${search}%`);
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
                <td>${escapeHtml(row.hospital_name || '-')}</td>
                <td>${getBusinessLabel(row.business)}</td>
                <td>${getRegionLabel(row.region)}</td>
                <td><span class="status-badge status-${row.status}">${getPartnerStatusLabel(row.status)}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn view" onclick="viewPartner(${row.id})">상세</button>
                    </div>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Load partners error:', error);
        loading.style.display = 'none';
        showToast('데이터를 불러오는데 실패했습니다.', 'error');
    }
}

// 상담 상세 보기
async function viewConsultation(id) {
    currentDetailId = id;
    currentDetailType = 'consultation';

    const { data, error } = await supabase
        .from('consultations')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        showToast('데이터를 불러오는데 실패했습니다.', 'error');
        return;
    }

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
            <span class="detail-label">파트너 연결</span>
            <span class="detail-value">파트너 ID: ${data.partner_id}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">파이프라인</span>
            <span class="detail-value">
                <select class="filter-select" id="pipelineSelect" style="margin-right:8px;">
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
                <input type="number" id="transactionAmount" value="${data.transaction_amount || ''}" placeholder="거래액 입력" style="padding:8px 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:14px;width:200px;">
            </span>
        </div>
        ` : ''}
    `;

    // 상태 선택 업데이트
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

// 파트너 상세 보기
async function viewPartner(id) {
    currentDetailId = id;
    currentDetailType = 'partner';

    const { data, error } = await supabase
        .from('partners')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        showToast('데이터를 불러오는데 실패했습니다.', 'error');
        return;
    }

    const showLinkBtn = data.status === 'approved' && !data.user_id;

    document.getElementById('modalTitle').textContent = '파트너 신청 상세';
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
            <span class="detail-label">월 카드매출</span>
            <span class="detail-value">${getRevenueLabel(data.revenue)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">문의사항</span>
            <span class="detail-value">${escapeHtml(data.message) || '-'}</span>
        </div>
        <div class="detail-row" style="border-top: 2px solid var(--gray-200); margin-top: 12px; padding-top: 12px;">
            <span class="detail-label">계정 연결</span>
            <span class="detail-value">
                ${data.user_id
                    ? '<span style="color:var(--success);font-weight:600;">연결됨</span> (ID: ' + data.user_id.substring(0, 8) + '...)'
                    : showLinkBtn
                        ? '<input type="text" id="linkUserId" placeholder="Supabase Auth User UUID" style="padding:8px 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px;width:100%;margin-bottom:8px;"><button class="btn btn-primary btn-sm" onclick="linkPartnerAccount(' + id + ')" style="width:auto;">계정 연결</button>'
                        : '<span style="color:var(--gray-500);">승인 상태에서만 연결 가능</span>'
                }
            </span>
        </div>
    `;

    // 상태 선택 업데이트
    const statusSelect = document.getElementById('statusSelect');
    statusSelect.innerHTML = `
        <option value="new">신규</option>
        <option value="reviewing">검토중</option>
        <option value="approved">승인</option>
        <option value="rejected">반려</option>
    `;
    statusSelect.value = data.status;

    document.getElementById('detailModal').classList.add('active');
}

// 파트너 계정 연결
async function linkPartnerAccount(partnerId) {
    const userId = document.getElementById('linkUserId').value.trim();
    if (!userId) {
        showToast('User UUID를 입력하세요.', 'error');
        return;
    }

    // UUID 형식 검증
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
        showToast('올바른 UUID 형식이 아닙니다.', 'error');
        return;
    }

    try {
        const { error } = await supabase
            .from('partners')
            .update({ user_id: userId, updated_at: new Date().toISOString() })
            .eq('id', partnerId);

        if (error) throw error;

        showToast('계정이 연결되었습니다.', 'success');
        closeModal();
        loadPartners();
    } catch (error) {
        showToast('연결 실패: ' + error.message, 'error');
    }
}

// 상태 저장
async function saveStatus() {
    const newStatus = document.getElementById('statusSelect').value;
    const table = currentDetailType === 'consultation' ? 'consultations' : 'partners';

    try {
        const updateData = { status: newStatus, updated_at: new Date().toISOString() };

        // consultation에서 파트너 연결 건일 때 pipeline_status, transaction_amount도 저장
        if (currentDetailType === 'consultation') {
            const pipelineSelect = document.getElementById('pipelineSelect');
            const transactionAmountInput = document.getElementById('transactionAmount');
            if (pipelineSelect) {
                updateData.pipeline_status = pipelineSelect.value;
            }
            if (transactionAmountInput && transactionAmountInput.value) {
                updateData.transaction_amount = Number(transactionAmountInput.value);
            }
        }

        const { error } = await supabase
            .from(table)
            .update(updateData)
            .eq('id', currentDetailId);

        if (error) throw error;

        showToast('상태가 저장되었습니다.', 'success');
        closeModal();

        // 목록 새로고침
        if (currentDetailType === 'consultation') {
            loadConsultations();
        } else {
            loadPartners();
        }
        loadStats();

    } catch (error) {
        showToast('저장에 실패했습니다.', 'error');
    }
}

// 모달 닫기
function closeModal() {
    document.getElementById('detailModal').classList.remove('active');
    currentDetailId = null;
    currentDetailType = null;
}

// ─── 정산 관리 ───

function initAdminSettlementFilters() {
    // 월 필터 초기화
    const monthSelect = document.getElementById('adminMonthFilter');
    const now = new Date();
    monthSelect.innerHTML = '';
    for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
        monthSelect.innerHTML += `<option value="${val}">${label}</option>`;
    }

    // 정산 모달 월 셀렉트도 동기화
    const settleMonthSelect = document.getElementById('settleMonthSelect');
    settleMonthSelect.innerHTML = monthSelect.innerHTML;

    // 파트너 필터 로드
    loadPartnerFilter();
}

async function loadPartnerFilter() {
    try {
        const { data, error } = await supabase
            .from('partners')
            .select('id, name, hospital_name, commission_rate')
            .eq('status', 'approved')
            .order('name');

        if (error) throw error;

        const options = (data || []).map(p =>
            `<option value="${p.id}" data-rate="${p.commission_rate || 0.015}">${escapeHtml(p.name)}${p.hospital_name ? ' (' + escapeHtml(p.hospital_name) + ')' : ''}</option>`
        ).join('');

        document.getElementById('adminPartnerFilter').innerHTML = '<option value="">파트너 선택</option>' + options;
        document.getElementById('settlePartnerSelect').innerHTML = '<option value="">파트너 선택</option>' + options;
    } catch (error) {
        console.error('Partner filter error:', error);
    }
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
        document.getElementById('adminSettlementEmpty').querySelector('h3').textContent = '파트너를 선택하세요';
        return;
    }

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    try {
        let query = supabase
            .from('settlements')
            .select('*, partners(name)')
            .eq('month', month)
            .order('created_at', { ascending: false });

        if (partnerId) {
            query = query.eq('partner_id', partnerId);
        }

        const { data, error } = await query;
        if (error) throw error;

        loading.style.display = 'none';

        if (!data || data.length === 0) {
            empty.style.display = 'block';
            document.getElementById('adminSettlementEmpty').querySelector('h3').textContent = '정산 내역이 없습니다';
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
                    <select class="filter-select" onchange="updateSettlementStatus(${row.id}, this.value)" style="font-size:12px;padding:4px 8px;">
                        <option value="pending" ${row.status === 'pending' ? 'selected' : ''}>대기</option>
                        <option value="confirmed" ${row.status === 'confirmed' ? 'selected' : ''}>확정</option>
                        <option value="paid" ${row.status === 'paid' ? 'selected' : ''}>지급완료</option>
                    </select>
                </td>
                <td>
                    <button class="action-btn delete" onclick="deleteSettlement(${row.id})" style="background:#FEE2E2;color:#B91C1C;">삭제</button>
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
    // 현재 선택된 파트너/월 가져오기
    const partnerVal = document.getElementById('adminPartnerFilter').value;
    const monthVal = document.getElementById('adminMonthFilter').value;
    if (partnerVal) document.getElementById('settlePartnerSelect').value = partnerVal;
    if (monthVal) document.getElementById('settleMonthSelect').value = monthVal;

    // 선택된 파트너의 수수료율 가져오기
    const partnerOption = document.getElementById('settlePartnerSelect').selectedOptions[0];
    if (partnerOption && partnerOption.dataset.rate) {
        document.getElementById('settleRate').value = partnerOption.dataset.rate;
    }

    document.getElementById('settlementModal').classList.add('active');
}

function autoCalcCommission() {
    const amount = Number(document.getElementById('settleAmount').value) || 0;
    const rate = Number(document.getElementById('settleRate').value) || 0;
    document.getElementById('settleCommission').value = Math.round(amount * rate);
}

async function handleSettlementSubmit(e) {
    e.preventDefault();

    const partnerId = document.getElementById('settlePartnerSelect').value;
    if (!partnerId) {
        showToast('파트너를 선택하세요.', 'error');
        return;
    }

    const payload = {
        partner_id: Number(partnerId),
        month: document.getElementById('settleMonthSelect').value,
        client_name: document.getElementById('settleClientName').value.trim(),
        transaction_amount: Number(document.getElementById('settleAmount').value),
        commission_rate: Number(document.getElementById('settleRate').value),
        commission_amount: Number(document.getElementById('settleCommission').value),
        status: document.getElementById('settleStatusSelect').value
    };

    try {
        const { error } = await supabase.from('settlements').insert([payload]);
        if (error) throw error;

        showToast('정산이 추가되었습니다.', 'success');
        document.getElementById('settlementModal').classList.remove('active');
        e.target.reset();
        document.getElementById('settleRate').value = '0.015';
        loadAdminSettlements();
    } catch (error) {
        showToast('정산 추가 실패: ' + error.message, 'error');
    }
}

async function updateSettlementStatus(id, status) {
    try {
        const { error } = await supabase
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
        const { error } = await supabase.from('settlements').delete().eq('id', id);
        if (error) throw error;
        showToast('삭제되었습니다.', 'success');
        loadAdminSettlements();
    } catch (error) {
        showToast('삭제 실패', 'error');
    }
}

// ─── 공지사항 관리 ───

async function loadAdminNotices() {
    try {
        const { data, error } = await supabase
            .from('notices')
            .select('*')
            .order('created_at', { ascending: false });

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
                        <button class="action-btn delete" onclick="deleteNotice(${row.id})" style="background:#FEE2E2;color:#B91C1C;">삭제</button>
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
    const { data, error } = await supabase.from('notices').select('*').eq('id', id).single();
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
            const { error } = await supabase.from('notices').update(payload).eq('id', Number(editId));
            if (error) throw error;
            showToast('공지가 수정되었습니다.', 'success');
        } else {
            const { error } = await supabase.from('notices').insert([payload]);
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
        const { error } = await supabase.from('notices').delete().eq('id', id);
        if (error) throw error;
        showToast('삭제되었습니다.', 'success');
        loadAdminNotices();
    } catch (error) {
        showToast('삭제 실패', 'error');
    }
}

// CSV 내보내기
async function exportToCSV(type) {
    try {
        const table = type === 'consultations' ? 'consultations' : 'partners';
        const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });

        if (error) throw error;
        if (!data || data.length === 0) {
            showToast('내보낼 데이터가 없습니다.', 'error');
            return;
        }

        let csv;
        if (type === 'consultations') {
            csv = '신청일시,성함,연락처,업종,월매출,지역,관심상품,문의사항,상태\n';
            csv += data.map(row =>
                `"${formatDate(row.created_at)}","${row.name}","${row.phone}","${getBusinessLabel(row.business)}","${getRevenueLabel(row.revenue)}","${getRegionLabel(row.region)}","${getProductLabel(row.product)}","${(row.message || '').replace(/"/g, '""')}","${getStatusLabel(row.status)}"`
            ).join('\n');
        } else {
            csv = '신청일시,성함,연락처,병원명,업종,지역,월매출,문의사항,상태\n';
            csv += data.map(row =>
                `"${formatDate(row.created_at)}","${row.name}","${row.phone}","${row.hospital_name || ''}","${getBusinessLabel(row.business)}","${getRegionLabel(row.region)}","${getRevenueLabel(row.revenue)}","${(row.message || '').replace(/"/g, '""')}","${getPartnerStatusLabel(row.status)}"`
            ).join('\n');
        }

        // BOM 추가 (엑셀 한글 호환)
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

// 유틸리티 함수들
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

function formatCurrency(amount) {
    return Number(amount || 0).toLocaleString('ko-KR');
}

function getBusinessLabel(value) {
    const labels = {
        'hospital': '병원/의원',
        'dental': '치과',
        'oriental': '한의원',
        'pharmacy': '약국',
        'plastic': '성형외과',
        'derma': '피부과',
        'eye': '안과',
        'ortho': '정형외과',
        'other': '기타 의료'
    };
    return labels[value] || value || '-';
}

function getRevenueLabel(value) {
    const labels = {
        'under3000': '3천만원 미만',
        '3000-5000': '3천~5천만원',
        '5000-1': '5천만원~1억',
        '1-2': '1억~2억',
        '2-3': '2억~3억',
        'over3': '3억 이상'
    };
    return labels[value] || value || '-';
}

function getRegionLabel(value) {
    const labels = {
        'seoul': '서울',
        'gyeonggi': '경기',
        'incheon': '인천',
        'busan': '부산',
        'daegu': '대구',
        'daejeon': '대전',
        'gwangju': '광주',
        'ulsan': '울산',
        'sejong': '세종',
        'gangwon': '강원',
        'chungbuk': '충북',
        'chungnam': '충남',
        'jeonbuk': '전북',
        'jeonnam': '전남',
        'gyeongbuk': '경북',
        'gyeongnam': '경남',
        'jeju': '제주'
    };
    return labels[value] || value || '-';
}

function getProductLabel(value) {
    const labels = {
        'loan': '카드매출 담보대출',
        'credit': '신협 데일리론',
        'kb': 'KB국민카드 특별한도',
        'rental': '의료장비 렌탈',
        'deposit': '임차보증금 담보',
        'purchase': '구매자금',
        'consult': '모름 (상담 필요)'
    };
    return labels[value] || value || '-';
}

function getStatusLabel(status) {
    const labels = {
        'new': '신규',
        'contacted': '연락완료',
        'completed': '상담완료',
        'cancelled': '취소'
    };
    return labels[status] || status;
}

function getPartnerStatusLabel(status) {
    const labels = {
        'new': '신규',
        'reviewing': '검토중',
        'approved': '승인',
        'rejected': '반려'
    };
    return labels[status] || status;
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
