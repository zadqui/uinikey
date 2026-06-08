/* LLAVES */
  let signerCount = 1;
  function addSigner() {
    signerCount++;
    const list = document.getElementById('signersList');
    const div  = document.createElement('div');
    div.className = 'signer-entry new-entry';
    div.id = 'signer-' + signerCount;
    div.style.marginTop = '1.5rem';
    div.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;">
        <p class="signer-label">Firmante ${signerCount}</p>
        <button onclick="removeSigner(${signerCount})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:0.8rem;font-family:var(--font-body);display:flex;align-items:center;gap:4px;padding:0;transition:color 0.2s;" onmouseover="this.style.color='#dc3545'" onmouseout="this.style.color='var(--text-muted)'">
          <i class="ti ti-x" style="font-size:0.85rem;"></i> Eliminar
        </button>
      </div>
      <p class="xpub-label">xpub / ypub / zpub</p>
      <textarea class="xpub-input" placeholder="xpub…" oninput="updateFingerprint(this, 'fp-${signerCount}')"></textarea>
      <p class="xpub-hint">Formato: xpub… (~111 chars) · de Ledger, Trezor, Coldcard, Sparrow…</p>
      <div class="fingerprint-row">
        <span class="fingerprint-label">Fingerprint:</span>
        <span class="fingerprint-value" id="fp-${signerCount}">—</span>
      </div>`;
    list.appendChild(div);
    setTimeout(() => div.classList.remove('new-entry'), 400);
  }

  function removeSigner(id) {
    const el = document.getElementById('signer-' + id);
    if (el) {
      el.style.transition = 'opacity 0.2s, transform 0.2s';
      el.style.opacity = '0'; el.style.transform = 'translateX(12px)';
      setTimeout(() => el.remove(), 220);
    }
  }

  function updateFingerprint(textarea, fpId) {
    const val = textarea.value.trim();
    document.getElementById(fpId).textContent = val.length > 8 ? val.slice(4, 12).toUpperCase() : '—';
  }
