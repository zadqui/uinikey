/* DIRECCIONES */
  function selectAddrType(type) {
    ['segwit','taproot'].forEach(t => document.getElementById('tab-' + t).classList.toggle('selected', t === type));
  }

  let addrCount = 10;
  function changeAddrCount(delta) {
    addrCount = Math.max(5, Math.min(50, addrCount + delta));
    document.getElementById('addrCountVal').textContent = addrCount;
    document.querySelectorAll('#addrList .addr-row').forEach((row, i) => { row.style.display = i < addrCount ? '' : 'none'; });
  }

  function copyAddr(btn) {
    const addrEl = btn.parentElement.querySelector('.addr-value');
    if (!addrEl) return;
    navigator.clipboard.writeText(addrEl.textContent).then(() => {
      const icon = btn.querySelector('i');
      icon.className = 'ti ti-check';
      btn.classList.add('copy-flashed');
      showToast('Dirección copiada', 'ti-map-2');
      setTimeout(() => { icon.className = 'ti ti-copy'; btn.classList.remove('copy-flashed'); }, 1500);
    });
  }
