/* TIMELOCK */
  function selectTimelock(type) {
    ['none','relative','absolute','combo'].forEach(t => document.getElementById('tl-' + t).classList.remove('selected'));
    document.getElementById('tl-' + type).classList.add('selected');
    ['relative','absolute','combo'].forEach(t => {
      document.getElementById('panel-' + t).classList.toggle('visible', t === type);
    });
  }
