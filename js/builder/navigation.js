/* SECTION SWITCH */
function showSection(name) {
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });

  const targetSection = document.getElementById('section-' + name);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  const navEl = document.getElementById('nav-' + name);
  if (navEl) {
    navEl.classList.add('active');
  }
}

window.addEventListener('load', () => {
  showSection('llaves');
});