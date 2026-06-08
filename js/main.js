/* UiniKey landing scripts - separado desde index.html */
/* ── MOBILE MENU ── */
    function toggleMenu() {
      document.getElementById('mobileMenu').classList.toggle('open');
    }

    /* ── NAV COLOR SWAP ── */
    const nav            = document.getElementById('mainNav');
    const heroWrap       = document.querySelector('.hero-wrap');
    const processSection = document.getElementById('processSection');

    function updateNav() {
      const heroBottom = heroWrap.getBoundingClientRect().bottom;
      const processTop = processSection.getBoundingClientRect().top;
      if (heroBottom <= 80 && processTop >64) {
        nav.classList.add('on-dark');
      } else {
        nav.classList.remove('on-dark');
      }
    }
    window.addEventListener('scroll', updateNav, { passive: true });
    updateNav();

    /* ── SCROLL REVEAL (solo sections sin page-load animation) ── */
    const revealEls = document.querySelectorAll('.reveal, .reveal-scale, .reveal-left, .reveal-right');
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    revealEls.forEach(el => revealObserver.observe(el));

    /* ── FAQ ACCORDION ── */
    function toggleFaq(trigger) {
      const item   = trigger.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    }

    /* ── RE-TRIGGER PAGE-LOAD ANIMATIONS on section enter (Privacidad & FAQ) ── */
    /* They are CSS animations so they fire on load regardless — 
       but if user navigates directly via anchor, we reset them so they replay */
    const sectionsWithPageAnim = [
      document.getElementById('privacySection'),
      document.getElementById('faqSection')
    ];
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const animEls = entry.target.querySelectorAll(
              '[class*="privacy-animate"], [class*="faq-animate"]'
            );
            animEls.forEach(el => {
              el.style.animation = 'none';
              el.offsetHeight; /* reflow */
              el.style.animation = '';
            });
          }
        });
      },
      { threshold: 0.15 }
    );
    sectionsWithPageAnim.forEach(s => { if (s) sectionObserver.observe(s); });

    const mainNav = document.getElementById('mainNav');


window.addEventListener('scroll', updateNavbarBackground, { passive: true });
updateNavbarBackground();
