/* ============================================================
   admin-mensajes.js — pestaña "Mensajes" del panel (admin.html)
   ------------------------------------------------------------
   Muestra y gestiona los mensajes que los clientes mandan desde el
   formulario de Contacto (servicios.html). NO crea otro sistema:
     · Los datos son los documentos de la colección "mensajes_contacto"
       de Firestore que ya crea enviarMensajeContacto() (store.js).
     · Leer / actualizar pasa por obtenerMensajesContactoAdmin() y
       actualizarGestionMensajeContacto() (store.js).
     · La seguridad real está en firestore.rules: solo un administrador
       puede leer o gestionar estos mensajes. El permiso "mensajes"
       del panel solo decide si se ve la pestaña.
   Se carga DESPUÉS de admin.js y admin-ui.js. Usa de admin.js:
   showToast, _escAdm, pintarPaginacion y permisosActuales.
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const tbody = $('tablaMensajesBody');
  if (!tbody) return; // admin.html sin la pestaña: no hace nada

  const POR_PAGINA = 15;
  const WHATSAPP_PREFIJO = '57'; // Colombia

  let cache = [];            // todos los mensajes cargados
  let filtrados = [];        // resultado de los filtros (sin paginar)
  let pagina = 1;
  let ordenDir = -1;         // -1 = más recientes primero
  let abiertoId = null;      // mensaje abierto en el modal
  let cargado = false;

  /* ---------------- utilidades ---------------- */
  const esc = (v) => (typeof _escAdm === 'function' ? _escAdm(v)
    : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  const toast = (t, err) => { if (typeof showToast === 'function') showToast(t, !!err); };

  const sinTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function fechaDe(m) {
    const n = Number(m && m.fecha);
    return Number.isFinite(n) && n > 0 ? new Date(n) : null;
  }
  function fechaCorta(m) {
    const d = fechaDe(m);
    return d ? d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  }
  function fechaLarga(m) {
    const d = fechaDe(m);
    return d ? d.toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'short' }) : '—';
  }
  /** YYYY-MM-DD en hora LOCAL (para comparar con los <input type="date">). */
  function diaLocal(m) {
    const d = fechaDe(m);
    if (!d) return '';
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  const codigoDe = (m) => String(m.id || '').slice(-6).toUpperCase();
  const noLeido = (m) => !m.leido;
  const estadoDe = (m) => (typeof estadoContacto === 'function' ? estadoContacto(m) : (m.estado || 'nuevo'));
  const infoEstado = (e) => (typeof ESTADOS_CONTACTO !== 'undefined' && ESTADOS_CONTACTO[e]) || { label: e, emoji: '•' };

  /** "3001234567" -> "300 123 4567" */
  function telBonito(t) {
    const d = String(t || '').replace(/\D/g, '');
    return /^\d{10}$/.test(d) ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : String(t || '');
  }
  /** Devuelve el número listo para wa.me (con 57) solo si es un celular
      colombiano válido; si no, null (no se muestra el botón). */
  function telefonoWhatsApp(t) {
    let d = String(t || '').replace(/\D/g, '');
    if (d.startsWith('0057')) d = d.slice(4);
    if (/^3\d{9}$/.test(d)) return WHATSAPP_PREFIJO + d;
    if (/^573\d{9}$/.test(d)) return d;
    return null;
  }
  const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || '';

  function linkCorreo(m) {
    const asunto = 'Re: ' + (m.asunto || 'Tu mensaje') + ' — MAQUINA (ref. ' + codigoDe(m) + ')';
    const cita = String(m.mensaje || '').slice(0, 400);
    const cuerpo = 'Hola ' + primerNombre(m.nombre) + ',\n\nGracias por escribirnos a MAQUINA.\n\n\n\nEquipo MAQUINA ⚡\n\n— — —\nTu mensaje (' + (m.asunto || '') + '):\n' + cita;
    return 'mailto:' + encodeURIComponent(m.correo || '').replace(/%40/g, '@') +
      '?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo);
  }
  function linkWhatsApp(m) {
    const num = telefonoWhatsApp(m.telefono);
    if (!num) return null;
    const texto = 'Hola ' + primerNombre(m.nombre) + ', te escribimos de MAQUINA por tu mensaje sobre "' + (m.asunto || '') + '" (ref. ' + codigoDe(m) + '). ';
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(texto);
  }

  async function copiar(texto, etiqueta) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto);
      } else {
        const ta = document.createElement('textarea');
        ta.value = texto; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        if (!ok) throw new Error('copy');
      }
      toast((etiqueta || 'Texto') + ' copiado ✓');
    } catch (e) {
      toast('No se pudo copiar. Selecciónalo y cópialo a mano.', true);
    }
  }

  /* ---------------- carga de datos ---------------- */
  function actualizarBadge() {
    const el = $('mensajesBadge');
    if (!el) return;
    const n = cache.filter(noLeido).length;
    el.textContent = n ? String(n) : '';
    el.title = n ? n + ' sin leer' : '';
  }

  async function cargar() {
    const res = await obtenerMensajesContactoAdmin();
    if (!res.ok) return res;
    cache = res.mensajes;
    cargado = true;
    actualizarBadge();
    return res;
  }

  /** Lo llama admin.js al entrar al panel: solo pone el contador. */
  window.cargarBadgeMensajes = async function () { await cargar(); };

  /** Lo llama admin.js al abrir la pestaña. */
  window.pintarMensajes = async function () {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--gray);">Cargando mensajes…</td></tr>';
    const res = await cargar();
    if (!res.ok) {
      $('mensajesStats').innerHTML = '';
      $('paginacionMensajes').innerHTML = '';
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--adm-red,#ff5c6c);">' + esc(res.msg) + '</td></tr>';
      return;
    }
    pagina = 1;
    aplicarFiltros();
  };

  /* ---------------- listado, buscador y filtros ---------------- */
  function pintarStats() {
    const total = cache.length;
    const sinLeer = cache.filter(noLeido).length;
    const enRev = cache.filter(m => estadoDe(m) === 'en_revision').length;
    const resp = cache.filter(m => estadoDe(m) === 'respondido').length;
    $('mensajesStats').innerHTML =
      '<div class="admin-stat admin-stat-forest"><b>' + total + '</b><span>Mensajes</span></div>' +
      '<div class="admin-stat admin-stat-acento"><b>' + sinLeer + '</b><span>Sin leer</span></div>' +
      '<div class="admin-stat admin-stat-butter"><b>' + enRev + '</b><span>En revisión</span></div>' +
      '<div class="admin-stat admin-stat-sage"><b>' + resp + '</b><span>Respondidos</span></div>';
  }

  function aplicarFiltros() {
    pintarStats();
    const texto = sinTildes($('buscarMensajeAdmin').value.trim());
    const est = $('filtroEstadoMensaje').value;
    const desde = $('filtroMensajeDesde').value;
    const hasta = $('filtroMensajeHasta').value;

    filtrados = cache.filter(m => {
      if (texto) {
        const bolsa = sinTildes([m.nombre, m.correo, m.telefono, m.asunto, m.mensaje, codigoDe(m)].join(' '));
        if (!bolsa.includes(texto)) return false;
      }
      if (est === 'sin_leer') { if (!noLeido(m)) return false; }
      else if (est && estadoDe(m) !== est) return false;
      const dia = diaLocal(m);
      if (desde && (!dia || dia < desde)) return false;
      if (hasta && (!dia || dia > hasta)) return false;
      return true;
    });
    filtrados.sort((a, b) => ((Number(a.fecha) || 0) - (Number(b.fecha) || 0)) * ordenDir);

    const pag = $('paginacionMensajes');
    if (!cache.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--gray);">Todavía no hay mensajes de clientes.</td></tr>';
      pag.innerHTML = '';
      return;
    }
    if (!filtrados.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--gray);">Ningún mensaje coincide con el filtro.</td></tr>';
      pag.innerHTML = '';
      return;
    }

    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
    if (pagina > totalPaginas) pagina = totalPaginas;
    const ini = (pagina - 1) * POR_PAGINA;

    tbody.innerHTML = filtrados.slice(ini, ini + POR_PAGINA).map(filaHtml).join('');

    if (typeof pintarPaginacion === 'function') {
      pintarPaginacion(pag, pagina, totalPaginas, filtrados.length, (n) => { pagina = n; aplicarFiltros(); });
    }
  }

  function opcionesEstado(actual) {
    return Object.keys(ESTADOS_CONTACTO).map(k =>
      '<option value="' + k + '"' + (k === actual ? ' selected' : '') + '>' + ESTADOS_CONTACTO[k].emoji + ' ' + ESTADOS_CONTACTO[k].label + '</option>').join('');
  }

  function filaHtml(m) {
    const e = estadoDe(m);
    const sinLeer = noLeido(m);
    const preview = String(m.mensaje || '').replace(/\s+/g, ' ').slice(0, 110) + (String(m.mensaje || '').length > 110 ? '…' : '');
    return '<tr class="msg-fila' + (sinLeer ? ' msg-sin-leer' : '') + '" data-id="' + esc(m.id) + '">' +
      '<td data-label="Estado">' +
        (sinLeer ? '<span class="msg-punto" title="Sin leer"></span>' : '') +
        '<select class="admin-input select-estado-mensaje estado-select-msg-' + e + '" data-id="' + esc(m.id) + '" aria-label="Estado del mensaje">' + opcionesEstado(e) + '</select>' +
      '</td>' +
      '<td data-label="Recibido" class="mono" style="white-space:nowrap;">' + esc(fechaCorta(m)) + '</td>' +
      '<td data-label="Cliente"><b>' + esc(m.nombre || '—') + '</b><br><span class="msg-sub">' + esc(m.correo || '') + '</span><br><span class="msg-sub">' + esc(telBonito(m.telefono)) + '</span></td>' +
      '<td data-label="Asunto">' + esc(m.asunto || '—') + '</td>' +
      '<td data-label="Mensaje"><span class="msg-preview">' + esc(preview) + '</span></td>' +
      '<td data-label=""><button type="button" class="admin-btn admin-btn-ghost btn-abrir-mensaje" data-id="' + esc(m.id) + '">Abrir</button></td>' +
    '</tr>';
  }

  ['buscarMensajeAdmin', 'filtroEstadoMensaje', 'filtroMensajeDesde', 'filtroMensajeHasta'].forEach(id => {
    $(id).addEventListener('input', () => { pagina = 1; aplicarFiltros(); });
  });
  $('btnLimpiarFiltrosMensajes').addEventListener('click', () => {
    $('buscarMensajeAdmin').value = '';
    $('filtroEstadoMensaje').value = '';
    $('filtroMensajeDesde').value = '';
    $('filtroMensajeHasta').value = '';
    pagina = 1;
    aplicarFiltros();
  });
  $('btnRecargarMensajes').addEventListener('click', async () => {
    await window.pintarMensajes();
    if (abiertoId) pintarModal();
  });
  /* Reenvía a la hoja "Contactos" todo lo cargado; el script omite lo que ya está. */
  const btnHoja = $('btnSincronizarHoja');
  if (btnHoja) btnHoja.addEventListener('click', () => {
    if (!cache.length) { toast('No hay mensajes para sincronizar.', true); return; }
    if (typeof sincronizarContactosConHoja !== 'function') { toast('La sincronización no está disponible.', true); return; }
    btnHoja.disabled = true;
    const r = sincronizarContactosConHoja(cache);
    toast('Enviados ' + r.enviados + ' mensajes a la hoja. Los que ya estaban se omiten; revisa la pestaña Contactos en unos segundos.');
    setTimeout(() => { btnHoja.disabled = false; }, 8000);
  });
  const thFecha = document.querySelector('#tablaMensajes th[data-campo="fecha"]');
  if (thFecha) thFecha.addEventListener('click', () => { ordenDir = -ordenDir; pagina = 1; aplicarFiltros(); });

  /* ---------------- guardar gestión (estado / leído) ---------------- */
  async function guardar(id, cambios) {
    const m = cache.find(x => x.id === id);
    if (!m) return false;
    const res = await actualizarGestionMensajeContacto(id, cambios);
    if (!res.ok) { toast(res.msg, true); return false; }
    // Se refleja en pantalla lo mismo que quedó guardado en Firestore
    ['estado', 'leido', 'estado_fecha', 'estado_por'].forEach(k => { if (res.datos[k] !== undefined) m[k] = res.datos[k]; });
    m.historial_estados = [...(m.historial_estados || []), res.entrada];
    actualizarBadge();
    return true;
  }

  /** Cambia el estado. Si pasa a "En revisión" o "Respondido" también
      queda como leído (alguien ya lo vio). */
  async function cambiarEstado(id, estado) {
    const cambios = { estado };
    if (estado !== 'nuevo') cambios.leido = true;
    return guardar(id, cambios);
  }

  tbody.addEventListener('change', async (e) => {
    const sel = e.target.closest('.select-estado-mensaje');
    if (!sel) return;
    const id = sel.dataset.id;
    const m = cache.find(x => x.id === id);
    const anterior = m ? estadoDe(m) : 'nuevo';
    sel.disabled = true;
    const ok = await cambiarEstado(id, sel.value);
    sel.disabled = false;
    if (!ok) { sel.value = anterior; return; }
    toast('Estado: ' + infoEstado(sel.value).label + ' ✓');
    aplicarFiltros();
    if (abiertoId === id) pintarModal();
  });

  tbody.addEventListener('click', (e) => {
    if (e.target.closest('select, a')) return;
    const fila = e.target.closest('tr.msg-fila');
    if (fila) abrir(fila.dataset.id);
  });

  /* ---------------- modal de detalle ---------------- */
  const modal = $('modalMensajeContacto');
  const cuerpo = $('msgModalCuerpo');

  async function abrir(id) {
    const m = cache.find(x => x.id === id);
    if (!m) return;
    abiertoId = id;
    modal.classList.add('open');
    pintarModal();
    if (noLeido(m)) {            // abrirlo = leerlo
      const ok = await guardar(id, { leido: true });
      if (ok) { aplicarFiltros(); if (abiertoId === id) pintarModal(); }
    }
  }
  function cerrar() {
    modal.classList.remove('open');
    abiertoId = null;
  }

  function pintarModal() {
    const m = cache.find(x => x.id === abiertoId);
    if (!m) { cerrar(); return; }
    const e = estadoDe(m);
    const wa = linkWhatsApp(m);
    const idx = filtrados.findIndex(x => x.id === m.id);
    $('btnMsgAnterior').disabled = idx <= 0;
    $('btnMsgSiguiente').disabled = idx < 0 || idx >= filtrados.length - 1;
    $('msgModalTitulo').textContent = 'Mensaje #' + codigoDe(m);

    const historial = [...(m.historial_estados || [])].reverse().map(h => {
      const partes = [];
      if (h.estado) partes.push(infoEstado(h.estado).emoji + ' ' + infoEstado(h.estado).label);
      if (h.leido === true) partes.push('Leído');
      if (h.leido === false) partes.push('Marcado sin leer');
      const quien = h.correo || h.usuario || 'desconocido';
      const f = h.fecha ? new Date(h.fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
      return '<div class="historial-fila"><span>' + esc(partes.join(' · ')) + '</span><span class="historial-usuario">' + esc(quien) + '</span><span class="historial-fecha mono">' + esc(f) + '</span></div>';
    }).join('');

    cuerpo.innerHTML =
      '<div class="msg-det-cab">' +
        '<span class="msg-pill msg-pill-' + e + '">' + infoEstado(e).emoji + ' ' + esc(infoEstado(e).label) + '</span>' +
        (noLeido(m) ? '<span class="msg-pill msg-pill-sinleer">● Sin leer</span>' : '<span class="msg-pill msg-pill-leido">Leído</span>') +
      '</div>' +
      '<dl class="msg-det-grid">' +
        '<div><dt>Nombre</dt><dd>' + esc(m.nombre || '—') + '</dd></div>' +
        '<div><dt>Correo</dt><dd>' + esc(m.correo || '—') + '</dd></div>' +
        '<div><dt>Teléfono</dt><dd>' + esc(telBonito(m.telefono) || '—') + '</dd></div>' +
        '<div><dt>Asunto</dt><dd>' + esc(m.asunto || '—') + '</dd></div>' +
        '<div class="msg-det-ancho"><dt>Recibido</dt><dd>' + esc(fechaLarga(m)) + '</dd></div>' +
      '</dl>' +
      '<div class="msg-det-texto-etq">Mensaje</div>' +
      '<div class="msg-det-texto">' + esc(m.mensaje || '') + '</div>' +
      (m.con_foto ? '<div class="msg-det-texto-etq">Foto adjunta</div><div class="msg-det-foto" data-foto-id="' + esc(m.id) + '" style="margin-bottom:12px;">Cargando foto…</div>' : '') +

      '<div class="msg-det-acciones">' +
        '<button type="button" class="admin-btn admin-btn-ghost" data-accion="copiar-correo">📋 Copiar correo</button>' +
        (m.telefono ? '<button type="button" class="admin-btn admin-btn-ghost" data-accion="copiar-tel">📋 Copiar teléfono</button>' : '') +
        '<a class="admin-btn admin-btn-primary" href="' + esc(linkCorreo(m)) + '" data-accion="responder-correo">✉️ Responder por correo</a>' +
        (wa ? '<a class="admin-btn admin-btn-primary" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer" data-accion="responder-wa">💬 Responder por WhatsApp</a>' : '') +
      '</div>' +
      (wa ? '' : '<p class="admin-foto-hint">Sin botón de WhatsApp: el teléfono no es un celular colombiano válido.</p>') +

      '<div class="msg-det-gestion">' +
        '<label class="admin-drop-label">Estado' +
          '<select id="msgModalEstado" class="admin-input estado-select-msg-' + e + '">' + opcionesEstado(e) + '</select>' +
        '</label>' +
        '<button type="button" class="admin-btn msg-btn-ok" data-accion="respondido"' + (e === 'respondido' ? ' disabled' : '') + '>✅ Marcar como respondido</button>' +
        '<button type="button" class="admin-btn admin-btn-ghost" data-accion="alternar-leido">' + (noLeido(m) ? 'Marcar como leído' : 'Marcar como no leído') + '</button>' +
      '</div>' +

      '<div class="msg-det-texto-etq" style="margin-top:16px;">Historial de gestión</div>' +
      '<div class="msg-det-historial">' + (historial || '<p class="admin-foto-hint">Todavía no hay cambios registrados.</p>') + '</div>' +
      '<p class="admin-foto-hint" style="margin-top:10px;">Ref. <span class="mono">' + esc(codigoDe(m)) + '</span> — el mismo código que ve el cliente al enviar el formulario y que llega en el aviso por correo.</p>';
    cargarFotoMensaje(m);
  }

  /* Foto opcional del cliente: vive en "mensajes_contacto_fotos/{id}" (solo admin). */
  async function cargarFotoMensaje(m) {
    const caja = cuerpo.querySelector('.msg-det-foto');
    if (!caja || !m.con_foto) return;
    try {
      const d = await fbDb.collection('mensajes_contacto_fotos').doc(m.id).get();
      const src = d.exists ? String((d.data() || {}).foto || '') : '';
      if (!/^data:image\/jpeg;base64,/.test(src)) { caja.textContent = 'No se encontró la foto.'; return; }
      caja.textContent = '';
      const a = document.createElement('a');
      a.href = src; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'Abrir foto completa';
      const img = document.createElement('img');
      img.src = src; img.alt = 'Foto adjunta por el cliente';
      img.style.cssText = 'max-width:100%;max-height:320px;border-radius:10px;border:1px solid var(--line,#333);display:block;';
      a.appendChild(img); caja.appendChild(a);
    } catch (e) { caja.textContent = 'No se pudo cargar la foto.'; }
  }

  cuerpo.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-accion]');
    if (!el) return;
    const m = cache.find(x => x.id === abiertoId);
    if (!m) return;
    const accion = el.dataset.accion;

    if (accion === 'copiar-correo') { copiar(m.correo || '', 'Correo'); return; }
    if (accion === 'copiar-tel') { copiar(String(m.telefono || '').replace(/\D/g, ''), 'Teléfono'); return; }
    if (accion === 'responder-correo' || accion === 'responder-wa') return; // el enlace hace su trabajo

    el.disabled = true;
    let ok = false;
    if (accion === 'respondido') {
      ok = await cambiarEstado(m.id, 'respondido');
      if (ok) toast('Marcado como respondido ✓');
    } else if (accion === 'alternar-leido') {
      ok = await guardar(m.id, { leido: noLeido(m) });
    }
    if (ok) { aplicarFiltros(); }
    if (abiertoId === m.id) pintarModal();
  });

  cuerpo.addEventListener('change', async (ev) => {
    if (ev.target.id !== 'msgModalEstado') return;
    const id = abiertoId;
    const m = cache.find(x => x.id === id);
    if (!m) return;
    ev.target.disabled = true;
    const ok = await cambiarEstado(id, ev.target.value);
    if (ok) { toast('Estado: ' + infoEstado(ev.target.value).label + ' ✓'); aplicarFiltros(); }
    if (abiertoId === id) pintarModal();
  });

  function vecino(delta) {
    const idx = filtrados.findIndex(x => x.id === abiertoId);
    const sig = filtrados[idx + delta];
    if (sig) abrir(sig.id);
  }
  $('btnMsgAnterior').addEventListener('click', () => vecino(-1));
  $('btnMsgSiguiente').addEventListener('click', () => vecino(1));
  $('btnCerrarModalMensaje').addEventListener('click', cerrar);
  modal.addEventListener('click', (e) => { if (e.target === modal) cerrar(); });
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') { cerrar(); return; }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target.tagName || ''))) return;
    if (e.key === 'ArrowLeft') vecino(-1);
    if (e.key === 'ArrowRight') vecino(1);
  });
})();
