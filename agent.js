(function () {
    'use strict';

    const sb = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    window.sb = sb;

    const CONTRACT_VERSION = 'v1.0';
    const CONTRACT_BODY = `
<h3>영업위탁계약서</h3>
<p>주식회사 메디플라톤(이하 "회사")과 영업자(이하 "영업자")는 다음과 같이 영업위탁계약을 체결합니다.</p>

<h3>제1조 (목적)</h3>
<p>본 계약은 회사가 보유한 잠재고객 데이터(이하 "DB")를 영업자에게 제공하여 영업자가 회사의 금융상품 안내 영업을 수행하고, 그에 따른 수익을 분배하는 데 필요한 사항을 정함을 목적으로 한다.</p>

<h3>제2조 (영업자의 의무)</h3>
<p>① 영업자는 회사가 정한 절차와 방법에 따라 성실하게 영업 활동을 수행한다.<br>
② 영업자는 본인이 회사 시스템에 접속하여 DB를 열람·접촉한 모든 활동을 회사 시스템에 기록되도록 협조한다.</p>

<h3>제3조 (기밀유지)</h3>
<p>① 영업자는 회사로부터 제공받은 모든 DB와 회사의 영업비밀에 해당하는 정보를 제3자에게 누설·전달·복제·반출하지 아니한다.<br>
② 영업자는 DB를 외부 저장매체로 다운로드하거나 화면 캡처·촬영·녹화·인쇄하지 아니한다.<br>
③ 본 조의 의무는 본 계약 종료 이후에도 <strong>영구히</strong> 적용된다.</p>

<h3>제4조 (DB의 영구 귀속)</h3>
<p>① 회사가 영업자에게 제공한 DB는 제공 시점부터 <strong>영구히 회사의 영업자산</strong>이며, 영업자의 활동 종료, 본 계약 해지, 시간 경과와 무관하게 본 조항이 적용된다.<br>
② 영업자는 본 계약 종료 후에도 회사가 제공한 DB를 회사의 사전 서면 동의 없이 어떠한 형태로도 사용할 수 없다.</p>

<h3>제5조 (수익의 분배)</h3>
<p>① 영업자가 회사 시스템을 통해 컨택하거나 열람한 DB의 잠재고객이 향후 어떠한 시점에서든 회사의 시스템을 통해 어떠한 금융상품(대출, 리스, 렌탈, 카드 등)으로든 실행 완료된 경우, 회사가 수령하는 수수료 등 수익의 <strong>50%(50:50 비율)</strong>를 영업자에게 분배한다.<br>
② 본 조의 적용 대상 매칭은 <strong>전화번호와 성명의 일치</strong>로 판정하며, DB가 제공된 시점으로부터의 경과 기간을 불문한다.<br>
③ 영업자가 회사의 시스템 외 채널을 통해 동일 DB를 활용하여 대출 등을 발생시킨 경우, 영업자는 즉시 회사에 이를 서면 통지하여야 하며, 통지가 이루어진 경우에 한하여 본 조 ①항의 분배 대상이 된다. 통지를 게을리한 경우 제8조의 위약벌이 부과된다.</p>

<h3>제6조 (정산)</h3>
<p>① 회사는 매월 말 기준으로 전월 1일부터 말일까지 발생한 분배 수익을 정산하여 익월 15일까지 영업자가 지정한 계좌로 지급한다.<br>
② 영업자는 정산 내역을 회사 시스템에서 조회할 수 있다.</p>

<h3>제7조 (계약 기간 및 해지)</h3>
<p>① 본 계약의 효력은 영업자의 서명일로부터 발생하며, 별도의 정함이 없는 한 자동으로 유지된다.<br>
② 일방 당사자는 상대방에게 30일 전 서면 통지로 본 계약을 해지할 수 있다.<br>
③ 본 계약의 해지에도 불구하고 제3조(기밀유지), 제4조(DB의 영구 귀속), 제5조(수익의 분배), 제8조(위약벌)의 효력은 영구히 존속한다.</p>

<h3>제8조 (위약벌)</h3>
<p>① 영업자가 다음 각 호의 행위를 한 경우, 1건당 일금 <strong>금500만원(₩5,000,000)</strong>의 위약벌을 회사에 지급한다.<br>
&nbsp;&nbsp;1. DB의 외부 반출, 캡처, 제3자 전달<br>
&nbsp;&nbsp;2. 회사 시스템 외 채널로 DB를 활용하여 발생한 대출 등 거래를 회사에 즉시 통지하지 아니한 경우(이하 "묵인실행")<br>
② 묵인실행이 적발된 경우 위 ①항의 위약벌과 별도로, 해당 거래로 영업자가 취득한 금액 전액에 대한 손해배상을 청구할 수 있다.<br>
③ 본 조의 위약벌은 손해배상액의 예정이 아닌 위약벌의 성격을 가지며, 회사는 별도로 실손해를 입증하여 추가 배상을 청구할 수 있다.</p>

<h3>제9조 (분쟁해결 및 관할)</h3>
<p>본 계약과 관련하여 발생한 분쟁은 회사의 본점 소재지 관할법원을 전속관할로 한다.</p>

<h3>제10조 (전자서명의 효력)</h3>
<p>본 계약의 서명은 전자서명법에 따른 전자서명으로 갈음하며, 서명 시점에 기록되는 IP 주소, 디바이스 정보, 타임스탬프, 해시값과 함께 자필 서명과 동일한 법적 효력을 가진다.</p>

<p style="margin-top:24px;text-align:right;color:var(--gray-500);font-size:12px;">계약서 버전: ${CONTRACT_VERSION}</p>
    `.trim();

    function $(id) { return document.getElementById(id); }
    function showAlert(elId, msg, type) {
        const el = $(elId);
        if (!el) return alert(msg);
        el.textContent = msg;
        el.className = 'alert ' + (type || 'error');
        el.style.display = 'block';
        if (type !== 'error') setTimeout(() => { el.style.display = 'none'; }, 5000);
    }
    function clearAlert(elId) {
        const el = $(elId);
        if (el) el.style.display = 'none';
    }

    function showView(name) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const target = $(name + 'View');
        if (target) target.classList.add('active');
    }

    async function init() {
        setupAuthTabs();
        setupAuthForms();
        setupContractView();
        setupLogoutBtns();

        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            await routeBySession();
        } else {
            showView('auth');
        }

        sb.auth.onAuthStateChange(async (event) => {
            if (event === 'SIGNED_IN') await routeBySession();
            if (event === 'SIGNED_OUT') showView('auth');
        });
    }

    async function routeBySession() {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return showView('auth');

        const { data: agent, error } = await sb.from('agents').select('*').eq('id', user.id).maybeSingle();
        if (error) {
            showAlert('authError', '프로필 조회 실패: ' + error.message);
            return;
        }
        if (!agent) {
            showAlert('authError', '영업자 프로필이 없습니다. 회원가입이 필요합니다.');
            await sb.auth.signOut();
            showView('auth');
            return;
        }

        switch (agent.status) {
            case 'pending':
                showView('pending');
                break;
            case 'contract_sent':
                renderContract();
                showView('contract');
                break;
            case 'contract_signed':
            case 'active':
                window.location.href = 'agent-dashboard.html';
                break;
            case 'suspended':
                $('terminatedTitle').textContent = '계정이 정지되었습니다';
                $('terminatedReason').textContent = agent.suspended_reason || '관리자에게 문의해 주세요.';
                showView('terminated');
                break;
            case 'terminated':
                $('terminatedTitle').textContent = '계정이 해지되었습니다';
                $('terminatedReason').textContent = '계약이 해지되었습니다. 새로운 영업 활동은 불가합니다.';
                showView('terminated');
                break;
            default:
                showView('pending');
        }
    }

    function setupAuthTabs() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                $('loginForm').style.display = target === 'login' ? 'block' : 'none';
                $('registerForm').style.display = target === 'register' ? 'block' : 'none';
                clearAlert('authError'); clearAlert('authSuccess');
            };
        });
    }

    function setupAuthForms() {
        $('loginForm').onsubmit = async (e) => {
            e.preventDefault();
            clearAlert('authError');
            const btn = $('loginBtn'); btn.disabled = true; btn.textContent = '로그인 중...';
            try {
                const { error } = await sb.auth.signInWithPassword({
                    email: $('loginEmail').value.trim(),
                    password: $('loginPassword').value
                });
                if (error) throw error;
            } catch (err) {
                showAlert('authError', err.message);
            } finally {
                btn.disabled = false; btn.textContent = '로그인';
            }
        };

        $('registerForm').onsubmit = async (e) => {
            e.preventDefault();
            clearAlert('authError');

            const email = $('regEmail').value.trim();
            const password = $('regPassword').value;
            const password2 = $('regPassword2').value;
            const name = $('regName').value.trim();
            const phone = $('regPhone').value.trim();
            const rrn = $('regRrn').value.trim();
            const bank = $('regBank').value;
            const holder = $('regHolder').value.trim();
            const account = $('regAccount').value.trim().replace(/[^0-9]/g, '');

            if (password !== password2) return showAlert('authError', '비밀번호가 일치하지 않습니다.');
            if (password.length < 6) return showAlert('authError', '비밀번호는 6자 이상이어야 합니다.');
            if (!name || !phone) return showAlert('authError', '성함과 연락처는 필수입니다.');

            const btn = $('registerBtn'); btn.disabled = true; btn.textContent = '신청 중...';

            try {
                await sb.auth.signOut().catch(() => {});

                const { error: signUpErr } = await sb.auth.signUp({ email, password });
                if (signUpErr) {
                    const msg = (signUpErr.message || '').toLowerCase();
                    const alreadyRegistered = msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already');
                    if (!alreadyRegistered) throw signUpErr;
                }

                const { data: signInData, error: signInErr } = await sb.auth.signInWithPassword({ email, password });

                if (signInErr) {
                    const lower = (signInErr.message || '').toLowerCase();
                    if (lower.includes('email not confirmed')) {
                        showAlert('authSuccess', '인증 메일이 발송되었습니다. 이메일에서 링크를 클릭한 뒤 로그인 탭에서 다시 시도해 주세요.', 'success');
                        $('registerForm').reset();
                        return;
                    }
                    if (lower.includes('invalid login') || lower.includes('invalid_credentials')) {
                        throw new Error('이미 가입된 이메일이지만 비밀번호가 일치하지 않습니다. 로그인 탭에서 시도하시거나 관리자(0507-1434-3226)에게 비밀번호 재설정을 요청해 주세요.');
                    }
                    throw signInErr;
                }

                const activeSession = signInData && signInData.session;
                if (!activeSession || !activeSession.access_token) {
                    throw new Error('세션 발급 실패: signInData.session=' + JSON.stringify(signInData && signInData.session));
                }

                await sb.auth.setSession({
                    access_token: activeSession.access_token,
                    refresh_token: activeSession.refresh_token
                });

                const rpcRes = await fetch(SUPABASE_CONFIG.url + '/rest/v1/rpc/register_agent_profile', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_CONFIG.anonKey,
                        'Authorization': 'Bearer ' + activeSession.access_token
                    },
                    body: JSON.stringify({
                        p_name: name,
                        p_phone: phone,
                        p_email: email,
                        p_rrn_masked: rrn || null,
                        p_bank_name: bank || null,
                        p_account_holder: holder || null,
                        p_account_number: account || null
                    })
                });
                if (!rpcRes.ok) {
                    let detail = '';
                    try {
                        const j = await rpcRes.json();
                        detail = j.message || j.msg || j.error_description || JSON.stringify(j);
                    } catch (_) {
                        detail = await rpcRes.text();
                    }
                    throw new Error('프로필 등록 실패 (' + rpcRes.status + '): ' + detail);
                }

                showAlert('authSuccess', '회원가입 신청 완료. 관리자 승인 후 계약서 서명이 가능합니다.', 'success');
                $('registerForm').reset();

                setTimeout(() => routeBySession(), 1200);
            } catch (err) {
                showAlert('authError', err.message);
            } finally {
                btn.disabled = false; btn.textContent = '회원가입 신청';
            }
        };
    }

    function setupLogoutBtns() {
        const handler = async () => {
            await sb.auth.signOut();
            showView('auth');
        };
        const btn1 = $('pendingLogoutBtn'); if (btn1) btn1.onclick = handler;
        const btn2 = $('termLogoutBtn'); if (btn2) btn2.onclick = handler;
    }

    let canvas, ctx, drawing = false, hasDrawn = false, lastX = 0, lastY = 0;

    function setupContractView() {
        canvas = $('signatureCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#111827';

        const start = (e) => {
            drawing = true; hasDrawn = true;
            const p = getPos(e);
            lastX = p.x; lastY = p.y;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            updateStatus();
            updateSubmitBtn();
        };
        const move = (e) => {
            if (!drawing) return;
            e.preventDefault();
            const p = getPos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            lastX = p.x; lastY = p.y;
        };
        const end = () => { drawing = false; };

        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        canvas.addEventListener('mouseup', end);
        canvas.addEventListener('mouseleave', end);
        canvas.addEventListener('touchstart', start);
        canvas.addEventListener('touchmove', move, { passive: false });
        canvas.addEventListener('touchend', end);

        $('clearSignBtn').onclick = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            hasDrawn = false;
            updateStatus();
            updateSubmitBtn();
        };

        document.querySelectorAll('.agree-check').forEach(cb => cb.onchange = updateSubmitBtn);

        $('submitSignBtn').onclick = submitSignature;
    }

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    }

    function updateStatus() {
        $('signatureStatus').textContent = hasDrawn ? '서명 완료' : '서명 전';
        $('signatureStatus').style.color = hasDrawn ? 'var(--success)' : 'var(--gray-500)';
    }

    function updateSubmitBtn() {
        const allChecked = [...document.querySelectorAll('.agree-check')].every(cb => cb.checked);
        $('submitSignBtn').disabled = !(allChecked && hasDrawn);
    }

    function renderContract() {
        $('contractBody').innerHTML = CONTRACT_BODY;
        document.querySelectorAll('.agree-check').forEach(cb => cb.checked = false);
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasDrawn = false;
        updateStatus();
        updateSubmitBtn();
    }

    async function sha256Hex(text) {
        const enc = new TextEncoder().encode(text);
        const buf = await crypto.subtle.digest('SHA-256', enc);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function getClientIP() {
        try {
            const r = await fetch('https://api.ipify.org?format=json');
            const j = await r.json();
            return j.ip || '';
        } catch (_) { return ''; }
    }

    async function submitSignature() {
        const btn = $('submitSignBtn');
        btn.disabled = true; btn.textContent = '서명 처리 중...';
        clearAlert('contractError');

        try {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) throw new Error('세션이 만료되었습니다. 다시 로그인하세요.');

            const signatureImage = canvas.toDataURL('image/png');
            const userAgent = navigator.userAgent;
            const ip = await getClientIP();
            const bodyHash = await sha256Hex(CONTRACT_VERSION + '|' + CONTRACT_BODY + '|' + signatureImage);

            const { data: contractId, error: rpcErr } = await sb.rpc('agent_sign_contract', {
                p_contract_body: CONTRACT_BODY,
                p_signature_image: signatureImage,
                p_body_hash: bodyHash,
                p_signed_ip: ip,
                p_signed_user_agent: userAgent,
                p_contract_version: CONTRACT_VERSION
            });
            if (rpcErr) throw rpcErr;
            if (!contractId) throw new Error('계약서 서명에 실패했습니다.');

            window.location.href = 'agent-dashboard.html';
        } catch (err) {
            showAlert('contractError', '서명 저장 실패: ' + err.message);
            btn.disabled = false; btn.textContent = '계약서 서명 완료';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
