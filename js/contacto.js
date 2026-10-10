/* ============================================================
   contacto.js — formulario de Contacto (servicios.html)
   ------------------------------------------------------------
   Se carga DESPUÉS de store.js. Reutiliza:
     · nuevoIntentoContacto() / enviarMensajeContacto()  (store.js)
     · usuarioActual() / onCambioSesion()                (store.js)
   No toca carrito, pagos, favoritos ni los otros formularios de
   la página (garantía, quejas, cambios...).

   Qué hace:
     1) Validaciones por campo (al salir del campo y mientras se
        corrige), con mensajes claros debajo de cada uno.
     2) Estados: enviando · enviado · error (con reintento).
     3) Anti-duplicados: bloqueo mientras envía, espera entre
        envíos, detección del mismo mensaje y un id por intento
        (ver store.js) para que un reintento nunca repita el mensaje.
     4) Campo trampa (honeypot) contra bots.
   ============================================================ */
(function () {
  'use strict';

  const form = document.getElementById('formContacto');
  if (!form) return;

  const $ = (id) => document.getElementById(id);
  const WHATSAPP = '573239523623';

  const el = {
    card: $('ctCard'),
    campos: $('ctCampos'),
    nombre: $('ctNombre'),
    correo: $('ctCorreo'),
    telefono: $('ctTelefono'),
    asunto: $('ctAsunto'),
    mensaje: $('ctMensaje'),
    acepto: $('ctAceptoChk'),
    trampa: $('ctWeb'),
    contador: $('ctContador'),
    sugerencia: $('ctCorreoSug'),
    aviso: $('ctAviso'),
    avisoTxt: $('ctAvisoTxt'),
    enviar: $('ctEnviar'),
    enviarTxt: $('ctEnviarTxt'),
    exitoTitulo: $('ctExitoTitulo'),
    exitoTxt: $('ctExitoTxt'),
    codigo: $('ctCodigo'),
    exitoWa: $('ctExitoWa'),
    otro: $('ctOtro'),
  };

  /* ------------------------------------------------------------
     AJUSTES (edítalos aquí)
     ------------------------------------------------------------ */
  const MENSAJE_MIN = 10;
  const MENSAJE_MAX = 1000;
  const ESPERA_ENTRE_ENVIOS_MS = 30 * 1000;       // pausa tras un envío exitoso
  const VENTANA_DUPLICADO_MS   = 10 * 60 * 1000;  // mismo mensaje repetido
  const TIMEOUT_ENVIO_MS       = 20 * 1000;       // si tarda más, se muestra error
  const LS_ULTIMO = 'maquina_contacto_ultimo';

  /* ------------------------------------------------------------
     UTILIDADES
     ------------------------------------------------------------ */
  const limpiarEspacios = (t) => String(t || '').replace(/\s+/g, ' ').trim();

  function hashSimple(txt) {
    let h = 5381;
    for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0;
    return String(h);
  }

  function leerUltimo() {
    try { return JSON.parse(localStorage.getItem(LS_ULTIMO)) || null; } catch (e) { return null; }
  }
  function guardarUltimo(hash) {
    try { localStorage.setItem(LS_ULTIMO, JSON.stringify({ t: Date.now(), h: hash })); } catch (e) { /* sin almacenamiento: no pasa nada */ }
  }

  /* ------------------------------------------------------------
     VALIDADORES — devuelven '' si está bien, o el texto del error
     ------------------------------------------------------------ */
  const V = {
    nombre(raw) {
      const v = limpiarEspacios(raw);
      if (!v) return 'Escribe tu nombre completo.';
      if (v.length < 3) return 'El nombre es muy corto.';
      if (v.length > 80) return 'El nombre es muy largo (máximo 80 caracteres).';
      if (!/^[\p{L}][\p{L}\p{M}'’.\- ]*$/u.test(v)) return 'Usa solo letras en tu nombre (sin números ni símbolos).';
      const palabras = v.split(' ').filter((w) => w.replace(/[^\p{L}]/gu, '').length >= 2);
      if (palabras.length < 2) return 'Escribe tu nombre y apellido.';
      if (/(\p{L})\1{3,}/iu.test(v)) return 'Revisa tu nombre, parece tener errores.';
      return '';
    },

    correo(raw) {
      const v = String(raw || '').trim().toLowerCase();
      if (!v) return 'Escribe tu correo electrónico.';
      if (/\s/.test(v)) return 'El correo no puede tener espacios.';
      if (v.length > 120) return 'El correo es demasiado largo.';
      if (!v.includes('@')) return 'Falta el @ en tu correo (ej: nombre@gmail.com).';
      const partes = v.split('@');
      if (partes.length !== 2 || !partes[0] || !partes[1]) return 'Revisa tu correo, parece incompleto.';
      const [local, dominio] = partes;
      if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
        return 'El correo tiene caracteres que no son válidos.';
      }
      if (!dominio.includes('.')) return 'Al correo le falta el final (ej: .com).';
      const etiquetas = dominio.split('.');
      const okEtiquetas = etiquetas.every((e) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(e));
      if (!okEtiquetas) return 'El dominio del correo no es válido.';
      if (!/^[a-z]{2,}$/.test(etiquetas[etiquetas.length - 1])) return 'El final del correo no es válido (ej: .com, .co).';
      return '';
    },

    /* Acepta celular colombiano (10 dígitos que empiezan por 3) o fijo
       con indicativo (60 + 8 dígitos). Admite +57 / 57 al inicio. */
    telefono(raw) {
      const t = String(raw || '').trim();
      if (!t) return 'Escribe tu número de teléfono.';
      const d = soloDigitosColombia(t);
      if (/[^\d\s().+\-]/.test(t)) return 'El teléfono solo puede tener números.';
      if (!/^\d+$/.test(d)) return 'Escribe solo números.';
      if (/^(\d)\1+$/.test(d)) return 'Ese número no parece real, revísalo.';
      if (d.length < 10) return 'Faltan dígitos: el celular tiene 10 (ej: 300 123 4567).';
      if (d.length > 10) return 'Sobran dígitos: el celular tiene 10 (ej: 300 123 4567).';
      if (!/^3\d{9}$/.test(d) && !/^60\d{8}$/.test(d)) return 'Debe ser un celular colombiano: empieza por 3 (ej: 300 123 4567).';
      if ('01234567890123456789'.includes(d.slice(1))) return 'Ese número no parece real, revísalo.';
      return '';
    },

    asunto(raw) {
      return String(raw || '').trim() ? '' : 'Selecciona un asunto.';
    },

    mensaje(raw) {
      const v = String(raw || '').trim();
      if (!v) return 'Escribe tu mensaje.';
      if (v.length < MENSAJE_MIN) return 'Cuéntanos un poco más (mínimo ' + MENSAJE_MIN + ' caracteres).';
      if (v.length > MENSAJE_MAX) return 'El mensaje es muy largo (máximo ' + MENSAJE_MAX + ' caracteres).';
      const palabras = v.split(/\s+/).filter((w) => /\p{L}/u.test(w));
      if (palabras.length < 2) return 'Escribe al menos un par de palabras para entenderte mejor.';
      if (/(.)\1{9,}/u.test(v)) return 'Tu mensaje tiene caracteres repetidos, revísalo.';
      if ((v.match(/https?:\/\/|www\./gi) || []).length > 2) return 'Evita incluir tantos enlaces en el mensaje.';
      return '';
    },

    acepto(checked) {
      return checked ? '' : 'Debes autorizar el uso de tus datos para poder responderte.';
    },
  };

  /** Deja solo los dígitos y quita el 57 del país si viene al inicio. */
  function soloDigitosColombia(texto) {
    let d = String(texto || '').replace(/\D/g, '');
    if (d.startsWith('0057')) d = d.slice(4);
    else if (d.length > 10 && d.startsWith('57')) d = d.slice(2);
    return d;
  }

  /** "3001234567" → "300 123 4567" (si sobran dígitos, quedan al final para que se vea el error) */
  function formatearDigitos(d) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + ' ' + d.slice(3);
    return d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6);
  }
  function formatearTelefono(texto) {
    return formatearDigitos(soloDigitosColombia(texto).slice(0, 13));
  }

  /* ------------------------------------------------------------
     MARCAR CAMPOS (error / ok / neutro)
     ------------------------------------------------------------ */
  const REGLAS = [
    { id: 'nombre',   input: el.nombre,   leer: () => el.nombre.value,    validar: V.nombre },
    { id: 'correo',   input: el.correo,   leer: () => el.correo.value,    validar: V.correo },
    { id: 'telefono', input: el.telefono, leer: () => el.telefono.value,  validar: V.telefono },
    { id: 'asunto',   input: el.asunto,   leer: () => el.asunto.value,    validar: V.asunto },
    { id: 'mensaje',  input: el.mensaje,  leer: () => el.mensaje.value,   validar: V.mensaje },
    { id: 'acepto',   input: el.acepto,   leer: () => el.acepto.checked,  validar: V.acepto },
  ];

  function contenedorDe(regla) {
    return regla.input.closest('.ct-field');
  }

  function marcar(regla, mensaje, mostrarOk) {
    const cont = contenedorDe(regla);
    const caja = cont.querySelector('.ct-error');
    if (mensaje) {
      cont.dataset.estado = 'error';
      caja.textContent = mensaje;
      regla.input.setAttribute('aria-invalid', 'true');
    } else {
      cont.dataset.estado = mostrarOk ? 'ok' : '';
      caja.textContent = '';
      regla.input.removeAttribute('aria-invalid');
    }
  }

  function validarCampo(regla, mostrarOk = true) {
    const msg = regla.validar(regla.leer());
    marcar(regla, msg, mostrarOk && regla.id !== 'acepto');
    return !msg;
  }

  const tocados = new Set();
  REGLAS.forEach((regla) => {
    const evento = (regla.id === 'asunto' || regla.id === 'acepto') ? 'change' : 'input';

    // Al salir del campo: valida (y a partir de ahí valida mientras escribe)
    regla.input.addEventListener('blur', () => {
      if (regla.id === 'acepto') return;
      // No molestar si salió de un campo que nunca tocó
      if (regla.id !== 'asunto' && !String(regla.leer()).length && !tocados.has(regla.id)) return;
      tocados.add(regla.id);
      validarCampo(regla);
    });
    regla.input.addEventListener(evento, () => {
      tocados.add(regla.id);
      const cont = contenedorDe(regla);
      // Mientras corrige un error, se revalida en vivo; si ya estaba bien, también.
      if (cont.dataset.estado === 'error' || cont.dataset.estado === 'ok' || evento === 'change') {
        validarCampo(regla);
      }
      ocultarAvisoSiHaceFalta();
    });
  });

  /* ------------------------------------------------------------
     Detalles de cada campo
     ------------------------------------------------------------ */

  // Nombre: pone mayúscula inicial en cada palabra al salir del campo
  el.nombre.addEventListener('blur', () => {
    const v = limpiarEspacios(el.nombre.value);
    if (!v) { el.nombre.value = ''; return; }
    el.nombre.value = v.split(' ').map((p) => p.charAt(0).toLocaleUpperCase('es') + p.slice(1)).join(' ');
    validarCampo(REGLAS[0]);
  });

  // Teléfono: formatea "300 123 4567" mientras escribe.
  //  · Si empieza por + o 00 (código de país) se deja como lo escribe y se
  //    normaliza al salir del campo (así no se corrompe mientras teclea el 57).
  //  · Si pega un número con 57 al inicio, se quita el 57 al pegar.
  //  · Nunca se recorta en silencio: si sobran dígitos, se ven y se avisa.
  el.telefono.addEventListener('input', (ev) => {
    const v = el.telefono.value;
    const pegado = ev && ev.inputType === 'insertFromPaste';
    if (!pegado && /^\s*(\+|00)/.test(v)) return;
    const alFinal = el.telefono.selectionStart === v.length;
    if (!pegado && !alFinal) return;
    const digitos = pegado ? soloDigitosColombia(v) : v.replace(/\D/g, '');
    const bonito = formatearDigitos(digitos.slice(0, 13));
    if (bonito !== v) el.telefono.value = bonito;
  });
  el.telefono.addEventListener('blur', () => {
    if (el.telefono.value.trim()) el.telefono.value = formatearTelefono(el.telefono.value);
  });

  // Correo: sugerencia si parece un error de tipeo (gmial.com → gmail.com)
  const DOMINIOS_TIPICOS = {
    'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com',
    'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com',
    'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmai.com': 'hotmail.com',
    'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com',
    'yahoo.con': 'yahoo.com', 'icloud.con': 'icloud.com', 'iclod.com': 'icloud.com',
  };
  function revisarSugerenciaCorreo() {
    const v = el.correo.value.trim().toLowerCase();
    const sug = el.sugerencia;
    if (!v || V.correo(v) || !DOMINIOS_TIPICOS[v.split('@')[1]]) {
      sug.classList.remove('visible'); sug.textContent = ''; sug.dataset.propuesta = '';
      return;
    }
    const [local, dominio] = v.split('@');
    const propuesta = local + '@' + DOMINIOS_TIPICOS[dominio];
    if (sug.dataset.propuesta === propuesta && sug.classList.contains('visible')) return;  // ya está mostrada
    sug.textContent = '';
    sug.dataset.propuesta = propuesta;
    sug.append('¿Quisiste decir ');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = propuesta;
    b.addEventListener('click', () => {
      el.correo.value = propuesta;
      sug.classList.remove('visible');
      validarCampo(REGLAS[1]);
      el.correo.focus();
    });
    sug.append(b, '?');
    sug.classList.add('visible');
  }
  el.correo.addEventListener('blur', () => {
    el.correo.value = el.correo.value.trim();
    revisarSugerenciaCorreo();
  });
  el.correo.addEventListener('input', () => el.sugerencia.classList.remove('visible'));

  // Mensaje: contador de caracteres
  function actualizarContador() {
    const n = el.mensaje.value.length;
    el.contador.textContent = n + '/' + MENSAJE_MAX;
    el.contador.classList.toggle('cerca', n >= MENSAJE_MAX * 0.9 && n < MENSAJE_MAX);
    el.contador.classList.toggle('limite', n >= MENSAJE_MAX);
  }
  el.mensaje.addEventListener('input', actualizarContador);
  actualizarContador();

  /* ------------------------------------------------------------
     Avisos (banner) y estados del botón
     ------------------------------------------------------------ */
  function mostrarAviso(tipo, html) {
    el.aviso.classList.remove('error', 'info', 'sacude');
    el.aviso.classList.add(tipo, 'visible');
    el.aviso.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    el.avisoTxt.textContent = '';
    if (typeof html === 'string') el.avisoTxt.textContent = html;
    else el.avisoTxt.append(...html);
    void el.aviso.offsetWidth;            // reinicia la animación
    if (tipo === 'error') el.aviso.classList.add('sacude');
  }
  function ocultarAviso() {
    el.aviso.classList.remove('visible', 'sacude');
    el.avisoTxt.textContent = '';
  }
  function ocultarAvisoSiHaceFalta() {
    if (el.aviso.classList.contains('visible') && !estado.enviando) ocultarAviso();
  }

  function enlaceWhatsApp(texto) {
    const a = document.createElement('a');
    a.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent('Hola, intenté escribirles desde la página y no pude enviar el mensaje.');
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = texto;
    return a;
  }

  const estado = { enviando: false, intento: null, intentoHash: null, avisoSalir: null };

  function ponerEnviando(si) {
    estado.enviando = si;
    el.campos.disabled = si;
    el.enviar.disabled = si;
    el.enviar.classList.toggle('enviando', si);
    el.enviar.setAttribute('aria-busy', si ? 'true' : 'false');
    if (si) {
      el.enviarTxt.textContent = 'Enviando…';
      estado.avisoSalir = (e) => { e.preventDefault(); e.returnValue = ''; };
      window.addEventListener('beforeunload', estado.avisoSalir);
    } else {
      if (estado.avisoSalir) window.removeEventListener('beforeunload', estado.avisoSalir);
      estado.avisoSalir = null;
    }
  }

  /* ------------------------------------------------------------
     ENVÍO
     ------------------------------------------------------------ */
  function leerDatos() {
    return {
      nombre: limpiarEspacios(el.nombre.value),
      correo: el.correo.value.trim().toLowerCase(),
      telefono: soloDigitosColombia(el.telefono.value),
      asunto: el.asunto.value.trim(),
      mensaje: el.mensaje.value.trim(),
    };
  }

  function conTimeout(promesa, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(Object.assign(new Error('timeout'), { esTimeout: true })), ms);
      promesa.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  function validarTodo() {
    let primerError = null;
    let errores = 0;
    REGLAS.forEach((regla) => {
      tocados.add(regla.id);
      if (!validarCampo(regla)) {
        errores++;
        if (!primerError) primerError = regla;
      }
    });
    return { errores, primerError };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1) Bloqueo contra clics / Enter repetidos
    if (estado.enviando) return;

    // 2) Campo trampa: si un bot lo llenó, se finge éxito y no se envía nada
    if (el.trampa.value) { mostrarExito({ nombre: el.nombre.value, asunto: el.asunto.value }, 'ABC123'); return; }

    // 3) Validaciones
    const { errores, primerError } = validarTodo();
    if (errores) {
      mostrarAviso('error', errores === 1 ? 'Revisa el campo marcado en rojo.' : 'Revisa los ' + errores + ' campos marcados en rojo.');
      primerError.input.focus({ preventScroll: true });
      primerError.input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const datos = leerDatos();
    const hash = hashSimple([datos.correo, datos.asunto, datos.mensaje].join('|'));

    // 4) Espera entre envíos y mensaje repetido
    const ultimo = leerUltimo();
    if (ultimo) {
      const pasado = Date.now() - ultimo.t;
      if (pasado < ESPERA_ENTRE_ENVIOS_MS) {
        const seg = Math.ceil((ESPERA_ENTRE_ENVIOS_MS - pasado) / 1000);
        mostrarAviso('info', 'Acabas de enviar un mensaje. Espera ' + seg + ' segundos para enviar otro.');
        return;
      }
      if (ultimo.h === hash && pasado < VENTANA_DUPLICADO_MS) {
        mostrarAviso('info', 'Ya recibimos este mismo mensaje hace un momento. Si quieres añadir algo, escribe un mensaje nuevo.');
        return;
      }
    }

    // 5) Sin internet no tiene sentido intentar (Firestore se quedaría esperando)
    if (navigator.onLine === false) { mostrarError('red'); el.enviarTxt.textContent = 'Reintentar envío'; return; }

    // 6) Enviar
    ocultarAviso();
    ponerEnviando(true);
    try {
      if (typeof enviarMensajeContacto !== 'function' || typeof fbDb === 'undefined') {
        throw new Error('El sistema de envío no está disponible.');
      }
      // Un id por intento; si reintenta con los mismos datos se reutiliza (no se duplica)
      if (!estado.intento || estado.intentoHash !== hash) {
        estado.intento = nuevoIntentoContacto();
        estado.intentoHash = hash;
      }
      const res = await conTimeout(enviarMensajeContacto(datos, estado.intento), TIMEOUT_ENVIO_MS);
      if (!res || !res.ok) {
        mostrarError(res && res.motivo === 'red' ? 'red' : 'servidor');
      } else {
        guardarUltimo(hash);
        estado.intento = null;
        estado.intentoHash = null;
        mostrarExito(datos, res.codigo);
      }
    } catch (err) {
      console.error('Error enviando el formulario de contacto:', err);
      mostrarError(err && err.esTimeout ? 'timeout' : 'servidor');
    } finally {
      ponerEnviando(false);
      if (!el.card.classList.contains('enviado')) el.enviarTxt.textContent = estado.huboError ? 'Reintentar envío' : 'Enviar mensaje';
    }
  });

  function mostrarError(motivo) {
    estado.huboError = true;
    if (motivo === 'red') {
      mostrarAviso('error', ['No tienes conexión a internet. Revísala y vuelve a intentarlo: tus datos siguen aquí.']);
    } else if (motivo === 'timeout') {
      mostrarAviso('error', ['El envío está tardando más de lo normal. Revisa tu conexión y pulsa “Reintentar envío”; no se duplicará tu mensaje.']);
    } else {
      mostrarAviso('error', [
        'No pudimos enviar tu mensaje. Inténtalo de nuevo en un momento o escríbenos por ',
        enlaceWhatsApp('WhatsApp'),
        '.',
      ]);
    }
  }

  function mostrarExito(datos, codigo) {
    estado.huboError = false;
    const primerNombre = (datos.nombre || '').split(' ')[0] || '';
    el.exitoTxt.textContent = '';
    const b = document.createElement('b');
    b.textContent = datos.asunto || 'tu consulta';
    el.exitoTxt.append(
      'Gracias, ' + primerNombre + '. Recibimos tu mensaje sobre ',
      b,
      '. Te responderemos lo antes posible al correo o teléfono que nos dejaste.'
    );
    el.codigo.textContent = codigo;
    el.exitoWa.href = 'https://wa.me/' + WHATSAPP + '?text=' +
      encodeURIComponent('Hola, acabo de enviar un mensaje desde la página (código ' + codigo + ').');
    el.card.classList.add('enviado');
    ocultarAviso();
    // Lleva el foco al título para lectores de pantalla y sube la tarjeta a la vista
    setTimeout(() => {
      el.exitoTitulo.focus({ preventScroll: true });
      const r = el.card.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.4) {
        el.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  }

  /* "Enviar otro mensaje": limpia todo y vuelve al formulario */
  el.otro.addEventListener('click', () => {
    form.reset();
    REGLAS.forEach((r) => marcar(r, '', false));
    tocados.clear();
    el.sugerencia.classList.remove('visible');
    actualizarContador();
    el.enviarTxt.textContent = 'Enviar mensaje';
    el.card.classList.remove('enviado');
    prellenarSiHaySesion();
    el.nombre.focus();
  });

  /* ------------------------------------------------------------
     Si la persona ya inició sesión, se adelantan nombre y correo
     (solo en campos vacíos; puede cambiarlos)
     ------------------------------------------------------------ */
  function prellenarSiHaySesion() {
    try {
      const u = typeof usuarioActual === 'function' ? usuarioActual() : null;
      if (!u) return;
      if (!el.correo.value && u.correo) el.correo.value = u.correo;
      if (!el.nombre.value && u.nombre && !String(u.nombre).includes('@')) el.nombre.value = u.nombre;
    } catch (e) { /* sin sesión: se deja vacío */ }
  }
  prellenarSiHaySesion();
  if (typeof onCambioSesion === 'function') onCambioSesion(prellenarSiHaySesion);
})();
