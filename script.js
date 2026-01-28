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

// ===== Header Scroll Effect =====
function handleScroll() {
    if (window.scrollY > 50) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }

    // Floating actions visibility
    if (window.scrollY > 500) {
        floatingActions.classList.add('visible');
    } else {
        floatingActions.classList.remove('visible');
    }
}

window.addEventListener('scroll', handleScroll);

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
const faqItems = document.querySelectorAll('.faq-item');

faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    question?.addEventListener('click', () => {
        const isActive = item.classList.contains('active');

        // Close all items
        faqItems.forEach(i => i.classList.remove('active'));

        // Open clicked item if it wasn't active
        if (!isActive) {
            item.classList.add('active');
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
                input?.classList.add('error');
                setTimeout(() => input?.classList.remove('error'), 3000);
            }
        });

        // Check agree checkbox
        if (!agreeCheckbox?.checked) {
            isValid = false;
            const agreeLabel = document.querySelector('.checkbox-label');
            agreeLabel.style.color = 'var(--danger)';
            setTimeout(() => agreeLabel.style.color = '', 3000);
        }

        if (!isValid) {
            alert('필수 항목을 모두 입력해주세요.');
            return;
        }

        // Simulate form submission
        const submitBtn = consultForm.querySelector('.submit-btn');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '신청 중...';
        submitBtn.disabled = true;

        setTimeout(() => {
            // Update success modal
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
        }, 1500);
    });
}

// ===== Scroll Animations =====
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll(
        '.service-card, .product-card, .case-card, .qual-card, .doc-card, .news-card'
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

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    handleScroll();
    animateCounters();
    initForm();
    initScrollAnimations();
    initNavDropdowns();
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
