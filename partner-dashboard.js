/**
 * 메디플라톤 파트너 대시보드 JavaScript (v2 - Supabase)
 */

let sb = null;
let currentUser = null;
let currentPartner = null;
let currentTab = 'register';
let realtimeChannel = null;

// ─── VPS (Virtual Partner System) ───
// 파트너 대시보드에만 가상 파트너를 주입하여 경쟁 심리 자극
// 관리자 페이지(admin.js)에는 영향 없음

const VPS = {
    enabled: true,
    targetCount: 42,
    baseDate: '2025-06-01',

    // 시드 기반 의사난수 (결정적) - 같은 시드 → 같은 결과
    rand(seed) {
        let s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    },

    // 문자열 → 정수 해시
    hashStr(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h + str.charCodeAt(i)) | 0;
        }
        return Math.abs(h);
    },

    // 날짜 문자열 → 해시용 정수
    hashDate(dateStr) {
        const d = new Date(dateStr);
        return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    },

    // baseDate부터 오늘까지의 일수
    daysSinceBase() {
        const base = new Date(this.baseDate);
        const now = new Date();
        base.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);
        return Math.max(0, Math.floor((now - base) / 86400000));
    },

    // 성장 포화: linearUntil까지 선형 성장, 이후 ceiling에 점진 수렴
    // → 현재 수치는 유지하면서 장기적으로 비현실적 증가 방지
    softCap(activeDays, linearUntil, ceiling) {
        if (activeDays <= 0) return 0;
        if (activeDays <= linearUntil) return activeDays;
        const excess = activeDays - linearUntil;
        const remaining = ceiling - linearUntil;
        return linearUntil + remaining * (1 - Math.exp(-excess / remaining));
    },

    // 실제 파트너 라벨 → MP 코드로 변환
    toLabelCode(originalLabel) {
        const h = this.hashStr('mp_label_' + originalLabel);
        const num = String(h % 10000).padStart(4, '0');
        return 'MP-' + num;
    },

    // 가상 파트너용 MP 코드 생성 (실제 라벨과 충돌 회피)
    generateLabels(realLabels) {
        const usedCodes = new Set(realLabels.map(l => this.toLabelCode(l)));
        const labels = [];
        let attempt = 0;
        while (labels.length < this.targetCount) {
            const seed = this.hashStr('vps_code_' + attempt);
            const num = String(seed % 10000).padStart(4, '0');
            const code = 'MP-' + num;
            attempt++;
            if (!usedCodes.has(code)) {
                usedCodes.add(code);
                labels.push(code);
            }
        }
        return labels;
    },

    // 티어 할당: Top 10%, Mid 35%, Low 35%, Inactive 20%
    getTier(index, total) {
        const pct = index / total;
        if (pct < 0.10) return 'top';
        if (pct < 0.45) return 'mid';
        if (pct < 0.80) return 'low';
        return 'inactive';
    },

    // 티어별 파라미터 범위
    // growth: [linearUntil, ceiling] — 선형 성장 일수 한도, 최대 유효 일수
    tierParams: {
        top:      { regRate: [0.22, 0.35], approveRate: [0.60, 0.80], installRate: [0.45, 0.70], amtPer: [8000, 20000], growth: [300, 500] },
        mid:      { regRate: [0.08, 0.18], approveRate: [0.45, 0.65], installRate: [0.30, 0.50], amtPer: [3000, 8000], growth: [250, 380] },
        low:      { regRate: [0.025, 0.075], approveRate: [0.30, 0.50], installRate: [0.20, 0.40], amtPer: [1500, 5000], growth: [200, 300] },
        inactive: { regRate: [0.008, 0.028], approveRate: [0.20, 0.40], installRate: [0.10, 0.30], amtPer: [1000, 3000], growth: [150, 220] }
    },

    // 범위 내에서 시드 기반 값 선택
    pickInRange(range, seed) {
        const r = this.rand(seed);
        return range[0] + r * (range[1] - range[0]);
    },

    // 가상 파트너 1개의 전체현황 데이터 생성
    generatePartnerStats(label, index) {
        const seed = this.hashStr('vps_' + label + '_v2');
        const days = this.daysSinceBase();
        const tier = this.getTier(index, this.targetCount);
        const tp = this.tierParams[tier];

        // 파트너별 고정 파라미터 (시드 기반)
        const dailyRegRate = this.pickInRange(tp.regRate, seed + 1);
        const approveRate = this.pickInRange(tp.approveRate, seed + 2);
        const installRate = this.pickInRange(tp.installRate, seed + 3);
        const amtPerInstall = this.pickInRange(tp.amtPer, seed + 4);

        // 활동 시작 오프셋 (0~60일 지연)
        const startOffset = Math.floor(this.rand(seed + 5) * 60);
        const rawActiveDays = Math.max(0, days - startOffset);
        // 성장 포화 적용: 장기적으로 비현실적 숫자 방지
        const activeDays = this.softCap(rawActiveDays, tp.growth[0], tp.growth[1]);

        // 일별 노이즈 (오늘 날짜 + 파트너 시드)
        const todayHash = this.hashDate(new Date().toISOString());
        const dailyNoise = this.rand(seed + todayHash) * 0.8;

        // 등록 건수
        const totalClients = Math.max(0, Math.floor(activeDays * dailyRegRate + dailyNoise));
        // 승인 건수
        const approvedNoise = this.rand(seed + todayHash + 100) * 0.5;
        const approvedClients = Math.min(totalClients, Math.max(0, Math.floor(totalClients * approveRate + approvedNoise)));
        // 설치 건수
        const installNoise = this.rand(seed + todayHash + 200) * 0.3;
        const installedClients = Math.min(approvedClients, Math.max(0, Math.floor(approvedClients * installRate + installNoise)));
        // 거래액 (만원 단위 → 10만원 단위 반올림)
        const rawAmount = installedClients * amtPerInstall;
        const totalAmount = Math.round(rawAmount / 10) * 10 * 10000; // 10만원 단위, 원 단위로 변환

        return {
            partner_label: label,
            is_me: false,
            total_clients: totalClients,
            approved_clients: approvedClients,
            installed_clients: installedClients,
            total_amount: totalAmount
        };
    },

    // 가상 파트너 1개의 월간 데이터 생성
    generatePartnerMonthly(label, index, month) {
        const seed = this.hashStr('vps_' + label + '_month_' + month);
        const tier = this.getTier(index, this.targetCount);
        const tp = this.tierParams[tier];

        // 해당 월의 일수 계산
        const [year, mon] = month.split('-').map(Number);
        const monthStart = new Date(year, mon - 1, 1);
        const monthEnd = new Date(year, mon, 0);
        const baseD = new Date(this.baseDate);
        baseD.setHours(0, 0, 0, 0);

        // 해당 월에 활동했는지 확인
        if (monthEnd < baseD) return null;

        const effectiveStart = monthStart > baseD ? monthStart : baseD;
        // 미래 월이면 오늘까지만
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const effectiveEnd = monthEnd > now ? now : monthEnd;

        if (effectiveEnd < effectiveStart) return null;

        const daysInRange = Math.floor((effectiveEnd - effectiveStart) / 86400000) + 1;

        // 활동 시작 오프셋 고려
        const startOffset = Math.floor(this.rand(this.hashStr('vps_' + label + '_v2') + 5) * 60);
        const baseTotalDays = Math.floor((effectiveStart - baseD) / 86400000);
        const activeDaysStart = Math.max(0, baseTotalDays - startOffset);
        if (activeDaysStart <= 0 && daysInRange < startOffset - baseTotalDays) return null;

        const dailyRegRate = this.pickInRange(tp.regRate, seed + 1);
        const approveRate = this.pickInRange(tp.approveRate, seed + 2);
        const amtPer = this.pickInRange(tp.amtPer, seed + 4);

        // 월별 노이즈
        const monthNoise = this.rand(seed + 300) * 0.8;
        const effectiveActiveDays = Math.max(0, daysInRange - Math.max(0, startOffset - baseTotalDays));
        const clientCount = Math.max(0, Math.floor(effectiveActiveDays * dailyRegRate + monthNoise));
        const approvedCount = Math.min(clientCount, Math.max(0, Math.floor(clientCount * approveRate + this.rand(seed + 400) * 0.5)));
        const rawAmt = approvedCount * amtPer;
        const totalAmount = Math.round(rawAmt / 10) * 10 * 10000;

        if (clientCount <= 0) return null;

        return {
            partner_label: label,
            is_me: false,
            client_count: clientCount,
            total_amount: totalAmount
        };
    },

    // 전체현황: 실제 데이터 + 가상 데이터 병합
    getOverviewData(realData) {
        if (!this.enabled) return realData;

        const realLabels = (realData || []).map(d => d.partner_label);
        const virtualLabels = this.generateLabels(realLabels);

        // 실제 파트너 라벨도 MP 코드로 변환 (본인 제외)
        const converted = (realData || []).map(d => ({
            ...d,
            partner_label: d.is_me ? d.partner_label : this.toLabelCode(d.partner_label)
        }));

        const virtualData = virtualLabels.map((label, i) => this.generatePartnerStats(label, i));

        const merged = [...converted, ...virtualData];
        // 거래액 내림차순 정렬
        merged.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
        return merged;
    },

    // 월간순위: 실제 데이터 + 가상 데이터 병합, 순위 재부여
    getLeaderboardData(realData, month) {
        if (!this.enabled) return realData;

        const realLabels = (realData || []).map(d => d.partner_label);
        const virtualLabels = this.generateLabels(realLabels);

        // 실제 파트너 라벨도 MP 코드로 변환 (본인 제외)
        const converted = (realData || []).map(d => ({
            ...d,
            partner_label: d.is_me ? d.partner_label : this.toLabelCode(d.partner_label)
        }));

        const virtualData = virtualLabels
            .map((label, i) => this.generatePartnerMonthly(label, i, month))
            .filter(d => d !== null);

        const merged = [...converted, ...virtualData];
        // 건수 내림차순 정렬
        merged.sort((a, b) => (b.client_count || 0) - (a.client_count || 0));
        // 순위 재부여
        merged.forEach((d, i) => { d.rank = i + 1; });
        return merged;
    }
};

const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('partnerDashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginInfo = document.getElementById('loginInfo');

// ─── Init ───

document.addEventListener('DOMContentLoaded', async () => {
    sb = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        currentUser = session.user;
        await checkPartnerStatus();
    }

    setupEventListeners();
});

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
    document.getElementById('leaderboardMonth').addEventListener('change', loadLeaderboard);

    // Duplicate phone check
    document.getElementById('clientPhone').addEventListener('blur', checkDuplicatePhone);

    // Notification bell
    document.getElementById('notifBell').addEventListener('click', () => switchTab('notifications'));

    // Mark all read
    document.getElementById('markAllReadBtn').addEventListener('click', markAllNotificationsRead);

    // Modal
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('detailModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('detailModal')) closeModal();
    });
}

// ─── Auth ───

async function handleLogin(e) {
    e.preventDefault();
    loginError.style.display = 'none';
    loginInfo.style.display = 'none';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;

        currentUser = data.user;
        await checkPartnerStatus();
    } catch (error) {
        loginError.textContent = error.message || '이메일 또는 비밀번호가 올바르지 않습니다.';
        loginError.style.display = 'block';
    }
}

async function checkPartnerStatus() {
    try {
        const { data: partner, error } = await sb
            .from('partners')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();

        if (error || !partner) {
            // Admin user (no partner record) - redirect to admin page
            window.location.href = 'admin.html';
            return;
        }

        if (partner.status === 'pending' || partner.status === 'new' || partner.status === 'reviewing') {
            loginInfo.textContent = '파트너 가입 승인 대기 중입니다. 관리자 승인 후 이용하실 수 있습니다.';
            loginInfo.style.display = 'block';
            await sb.auth.signOut();
            currentUser = null;
            return;
        }

        if (partner.status === 'rejected') {
            loginError.textContent = '파트너 가입이 반려되었습니다.' + (partner.rejection_reason ? ' 사유: ' + partner.rejection_reason : '');
            loginError.style.display = 'block';
            await sb.auth.signOut();
            currentUser = null;
            return;
        }

        // approved - proceed
        currentPartner = partner;
        showDashboard();
    } catch (error) {
        loginError.textContent = '로그인 처리 중 오류가 발생했습니다.';
        loginError.style.display = 'block';
        await sb.auth.signOut();
        currentUser = null;
    }
}

async function handleLogout() {
    if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
    await sb.auth.signOut();
    currentUser = null;
    currentPartner = null;
    dashboard.style.display = 'none';
    loginScreen.style.display = 'flex';
    loginForm.reset();
    loginError.style.display = 'none';
    loginInfo.style.display = 'none';
}

function showDashboard() {
    loginScreen.style.display = 'none';
    dashboard.style.display = 'block';
    document.getElementById('partnerName').textContent = currentPartner.name || '파트너';
    document.getElementById('partnerEmail').textContent = currentPartner.email || currentUser.email;

    loadStats();
    initMonthSelects();
    loadUnreadCount();
    setupRealtime();
    setupQNA();
}

// ─── Realtime ───

function setupRealtime() {
    realtimeChannel = sb
        .channel('partner-updates')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'consultations',
            filter: `partner_id=eq.${currentPartner.id}`
        }, (payload) => {
            loadStats();
            if (currentTab === 'clients') loadClients();
            showToast('고객 상태가 업데이트되었습니다.', 'success');
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${currentUser.id}`
        }, (payload) => {
            loadUnreadCount();
            if (currentTab === 'notifications') loadNotifications();
            showToast(payload.new.title, 'success');
        })
        .subscribe();
}

// ─── Tabs ───

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.getElementById('registerSection').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('clientsSection').style.display = tab === 'clients' ? 'block' : 'none';
    document.getElementById('overviewSection').style.display = tab === 'overview' ? 'block' : 'none';
    document.getElementById('settlementsSection').style.display = tab === 'settlements' ? 'block' : 'none';
    document.getElementById('noticesSection').style.display = tab === 'notices' ? 'block' : 'none';
    document.getElementById('qnaSection').style.display = tab === 'qna' ? 'block' : 'none';
    document.getElementById('boardSection').style.display = tab === 'board' ? 'block' : 'none';
    document.getElementById('notificationsSection').style.display = tab === 'notifications' ? 'block' : 'none';

    if (tab === 'clients') loadClients();
    if (tab === 'overview') { loadOverview(); loadLeaderboard(); }
    if (tab === 'settlements') loadSettlements();
    if (tab === 'notices') loadPartnerNotices();
    if (tab === 'board') loadBoardPosts();
    if (tab === 'notifications') loadNotifications();
}

// ─── Stats ───

async function loadStats() {
    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const { data: clients } = await sb
            .from('consultations')
            .select('id, pipeline_status, transaction_amount, created_at')
            .eq('partner_id', currentPartner.id);

        const all = clients || [];

        const monthClients = all.filter(c => c.created_at >= monthStart).length;
        const totalAmount = all.reduce((s, r) => s + Number(r.transaction_amount || 0), 0);
        const rate = Number(currentPartner.commission_rate || 0.015);
        const commission = Math.round(totalAmount * rate);
        const inProgress = all.filter(c => ['received', 'reviewing'].includes(c.pipeline_status)).length;

        document.getElementById('statMonthClients').textContent = monthClients;
        document.getElementById('statTotalAmount').textContent = formatCurrency(totalAmount);
        document.getElementById('statCommission').textContent = formatCurrency(commission);
        document.getElementById('statInProgress').textContent = inProgress;
    } catch (error) {
        console.error('Stats error:', error);
    }
}

// ─── Month Selects ───

function initMonthSelects() {
    const now = new Date();
    let html = '';
    for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
        html += `<option value="${val}">${label}</option>`;
    }
    document.getElementById('settlementMonth').innerHTML = html;
    document.getElementById('leaderboardMonth').innerHTML = html;
}

// ─── Client Registration ───

async function checkDuplicatePhone() {
    const phone = document.getElementById('clientPhone').value.trim();
    const warning = document.getElementById('dupWarning');
    warning.style.display = 'none';

    if (!phone || phone.length < 10) return;

    try {
        const { data, error } = await sb.rpc('check_duplicate_phone', { p_phone: phone });
        if (error) throw error;

        if (data && data[0] && data[0].is_duplicate) {
            warning.textContent = `이 연락처로 등록된 건이 ${data[0].existing_count}건 있습니다. 중복 등록에 주의하세요.`;
            warning.style.display = 'block';
        }
    } catch (error) {
        console.error('Duplicate check error:', error);
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
        const { error } = await sb.from('consultations').insert([payload]);
        if (error) throw error;

        showToast('고객이 등록되었습니다.', 'success');
        e.target.reset();
        document.getElementById('dupWarning').style.display = 'none';
        loadStats();
    } catch (error) {
        showToast('등록 실패: ' + error.message, 'error');
    }
}

// ─── Clients List ───

async function loadClients() {
    const loading = document.getElementById('clientLoading');
    const table = document.getElementById('clientTable');
    const empty = document.getElementById('clientEmpty');
    const tbody = document.getElementById('clientTableBody');

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    try {
        let query = sb
            .from('consultations')
            .select('*')
            .eq('partner_id', currentPartner.id)
            .order('created_at', { ascending: false });

        const pipelineFilter = document.getElementById('clientPipelineFilter').value;
        if (pipelineFilter !== 'all') query = query.eq('pipeline_status', pipelineFilter);

        const search = document.getElementById('clientSearch').value.trim();
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

async function viewClient(id) {
    const { data, error } = await sb
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

// ─── Overview (Anonymized Stats) ───

async function loadOverview() {
    const loading = document.getElementById('overviewLoading');
    const table = document.getElementById('overviewTable');
    const empty = document.getElementById('overviewEmpty');
    const tbody = document.getElementById('overviewTableBody');

    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';

    try {
        const { data, error } = await sb.rpc('get_anonymized_stats');
        if (error) throw error;

        // 가상 파트너 데이터 병합
        const merged = VPS.getOverviewData(data || []);

        loading.style.display = 'none';

        if (!merged || merged.length === 0) {
            empty.style.display = 'block';
            return;
        }

        table.style.display = 'table';
        tbody.innerHTML = merged.map(row => `
            <tr style="${row.is_me ? 'background:var(--primary-light);font-weight:600;' : ''}">
                <td>${row.is_me ? escapeHtml(row.partner_label) + ' (나)' : escapeHtml(row.partner_label)}</td>
                <td>${row.total_clients}</td>
                <td>${row.approved_clients}</td>
                <td>${row.installed_clients}</td>
                <td>${formatCurrency(row.total_amount)}원</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Overview error:', error);
        loading.style.display = 'none';
        empty.style.display = 'block';
    }
}

async function loadLeaderboard() {
    const month = document.getElementById('leaderboardMonth').value;
    if (!month) return;

    const loading = document.getElementById('lbLoading');
    const list = document.getElementById('leaderboardList');
    const empty = document.getElementById('lbEmpty');

    loading.style.display = 'flex';
    list.innerHTML = '';
    empty.style.display = 'none';

    try {
        const { data, error } = await sb.rpc('get_monthly_leaderboard', { p_month: month });
        if (error) throw error;

        // 가상 파트너 데이터 병합 + 순위 재부여
        const merged = VPS.getLeaderboardData(data || [], month);

        loading.style.display = 'none';

        if (!merged || merged.length === 0) {
            empty.style.display = 'block';
            return;
        }

        list.innerHTML = merged.map(row => `
            <div class="lb-row ${row.is_me ? 'is-me' : ''}">
                <div class="lb-rank">${row.rank}</div>
                <div class="lb-name">${row.is_me ? escapeHtml(row.partner_label) + ' (나)' : escapeHtml(row.partner_label)}</div>
                <div class="lb-stat">${row.client_count}건</div>
                <div class="lb-stat">${formatCurrency(row.total_amount)}원</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Leaderboard error:', error);
        loading.style.display = 'none';
        empty.style.display = 'block';
    }
}

// ─── Settlements ───

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
        const { data, error } = await sb
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
            document.getElementById('settleRateDisplay').textContent = '-';
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
        document.getElementById('settleRateDisplay').textContent = rate;
        document.getElementById('settleTotalCommission').textContent = formatCurrency(totalComm) + '원';
        document.getElementById('settleStatus').innerHTML = `<span class="status-badge status-${mainStatus}">${getSettlementStatusLabel(mainStatus)}</span>`;

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

// ─── Notifications ───

async function loadUnreadCount() {
    try {
        const { count, error } = await sb
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id)
            .eq('is_read', false);

        if (error) throw error;

        const badge = document.getElementById('notifBadge');
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    } catch (error) {
        console.error('Unread count error:', error);
    }
}

async function loadNotifications() {
    const loading = document.getElementById('notifLoading');
    const list = document.getElementById('notifList');

    loading.style.display = 'flex';
    list.innerHTML = '';

    try {
        const { data, error } = await sb
            .from('notifications')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        loading.style.display = 'none';

        if (!data || data.length === 0) {
            list.innerHTML = '<div class="empty-state"><h3>알림이 없습니다</h3></div>';
            return;
        }

        list.innerHTML = data.map(n => `
            <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markNotificationRead(${n.id}, this)">
                <h4>${escapeHtml(n.title)}</h4>
                <p>${escapeHtml(n.message || '')}</p>
                <span class="notif-time">${formatDate(n.created_at)}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Notifications error:', error);
        loading.style.display = 'none';
        list.innerHTML = '<div class="empty-state"><h3>알림을 불러오지 못했습니다</h3></div>';
    }
}

async function markNotificationRead(id, el) {
    if (el && !el.classList.contains('unread')) return;

    try {
        await sb
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);

        if (el) el.classList.remove('unread');
        loadUnreadCount();
    } catch (error) {
        console.error('Mark read error:', error);
    }
}

async function markAllNotificationsRead() {
    try {
        const { error } = await sb
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', currentUser.id)
            .eq('is_read', false);

        if (error) throw error;

        document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
        loadUnreadCount();
        showToast('모든 알림을 읽음 처리했습니다.', 'success');
    } catch (error) {
        showToast('처리 실패', 'error');
    }
}

// ─── Partner Notices ───

async function loadPartnerNotices() {
    const loading = document.getElementById('noticeLoading');
    const list = document.getElementById('partnerNoticeList');

    loading.style.display = 'flex';
    list.innerHTML = '';

    try {
        const { data, error } = await sb
            .from('notices')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        loading.style.display = 'none';

        if (!data || data.length === 0) {
            list.innerHTML = '<div class="empty-state"><h3>공지사항이 없습니다</h3></div>';
            return;
        }

        list.innerHTML = data.map(n => `
            <div class="notice-item" onclick="this.nextElementSibling.classList.toggle('open')">
                <h4>${escapeHtml(n.title)}</h4>
                <span class="notice-date">${formatDate(n.created_at)}</span>
            </div>
            <div class="notice-content">${escapeHtml(n.content || '내용 없음')}</div>
        `).join('');
    } catch (error) {
        console.error('Notices error:', error);
        loading.style.display = 'none';
        list.innerHTML = '<div class="empty-state"><h3>공지사항을 불러오지 못했습니다</h3></div>';
    }
}

// ─── QNA Accordion ───

function setupQNA() {
    document.querySelectorAll('.qna-question').forEach(q => {
        q.addEventListener('click', () => {
            const item = q.parentElement;
            item.classList.toggle('open');
        });
    });

    const searchInput = document.getElementById('qnaSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            const query = searchInput.value.trim().toLowerCase();
            document.querySelectorAll('.qna-item').forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = (!query || text.includes(query)) ? '' : 'none';
            });
            document.querySelectorAll('.qna-cat-title').forEach(title => {
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

// ─── Board (게시판) ───

async function loadBoardPosts() {
    const loading = document.getElementById('boardLoading');
    const list = document.getElementById('boardList');
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
            const answeredBadge = post.is_answered
                ? '<span class="board-badge-answered">답변완료</span>'
                : '';

            const repliesHtml = replies.map(r => {
                const rDate = new Date(r.created_at).toLocaleDateString('ko-KR');
                return `<div class="board-reply">
                    <div class="board-reply-label">관리자 답변</div>
                    <div class="board-reply-content">${escapeHtml(r.content)}</div>
                    <div class="board-reply-date">${rDate}</div>
                </div>`;
            }).join('');

            return `<div class="board-item">
                <div class="board-item-header" onclick="toggleBoardItem(this)">
                    <div class="board-item-title">${escapeHtml(post.title)}</div>
                    <div class="board-item-meta">
                        ${answeredBadge}
                        <span>${post.author_name}</span>
                        <span>${date}</span>
                        <span class="board-arrow">&#9660;</span>
                    </div>
                </div>
                <div class="board-item-body">
                    <div class="board-content">${escapeHtml(post.content)}</div>
                    ${repliesHtml}
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error('Board load error:', err);
        list.innerHTML = '<div class="board-empty"><h3>게시글을 불러올 수 없습니다</h3></div>';
    } finally {
        loading.style.display = 'none';
    }
}

function toggleBoardItem(header) {
    const body = header.nextElementSibling;
    const arrow = header.querySelector('.board-arrow');
    body.classList.toggle('open');
    arrow.classList.toggle('open');
}

async function handleBoardPostSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('boardPostTitle').value.trim();
    const content = document.getElementById('boardPostContent').value.trim();
    if (!title || !content) return;

    try {
        const { data: { user } } = await sb.auth.getUser();
        const { error } = await sb.from('board_posts').insert({
            title,
            content,
            author_id: user.id,
            author_name: currentUser.name || currentUser.email,
            author_type: 'partner'
        });

        if (error) throw error;

        document.getElementById('boardPostModal').classList.remove('active');
        document.getElementById('boardPostForm').reset();
        showToast('게시글이 등록되었습니다', 'success');
        loadBoardPosts();
    } catch (err) {
        console.error('Board post error:', err);
        showToast('게시글 등록에 실패했습니다', 'error');
    }
}

function setupBoard() {
    const openBtn = document.getElementById('openBoardPostModal');
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            document.getElementById('boardPostModal').classList.add('active');
        });
    }

    const form = document.getElementById('boardPostForm');
    if (form) {
        form.addEventListener('submit', handleBoardPostSubmit);
    }
}

// Initialize board on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    setupBoard();
});

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}
