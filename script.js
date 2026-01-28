// ===== DOM Elements =====
const progressBar = document.getElementById('progressBar');
const header = document.getElementById('header');
const floatingCta = document.getElementById('floatingCta');
const toastContainer = document.getElementById('toastContainer');
const countdown = document.getElementById('countdown');
const viewerCount = document.getElementById('viewerCount');
const consultForm = document.getElementById('consultForm');

// ===== Configuration =====
const CONFIG = {
    toastInterval: 8000,
    maxToasts: 3,
    countdownHours: { min: 2, max: 5 },
    viewerCount: { min: 8, max: 18 }
};

// ===== Sample Data =====
const toastData = [
    { location: '서울 강남구', type: '정형외과', time: '방금 전' },
    { location: '경기 성남시', type: '치과', time: '1분 전' },
    { location: '부산 해운대구', type: '약국', time: '2분 전' },
    { location: '서울 서초구', type: '내과', time: '3분 전' },
    { location: '인천 남동구', type: '한의원', time: '4분 전' },
    { location: '경기 용인시', type: '피부과', time: '5분 전' },
    { location: '서울 송파구', type: '안과', time: '6분 전' },
    { location: '경기 고양시', type: '이비인후과', time: '7분 전' },
    { location: '부산 수영구', type: '산부인과', time: '8분 전' },
    { location: '서울 마포구', type: '정신건강의학과', time: '9분 전' }
];

// ===== Progress Bar =====
function updateProgressBar() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = (scrollTop / docHeight) * 100;
    progressBar.style.width = `${progress}%`;
}

// ===== Header Scroll Effect =====
function handleHeaderScroll() {
    if (window.scrollY > 50) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
}

// ===== Floating CTA =====
function handleFloatingCta() {
    if (window.scrollY > 500) {
        floatingCta.classList.add('visible');
    } else {
        floatingCta.classList.remove('visible');
    }
}

// ===== Toast Notifications =====
let toastIndex = 0;
let activeToasts = 0;

function createToast() {
    if (activeToasts >= CONFIG.maxToasts) return;

    const data = toastData[toastIndex % toastData.length];
    toastIndex++;
    activeToasts++;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <span class="toast-icon">📋</span>
        <div class="toast-content">
            <strong>${data.location}</strong> ${data.type} 원장님이<br>
            <span>${data.time}</span> 상담 신청하셨습니다
        </div>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
        activeToasts--;
    }, 5000);
}

// ===== Countdown Timer =====
function initCountdown() {
    const hours = Math.floor(Math.random() * (CONFIG.countdownHours.max - CONFIG.countdownHours.min + 1)) + CONFIG.countdownHours.min;
    const minutes = Math.floor(Math.random() * 60);
    const seconds = Math.floor(Math.random() * 60);

    let totalSeconds = hours * 3600 + minutes * 60 + seconds;

    function updateCountdown() {
        if (totalSeconds <= 0) {
            totalSeconds = CONFIG.countdownHours.min * 3600;
        }

        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;

        countdown.textContent = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        totalSeconds--;
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);
}

// ===== Viewer Count =====
function updateViewerCount() {
    const base = Math.floor(Math.random() * (CONFIG.viewerCount.max - CONFIG.viewerCount.min + 1)) + CONFIG.viewerCount.min;
    const variation = Math.floor(Math.random() * 3) - 1;
    const newCount = Math.max(CONFIG.viewerCount.min, Math.min(CONFIG.viewerCount.max, base + variation));
    viewerCount.textContent = newCount;
}

// ===== Tab Navigation =====
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            // Update buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update panels
            tabPanels.forEach(panel => {
                panel.classList.remove('active');
                if (panel.id === `tab-${targetTab}`) {
                    panel.classList.add('active');
                }
            });
        });
    });
}

// ===== FAQ Accordion =====
function initFaq() {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');

        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');

            // Close all items
            faqItems.forEach(i => i.classList.remove('active'));

            // Open clicked item if it wasn't active
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });
}

// ===== Counter Animation =====
function animateCounters() {
    const counters = document.querySelectorAll('[data-count]');

    const observerOptions = {
        threshold: 0.5
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = parseInt(counter.dataset.count);
                const duration = 2000;
                const increment = target / (duration / 16);
                let current = 0;

                const updateCounter = () => {
                    current += increment;
                    if (current < target) {
                        counter.textContent = Math.floor(current).toLocaleString();
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

// ===== Modal Handling =====
const privacyModal = document.getElementById('privacyModal');
const successModal = document.getElementById('successModal');
const closeModalBtn = document.getElementById('closeModal');
const agreeBtn = document.getElementById('agreeBtn');
const closeSuccessModalBtn = document.getElementById('closeSuccessModal');
const privacyLink = document.querySelector('.agreement-text .link');
const agreeCheckbox = document.getElementById('agree');

function openModal(modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function initModals() {
    // Privacy link click
    if (privacyLink) {
        privacyLink.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(privacyModal);
        });
    }

    // Close modal buttons
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => closeModal(privacyModal));
    }

    if (closeSuccessModalBtn) {
        closeSuccessModalBtn.addEventListener('click', () => {
            closeModal(successModal);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Agree button
    if (agreeBtn) {
        agreeBtn.addEventListener('click', () => {
            if (agreeCheckbox) {
                agreeCheckbox.checked = true;
            }
            closeModal(privacyModal);
        });
    }

    // Close on overlay click
    [privacyModal, successModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal(modal);
                }
            });
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (privacyModal && privacyModal.classList.contains('active')) {
                closeModal(privacyModal);
            }
            if (successModal && successModal.classList.contains('active')) {
                closeModal(successModal);
            }
        }
    });
}

// ===== Form Handling =====
function initForm() {
    if (!consultForm) return;

    // Phone number formatting
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 11) value = value.slice(0, 11);

            if (value.length > 7) {
                value = value.replace(/(\d{3})(\d{4})(\d{0,4})/, '$1-$2-$3');
            } else if (value.length > 3) {
                value = value.replace(/(\d{3})(\d{0,4})/, '$1-$2');
            }

            e.target.value = value;
        });
    }

    // Form submission
    consultForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const formData = new FormData(consultForm);
        const data = Object.fromEntries(formData.entries());

        // Validate required fields
        const requiredFields = ['name', 'phone', 'business', 'revenue', 'region'];
        let isValid = true;

        requiredFields.forEach(field => {
            const input = document.getElementById(field);
            if (!data[field]) {
                isValid = false;
                if (input) {
                    input.classList.add('error');
                    setTimeout(() => input.classList.remove('error'), 3000);
                }
            }
        });

        // Check agree checkbox
        if (!document.getElementById('agree').checked) {
            isValid = false;
            const agreeLabel = document.querySelector('.checkbox-label');
            if (agreeLabel) {
                agreeLabel.style.color = 'var(--danger)';
                setTimeout(() => agreeLabel.style.color = '', 3000);
            }
        }

        if (!isValid) {
            // Show error message
            showToastMessage('필수 항목을 모두 입력해주세요.', 'error');
            return;
        }

        // Simulate form submission
        const submitBtn = consultForm.querySelector('.submit-button');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span>신청 중...</span>';
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');

        setTimeout(() => {
            // Update success modal with submitted info
            const successName = document.getElementById('successName');
            const successPhone = document.getElementById('successPhone');
            if (successName) successName.textContent = `성함: ${data.name}`;
            if (successPhone) successPhone.textContent = `연락처: ${data.phone}`;

            // Show success modal
            openModal(successModal);

            // Reset form
            consultForm.reset();
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
        }, 1500);
    });
}

// Toast message helper
function showToastMessage(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.borderLeftColor = type === 'error' ? 'var(--danger)' : 'var(--accent)';
    toast.innerHTML = `
        <span class="toast-icon">${type === 'error' ? '⚠️' : '✅'}</span>
        <div class="toast-content">${message}</div>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => toast.remove(), 5000);
}

// ===== Smooth Scroll =====
function initSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href === '#') return;

            e.preventDefault();
            const target = document.querySelector(href);

            if (target) {
                const headerHeight = header.offsetHeight;
                const targetPosition = target.offsetTop - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// ===== Intersection Observer for Animations =====
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll(
        '.pain-card, .product-card, .benefit-card, .case-card, .process-step, .qual-card'
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

    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        observer.observe(el);
    });
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    // Scroll handlers
    window.addEventListener('scroll', () => {
        updateProgressBar();
        handleHeaderScroll();
        handleFloatingCta();
    });

    // Initialize components
    initTabs();
    initFaq();
    initForm();
    initModals();
    initSmoothScroll();
    initScrollAnimations();
    animateCounters();
    initCountdown();

    // Start toast notifications after delay
    setTimeout(() => {
        createToast();
        setInterval(createToast, CONFIG.toastInterval);
    }, 3000);

    // Update viewer count periodically
    setInterval(updateViewerCount, 10000);

    // Initial calls
    updateProgressBar();
    handleHeaderScroll();
});

// ===== Service Worker Registration (Optional) =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Uncomment to enable service worker
        // navigator.serviceWorker.register('/sw.js');
    });
}
