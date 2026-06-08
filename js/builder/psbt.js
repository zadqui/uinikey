/* PSBT */
  const EXAMPLE_PSBT = 'cHNidP8BAH0CAAAAAa7FuEyE6mBg7PJzlpF6AkAXRnhEqymQfFr2gR5kDqFLAQAAAAD9////AkBCDwAAAAAAIgAg5P3/ZuJnxHQvdyp1aZm+7KGmDePphlCkC9Q8TI5iBUCQkA4AAAAAACJRIBXjxU3H2p8KG9zGd0P5lGlLDfkmH5Kx4bXl8GOPHLa8AAAAAAABALUBAAAAAQAA...';
  let currentPsbt = '';

  function onPsbtInput() {
    currentPsbt = document.getElementById('psbtTextarea').value.trim();
    if (currentPsbt.length > 20) {
      document.getElementById('psbtDropzone').classList.add('has-file');
      document.getElementById('psbtDropIcon').className = 'ti ti-file-check psbt-drop-icon';
      document.getElementById('psbtDropTitle').textContent = 'PSBT cargado manualmente';
      document.getElementById('psbtDropSub').textContent = currentPsbt.length + ' caracteres Base64';
    } else { resetDropzone(); }
  }

  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(e.target.result)));
      document.getElementById('psbtTextarea').value = base64;
      currentPsbt = base64;
      document.getElementById('psbtDropzone').classList.add('has-file');
      document.getElementById('psbtDropIcon').className = 'ti ti-circle-check psbt-drop-icon';
      document.getElementById('psbtDropTitle').textContent = file.name;
      document.getElementById('psbtDropSub').textContent = (file.size / 1024).toFixed(1) + ' KB · listo para analizar';
      showToast('Archivo cargado: ' + file.name, 'ti-file-check');
    };
    reader.readAsArrayBuffer(file);
  }

  function loadExamplePsbt() {
    document.getElementById('psbtTextarea').value = EXAMPLE_PSBT;
    currentPsbt = EXAMPLE_PSBT;
    document.getElementById('psbtDropzone').classList.add('has-file');
    document.getElementById('psbtDropIcon').className = 'ti ti-flask psbt-drop-icon';
    document.getElementById('psbtDropTitle').textContent = 'PSBT de ejemplo cargado';
    document.getElementById('psbtDropSub').textContent = 'Transacción 2-de-3 multisig de prueba';
    showToast('PSBT de ejemplo cargado', 'ti-flask');
  }

  function clearPsbt() {
    document.getElementById('psbtTextarea').value = '';
    currentPsbt = '';
    resetDropzone();
    document.getElementById('psbtStatusCard').classList.remove('visible');
    document.getElementById('psbtInitialTip').style.display = '';
    document.getElementById('broadcastBtn').disabled = true;
    showToast('PSBT limpiado', 'ti-trash');
  }

  function resetDropzone() {
    document.getElementById('psbtDropzone').classList.remove('has-file');
    document.getElementById('psbtDropIcon').className = 'ti ti-file-upload psbt-drop-icon';
    document.getElementById('psbtDropTitle').textContent = 'Arrastra tu archivo .psbt aquí';
    document.getElementById('psbtDropSub').textContent = 'o haz clic para seleccionar desde tu equipo';
  }

  function analyzePsbt() {
    const psbt = document.getElementById('psbtTextarea').value.trim();
    if (!psbt || psbt.length < 20) { showToast('Pega un PSBT válido primero', 'ti-alert-triangle'); shakePsbtTextarea(); return; }
    const spinner = document.getElementById('psbtSpinner');
    const icon    = document.getElementById('psbtAnalyzeIcon');
    spinner.classList.add('visible'); icon.style.display = 'none';
    setTimeout(() => {
      spinner.classList.remove('visible'); icon.style.display = '';
      document.getElementById('psbtStatusCard').classList.add('visible');
      document.getElementById('psbtInitialTip').style.display = 'none';
      document.getElementById('psbtProgressFill').style.width = '50%';
      document.getElementById('psbtProgressLabel').textContent = '1 de 2 requeridas';
      document.getElementById('psbtStatusBadge').textContent = 'Pendiente de firmas';
      document.getElementById('psbtStatusBadge').className = 'psbt-status-badge badge-pending';
      document.getElementById('broadcastBtn').disabled = true;
      showToast('PSBT analizado correctamente', 'ti-check');
    }, 1100);
  }

  function shakePsbtTextarea() {
    const ta = document.getElementById('psbtTextarea');
    ta.style.borderColor = 'rgba(220,53,69,0.6)';
    ta.style.animation = 'none'; ta.offsetHeight;
    ta.style.animation = 'shake 0.4s ease';
    setTimeout(() => { ta.style.borderColor = ''; ta.style.animation = ''; }, 500);
  }

  const shakeStyle = document.createElement('style');
  shakeStyle.textContent = `@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }`;
  document.head.appendChild(shakeStyle);

  function downloadPsbt() {
    const psbt = document.getElementById('psbtTextarea').value.trim();
    if (!psbt) { showToast('No hay PSBT cargado', 'ti-alert-triangle'); return; }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([psbt], {type:'text/plain'})), download: 'transaccion.psbt' });
    a.click(); URL.revokeObjectURL(a.href);
    showToast('PSBT descargado', 'ti-download');
  }

  function copyPsbt() {
    const psbt = document.getElementById('psbtTextarea').value.trim();
    if (!psbt) { showToast('No hay PSBT cargado', 'ti-alert-triangle'); return; }
    navigator.clipboard.writeText(psbt).then(() => showToast('PSBT copiado al portapapeles', 'ti-clipboard'));
  }

  function broadcastTx() {
    showToast('Haciendo broadcast a la red Bitcoin…', 'ti-broadcast');
    setTimeout(() => showToast('✅ Transacción enviada a la mempool', 'ti-circle-check'), 1800);
  }

  function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const icon = btn.querySelector('i');
      if (icon) { icon.className = 'ti ti-check'; setTimeout(() => icon.className = 'ti ti-copy', 1500); }
      showToast('Copiado al portapapeles', 'ti-clipboard');
    });
  }

  function downloadDescriptor() {
    const desc = 'wsh(and_v(v:sortedmulti(2,),after(900000)))';
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([desc], {type:'text/plain'})), download: 'descriptor.txt' });
    a.click(); URL.revokeObjectURL(a.href);
    showToast('Descriptor descargado', 'ti-download');
  }

  
/* DRAG AND DROP */
  const dropzone = document.getElementById('psbtDropzone');
  if (dropzone) dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  if (dropzone) dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  if (dropzone) dropzone.addEventListener('drop', (e) => {
    e.preventDefault(); dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload({ target: { files: [file] } });
  });
