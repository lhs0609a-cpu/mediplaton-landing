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
})();
