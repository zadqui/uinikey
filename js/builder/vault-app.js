/* UiniKey Vault App — conecta la UI del builder con la lógica real */
'use strict';

let vaultState = null;
let vaultAddrCount = 10;
let currentPsbt = '';
const EXAMPLE_PSBT = 'cHNidP8BAFICAAAAAaGyw9Tl9qe4ydDh8qO0xdbn+KmwwdLj9KW2x9jp8KGyAAAAAAD/////AcDT8gUAAAAAFgAU6HdIvhhTjRZMTcTKRi3H9qWGfCwAAAAAAAEBK2Ba9AUAAAAAIgAgQ3gUwcnRb+H7mPmqZswHTACarHTS7WqbQZlQb3PS4LgAAA==';

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function safeToast(message, icon = 'ti-info-circle') {
  if (typeof showToast === 'function') showToast(message, icon);
  else console.log(message);
}

function waitForBitcoinVault(callback, tries = 0) {
  if (window.BitcoinVault && window.VaultBackend) {
    callback();
    return;
  }
  if (tries > 160) {
    safeToast('No se pudo cargar la librería de Bitcoin. Usa Live Server o un servidor local.', 'ti-alert-triangle');
    console.error('BitcoinVault o VaultBackend no están disponibles. Revisa que el .wasm cargue correctamente.');
    return;
  }
  setTimeout(() => waitForBitcoinVault(callback, tries + 1), 50);
}

function initVaultApp() {
  if (window.__uinikeyVaultReady) return;
  window.__uinikeyVaultReady = true;

  vault = new VaultBackend.VaultState(window.BitcoinVault);
  vault.addSigner();
  vault.m = 1;
  vault.addrType = 'segwit';

  renderSigners();
  bindStaticControls();
  selectTimelock('none');
  updateM(1);
  renderDescriptor();
  renderAddresses();
}

function bindStaticControls() {
  const mInput = $('.mn-number');
  if (mInput) {
    mInput.addEventListener('input', () => updateM(mInput.value));
  }

  ['panel-relative', 'panel-absolute', 'panel-combo'].forEach(id => {
    const panel = document.getElementById(id);
    if (!panel) return;
    $all('input, select, textarea', panel).forEach(el => {
      el.addEventListener('input', () => { syncTimelockFromDOM(); renderDescriptor(); renderAddresses(); });
      el.addEventListener('change', () => { syncTimelockFromDOM(); renderDescriptor(); renderAddresses(); });
    });
  });

  const psbtTextarea = document.getElementById('psbtTextarea');
  if (psbtTextarea) psbtTextarea.addEventListener('input', onPsbtInput);

  const dropzone = document.getElementById('psbtDropzone');
  if (dropzone) {
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload({ target: { files: [file] } });
    });
  }
}

function activeSectionName() {
  const active = document.querySelector('.section.active');
  return active ? active.id.replace('section-', '') : '';
}

window.onBuilderSectionChange = function(name) {
  if (!vault) return;
  renderDescriptor();
  if (name === 'direcciones') renderAddresses();
};

/* LLAVES */
function addSigner() {
  if (!vault) return;
  vault.addSigner();
  renderSigners();
  safeToast('Firmante añadido', 'ti-plus');
}

function removeSigner(id) {
  if (!vault) return;
  if (!vault.removeSigner(id)) {
    safeToast('Necesitas al menos un firmante', 'ti-alert-triangle');
    return;
  }
  renderSigners();
  safeToast('Firmante eliminado', 'ti-trash');
}

function updateXpub(id, value) {
  if (!vault) return;
  const signer = vault.signers.find(s => s.id === id);
  if (signer) signer._rawInput = value;
  vault.updateXpub(id, value);
  renderSignerFingerprint(id);
  renderDescriptor();
  renderAddresses();
}

/* Compatibilidad con el HTML anterior: oninput="updateFingerprint(this, 'fp-1')" */
function updateFingerprint(textarea, fpId) {
  const match = String(fpId || '').match(/(\d+)/);
  const id = match ? Number(match[1]) : 1;
  updateXpub(id, textarea.value);
}

function renderSigners() {
  if (!vault) return;
  const list = document.getElementById('signersList');
  if (!list) return;

  list.innerHTML = vault.signers.map((signer, index) => {
    const removeButton = vault.signers.length > 1
      ? `<button type="button" onclick="removeSigner(${signer.id})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:0.8rem;font-family:var(--font-body);display:flex;align-items:center;gap:4px;padding:0;transition:color 0.2s;" onmouseover="this.style.color='#dc3545'" onmouseout="this.style.color='var(--text-muted)'"><i class="ti ti-x" style="font-size:0.85rem;"></i> Eliminar</button>`
      : '';

    return `
      <div class="signer-entry" id="signer-${signer.id}" style="${index > 0 ? 'margin-top:1.5rem;' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;">
          <p class="signer-label">Firmante ${index + 1}</p>
          ${removeButton}
        </div>
        <p class="xpub-label">xpub / ypub / zpub</p>
        <textarea class="xpub-input" placeholder="[d34db33f/84'/0'/0']xpub6C4s5… o xpub6C4s5…" oninput="updateXpub(${signer.id}, this.value)">${signer._rawInput || signer.xpub || ''}</textarea>
        <p class="xpub-hint">Formato: xpub… o [fingerprint/ruta]xpub… · de Ledger, Trezor, Coldcard, Sparrow…</p>
        <div class="fingerprint-row">
          <span class="fingerprint-label">Fingerprint:</span>
          <span class="fingerprint-value" id="fp-${signer.id}">—</span>
        </div>
      </div>`;
  }).join('');

  vault.signers.forEach(s => renderSignerFingerprint(s.id));
  clampAndRenderM();
  renderDescriptor();
  renderAddresses();
}

function renderSignerFingerprint(id) {
  const signer = vault.signers.find(s => s.id === id);
  const fp = document.getElementById('fp-' + id);
  if (!signer || !fp) return;

  if (!signer.xpub || !signer.looksLikeXpub()) {
    fp.textContent = '—';
    fp.style.color = '';
    return;
  }

  if (signer._valid && signer._fingerprint) {
    const origin = signer.masterFingerprint ? ` · origen ${signer.masterFingerprint}/${signer.derivationPath}` : '';
    fp.textContent = signer._fingerprint + origin;
    fp.style.color = 'var(--ink)';
  } else {
    fp.textContent = 'xpub inválida';
    fp.style.color = '#dc3545';
  }
}

/* M DE N */
function clampAndRenderM() {
  const input = $('.mn-number');
  if (!input) return;
  input.max = Math.max(1, vault.signers.length);
  if (Number(input.value) > vault.signers.length) input.value = vault.signers.length;
  if (Number(input.value) < 1) input.value = 1;
  updateM(input.value);
}

function updateM(value) {
  if (!vault) return;
  vault.setM(value);

  const input = $('.mn-number');
  if (input) {
    input.max = Math.max(1, vault.signers.length);
    input.value = vault.m;
  }

  const total = $('.mn-total');
  if (total) total.textContent = `${vault.signers.length} firmas configuradas`;

  const badge = $('.mn-badge');
  if (badge) badge.textContent = vault.mMeaning() || 'Configura tus firmantes';

  renderDescriptor();
  renderAddresses();
}

/* TIMELOCK */
function selectTimelock(type) {
  if (!vault) return;
  vault.setTimelockType(type);

  ['none', 'relative', 'absolute', 'combo'].forEach(t => {
    const option = document.getElementById('tl-' + t);
    if (option) option.classList.toggle('selected', t === type);

    const panel = document.getElementById('panel-' + t);
    if (panel) panel.classList.toggle('visible', t === type && t !== 'none');
  });

  syncTimelockFromDOM();
  renderDescriptor();
  renderAddresses();
}

function unitToBackend(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.startsWith('mes')) return 'months';
  if (raw.startsWith('sem')) return 'weeks';
  if (raw.startsWith('día') || raw.startsWith('dia')) return 'days';
  if (raw.startsWith('blo')) return 'blocks';
  if (['months','weeks','days','blocks'].includes(raw)) return raw;
  return 'days';
}

function syncTimelockFromDOM() {
  if (!vault) return;
  const tl = vault.timelock;

  const relative = document.getElementById('panel-relative');
  if (relative) {
    const amount = $('input.field-input', relative);
    const unit = $('select.field-select', relative);
    const key = $('textarea', relative);
    if (amount) tl.amount = amount.value || 6;
    if (unit) tl.unit = unitToBackend(unit.value);
    if (key) tl.recoveryKey = key.value || '';
  }

  const absolute = document.getElementById('panel-absolute');
  if (absolute) {
    const date = $('input.field-date', absolute);
    if (date) tl.absDate = date.value || '';
  }

  const combo = document.getElementById('panel-combo');
  if (combo) {
    const amount = $('input.combo-dur-input', combo);
    const unit = $('select.field-select', combo);
    const key = $('textarea', combo);
    if (amount) tl.comboAmount = amount.value || 90;
    if (unit) tl.comboUnit = unitToBackend(unit.value);
    if (key) tl.comboKey = key.value || '';
  }
}

/* DESCRIPTOR */
function renderDescriptor() {
  if (!vault) return;
  syncTimelockFromDOM();
  const result = vault.buildDescriptor();
  const plain = result.plain || '';
  const plainFull = result.plainFull || plain;
  const validSigners = vault.signers.filter(s => s._valid).length;

  const metaCards = $all('.descriptor-meta .desc-meta-card');
  if (metaCards[0]) {
    $('.desc-meta-value', metaCards[0]).textContent = `${vault.m}-de-${vault.signers.length}`;
    $('.desc-meta-sub', metaCards[0]).textContent = vault.timelock.type === 'none' ? 'Multisig P2WSH' : 'Miniscript con timelock';
  }
  if (metaCards[1]) {
    $('.desc-meta-value', metaCards[1]).textContent = `${validSigners}/${vault.signers.length}`;
    $('.desc-meta-sub', metaCards[1]).textContent = 'xpubs configuradas';
  }
  if (metaCards[2]) {
    const map = { none: '—', relative: 'older()', absolute: 'after()', combo: 'or_d()' };
    $('.desc-meta-value', metaCards[2]).textContent = map[vault.timelock.type] || '—';
    $('.desc-meta-sub', metaCards[2]).textContent = vault.timelock.type === 'none' ? 'sin condición de tiempo' : 'timelock activo';
  }

  const code = $('.descriptor-code');
  if (code) code.textContent = plain;

  const copyBtn = $('.descriptor-copy-btn');
  if (copyBtn) copyBtn.onclick = () => copyToClipboard(plainFull, copyBtn);

  const warning = $('.desc-warning');
  const warningText = $('.desc-warning-text');
  if (warning && warningText) {
    if (validSigners === 0) {
      warning.style.display = '';
      warningText.innerHTML = '⚠ Ingresa al menos una xpub en la sección <strong>Llaves</strong> para generar un descriptor válido.';
    } else if (validSigners < vault.signers.length) {
      warning.style.display = '';
      warningText.innerHTML = `⚠ Hay ${vault.signers.length - validSigners} xpub(s) inválida(s) o incompleta(s).`;
    } else {
      warning.style.display = '';
      warningText.innerHTML = result.hasTL
        ? '✓ Descriptor Miniscript listo. Para timelocks, valida compatibilidad con Liana/Sparrow antes de recibir fondos.'
        : '✓ Descriptor BIP380 listo para importar en wallets compatibles como Sparrow o Liana.';
    }
  }

  const exportButtons = $all('.descriptor-export-btns .export-btn');
  if (exportButtons[0]) exportButtons[0].onclick = () => downloadDescriptor();
  if (exportButtons[1]) exportButtons[1].onclick = () => copyToClipboard(plainFull, exportButtons[1]);
}

function currentDescriptor() {
  if (!vault) return '';
  return vault.buildDescriptor().plainFull || vault.buildDescriptor().plain || '';
}

function downloadDescriptor() {
  const desc = currentDescriptor();
  if (!desc) {
    safeToast('No hay descriptor para descargar', 'ti-alert-triangle');
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([desc], { type: 'text/plain' }));
  a.download = 'uinikey-descriptor.txt';
  a.click();
  URL.revokeObjectURL(a.href);
  safeToast('Descriptor descargado', 'ti-download');
}

function copyToClipboard(text, btn) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const icon = btn && btn.querySelector ? btn.querySelector('i') : null;
    const original = icon ? icon.className : '';
    if (icon) {
      icon.className = 'ti ti-check';
      setTimeout(() => { icon.className = original || 'ti ti-copy'; }, 1500);
    }
    safeToast('Copiado al portapapeles', 'ti-clipboard');
  }).catch(() => safeToast('No se pudo copiar', 'ti-alert-triangle'));
}

/* DIRECCIONES */
function selectAddrType(type) {
  if (!vault) return;
  vault.addrType = type;
  ['segwit', 'taproot'].forEach(t => {
    const tab = document.getElementById('tab-' + t);
    if (tab) tab.classList.toggle('selected', t === type);
  });
  renderAddresses();
}

function changeAddrCount(delta) {
  vaultAddrCount = Math.max(5, Math.min(50, vaultAddrCount + delta));
  const val = document.getElementById('addrCountVal');
  if (val) val.textContent = vaultAddrCount;
  renderAddresses();
}

function renderAddresses() {
  if (!vault) return;
  const list = document.getElementById('addrList');
  if (!list) return;

  const derived = vault.deriveAddresses(vaultAddrCount);
  const result = derived.result;
  const autoswitch = $('.addr-autoswitch');

  if (autoswitch) {
    autoswitch.style.display = derived.forcedToTaproot ? '' : 'none';
  }

  if (result.notice && autoswitch && !derived.forcedToTaproot) {
    // Conservamos tu nota fija de privacidad; los avisos críticos salen en la lista.
  }

  if (result.status === 'blocked') {
    list.innerHTML = `<div class="addr-row"><span class="addr-value">${result.notice || 'Configura al menos una xpub válida para ver direcciones.'}</span></div>`;
    return;
  }

  const addresses = result.addresses || [];
  if (!addresses.length) {
    list.innerHTML = `<div class="addr-row"><span class="addr-value">${result.notice || 'Sin direcciones disponibles.'}</span></div>`;
    return;
  }

  list.innerHTML = addresses.map(item => {
    if (item.error || !item.address) {
      return `<div class="addr-row"><span class="addr-index">#${item.index}</span><span class="addr-value">Error: ${item.error || 'no disponible'}</span></div>`;
    }
    return `
      <div class="addr-row">
        <span class="addr-index">#${item.index}</span>
        <span class="addr-value">${item.address}</span>
        <button class="addr-copy-btn" onclick="copyAddr(this)" title="Copiar"><i class="ti ti-copy"></i></button>
      </div>`;
  }).join('');
}

function copyAddr(btn) {
  const addrEl = btn.closest('.addr-row').querySelector('.addr-value');
  if (!addrEl) return;
  navigator.clipboard.writeText(addrEl.textContent).then(() => {
    const icon = btn.querySelector('i');
    if (icon) icon.className = 'ti ti-check';
    btn.classList.add('copy-flashed');
    safeToast('Dirección copiada', 'ti-map-2');
    setTimeout(() => {
      if (icon) icon.className = 'ti ti-copy';
      btn.classList.remove('copy-flashed');
    }, 1500);
  });
}

/* PSBT */
function onPsbtInput() {
  const textarea = document.getElementById('psbtTextarea');
  currentPsbt = textarea ? textarea.value.trim() : '';
  if (currentPsbt.length > 20) {
    const dz = document.getElementById('psbtDropzone');
    if (dz) dz.classList.add('has-file');
    const icon = document.getElementById('psbtDropIcon');
    const title = document.getElementById('psbtDropTitle');
    const sub = document.getElementById('psbtDropSub');
    if (icon) icon.className = 'ti ti-file-check psbt-drop-icon';
    if (title) title.textContent = 'PSBT cargado manualmente';
    if (sub) sub.textContent = currentPsbt.length + ' caracteres Base64';
  } else {
    resetDropzone();
  }
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = String(e.target.result || '').trim();
    const textarea = document.getElementById('psbtTextarea');
    if (textarea) textarea.value = text;
    currentPsbt = text;
    const dz = document.getElementById('psbtDropzone');
    if (dz) dz.classList.add('has-file');
    const icon = document.getElementById('psbtDropIcon');
    const title = document.getElementById('psbtDropTitle');
    const sub = document.getElementById('psbtDropSub');
    if (icon) icon.className = 'ti ti-circle-check psbt-drop-icon';
    if (title) title.textContent = file.name;
    if (sub) sub.textContent = (file.size / 1024).toFixed(1) + ' KB · listo para analizar';
    safeToast('Archivo cargado: ' + file.name, 'ti-file-check');
  };
  reader.readAsText(file);
}

function loadExamplePsbt() {
  const textarea = document.getElementById('psbtTextarea');
  if (textarea) textarea.value = EXAMPLE_PSBT;
  currentPsbt = EXAMPLE_PSBT;
  onPsbtInput();
  safeToast('PSBT de ejemplo cargado', 'ti-flask');
}

function clearPsbt() {
  const textarea = document.getElementById('psbtTextarea');
  if (textarea) textarea.value = '';
  currentPsbt = '';
  resetDropzone();
  const card = document.getElementById('psbtStatusCard');
  if (card) card.classList.remove('visible');
  const tip = document.getElementById('psbtInitialTip');
  if (tip) tip.style.display = '';
  const broadcast = document.getElementById('broadcastBtn');
  if (broadcast) broadcast.disabled = true;
  safeToast('PSBT limpiado', 'ti-trash');
}

function resetDropzone() {
  const dz = document.getElementById('psbtDropzone');
  if (dz) dz.classList.remove('has-file');
  const icon = document.getElementById('psbtDropIcon');
  const title = document.getElementById('psbtDropTitle');
  const sub = document.getElementById('psbtDropSub');
  if (icon) icon.className = 'ti ti-file-upload psbt-drop-icon';
  if (title) title.textContent = 'Arrastra tu archivo .psbt aquí';
  if (sub) sub.textContent = 'o haz clic para seleccionar desde tu equipo';
}

function analyzePsbt() {
  if (!vault) return;
  const textarea = document.getElementById('psbtTextarea');
  const psbt = textarea ? textarea.value.trim() : '';
  if (!psbt || psbt.length < 20) {
    safeToast('Pega un PSBT válido primero', 'ti-alert-triangle');
    shakePsbtTextarea();
    return;
  }

  const spinner = document.getElementById('psbtSpinner');
  const icon = document.getElementById('psbtAnalyzeIcon');
  if (spinner) spinner.classList.add('visible');
  if (icon) icon.style.display = 'none';

  setTimeout(() => {
    const result = vault.parsePSBT(psbt);
    if (spinner) spinner.classList.remove('visible');
    if (icon) icon.style.display = '';
    renderPsbtResult(result);
  }, 350);
}

function renderPsbtResult(result) {
  const card = document.getElementById('psbtStatusCard');
  const tip = document.getElementById('psbtInitialTip');
  const badge = document.getElementById('psbtStatusBadge');
  const broadcast = document.getElementById('broadcastBtn');
  if (card) card.classList.add('visible');
  if (tip) tip.style.display = 'none';

  if (!result.valid || result.error) {
    if (badge) {
      badge.textContent = 'PSBT inválido';
      badge.className = 'psbt-status-badge badge-error';
    }
    const list = document.getElementById('psbtSignerList');
    if (list) list.innerHTML = `<div class="psbt-signer-row"><div class="psbt-signer-info"><p class="psbt-signer-name">Error</p><p class="psbt-signer-fp">${result.error || 'No se pudo analizar el PSBT.'}</p></div></div>`;
    if (broadcast) broadcast.disabled = true;
    safeToast('PSBT inválido', 'ti-alert-triangle');
    return;
  }

  const ready = result.readyToBroadcast;
  if (badge) {
    badge.textContent = ready ? 'Completo' : 'Pendiente de firmas';
    badge.className = 'psbt-status-badge ' + (ready ? 'badge-complete' : 'badge-pending');
  }

  const amount = (result.outputs || []).reduce((sum, output) => sum + Number(output.value || 0), 0);
  const txAmount = document.getElementById('txAmount');
  const txFee = document.getElementById('txFee');
  const txInputs = document.getElementById('txInputs');
  const txOutputs = document.getElementById('txOutputs');
  if (txAmount) txAmount.textContent = (amount / 1e8).toFixed(8) + ' BTC';
  if (txFee) txFee.textContent = 'No disponible';
  if (txInputs) txInputs.textContent = result.inputCount + ' input(s)';
  if (txOutputs) txOutputs.textContent = result.outputCount + ' output(s)';

  const totalNeeded = Math.max(1, result.m * result.inputCount);
  const pct = Math.min(100, Math.round((result.totalSigs / totalNeeded) * 100));
  const fill = document.getElementById('psbtProgressFill');
  const label = document.getElementById('psbtProgressLabel');
  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = `${result.totalSigs} de ${totalNeeded} requeridas`;

  const list = document.getElementById('psbtSignerList');
  if (list) {
    list.innerHTML = (result.inputs || []).map(input => {
      const signed = input.partialSigs > 0;
      const fps = input.bip32Derivations && input.bip32Derivations.length
        ? input.bip32Derivations.map(d => d.fingerprint).join(', ')
        : '—';
      return `
        <div class="psbt-signer-row">
          <div class="psbt-signer-icon ${signed ? 'signer-signed' : 'signer-pending'}"><i class="ti ${signed ? 'ti-check' : 'ti-clock'}"></i></div>
          <div class="psbt-signer-info"><p class="psbt-signer-name">Input #${input.index}</p><p class="psbt-signer-fp">Fingerprints: ${fps} · Firmas parciales: ${input.partialSigs}</p></div>
          <span class="psbt-signer-status ${signed ? 'status-signed' : 'status-pending'}">${signed ? 'Firmado' : 'Pendiente'}</span>
        </div>`;
    }).join('');
  }

  if (broadcast) broadcast.disabled = !ready;
  safeToast('PSBT analizado correctamente', 'ti-check');
}

function shakePsbtTextarea() {
  const ta = document.getElementById('psbtTextarea');
  if (!ta) return;
  ta.style.borderColor = 'rgba(220,53,69,0.6)';
  ta.style.animation = 'none';
  ta.offsetHeight;
  ta.style.animation = 'shake 0.4s ease';
  setTimeout(() => { ta.style.borderColor = ''; ta.style.animation = ''; }, 500);
}

function downloadPsbt() {
  const psbt = document.getElementById('psbtTextarea') ? document.getElementById('psbtTextarea').value.trim() : '';
  if (!psbt) { safeToast('No hay PSBT cargado', 'ti-alert-triangle'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([psbt], { type: 'text/plain' }));
  a.download = 'transaccion.psbt';
  a.click();
  URL.revokeObjectURL(a.href);
  safeToast('PSBT descargado', 'ti-download');
}

function copyPsbt() {
  const psbt = document.getElementById('psbtTextarea') ? document.getElementById('psbtTextarea').value.trim() : '';
  if (!psbt) { safeToast('No hay PSBT cargado', 'ti-alert-triangle'); return; }
  navigator.clipboard.writeText(psbt).then(() => safeToast('PSBT copiado al portapapeles', 'ti-clipboard'));
}

function broadcastTx() {
  safeToast('Broadcast real no está conectado a un nodo en esta versión.', 'ti-broadcast');
}

const shakeStyle = document.createElement('style');
shakeStyle.textContent = '@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }';
document.head.appendChild(shakeStyle);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => waitForBitcoinVault(initVaultApp));
} else {
  waitForBitcoinVault(initVaultApp);
}
