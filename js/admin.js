/* ============================================================
   LÓGICA DEL PANEL DE ADMINISTRACIÓN (admin.html)
   ------------------------------------------------------------
   Antes esto vivía como un <script> enorme metido dentro de
   admin.html (~1650 líneas). Se movió aquí para poder editarlo
   sin tener que scrollear entre HTML y JavaScript mezclados, y
   para que el editor pueda resaltar sintaxis y errores como
   corresponde. No cambia nada de cómo funciona el panel — es el
   mismo código, solo que ahora vive en su propio archivo.

   Depende de (cárgalos ANTES que este archivo en admin.html):
     firebase-app-compat.js, firebase-auth-compat.js,
     firebase-firestore-compat.js, js/firebase-config.js,
     js/icons.js, js/products.js, js/store.js
   ============================================================ */

const loginView = document.getElementById('adminLoginView');
const dashView  = document.getElementById('adminDashView');

function showToast(texto, esError = false) {
  const toast = document.getElementById('toast');
  document.getElementById('toastText').textContent = texto;
  toast.classList.toggle('error', esError);
  toast.classList.add('show');
  clearTimeout(window._t);
  window._t = setTimeout(() => toast.classList.remove('show'), 2400);
}

/* ============================================================
   MENÚ "VER FOTO / CAMBIAR FOTO"
   Antes, hacer clic en cualquier foto ya puesta abría directo el
   explorador de archivos — fácil de tocar sin querer y reemplazar
   una foto buena por accidente. Ahora, si el picker ya tiene foto,
   el clic abre un menú chiquito con "Ver foto en grande" y "Cambiar
   foto"; si todavía no tiene foto, el clic abre el explorador
   directo como siempre (no hay nada que ver ni que perder).
   ============================================================ */
let _fotoMenuAbierto = null;
let _fotoMenuInputCambiar = null;

function cerrarMenuFoto() {
  if (_fotoMenuAbierto) { _fotoMenuAbierto.remove(); _fotoMenuAbierto = null; }
  document.removeEventListener('click', _cerrarMenuFotoSiAfuera, true);
}
function _cerrarMenuFotoSiAfuera(e) {
  if (_fotoMenuAbierto && !_fotoMenuAbierto.contains(e.target)) cerrarMenuFoto();
}

function abrirMenuFoto(anchorEl, input, imgSrc) {
  cerrarMenuFoto();
  const menu = document.createElement('div');
  menu.className = 'foto-menu';
  menu.innerHTML = `
    <button type="button" data-accion="ver">👁 Ver foto en grande</button>
    <button type="button" data-accion="cambiar">📷 Cambiar foto</button>
  `;
  document.body.appendChild(menu);

  // posicionarlo pegado al picker, sin salirse de la pantalla
  const r = anchorEl.getBoundingClientRect();
  const menuAncho = menu.offsetWidth || 168;
  let left = Math.min(r.left, window.innerWidth - menuAncho - 12);
  let top = r.bottom + 6;
  if (top + menu.offsetHeight > window.innerHeight - 10) top = r.top - menu.offsetHeight - 6;
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;

  menu.querySelector('[data-accion="ver"]').addEventListener('click', () => {
    cerrarMenuFoto();
    abrirModalVerFoto(imgSrc, input);
  });
  menu.querySelector('[data-accion="cambiar"]').addEventListener('click', () => {
    cerrarMenuFoto();
    input.click();
  });

  _fotoMenuAbierto = menu;
  // en el próximo tick, para que el click que abrió el menú no lo cierre de una vez
  setTimeout(() => document.addEventListener('click', _cerrarMenuFotoSiAfuera, true), 0);
}

const modalVerFoto = document.getElementById('modalVerFoto');
const verFotoImg = document.getElementById('verFotoImg');
function abrirModalVerFoto(src, input) {
  verFotoImg.src = src;
  _fotoMenuInputCambiar = input || null;
  modalVerFoto.classList.add('open');
}
document.getElementById('btnVerFotoCerrar').addEventListener('click', () => modalVerFoto.classList.remove('open'));
modalVerFoto.addEventListener('click', (e) => { if (e.target === modalVerFoto) modalVerFoto.classList.remove('open'); });
document.getElementById('btnVerFotoCambiar').addEventListener('click', () => {
  modalVerFoto.classList.remove('open');
  if (_fotoMenuInputCambiar) _fotoMenuInputCambiar.click();
});

/** Engancha el menú Ver/Cambiar a un <label> picker de foto. Si el label
    todavía no tiene una <img> adentro (no hay foto puesta), no hace nada
    especial y el clic abre el explorador de archivos como siempre. */
function engancharMenuFoto(label) {
  label.addEventListener('click', (e) => {
    const img = label.querySelector('img');
    // sin foto puesta todavía: no hay nada que ver ni que perder,
    // se deja el comportamiento normal (abre el explorador de una vez)
    if (!img || !img.getAttribute('src') || img.style.display === 'none') return;
    e.preventDefault();
    e.stopPropagation();
    const input = label.querySelector('input[type="file"]');
    abrirMenuFoto(label, input, img.src);
  });
}

let permisosActuales = permisosTodosActivos();

/* ---------- Cierre de sesión por inactividad ----------
   Si nadie toca nada (mouse, teclado, scroll, clics) durante este
   rato, se cierra la sesión sola — pensado para un compu compartido
   del local donde alguien se puede olvidar el panel abierto. */
const INACTIVIDAD_LIMITE_MS = 30 * 60 * 1000; // 30 minutos
let _ultimaActividadAdmin = Date.now();
let _vigiaInactividadIniciada = false;
function _marcarActividadAdmin() { _ultimaActividadAdmin = Date.now(); }
function iniciarVigiaInactividadAdmin() {
  _marcarActividadAdmin();
  if (_vigiaInactividadIniciada) return;
  _vigiaInactividadIniciada = true;
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(ev => {
    document.addEventListener(ev, _marcarActividadAdmin, { passive: true });
  });
  setInterval(async () => {
    if (dashView.style.display === 'none') return; // ya no hay sesión abierta en pantalla
    if (Date.now() - _ultimaActividadAdmin >= INACTIVIDAD_LIMITE_MS) {
      await cerrarSesionAdmin();
      dashView.style.display = 'none';
      loginView.style.display = 'block';
      document.body.classList.add('admin-login-active');
      showToast('Se cerró tu sesión por estar inactivo mucho rato.', true);
    }
  }, 60 * 1000); // revisa cada minuto
}

async function entrarAlPanel() {
  loginView.style.display = 'none';
  dashView.style.display = 'block';
  document.body.classList.remove('admin-login-active');
  const elUsuario = document.getElementById('adminUsuarioActual');
  if (elUsuario) elUsuario.textContent = 'Conectado como: ' + (correoAdminActual() || '');
  permisosActuales = await obtenerPermisosUsuarioActual();
  usuariosTabDesbloqueada = false;
  aplicarPermisosUI();
  await Promise.all([cargarCatalogo(), cargarConfigDrop(), cargarConfigEnvio()]); // catálogo, config del drop y costos de envío desde Firestore antes de pintar la tabla
  pintarTodo();
  pintarVoltageClub();
  pintarCostosEnvio();
  if (typeof pintarEnviosCiudades === 'function') pintarEnviosCiudades();   // tarifas por ciudad (js/admin-envios.js)
  if (typeof iniciarConversionAdmin === 'function') iniciarConversionAdmin();   // envío gratis por monto + lista de espera (js/admin-conversion.js)
  if (permisosActuales.mensajes && typeof cargarBadgeMensajes === 'function') cargarBadgeMensajes(); // contador de "sin leer" en el menú
  iniciarVigiaInactividadAdmin();
}

/* ---------- pestaña Envíos: costos de envío por zona ---------- */
const ENVIO_MAX = 9999999;
const _fmtFechaHora = (ms) => new Date(ms).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const _fmtFechaCorta = (ms) => new Date(ms).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
function _haceTiempo(ms) {
  const d = Date.now() - ms;
  if (d < 0 || !Number.isFinite(d)) return '';
  const min = Math.floor(d / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias < 30) return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
  const meses = Math.floor(dias / 30);
  return meses < 12 ? `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}` : `hace más de un año`;
}
function _envioPartesNombre(nombre) {
  const m = String(nombre || '').match(/^(.*?)\s*\((.*)\)\s*$/);
  return m ? { principal: m[1], detalle: m[2] } : { principal: String(nombre || ''), detalle: '' };
}
/** Lee y valida lo escrito en un campo de costo. Acepta "8000" o "8.000" (separador de miles). */
function _envioLeerCampo(input) {
  let t = String(input.value || '').trim().replace(/^\$\s*/, '');
  if (t === '') return { ok: false, msg: 'Escribe un valor (usa 0 si no cobras envío).' };
  if (t.startsWith('-')) return { ok: false, msg: 'El costo no puede ser negativo.' };
  if (t.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(t)) return { ok: false, msg: 'Usa solo números enteros, ej: 8000 o 8.000.' };
  t = t.replace(/\./g, '');
  if (!/^\d+$/.test(t)) return { ok: false, msg: 'Solo se permiten números.' };
  const valor = Number(t);
  if (valor > ENVIO_MAX) return { ok: false, msg: `El máximo permitido es ${_pesos(ENVIO_MAX)}.` };
  return { ok: true, valor };
}
let _envioGuardando = false;

function pintarCostosEnvio() {
  const tbody = document.getElementById('costosEnvioTablaBody');
  const zonas = zonasEnvio();
  tbody.innerHTML = zonas.map(z => {
    const n = _envioPartesNombre(z.nombre);
    const costo = Number(z.costo) || 0;
    return `
    <tr data-zona-fila="${_escAdm(z.id)}">
      <td class="env-td-zona env-zona"><b>${_escAdm(n.principal)}</b>${n.detalle ? `<small>${_escAdm(n.detalle)}</small>` : ''}</td>
      <td class="env-td-guardado env-guardado">${_pesos(costo)}</td>
      <td class="env-td-nuevo">
        <label class="env-campo">
          <span class="env-peso" aria-hidden="true">$</span>
          <input type="text" inputmode="numeric" autocomplete="off" class="admin-input input-costo-envio" data-zona="${_escAdm(z.id)}" data-original="${costo}"
            aria-label="Nuevo costo de envío para ${_escAdm(z.nombre)}" value="${costo.toLocaleString('es-CO')}">
        </label>
        <span class="env-error" role="alert"></span>
      </td>
      <td class="env-td-est env-est"><span class="env-pill">Sin cambios</span><button type="button" class="env-undo" hidden aria-label="Deshacer el cambio en ${_escAdm(n.principal)}" title="Deshacer"><svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg></button></td>
    </tr>`;
  }).join('');

  // resumen real a partir de los costos cargados (nada inventado)
  const costos = zonas.map(z => Number(z.costo) || 0);
  document.getElementById('envStatZonas').textContent = zonas.length;
  document.getElementById('envStatMin').textContent = costos.length ? _pesos(Math.min(...costos)) : '—';
  document.getElementById('envStatMax').textContent = costos.length ? _pesos(Math.max(...costos)) : '—';
  const fecha = typeof fechaActualizacionEnvio === 'function' ? fechaActualizacionEnvio() : null;
  document.getElementById('envUltimaAct').textContent = fecha ? _fmtFechaHora(fecha) : 'Aún sin cambios desde el panel';
  _envioActualizarEstado();
}

/** Revisa cada fila, marca cambios/errores y activa o desactiva los botones. */
function _envioActualizarEstado() {
  const inputs = [...document.querySelectorAll('.input-costo-envio')];
  let cambios = 0, errores = 0;
  inputs.forEach(input => {
    const fila = input.closest('tr');
    const original = Number(input.dataset.original);
    const lec = _envioLeerCampo(input);
    const modificado = !lec.ok || lec.valor !== original;
    const error = !lec.ok;
    if (modificado) cambios++;
    if (error) errores++;
    input.classList.toggle('is-mod', modificado && !error);
    input.setAttribute('aria-invalid', error ? 'true' : 'false');
    fila.classList.toggle('is-mod', modificado);
    fila.querySelector('.env-error').textContent = error ? lec.msg : '';
    const pill = fila.querySelector('.env-pill');
    pill.className = 'env-pill' + (error ? ' err' : modificado ? ' mod' : '');
    pill.textContent = error ? 'Revisar' : modificado ? 'Modificado' : 'Sin cambios';
    fila.querySelector('.env-undo').hidden = !modificado;
  });
  const estado = document.getElementById('envEstado');
  estado.classList.toggle('hay-cambios', cambios > 0 && !errores);
  estado.classList.toggle('hay-error', errores > 0);
  estado.textContent = errores
    ? `Corrige ${errores === 1 ? 'el valor marcado' : 'los ' + errores + ' valores marcados'} para poder guardar.`
    : cambios ? `${cambios} ${cambios === 1 ? 'zona con cambios' : 'zonas con cambios'} sin guardar.` : 'Sin cambios por guardar.';
  document.getElementById('btnGuardarCostosEnvio').disabled = _envioGuardando || !cambios || !!errores;
  document.getElementById('btnRestablecerCostosEnvio').disabled = _envioGuardando || !cambios;
  const tabBtn = document.getElementById('tabBtnEnvios');
  if (tabBtn) tabBtn.classList.toggle('env-dirty', cambios > 0);
  return { cambios, errores };
}
function envioHayCambiosSinGuardar() {
  return [...document.querySelectorAll('.input-costo-envio')].some(i => {
    const l = _envioLeerCampo(i);
    return !l.ok || l.valor !== Number(i.dataset.original);
  });
}

(function iniciarEnvios() {
  const tbody = document.getElementById('costosEnvioTablaBody');
  tbody.addEventListener('input', (e) => { if (e.target.matches('.input-costo-envio')) _envioActualizarEstado(); });
  tbody.addEventListener('focusin', (e) => { if (e.target.matches('.input-costo-envio')) setTimeout(() => e.target.select(), 0); });
  tbody.addEventListener('focusout', (e) => { // al salir del campo, si es válido, se muestra con formato $1.000
    if (!e.target.matches('.input-costo-envio')) return;
    const l = _envioLeerCampo(e.target);
    if (l.ok) e.target.value = l.valor.toLocaleString('es-CO');
    _envioActualizarEstado();
  });
  tbody.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.input-costo-envio')) {
      e.preventDefault();
      const btn = document.getElementById('btnGuardarCostosEnvio');
      if (!btn.disabled) btn.click(); else e.target.blur();
    }
  });
  tbody.addEventListener('click', (e) => {
    const undo = e.target.closest('.env-undo');
    if (!undo) return;
    const input = undo.closest('tr').querySelector('.input-costo-envio');
    input.value = Number(input.dataset.original).toLocaleString('es-CO');
    _envioActualizarEstado();
  });

  document.getElementById('btnRestablecerCostosEnvio').addEventListener('click', async () => {
    if (!envioHayCambiosSinGuardar()) return;
    const ok = await confirmarAccion({
      titulo: 'Restablecer costos',
      mensaje: 'Se descartarán los cambios que no has guardado y cada zona volverá al costo guardado actualmente.',
      textoOk: 'Sí, restablecer', peligro: true
    });
    if (!ok) return;
    pintarCostosEnvio();
    showToast('Se restablecieron los costos guardados.');
  });

  document.getElementById('btnGuardarCostosEnvio').addEventListener('click', async () => {
    if (_envioGuardando) return;
    const { cambios, errores } = _envioActualizarEstado();
    if (errores) { showToast('Hay valores no válidos. Revisa los campos marcados.', true); return; }
    if (!cambios) { showToast('No hay cambios para guardar.'); return; }
    // solo viajan las zonas realmente modificadas: las demás no se tocan
    const cambiosPorZona = {};
    document.querySelectorAll('.input-costo-envio').forEach(input => {
      const l = _envioLeerCampo(input);
      if (l.ok && l.valor !== Number(input.dataset.original)) cambiosPorZona[input.dataset.zona] = l.valor;
    });
    const btn = document.getElementById('btnGuardarCostosEnvio');
    const textoBtn = btn.textContent;
    _envioGuardando = true;
    btn.classList.add('is-cargando');
    btn.innerHTML = '<span class="mq-spin" aria-hidden="true"></span>Guardando…';
    _envioActualizarEstado();
    try {
      await guardarConfigEnvioConfirmado(cambiosPorZona);
      _envioGuardando = false;
      pintarCostosEnvio();
      showToast('Costos de envío guardados ✓ Ya se ven en el carrito.');
    } catch (err) {
      console.error('Error guardando costos de envío:', err);
      _envioGuardando = false;
      showToast('No se pudieron guardar los costos. Revisa tu conexión o permisos e inténtalo de nuevo.', true);
    } finally {
      _envioGuardando = false;
      btn.classList.remove('is-cargando');
      btn.textContent = textoBtn;
      _envioActualizarEstado();
    }
  });

  // aviso si intenta cerrar o recargar la página con costos sin guardar
  window.addEventListener('beforeunload', (e) => {
    if (envioHayCambiosSinGuardar()) { e.preventDefault(); e.returnValue = ''; }
  });
})();

/* ---------- pestaña Resumen: Voltage Club ---------- */
let _correosVoltageClub = [];          // todos los registros reales
const _vc = { q: '', rango: 'todo', desde: '', hasta: '', orden: 'recientes', visibles: 25, estado: 'cargando' };
const VC_PAGINA = 25;

const _vcMs = (f) => { const t = new Date(f).getTime(); return Number.isFinite(t) && t > 0 ? t : null; };
const _vcFechaLocal = (iso, finDia) => { // 'YYYY-MM-DD' → ms en hora local
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], finDia ? 23 : 0, finDia ? 59 : 0, finDia ? 59 : 0, finDia ? 999 : 0).getTime();
};
function _vcFiltrados() {
  const q = _vc.q.trim().toLowerCase();
  const ahora = new Date();
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  let desde = null, hasta = null;
  if (_vc.rango === 'hoy') desde = inicioHoy;
  else if (_vc.rango === '7') desde = ahora.getTime() - 7 * 864e5;
  else if (_vc.rango === '30') desde = ahora.getTime() - 30 * 864e5;
  else if (_vc.rango === 'mes') desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime();
  else if (_vc.rango === 'rango') { desde = _vcFechaLocal(_vc.desde, false); hasta = _vcFechaLocal(_vc.hasta, true); }
  let lista = _correosVoltageClub.filter(s => {
    if (q && !String(s.correo || '').toLowerCase().includes(q)) return false;
    if (desde !== null || hasta !== null) {
      const t = _vcMs(s.fecha);
      if (t === null) return false;
      if (desde !== null && t < desde) return false;
      if (hasta !== null && t > hasta) return false;
    }
    return true;
  });
  const t = (s) => _vcMs(s.fecha) || 0;
  if (_vc.orden === 'antiguos') lista = lista.sort((a, b) => t(a) - t(b));
  else if (_vc.orden === 'correo') lista = lista.sort((a, b) => String(a.correo || '').localeCompare(String(b.correo || ''), 'es'));
  else lista = lista.sort((a, b) => t(b) - t(a));
  return lista;
}
function _vcHayFiltro() { return !!(_vc.q.trim() || _vc.rango !== 'todo'); }

function _vcPintarStats() {
  const total = _correosVoltageClub.length;
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime();
  const fechas = _correosVoltageClub.map(s => _vcMs(s.fecha)).filter(t => t !== null);
  const nuevosMes = fechas.filter(t => t >= inicioMes).length;
  const ultimo = fechas.length ? Math.max(...fechas) : null;
  document.getElementById('voltageClubTotal').textContent = total.toLocaleString('es-CO');
  document.getElementById('vcTotalTxt').textContent = total === 1 ? 'miembro registrado' : 'miembros registrados';
  document.getElementById('vcStatTotal').textContent = total.toLocaleString('es-CO');
  document.getElementById('vcStatMes').textContent = nuevosMes.toLocaleString('es-CO');
  document.getElementById('vcStatMesTxt').textContent = ahora.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  document.getElementById('vcStatUltimo').textContent = ultimo ? _fmtFechaCorta(ultimo) : '—';
  document.getElementById('vcStatUltimoTxt').textContent = ultimo ? `${new Date(ultimo).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })} · ${_haceTiempo(ultimo)}` : 'Sin registros todavía';
}

function _vcPintarTabla() {
  const tbody = document.getElementById('voltageClubTablaBody');
  const resultados = document.getElementById('vcResultados');
  const masWrap = document.getElementById('vcMasWrap');
  const botones = ['btnAvisarDropVoltageClub', 'btnCopiarVoltageClub', 'btnDescargarVoltageClub'].map(id => document.getElementById(id));
  masWrap.hidden = true;

  if (_vc.estado === 'cargando') {
    botones.forEach(b => { b.disabled = true; });
    resultados.textContent = '';
    tbody.innerHTML = `<tr class="vc-estado"><td colspan="3"><span class="mq-spin" aria-hidden="true"></span> Cargando miembros…</td></tr>`;
    return;
  }
  if (_vc.estado === 'error') {
    botones.forEach(b => { b.disabled = true; });
    resultados.textContent = '';
    tbody.innerHTML = `<tr class="vc-estado"><td colspan="3"><b>No se pudo cargar</b>Revisa tu conexión o tus permisos e inténtalo de nuevo.<br><button type="button" class="admin-btn admin-btn-ghost" id="vcReintentar">Reintentar</button></td></tr>`;
    return;
  }
  const total = _correosVoltageClub.length;
  botones[0].disabled = total === 0;
  if (!total) {
    botones[1].disabled = true; botones[2].disabled = true;
    resultados.textContent = '';
    tbody.innerHTML = `<tr class="vc-estado"><td colspan="3"><b>Aún no hay miembros</b>Cuando alguien deje su correo en la tienda, aparecerá aquí.</td></tr>`;
    return;
  }
  const lista = _vcFiltrados();
  botones[1].disabled = lista.length === 0;
  botones[2].disabled = lista.length === 0;
  resultados.textContent = _vcHayFiltro()
    ? `${lista.length.toLocaleString('es-CO')} de ${total.toLocaleString('es-CO')} registros`
    : `${total.toLocaleString('es-CO')} ${total === 1 ? 'registro' : 'registros'}`;
  if (!lista.length) {
    tbody.innerHTML = `<tr class="vc-estado"><td colspan="3"><b>Sin resultados</b>Ningún correo coincide con la búsqueda o el filtro de fechas.</td></tr>`;
    return;
  }
  const visibles = lista.slice(0, _vc.visibles);
  tbody.innerHTML = visibles.map(s => {
    const t = _vcMs(s.fecha);
    const id = _escAdm(s._id || s.correo || '');
    const correo = _escAdm(s.correo || '');
    return `
    <tr data-id="${id}">
      <td class="vc-td-correo" data-label="Correo"><span class="vc-correo">${correo}</span></td>
      <td class="vc-td-fecha" data-label="Se registró"><span class="vc-fecha">${t ? _fmtFechaCorta(t) : '—'}${t ? `<small>${new Date(t).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}</small>` : ''}</span></td>
      <td class="vc-td-acc vc-td-acciones">
        <button type="button" class="vc-btn-ico" data-accion="copiar" aria-label="Copiar correo ${correo}" title="Copiar correo"><svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg></button>
        <button type="button" class="vc-btn-ico es-borrar" data-accion="eliminar" aria-label="Eliminar ${correo} del Voltage Club" title="Eliminar registro"><svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg></button>
      </td>
    </tr>`;
  }).join('');
  const restantes = lista.length - visibles.length;
  masWrap.hidden = restantes <= 0;
  if (restantes > 0) document.getElementById('vcMas').textContent = `Mostrar más (${restantes.toLocaleString('es-CO')} restantes)`;
}

async function pintarVoltageClub() {
  const refrescar = document.getElementById('vcRefrescar');
  _vc.estado = 'cargando';
  refrescar.classList.add('is-spin');
  _vcPintarTabla();
  try {
    _correosVoltageClub = await obtenerSuscriptoresVoltageClub();
    _vc.estado = 'listo';
  } catch (e) {
    console.error('Voltage Club:', e);
    _vc.estado = 'error';
    showToast('No se pudo cargar el Voltage Club.', true);
  }
  refrescar.classList.remove('is-spin');
  if (_vc.estado === 'listo') _vcPintarStats();
  _vcPintarTabla();
}

/** Copia texto al portapapeles (con alternativa si el navegador no permite la API moderna). */
async function _copiarTexto(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(texto); return true; }
  } catch (e) { /* se prueba la alternativa */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = texto; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}
/** Celda de CSV segura: comillas escapadas y sin que Excel ejecute fórmulas. */
function _csvCelda(v) {
  let t = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

(function iniciarVoltageClub() {
  const $ = (id) => document.getElementById(id);
  const repintar = () => { _vc.visibles = VC_PAGINA; _vcPintarTabla(); };

  $('vcBuscar').addEventListener('input', (e) => { _vc.q = e.target.value; repintar(); });
  $('vcOrden').addEventListener('change', (e) => { _vc.orden = e.target.value; repintar(); });
  $('vcRango').addEventListener('change', (e) => {
    _vc.rango = e.target.value;
    $('vcRangoFechas').hidden = _vc.rango !== 'rango';
    repintar();
  });
  $('vcDesde').addEventListener('change', (e) => { _vc.desde = e.target.value; repintar(); });
  $('vcHasta').addEventListener('change', (e) => { _vc.hasta = e.target.value; repintar(); });
  $('vcRefrescar').addEventListener('click', () => pintarVoltageClub());
  $('vcMas').addEventListener('click', () => { _vc.visibles += VC_PAGINA; _vcPintarTabla(); });

  $('voltageClubTablaBody').addEventListener('click', async (e) => {
    if (e.target.closest('#vcReintentar')) { pintarVoltageClub(); return; }
    const btn = e.target.closest('[data-accion]');
    if (!btn) return;
    const id = btn.closest('tr').dataset.id;
    const reg = _correosVoltageClub.find(s => (s._id || s.correo) === id);
    if (!reg) return;

    if (btn.dataset.accion === 'copiar') {
      const ok = await _copiarTexto(reg.correo || '');
      if (ok) { btn.classList.add('ok'); setTimeout(() => btn.classList.remove('ok'), 1200); }
      showToast(ok ? 'Correo copiado ✓' : 'No se pudo copiar el correo.', !ok);
      return;
    }
    if (btn.dataset.accion === 'eliminar') {
      const sigue = await confirmarAccion({
        titulo: 'Eliminar registro',
        mensaje: `Se eliminará ${reg.correo} del Voltage Club y dejará de recibir avisos de nuevos drops. Esta acción no se puede deshacer.`,
        textoOk: 'Eliminar', peligro: true
      });
      if (!sigue) return;
      btn.disabled = true;
      try {
        await eliminarSuscriptorVoltageClub(reg._id || reg.correo);
        _correosVoltageClub = _correosVoltageClub.filter(s => s !== reg);
        _vcPintarStats();
        _vcPintarTabla();
        showToast('Registro eliminado ✓');
      } catch (err) {
        console.error('No se pudo eliminar del Voltage Club:', err);
        btn.disabled = false;
        showToast('No se pudo eliminar el registro. Inténtalo de nuevo.', true);
      }
    }
  });

  $('btnCopiarVoltageClub').addEventListener('click', async () => {
    const lista = _vcFiltrados();
    if (!lista.length) { showToast('No hay correos para copiar.', true); return; }
    const ok = await _copiarTexto(lista.map(s => s.correo).join(', '));
    showToast(ok ? `${lista.length} ${lista.length === 1 ? 'correo copiado' : 'correos copiados'} ✓` : 'No se pudo copiar.', !ok);
  });

  $('btnDescargarVoltageClub').addEventListener('click', () => {
    const lista = _vcFiltrados();
    if (!lista.length) { showToast('No hay datos para exportar.', true); return; }
    try {
      const filas = ['correo,fecha'].concat(lista.map(s => {
        const t = _vcMs(s.fecha);
        return `${_csvCelda(s.correo)},${t ? new Date(t).toISOString() : ''}`;
      }));
      const blob = new Blob(['\ufeff' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const hoy = new Date();
      a.download = `voltage-club-${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`CSV descargado (${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}) ✓`);
    } catch (err) {
      console.error('CSV Voltage Club:', err);
      showToast('No se pudo generar el CSV.', true);
    }
  });
})();

/* ---------- "Avisar drop nuevo" al Voltage Club ---------- */
const modalAvisarDrop = document.getElementById('modalAvisarDrop');
document.getElementById('btnAvisarDropVoltageClub').addEventListener('click', () => {
  if (!_correosVoltageClub.length) { showToast('Todavía no hay nadie en el Voltage Club.', true); return; }
  document.getElementById('avisarDropContador').textContent =
    `Se manda por copia oculta (bcc) a los ${_correosVoltageClub.length} correos del Voltage Club — nadie ve la lista de los demás.`;
  document.getElementById('avisarDropAsunto').value = '';
  document.getElementById('avisarDropMensaje').value = '';
  modalAvisarDrop.classList.add('open');
});
document.getElementById('btnCerrarModalAvisarDrop').addEventListener('click', () => {
  modalAvisarDrop.classList.remove('open');
});
document.getElementById('btnEnviarAvisoDrop').addEventListener('click', async () => {
  const asunto = document.getElementById('avisarDropAsunto').value;
  const mensaje = document.getElementById('avisarDropMensaje').value;
  if (_correosVoltageClub.length > 90) {
    const sigue = await confirmarAccion({
      titulo: 'Enviar a muchos correos',
      textoOk: 'Sí, enviar ya',
      mensaje: `Son ${_correosVoltageClub.length} correos. Gmail gratis deja mandar más o menos 100 destinatarios al día en total (contando también los correos de pedidos y de códigos del panel). ¿Seguro que quieres mandarlo ya?`
    });
    if (!sigue) return;
  }
  const btn = document.getElementById('btnEnviarAvisoDrop');
  btn.disabled = true;
  const res = await avisarDropVoltageClub(asunto, mensaje);
  btn.disabled = false;
  if (!res.ok) { showToast(res.msg, true); return; }
  showToast(`Enviando a ${res.cantidad} correos ✓ (puede tardar unos minutos en llegarles a todos)`);
  modalAvisarDrop.classList.remove('open');
});

/** Muestra u oculta pestañas según lo que este usuario puede tocar.
    Si no tiene ni un permiso, se le avisa en vez de dejarlo ver un
    panel vacío sin explicación. */
function aplicarPermisosUI() {
  // Resumen combina datos de inventario y pedidos, así que se ve
  // si el usuario tiene al menos uno de los dos permisos.
  const puedeVerResumen = !!(permisosActuales.inventario || permisosActuales.pedidos);
  tabBtnResumen.style.display = puedeVerResumen ? '' : 'none';
  tabBtnEnvios.style.display = puedeVerResumen ? '' : 'none';

  const mapa = [
    [tabBtnResumen, '__resumen__'],
    [tabBtnInventario, 'inventario'],
    [tabBtnPedidos, 'pedidos'],
    [tabBtnMensajes, 'mensajes'],
    [tabBtnDrop, 'drop'],
    [tabBtnEnvios, '__envios__'],
    [tabBtnUsuarios, 'usuarios'],
  ];
  mapa.forEach(([btn, permiso]) => {
    if (permiso === '__resumen__' || permiso === '__envios__') return; // ya se resolvieron arriba
    btn.style.display = permisosActuales[permiso] ? '' : 'none';
  });
  permisosActuales.__resumen__ = puedeVerResumen;
  permisosActuales.__envios__ = puedeVerResumen;
  const btnAgregarProducto = document.getElementById('btnMostrarNuevo');
  if (btnAgregarProducto) btnAgregarProducto.style.display = permisosActuales.inventario ? '' : 'none';

  // si la pestaña que está abierta ahora mismo ya no le corresponde
  // (o es la primera vez que entra), lo mandamos a la primera que
  // sí pueda ver
  const tabActivaVisible = mapa.some(([btn, permiso]) => btn.classList.contains('active') && permisosActuales[permiso]);
  if (!tabActivaVisible) {
    const primeraDisponible = mapa.find(([, permiso]) => permisosActuales[permiso]);
    ocultarTodasLasPestanas();
    if (primeraDisponible) {
      primeraDisponible[0].click();
    } else {
      tituloTab.textContent = 'Sin acceso';
      showToast('Tu usuario no tiene permisos asignados. Habla con quien administra el panel.', true);
    }
  }
}

/* Al abrir el panel, primero se confirma con Firestore que la
   sesión guardada en este navegador todavía es válida (que nadie
   más "tomó" el usuario mientras tanto) antes de mostrar el
   dashboard. Mientras se confirma, se ve la pantalla de login. */
(async () => {
  if (sesionAdminActiva()) {
    const valida = await verificarSesionAdmin();
    if (valida) entrarAlPanel();
  }
})();

/* ---------- Pestañas: Resumen / Inventario / Pedidos / Drop / Usuarios ---------- */
const tabBtnResumen = document.getElementById('tabBtnResumen');
const tabBtnInventario = document.getElementById('tabBtnInventario');
const tabBtnPedidos = document.getElementById('tabBtnPedidos');
const tabBtnMensajes = document.getElementById('tabBtnMensajes');
const tabBtnDrop = document.getElementById('tabBtnDrop');
const tabBtnEnvios = document.getElementById('tabBtnEnvios');
const tabBtnUsuarios = document.getElementById('tabBtnUsuarios');
const tabResumen = document.getElementById('tabResumen');
const tabInventario = document.getElementById('tabInventario');
const tabPedidos = document.getElementById('tabPedidos');
const tabMensajes = document.getElementById('tabMensajes');
const tabDrop = document.getElementById('tabDrop');
const tabEnvios = document.getElementById('tabEnvios');
const tabUsuarios = document.getElementById('tabUsuarios');
const tituloTab = document.getElementById('adminTituloTab');

function ocultarTodasLasPestanas() {
  clearInterval(intervaloCountdownDrop);
  tabBtnResumen.classList.remove('active');
  tabBtnInventario.classList.remove('active');
  tabBtnPedidos.classList.remove('active');
  tabBtnMensajes.classList.remove('active');
  tabBtnDrop.classList.remove('active');
  tabBtnEnvios.classList.remove('active');
  tabBtnUsuarios.classList.remove('active');
  tabResumen.style.display = 'none';
  tabInventario.style.display = 'none';
  tabPedidos.style.display = 'none';
  tabMensajes.style.display = 'none';
  tabDrop.style.display = 'none';
  tabEnvios.style.display = 'none';
  tabUsuarios.style.display = 'none';
}

tabBtnResumen.addEventListener('click', () => {
  ocultarTodasLasPestanas();
  tabBtnResumen.classList.add('active');
  tabResumen.style.display = 'block';
  tituloTab.textContent = 'Resumen';
  pintarResumen();
});

tabBtnInventario.addEventListener('click', () => {
  if (!permisosActuales.inventario) return;
  ocultarTodasLasPestanas();
  tabBtnInventario.classList.add('active');
  tabInventario.style.display = 'block';
  tituloTab.textContent = 'Inventario y precios';
});

tabBtnPedidos.addEventListener('click', () => {
  if (!permisosActuales.pedidos) return;
  ocultarTodasLasPestanas();
  tabBtnPedidos.classList.add('active');
  tabPedidos.style.display = 'block';
  tituloTab.textContent = 'Pedidos de clientes';
  pintarPedidos();
});

/* La lógica de esta pestaña vive en js/admin-mensajes.js (se carga después). */
tabBtnMensajes.addEventListener('click', () => {
  if (!permisosActuales.mensajes) return;
  ocultarTodasLasPestanas();
  tabBtnMensajes.classList.add('active');
  tabMensajes.style.display = 'block';
  tituloTab.textContent = 'Mensajes de clientes';
  if (typeof pintarMensajes === 'function') pintarMensajes();
});

tabBtnDrop.addEventListener('click', () => {
  if (!permisosActuales.drop) return;
  ocultarTodasLasPestanas();
  tabBtnDrop.classList.add('active');
  tabDrop.style.display = 'block';
  tituloTab.textContent = 'Configurar drop';
  pintarTabDrop();
});

/* Costos de envío: pestaña propia (antes vivían al final de Resumen). Al volver a entrar
   NO se repinta, para no borrar cambios que todavía no se han guardado. */
tabBtnEnvios.addEventListener('click', () => {
  if (!permisosActuales.__envios__) return;
  ocultarTodasLasPestanas();
  tabBtnEnvios.classList.add('active');
  tabEnvios.style.display = 'block';
  tituloTab.textContent = 'Configurar envíos';
});

let usuariosTabDesbloqueada = false;

function mostrarTabUsuarios() {
  ocultarTodasLasPestanas();
  tabBtnUsuarios.classList.add('active');
  tabUsuarios.style.display = 'block';
  tituloTab.textContent = 'Usuarios del panel';
  pintarUsuariosPanel();
}

tabBtnUsuarios.addEventListener('click', () => {
  if (!permisosActuales.usuarios) return;
  if (usuariosTabDesbloqueada) { mostrarTabUsuarios(); return; }
  if (!_esSuperAdminActual()) {
    showToast('Solo la cuenta principal (superAdmin) puede entrar a esta pestaña.', true);
    return;
  }
  document.getElementById('claveAccesoUsuarios').value = '';
  document.getElementById('modalAccesoUsuarios').classList.add('open');
  setTimeout(() => document.getElementById('claveAccesoUsuarios').focus(), 50);
});

document.getElementById('btnCerrarModalAccesoUsuarios').addEventListener('click', () => {
  document.getElementById('modalAccesoUsuarios').classList.remove('open');
});

document.getElementById('btnConfirmarAccesoUsuarios').addEventListener('click', async () => {
  const clave = document.getElementById('claveAccesoUsuarios').value;
  if (!clave) { showToast('Escribe la contraseña.', true); return; }
  const ok = await verificarAccesoTabUsuarios(clave);
  if (!ok) { showToast('Contraseña incorrecta.', true); return; }
  usuariosTabDesbloqueada = true;
  document.getElementById('modalAccesoUsuarios').classList.remove('open');
  mostrarTabUsuarios();
});

document.getElementById('claveAccesoUsuarios').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btnConfirmarAccesoUsuarios').click();
});

/* ---------- pestaña Usuarios: crear, activar/desactivar, eliminar ---------- */
let _usuariosCache = [];
const _escUsr = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function pintarUsuariosPanel() {
  const tbody = document.getElementById('tablaUsuariosPanelBody');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--gray);">Cargando usuarios…</td></tr>`;
  _usuariosCache = await obtenerUsuariosAdminPanel();
  const usuarios = _usuariosCache;

  const activos = usuarios.filter(u => u.activo !== false).length;
  const conectados = usuarios.filter(u => u.conectado).length;
  const f2 = n => String(n).padStart(2, '0');
  document.getElementById('usuariosStats').innerHTML = `
    <div class="usr-stat usr-stat-blue"><span class="usr-stat-lbl">👥 Usuarios</span><b>${f2(usuarios.length)}</b></div>
    <div class="usr-stat usr-stat-green"><span class="usr-stat-lbl"><i class="usr-dot"></i> Activos</span><b>${f2(activos)}</b></div>
    <div class="usr-stat usr-stat-pink"><span class="usr-stat-lbl"><i class="usr-dot"></i> Conectados</span><b>${f2(conectados)}</b></div>
  `;
  renderTablaUsuariosPanel();
}

function renderTablaUsuariosPanel() {
  const tbody = document.getElementById('tablaUsuariosPanelBody');
  const q = (document.getElementById('usuariosBuscar').value || '').trim().toLowerCase();
  const estado = document.getElementById('usuariosFiltroEstado').value;
  if (!_usuariosCache.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--gray);">Todavía no hay usuarios.</td></tr>`;
    return;
  }
  const usuarios = _usuariosCache.filter(u => {
    if (q && !`${u.correo || ''} ${u.usuario || ''}`.toLowerCase().includes(q)) return false;
    if (estado === 'activos') return u.activo !== false;
    if (estado === 'inactivos') return u.activo === false;
    if (estado === 'conectados') return !!u.conectado;
    return true;
  });
  if (!usuarios.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--gray);">Ningún usuario coincide con la búsqueda.</td></tr>`;
    return;
  }
  const yo = usuarioAdminActual();
  const ETIQUETAS_PERMISOS = { inventario: 'Inventario', pedidos: 'Pedidos', eliminarPedidos: 'Eliminar pedidos', mensajes: 'Mensajes', drop: 'Drop', usuarios: 'Usuarios' };
  const COLORES_AVATAR = ['#8af04e', '#6cb8ff', '#ff6fae', '#ffb545', '#b58cff', '#3ddcc0'];
  const colorAvatar = nombre => COLORES_AVATAR[[...nombre].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORES_AVATAR.length];
  tbody.innerHTML = usuarios.map(u => {
    const fecha = u.creado ? new Date(u.creado) : null;
    const creado = fecha && !isNaN(fecha) ? fecha.toLocaleDateString('es-CO', { dateStyle: 'medium' }) + '<small>' + fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) + '</small>' : '—';
    const permisos = normalizarPermisos(u);
    const activosPermisos = Object.keys(permisos).filter(k => permisos[k]);
    const permisosTexto = activosPermisos.length
      ? activosPermisos.map(k => `<span class="admin-permiso-pill">${ETIQUETAS_PERMISOS[k] || _escUsr(k)}</span>`).join(' ')
      : '<span class="admin-foto-hint">Sin permisos</span>';
    const etiqueta = u.correo || u.usuario || '';
    const eti = _escUsr(etiqueta), uid = _escUsr(u.usuario);
    const av = colorAvatar(etiqueta);
    const inactivo = u.activo === false;
    return `
      <tr class="usr-fila${inactivo ? ' usr-fila-off' : ''}">
        <td data-label="Usuario">
          <div class="usuario-fila">
            <span class="usuario-avatar" style="border-color:${av};color:${av}" title="${uid}">${_escUsr(etiqueta.charAt(0).toUpperCase())}</span>
            <div class="usr-id"><b>${eti}</b>${u.usuario === yo || u.superAdmin ? `<small class="usr-tag">${u.usuario === yo ? 'Tú' : ''}${u.usuario === yo && u.superAdmin ? ' · ' : ''}${u.superAdmin ? 'SuperAdmin' : ''}</small>` : ''}</div>
          </div>
        </td>
        <td data-label="Estado"><span class="usuario-estado-pill ${inactivo ? 'usuario-estado-inactivo' : 'usuario-estado-activo'}">${inactivo ? 'Desactivado' : 'Activo'}</span></td>
        <td data-label="Permisos"><div class="usr-pills">${permisosTexto}</div></td>
        <td data-label="Conectado">${u.conectado ? '<span class="usuario-estado-pill usuario-estado-conectado">🟢 En línea</span>' : '<span class="usuario-estado-pill usuario-estado-desconectado">⚪ Desconectado</span>'}${(() => {
          if (u.conectado) return '';
          const f = u.ultimaConexion ? new Date(u.ultimaConexion) : null;
          return `<small class="usr-ultima">${f && !isNaN(f) ? 'Última vez: ' + f.toLocaleDateString('es-CO', { dateStyle: 'medium' }) + ' · ' + f.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : 'Sin registro de conexión'}</small>`;
        })()}</td>
        <td data-label="Creado" class="mono usr-fecha">${creado}</td>
        <td data-label="Acciones">
          <div class="usr-acciones">
            <button type="button" class="admin-btn admin-btn-ghost usr-btn btn-editar-permisos" data-usuario="${uid}" data-correo="${eti}" data-permisos='${_escUsr(JSON.stringify(permisos))}'>✏️ Editar</button>
            <button type="button" class="admin-btn admin-btn-ghost usr-btn btn-toggle-usuario" data-usuario="${uid}" data-correo="${eti}" data-activo="${!inactivo}">${inactivo ? '✅ Activar' : '🚫 Desactivar'}</button>
            ${u.usuario === yo ? '' : `<button type="button" class="admin-btn admin-btn-ghost usr-btn usr-btn-danger btn-eliminar-usuario" data-usuario="${uid}" data-correo="${eti}">🗑 Eliminar</button>`}
          </div>
        </td>
      </tr>`;
  }).join('');
}
document.getElementById('usuariosBuscar').addEventListener('input', renderTablaUsuariosPanel);
document.getElementById('usuariosFiltroEstado').addEventListener('change', renderTablaUsuariosPanel);

document.getElementById('btnCrearUsuarioPanel').addEventListener('click', async () => {
  const uid = document.getElementById('nuevoUsuarioNombre').value;
  const correo = document.getElementById('nuevoUsuarioClave').value;
  const codigoPanel = document.getElementById('nuevoUsuarioCodigoPanel').value;
  const codigo = document.getElementById('codigoDesarrolladorUsuario').value;
  if (!(await verificarCodigoDesarrollador(codigo))) { return; }
  const permisos = {};
  document.querySelectorAll('.chk-permiso-nuevo').forEach(chk => { permisos[chk.value] = chk.checked; });
  const btn = document.getElementById('btnCrearUsuarioPanel');
  btn.disabled = true;
  const res = await crearUsuarioAdminPanel(uid, correo, permisos, codigoPanel);
  btn.disabled = false;
  if (!res.ok) { showToast(res.msg, true); return; }
  document.getElementById('nuevoUsuarioNombre').value = '';
  document.getElementById('nuevoUsuarioClave').value = '';
  document.getElementById('nuevoUsuarioCodigoPanel').value = '';
  document.getElementById('codigoDesarrolladorUsuario').value = '';
  document.querySelectorAll('.chk-permiso-nuevo').forEach(chk => { chk.checked = (chk.value === 'inventario' || chk.value === 'pedidos' || chk.value === 'mensajes'); });
  showToast('Usuario creado ✓ — dile a esa persona su código de acceso por fuera del panel.');
  pintarUsuariosPanel();
});

/* ---------- editar permisos de un usuario existente ---------- */
const modalPermisos = document.getElementById('modalPermisos');
let usuarioEditandoPermisos = null;
let correoEditandoPermisos = '';
document.getElementById('tablaUsuariosPanelBody').addEventListener('click', (e) => {
  const btnEditar = e.target.closest('.btn-editar-permisos');
  if (!btnEditar) return;
  usuarioEditandoPermisos = btnEditar.dataset.usuario;
  correoEditandoPermisos = btnEditar.dataset.correo || '';
  const permisosActualesUsuario = JSON.parse(btnEditar.dataset.permisos || '{}');
  document.getElementById('modalPermisosTitulo').textContent = 'Permisos de "' + (btnEditar.dataset.correo || usuarioEditandoPermisos) + '"';
  document.querySelectorAll('.chk-permiso-editar').forEach(chk => {
    chk.checked = !!permisosActualesUsuario[chk.value];
  });
  document.getElementById('nuevoCodigoPanelPermisos').value = '';
  document.getElementById('codigoDesarrolladorPermisos').value = '';
  modalPermisos.classList.add('open');
});
document.getElementById('btnCerrarModalPermisos').addEventListener('click', () => modalPermisos.classList.remove('open'));
document.getElementById('btnGuardarPermisos').addEventListener('click', async () => {
  const codigo = document.getElementById('codigoDesarrolladorPermisos').value;
  if (!(await verificarCodigoDesarrollador(codigo))) { return; }
  const nuevoCodigoPanel = document.getElementById('nuevoCodigoPanelPermisos').value.trim();
  const permisos = {};
  document.querySelectorAll('.chk-permiso-editar').forEach(chk => { permisos[chk.value] = chk.checked; });
  const btn = document.getElementById('btnGuardarPermisos');
  btn.disabled = true;
  const res = await actualizarPermisosUsuarioAdminPanel(usuarioEditandoPermisos, permisos);
  if (res.ok && nuevoCodigoPanel) {
    const resCodigo = await cambiarCodigoPanelUsuario(usuarioEditandoPermisos, correoEditandoPermisos, nuevoCodigoPanel);
    if (!resCodigo.ok) { btn.disabled = false; showToast(resCodigo.msg, true); return; }
  }
  btn.disabled = false;
  if (!res.ok) { showToast(res.msg, true); return; }
  showToast(nuevoCodigoPanel ? 'Permisos y código actualizados ✓' : 'Permisos actualizados ✓');
  modalPermisos.classList.remove('open');
  pintarUsuariosPanel();
  // si el usuario editado es quien tiene la sesión abierta ahora
  // mismo, sus pestañas se ajustan de una vez sin tener que recargar
  if (usuarioEditandoPermisos === usuarioAdminActual()) {
    permisosActuales = await obtenerPermisosUsuarioActual();
    aplicarPermisosUI();
  }
});

document.getElementById('tablaUsuariosPanelBody').addEventListener('click', async (e) => {
  const btnToggle = e.target.closest('.btn-toggle-usuario');
  const btnEliminar = e.target.closest('.btn-eliminar-usuario');
  if (btnToggle) {
    const usuario = btnToggle.dataset.usuario;
    const etiqueta = btnToggle.dataset.correo || usuario;
    const activoActual = btnToggle.dataset.activo === 'true';
    const codigo = await pedirCodigoDev(
      activoActual ? 'Desactivar usuario' : 'Activar usuario',
      `Código de desarrollador para ${activoActual ? 'desactivar' : 'activar'} a "${etiqueta}":`
    );
    if (codigo === null) return;
    if (!(await verificarCodigoDesarrollador(codigo))) { return; }
    if (activoActual && !(await confirmarAccion({
      titulo: `¿Desactivar a "${etiqueta}"?`,
      peligro: true,
      textoOk: 'Sí, desactivar',
      mensaje: 'No podrá volver a entrar al panel hasta que lo actives de nuevo. No se pierde nada de lo que ya hizo.'
    }))) return;
    btnToggle.disabled = true;
    const res = await cambiarEstadoUsuarioAdminPanel(usuario, !activoActual);
    btnToggle.disabled = false;
    if (!res.ok) { showToast(res.msg, true); return; }
    showToast(activoActual ? 'Usuario desactivado' : 'Usuario activado');
    pintarUsuariosPanel();
  } else if (btnEliminar) {
    const usuario = btnEliminar.dataset.usuario;
    const etiqueta = btnEliminar.dataset.correo || usuario;
    const codigo = await pedirCodigoDev(
      'Eliminar usuario',
      `Código de desarrollador para ELIMINAR a "${etiqueta}" (no se puede deshacer):`
    );
    if (codigo === null) return;
    if (!(await verificarCodigoDesarrollador(codigo))) { return; }
    if (!(await confirmarAccion({
      titulo: `¿Eliminar a "${etiqueta}"?`,
      peligro: true,
      textoOk: 'Sí, eliminar',
      mensaje: `No se puede deshacer. Esto le quita el acceso real a Firestore y borra su perfil/permisos del panel, pero NO borra su cuenta de Firebase Authentication (eso, si quieres, se hace aparte desde la consola de Firebase).`
    }))) return;
    btnEliminar.disabled = true;
    const res = await eliminarUsuarioAdminPanel(usuario, btnEliminar.dataset.correo);
    btnEliminar.disabled = false;
    if (!res.ok) { showToast(res.msg, true); return; }
    showToast('Usuario eliminado');
    pintarUsuariosPanel();
  }
});

/* ---------- pestaña Drop (rediseñada): configurar, guardar borrador, publicar ----------
   · Borrador y "configuración" se guardan en drop_borradores/actual (un solo documento:
     editar no duplica). Nada llega a la tienda hasta pulsar "Publicar Drop" y confirmar.
   · Publicar escribe config/drop, que es lo que lee Inicio (index.html).
   · Las fechas se interpretan en la zona horaria elegida y se guardan en ISO/UTC. */
let intervaloCountdownDrop = null;
const DP_ZONAS = [
  ['America/Bogota', 'Bogotá, Lima, Quito'], ['America/Mexico_City', 'Ciudad de México'],
  ['America/Caracas', 'Caracas'], ['America/Santiago', 'Santiago'],
  ['America/Argentina/Buenos_Aires', 'Buenos Aires'], ['America/New_York', 'Nueva York'],
  ['Europe/Madrid', 'Madrid'], ['UTC', 'UTC']
];
const dp = { cargado: false, sel: new Set(), portada: '', ocupado: false, borrador: null };
const $dp = id => document.getElementById(id);
const dpEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dpPrecio = n => '$' + (Number(n) || 0).toLocaleString('es-CO');
const dpPad = n => String(n).padStart(2, '0');

/* --- zona horaria --- */
function dpOffsetMin(tz, utcMs) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(utcMs)).forEach(x => { p[x.type] = x.value; });
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000) / 60000);
}
function dpWallToUTC(fecha, hora, tz) {
  const [y, m, d] = fecha.split('-').map(Number), [h, mi] = (hora || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - dpOffsetMin(tz, guess) * 60000;
  const o2 = dpOffsetMin(tz, t);
  t = guess - o2 * 60000;
  return t;
}
function dpUTCToWall(iso, tz) {
  const ms = new Date(iso).getTime(), o = dpOffsetMin(tz, ms), d = new Date(ms + o * 60000);
  return { fecha: `${d.getUTCFullYear()}-${dpPad(d.getUTCMonth() + 1)}-${dpPad(d.getUTCDate())}`, hora: `${dpPad(d.getUTCHours())}:${dpPad(d.getUTCMinutes())}` };
}
function dpEtiquetaZona(tz, nombre) {
  const o = dpOffsetMin(tz, Date.now()), a = Math.abs(o);
  return `(GMT${o < 0 ? '-' : '+'}${Math.floor(a / 60)}${a % 60 ? ':' + dpPad(a % 60) : ''}) ${nombre}`;
}
function dpFmtFecha(ms, tz) {
  return ms == null ? '—' : new Date(ms).toLocaleString('es-CO', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* --- formulario <-> datos --- */
function dpLeer() {
  const tz = $dp('dpZona').value || 'America/Bogota';
  const fi = $dp('dpFechaIni').value, ff = $dp('dpFechaFin').value;
  return {
    titulo: $dp('dpTitulo').value.trim(),
    descripcion: $dp('dpDescripcion').value.trim(),
    portada: dp.portada || '',
    zona: tz,
    iniMs: fi ? dpWallToUTC(fi, $dp('dpHoraIni').value || '00:00', tz) : null,
    finMs: ff ? dpWallToUTC(ff, $dp('dpHoraFin').value || '23:59', tz) : null,
    productos: obtenerProductosAdmin().filter(p => dp.sel.has(String(p.id))).map(p => p.id)
  };
}
function dpADoc(f, estado) {
  return {
    titulo: f.titulo, descripcion: f.descripcion, portada: f.portada, zona: f.zona,
    fecha: f.iniMs != null ? new Date(f.iniMs).toISOString() : null,
    fechaFin: f.finMs != null ? new Date(f.finMs).toISOString() : null,
    productos: f.productos, estado
  };
}
function dpPoblar(d) {
  d = d || {};
  const tz = d.zona || 'America/Bogota';
  $dp('dpZona').value = DP_ZONAS.some(z => z[0] === tz) ? tz : 'America/Bogota';
  $dp('dpTitulo').value = d.titulo || '';
  $dp('dpDescripcion').value = d.descripcion || '';
  dp.portada = d.portada || '';
  const i = d.fecha ? dpUTCToWall(d.fecha, $dp('dpZona').value) : { fecha: '', hora: '' };
  const f = d.fechaFin ? dpUTCToWall(d.fechaFin, $dp('dpZona').value) : { fecha: '', hora: '' };
  $dp('dpFechaIni').value = i.fecha; $dp('dpHoraIni').value = i.hora;
  $dp('dpFechaFin').value = f.fecha; $dp('dpHoraFin').value = f.hora;
  dp.sel = new Set((d.productos || []).map(String));
}
function dpValidar(f, estricto, publicando) {
  if (f.iniMs != null && f.finMs != null && f.finMs <= f.iniMs) return 'La fecha de fin debe ser posterior a la de inicio.';
  if (estricto) {
    if (!f.titulo) return 'Escribe el título del lanzamiento.';
    if (f.iniMs == null) return 'Elige la fecha y hora de inicio.';
    if (!f.productos.length) return 'Selecciona al menos un producto.';
  }
  if (publicando && f.finMs != null && f.finMs <= Date.now()) return 'La fecha de finalización ya pasó.';
  return null;
}

/* --- estado --- */
function dpPublicado() {
  const c = getConfigDrop();
  return (c && c.fecha && c.publicado !== false) ? c : null;
}
function dpNorm(o) {
  return JSON.stringify([o.titulo || '', o.descripcion || '', o.portada || '', o.fecha || null, o.fechaFin || null, (o.productos || []).map(String).sort()]);
}
function dpEstado(f) {
  const pub = dpPublicado(), ahora = Date.now();
  if (pub && dpNorm(dpADoc(f)) === dpNorm(pub)) {
    const ini = new Date(pub.fecha).getTime(), fin = pub.fechaFin ? new Date(pub.fechaFin).getTime() : null;
    if (fin != null && fin <= ahora) return ['finalizado', 'Finalizado'];
    if (ini <= ahora) return ['publicado', 'En vivo'];
    return ['publicado', 'Publicado · programado'];
  }
  if (dp.borrador && dp.borrador.estado === 'programado') return ['programado', 'Programado (sin publicar)'];
  return ['borrador', pub ? 'Cambios sin publicar' : 'Borrador'];
}

/* --- cuenta regresiva (resumen + vista previa) --- */
function dpCuenta(f) {
  const ahora = Date.now();
  if (f.iniMs == null) return { fase: 'teaser', lbl: 'Cuenta regresiva', ms: null };
  if (f.iniMs > ahora) return { fase: 'teaser', lbl: 'Cuenta regresiva', ms: f.iniMs - ahora };
  if (f.finMs != null && f.finMs <= ahora) return { fase: 'terminado', lbl: 'Drop finalizado', ms: 0 };
  if (f.finMs != null) return { fase: 'live', lbl: 'Termina en', ms: f.finMs - ahora };
  return { fase: 'live', lbl: 'Drop en vivo', ms: 0 };
}
function dpPartes(ms) {
  if (ms == null) return ['--', '--', '--', '--'];
  const d = Math.max(0, ms);
  return [Math.floor(d / 864e5), Math.floor(d % 864e5 / 36e5), Math.floor(d % 36e5 / 6e4), Math.floor(d % 6e4 / 1e3)].map(dpPad);
}
function dpFotoProd(p) {
  const c0 = p.colores && p.colores[0];
  return (p.fotos && c0 && p.fotos[c0]) || p.foto || (p.fotos && Object.values(p.fotos)[0]) || null;
}

/* --- pintado --- */
function dpPintarResumen() {
  const f = dpLeer(), cu = dpCuenta(f), [est, estTxt] = dpEstado(f), p = dpPartes(cu.ms);
  const totalCat = obtenerProductosAdmin().filter(x => x.activo).length;
  $dp('dpResTitulo').textContent = f.titulo || 'Sin título';
  const chip = $dp('dpResChip'); chip.textContent = estTxt; chip.dataset.e = est;
  $dp('dpResIni').textContent = dpFmtFecha(f.iniMs, f.zona);
  $dp('dpResFin').textContent = dpFmtFecha(f.finMs, f.zona);
  $dp('dpResSel').innerHTML = `${f.productos.length} <em>/ ${totalCat}</em>`;
  $dp('dpResCdLbl').textContent = cu.lbl;
  ['D', 'H', 'M', 'S'].forEach((k, i) => { $dp('dpCd' + k).textContent = p[i]; });
  const cov = f.portada ? `<img src="${dpEsc(f.portada)}" alt="">` : 'Sin portada';
  if ($dp('dpResCover').dataset.k !== (f.portada || '-').slice(-30) + f.portada.length) {
    $dp('dpResCover').innerHTML = cov; $dp('dpResCover').dataset.k = (f.portada || '-').slice(-30) + f.portada.length;
    $dp('dpPortadaThumb').innerHTML = f.portada ? `<img src="${dpEsc(f.portada)}" alt="">` : 'Sin imagen';
    $dp('dpPortadaQuitar').hidden = !f.portada;
  }
  dpPintarPreview(f, cu, p);
}
function dpPintarPreview(f, cu, p) {
  const prods = obtenerProductosAdmin().filter(x => dp.sel.has(String(x.id)));
  const fotos = prods.map(dpFotoProd).filter(Boolean).slice(0, 4);
  const portada = f.portada || fotos[0] || '';
  const pill = cu.fase === 'teaser' ? 'Próximo drop' : cu.fase === 'live' ? 'Ya disponible' : 'Drop finalizado';
  const key = [pill, f.titulo, f.descripcion, portada.length + portada.slice(-20), fotos.map(x => x.length + x.slice(-12)).join('|'), cu.fase].join('~');
  const box = $dp('dpPreview');
  if (box.dataset.k !== key) {
    box.dataset.k = key;
    box.innerHTML = `
      <div class="dp-ph-top"><span>⚡ MA<em>QUINA</em></span><span>☰</span></div>
      <div class="dp-ph-hero" data-e="${cu.fase}">
        ${portada ? `<img src="${dpEsc(portada)}" alt="">` : ''}
        <span class="dp-ph-pill">${pill}</span>
        <h4>${dpEsc(f.titulo || 'Título del drop')}</h4>
        ${f.descripcion ? `<p>${dpEsc(f.descripcion)}</p>` : ''}
        <div class="dp-ph-cd"><div><b data-pc="0">--</b><span>Días</span></div><div><b data-pc="1">--</b><span>Horas</span></div><div><b data-pc="2">--</b><span>Min</span></div><div><b data-pc="3">--</b><span>Seg</span></div></div>
        <span class="dp-ph-btn">Ver productos</span>
      </div>
      <div class="dp-ph-thumbs" data-e="${cu.fase}">${fotos.map(x => `<div><img src="${dpEsc(x)}" alt=""></div>`).join('')}</div>
      <div class="dp-ph-foot">⚡ Exclusivo en MAQUINA</div>`;
  }
  box.querySelectorAll('[data-pc]').forEach(el => { el.textContent = p[+el.dataset.pc]; });
}
function dpPintarProductos() {
  const q = $dp('dpBuscar').value.trim().toLowerCase(), cat = $dp('dpFiltroCat').value, talla = $dp('dpFiltroTalla').value;
  const todos = obtenerProductosAdmin().filter(p => p.activo);
  // opciones de filtros (se conservan las elegidas)
  const cats = [...new Set(todos.map(p => p.categoria).filter(Boolean))].sort();
  const tallas = [...new Set(todos.flatMap(p => p.tallas || []))];
  const opt = (sel, vals, vacio) => { const act = sel.value; sel.innerHTML = `<option value="">${vacio}</option>` + vals.map(v => `<option value="${dpEsc(v)}">${dpEsc(v)}</option>`).join(''); sel.value = vals.includes(act) ? act : ''; };
  opt($dp('dpFiltroCat'), cats, 'Todas las categorías'); opt($dp('dpFiltroTalla'), tallas, 'Todas las tallas');
  const lista = todos.filter(p => (!q || (p.nombre || '').toLowerCase().includes(q)) && (!$dp('dpFiltroCat').value || p.categoria === $dp('dpFiltroCat').value) && (!$dp('dpFiltroTalla').value || (p.tallas || []).includes($dp('dpFiltroTalla').value)));
  dp.visibles = lista;
  $dp('dpProductos').innerHTML = lista.map(p => {
    const foto = dpFotoProd(p), sel = dp.sel.has(String(p.id)), c0 = (p.colores || [])[0];
    const ts = (p.tallas || []).map(t => `<i class="${stockTalla(p, t) <= 0 ? 'is-0' : ''}">${dpEsc(t)}</i>`).join('');
    return `<div class="dd-prod${sel ? ' is-sel' : ''}" data-id="${dpEsc(p.id)}" role="checkbox" aria-checked="${sel}" tabindex="0">
      <span class="dp-chk">✓</span>
      <div class="dd-prod-img">${foto ? `<img src="${dpEsc(foto)}" alt="" loading="lazy">` : iconoProducto(p.icono, c0)}</div>
      <div class="dd-prod-info"><b>${dpEsc(p.nombre)}</b><span>${dpEsc(p.categoria || '')}</span><strong>${dpPrecio(p.precio)}</strong><small>Stock: ${stockTotalProducto(p)}</small><div class="dp-tallas">${ts}</div></div></div>`;
  }).join('') || '<p class="dp-vacio">No hay productos que coincidan.</p>';
  dpContador();
}
function dpContador() {
  const n = dp.sel.size;
  $dp('dpProdContador').textContent = `${n} producto${n === 1 ? '' : 's'} seleccionado${n === 1 ? '' : 's'}`;
}
function dpRefrescar() { dpContador(); dpPintarResumen(); }

async function pintarTabDrop() {
  // zonas (la etiqueta lleva el GMT actual de cada una)
  if (!$dp('dpZona').options.length) $dp('dpZona').innerHTML = DP_ZONAS.map(([v, n]) => `<option value="${v}">${dpEsc(dpEtiquetaZona(v, n))}</option>`).join('');
  if (!dp.cargado) {
    try { dp.borrador = await cargarBorradorDrop(); }
    catch (e) { console.error(e); dp.borrador = null; showToast('No se pudo leer el borrador (¿publicaste las reglas de Firestore nuevas?). Puedes seguir editando.', true); }
    const base = dp.borrador || dpPublicado();
    dpPoblar(base);
    $dp('dpTituloN').textContent = `${$dp('dpTitulo').value.length}/60`;
    $dp('dpDescN').textContent = `${$dp('dpDescripcion').value.length}/300`;
    dp.cargado = true;
  }
  dpPintarProductos();
  dpPintarResumen();
  clearInterval(intervaloCountdownDrop);
  intervaloCountdownDrop = setInterval(dpPintarResumen, 1000);
}

/* --- eventos --- */
['dpTitulo', 'dpDescripcion'].forEach(id => $dp(id).addEventListener('input', () => {
  $dp(id === 'dpTitulo' ? 'dpTituloN' : 'dpDescN').textContent = `${$dp(id).value.length}/${id === 'dpTitulo' ? 60 : 300}`;
  dpPintarResumen();
}));
['dpFechaIni', 'dpHoraIni', 'dpFechaFin', 'dpHoraFin'].forEach(id => $dp(id).addEventListener('input', dpPintarResumen));
$dp('dpZona').addEventListener('change', () => {
  // mantiene la misma hora de reloj pero en la nueva zona
  dpPintarResumen();
});
['dpBuscar', 'dpFiltroCat', 'dpFiltroTalla'].forEach(id => $dp(id).addEventListener('input', dpPintarProductos));
function dpToggle(card) {
  const id = String(card.dataset.id);
  dp.sel.has(id) ? dp.sel.delete(id) : dp.sel.add(id);
  const on = dp.sel.has(id);
  card.classList.toggle('is-sel', on); card.setAttribute('aria-checked', on);
  dpRefrescar();
}
$dp('dpProductos').addEventListener('click', e => { const c = e.target.closest('.dd-prod'); if (c) dpToggle(c); });
$dp('dpProductos').addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && e.target.classList.contains('dd-prod')) { e.preventDefault(); dpToggle(e.target); } });
$dp('dpSelVisibles').addEventListener('click', () => { (dp.visibles || []).forEach(p => dp.sel.add(String(p.id))); dpPintarProductos(); dpPintarResumen(); });
$dp('dpSelLimpiar').addEventListener('click', () => { dp.sel.clear(); dpPintarProductos(); dpPintarResumen(); });

async function dpUsarPortada(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png)$/.test(file.type)) { showToast('La portada debe ser JPG o PNG.', true); return; }
  if (file.size > 2 * 1024 * 1024) { showToast('La portada pesa más de 2MB.', true); return; }
  try { dp.portada = await comprimirImagen(file, 1100, 0.72); dpPintarResumen(); showToast('Portada lista — se guarda con el drop ✓'); }
  catch (err) { showToast('No se pudo usar esa imagen.', true); }
}
$dp('dpPortadaFile').addEventListener('change', e => { dpUsarPortada(e.target.files[0]); e.target.value = ''; });
['dragover', 'dragenter'].forEach(ev => $dp('dpPortadaDrop').addEventListener(ev, e => { e.preventDefault(); $dp('dpPortadaDrop').classList.add('is-over'); }));
['dragleave', 'drop'].forEach(ev => $dp('dpPortadaDrop').addEventListener(ev, e => { e.preventDefault(); $dp('dpPortadaDrop').classList.remove('is-over'); if (ev === 'drop') dpUsarPortada(e.dataTransfer.files[0]); }));
$dp('dpPortadaQuitar').addEventListener('click', () => { dp.portada = ''; dpPintarResumen(); });
$dp('btnDropVista').addEventListener('click', () => {
  const b = $dp('dpPreviewBox'); b.scrollIntoView({ behavior: 'smooth', block: 'center' });
  b.classList.remove('is-flash'); void b.offsetWidth; b.classList.add('is-flash');
});

function dpOcupar(si) { dp.ocupado = si; ['btnDropBorrador', 'btnDropGuardar', 'btnDropPublicar', 'btnDropConfirmar'].forEach(id => { $dp(id).disabled = si; }); }
async function dpGuardar(estado) {
  if (dp.ocupado) return;
  const f = dpLeer(), err = dpValidar(f, estado === 'programado', false);
  if (err) { showToast(err, true); return; }
  dpOcupar(true);
  try {
    dp.borrador = await guardarBorradorDropAdmin(dpADoc(f, estado));
    showToast(estado === 'programado' ? 'Configuración guardada ✓ (aún sin publicar)' : 'Borrador guardado ✓');
  } catch (e) { console.error(e); showToast('No se pudo guardar. Revisa tu conexión y las reglas de Firestore.', true); }
  dpOcupar(false); dpPintarResumen();
}
$dp('btnDropBorrador').addEventListener('click', () => dpGuardar('borrador'));
$dp('btnDropGuardar').addEventListener('click', () => dpGuardar('programado'));

const modalPublicarDrop = $dp('modalPublicarDrop');
$dp('btnDropPublicar').addEventListener('click', () => {
  if (dp.ocupado) return;
  const f = dpLeer(), err = dpValidar(f, true, true);
  if (err) { showToast(err, true); return; }
  $dp('dpPubResumen').innerHTML = `<li><b>${dpEsc(f.titulo)}</b></li><li>Inicio: <b>${dpFmtFecha(f.iniMs, f.zona)}</b></li><li>Fin: <b>${dpFmtFecha(f.finMs, f.zona)}</b></li><li>Productos: <b>${f.productos.length}</b></li>`;
  $dp('dpPubAviso').textContent = f.iniMs <= Date.now()
    ? 'La fecha de inicio ya llegó: el drop quedará en vivo en Inicio apenas lo publiques.'
    : 'Aparecerá en Inicio con las prendas borrosas y se revelará solo al llegar la fecha de inicio.';
  modalPublicarDrop.classList.add('open');
});
$dp('btnDropCancelar').addEventListener('click', () => modalPublicarDrop.classList.remove('open'));
$dp('btnDropConfirmar').addEventListener('click', async () => {
  if (dp.ocupado) return;
  const f = dpLeer(), err = dpValidar(f, true, true);
  if (err) { modalPublicarDrop.classList.remove('open'); showToast(err, true); return; }
  dpOcupar(true);
  try {
    await publicarDropAdmin(dpADoc(f, 'publicado'));
    dp.borrador = { estado: 'publicado' };
    modalPublicarDrop.classList.remove('open');
    showToast('Drop publicado ✓ Ya se ve en Inicio');
  } catch (e) { console.error(e); showToast('No se pudo publicar. Revisa tu sesión y conexión.', true); }
  dpOcupar(false); dpPintarResumen();
});

/* ---------- tabla de pedidos (vienen de Firestore, en la nube) ----------
   pedidosCache guarda la última lectura de Firestore para que los
   filtros (buscador, estado, fechas) se apliquen al instante sin
   tener que volver a pedirle los datos a la nube cada vez que el
   admin escribe algo. Solo se vuelve a pedir cuando de verdad hace
   falta (al entrar a la pestaña, o después de borrar/cambiar algo). */
let pedidosCache = [];
let pedidosFiltradosActuales = []; // último resultado de aplicarFiltrosPedidos (SIN paginar), lo usa "Exportar CSV"
let ordenPedidos = { campo: null, dir: 1 }; // orden al hacer clic en un encabezado de la tabla
let numerosPedidoCache = new Map(); // id de Firestore -> número corto ("Pedido #3"), estable aunque se filtre/ordene
const PEDIDOS_POR_PAGINA = 15;
let paginaPedidos = 1;

/* ---------- ayudas de presentación para la tabla y el detalle de pedidos ----------
   Solo dan formato a datos que ya existen en Firestore; no cambian nada guardado.
   escaparHtml: los datos del cliente se escriben a mano en el checkout, así que
   antes de pintarlos con innerHTML se escapan (evita que un nombre con "<" rompa
   o inyecte código en el panel). */
function escaparHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fechaPartesPedido(p) {
  const d = p && p.fecha ? new Date(p.fecha) : null;
  if (!d || isNaN(d.getTime())) return { dia: '—', hora: '' };
  return {
    dia: d.toLocaleDateString('es-CO', { dateStyle: 'medium' }),
    hora: d.toLocaleTimeString('es-CO', { timeStyle: 'short' }),
  };
}
function formatoTelefonoPedido(t) {
  const d = String(t || '').replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : String(t || '');
}
function enlaceTelefonoPedido(t) {
  const d = String(t || '').replace(/\D/g, '');
  if (!d) return '<span class="ped-sub">—</span>';
  const texto = escaparHtml(formatoTelefonoPedido(t));
  return d.length >= 7 && d.length <= 10 ? `<a class="ped-tel mono" href="tel:+57${d}">${texto}</a>` : `<span class="mono">${texto}</span>`;
}
function dineroPedido(n) { return '$' + (Number(n) || 0).toLocaleString('es-CO'); }

/* Pedidos cuyo cambio de estado se está guardando ahora mismo: evita doble clic / solicitudes repetidas. */
const cambiosEstadoEnCurso = new Set();

async function pintarPedidos() {
  const tbody = document.getElementById('tablaPedidosBody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--gray);">Cargando pedidos…</td></tr>`;
  pedidosCache = await obtenerPedidosAdmin();
  numerosPedidoCache = mapaNumerosPedido(pedidosCache);
  document.getElementById('pedidosBadge').textContent = pedidosCache.length ? `(${pedidosCache.length})` : '';
  paginaPedidos = 1;
  aplicarFiltrosPedidos();
}

function valorOrdenPedido(p, campo) {
  if (campo === 'fecha') return p.fecha ? new Date(p.fecha).getTime() : 0;
  if (campo === 'cliente') return (p.nombre_cliente || '').toLowerCase();
  if (campo === 'total') return Number(p.total) || 0;
  return 0;
}
function aplicarOrdenPedidos(lista) {
  if (!ordenPedidos.campo) return lista;
  return [...lista].sort((a, b) => {
    const va = valorOrdenPedido(a, ordenPedidos.campo);
    const vb = valorOrdenPedido(b, ordenPedidos.campo);
    if (va < vb) return -1 * ordenPedidos.dir;
    if (va > vb) return 1 * ordenPedidos.dir;
    return 0;
  });
}
/** Pone la flechita (▲/▼) solo en el encabezado por el que se está
    ordenando ahora mismo; el resto se queda sin flecha. */
function actualizarFlechasOrdenPedidos() {
  document.querySelectorAll('#tablaPedidos thead .th-ordenable').forEach(th => {
    th.classList.remove('orden-asc', 'orden-desc');
    if (th.dataset.campo === ordenPedidos.campo) th.classList.add(ordenPedidos.dir === 1 ? 'orden-asc' : 'orden-desc');
  });
}
document.querySelector('#tablaPedidos thead').addEventListener('click', (e) => {
  const th = e.target.closest('.th-ordenable');
  if (!th) return;
  const campo = th.dataset.campo;
  if (ordenPedidos.campo === campo) ordenPedidos.dir *= -1;
  else { ordenPedidos.campo = campo; ordenPedidos.dir = 1; }
  actualizarFlechasOrdenPedidos();
  paginaPedidos = 1;
  aplicarFiltrosPedidos();
});

/** Filtra pedidosCache según lo que haya en el buscador, el select
    de estado y las fechas, lo ordena según ordenPedidos, y vuelve
    a pintar la tabla y las estadísticas con ese subconjunto. */
function aplicarFiltrosPedidos() {
  const texto = document.getElementById('buscarPedidoAdmin').value.trim().toLowerCase();
  const estadoElegido = document.getElementById('filtroEstadoPedido').value;
  const desde = document.getElementById('filtroFechaDesde').value;
  const hasta = document.getElementById('filtroFechaHasta').value;

  let pedidos = pedidosCache.filter(p => {
    if (texto) {
      // "3" o "#3" busca el pedido número 3 (o un nombre que lo contenga); cualquier otro texto
      // busca en nombre, correo, teléfono y productos, como antes.
      const q = texto.replace(/^#/, '');
      if (/^\d{1,4}$/.test(q)) {
        const coincideNumero = numerosPedidoCache.get(p.id) === Number(q);
        const coincideNombre = (p.nombre_cliente || '').toLowerCase().includes(texto);
        if (!coincideNumero && !coincideNombre) return false;
      } else {
        const bolsa = `${p.nombre_cliente || ''} ${p.email_cliente || ''} ${p.telefono_cliente || ''} ${p.detalle || ''}`.toLowerCase();
        if (!bolsa.includes(texto)) return false;
      }
    }
    if (estadoElegido && estadoPedido(p) !== estadoElegido) return false;
    if (p.fecha) {
      const fechaPedido = p.fecha.slice(0, 10); // YYYY-MM-DD
      if (desde && fechaPedido < desde) return false;
      if (hasta && fechaPedido > hasta) return false;
    }
    return true;
  });
  pedidos = aplicarOrdenPedidos(pedidos);
  pedidosFiltradosActuales = pedidos; // lista completa filtrada (sin paginar) — la usa el CSV

  const tbody = document.getElementById('tablaPedidosBody');
  const totalVendido = pedidos.filter(p => estadoPedido(p) !== 'cancelado').reduce((s, p) => s + (Number(p.total) || 0), 0); // los cancelados no cuentan como venta
  const pendientesFiltrados = pedidos.filter(p => estadoPedido(p) === 'pendiente').length;
  document.getElementById('pedidosStats').innerHTML = `
    <div class="admin-stat admin-stat-forest"><b>${pedidos.length}</b><span>Pedidos</span></div>
    <div class="admin-stat admin-stat-acento"><b>$${totalVendido.toLocaleString('es-CO')}</b><span>Total vendido</span></div>
    <div class="admin-stat admin-stat-butter"><b>${pendientesFiltrados}</b><span>Pendientes</span></div>
  `;

  if (!pedidosCache.length && typeof errorLecturaPedidos !== 'undefined' && errorLecturaPedidos) {
    // No es que no haya pedidos: la lectura falló. Se dice la causa en vez de mostrar una lista vacía.
    const cod = escaparHtml(errorLecturaPedidos.code || errorLecturaPedidos.message || 'desconocido');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--gray);">⚠️ No se pudieron cargar los pedidos (${cod}). Revisa tu conexión o tus permisos y recarga la página. Tus pedidos NO se borraron.</td></tr>`;
    document.getElementById('paginacionPedidos').innerHTML = '';
    return;
  }
  if (!pedidosCache.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--gray);">Todavía no hay pedidos.</td></tr>`;
    document.getElementById('paginacionPedidos').innerHTML = '';
    return;
  }
  if (!pedidos.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--gray);">Ningún pedido coincide con el filtro.</td></tr>`;
    document.getElementById('paginacionPedidos').innerHTML = '';
    return;
  }

  // ---- paginación: solo se pinta la página actual, pero stats/CSV arriba usan la lista completa ----
  const totalPaginas = Math.max(1, Math.ceil(pedidos.length / PEDIDOS_POR_PAGINA));
  if (paginaPedidos > totalPaginas) paginaPedidos = totalPaginas;
  const inicio = (paginaPedidos - 1) * PEDIDOS_POR_PAGINA;
  const pedidosPagina = pedidos.slice(inicio, inicio + PEDIDOS_POR_PAGINA);

  tbody.innerHTML = pedidosPagina.map(p => {
    const { dia, hora } = fechaPartesPedido(p);
    const estadoActual = estadoPedido(p);
    const numero = numerosPedidoCache.get(p.id) || '—';
    const idSeguro = escaparHtml(p.id);
    const cantidadPrendas = Array.isArray(p.items) ? p.items.length : 0;
    const opcionesEstado = Object.entries(ESTADOS_PEDIDO).map(([valor, info]) =>
      `<option value="${valor}" ${valor === estadoActual ? 'selected' : ''}>${info.emoji} ${info.label}</option>`).join('');
    return `
      <tr data-id="${idSeguro}" title="Clic para ver los detalles">
        <td data-label="N°"><span class="pedido-numero mono" title="ID interno: ${idSeguro}">#${numero}</span></td>
        <td data-label="Fecha"><span class="ped-fecha-dia">${escaparHtml(dia)}</span>${hora ? `<span class="ped-sub mono">${escaparHtml(hora)}</span>` : ''}</td>
        <td data-label="Cliente"><b class="ped-cliente">${escaparHtml(p.nombre_cliente) || '—'}</b>${cantidadPrendas ? `<span class="ped-sub">${cantidadPrendas} prenda${cantidadPrendas === 1 ? '' : 's'}</span>` : ''}</td>
        <td data-label="Teléfono">${enlaceTelefonoPedido(p.telefono_cliente)}</td>
        <td data-label="Total" class="mono ped-total"><b>${dineroPedido(p.total)}</b></td>
        <td data-label="Estado"><select class="admin-input select-estado-pedido estado-select-${estadoActual}" data-id="${idSeguro}" aria-label="Estado del pedido #${numero}" ${cambiosEstadoEnCurso.has(p.id) ? 'disabled aria-busy="true"' : ''}>${opcionesEstado}</select></td>
        <td data-label="" class="ped-acciones">
          <button type="button" class="admin-btn admin-btn-ghost btn-ver-detalle" data-id="${idSeguro}">Ver detalles</button>
          ${permisosActuales.eliminarPedidos ? `<button type="button" class="admin-btn admin-btn-ghost btn-borrar-pedido" data-id="${idSeguro}">Eliminar</button>` : ''}
        </td>
      </tr>`;
  }).join('');

  pintarPaginacion(document.getElementById('paginacionPedidos'), paginaPedidos, totalPaginas, pedidos.length, (nuevaPagina) => {
    paginaPedidos = nuevaPagina;
    aplicarFiltrosPedidos();
  });
}

/** Dibuja los controles "‹ Anterior · Página X de Y · Siguiente ›"
    dentro del contenedor que se le pase, y conecta los botones a la
    función onCambiarPagina(nuevaPagina). Se usa para Pedidos e
    Inventario, así no hay que repetir la lógica dos veces. Si solo
    hay una página, no muestra nada (no tiene sentido paginar 3 filas). */
function pintarPaginacion(contenedor, paginaActual, totalPaginas, totalItems, onCambiarPagina) {
  if (!contenedor) return;
  if (totalPaginas <= 1) { contenedor.innerHTML = ''; return; }
  contenedor.innerHTML = `
    <button type="button" class="admin-btn admin-btn-ghost admin-btn-xs btn-pag-prev" ${paginaActual <= 1 ? 'disabled' : ''}>‹ Anterior</button>
    <span class="admin-pagination-info">Página <b>${paginaActual}</b> de <b>${totalPaginas}</b> <span class="admin-pagination-total">(${totalItems} en total)</span></span>
    <button type="button" class="admin-btn admin-btn-ghost admin-btn-xs btn-pag-next" ${paginaActual >= totalPaginas ? 'disabled' : ''}>Siguiente ›</button>
  `;
  contenedor.querySelector('.btn-pag-prev').addEventListener('click', () => { if (paginaActual > 1) onCambiarPagina(paginaActual - 1); });
  contenedor.querySelector('.btn-pag-next').addEventListener('click', () => { if (paginaActual < totalPaginas) onCambiarPagina(paginaActual + 1); });
}

['buscarPedidoAdmin', 'filtroEstadoPedido', 'filtroFechaDesde', 'filtroFechaHasta'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => { paginaPedidos = 1; aplicarFiltrosPedidos(); });
});
document.getElementById('btnLimpiarFiltrosPedidos').addEventListener('click', () => {
  document.getElementById('buscarPedidoAdmin').value = '';
  document.getElementById('filtroEstadoPedido').value = '';
  document.getElementById('filtroFechaDesde').value = '';
  document.getElementById('filtroFechaHasta').value = '';
  paginaPedidos = 1;
  aplicarFiltrosPedidos();
});

/* ---------- exportar a CSV lo que esté filtrado en pantalla ---------- */
document.getElementById('btnExportarPedidosCSV').addEventListener('click', () => {
  if (!pedidosFiltradosActuales.length) { showToast('No hay pedidos para exportar.', true); return; }
  const encabezados = ['N°', 'Fecha', 'Cliente', 'Email', 'Teléfono', 'Productos', 'Envío', 'Pago', 'Total', 'Estado'];
  const filas = pedidosFiltradosActuales.map(p => {
    const fecha = p.fecha ? new Date(p.fecha).toLocaleString('es-CO') : '';
    const envioTexto = [p.envio_direccion, p.envio_barrio, p.envio_municipio].filter(Boolean).join(', ');
    const pago = etiquetaMetodoPago(p);
    const numero = numerosPedidoCache.get(p.id) || '';
    return [`#${numero}`, fecha, p.nombre_cliente || '', p.email_cliente || '', p.telefono_cliente || '', p.detalle || '', envioTexto, pago, Number(p.total) || 0, ESTADOS_PEDIDO[estadoPedido(p)].label];
  });
  const csv = [encabezados, ...filas]
    .map(fila => fila.map(celda => `"${String(celda).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // \uFEFF: para que Excel muestre bien las tildes
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pedidos_maquina_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`${pedidosFiltradosActuales.length} pedido(s) exportado(s) ✓`);
});

/* ---------- ver los detalles de un pedido (botón "Ver detalles" o clic en la fila) ----------
   Solo LEE el pedido que ya está en pedidosCache (datos reales de Firestore);
   no guarda ni cambia nada. */
const modalDetallePedido = document.getElementById('modalDetallePedido');
const ETIQUETAS_ESTADO_PAGO = { pendiente: 'Pendiente de cobro', por_verificar: 'Por verificar', pagado: 'Pagado' };

/* Valor en pesos SOLO si el pedido lo trae guardado; si no, un guion (nunca un $0 inventado). */
function dineroDetalle(v) {
  return (v === null || v === undefined || v === '' || isNaN(Number(v))) ? '—' : dineroPedido(v);
}

/* Cada valor llega YA escapado (HTML seguro). Se omiten las filas sin dato. */
function filasDetalle(pares) {
  const filas = pares.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  return filas.length
    ? `<dl class="pd-grid">${filas.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`
    : '<p class="admin-foto-hint">Sin datos registrados.</p>';
}

/* Casillas de resumen (etiqueta + valor) del encabezado del detalle. */
function fichasDetalle(pares) {
  return pares
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `<div class="dp-ficha"><span class="dp-ficha-k">${k}</span><span class="dp-ficha-v">${v}</span></div>`)
    .join('');
}

const COLOR_HEX_DETALLE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
function chipColorDetalle(color) {
  const c = String(color == null ? '' : color).trim();
  if (!c) return '';
  const muestra = COLOR_HEX_DETALLE.test(c) ? `<i class="dp-muestra" style="background:${c}"></i>` : '';
  return `<span class="pd-chip">${muestra}${escaparHtml(COLOR_HEX_DETALLE.test(c) ? c.toUpperCase() : c)}</span>`;
}

/* Cada prenda del carrito se guarda como una línea (1 unidad). Las líneas idénticas
   (mismo producto, talla, color y precio) se muestran juntas con "×N"; N es solo el
   conteo de líneas guardadas, no un dato nuevo. */
function agruparItemsDetalle(items) {
  const grupos = [];
  const porClave = new Map();
  items.forEach(it => {
    if (!it || typeof it !== 'object') return;
    const clave = [it.id ?? it.nombre, it.talla, it.color, it.precio].join('|');
    if (porClave.has(clave)) { porClave.get(clave).cantidad++; return; }
    const g = { item: it, cantidad: 1 };
    porClave.set(clave, g);
    grupos.push(g);
  });
  return grupos;
}

function filaProductoDetalle({ item: it, cantidad }) {
  const foto = String(it.foto || '').trim();
  const fotoOk = foto && !/^\s*(javascript|vbscript):/i.test(foto);
  const imagen = fotoOk
    ? `<img class="dp-foto-img" src="${escaparHtml(foto)}" alt="${escaparHtml(it.nombre || 'Producto')}" loading="lazy">`
    : '';
  const chips = [
    it.talla ? `<span class="pd-chip">Talla ${escaparHtml(it.talla)}</span>` : '',
    chipColorDetalle(it.color),
    `<span class="pd-chip pd-chip-cant">×${cantidad}</span>`,
  ].join('');
  const tienePrecio = it.precio !== null && it.precio !== undefined && it.precio !== '' && !isNaN(Number(it.precio));
  const precio = tienePrecio
    ? `<span class="dp-prod-precio mono">${dineroPedido(Number(it.precio) * cantidad)}</span>${cantidad > 1 ? `<span class="dp-prod-unit mono">${dineroPedido(it.precio)} c/u</span>` : ''}`
    : '<span class="dp-prod-precio mono">—</span>';
  return `
    <li class="dp-prod">
      <div class="dp-foto${imagen ? '' : ' dp-foto-vacia'}">${imagen}</div>
      <div class="dp-prod-info"><b class="dp-prod-nombre">${escaparHtml(it.nombre) || 'Producto'}</b><div class="dp-chips">${chips}</div></div>
      <div class="dp-prod-total">${precio}</div>
    </li>`;
}

function abrirDetallePedido(id) {
  const p = pedidosCache.find(x => x.id === id);
  if (!p) return;
  const numero = numerosPedidoCache.get(id);
  const estado = estadoPedido(p);
  const infoEstado = ESTADOS_PEDIDO[estado];
  const d = p.fecha ? new Date(p.fecha) : null;
  const fechaValida = d && !isNaN(d.getTime());
  const items = Array.isArray(p.items) ? p.items.filter(it => it && typeof it === 'object') : [];

  document.getElementById('detallePedidoTitulo').textContent = numero ? `Pedido #${numero}` : 'Detalle del pedido';
  document.getElementById('detallePedidoFecha').textContent = fechaValida ? d.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }) : '';
  document.getElementById('detallePedidoEstado').innerHTML = `<span class="pedido-estado-pill estado-pill-${estado}">${infoEstado.emoji} ${infoEstado.label}</span>`;

  /* ---- información del pedido (solo campos que existen en este pedido) ---- */
  const estadoPagoClase = p.estado_pago === 'pagado' ? 'ok' : (p.estado_pago === 'por_verificar' ? 'aviso' : '');
  const fichas = fichasDetalle([
    ['Método de pago', p.metodo_pago ? escaparHtml(etiquetaMetodoPago(p)) : ''],
    ['Estado del pago', p.estado_pago ? `<span class="dp-pago ${estadoPagoClase}">${escaparHtml(ETIQUETAS_ESTADO_PAGO[p.estado_pago] || p.estado_pago)}</span>` : ''],
    ['Prendas', items.length ? String(items.length) : ''],
    ['ID interno', `<span class="mono dp-id">${escaparHtml(p.id)}</span>`],
  ]);

  /* ---- cliente y entrega ---- */
  const correo = p.email_cliente ? `<a class="ped-tel" href="mailto:${escaparHtml(p.email_cliente)}">${escaparHtml(p.email_cliente)}</a>` : '';
  const telefono = p.telefono_cliente ? enlaceTelefonoPedido(p.telefono_cliente) : '';
  const seccionCliente = filasDetalle([['Nombre', escaparHtml(p.nombre_cliente)], ['Teléfono', telefono], ['Correo', correo]]);

  const ciudad = [p.envio_municipio, p.envio_departamento].filter(Boolean).join(', ');
  const seccionEnvio = filasDetalle([
    ['Dirección', escaparHtml([p.envio_direccion, p.envio_edificio].filter(Boolean).join(' · '))],
    ['Barrio', escaparHtml(p.envio_barrio)],
    ['Vereda', escaparHtml(p.envio_vereda)],
    ['Ciudad', escaparHtml(ciudad)],
    ['Referencia', escaparHtml(p.envio_referencia)],
  ]);

  /* ---- productos ---- */
  let productos;
  if (items.length) {
    productos = `<ul class="dp-prods">${agruparItemsDetalle(items).map(filaProductoDetalle).join('')}</ul>`;
  } else if (p.detalle) {
    // pedidos antiguos: solo se guardó el texto "Producto (talla) | Producto (talla)"
    productos = `<ul class="dp-prods">${String(p.detalle).split(' | ').map(t => `<li class="dp-prod dp-prod-texto"><div class="dp-prod-info"><b class="dp-prod-nombre">${escaparHtml(t)}</b></div></li>`).join('')}</ul>`;
  } else {
    productos = '<p class="admin-foto-hint">Sin productos registrados.</p>';
  }

  /* ---- totales: tal cual quedaron guardados, sin recalcular ---- */
  const filaTotal = (etiqueta, valor) => valor === null || valor === undefined || valor === '' ? '' : `<div><span>${etiqueta}</span><span class="mono">${dineroDetalle(valor)}</span></div>`;
  const totales = `
    <div class="dp-totales">
      ${filaTotal('Subtotal', p.subtotal)}
      ${filaTotal('Envío', p.costo_envio)}
      <div class="dp-total-final"><span>Total</span><span class="mono">${dineroDetalle(p.total)}</span></div>
    </div>`;

  /* ---- historial de estados (ya existía) ---- */
  const historial = Array.isArray(p.historial_estados) ? p.historial_estados : [];
  const seccionHistorial = historial.length
    ? [...historial].reverse().map(h => {
        const info = ESTADOS_PEDIDO[h.estado] || { emoji: '•', label: h.estado };
        const f = h.fecha ? new Date(h.fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
        return `<div class="historial-fila"><span class="pedido-estado-pill estado-pill-${escaparHtml(h.estado)}">${info.emoji} ${escaparHtml(info.label)}</span><span class="historial-usuario">${escaparHtml(h.usuario || 'desconocido')}</span><span class="historial-fecha mono">${escaparHtml(f)}</span></div>`;
      }).join('')
    : '<p class="admin-foto-hint">Todavía no hay cambios de estado registrados para este pedido.</p>';

  /* ---- pago: confirmar / cambiar el estado de pago (solo con permiso de pedidos) ---- */
  const estadoPagoActual = ESTADOS_PAGO_VALIDOS.includes(p.estado_pago) ? p.estado_pago : 'pendiente';
  const seccionPago = permisosActuales.pedidos
    ? `<section class="dp-sec"><h4>Confirmar pago</h4>
        <div class="dp-pago-form">
          <select id="dpPagoSelect" class="admin-input" aria-label="Estado del pago">${ESTADOS_PAGO_VALIDOS.map(k => `<option value="${k}"${k === estadoPagoActual ? ' selected' : ''}>${escaparHtml(ETIQUETAS_ESTADO_PAGO[k])}</option>`).join('')}</select>
          <button type="button" class="admin-btn" id="dpPagoGuardar" data-id="${escaparHtml(p.id)}">Guardar pago</button>
        </div>
        <p class="admin-foto-hint">Marca \"Pagado\" solo cuando ya verificaste el dinero. Queda en el historial con tu usuario y se refleja en la hoja de cálculo.</p>
      </section>`
    : '';
  const historialPagos = Array.isArray(p.historial_pagos) ? p.historial_pagos : [];
  const seccionHistorialPagos = historialPagos.length
    ? `<section class="dp-sec"><h4>Historial de pagos</h4>${[...historialPagos].reverse().map(h => {
        const f = h.fecha ? new Date(h.fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
        const clase = h.estado_pago === 'pagado' ? 'ok' : (h.estado_pago === 'por_verificar' ? 'aviso' : '');
        return `<div class="historial-fila"><span class="dp-pago ${clase}">${escaparHtml(ETIQUETAS_ESTADO_PAGO[h.estado_pago] || h.estado_pago || '—')}</span><span class="historial-usuario">${escaparHtml(h.usuario || 'desconocido')}</span><span class="historial-fecha mono">${escaparHtml(f)}</span></div>`;
      }).join('')}</section>`
    : '';

  const cuerpo = document.getElementById('detallePedidoCuerpo');
  cuerpo.innerHTML = `
    <div class="dp-fichas">${fichas}</div>
    ${seccionPago}
    <div class="dp-dos-col">
      <section class="dp-sec"><h4>Cliente</h4>${seccionCliente}</section>
      <section class="dp-sec"><h4>Entrega</h4>${seccionEnvio}</section>
    </div>
    <section class="dp-sec"><h4>Productos</h4>${productos}${totales}</section>
    <section class="dp-sec"><h4>Historial de estados</h4>${seccionHistorial}</section>
    ${seccionHistorialPagos}`;
  // si una foto ya no existe, se muestra el recuadro vacío en vez del icono roto
  cuerpo.querySelectorAll('img.dp-foto-img').forEach(img => {
    img.addEventListener('error', () => { img.parentElement.classList.add('dp-foto-vacia'); img.remove(); }, { once: true });
  });
  modalDetallePedido.classList.add('open');
  modalDetallePedido.querySelector('.admin-modal').scrollTop = 0;
}
function cerrarDetallePedido() { modalDetallePedido.classList.remove('open'); }

document.getElementById('tablaPedidosBody').addEventListener('click', (e) => {
  if (e.target.closest('select, a, button, option, input, label')) {
    const btn = e.target.closest('.btn-ver-detalle');
    if (btn) abrirDetallePedido(btn.dataset.id);
    return;
  }
  const fila = e.target.closest('tr[data-id]');
  if (fila) abrirDetallePedido(fila.dataset.id);
});
document.getElementById('btnCerrarModalDetallePedido').addEventListener('click', cerrarDetallePedido);
modalDetallePedido.addEventListener('click', (e) => { if (e.target === modalDetallePedido) cerrarDetallePedido(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalDetallePedido.classList.contains('open')) cerrarDetallePedido(); });

/* ---------- confirmar / cambiar el pago de un pedido (desde el detalle) ----------
   - Un solo guardado a la vez por pedido.
   - Marcar \"Pagado\" (o quitarlo) pide confirmación: un toque equivocado no debe dar un pago por recibido.
   - Solo cambia \"estado_pago\" (y su historial): nunca precios, productos ni totales. */
const pagosEnCurso = new Set();
document.getElementById('detallePedidoCuerpo').addEventListener('click', async (e) => {
  const btn = e.target.closest('#dpPagoGuardar');
  if (!btn) return;
  const id = btn.dataset.id;
  const select = document.getElementById('dpPagoSelect');
  const pedido = pedidosCache.find(x => x.id === id);
  if (!pedido || !select) { showToast('No se encontró el pedido. Recarga la lista.', true); return; }
  if (!permisosActuales.pedidos) { showToast('No tienes permiso para cambiar el pago de los pedidos.', true); return; }
  if (pagosEnCurso.has(id)) return;
  const nuevo = select.value;
  const previo = ESTADOS_PAGO_VALIDOS.includes(pedido.estado_pago) ? pedido.estado_pago : 'pendiente';
  if (!ESTADOS_PAGO_VALIDOS.includes(nuevo)) return;
  if (nuevo === previo) { showToast('El pago ya está en ese estado.'); return; }
  const numero = numerosPedidoCache.get(id) || '';
  if (nuevo === 'pagado' && !(await confirmarAccion({
    titulo: `¿Confirmar el pago del pedido #${numero}?`,
    textoOk: 'Sí, marcar como pagado',
    textoCancelar: 'No, volver',
    mensaje: `Vas a registrar que recibiste ${dineroDetalle(pedido.total)}. Quedará en el historial con tu usuario.`
  }))) return;
  if (previo === 'pagado' && !(await confirmarAccion({
    titulo: `¿Quitar la marca de pagado del pedido #${numero}?`,
    peligro: true,
    textoOk: 'Sí, quitar',
    textoCancelar: 'No, volver',
    mensaje: 'El pedido dejará de figurar como pagado. El cambio queda en el historial.'
  }))) return;

  pagosEnCurso.add(id);
  btn.disabled = true; select.disabled = true;
  let res;
  try {
    res = await actualizarPagoPedidoAdmin(id, nuevo);
  } catch (err) {
    console.error(err);
    res = { ok: false, msg: 'No se pudo guardar el pago. El pedido sigue como estaba.' };
  } finally {
    pagosEnCurso.delete(id);
  }
  if (!res.ok) {
    btn.disabled = false; select.disabled = false;
    select.value = previo;
    showToast(res.msg, true);
    return;
  }
  pedido.estado_pago = nuevo;
  if (res.entradaHistorial) pedido.historial_pagos = [...(pedido.historial_pagos || []), res.entradaHistorial];
  const modal = modalDetallePedido.querySelector('.admin-modal');
  const scroll = modal ? modal.scrollTop : 0;
  abrirDetallePedido(id); // se repinta con lo que quedó guardado
  if (modal) modal.scrollTop = scroll;
  showToast(res.sinCambio ? 'El pago ya estaba así.' : `Pago actualizado: ${ETIQUETAS_ESTADO_PAGO[nuevo]}.`);
});

/* ---------- sincronizar los pedidos con la hoja de cálculo ----------
   Reenvía a Google Sheets los pedidos cargados: agrega los que falten (sin correo al cliente)
   y deja al día el estado. Se puede pulsar las veces que haga falta: no duplica filas. */
const btnSincronizarPedidosHoja = document.getElementById('btnSincronizarPedidosHoja');
if (btnSincronizarPedidosHoja) btnSincronizarPedidosHoja.addEventListener('click', async () => {
  if (!permisosActuales.pedidos) { showToast('No tienes permiso para sincronizar los pedidos.', true); return; }
  if (!pedidosCache.length) { showToast('No hay pedidos para sincronizar.', true); return; }
  if (typeof sincronizarPedidosConHoja !== 'function') { showToast('La sincronización no está disponible.', true); return; }
  const textoOriginal = btnSincronizarPedidosHoja.textContent;
  btnSincronizarPedidosHoja.disabled = true;
  try {
    const r = await sincronizarPedidosConHoja(pedidosCache, (hechos, total) => {
      btnSincronizarPedidosHoja.textContent = `Sincronizando ${hechos}/${total}…`;
    });
    if (!r.ok) { showToast(r.msg || 'No se pudo sincronizar con la hoja.', true); return; }
    if (r.fallidos) {
      showToast(`No se pudieron enviar ${r.fallidos} de ${r.total} pedidos (¿sin conexión?). Inténtalo de nuevo.`, true);
    } else if (r.sinConfirmar === 0) {
      const partes = [`${r.agregados} agregados a la hoja`, `${r.actualizados} ya estaban y se revisaron`];
      if (r.inexistentes) partes.push(`${r.inexistentes} ya no existen`);
      if (r.errores) {
        showToast(`Hoja sincronizada con ${r.errores} error(es): ${partes.join(', ')}. Mira la pestaña Errores_Pedidos de la hoja.`, true);
      } else {
        showToast(`Hoja al día: ${partes.join(', ')}.`);
      }
    } else if (r.versionVieja) {
      showToast('El script publicado en Google es una versión vieja (solo respondió «ok») y no sincroniza. Publica una «Nueva versión»: Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar.', true);
    } else {
      showToast(`Enviados ${r.total} pedidos a la hoja, pero el navegador no puede leer la respuesta de Google. Revisa la hoja y la pestaña Errores_Pedidos en unos segundos.`);
    }
  } catch (err) {
    console.error(err);
    showToast('No se pudo sincronizar con la hoja.', true);
  } finally {
    btnSincronizarPedidosHoja.textContent = textoOriginal;
    btnSincronizarPedidosHoja.disabled = false;
  }
});

/* ---------- ver el historial de cambios de estado de un pedido ---------- */
const modalHistorialPedido = document.getElementById('modalHistorialPedido');
document.getElementById('tablaPedidosBody').addEventListener('click', (e) => {
  const btnHistorial = e.target.closest('.btn-ver-historial');
  if (!btnHistorial) return;
  const pedido = pedidosCache.find(p => p.id === btnHistorial.dataset.id);
  const historial = (pedido && pedido.historial_estados) || [];
  const numero = numerosPedidoCache.get(btnHistorial.dataset.id);
  document.querySelector('#modalHistorialPedido h3').textContent = numero ? `Historial del pedido #${numero}` : 'Historial del pedido';
  const cont = document.getElementById('historialPedidoLista');
  cont.innerHTML = historial.length
    ? [...historial].reverse().map(h => {
        const info = ESTADOS_PEDIDO[h.estado] || { emoji: '•', label: h.estado };
        const fecha = h.fecha ? new Date(h.fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
        return `<div class="historial-fila"><span class="pedido-estado-pill estado-pill-${h.estado}">${info.emoji} ${info.label}</span><span class="historial-usuario">${h.usuario || 'desconocido'}</span><span class="historial-fecha mono">${fecha}</span></div>`;
      }).join('')
    : `<p class="admin-foto-hint">Todavía no hay cambios de estado registrados para este pedido.</p>`;
  modalHistorialPedido.classList.add('open');
});
document.getElementById('btnCerrarModalHistorialPedido').addEventListener('click', () => modalHistorialPedido.classList.remove('open'));

/* ---------- cambiar el estado de un pedido desde la tabla ----------
   - Un solo guardado a la vez por pedido (candado + select deshabilitado).
   - Si falla, se avisa con la causa y el selector vuelve al estado anterior.
   - Solo cambia "estado" (y su historial): nunca el pago, precios ni productos.
   - Cancelar pide confirmación (un toque equivocado en el selector no debe cancelar). */
function selectEstadoPedido(id) {
  return [...document.querySelectorAll('#tablaPedidosBody .select-estado-pedido')].find(el => el.dataset.id === id) || null;
}
function ponerSelectEstado(select, estado) {
  if (!select) return;
  select.value = estado;
  select.className = `admin-input select-estado-pedido estado-select-${estado}`;
}
document.getElementById('tablaPedidosBody').addEventListener('change', async (e) => {
  const select = e.target.closest('.select-estado-pedido');
  if (!select) return;
  const id = select.dataset.id;
  const nuevoEstado = select.value;
  const pedido = pedidosCache.find(p => p.id === id);
  const estadoPrevio = pedido ? estadoPedido(pedido) : null;

  if (!pedido) { showToast('No se encontró el pedido. Recarga la lista.', true); return; }
  if (cambiosEstadoEnCurso.has(id)) { ponerSelectEstado(select, estadoPrevio); return; }
  if (!permisosActuales.pedidos) { ponerSelectEstado(select, estadoPrevio); showToast('No tienes permiso para cambiar el estado de los pedidos.', true); return; }
  if (nuevoEstado === estadoPrevio) return;
  if (!ESTADOS_PEDIDO[nuevoEstado]) { ponerSelectEstado(select, estadoPrevio); return; }
  if (nuevoEstado === 'cancelado' && !(await confirmarAccion({
    titulo: `¿Cancelar el pedido #${numerosPedidoCache.get(id) || ''}?`,
    peligro: true,
    textoOk: 'Sí, cancelar pedido',
    textoCancelar: 'No, volver',
    mensaje: estadoPrevio === 'entregado'
      ? 'Quedará marcado como cancelado y dejará de contar en el total vendido. Como ya estaba «Entregado», NO se devuelve stock al inventario.'
      : 'Quedará marcado como cancelado, dejará de contar en el total vendido y las prendas volverán al inventario.'
  }))) {
    ponerSelectEstado(select, estadoPrevio);
    return;
  }

  cambiosEstadoEnCurso.add(id);
  select.disabled = true;
  select.setAttribute('aria-busy', 'true');
  select.classList.add('guardando');
  let res;
  try {
    res = await actualizarEstadoPedidoAdmin(id, nuevoEstado);
  } catch (err) {
    console.error(err);
    res = { ok: false, msg: 'No se pudo guardar el estado. El pedido sigue como estaba.' };
  } finally {
    cambiosEstadoEnCurso.delete(id);
  }

  if (!res.ok) {
    const actual = selectEstadoPedido(id); // la tabla pudo repintarse mientras se guardaba
    ponerSelectEstado(actual, estadoPrevio);
    if (actual) { actual.disabled = false; actual.removeAttribute('aria-busy'); actual.classList.remove('guardando'); }
    showToast(res.msg, true);
    return;
  }

  pedido.estado = nuevoEstado;
  if (res.entradaHistorial) pedido.historial_estados = [...(pedido.historial_estados || []), res.entradaHistorial];
  aplicarFiltrosPedidos(); // repinta fila, contadores y "total vendido" con el estado ya guardado
  const etiqueta = ESTADOS_PEDIDO[nuevoEstado].label;
  let msgEstado = res.sinCambio ? `El pedido ya estaba en «${etiqueta}».` : `Estado actualizado a «${etiqueta}» ✓`;
  if (res.accionStock === 'devuelto') msgEstado += ` ${res.stockMovido} prenda(s) volvieron al inventario.`;
  else if (res.accionStock === 'descontado') msgEstado += ` ${res.stockMovido} prenda(s) se descontaron otra vez del inventario.`;
  showToast(msgEstado);
  if (res.stockMovido > 0 && typeof pintarTodo === 'function') pintarTodo();
});

/* ---------- eliminar un pedido (pide la contraseña del panel) ---------- */
const modalBorrarPedido = document.getElementById('modalBorrarPedido');
let pedidoABorrarId = null;
document.getElementById('tablaPedidosBody').addEventListener('click', (e) => {
  const btnBorrar = e.target.closest('.btn-borrar-pedido');
  if (!btnBorrar) return;
  pedidoABorrarId = btnBorrar.dataset.id;
  document.getElementById('claveBorrarPedido').value = '';
  modalBorrarPedido.classList.add('open');
});
document.getElementById('btnCerrarModalBorrarPedido').addEventListener('click', () => modalBorrarPedido.classList.remove('open'));
document.getElementById('btnConfirmarBorrarPedido').addEventListener('click', async () => {
  const codigo = document.getElementById('claveBorrarPedido').value;
  if (!codigo) { showToast('Escribe el código de desarrollador.', true); return; }
  const btn = document.getElementById('btnConfirmarBorrarPedido');
  btn.disabled = true;
  if (!(await verificarCodigoDesarrollador(codigo))) {
    btn.disabled = false;
    return;
  }
  const res = await eliminarPedidoAdmin(pedidoABorrarId);
  btn.disabled = false;
  if (!res.ok) { showToast(res.msg, true); return; }
  modalBorrarPedido.classList.remove('open');
  if (res.stockDevuelto > 0) showToast(`Pedido eliminado. ${res.stockDevuelto} prenda(s) volvieron al inventario ✓`);
  else if (res.entregado) showToast('Pedido eliminado. Como ya estaba «Entregado», NO se devolvió stock.');
  else if (res.hoja === 'borrada') showToast('Pedido eliminado (también de la hoja)');
  else if (res.hoja === 'sin_fila') showToast('Pedido eliminado (no tenía fila en la hoja)');
  else if (res.hoja === 'fallo') showToast('Pedido eliminado, pero la hoja no borró la fila: ' + (res.detalle || 'revisa la pestaña Errores_Pedidos') + '.', true);
  else showToast('Pedido eliminado. Revisa la hoja en unos segundos; si la fila sigue, mira la pestaña Errores_Pedidos.');
  pintarPedidos();
});

/* ---------- ojito de mostrar/ocultar en Contraseña y Código de acceso del login ---------- */
document.querySelectorAll('.nf-eye').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const esCodigo = btn.dataset.target === 'adminCodigoPanel';
    const mostrar = input.type === 'password';
    input.type = mostrar ? 'text' : 'password';
    btn.textContent = mostrar ? '🙈' : '👁️';
    btn.setAttribute('aria-label', mostrar ? (esCodigo ? 'Ocultar código' : 'Ocultar contraseña') : (esCodigo ? 'Mostrar código' : 'Mostrar contraseña'));
    input.focus();
  });
});

document.getElementById('formAdminLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = document.getElementById('adminUsuario').value.trim();
  const clave = document.getElementById('adminClave').value;
  const codigoPanel = document.getElementById('adminCodigoPanel').value.trim();
  const msg = document.getElementById('adminAuthMsg');
  const btn = e.target.querySelector('button[type="submit"]');
  msg.innerHTML = '';
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  const res = await loginAdmin(usuario, clave, codigoPanel);
  btn.disabled = false;
  btn.textContent = 'Entrar';
  if (res.ok) {
    if (res.sinCodigoAsignado) {
      showToast('Entraste sin código de acceso asignado. Ponte uno desde "Usuarios" cuanto antes.', true);
    }
    entrarAlPanel();
  } else {
    msg.innerHTML = `<div class="auth-error">${res.msg}</div>`;
  }
});

/* ---------- "olvidé mi código de acceso" ---------- */
const modalRecuperarCodigoPanel = document.getElementById('modalRecuperarCodigoPanel');
document.getElementById('linkOlvideCodigoPanel').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('correoRecuperarCodigoPanel').value = document.getElementById('adminUsuario').value.trim();
  modalRecuperarCodigoPanel.classList.add('open');
});
document.getElementById('btnCerrarModalRecuperarCodigoPanel').addEventListener('click', () => {
  modalRecuperarCodigoPanel.classList.remove('open');
});
document.getElementById('btnEnviarRecuperarCodigoPanel').addEventListener('click', async () => {
  const correo = document.getElementById('correoRecuperarCodigoPanel').value.trim();
  const btn = document.getElementById('btnEnviarRecuperarCodigoPanel');
  btn.disabled = true;
  const res = await recuperarCodigoPanelPorCorreo(correo);
  btn.disabled = false;
  showToast(res.msg, !res.ok);
  if (res.ok) modalRecuperarCodigoPanel.classList.remove('open');
});

/* ---------- "olvidé mi contraseña" ---------- */
const modalRecuperarClavePanel = document.getElementById('modalRecuperarClavePanel');
document.getElementById('linkOlvideClavePanel').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('correoRecuperarClavePanel').value = document.getElementById('adminUsuario').value.trim();
  modalRecuperarClavePanel.classList.add('open');
});
document.getElementById('btnCerrarModalRecuperarClavePanel').addEventListener('click', () => {
  modalRecuperarClavePanel.classList.remove('open');
});
document.getElementById('btnEnviarRecuperarClavePanel').addEventListener('click', async () => {
  const correo = document.getElementById('correoRecuperarClavePanel').value.trim();
  const btn = document.getElementById('btnEnviarRecuperarClavePanel');
  btn.disabled = true;
  const res = await recuperarClavePanel(correo);
  btn.disabled = false;
  showToast(res.msg, !res.ok);
  if (res.ok) modalRecuperarClavePanel.classList.remove('open');
});

document.getElementById('btnSalirAdmin').addEventListener('click', async () => {
  await cerrarSesionAdmin();
  window.location.href = 'admin.html';
});

/* ---------- Modal bonito para pedir "código de desarrollador",
   en vez del cuadro feo del navegador (prompt). Se usa con
   await pedirCodigoDev('Título', 'Mensaje...') y devuelve el texto
   escrito, o null si canceló. ---------- */
function pedirCodigoDev(titulo, mensaje) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modalCodigoDev');
    const input = document.getElementById('inputCodigoDev');
    document.getElementById('modalCodigoDevTitulo').textContent = titulo;
    document.getElementById('modalCodigoDevTexto').textContent = mensaje;
    input.value = '';
    overlay.classList.add('open');
    setTimeout(() => input.focus(), 50);

    const btnOk = document.getElementById('btnConfirmarCodigoDev');
    const btnCancel = document.getElementById('btnCancelarCodigoDev');

    function cerrar(valor) {
      overlay.classList.remove('open');
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      resolve(valor);
    }
    function onOk() { cerrar(input.value); }
    function onCancel() { cerrar(null); }
    function onKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); onOk(); }
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    }
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
  });
}

/* ---------- Cierre automático de sesión al salir de la pestaña ----------
   Si el usuario cambia de pestaña, minimiza la ventana o se va a otra
   app (la pestaña del panel queda oculta) y pasan 2 minutos sin volver,
   la sesión se cierra sola por seguridad. Si vuelve antes de los 2
   minutos, el conteo se cancela y no pasa nada. */
const MS_CIERRE_AUTOMATICO = 2 * 60 * 1000; // 2 minutos
let _timerCierreAutomatico = null;

function _cancelarCierreAutomatico() {
  if (_timerCierreAutomatico) {
    clearTimeout(_timerCierreAutomatico);
    _timerCierreAutomatico = null;
  }
}

async function _ejecutarCierreAutomatico() {
  // Solo cierra si en verdad hay una sesión abierta ahora mismo.
  if (!sesionAdminActiva()) return;
  await cerrarSesionAdmin();
  window.location.href = 'admin.html';
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Se fue de la pestaña: arranca el conteo de 2 minutos.
    if (sesionAdminActiva()) {
      _cancelarCierreAutomatico();
      _timerCierreAutomatico = setTimeout(_ejecutarCierreAutomatico, MS_CIERRE_AUTOMATICO);
    }
  } else {
    // Volvió a la pestaña antes de que se cumplieran los 2 minutos.
    _cancelarCierreAutomatico();
  }
});

/* ---------- pestaña Resumen: estadísticas, gráfica y top productos ---------- */
async function pintarResumen() {
  /* Aquí solo se CARGAN los datos del Resumen (productos y pedidos) y se dejan en las
     cachés que usa el resto del panel. Todo lo que se ve en la pestaña (tarjetas, gráfica,
     pedidos recientes, más vendidos y alertas) lo dibuja js/admin-extras.js a continuación. */
  const [productos, pedidos] = await Promise.all([
    Promise.resolve(obtenerProductosAdmin()),
    obtenerPedidosAdmin(),
  ]);
  pedidosCache = pedidos; // así la pestaña Pedidos no tiene que volver a pedirlos si el admin la abre después
  numerosPedidoCache = mapaNumerosPedido(pedidos);
  return { productos, pedidos };
}

/* ---------- estadísticas rápidas ---------- */
function pintarStats() {
  const productos = obtenerProductosAdmin();
  const totalProductos = productos.length;
  const totalUnidades = productos.reduce((s, p) => s + stockTotalProducto(p), 0);
  const agotados = productos.filter(p => estaAgotado(p)).length;
  const stockBajo = productos.filter(p => nivelStockProducto(p) === 'bajo').length;
  /* cuenta colores puntuales en 0, aunque el producto en general
     todavía tenga stock en otros colores — esto es justo lo que
     antes no se podía ver con un solo número de stock. */
  const coloresAgotados = productos.reduce((s, p) => {
    if (!p.stockColores || !Object.keys(p.stockColores).length) return s;
    return s + p.colores.filter(c => colorAgotado(p, c)).length;
  }, 0);
  /* mismo cálculo pero para tallas: cuenta tallas puntuales en 0, aunque
     el producto en general todavía tenga stock en otras tallas */
  const tallasAgotadas = productos.reduce((s, p) => {
    if (!p.stockTallas || !Object.keys(p.stockTallas).length) return s;
    return s + p.tallas.filter(t => tallaAgotada(p, t)).length;
  }, 0);
  /* Cada producto cuenta UNA sola vez (no por talla/color) y cae en un solo grupo:
     no disponible (desactivado) / agotado / pocas existencias / disponible. */
  const noDisponibles = productos.filter(p => !p.activo).length;
  const activos = productos.filter(p => p.activo);
  const agotadosAct = activos.filter(p => nivelStockProducto(p) === 'agotado').length;
  const bajoAct = activos.filter(p => nivelStockProducto(p) === 'bajo').length;
  const disponibles = activos.filter(p => nivelStockProducto(p) === 'ok').length;
  const detalle = [
    `${totalUnidades} unidades en stock`,
    noDisponibles > 0 ? `${noDisponibles} desactivado${noDisponibles > 1 ? 's' : ''}` : '',
    tallasAgotadas > 0 ? `${tallasAgotadas} talla${tallasAgotadas > 1 ? 's' : ''} agotada${tallasAgotadas > 1 ? 's' : ''}` : '',
    coloresAgotados > 0 ? `${coloresAgotados} color${coloresAgotados > 1 ? 'es' : ''} agotado${coloresAgotados > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
  document.getElementById('adminStats').innerHTML = `
    <div class="admin-stat ap-kpi ap-kpi-total"><span class="ap-kpi-ico"><svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg></span><div><b>${totalProductos}</b><span>Total de productos</span></div></div>
    <div class="admin-stat ap-kpi ap-kpi-ok"><span class="ap-kpi-ico"><svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg></span><div><b>${disponibles}</b><span>Disponibles</span></div></div>
    <div class="admin-stat ap-kpi ap-kpi-low"><span class="ap-kpi-ico"><svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.5"/></svg></span><div><b>${bajoAct}</b><span>Pocas existencias (≤ ${STOCK_BAJO_UMBRAL})</span></div></div>
    <div class="admin-stat ap-kpi ap-kpi-out"><span class="ap-kpi-ico"><svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg></span><div><b>${agotadosAct}</b><span>Agotados</span></div></div>
    <p class="ap-kpi-detalle">${detalle.map(_escAdm).join(' · ')}</p>
  `;
}

/* ---------- tabla de productos ---------- */
let ordenProductos = { campo: null, dir: 1 }; // orden al hacer clic en un encabezado de la tabla
const PRODUCTOS_POR_PAGINA = 15;
let paginaProductos = 1;

function valorOrdenProducto(p, campo) {
  if (campo === 'nombre') return (p.nombre || '').toLowerCase();
  if (campo === 'categoria') return (p.categoria || '').toLowerCase();
  if (campo === 'precio') return Number(p.precio) || 0;
  if (campo === 'descuento') return Number(p.descuento) || 0;
  if (campo === 'precioFinal') return rangoPrecioTallas(p).min;
  if (campo === 'stock') return stockTotalProducto(p);
  return 0;
}
function aplicarOrdenProductos(lista) {
  if (!ordenProductos.campo) return lista;
  return [...lista].sort((a, b) => {
    const va = valorOrdenProducto(a, ordenProductos.campo);
    const vb = valorOrdenProducto(b, ordenProductos.campo);
    if (va < vb) return -1 * ordenProductos.dir;
    if (va > vb) return 1 * ordenProductos.dir;
    return 0;
  });
}
function actualizarFlechasOrdenProductos() {
  document.querySelectorAll('#tablaProductos thead .th-ordenable').forEach(th => {
    th.classList.remove('orden-asc', 'orden-desc');
    if (th.dataset.campo === ordenProductos.campo) th.classList.add(ordenProductos.dir === 1 ? 'orden-asc' : 'orden-desc');
  });
}
document.querySelector('#tablaProductos thead').addEventListener('click', (e) => {
  const th = e.target.closest('.th-ordenable');
  if (!th) return;
  const campo = th.dataset.campo;
  if (ordenProductos.campo === campo) ordenProductos.dir *= -1;
  else { ordenProductos.campo = campo; ordenProductos.dir = 1; }
  actualizarFlechasOrdenProductos();
  paginaProductos = 1;
  renderInventario();
});

/** Aplica orden + buscador + paginación sobre el catálogo completo y
    pinta la tabla de Inventario con el resultado. Reemplaza al viejo
    esquema de "pintar todo y luego ocultar filas con CSS", que no
    era compatible con paginar (no tiene sentido paginar filas que
    ya están escondidas). */
/** Llena el selector de categorías con las categorías REALES del catálogo
    (conserva la selección actual si todavía existe). */
function poblarFiltroCategorias() {
  const sel = document.getElementById('filtroCategoriaProducto');
  if (!sel) return;
  const actual = sel.value;
  const cats = [...new Set(obtenerProductosAdmin().map(p => (p.categoria || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  sel.innerHTML = '<option value="">Todas las categorías</option>' +
    cats.map(c => `<option value="${_escAdm(c)}">${_escAdm(c)}</option>`).join('');
  sel.value = cats.includes(actual) ? actual : '';
}

function coincideEstadoProducto(p, estado) {
  if (!estado) return true;
  if (estado === 'oculto') return !p.activo || !!(p.ocultoHastaDrop && estaOcultoPorDrop(p));
  if (!p.activo) return false;
  return nivelStockProducto(p) === (estado === 'disponible' ? 'ok' : estado);
}

function renderInventario() {
  const texto = inputBuscarProducto.value.trim().toLowerCase();
  const estado = document.getElementById('filtroEstadoProducto').value;
  const categoria = document.getElementById('filtroCategoriaProducto').value;
  const todos = obtenerProductosAdmin();
  let productos = aplicarOrdenProductos(todos);
  if (texto) {
    productos = productos.filter(p =>
      (p.nombre || '').toLowerCase().includes(texto) || (p.categoria || '').toLowerCase().includes(texto));
  }
  if (categoria) productos = productos.filter(p => (p.categoria || '').trim() === categoria);
  if (estado) productos = productos.filter(p => coincideEstadoProducto(p, estado));
  const hayFiltro = !!(texto || estado || categoria);
  const totalPaginas = Math.max(1, Math.ceil(productos.length / PRODUCTOS_POR_PAGINA));
  if (paginaProductos > totalPaginas) paginaProductos = totalPaginas;
  const inicio = (paginaProductos - 1) * PRODUCTOS_POR_PAGINA;
  pintarTabla(productos.slice(inicio, inicio + PRODUCTOS_POR_PAGINA), !productos.length, hayFiltro);
  const cont = document.getElementById('apContadorResultados');
  if (cont) cont.textContent = todos.length ? (hayFiltro ? `${productos.length} de ${todos.length} productos` : `${todos.length} productos`) : '';
  pintarPaginacion(document.getElementById('paginacionProductos'), paginaProductos, totalPaginas, productos.length, (nuevaPagina) => {
    paginaProductos = nuevaPagina;
    renderInventario();
  });
}

/* ---------- utilidades de la tabla / modal de productos ---------- */
function _escAdm(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function _pesos(n) { return '$' + (Number(n) || 0).toLocaleString('es-CO'); }

/** Tabla de productos (PC) / tarjetas (celular). Solo MUESTRA los datos:
    para cambiar algo se usa el botón ✏ Editar, que abre el modal con los
    datos reales de ese producto. */
function pintarTabla(productosPagina, sinResultados, hayFiltro) {
  const productos = productosPagina;
  const tbody = document.getElementById('tablaProductosBody');
  if (!obtenerProductosAdmin().length) {
    tbody.innerHTML = `<tr class="fila-vacia"><td colspan="10" style="text-align:center;padding:30px;color:var(--adm-text-dim);">Todavía no hay productos. Agrega el primero arriba.</td></tr>`;
    return;
  }
  if (!productos.length) {
    tbody.innerHTML = `<tr class="fila-vacia"><td colspan="10" style="text-align:center;padding:30px;color:var(--adm-text-dim);">${hayFiltro ? 'Ningún producto coincide con la búsqueda o los filtros.' : 'No hay productos en esta página.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = productos.map(p => {
    const agotado = estaAgotado(p);
    const nivel = nivelStockProducto(p);
    const stockTotal = stockTotalProducto(p);
    const colores = p.colores || [];
    const tallas = p.tallas || [];
    const rango = rangoPrecioTallas(p);
    const desc = Number(p.descuento) || 0;

    /* foto principal (la misma lógica de siempre) */
    const fotoPrincipal = (p.fotos && p.fotos[colores[0]]) || p.foto;
    const miniatura = fotoPrincipal
      ? `<img src="${_escAdm(fotoPrincipal)}" class="admin-prod-thumb" alt="${_escAdm(p.nombre)}" loading="lazy">`
      : iconoProducto(p.icono, colores[0]);

    /* columna FOTOS: miniaturas por color (o la foto general) */
    const fotosColor = colores.filter(c => p.fotos && p.fotos[c]);
    const sinFoto = colores.length - fotosColor.length;
    let fotosHtml = fotosColor.slice(0, 3).map(c => `<span class="tf-mini" style="background:${_escAdm(c)}"><img src="${_escAdm(p.fotos[c])}" alt="" loading="lazy"></span>`).join('');
    if (!fotosHtml && p.foto) fotosHtml = `<span class="tf-mini"><img src="${_escAdm(p.foto)}" alt="" loading="lazy"></span>`;
    if (fotosColor.length > 3) fotosHtml += `<span class="tf-mas">+${fotosColor.length - 3}</span>`;
    if (!fotosHtml) fotosHtml = `<span class="tf-vacio">Sin foto</span>`;
    const fotosAviso = colores.length > 1 && sinFoto > 0 && fotosColor.length > 0 ? `<span class="tf-aviso">⚠ ${sinFoto} color${sinFoto > 1 ? 'es' : ''} sin foto</span>` : '';

    /* columna PRECIO POR TALLA: solo las tallas con precio propio */
    const personalizadas = tallas.filter(t => precioBaseTalla(p, t) !== (Number(p.precio) || 0));
    const tallasHtml = personalizadas.length
      ? personalizadas.slice(0, 3).map(t => `<span class="pt-chip"><b>${_escAdm(t)}</b> ${_pesos(precioBaseTalla(p, t))}</span>`).join('') + (personalizadas.length > 3 ? `<span class="pt-chip">+${personalizadas.length - 3}</span>` : '')
      : `<span class="pt-igual">Igual al base</span>`;

    /* PRECIO FINAL (si hay descuento, se muestra el precio anterior tachado) */
    const finalTxt = rango.min === rango.max ? _pesos(rango.min) : `Desde ${_pesos(rango.min)}`;
    const antes = desc > 0 ? `<s class="pf-antes">${_pesos(Number(p.precio) || 0)}</s>` : '';
    const finalTitulo = rango.min === rango.max ? '' : `title="Varía según la talla: ${_pesos(rango.min)} a ${_pesos(rango.max)}"`;

    /* STOCK: total + de dónde sale */
    const tieneT = p.stockTallas && Object.keys(p.stockTallas).length;
    const tieneC = p.stockColores && Object.keys(p.stockColores).length;
    const stockDe = tieneT ? 'por talla' : (tieneC ? 'por color' : 'general');

    const estadoPill = !p.activo
      ? '<span class="estado-pill out">No disponible</span>'
      : (agotado
        ? '<span class="estado-pill out">Agotado</span>'
        : (nivel === 'bajo' ? `<span class="estado-pill low">Quedan ${stockTotal}</span>` : '<span class="estado-pill ok">Disponible</span>'));
    // Producto marcado "ocultar hasta el drop": aunque esté activo,
    // no lo ve nadie en la tienda mientras la cuenta regresiva del
    // Próximo drop no llegue a cero (ver estaOcultoPorDrop en
    // js/products.js). Esto le avisa al vendedor en la tabla.
    const oculto = (p.ocultoHastaDrop && estaOcultoPorDrop(p))
      ? '<span class="estado-pill" style="background:rgba(168,124,255,.16);color:#c9a8ff;">🙈 Oculto (drop)</span>'
      : '';
    const nuevo = p.badge === 'nuevo' ? '<span class="pill-newdrop">New drop</span>' : '';

    return `
      <tr data-row-id="${_escAdm(p.id)}" class="${!p.activo ? 'fila-inactiva' : ''}">
        <td data-label="Producto" class="td-producto">
          <div class="admin-prod-nombre">
            <div class="admin-prod-thumbwrap">${miniatura}</div>
            <div class="admin-prod-info">
              <span class="admin-prod-name">${_escAdm(p.nombre)}</span>
              ${nuevo}
            </div>
          </div>
        </td>
        <td data-label="Fotos" class="td-fotos"><div class="tf-fila">${fotosHtml}</div>${fotosAviso}</td>
        <td data-label="Categoría" class="td-cat">${_escAdm(p.categoria)}</td>
        <td data-label="Precio" class="mono td-precio">${_pesos(p.precio)}</td>
        <td data-label="Precio por talla" class="td-tallas ${personalizadas.length ? '' : 'sin-dato-mobile'}"><div class="pt-fila">${tallasHtml}</div></td>
        <td data-label="Descuento" class="mono td-desc">${desc > 0 ? `<span class="desc-pill">-${desc}%</span>` : '<span class="td-nada">0%</span>'}</td>
        <td data-label="Precio final" class="mono admin-precio-final" ${finalTitulo}>${antes}<span>${finalTxt}</span></td>
        <td data-label="Stock" class="td-stock"><b class="mono">${stockTotal}</b> <span class="td-stock-de">${stockDe}</span></td>
        <td data-label="Estado" class="td-estado">${estadoPill}${oculto}</td>
        <td data-label="Acciones" class="td-acciones">
          <button type="button" class="admin-btn admin-btn-xs btn-editar-fila" aria-label="Editar ${_escAdm(p.nombre)}"><span class="ap-bi"><svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg></span><span class="lbl">Editar</span></button>
          <button type="button" class="admin-btn admin-btn-xs btn-borrar-fila" aria-label="Eliminar ${_escAdm(p.nombre)}"><span class="ap-bi"><svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg></span><span class="lbl">Eliminar</span></button>
        </td>
      </tr>`;
  }).join('');
}

/* Un solo listener para los botones de todas las filas (sirve tras cada repintado) */
document.getElementById('tablaProductosBody').addEventListener('click', (e) => {
  const btnEditar = e.target.closest('.btn-editar-fila');
  const btnBorrar = e.target.closest('.btn-borrar-fila');
  if (!btnEditar && !btnBorrar) return;
  const fila = e.target.closest('tr[data-row-id]');
  if (!fila) return;
  if (btnEditar) abrirEditorProducto(fila.dataset.rowId);
  else abrirConfirmarEliminar(fila.dataset.rowId);
});

/* =====================================================================
   MODAL "EDITAR PIEZA"
   Se llena con los datos REALES del producto elegido. Nada se guarda
   hasta presionar Guardar; si no tocas una foto o un campo, queda
   exactamente igual que estaba.
   ===================================================================== */
const modalEditarProducto = document.getElementById('modalEditarProducto');
const peEl = {
  titulo: document.getElementById('peTitulo'),
  imagenPrev: document.getElementById('peImagenPrev'),
  imagenHint: document.getElementById('peImagenHint'),
  fotoGeneral: document.getElementById('peFotoGeneral'),
  nombre: document.getElementById('peNombre'),
  descripcion: document.getElementById('peDescripcion'),
  precio: document.getElementById('pePrecio'),
  descuento: document.getElementById('peDescuento'),
  categoria: document.getElementById('peCategoria'),
  categoriasLista: document.getElementById('peCategoriasLista'),
  stock: document.getElementById('peStock'),
  stockHint: document.getElementById('peStockHint'),
  tallasPrecio: document.getElementById('peTallasPrecio'),
  stockColor: document.getElementById('peStockColor'),
  stockTalla: document.getElementById('peStockTalla'),
  fotosColor: document.getElementById('peFotosColor'),
  newDrop: document.getElementById('peNewDrop'),
  visible: document.getElementById('peVisible'),
  ocultoDrop: document.getElementById('peOcultoDrop'),
  finalAntes: document.getElementById('peFinalAntes'),
  finalValor: document.getElementById('peFinalValor'),
};
let peId = null;                 // id del producto que se está editando
let peDraft = null;              // cambios de fotos pendientes (se aplican al Guardar)
let peTieneDesgloseT = false;    // ¿el producto ya llevaba stock por talla?
let peTieneDesgloseC = false;    // ¿... por color?
let peStockGeneral = 0;          // último valor del stock general

function _bloquearScrollFondo(bloquear) { document.body.style.overflow = bloquear ? 'hidden' : ''; }

function abrirEditorProducto(id) {
  const p = obtenerProductosAdmin().find(x => String(x.id) === String(id));
  if (!p) { showToast('No se encontró ese producto.', true); return; }
  peId = p.id;
  peDraft = { foto: undefined, fotos: {}, fotosTrasera: {} };
  const colores = p.colores || [];
  const tallas = p.tallas || [];

  peEl.titulo.textContent = p.nombre;
  peEl.nombre.value = p.nombre || '';
  peEl.descripcion.value = p.descripcion || '';
  peEl.precio.value = Number(p.precio) || 0;
  peEl.descuento.value = Number(p.descuento) || 0;
  peEl.categoria.value = p.categoria || '';
  peEl.newDrop.checked = p.badge === 'nuevo';
  peEl.visible.checked = !!p.activo;
  peEl.ocultoDrop.checked = !!p.ocultoHastaDrop;

  /* categorías ya usadas, para sugerirlas al escribir */
  const cats = [...new Set(obtenerProductosAdmin().map(x => x.categoria).filter(Boolean))].sort();
  peEl.categoriasLista.innerHTML = cats.map(c => `<option value="${_escAdm(c)}"></option>`).join('');

  /* imagen principal */
  peRenderImagenGeneral(p, p.foto || (p.fotos && p.fotos[colores[0]]) || null);
  peEl.imagenHint.textContent = p.foto
    ? 'Foto general del producto. Se usa cuando un color no tiene foto propia.'
    : ((p.fotos && Object.keys(p.fotos).length) ? 'Se muestra la foto del primer color. La foto general se usa cuando un color no tiene foto propia.' : 'Este producto todavía no tiene foto.');
  peEl.fotoGeneral.value = '';

  /* precio por talla: solo se muestra valor si esa talla tiene precio propio */
  const preciosPropios = p.preciosTalla || {};
  peEl.tallasPrecio.innerHTML = tallas.length ? tallas.map(t => {
    const tiene = preciosPropios[t] !== undefined && preciosPropios[t] !== null && preciosPropios[t] !== '';
    return `<label class="pe-mini"><span class="pe-mini-tag">${_escAdm(t)}</span><input type="number" class="pe-mini-input pe-input-precio-talla" data-talla="${_escAdm(t)}" min="0" step="100" inputmode="numeric" ${tiene ? `value="${Number(preciosPropios[t]) || 0}"` : ''} placeholder="= base"></label>`;
  }).join('') : '<p class="pe-hint">Este producto no tiene tallas.</p>';
  document.getElementById('peDetTallasPrecio').open = tallas.some(t => preciosPropios[t] !== undefined && preciosPropios[t] !== null && preciosPropios[t] !== '' && Number(preciosPropios[t]) !== Number(p.precio));

  /* stock por color / por talla (solo hay valores si el producto ya los tenía) */
  peTieneDesgloseC = !!(p.stockColores && Object.keys(p.stockColores).length);
  peTieneDesgloseT = !!(p.stockTallas && Object.keys(p.stockTallas).length);
  peEl.stockColor.innerHTML = colores.length ? colores.map(c => {
    const tiene = peTieneDesgloseC && Object.prototype.hasOwnProperty.call(p.stockColores, c);
    return `<label class="pe-mini"><span class="pe-mini-tag pe-mini-swatch" style="background:${_escAdm(c)}" title="${_escAdm(c)}"></span><input type="number" class="pe-mini-input pe-input-stock-color" data-color="${_escAdm(c)}" min="0" step="1" inputmode="numeric" ${tiene ? `value="${Math.max(0, Number(p.stockColores[c]) || 0)}"` : ''} placeholder="—"></label>`;
  }).join('') : '<p class="pe-hint">Este producto no tiene colores.</p>';
  peEl.stockTalla.innerHTML = tallas.length ? tallas.map(t => {
    const tiene = peTieneDesgloseT && Object.prototype.hasOwnProperty.call(p.stockTallas, t);
    return `<label class="pe-mini"><span class="pe-mini-tag">${_escAdm(t)}</span><input type="number" class="pe-mini-input pe-input-stock-talla" data-talla="${_escAdm(t)}" min="0" step="1" inputmode="numeric" ${tiene ? `value="${Math.max(0, Number(p.stockTallas[t]) || 0)}"` : ''} placeholder="—"></label>`;
  }).join('') : '<p class="pe-hint">Este producto no tiene tallas.</p>';
  document.getElementById('peDetStockColor').open = peTieneDesgloseC;
  document.getElementById('peDetStockTalla').open = peTieneDesgloseT;
  peStockGeneral = Math.max(0, Number(p.stock) || 0);
  peEl.stock.value = peStockGeneral;

  /* fotos por color: frente y espalda */
  peEl.fotosColor.innerHTML = colores.length ? colores.map(c => {
    const f = p.fotos && p.fotos[c];
    const t = p.fotosTrasera && p.fotosTrasera[c];
    return `
      <div class="pe-color-fila" data-color="${_escAdm(c)}">
        <span class="pe-color-swatch" style="background:${_escAdm(c)}" title="${_escAdm(c)}"></span>
        <label class="pe-foto" title="Foto de frente de este color">
          ${f ? `<img src="${_escAdm(f)}" alt="Frente">` : '<span class="pe-foto-vacio">＋</span>'}
          <em>Frente</em>
          <input type="file" accept="image/*" hidden data-tipo="frente" data-color="${_escAdm(c)}">
        </label>
        <label class="pe-foto" title="Foto de espalda de este color">
          ${t ? `<img src="${_escAdm(t)}" alt="Espalda">` : '<span class="pe-foto-vacio">＋</span>'}
          <em>Espalda</em>
          <input type="file" accept="image/*" hidden data-tipo="espalda" data-color="${_escAdm(c)}">
        </label>
      </div>`;
  }).join('') : '<p class="pe-hint">Este producto no tiene colores.</p>';
  document.getElementById('peDetFotos').open = !!(p.fotos && Object.keys(p.fotos).length) || !!(p.fotosTrasera && Object.keys(p.fotosTrasera).length);

  peRecalcular();
  modalEditarProducto.classList.add('open');
  _bloquearScrollFondo(true);
  const cuerpo = modalEditarProducto.querySelector('.pe-body');
  if (cuerpo) cuerpo.scrollTop = 0;
}

function peRenderImagenGeneral(p, src) {
  peEl.imagenPrev.innerHTML = src
    ? `<img src="${_escAdm(src)}" alt="${_escAdm(p ? p.nombre : '')}">`
    : (p ? iconoProducto(p.icono, (p.colores || [])[0]) : '');
}

function cerrarEditorProducto() {
  modalEditarProducto.classList.remove('open');
  _bloquearScrollFondo(false);
  peId = null;
  peDraft = null;
}

/* Recalcula en vivo el precio final y el total de stock */
function peRecalcular() {
  const base = Math.max(0, Number(peEl.precio.value) || 0);
  const d = Math.min(90, Math.max(0, Number(peEl.descuento.value) || 0));
  const inputsT = [...peEl.tallasPrecio.querySelectorAll('.pe-input-precio-talla')];
  const bases = inputsT.length ? inputsT.map(i => (i.value !== '' ? Math.max(0, Number(i.value) || 0) : base)) : [base];
  const finales = bases.map(v => (d > 0 ? Math.round(v * (1 - d / 100)) : v));
  const minF = Math.min(...finales), maxF = Math.max(...finales);
  peEl.finalValor.textContent = minF === maxF ? _pesos(minF) : `${_pesos(minF)} – ${_pesos(maxF)}`;
  const minB = Math.min(...bases), maxB = Math.max(...bases);
  if (d > 0) {
    peEl.finalAntes.hidden = false;
    peEl.finalAntes.textContent = minB === maxB ? _pesos(minB) : `${_pesos(minB)} – ${_pesos(maxB)}`;
  } else {
    peEl.finalAntes.hidden = true;
  }

  /* stock: si hay desglose por talla o color, el total se calcula solo (igual que en la tienda) */
  const inT = [...peEl.stockTalla.querySelectorAll('.pe-input-stock-talla')];
  const inC = [...peEl.stockColor.querySelectorAll('.pe-input-stock-color')];
  const usaT = peTieneDesgloseT || inT.some(i => i.value !== '');
  const usaC = peTieneDesgloseC || inC.some(i => i.value !== '');
  const suma = (arr) => arr.reduce((s, i) => s + Math.max(0, Math.floor(Number(i.value) || 0)), 0);
  if (usaT || usaC) {
    peEl.stock.readOnly = true;
    peEl.stock.value = usaT ? suma(inT) : suma(inC);
    peEl.stockHint.textContent = usaT ? 'Suma automática del stock por talla.' : 'Suma automática del stock por color.';
  } else {
    if (peEl.stock.readOnly) peEl.stock.value = peStockGeneral;
    peEl.stock.readOnly = false;
    peEl.stockHint.textContent = '';
  }
}
['pePrecio', 'peDescuento'].forEach(id => document.getElementById(id).addEventListener('input', peRecalcular));
peEl.tallasPrecio.addEventListener('input', peRecalcular);
peEl.stockColor.addEventListener('input', peRecalcular);
peEl.stockTalla.addEventListener('input', peRecalcular);
peEl.stock.addEventListener('input', () => { if (!peEl.stock.readOnly) peStockGeneral = Math.max(0, Math.floor(Number(peEl.stock.value) || 0)); });

/* Fotos: se comprimen y quedan "pendientes"; solo se guardan al presionar Guardar */
peEl.fotoGeneral.addEventListener('change', async () => {
  const file = peEl.fotoGeneral.files[0];
  if (!file || !peDraft) return;
  try {
    const dataUrl = await comprimirImagen(file, 700, 0.75);
    peDraft.foto = dataUrl;
    peRenderImagenGeneral(null, dataUrl);
    peEl.imagenHint.textContent = '✓ Foto nueva lista — se guarda al presionar Guardar.';
  } catch (err) {
    showToast('No se pudo usar esa imagen.', true);
  }
});
peEl.fotosColor.addEventListener('change', async (e) => {
  const input = e.target.closest('input[type="file"]');
  if (!input || !peDraft) return;
  const file = input.files[0];
  if (!file) return;
  try {
    const dataUrl = await comprimirImagen(file, 700, 0.75);
    (input.dataset.tipo === 'espalda' ? peDraft.fotosTrasera : peDraft.fotos)[input.dataset.color] = dataUrl;
    const label = input.closest('.pe-foto');
    let img = label.querySelector('img');
    if (!img) { label.querySelector('.pe-foto-vacio')?.remove(); img = document.createElement('img'); label.prepend(img); }
    img.src = dataUrl;
    label.classList.add('pe-foto-nueva');
  } catch (err) {
    showToast('No se pudo usar esa imagen.', true);
  }
});

function guardarEditorProducto() {
  const p = obtenerProductosAdmin().find(x => String(x.id) === String(peId));
  if (!p) { showToast('No se encontró ese producto.', true); cerrarEditorProducto(); return; }
  const nombre = peEl.nombre.value.trim();
  if (!nombre) { showToast('El producto necesita un nombre.', true); peEl.nombre.focus(); return; }
  if (peEl.precio.value === '' || !(Number(peEl.precio.value) >= 0)) { showToast('Escribe un precio válido.', true); peEl.precio.focus(); return; }
  const precio = Math.max(0, Number(peEl.precio.value) || 0);
  const descuento = Math.min(90, Math.max(0, Number(peEl.descuento.value) || 0));

  /* precio por talla: las tallas con precio escrito se guardan; si una talla tenía precio propio
     y ahora está vacía, pasa a costar lo mismo que el precio base */
  const tallas = p.tallas || [];
  let preciosTalla;
  if (tallas.length) {
    preciosTalla = { ...(p.preciosTalla || {}) };
    peEl.tallasPrecio.querySelectorAll('.pe-input-precio-talla').forEach(inp => {
      const t = inp.dataset.talla;
      if (inp.value !== '') preciosTalla[t] = Math.max(0, Number(inp.value) || 0);
      else if (Object.prototype.hasOwnProperty.call(preciosTalla, t)) preciosTalla[t] = precio;
    });
  }

  /* stock por color / talla: solo se escribe si ya existía o si se llenó algo */
  const inT = [...peEl.stockTalla.querySelectorAll('.pe-input-stock-talla')];
  const inC = [...peEl.stockColor.querySelectorAll('.pe-input-stock-color')];
  const usaT = peTieneDesgloseT || inT.some(i => i.value !== '');
  const usaC = peTieneDesgloseC || inC.some(i => i.value !== '');

  const cambios = {
    nombre,
    categoria: peEl.categoria.value,
    precio,
    descuento,
    activo: peEl.visible.checked,
    ocultoHastaDrop: peEl.ocultoDrop.checked,
  };
  if (preciosTalla) cambios.preciosTalla = preciosTalla;
  if (!usaT && !usaC) cambios.stock = peEl.stock.value;
  if (peDraft.foto !== undefined) cambios.foto = peDraft.foto;
  if ((peEl.descripcion.value.trim()) !== (p.descripcion || '')) cambios.descripcion = peEl.descripcion.value;
  /* New Drop = badge "nuevo". Otras etiquetas (ej: "pocas") no se tocan si no cambias este check */
  const eraNuevo = p.badge === 'nuevo';
  if (peEl.newDrop.checked && !eraNuevo) cambios.badge = 'nuevo';
  else if (!peEl.newDrop.checked && eraNuevo) cambios.badge = null;

  const id = p.id;
  actualizarProductoAdmin(id, cambios);
  Object.keys(peDraft.fotos).forEach(c => actualizarFotoColorAdmin(id, c, peDraft.fotos[c]));
  Object.keys(peDraft.fotosTrasera).forEach(c => actualizarFotoTraseraColorAdmin(id, c, peDraft.fotosTrasera[c]));
  if (usaC) {
    const stockColores = {};
    inC.forEach(i => { stockColores[i.dataset.color] = Math.max(0, Math.floor(Number(i.value) || 0)); });
    actualizarStockColoresAdmin(id, stockColores);
  }
  if (usaT) {
    const stockTallas = {};
    inT.forEach(i => { stockTallas[i.dataset.talla] = Math.max(0, Math.floor(Number(i.value) || 0)); });
    actualizarStockTallasAdmin(id, stockTallas);
  }
  cerrarEditorProducto();
  showToast('Cambios guardados ✓');
  pintarTodo();
}

document.getElementById('peGuardar').addEventListener('click', guardarEditorProducto);
document.getElementById('peCancelar').addEventListener('click', cerrarEditorProducto);
document.getElementById('peCerrar').addEventListener('click', cerrarEditorProducto);

/* =====================================================================
   CONFIRMAR ELIMINAR (solo el producto elegido)
   ===================================================================== */
const modalEliminarProducto = document.getElementById('modalEliminarProducto');
let peElimId = null;
function abrirConfirmarEliminar(id) {
  const p = obtenerProductosAdmin().find(x => String(x.id) === String(id));
  if (!p) return;
  peElimId = p.id;
  document.getElementById('peElimNombre').textContent = p.nombre;
  modalEliminarProducto.classList.add('open');
  _bloquearScrollFondo(true);
}
function cerrarConfirmarEliminar() {
  modalEliminarProducto.classList.remove('open');
  peElimId = null;
  if (!modalEditarProducto.classList.contains('open')) _bloquearScrollFondo(false);
}
document.getElementById('peElimCancelar').addEventListener('click', cerrarConfirmarEliminar);
modalEliminarProducto.addEventListener('click', (e) => { if (e.target === modalEliminarProducto) cerrarConfirmarEliminar(); });
document.getElementById('peElimConfirmar').addEventListener('click', () => {
  if (peElimId == null) return;
  eliminarProductoAdmin(peElimId);
  cerrarConfirmarEliminar();
  showToast('Producto eliminado');
  pintarTodo();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (modalEliminarProducto.classList.contains('open')) cerrarConfirmarEliminar();
  else if (modalEditarProducto.classList.contains('open')) cerrarEditorProducto();
});

function pintarTodo() {
  pintarStats();
  poblarFiltroCategorias();
  renderInventario();
  if (tabResumen.style.display !== 'none') pintarResumen();
}

/* ---------- buscador del inventario (ahora se aplica junto con la paginación en renderInventario) ---------- */
const inputBuscarProducto = document.getElementById('buscarProductoAdmin');
inputBuscarProducto.addEventListener('input', () => { paginaProductos = 1; renderInventario(); });
['filtroEstadoProducto', 'filtroCategoriaProducto'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => { paginaProductos = 1; renderInventario(); });
});
document.getElementById('btnLimpiarFiltrosProductos').addEventListener('click', () => {
  inputBuscarProducto.value = '';
  document.getElementById('filtroEstadoProducto').value = '';
  document.getElementById('filtroCategoriaProducto').value = '';
  paginaProductos = 1;
  renderInventario();
});

/* ---------- agregar producto nuevo ---------- */
const cardNuevo = document.getElementById('cardNuevoProducto');
document.getElementById('btnMostrarNuevo').addEventListener('click', () => {
  cardNuevo.style.display = cardNuevo.style.display === 'none' ? 'block' : 'none';
});
document.getElementById('btnCancelarNuevo').addEventListener('click', () => {
  cardNuevo.style.display = 'none';
  document.getElementById('nProdOcultoDrop').checked = false;
});

/* ---- genera un input de stock por cada color que el admin va escribiendo,
   para poder repartir el stock inicial (ej: 5 blancas, 10 negras) desde
   que se crea el producto, en vez de un solo número compartido ---- */
const nProdColoresInput = document.getElementById('nProdColores');
const nProdStockColorWrap = document.getElementById('nProdStockColorWrap');
const nProdStockInput = document.getElementById('nProdStock');
function regenerarStockPorColorNuevo() {
  const colores = nProdColoresInput.value.split(',').map(c => c.trim()).filter(Boolean);
  if (!colores.length) { nProdStockColorWrap.innerHTML = ''; return; }
  const base = Number(nProdStockInput.value) || 0;
  nProdStockColorWrap.innerHTML = colores.map(c => `
    <div class="stock-color-editor">
      <span class="stock-color-swatch" style="background:${c}"></span>
      <input type="number" class="admin-input admin-input-xs input-stock-color-nuevo" data-color="${c}" value="${base}" min="0">
    </div>`).join('');
}
nProdColoresInput.addEventListener('input', regenerarStockPorColorNuevo);

/* ---- lo mismo pero por talla, para poder repartir el stock inicial
   por talla (ej: 3 en M, 8 en L) desde que se crea el producto ---- */
const nProdTallasInput = document.getElementById('nProdTallas');
const nProdStockTallaWrap = document.getElementById('nProdStockTallaWrap');
function regenerarStockPorTallaNuevo() {
  const tallas = nProdTallasInput.value.split(',').map(t => t.trim()).filter(Boolean);
  if (!tallas.length) { nProdStockTallaWrap.innerHTML = ''; return; }
  const base = Number(nProdStockInput.value) || 0;
  nProdStockTallaWrap.innerHTML = tallas.map(t => `
    <div class="stock-color-editor">
      <span class="stock-color-swatch stock-talla-swatch">${t}</span>
      <input type="number" class="admin-input admin-input-xs input-stock-talla-nuevo" data-talla="${t}" value="${base}" min="0">
    </div>`).join('');
}
nProdTallasInput.addEventListener('input', regenerarStockPorTallaNuevo);

let fotoNuevaDataUrl = null;
const inputFotoNuevo = document.getElementById('nProdFoto');
const previewFotoNuevo = document.getElementById('nProdFotoPreview');
const textoFotoNuevo = document.getElementById('nProdFotoTexto');
inputFotoNuevo.addEventListener('change', async () => {
  const file = inputFotoNuevo.files[0];
  if (!file) return;
  try {
    fotoNuevaDataUrl = await comprimirImagen(file, 700, 0.75);
    previewFotoNuevo.src = fotoNuevaDataUrl;
    previewFotoNuevo.style.display = 'block';
    textoFotoNuevo.textContent = '✓ Foto lista — clic para verla o cambiarla';
  } catch (err) {
    showToast('No se pudo usar esa imagen.', true);
  }
});
// una vez que ya hay una foto puesta, el clic abre "Ver / Cambiar" en vez
// de saltar directo al explorador (así no se reemplaza sin querer)
engancharMenuFoto(document.getElementById('nProdFotoLabel'));

document.getElementById('btnGuardarNuevo').addEventListener('click', () => {
  const nombre = document.getElementById('nProdNombre').value.trim();
  const categoria = document.getElementById('nProdCategoria').value.trim();
  const precio = document.getElementById('nProdPrecio').value;
  const stock = document.getElementById('nProdStock').value;
  const icono = document.getElementById('nProdIcono').value;
  const colores = document.getElementById('nProdColores').value.split(',').map(c => c.trim()).filter(Boolean);
  const tallas = document.getElementById('nProdTallas').value.split(',').map(t => t.trim()).filter(Boolean);

  if (!nombre || !categoria || !precio) {
    showToast('Completa al menos nombre, categoría y precio.', true);
    return;
  }
  const stockColores = {};
  nProdStockColorWrap.querySelectorAll('.input-stock-color-nuevo').forEach(inp => {
    stockColores[inp.dataset.color] = Math.max(0, Number(inp.value) || 0);
  });
  const stockTallas = {};
  nProdStockTallaWrap.querySelectorAll('.input-stock-talla-nuevo').forEach(inp => {
    stockTallas[inp.dataset.talla] = Math.max(0, Number(inp.value) || 0);
  });
  const ocultoHastaDrop = document.getElementById('nProdOcultoDrop').checked;
  agregarProductoAdmin({ nombre, categoria, precio, stock, stockColores, stockTallas, icono, colores, tallas, foto: fotoNuevaDataUrl, ocultoHastaDrop });
  showToast(ocultoHastaDrop ? `${nombre} agregado al inventario, oculto hasta el drop ✓` : `${nombre} agregado al catálogo ✓`);
  document.querySelectorAll('.admin-add-grid input').forEach(i => i.value = '');
  nProdStockColorWrap.innerHTML = '';
  nProdStockTallaWrap.innerHTML = '';
  fotoNuevaDataUrl = null;
  previewFotoNuevo.style.display = 'none';
  previewFotoNuevo.src = '';
  textoFotoNuevo.textContent = '📷 Subir foto del producto (opcional)';
  inputFotoNuevo.value = '';
  document.getElementById('nProdOcultoDrop').checked = false;
  cardNuevo.style.display = 'none';
  pintarTodo();
});

/* ---------- cambiar contraseña ---------- */
const modalClave = document.getElementById('modalClave');
document.getElementById('btnClave').addEventListener('click', () => modalClave.classList.add('open'));
document.getElementById('btnCerrarModalClave').addEventListener('click', () => modalClave.classList.remove('open'));
document.getElementById('btnGuardarClave').addEventListener('click', async () => {
  const actual = document.getElementById('claveActual').value;
  const nueva = document.getElementById('claveNueva').value;
  const codigo = document.getElementById('codigoDesarrolladorClave').value;
  if (!(await verificarCodigoDesarrollador(codigo))) { return; }
  const res = await cambiarClaveAdmin(actual, nueva);
  if (res.ok) {
    showToast('Contraseña actualizada ✓');
    modalClave.classList.remove('open');
    document.getElementById('claveActual').value = '';
    document.getElementById('claveNueva').value = '';
    document.getElementById('codigoDesarrolladorClave').value = '';
  } else {
    showToast(res.msg, true);
  }
});
