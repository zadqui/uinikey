/**
 * VaultBuilder — Backend (Lógica de Negocio)
 * ============================================
 * Arquitectura orientada a objetos. Cero dependencias del DOM.
 * El frontend debe importar este archivo e instanciar VaultApp.
 *
 * Clases:
 *  - Signer          → representa una llave xpub y su estado de validación
 *  - TimelockConfig  → encapsula la configuración de timelock
 *  - DescriptorBuilder → construye el descriptor Miniscript
 *  - PSBTParser      → analiza un PSBT en Base64
 *  - AddressDeriver  → deriva direcciones SegWit / Taproot
 *  - VaultState      → estado global de la bóveda (Facade principal)
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// 1. SIGNER
// ─────────────────────────────────────────────────────────────
class Signer {
  /**
   * @param {number} id     - ID único del firmante
   * @param {string} alias  - Nombre descriptivo (ej. "Firmante 1")
   * @param {string} xpub   - Llave pública extendida
   */
  constructor(id, lib, alias = '', xpub = '') {
    this.lib = lib;
    this.id          = id;
    this.alias       = alias;
    this.xpub        = xpub;
    this._valid      = false;
    this._fingerprint = null;
  }

  /** Actualiza la xpub y re-valida contra bitcoinjs-lib */
  setXpub(raw) {
    this.xpub = (raw || '').trim();
    this._validate();
  }

  /** Devuelve true si la xpub parece válida superficialmente (longitud + prefijo) */
  looksLikeXpub() {
    return (
      this.xpub.length > 20 &&
      (this.xpub.startsWith('xpub') ||
       this.xpub.startsWith('ypub') ||
       this.xpub.startsWith('zpub'))
    );
  }

  /** Valida contra la biblioteca Bitcoin real y extrae el fingerprint */
  _validate() {
    if (!this.looksLikeXpub()) {
      this._valid      = false;
      this._fingerprint = null;
      return;
    }
    try {
      const info = this.lib.getXpubInfo(this.xpub);
      if (info) {
        this._valid       = true;
        this._fingerprint = info.fingerprint;
      } else {
        this._valid       = false;
        this._fingerprint = null;
      }
    } catch (_) {
      this._valid       = false;
      this._fingerprint = null;
    }
  }

  /**
   * Representación de la llave para usar en descriptores exportables.
   * Devuelve la xpub completa con ruta de derivación externa.
   */
  toDescriptorKey() {
    if (!this._valid || !this.xpub) return null;
    return `${this.xpub}/0/*`;
  }

  /**
   * Representación truncada para mostrar en la UI (solo visual).
   * @param {number} index - índice del firmante en la lista
   */
  toDisplayKey(index) {
    if (!this.xpub || this.xpub.length < 10) return `[KEY${index}]`;
    return this.xpub.slice(0, 14) + '…/0/*';
  }

  /** Serializa el firmante para persistencia */
  toJSON() {
    return { id: this.id, alias: this.alias, xpub: this.xpub };
  }

  /** Restaura un firmante desde un objeto plano */
  static fromJSON(obj) {
    const s = new Signer(obj.id, window.BitcoinVault, obj.alias, '');
    s.setXpub(obj.xpub);
    return s;
  }
}


// ─────────────────────────────────────────────────────────────
// 2. TIMELOCK CONFIG
// ─────────────────────────────────────────────────────────────
class TimelockConfig {
  /**
   * @param {'none'|'relative'|'absolute'|'combo'} type
   */
  constructor(type = 'none') {
    this.type        = type;
    // Timelock relativo / combo
    this.amount      = 6;
    this.unit        = 'months';   // 'months' | 'weeks' | 'days' | 'blocks'
    this.recoveryKey = '';         // xpub de la llave de recuperación
    // Timelock absoluto
    this.absDate     = '';
    // Combo
    this.comboAmount = 90;
    this.comboUnit   = 'days';
    this.comboKey    = '';
  }

  /** Convierte cantidad + unidad a número de bloques Bitcoin */
  static toBlocks(amount, unit) {
    const n = parseInt(amount) || 1;
    switch (unit) {
      case 'months': return n * 4320;   // ~30 días × 144 bloques/día
      case 'weeks':  return n * 1008;   // 7 días × 144 bloques/día
      case 'days':   return n * 144;    // ~1 bloque cada 10 min
      default:       return n;           // bloques directos
    }
  }

  /**
   * Parsea una fecha ISO (YYYY-MM-DD) o altura de bloque para after().
   * Bitcoin distingue: < 500_000_000 = altura, >= 500_000_000 = timestamp Unix.
   * @param {string} raw
   * @returns {{ value: number, type: 'height'|'timestamp', error: string|null }}
   */
  static parseAbsolute(raw) {
    const trimmed = (raw || '').trim();
    if (!trimmed) {
      return { value: 900000, type: 'height', error: 'Ingresa una fecha o altura de bloque' };
    }
    // Fecha ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const ts = Math.floor(new Date(trimmed + 'T00:00:00Z').getTime() / 1000);
      if (isNaN(ts)) return { value: 900000, type: 'height', error: 'Fecha inválida' };
      return { value: ts, type: 'timestamp', error: null };
    }
    // Número (altura o timestamp)
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num > 0) {
      const type = num >= 500_000_000 ? 'timestamp' : 'height';
      return { value: num, type, error: null };
    }
    return { value: 900000, type: 'height', error: 'Formato inválido. Usa YYYY-MM-DD o número de bloque' };
  }

  /**
   * Devuelve la xpub de recuperación lista para el descriptor.
   * @param {string} xpub
   * @param {string} placeholder
   */
  static recoveryKeyStr(xpub, placeholder) {
    const trimmed = (xpub || '').trim();
    if (
      !trimmed ||
      trimmed.length < 20 ||
      (!trimmed.startsWith('xpub') && !trimmed.startsWith('ypub') && !trimmed.startsWith('zpub'))
    ) {
      return `[${placeholder}]/0/*`;
    }
    return `${trimmed}/0/*`;
  }

  /** Bloques para timelock relativo */
  getRelativeBlocks() {
    return TimelockConfig.toBlocks(this.amount, this.unit);
  }

  /** Bloques para timelock combo */
  getComboBlocks() {
    return TimelockConfig.toBlocks(this.comboAmount, this.comboUnit);
  }

  /** Parsea la fecha absoluta actual */
  parseAbsoluteValue() {
    return TimelockConfig.parseAbsolute(this.absDate);
  }
}


// ─────────────────────────────────────────────────────────────
// 3. DESCRIPTOR BUILDER
// ─────────────────────────────────────────────────────────────
class DescriptorBuilder {
  /**
   * @param {Signer[]}       signers  - Lista de firmantes
   * @param {number}         m        - Umbral de firmas requeridas
   * @param {TimelockConfig} timelock - Configuración de timelock
   */
  constructor(signers, m, timelock) {
    this.signers  = signers;
    this.m        = m;
    this.timelock = timelock;
  }

  /** Número de xpubs válidas */
  get validCount() {
    return this.signers.filter(s => s._valid).length;
  }

  /** Genera sortedmulti con llaves completas (para exportar) */
  _sortedMultiFull() {
    const keys = this.signers.map(s => s.toDescriptorKey() || `[KEY${s.id}]/0/*`);
    return `sortedmulti(${this.m},${keys.join(',')})`;
  }

  /** Genera sortedmulti con llaves truncadas (para display) */
  _sortedMultiDisplay() {
    const keys = this.signers.map((s, i) => s.toDisplayKey(i));
    return `sortedmulti(${this.m},${keys.join(',')})`;
  }

  /**
   * Construye el descriptor completo.
   * @returns {{ plain: string, plainFull: string, validKeys: number }}
   *   - plain:     versión visual truncada (para mostrar en UI)
   *   - plainFull: versión real exportable (xpubs completas)
   *   - validKeys: cantidad de xpubs válidas
   */
  build() {
    const smDisplay = this._sortedMultiDisplay();
    const smFull    = this._sortedMultiFull();
    const tl        = this.timelock;
    let plain = '', plainFull = '';

    switch (tl.type) {
      case 'none':
      default:
        plain     = `wsh(${smDisplay})`;
        plainFull = `wsh(${smFull})`;
        break;

      case 'relative': {
        const blocks     = tl.getRelativeBlocks();
        const rkRaw      = tl.recoveryKey;
        const rkDisplay  = rkRaw.trim().length > 10
          ? rkRaw.trim().slice(0, 14) + '…/0/*'
          : '[RECOVERY_KEY]/0/*';
        const rkFull     = TimelockConfig.recoveryKeyStr(rkRaw, 'RECOVERY_KEY');
        plain     = `wsh(or_d(${smDisplay},and_v(v:pk(${rkDisplay}),older(${blocks}))))`;
        plainFull = `wsh(or_d(${smFull},and_v(v:pk(${rkFull}),older(${blocks}))))`;
        break;
      }

      case 'absolute': {
        const { value: tlValue } = tl.parseAbsoluteValue();
        plain     = `wsh(and_v(v:${smDisplay},after(${tlValue})))`;
        plainFull = `wsh(and_v(v:${smFull},after(${tlValue})))`;
        break;
      }

      case 'combo': {
        const blocks    = tl.getComboBlocks();
        const ckRaw     = tl.comboKey;
        const ckDisplay = ckRaw.trim().length > 10
          ? ckRaw.trim().slice(0, 14) + '…/0/*'
          : '[COMBO_KEY]/0/*';
        const ckFull    = TimelockConfig.recoveryKeyStr(ckRaw, 'COMBO_KEY');
        plain     = `wsh(or_d(${smDisplay},and_v(v:pk(${ckDisplay}),older(${blocks}))))`;
        plainFull = `wsh(or_d(${smFull},and_v(v:pk(${ckFull}),older(${blocks}))))`;
        break;
      }
    }

    return { plain, plainFull, validKeys: this.validCount };
  }

  /**
   * Aplica resaltado de sintaxis al descriptor visual.
   * Devuelve HTML listo para inyectar en el DOM.
   * @param {string} plain - descriptor visual (truncado)
   */
  static highlight(plain) {
    return plain
      .replace(/\bsortedmulti\b/g, '<span class="kw">sortedmulti</span>')
      .replace(/\bwsh\b/g,         '<span class="kw">wsh</span>')
      .replace(/\bor_d\b/g,        '<span class="kw">or_d</span>')
      .replace(/\band_v\b/g,       '<span class="kw">and_v</span>')
      .replace(/\bthresh\b/g,      '<span class="kw">thresh</span>')
      .replace(/\bv:pk\b/g,        '<span class="kw">v:pk</span>')
      .replace(/\bs:pk\b/g,        '<span class="kw">s:pk</span>')
      .replace(/\bpk\b/g,          '<span class="kw">pk</span>')
      .replace(/\bolder\b/g,       '<span class="kw">older</span>')
      .replace(/\bafter\b/g,       '<span class="kw">after</span>')
      .replace(/\[KEY\d+\]/g,      m => `<span class="key">${m}</span>`)
      .replace(/\[RECOVERY_KEY\]\/0\/\*/g, '<span class="key">[RECOVERY_KEY]/0/*</span>')
      .replace(/\[COMBO_KEY\]\/0\/\*/g,    '<span class="key">[COMBO_KEY]/0/*</span>')
      .replace(/(xpub|ypub|zpub)[^,)]+/g,  m => `<span class="key">${m}</span>`)
      .replace(/\b(\d{3,})\b/g,    '<span class="num">$1</span>');
  }

  /**
   * Genera el mensaje de validez según el estado actual.
   * @returns {{ cssClass: string, text: string }}
   */
  validityStatus() {
    const n    = this.signers.length;
    const valid = this.validCount;
    if (valid === 0) {
      return { cssClass: 'warn', text: '⚠ Ingresa al menos una xpub' };
    }
    if (valid < n) {
      return { cssClass: 'warn', text: `⚠ Faltan ${n - valid} xpub(s) — descriptor incompleto` };
    }
    const hasTL = this.timelock.type !== 'none';
    return {
      cssClass: 'ok',
      text: hasTL
        ? `✓ ${n} xpubs válidas · descriptor Miniscript listo para Liana`
        : `✓ ${n} xpubs válidas · descriptor BIP380 listo para importar en Sparrow o Liana`
    };
  }
}


// ─────────────────────────────────────────────────────────────
// 4. PSBT PARSER
// ─────────────────────────────────────────────────────────────
class PSBTParser {
  /**
   * Parsea un PSBT en Base64 usando BitcoinVaultLib.
   * @param {string} raw - PSBT en Base64
   * @param {number} m   - Umbral de firmas del vault
   * @returns {PSBTResult}
   */
  static parse(raw, m) {
    const val = (raw || '').trim();
    if (!val || val.length < 20) {
      return PSBTResult.empty();
    }
    try {
      const result = window.BitcoinVault.parsePSBT(val);
      if (result.error) {
        return PSBTResult.error(result.error);
      }
      return new PSBTResult(result, m);
    } catch (e) {
      return PSBTResult.error(e.message);
    }
  }
}

/** Resultado de parsear un PSBT */
class PSBTResult {
  constructor(raw, m) {
    this.valid       = true;
    this.error       = null;
    this.inputCount  = raw.inputCount  || 0;
    this.outputCount = raw.outputCount || 0;
    this.inputs      = raw.inputs      || [];
    this.outputs     = raw.outputs     || [];
    this.m           = m;
  }

  /** Firma totales en todos los inputs */
  get totalSigs() {
    return this.inputs.reduce((acc, inp) => acc + inp.partialSigs, 0);
  }

  /** ¿Está lista para transmitir? */
  get readyToBroadcast() {
    return this.totalSigs >= this.m * this.inputCount;
  }

  static empty() {
    const r = new PSBTResult({ inputs: [], outputs: [] }, 0);
    r.valid = false;
    r.empty = true;
    return r;
  }

  static error(msg) {
    const r = new PSBTResult({ inputs: [], outputs: [] }, 0);
    r.valid = false;
    r.error = msg;
    return r;
  }
}


// ─────────────────────────────────────────────────────────────
// 5. ADDRESS DERIVER
// ─────────────────────────────────────────────────────────────

/**
 * Resultado de una derivación de direcciones.
 * Puede ser exitoso, un aviso (warning) o un bloqueo (blocked).
 *
 * @typedef  {Object} DeriveResult
 * @property {'ok'|'warning'|'blocked'} status
 * @property {string}  typeLabel     - Etiqueta para mostrar en UI ("P2TR · bc1p…")
 * @property {string}  [notice]      - Mensaje explicativo para el usuario
 * @property {Array}   [addresses]   - Lista de direcciones si status !== 'blocked'
 */

class AddressDeriver {
  /**
   * @param {Signer[]}       signers  - Lista de firmantes
   * @param {number}         m        - Umbral de firmas requeridas
   * @param {TimelockConfig} timelock - Configuración de timelock activa
   * @param {Object}         lib      - Librería de Bitcoin
   */
  constructor(signers, m, timelock, lib) {
    this.signers  = signers;
    this.m        = m;
    this.timelock = timelock;
    this.lib = lib;
  }

  /**
   * Decide qué tipo de dirección es posible y correcto derivar
   * según la combinación de timelock + tipo de dirección pedida.
   *
   * Reglas:
   *   - Sin timelock     → SegWit (P2WSH) o Taproot (P2TR), ambos válidos.
   *   - Con timelock     → solo Taproot puede incluir la condición de tiempo
   *                        en el script. SegWit+timelock no está soportado
   *                        por la librería y produciría direcciones incorrectas.
   *   - Con timelock relativo (older)   → deriveTaprootWithCSV
   *   - Con timelock absoluto (after)   → deriveTaprootWithCLTV
   *   - Con timelock combo (or_d)       → deriveTaprootWithCSV (misma estructura)
   *
   * @param {'segwit'|'taproot'} requestedType - Lo que el usuario seleccionó
   * @param {number} count
   * @returns {DeriveResult}
   */
  derive(requestedType = 'segwit', count = 10) {
    const validSigners = this.signers.filter(s => s._valid);

    if (validSigners.length === 0) {
      return {
        status:    'blocked',
        typeLabel: AddressDeriver.typeLabel(requestedType),
        notice:    'Configura al menos una xpub válida para ver las direcciones.'
      };
    }

    const xpubs    = validSigners.map(s => s.xpub.trim());
    const hasLock  = this.timelock.type !== 'none';
    const lib      = this.lib;;

    // ── Sin timelock: derivación directa ─────────────────────────
    if (!hasLock) {
      try {
        const addresses = requestedType === 'taproot'
          ? lib.deriveTaprootMultisigAddresses(xpubs, this.m, count)
          : lib.deriveMultisigAddresses(xpubs, this.m, count);
        return {
          status:    'ok',
          typeLabel: AddressDeriver.typeLabel(requestedType),
          addresses
        };
      } catch (e) {
        return {
          status:    'blocked',
          typeLabel: AddressDeriver.typeLabel(requestedType),
          notice:    `Error al derivar direcciones: ${e.message}`
        };
      }
    }

    // ── Con timelock + SegWit: imposible, bloqueado con explicación ──
    //
    // ¿Por qué no funciona?
    // SegWit v0 (P2WSH) permite scripts complejos, pero la librería
    // que usamos solo sabe derivar P2WSH simple (multisig puro).
    // Un script con timelock dentro de P2WSH requeriría construirlo
    // a mano y eso no está implementado aquí.
    //
    // Taproot (SegWit v1) sí lo soporta porque guarda el timelock
    // como una "hoja" separada del árbol de scripts — la librería
    // tiene métodos específicos para eso (deriveTaprootWithCSV /
    // deriveTaprootWithCLTV).
    if (requestedType === 'segwit') {
      return {
        status:    'blocked',
        typeLabel: AddressDeriver.typeLabel('segwit'),
        notice: [
          '⚠ SegWit v0 (bc1q…) no puede incluir la condición de tiempo que configuraste.',
          '',
          'Piénsalo así: el timelock es una "regla extra" que se guarda dentro del script',
          'de la dirección. SegWit v0 almacena todo el script en un solo bloque y esta',
          'librería no sabe construir ese bloque con la regla de tiempo incluida.',
          '',
          'Taproot (bc1p…) resuelve esto guardando el timelock como una hoja separada',
          'de un árbol de scripts — y sí está implementado. Cambia a Taproot arriba',
          'para ver las direcciones correctas de tu bóveda.'
        ].join('\n')
      };
    }

    // ── Con timelock + Taproot: usar el método correcto según el tipo ──
    try {
      let addresses;
      let typeLabel = 'P2TR · bc1p… (con timelock)';

      if (this.timelock.type === 'absolute') {
        // after(N): fondos bloqueados hasta bloque o fecha específica
        const { value: locktime } = this.timelock.parseAbsoluteValue();
        addresses = lib.deriveTaprootWithCLTV(xpubs, this.m, locktime, count);
        typeLabel = `P2TR · bc1p… (bloqueado hasta bloque/fecha ${locktime})`;

      } else {
        // relative (older) o combo (or_d): ambos usan CSV (CheckSequenceVerify)
        // El combo tiene un spending path principal (multisig) y uno de recuperación
        // (llave de heredero + espera). La librería modela esto con deriveTaprootWithCSV
        // que pone el multisig y el CSV como dos hojas del árbol Taproot.
        const blocks       = this.timelock.type === 'combo'
          ? this.timelock.getComboBlocks()
          : this.timelock.getRelativeBlocks();
        const recoveryXpub = this.timelock.type === 'combo'
          ? this.timelock.comboKey
          : this.timelock.recoveryKey;

        if (!recoveryXpub || recoveryXpub.trim().length < 20) {
          return {
            status:    'warning',
            typeLabel: 'P2TR · bc1p…',
            notice: [
              '⚠ Para derivar las direcciones con timelock relativo necesitas',
              'también la xpub de la llave de recuperación (heredero o respaldo).',
              'Agrégala en la sección de Reglas de gasto.'
            ].join('\n'),
            addresses: []
          };
        }

        addresses = lib.deriveTaprootWithCSV(xpubs, this.m, recoveryXpub, blocks, count);
        typeLabel = `P2TR · bc1p… (recuperación tras ${blocks} bloques ≈ ${AddressDeriver._blocksToHuman(blocks)})`;
      }

      return {
        status: 'ok',
        typeLabel,
        addresses,
        // Aviso informativo: las direcciones son reales pero el timelock
        // estará activo — no solo multisig puro.
        notice: [
          'ℹ Las direcciones incluyen la condición de tiempo que configuraste.',
          'Son distintas a un multisig puro — importa el descriptor en Liana o',
          'Sparrow para que la wallet entienda cuándo puede usar cada spending path.'
        ].join(' ')
      };

    } catch (e) {
      return {
        status:    'blocked',
        typeLabel: AddressDeriver.typeLabel('taproot'),
        notice:    `Error al derivar direcciones con timelock: ${e.message}`
      };
    }
  }

  /**
   * Convierte bloques Bitcoin a texto legible para humanos.
   * (~144 bloques/día)
   * @param {number} blocks
   * @returns {string}
   */
  static _blocksToHuman(blocks) {
    if (blocks >= 4320)  return `~${Math.round(blocks / 4320)} mes(es)`;
    if (blocks >= 1008)  return `~${Math.round(blocks / 1008)} semana(s)`;
    if (blocks >= 144)   return `~${Math.round(blocks / 144)} día(s)`;
    return `${blocks} bloques`;
  }

  /** Etiqueta corta del tipo de dirección para la UI */
  static typeLabel(type) {
    return type === 'taproot' ? 'P2TR · bc1p…' : 'P2WSH · bc1q…';
  }
}


// ─────────────────────────────────────────────────────────────
// 6. VAULT STATE  (Facade — punto de entrada para el frontend)
// ─────────────────────────────────────────────────────────────
class VaultState {
  constructor(bitcoinLib) {
    this.lib = bitcoinLib;
    this._nextId  = 1;
    this.signers  = [];
    this.m        = 1;
    this.timelock = new TimelockConfig('none');
    this.addrType = 'segwit';
    this._lastDescriptor = '';
  }

  // ── Signers ──────────────────────────────────────────────

  /** Agrega un nuevo firmante vacío */
  addSigner() {
    const id    = this._nextId++;
    const alias = `Firmante ${this.signers.length + 1}`;
    this.signers.push(new Signer( id, this.lib, alias));
    this._clampM();
  }

  /** Elimina un firmante por ID */
  removeSigner(id) {
    if (this.signers.length <= 1) return false;
    this.signers = this.signers.filter(s => s.id !== id);
    this._clampM();
    return true;
  }

  /** Actualiza la xpub de un firmante por ID */
  updateXpub(id, val) {
    const signer = this.signers.find(s => s.id === id);
    if (signer) signer.setXpub(val);
  }

  /** Asegura que M nunca supere N */
  _clampM() {
    const n = this.signers.length;
    if (this.m > n) this.m = n;
    if (this.m < 1) this.m = 1;
  }

  // ── Multisig M ───────────────────────────────────────────

  /** Actualiza el umbral de firmas */
  setM(val) {
    this.m = Math.max(1, Math.min(parseInt(val) || 1, this.signers.length));
  }

  /** Texto descriptivo del nivel de seguridad según M y N */
  mMeaning() {
    const slack = this.signers.length - this.m;
    const table = [
      'Necesitas TODAS las llaves',
      'Seguro aunque pierdas 1 llave',
      'Seguro aunque pierdas 2 llaves',
      'Muy tolerante a pérdidas'
    ];
    return table[Math.min(slack, 3)] || '';
  }

  // ── Timelock ──────────────────────────────────────────────

  /** Cambia el tipo de timelock */
  setTimelockType(type) {
    this.timelock.type = type;
  }

  // ── Descriptor ────────────────────────────────────────────

  /** Construye y devuelve el descriptor actual */
  buildDescriptor() {
    const builder = new DescriptorBuilder(this.signers, this.m, this.timelock);
    const result  = builder.build();
    this._lastDescriptor = result.plainFull;
    return {
      ...result,
      highlighted: DescriptorBuilder.highlight(result.plain),
      validity:    builder.validityStatus(),
      hasTL:       this.timelock.type !== 'none'
    };
  }

  // ── Addresses ─────────────────────────────────────────────

  /**
   * Decide qué tipo de dirección usar y devuelve el resultado completo.
   *
   * Si hay timelock activo y el usuario eligió SegWit, forzamos Taproot
   * automáticamente porque SegWit no puede incluir la condición de tiempo.
   * El frontend puede leer `forcedToTaproot` para mostrar una nota explicativa.
   *
   * @param {number} count
   * @returns {{ result: DeriveResult, forcedToTaproot: boolean, effectiveType: string }}
   */
  deriveAddresses(count = 10) {
    const hasLock = this.timelock.type !== 'none';

    // Si hay timelock y el usuario tiene SegWit seleccionado, forzamos Taproot.
    // No cambiamos this.addrType (eso es decisión del usuario en la UI),
    // pero derivamos con taproot y avisamos.
    const forcedToTaproot = hasLock && this.addrType === 'segwit';
    const effectiveType   = forcedToTaproot ? 'taproot' : this.addrType;

    const deriver = new AddressDeriver(this.signers, this.m, this.timelock, this.lib);
    const result  = deriver.derive(effectiveType, count);

    return { result, forcedToTaproot, effectiveType };
  }

  // ── PSBT ──────────────────────────────────────────────────

  /** Parsea un PSBT en Base64 */
  parsePSBT(raw) {
    return PSBTParser.parse(raw, this.m);
  }

  // ── Serialización ─────────────────────────────────────────

  toJSON() {
    return {
      m:        this.m,
      addrType: this.addrType,
      timelock: { ...this.timelock },
      signers:  this.signers.map(s => s.toJSON())
    };
  }
}


// ─────────────────────────────────────────────────────────────
// EXPORTS (para uso como módulo ES o global en browser)
// ─────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Signer, TimelockConfig, DescriptorBuilder, PSBTParser, PSBTResult, AddressDeriver, VaultState };
} else {
  window.VaultBackend = { Signer, TimelockConfig, DescriptorBuilder, PSBTParser, PSBTResult, AddressDeriver, VaultState };
}
