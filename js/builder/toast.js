/* TOAST */
  function showToast(message, iconClass = 'ti-info-circle') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="ti ${iconClass}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 280);
    }, 2800);
  }
