// ===== DOM Elements =====
const header = document.getElementById('header');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');
const mobileMenuClose = document.getElementById('mobileMenuClose');
const floatingActions = document.getElementById('floatingActions');
const scrollTopBtn = document.getElementById('scrollTop');
const consultForm = document.getElementById('consultForm');
const privacyModal = document.getElementById('privacyModal');
const successModal = document.getElementById('successModal');
const scrollProgress = document.getElementById('scrollProgress');
const mobileFloatingCta = document.getElementById('mobileFloatingCta');
// liveNotification 제거됨 (다크패턴 방지 - 실제 데이터 연동 후 재구현)

// ===== Header Scroll Effect =====
function handleScroll() {
    if (window.scrollY > 50) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }

    // Floating actions visibility
    if (window.scrollY > 500) {
        floatingActions?.classList.add('visible');
    } else {
        floatingActions?.classList.remove('visible');
    }

    // Mobile floating CTA visibility (show earlier on mobile for better UX)
    const isMobile = window.innerWidth <= 768;
    const ctaThreshold = isMobile ? 300 : 800;
    if (window.scrollY > ctaThreshold) {
        mobileFloatingCta?.classList.add('visible');
    } else {
        mobileFloatingCta?.classList.remove('visible');
    }

    // Scroll progress indicator
    if (scrollProgress) {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = (scrollTop / docHeight) * 100;
        scrollProgress.style.width = `${scrollPercent}%`;
    }
}

window.addEventListener('scroll', handleScroll, { passive: true });

// ===== Mobile Menu =====
function openMobileMenu() {
    mobileMenu.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
    mobileMenu.classList.remove('active');
    document.body.style.overflow = '';
}

mobileMenuBtn?.addEventListener('click', openMobileMenu);
mobileMenuClose?.addEventListener('click', closeMobileMenu);

// Close mobile menu when clicking links
mobileMenu?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMobileMenu);
});

// ===== Scroll to Top =====
scrollTopBtn?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ===== Smooth Scroll for Anchor Links =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href === '#' || href === '#main-content') return;

        e.preventDefault();
        const target = document.querySelector(href);

        if (target) {
            const headerHeight = header.offsetHeight;
            window.scrollTo({
                top: target.offsetTop - headerHeight - 20,
                behavior: 'smooth'
            });
        }
    });
});

// ===== Product Filter =====
const filterBtns = document.querySelectorAll('.filter-btn');
const productCards = document.querySelectorAll('.product-card');

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;

        // Update active button
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Filter products
        productCards.forEach(card => {
            if (filter === 'all' || card.dataset.category === filter) {
                card.style.display = 'block';
                card.style.animation = 'fadeIn 0.3s ease';
            } else {
                card.style.display = 'none';
            }
        });
    });
});

// ===== FAQ Accordion =====
// [P3 FIX] 접근성 개선 - aria-expanded 속성 토글 추가
const faqItems = document.querySelectorAll('.faq-item');

faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');

    // Set initial aria attributes
    if (question && answer) {
        const answerId = 'faq-answer-' + Math.random().toString(36).substr(2, 9);
        answer.id = answerId;
        question.setAttribute('aria-expanded', 'false');
        question.setAttribute('aria-controls', answerId);
    }

    question?.addEventListener('click', () => {
        const isActive = item.classList.contains('active');

        // Close all items and update aria
        faqItems.forEach(i => {
            i.classList.remove('active');
            i.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
        });

        // Open clicked item if it wasn't active
        if (!isActive) {
            item.classList.add('active');
            question.setAttribute('aria-expanded', 'true');
        }
    });
});

// ===== FAQ Category Filter =====
const faqCatBtns = document.querySelectorAll('.faq-cat-btn');

faqCatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;

        // Update active button
        faqCatBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Filter FAQ items
        faqItems.forEach(item => {
            if (cat === 'all' || item.dataset.cat === cat) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });
});

// ===== Counter Animation - Enhanced =====
function animateCounters() {
    const counters = document.querySelectorAll('[data-count]');

    const observerOptions = {
        threshold: 0.3
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = parseInt(counter.dataset.count);
                const duration = 2500;

                // Easing function for more impact
                const easeOutExpo = (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

                let startTime = null;

                const updateCounter = (timestamp) => {
                    if (!startTime) startTime = timestamp;
                    const progress = Math.min((timestamp - startTime) / duration, 1);
                    const easedProgress = easeOutExpo(progress);
                    const current = Math.floor(easedProgress * target);

                    counter.textContent = current.toLocaleString();

                    if (progress < 1) {
                        requestAnimationFrame(updateCounter);
                    } else {
                        counter.textContent = target.toLocaleString();
                    }
                };

                updateCounter();
                observer.unobserve(counter);
            }
        });
    }, observerOptions);

    counters.forEach(counter => observer.observe(counter));
}

// ===== Modal Functions =====
function openModal(modal) {
    modal?.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal?.classList.remove('active');
    document.body.style.overflow = '';
}

// Privacy Modal
const privacyLinks = document.querySelectorAll('.privacy-link');
const closeModalBtn = document.getElementById('closeModal');
const agreeBtn = document.getElementById('agreeBtn');
const agreeCheckbox = document.getElementById('agree');

privacyLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        openModal(privacyModal);
    });
});

closeModalBtn?.addEventListener('click', () => closeModal(privacyModal));
agreeBtn?.addEventListener('click', () => {
    if (agreeCheckbox) agreeCheckbox.checked = true;
    closeModal(privacyModal);
});

// Success Modal
const closeSuccessModalBtn = document.getElementById('closeSuccessModal');
closeSuccessModalBtn?.addEventListener('click', () => {
    closeModal(successModal);
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Close modals on overlay click
[privacyModal, successModal].forEach(modal => {
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
    });
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal(privacyModal);
        closeModal(successModal);
        closeMobileMenu();
    }
});

// ===== Form Handling =====
// [P0 FIX] 실제 데이터 수집을 위한 폼 핸들링 개선
function initForm() {
    if (!consultForm) return;

    // Phone number formatting
    const phoneInput = document.getElementById('phone');
    phoneInput?.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 11) value = value.slice(0, 11);

        if (value.length > 7) {
            value = value.replace(/(\d{3})(\d{4})(\d{0,4})/, '$1-$2-$3');
        } else if (value.length > 3) {
            value = value.replace(/(\d{3})(\d{0,4})/, '$1-$2');
        }

        e.target.value = value;
    });

    // Form submission
    consultForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(consultForm);
        const data = Object.fromEntries(formData.entries());
        const sourcePage = window.location.pathname.split('/').pop() || 'index.html';

        // Validate required fields with individual error messages
        const requiredFields = [
            { name: 'name', label: '성함' },
            { name: 'phone', label: '연락처' },
            { name: 'business', label: '업종' },
            { name: 'revenue', label: '월 카드매출' },
            { name: 'region', label: '지역' }
        ];
        let isValid = true;
        let firstErrorField = null;

        requiredFields.forEach(field => {
            const input = document.getElementById(field.name);
            const errorSpan = document.getElementById(field.name + '-error');
            if (!data[field.name]) {
                isValid = false;
                input?.classList.add('error');
                input?.setAttribute('aria-invalid', 'true');
                if (errorSpan) errorSpan.textContent = field.label + '을(를) 입력해주세요';
                if (!firstErrorField) firstErrorField = input;
                setTimeout(() => {
                    input?.classList.remove('error');
                    input?.setAttribute('aria-invalid', 'false');
                    if (errorSpan) errorSpan.textContent = '';
                }, 3000);
            } else {
                input?.setAttribute('aria-invalid', 'false');
                if (errorSpan) errorSpan.textContent = '';
            }
        });

        // Check agree checkbox
        if (!agreeCheckbox?.checked) {
            isValid = false;
            const agreeLabel = document.querySelector('.checkbox-label');
            const checkboxWrapper = document.querySelector('.form-agreement');
            agreeLabel.style.color = 'var(--danger)';
            checkboxWrapper?.classList.add('error');
            setTimeout(() => {
                agreeLabel.style.color = '';
                checkboxWrapper?.classList.remove('error');
            }, 3000);
        }

        if (!isValid) {
            // Scroll to first error field
            firstErrorField?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstErrorField?.focus();
            return;
        }

        // Submit form
        const submitBtn = consultForm.querySelector('.submit-btn');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="loading-spinner"></span> 신청 중...';
        submitBtn.disabled = true;

        try {
            // Supabase 연동
            if (typeof SUPABASE_CONFIG !== 'undefined' && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
                try {
                    const sbClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
                    await sbClient.from('consultations').insert({
                        name: data.name,
                        phone: data.phone,
                        business: data.business,
                        revenue: data.revenue,
                        region: data.region,
                        product: data.product || '',
                        message: data.message || '',
                        source_page: sourcePage
                    });
                    console.log('✅ Supabase에 상담 신청 데이터 저장 완료');
                } catch (dbError) {
                    console.error('Supabase 저장 오류:', dbError);
                    saveToLocalBackup('consultations', { ...data, source_page: sourcePage });
                }
            } else {
                saveToLocalBackup('consultations', { ...data, source_page: sourcePage });
            }

            // Google Sheets 연동
            if (typeof GOOGLE_SHEETS_CONFIG !== 'undefined' && typeof isGoogleSheetsConfigured === 'function' && isGoogleSheetsConfigured()) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000);
                    await fetch(GOOGLE_SHEETS_CONFIG.webAppUrl, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'application/json' },
                        signal: controller.signal,
                        body: JSON.stringify({
                            type: 'consultation',
                            name: data.name,
                            phone: data.phone,
                            business: data.business,
                            revenue: data.revenue,
                            region: data.region,
                            product: data.product || '',
                            message: data.message || '',
                            source_page: sourcePage
                        })
                    });
                    clearTimeout(timeoutId);
                    console.log('✅ Google Sheets에 데이터 전송 완료');
                } catch (sheetError) {
                    console.error('Google Sheets 전송 오류:', sheetError);
                    if (sheetError.name === 'AbortError') {
                        console.warn('⚠️ 전송 시간 초과 (10초)');
                    }
                }
            }

            // Success
            const successName = document.getElementById('successName');
            const successPhone = document.getElementById('successPhone');
            if (successName) successName.textContent = data.name;
            if (successPhone) successPhone.textContent = data.phone;

            openModal(successModal);
            consultForm.reset();

        } catch (error) {
            console.error('폼 제출 오류:', error);
            alert('신청 중 오류가 발생했습니다. 잠시 후 다시 시도하시거나,\n전화(0507-1375-2717)로 문의해 주세요.');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

// ===== Scroll Animations =====
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll(
        '.service-card, .product-card, .case-card, .qual-card, .doc-card, .news-card, .solution-card, .effect-card, .main-partner-card, .comp-card'
    );

    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    animatedElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = `opacity 0.5s ease ${index * 0.05}s, transform 0.5s ease ${index * 0.05}s`;
        observer.observe(el);
    });

    // Section header animations
    const sectionHeaders = document.querySelectorAll('.section-header');
    const headerObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                headerObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    sectionHeaders.forEach(header => {
        header.style.opacity = '0';
        header.style.transform = 'translateY(20px)';
        header.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        headerObserver.observe(header);
    });

    // Add active class styles
    const headerStyle = document.createElement('style');
    headerStyle.textContent = `
        .section-header.active {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(headerStyle);
}

// ===== Lazy Image Loading =====
function initLazyImages() {
    const images = document.querySelectorAll('img[loading="lazy"]');

    images.forEach(img => {
        if (img.complete) {
            img.classList.add('loaded');
        } else {
            img.addEventListener('load', () => {
                img.classList.add('loaded');
            });
            img.addEventListener('error', () => {
                img.classList.add('loaded');
            });
        }
    });
}

// ===== Enhanced Button Interactions =====
function initButtonInteractions() {
    const buttons = document.querySelectorAll('.btn, .filter-btn, .faq-cat-btn, .product-cta, a.product-cta');

    buttons.forEach(btn => {
        btn.addEventListener('mousedown', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            ripple.style.cssText = `
                position: absolute;
                width: 4px;
                height: 4px;
                background: rgba(255, 255, 255, 0.4);
                border-radius: 50%;
                transform: scale(0);
                left: ${x}px;
                top: ${y}px;
                animation: ripple-effect 0.6s ease-out;
                pointer-events: none;
            `;

            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);

            setTimeout(() => ripple.remove(), 600);
        });
    });

    // Add ripple animation
    const rippleStyle = document.createElement('style');
    rippleStyle.textContent = `
        @keyframes ripple-effect {
            to {
                transform: scale(100);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(rippleStyle);
}

// ===== Navigation Dropdown (Desktop) =====
function initNavDropdowns() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        const dropdown = item.querySelector('.nav-dropdown');
        if (!dropdown) return;

        item.addEventListener('mouseenter', () => {
            dropdown.style.opacity = '1';
            dropdown.style.visibility = 'visible';
            dropdown.style.transform = 'translateY(0)';
        });

        item.addEventListener('mouseleave', () => {
            dropdown.style.opacity = '0';
            dropdown.style.visibility = 'hidden';
            dropdown.style.transform = 'translateY(10px)';
        });
    });
}

// ===== Keyboard Navigation Enhancement =====
function initKeyboardNav() {
    // Escape key to close modals/menus
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            document.body.classList.add('user-tabbing');
        }
    });

    document.addEventListener('mousedown', () => {
        document.body.classList.remove('user-tabbing');
    });

    // Add tabbing styles
    const tabbingStyle = document.createElement('style');
    tabbingStyle.textContent = `
        body:not(.user-tabbing) *:focus {
            outline: none;
        }
        body.user-tabbing *:focus {
            outline: 2px solid var(--primary);
            outline-offset: 2px;
        }
    `;
    document.head.appendChild(tabbingStyle);
}

// ===== Performance Optimizations =====
function initPerformanceOptimizations() {
    // Throttle scroll events
    let ticking = false;
    const originalHandleScroll = handleScroll;

    window.removeEventListener('scroll', handleScroll);
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                originalHandleScroll();
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });

    // Preload critical images
    const criticalImages = document.querySelectorAll('.hero img, .about-main-img');
    criticalImages.forEach(img => {
        if (img.loading === 'lazy') {
            img.loading = 'eager';
        }
    });
}

// ===== Live Notification (Social Proof) =====
// [P0 FIX] 가짜 실시간 알림 Dark Pattern 제거
// 실제 데이터 연동 전까지 비활성화
function initLiveNotifications() {
    // Dark Pattern 제거: 하드코딩된 가짜 승인 알림은 신뢰를 저해함
    // 실제 API 연동 후 집계 데이터 기반으로 재구현 필요
    // 예: "이번 달 127건 상담 완료" 형태의 실제 데이터 사용
    return;
}

// ===== Live Approval Card Animation =====
// 실제 승인 사례 스크린샷 캐러셀
function initLiveApprovalCard() {
    const card = document.getElementById('liveApprovalCard');
    if (!card) return;

    const slides = card.querySelectorAll('.showcase-slide');
    const dots = card.querySelectorAll('.showcase-dots .dot');
    if (slides.length === 0) return;

    let currentIndex = 0;

    function updateCard() {
        slides[currentIndex].classList.remove('active');
        if (dots[currentIndex]) dots[currentIndex].classList.remove('active');

        currentIndex = (currentIndex + 1) % slides.length;

        slides[currentIndex].classList.add('active');
        if (dots[currentIndex]) dots[currentIndex].classList.add('active');
    }

    // Page Visibility API: 비활성 탭에서 interval 중지
    let cardInterval = setInterval(updateCard, 5000);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearInterval(cardInterval);
        } else {
            cardInterval = setInterval(updateCard, 5000);
        }
    });
}

// ===== [P1 FIX] Interactive Savings Calculator =====
function initSavingsCalculator() {
    const calculator = document.getElementById('savingsCalculator');
    if (!calculator) return;

    const amountSelect = document.getElementById('calcAmount');
    const periodSelect = document.getElementById('calcPeriod');
    const badInterestEl = document.getElementById('calcBadInterest');
    const goodInterestEl = document.getElementById('calcGoodInterest');
    const savingsEl = document.getElementById('calcSavings');
    const comparisonEl = document.getElementById('calcComparison');

    // 비교 문구 목록 (절감액에 따른 비유)
    const comparisons = [
        { threshold: 500, text: '= 고급 의료장비 구매 가능!' },
        { threshold: 1000, text: '= 직원 보너스 지급 가능!' },
        { threshold: 1500, text: '= 인테리어 리모델링 비용!' },
        { threshold: 2000, text: '= 간호사 연봉 절반!' },
        { threshold: 3000, text: '= 신규 장비 도입 가능!' },
        { threshold: 5000, text: '= 분원 보증금 수준!' },
        { threshold: Infinity, text: '= 엄청난 절감 효과!' }
    ];

    function formatNumber(num) {
        if (num >= 100000000) {
            return (num / 100000000).toFixed(1).replace(/\.0$/, '') + '억원';
        } else if (num >= 10000) {
            return (num / 10000).toLocaleString() + '만원';
        }
        return num.toLocaleString() + '원';
    }

    function calculateSavings() {
        const amount = parseInt(amountSelect.value);
        const period = parseInt(periodSelect.value);

        // 대부업 금리 15%, 메디플라톤 최저 금리 5.3%
        const badRate = 0.15;
        const goodRate = 0.053;

        // 단리 계산 (간단한 비교용)
        const badInterest = amount * badRate * period;
        const goodInterest = amount * goodRate * period;
        const savings = badInterest - goodInterest;

        // UI 업데이트
        badInterestEl.textContent = formatNumber(badInterest);
        goodInterestEl.textContent = formatNumber(goodInterest);
        savingsEl.textContent = formatNumber(savings) + ' 절약';

        // 절감액에 따른 비교 문구
        const savingsInMan = savings / 10000;
        const comparison = comparisons.find(c => savingsInMan < c.threshold);
        comparisonEl.textContent = comparison ? comparison.text : '';

        // 애니메이션 효과
        calculator.classList.add('calculated');
        setTimeout(() => calculator.classList.remove('calculated'), 300);
    }

    // 이벤트 리스너
    amountSelect.addEventListener('change', calculateSavings);
    periodSelect.addEventListener('change', calculateSavings);

    // 초기 계산
    calculateSavings();
}

// ===== Active Navigation Highlight =====
function initActiveNav() {
    var page = document.body.dataset.page;
    if (!page) return;
    var map = { home: 0, products: 1, guide: 2, cases: 3, news: 4, company: 0 };
    var items = document.querySelectorAll('.nav-list > .nav-item');
    var idx = map[page];
    if (idx !== undefined && items[idx]) {
        var link = items[idx].querySelector('.nav-link');
        if (link) link.classList.add('active');
    }
}


// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    initActiveNav();
    handleScroll();
    animateCounters();
    initSavingsCalculator();
    initForm();
    initScrollAnimations();
    initNavDropdowns();
    initLazyImages();
    initButtonInteractions();
    initKeyboardNav();
    initLiveNotifications();
    initLiveApprovalCard();

    // Hash scroll on page load
    if (window.location.hash) {
        setTimeout(() => {
            const target = document.querySelector(window.location.hash);
            if (target) {
                window.scrollTo({
                    top: target.offsetTop - header.offsetHeight - 20,
                    behavior: 'smooth'
                });
            }
        }, 100);
    }

    // Delay non-critical initializations
    setTimeout(() => {
        initPerformanceOptimizations();
    }, 100);
});

// Add CSS animation keyframe
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .form-group input.error,
    .form-group select.error {
        border-color: var(--danger);
        animation: shake 0.3s ease;
    }
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-4px); }
        75% { transform: translateX(4px); }
    }
`;
document.head.appendChild(style);

// ===== Rental Payment Calculator =====
function initRentalCalculator() {
    const amountInput = document.getElementById('rcAmount');
    const periodSelect = document.getElementById('rcPeriod');
    const depositSelect = document.getElementById('rcDeposit');
    const bizTypeSelect = document.getElementById('rcBizType');
    const taxRateInput = document.getElementById('rcTaxRate');
    const taxWarn = document.getElementById('rcTaxWarn');
    const taxTableWrap = document.getElementById('rcTaxTableWrap');
    const taxTableTitle = document.getElementById('rcTaxTableTitle');
    const taxTableBody = document.getElementById('rcTaxTableBody');

    if (!amountInput) return;

    // Mode toggle
    const modeBtns = document.querySelectorAll('.rc-mode-btn');
    const modeLabels = document.querySelectorAll('.rc-mode-label, .rc-mode-label-result');
    let currentMode = 'b2c';

    // Tax bracket data: [구간 label, 세율%, 지방세%, 합계%]
    const taxBrackets = {
        '개인사업자-과세': [
            ['1,400만 이하', '6.0%', '0.6%', '6.6%'],
            ['1,400만 ~ 5,000만', '15.0%', '1.5%', '16.5%'],
            ['5,000만 ~ 8,800만', '24.0%', '2.4%', '26.4%'],
            ['8,800만 ~ 1.5억', '35.0%', '3.5%', '38.5%'],
            ['1.5억 ~ 3억', '38.0%', '3.8%', '41.8%'],
            ['3억 ~ 5억', '40.0%', '4.0%', '44.0%'],
            ['5억 ~ 10억', '42.0%', '4.2%', '46.2%'],
            ['10억 이상', '45.0%', '4.5%', '49.5%']
        ],
        '법인사업자-과세': [
            ['2억 이하', '9.0%', '0.9%', '9.9%'],
            ['2억 ~ 200억', '19.0%', '1.9%', '20.9%'],
            ['200억 ~ 3,000억', '21.0%', '2.1%', '23.1%'],
            ['3,000억 초과', '24.0%', '2.4%', '26.4%']
        ]
    };

    // Valid tax rates for each biz type
    const validRates = {
        '개인사업자-과세': [6.6, 16.5, 26.4, 38.5, 41.8, 44.0, 46.2, 49.5],
        '개인사업자-면세': [6.6, 16.5, 26.4, 38.5, 41.8, 44.0, 46.2, 49.5],
        '법인사업자-과세': [9.9, 20.9, 23.1, 26.4],
        '법인사업자-면세': [9.9, 20.9, 23.1, 26.4]
    };

    // Monthly rate coefficients per period (matching modoovillage output)
    // PMT formula with annual rate ~21.75%, monthly rate = 21.75%/12 ≈ 1.8125%
    // Coefficient = r*(1+r)^n / ((1+r)^n - 1)
    const monthlyCoefficients = {
        12: 0.09347,
        24: 0.05175,
        36: 0.03806,
        48: 0.03137,
        60: 0.02748
    };

    function formatNumber(n) {
        if (isNaN(n) || n === 0) return '0';
        return Math.round(n).toLocaleString('ko-KR');
    }

    function parseAmount(str) {
        if (!str) return 0;
        return parseInt(str.replace(/[^0-9]/g, ''), 10) || 0;
    }

    // Format amount input with commas on typing
    amountInput.addEventListener('input', function() {
        const raw = this.value.replace(/[^0-9]/g, '');
        if (raw) {
            this.value = parseInt(raw, 10).toLocaleString('ko-KR');
        } else {
            this.value = '';
        }
        calculate();
    });

    // Mode toggle
    modeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            modeBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentMode = this.dataset.mode;

            if (currentMode === 'b2g') {
                depositSelect.value = '0';
                depositSelect.disabled = true;
            } else {
                depositSelect.disabled = false;
            }

            modeLabels.forEach(el => {
                el.textContent = currentMode === 'b2g' ? 'B2G' : 'B2C / B2B';
            });

            calculate();
        });
    });

    // Update tax table when biz type changes
    bizTypeSelect.addEventListener('change', function() {
        updateTaxTable();
        calculate();
    });

    function updateTaxTable() {
        const bizType = bizTypeSelect.value;
        const isTax = bizType.includes('과세');

        if (isTax && taxBrackets[bizType]) {
            taxTableWrap.style.display = 'block';
            taxTableTitle.textContent = bizType + ' 과세구간(표시용)';
            taxTableBody.innerHTML = taxBrackets[bizType].map(row =>
                `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td></tr>`
            ).join('');
        } else if (bizType.includes('면세')) {
            // 면세 사업자 - show the base bracket for reference
            const baseType = bizType.replace('면세', '과세');
            if (taxBrackets[baseType]) {
                taxTableWrap.style.display = 'block';
                taxTableTitle.textContent = baseType + ' 과세구간(참고용)';
                taxTableBody.innerHTML = taxBrackets[baseType].map(row =>
                    `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td></tr>`
                ).join('');
            }
        }
        highlightTaxRow();
    }

    function highlightTaxRow() {
        const rate = parseTaxRate();
        const rows = taxTableBody.querySelectorAll('tr');
        rows.forEach(row => {
            const lastTd = row.querySelector('td:last-child');
            if (lastTd && parseFloat(lastTd.textContent) === rate) {
                row.classList.add('active');
            } else {
                row.classList.remove('active');
            }
        });
    }

    function parseTaxRate() {
        const raw = taxRateInput.value.replace(/[^0-9.]/g, '');
        return parseFloat(raw) || 0;
    }

    // Validate and recalculate on input changes
    [periodSelect, depositSelect, taxRateInput].forEach(el => {
        el.addEventListener('change', calculate);
        el.addEventListener('input', calculate);
    });

    function calculate() {
        const amount = parseAmount(amountInput.value);
        const months = parseInt(periodSelect.value, 10);
        const depositPct = parseInt(depositSelect.value, 10);
        const bizType = bizTypeSelect.value;
        const taxRate = parseTaxRate();
        const isTax = bizType.includes('과세');
        const isFree = bizType.includes('면세');

        // Validate tax rate
        const biz = bizType;
        const rates = validRates[biz] || [];
        if (taxRate > 0 && rates.length > 0 && !rates.includes(taxRate)) {
            taxWarn.textContent = '위 표의 합계값 중 하나를 입력해 주세요.';
        } else {
            taxWarn.textContent = '';
        }
        highlightTaxRow();

        // Update info panel
        document.getElementById('rcResBizType').textContent = bizType;
        document.getElementById('rcResPeriod').textContent = months + '개월';
        document.getElementById('rcResPeriodVal').textContent = months + '개월';
        document.getElementById('rcResAmount').textContent = formatNumber(amount) + ' 원';

        if (amount <= 0) {
            setResults(0, 0, 0, 0, 0, 0, 0, 0);
            return;
        }

        // Deposit calculation: ceil(총납부금 × deposit% / 10000) × 10000
        // But we need to first calculate without deposit to get total, then deposit from amount
        const coeff = monthlyCoefficients[months] || 0.03806;

        // Financed amount = total amount - deposit
        // Deposit = ceil(amount * depositPct% / 10000) * 10000
        const depositAmount = depositPct > 0
            ? Math.ceil((amount * depositPct / 100) / 10000) * 10000
            : 0;

        const financedAmount = amount - depositAmount;

        // Monthly payment (VAT inclusive)
        const monthly = Math.round(financedAmount * coeff);
        const totalPayment = monthly * months;

        // Tax savings
        let vatSave = 0;
        let incomeTaxSave = 0;

        if (isTax) {
            // 과세 사업자: VAT 절감 + 소득세 절감
            vatSave = Math.round(totalPayment / 11);
            if (taxRate > 0) {
                incomeTaxSave = Math.round((totalPayment - vatSave) * taxRate / 100);
            }
        } else if (isFree) {
            // 면세 사업자: VAT 절감 없음, 소득세 절감만
            vatSave = 0;
            if (taxRate > 0) {
                incomeTaxSave = Math.round(totalPayment * taxRate / 100);
            }
        }

        // 실부담금
        const actualCost = totalPayment - vatSave - incomeTaxSave;

        // 연회수율 & 총회수율
        const years = months / 12;
        const totalReturnRate = amount > 0 ? ((actualCost - amount) / amount) * 100 : 0;
        const annualReturnRate = years > 0 ? totalReturnRate / years : 0;

        // Update deposit display
        document.getElementById('rcResDeposit').textContent = formatNumber(depositAmount) + ' 원';

        setResults(monthly, months, totalPayment, vatSave, incomeTaxSave, actualCost, annualReturnRate, totalReturnRate);
    }

    function setResults(monthly, months, total, vatSave, incomeTaxSave, actual, annualRate, totalRate) {
        document.getElementById('rcResMonthly').textContent = formatNumber(monthly) + ' 원';
        document.getElementById('rcResTotal').textContent = formatNumber(total) + ' 원';
        document.getElementById('rcResVatSave').textContent = formatNumber(vatSave) + ' 원';
        document.getElementById('rcResIncomeTaxSave').textContent = formatNumber(incomeTaxSave) + ' 원';
        document.getElementById('rcResActual').textContent = formatNumber(actual) + ' 원';
        document.getElementById('rcResAnnualRate').textContent = annualRate.toFixed(1) + '%';
        document.getElementById('rcResTotalRate').textContent = totalRate.toFixed(1) + '%';
    }

    // Print
    const printBtn = document.getElementById('rcPrintBtn');
    if (printBtn) {
        printBtn.addEventListener('click', function() {
            window.print();
        });
    }

    // Initial mode label
    modeLabels.forEach(el => { el.textContent = 'B2C / B2B'; });

    // Initial calculation
    calculate();
}

// Init rental calculator when DOM ready
document.addEventListener('DOMContentLoaded', initRentalCalculator);

// ===== Urgency Countdown Timer =====
// [P0 FIX] 조작된 긴급성 Dark Pattern 제거
// 카운트다운 타이머와 랜덤 슬롯 감소 기능 비활성화
function initCountdownTimer() {
    // Dark Pattern 제거:
    // - 매일 18시 리셋되는 가짜 카운트다운
    // - 랜덤으로 감소하는 가짜 "남은 슬롯"
    // 이러한 조작된 긴급성은 의료인 타겟에게 신뢰를 저해함
    return;
}

// [P0 FIX] 카운트다운 초기화 비활성화
// document.addEventListener('DOMContentLoaded', initCountdownTimer);

// ===== 라이트박스 (실제 승인 현황 갤러리) =====
// [QA FIX] 키보드 접근성 개선 - onclick 제거, button + data 속성 방식으로 변경
let lastFocusedGalleryItem = null;

function openLightbox(src, caption) {
    const modal = document.getElementById('lightboxModal');
    if (!modal) return;

    const img = document.getElementById('lightboxImage');
    const cap = document.getElementById('lightboxCaption');
    img.src = src;
    img.alt = caption || '확대 이미지';
    cap.textContent = caption || '';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // 포커스를 닫기 버튼으로 이동
    const closeBtn = document.getElementById('lightboxClose');
    if (closeBtn) closeBtn.focus();
}

function closeLightbox() {
    const modal = document.getElementById('lightboxModal');
    if (!modal) return;

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    // 이전 포커스 복원
    if (lastFocusedGalleryItem) {
        lastFocusedGalleryItem.focus();
        lastFocusedGalleryItem = null;
    }
}

// 라이트박스 이벤트 리스너
document.addEventListener('DOMContentLoaded', function() {
    const lightboxModal = document.getElementById('lightboxModal');
    if (lightboxModal) {
        lightboxModal.addEventListener('click', function(e) {
            if (e.target === this) closeLightbox();
        });
    }

    // 닫기 버튼
    const lightboxClose = document.getElementById('lightboxClose');
    if (lightboxClose) {
        lightboxClose.addEventListener('click', closeLightbox);
    }

    // 갤러리 아이템 클릭/키보드 이벤트 (button 요소로 변경됨)
    const galleryItems = document.querySelectorAll('.proof-gallery-item[data-img]');
    galleryItems.forEach(item => {
        item.addEventListener('click', function() {
            lastFocusedGalleryItem = this;
            openLightbox(this.dataset.img, this.dataset.caption);
        });
    });
});

document.addEventListener('keydown', function(e) {
    const lightboxModal = document.getElementById('lightboxModal');
    if (!lightboxModal || !lightboxModal.classList.contains('active')) return;

    if (e.key === 'Escape') {
        closeLightbox();
        return;
    }

    // [QA FIX] 포커스 트랩 — 라이트박스 내부에서만 Tab 순환
    if (e.key === 'Tab') {
        const focusable = lightboxModal.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }
});

// === Proof Gallery Toggle (더보기/접기) ===
(function() {
    const toggleBtn = document.getElementById('proofToggleBtn');
    if (!toggleBtn) return;

    const grid = document.querySelector('.proof-gallery-grid.expanded');
    if (!grid) return;

    let isExpanded = false;

    toggleBtn.addEventListener('click', function() {
        isExpanded = !isExpanded;
        grid.classList.toggle('show-all', isExpanded);

        const textEl = toggleBtn.querySelector('.toggle-text');
        const arrowEl = toggleBtn.querySelector('.toggle-arrow');

        if (isExpanded) {
            textEl.textContent = '접기';
            arrowEl.style.transform = 'rotate(180deg)';
        } else {
            textEl.textContent = '더 많은 승인 사례 보기';
            arrowEl.style.transform = 'rotate(0deg)';
            // 갤러리 위치로 스크롤
            grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
})();

// ===== Marketing Page: Calculator =====
function initMarketingCalculator() {
    const pgCheck = document.getElementById('mktPg');
    const loanCheck = document.getElementById('mktLoan');
    const brokerCheck = document.getElementById('mktBroker');
    const loanToggle = document.getElementById('mktLoanToggle');
    const brokerToggle = document.getElementById('mktBrokerToggle');

    if (!pgCheck) return; // Not on marketing page

    const sizeRadios = document.querySelectorAll('input[name="mktSize"]');
    const tierBadge = document.getElementById('mktTierBadge');
    const tierDesc = document.getElementById('mktTierDesc');
    const savingsValue = document.getElementById('mktSavingsValue');
    const savingsNote = document.getElementById('mktSavingsNote');
    const benefitsList = document.getElementById('mktBenefitsList');

    function calculate() {
        const hasLoan = loanCheck.checked;
        const hasBroker = brokerCheck.checked;
        const isLarge = document.querySelector('input[name="mktSize"]:checked')?.value === 'large';

        // Toggle active states
        loanToggle.classList.toggle('active', hasLoan);
        brokerToggle.classList.toggle('active', hasBroker);

        // Determine tier
        let tier, tierName, tierDescText, savings, savingsNoteText;

        if (hasLoan && hasBroker && isLarge) {
            tier = 'platinum';
            tierName = 'Platinum';
            tierDescText = 'PG + 대출 + 중개 + 30평 이상';
            savings = '~600만원/월';
            savingsNoteText = '(전체 마케팅 무료)';
        } else if (hasLoan && hasBroker) {
            tier = 'gold';
            tierName = 'Gold';
            tierDescText = 'PG + 대출 + 중개';
            savings = '~350만원/월';
            savingsNoteText = '(홈페이지+블로그+플레이스)';
        } else if (hasLoan) {
            tier = 'silver';
            tierName = 'Silver';
            tierDescText = 'PG + 대출 이용';
            savings = '~250만원/월';
            savingsNoteText = '(홈페이지+블로그 운영)';
        } else {
            tier = 'basic';
            tierName = 'Basic';
            tierDescText = 'PG 단말기 교체 혜택';
            savings = '~400만원';
            savingsNoteText = '(홈페이지 제작비 1회)';
        }

        // Update tier badge
        tierBadge.className = 'mkt-tier-badge ' + tier;
        tierBadge.textContent = tierName;
        tierDesc.textContent = tierDescText;

        // Animate savings value
        savingsValue.textContent = savings;
        savingsNote.textContent = savingsNoteText;

        // Update benefits list
        const benefits = benefitsList.querySelectorAll('.mkt-benefit-item');
        benefits.forEach(item => {
            const benefit = item.dataset.benefit;
            let isActive = false;

            if (benefit === 'homepage') isActive = true; // Always active with PG
            if (benefit === 'blog') isActive = hasLoan;
            if (benefit === 'place') isActive = hasLoan && hasBroker;
            if (benefit === 'cafe') isActive = hasLoan && hasBroker && isLarge;
            if (benefit === 'sns') isActive = hasLoan && hasBroker && isLarge;

            if (isActive) {
                item.classList.add('active');
                item.classList.remove('locked');
                // Replace lock icon with check icon
                const lockEl = item.querySelector('.mkt-benefit-lock');
                if (lockEl) {
                    lockEl.outerHTML = '<span class="mkt-benefit-check"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></span>';
                }
                const unlockEl = item.querySelector('.mkt-benefit-unlock');
                if (unlockEl) unlockEl.style.display = 'none';
            } else {
                item.classList.remove('active');
                item.classList.add('locked');
                // Replace check icon with lock icon
                const checkEl = item.querySelector('.mkt-benefit-check');
                if (checkEl && benefit !== 'homepage') {
                    checkEl.outerHTML = '<span class="mkt-benefit-lock"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>';
                }
                const unlockEl = item.querySelector('.mkt-benefit-unlock');
                if (unlockEl) unlockEl.style.display = '';
            }
        });

        // Pulse animation on savings
        savingsValue.style.transform = 'scale(1.05)';
        setTimeout(() => { savingsValue.style.transform = 'scale(1)'; }, 200);
    }

    // Event listeners
    loanCheck.addEventListener('change', calculate);
    brokerCheck.addEventListener('change', calculate);
    sizeRadios.forEach(radio => radio.addEventListener('change', calculate));

    // Initial calculation
    calculate();
}

// ===== Marketing Page: Form =====
function initMarketingForm() {
    const form = document.getElementById('mktApplyForm');
    if (!form) return;

    // Phone number formatting
    const phoneInput = document.getElementById('mktPhone');
    phoneInput?.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 11) value = value.slice(0, 11);
        if (value.length > 7) {
            value = value.replace(/(\d{3})(\d{4})(\d{0,4})/, '$1-$2-$3');
        } else if (value.length > 3) {
            value = value.replace(/(\d{3})(\d{0,4})/, '$1-$2');
        }
        e.target.value = value;
    });

    // Privacy modal
    const privacyLink = document.getElementById('mktPrivacyLink');
    const privacyModal = document.getElementById('privacyModal');
    const closeModal = document.getElementById('closeModal');
    const agreeBtn = document.getElementById('agreeBtn');
    const agreeCheckbox = document.getElementById('mktAgree');

    privacyLink?.addEventListener('click', (e) => {
        e.preventDefault();
        privacyModal?.classList.add('active');
        document.body.style.overflow = 'hidden';
    });

    closeModal?.addEventListener('click', () => {
        privacyModal?.classList.remove('active');
        document.body.style.overflow = '';
    });

    agreeBtn?.addEventListener('click', () => {
        if (agreeCheckbox) agreeCheckbox.checked = true;
        privacyModal?.classList.remove('active');
        document.body.style.overflow = '';
    });

    privacyModal?.addEventListener('click', (e) => {
        if (e.target === privacyModal) {
            privacyModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // Success modal
    const successModal = document.getElementById('successModal');
    const closeSuccessModal = document.getElementById('closeSuccessModal');

    closeSuccessModal?.addEventListener('click', () => {
        successModal?.classList.remove('active');
        document.body.style.overflow = '';
    });

    successModal?.addEventListener('click', (e) => {
        if (e.target === successModal) {
            successModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Collect multiple interests
        const interests = formData.getAll('interests');

        // Validate required fields
        const requiredFields = [
            { id: 'mktName', name: 'name', label: '성함' },
            { id: 'mktPhone', name: 'phone', label: '연락처' },
            { id: 'mktBusiness', name: 'business_type', label: '업종' },
            { id: 'mktSize', name: 'clinic_size', label: '사업장 평수' }
        ];

        let isValid = true;
        let firstErrorField = null;

        requiredFields.forEach(field => {
            const input = document.getElementById(field.id);
            const errorSpan = document.getElementById(field.id + '-error');
            if (!data[field.name]) {
                isValid = false;
                input?.classList.add('error');
                if (errorSpan) errorSpan.textContent = field.label + '을(를) 입력해주세요';
                if (!firstErrorField) firstErrorField = input;
                setTimeout(() => {
                    input?.classList.remove('error');
                    if (errorSpan) errorSpan.textContent = '';
                }, 3000);
            } else {
                if (errorSpan) errorSpan.textContent = '';
            }
        });

        // Check agreement
        if (!agreeCheckbox?.checked) {
            isValid = false;
            const agreeLabel = document.querySelector('.mkt-agree-label');
            if (agreeLabel) agreeLabel.style.color = 'var(--danger)';
            setTimeout(() => {
                if (agreeLabel) agreeLabel.style.color = '';
            }, 3000);
        }

        if (!isValid) {
            firstErrorField?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstErrorField?.focus();
            return;
        }

        // Submit
        const submitBtn = form.querySelector('.mkt-submit-btn');
        const originalHTML = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="loading-spinner"></span> 신청 중...';
        submitBtn.disabled = true;

        try {
            // Supabase insert
            const mktSourcePage = window.location.pathname.split('/').pop() || 'marketing.html';
            if (typeof SUPABASE_CONFIG !== 'undefined' && typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
                try {
                    const sb = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
                    await sb.from('marketing_inquiries').insert({
                        name: data.name,
                        phone: data.phone,
                        business_type: data.business_type,
                        clinic_size: data.clinic_size,
                        interests: interests,
                        source_page: mktSourcePage
                    });
                    console.log('✅ Supabase에 마케팅 신청 데이터 저장 완료');
                } catch (dbError) {
                    console.error('Supabase 저장 오류:', dbError);
                    saveToLocalBackup('marketing_inquiries', {
                        name: data.name,
                        phone: data.phone,
                        business_type: data.business_type,
                        clinic_size: data.clinic_size,
                        interests: interests,
                        source_page: mktSourcePage
                    });
                }
            } else {
                console.log('=== 마케팅 신청 데이터 ===');
                console.table({ ...data, interests: interests.join(', ') });
                saveToLocalBackup('marketing_inquiries', {
                    name: data.name,
                    phone: data.phone,
                    business_type: data.business_type,
                    clinic_size: data.clinic_size,
                    interests: interests,
                    source_page: mktSourcePage
                });
            }

            // Google Sheets
            if (typeof GOOGLE_SHEETS_CONFIG !== 'undefined' && typeof isGoogleSheetsConfigured === 'function' && isGoogleSheetsConfigured()) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000);
                    await fetch(GOOGLE_SHEETS_CONFIG.webAppUrl, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'application/json' },
                        signal: controller.signal,
                        body: JSON.stringify({
                            type: 'marketing',
                            name: data.name,
                            phone: data.phone,
                            business_type: data.business_type,
                            clinic_size: data.clinic_size,
                            interests: interests.join(', '),
                            source_page: mktSourcePage
                        })
                    });
                    clearTimeout(timeoutId);
                } catch (sheetError) {
                    console.error('Google Sheets 전송 오류:', sheetError);
                }
            }

            // Show success
            const successName = document.getElementById('successName');
            const successPhone = document.getElementById('successPhone');
            if (successName) successName.textContent = data.name;
            if (successPhone) successPhone.textContent = data.phone;

            successModal?.classList.add('active');
            document.body.style.overflow = 'hidden';
            form.reset();

        } catch (error) {
            console.error('폼 제출 오류:', error);
            alert('신청 중 오류가 발생했습니다. 잠시 후 다시 시도하시거나,\n전화(0507-1375-2717)로 문의해 주세요.');
        } finally {
            submitBtn.innerHTML = originalHTML;
            submitBtn.disabled = false;
        }
    });
}

// ===== Marketing Page Init =====
document.addEventListener('DOMContentLoaded', function() {
    if (document.body.dataset.page === 'marketing') {
        initMarketingCalculator();
        initMarketingForm();
    }
});
