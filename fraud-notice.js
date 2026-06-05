// 폼 제출 페이지에 IP 기록·법적 책임 고지 문구를 자동 주입.
// 동의 체크박스 또는 제출 버튼 근처에 1회만 삽입.
(function () {
    'use strict';

    var NOTICE_HTML =
        '<div class="form-fraud-notice" data-fraud-notice="1" role="note" ' +
        'style="margin:10px 0;padding:10px 12px;border:1px solid #FCD34D;' +
        'background:#FFFBEB;border-radius:8px;color:#92400E;' +
        'font-size:12px;line-height:1.55;">' +
        '<strong style="display:block;margin-bottom:4px;color:#B45309;">' +
        '⚠️ 본 신청은 IP 주소가 자동 기록됩니다.</strong>' +
        '허위·장난·타인 명의 접수 시 <strong>형법 제314조(업무방해)</strong> 및 ' +
        '<strong>제347조(사기)</strong>에 따라 형사 고소될 수 있으며, IP 추적을 통한 ' +
        '민·형사상 책임이 따를 수 있습니다.' +
        '</div>';

    function inject() {
        var forms = document.querySelectorAll('form');
        forms.forEach(function (form) {
            // 이미 주입된 경우 스킵
            if (form.querySelector('[data-fraud-notice]')) return;

            // 동의 체크박스(privacy/agree) 보유 폼만 대상
            var hasAgree = form.querySelector(
                'input[type="checkbox"][name="agree"], ' +
                'input[type="checkbox"][id*="agree" i], ' +
                'input[type="checkbox"][id*="privacy" i], ' +
                'input[type="checkbox"][name*="privacy" i]'
            );
            if (!hasAgree) return;

            // 우선 .form-agreement 다음에 삽입, 없으면 submit 버튼 직전
            var anchor = form.querySelector('.form-agreement, .mkt-agreement, .promo-agreement');
            var wrap = document.createElement('div');
            wrap.innerHTML = NOTICE_HTML;
            var node = wrap.firstChild;

            if (anchor && anchor.parentNode) {
                anchor.parentNode.insertBefore(node, anchor.nextSibling);
            } else {
                var submit = form.querySelector('button[type="submit"], input[type="submit"]');
                if (submit && submit.parentNode) {
                    submit.parentNode.insertBefore(node, submit);
                } else {
                    form.appendChild(node);
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }

    // 동일 IP 다회 접수 시 제출자에게 표시하는 강력 경고 모달
    // /api/submit 응답의 duplicateIpCount >= 2 이면 호출
    window.showDuplicateIpWarning = function (count) {
        if (!count || count < 2) return;
        // 이미 떠 있으면 중복 방지
        if (document.getElementById('dupIpWarnOverlay')) return;

        var overlay = document.createElement('div');
        overlay.id = 'dupIpWarnOverlay';
        overlay.style.cssText =
            'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);' +
            'display:flex;align-items:center;justify-content:center;padding:20px;' +
            'animation:dupIpFadeIn 0.2s ease-out;';

        var box = document.createElement('div');
        box.style.cssText =
            'max-width:520px;width:100%;background:#fff;border-radius:14px;' +
            'border:3px solid #DC2626;padding:0;overflow:hidden;' +
            'box-shadow:0 20px 50px rgba(220,38,38,0.4);' +
            'animation:dupIpScaleIn 0.25s cubic-bezier(.2,1.4,.4,1);';

        box.innerHTML =
            '<div style="background:#DC2626;color:#fff;padding:16px 20px;' +
            'font-size:18px;font-weight:800;display:flex;align-items:center;gap:10px;">' +
            '<span style="font-size:24px;">🚨</span>' +
            '<span>중복 접수 감지 — 법적 책임 안내</span>' +
            '</div>' +
            '<div style="padding:20px;color:#1F2937;line-height:1.65;font-size:14px;">' +
            '<p style="margin:0 0 14px;font-size:15px;">' +
            '귀하의 IP 주소에서 <strong style="color:#DC2626;font-size:17px;">' + count + '건</strong>의 접수 기록이 확인되었습니다.</p>' +

            '<div style="background:#FEF2F2;border-left:4px solid #DC2626;padding:12px 14px;border-radius:6px;margin-bottom:14px;">' +
            '<strong style="color:#991B1B;display:block;margin-bottom:6px;">⚠️ 동일 IP·동일 디바이스에서 반복 접수가 기록되었습니다.</strong>' +
            '귀하의 <strong>IP 주소·접속 시각·브라우저 정보</strong>가 서버에 저장되어 있으며, ' +
            '허위·장난·타인 명의 접수일 경우 다음 법적 조치가 진행될 수 있습니다.' +
            '</div>' +

            '<ul style="margin:0 0 14px;padding-left:20px;color:#374151;font-size:13px;">' +
            '<li style="margin-bottom:4px;"><strong>형법 제314조(업무방해)</strong> — 5년 이하 징역 또는 1,500만원 이하 벌금</li>' +
            '<li style="margin-bottom:4px;"><strong>형법 제347조(사기)</strong> — 10년 이하 징역 또는 2,000만원 이하 벌금</li>' +
            '<li style="margin-bottom:4px;"><strong>정보통신망법 제70조</strong> — 명예훼손·허위사실 유포 시 형사처벌</li>' +
            '<li><strong>민사 손해배상</strong> — 영업방해로 인한 실손해 청구</li>' +
            '</ul>' +

            '<div style="background:#F3F4F6;padding:10px 12px;border-radius:6px;font-size:12px;color:#4B5563;margin-bottom:16px;">' +
            '✅ 정상 접수(가족·동료가 같은 와이파이에서 별도 신청 등)이시면 문의 시 말씀해 주세요. ' +
            '<br>📞 본사: <strong>0507-1434-3226</strong>' +
            '</div>' +

            '<button id="dupIpCloseBtn" type="button" style="' +
            'width:100%;padding:12px;background:#DC2626;color:#fff;border:0;' +
            'border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">' +
            '확인했습니다</button>' +
            '</div>';

        // 애니메이션 keyframes 1회만 주입
        if (!document.getElementById('dupIpKeyframes')) {
            var sty = document.createElement('style');
            sty.id = 'dupIpKeyframes';
            sty.textContent =
                '@keyframes dupIpFadeIn{from{opacity:0}to{opacity:1}}' +
                '@keyframes dupIpScaleIn{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}';
            document.head.appendChild(sty);
        }

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        var closeBtn = document.getElementById('dupIpCloseBtn');
        closeBtn.addEventListener('click', function () {
            overlay.parentNode && overlay.parentNode.removeChild(overlay);
        });
    };
})();
