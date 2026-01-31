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
const liveNotification = document.getElementById('liveNotification');

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
        if (href === '#') return;

        e.preventDefault();
        const target = document.querySelector(href);

        if (target) {
            const headerHeight = header.offsetHeight;
            const targetPosition = target.offsetTop - headerHeight - 20;

            window.scrollTo({
                top: targetPosition,
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
            if (!data[field.name]) {
                isValid = false;
                input?.classList.add('error');
                if (!firstErrorField) firstErrorField = input;
                setTimeout(() => input?.classList.remove('error'), 3000);
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
            if (typeof SUPABASE_CONFIG !== 'undefined' && isSupabaseConfigured()) {
                const supabaseClient = window.supabase.createClient(
                    SUPABASE_CONFIG.url,
                    SUPABASE_CONFIG.anonKey
                );

                const { error } = await supabaseClient
                    .from('consultations')
                    .insert({
                        name: data.name,
                        phone: data.phone,
                        business: data.business,
                        revenue: data.revenue,
                        region: data.region,
                        product: data.product || null,
                        message: data.message || null,
                        status: 'new'
                    });

                if (error) {
                    console.error('Supabase error:', error);
                    throw new Error('데이터 저장 오류');
                }
            } else {
                // Supabase 미설정 시 로컬 백업 저장 (데이터 유실 방지)
                const backupData = {
                    name: data.name,
                    phone: data.phone,
                    business: data.business,
                    revenue: data.revenue,
                    region: data.region,
                    product: data.product || null,
                    message: data.message || null,
                    status: 'new'
                };

                // 로컬 스토리지에 백업
                if (typeof saveToLocalBackup === 'function') {
                    saveToLocalBackup('consultations', backupData);
                }

                console.log('=== 상담 신청 데이터 (로컬 백업 저장됨) ===');
                console.table(backupData);
                console.warn('⚠️ Supabase 미설정: config.js를 확인하세요.');
                console.info('💡 백업 데이터 확인: 개발자 도구에서 getLocalBackup("consultations") 실행');

                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Success
            const successName = document.getElementById('successName');
            const successPhone = document.getElementById('successPhone');
            if (successName) successName.textContent = `성함: ${data.name}`;
            if (successPhone) successPhone.textContent = `연락처: ${data.phone}`;

            openModal(successModal);
            consultForm.reset();

        } catch (error) {
            console.error('폼 제출 오류:', error);
            alert('신청 중 오류가 발생했습니다. 잠시 후 다시 시도하시거나,\n전화(0507-1434-3226)로 문의해 주세요.');
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

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
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
