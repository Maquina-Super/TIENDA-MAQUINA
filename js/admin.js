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
  await Promise.all([cargarCatalogo(), cargarConfigDrop()]); // catálogo y config del drop desde Firestore antes de pintar la tabla
  pintarTodo();
  pintarVoltageClub();
  iniciarVigiaInactividadAdmin();
}

/* ---------- pestaña Resumen: correos del Voltage Club ---------- */
let _correosVoltageClub = [];

async function pintarVoltageClub() {
  const tbody = document.getElementById('voltageClubTablaBody');
  const totalEl = document.getElementById('voltageClubTotal');
  try {
    _correosVoltageClub = await obtenerSuscriptoresVoltageClub();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--adm-text-dim);">No se pudo cargar (revisa tu conexión o permisos).</td></tr>`;
    return;
  }
  totalEl.textContent = `(${_correosVoltageClub.length})`;
  if (!_correosVoltageClub.length) {
    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--adm-text-dim);">Todavía no hay correos registrados.</td></tr>`;
    return;
  }
  tbody.innerHTML = _correosVoltageClub.map(s => `
    <tr>
      <td>${s.correo}</td>
      <td>${s.fecha ? new Date(s.fecha).toLocaleDateString('es-CO') : '—'}</td>
    </tr>
  `).join('');
}

document.getElementById('btnCopiarVoltageClub').addEventListener('click', () => {
  if (!_correosVoltageClub.length) { showToast('No hay correos todavía.', true); return; }
  const texto = _correosVoltageClub.map(s => s.correo).join(', ');
  navigator.clipboard.writeText(texto)
    .then(() => showToast('Correos copiados al portapapeles'))
    .catch(() => showToast('No se pudo copiar', true));
});

document.getElementById('btnDescargarVoltageClub').addEventListener('click', () => {
  if (!_correosVoltageClub.length) { showToast('No hay correos todavía.', true); return; }
  const filas = ['correo,fecha'].concat(
    _correosVoltageClub.map(s => `${s.correo},${s.fecha ? new Date(s.fecha).toISOString() : ''}`)
  );
  const blob = new Blob([filas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'voltage-club.csv';
  a.click();
  URL.revokeObjectURL(url);
});

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
    const sigue = confirm(
      `Son ${_correosVoltageClub.length} correos. Gmail gratis deja mandar más o menos 100 destinatarios al día en total (contando también los correos de pedidos y de códigos del panel). ¿Seguro que quieres mandarlo ya?`
    );
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

  const mapa = [
    [tabBtnResumen, '__resumen__'],
    [tabBtnInventario, 'inventario'],
    [tabBtnPedidos, 'pedidos'],
    [tabBtnDrop, 'drop'],
    [tabBtnUsuarios, 'usuarios'],
  ];
  mapa.forEach(([btn, permiso]) => {
    if (permiso === '__resumen__') return; // ya se resolvió arriba
    btn.style.display = permisosActuales[permiso] ? '' : 'none';
  });
  permisosActuales.__resumen__ = puedeVerResumen;
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
const tabBtnDrop = document.getElementById('tabBtnDrop');
const tabBtnUsuarios = document.getElementById('tabBtnUsuarios');
const tabResumen = document.getElementById('tabResumen');
const tabInventario = document.getElementById('tabInventario');
const tabPedidos = document.getElementById('tabPedidos');
const tabDrop = document.getElementById('tabDrop');
const tabUsuarios = document.getElementById('tabUsuarios');
const tituloTab = document.getElementById('adminTituloTab');

function ocultarTodasLasPestanas() {
  clearInterval(intervaloCountdownDrop);
  tabBtnResumen.classList.remove('active');
  tabBtnInventario.classList.remove('active');
  tabBtnPedidos.classList.remove('active');
  tabBtnDrop.classList.remove('active');
  tabBtnUsuarios.classList.remove('active');
  tabResumen.style.display = 'none';
  tabInventario.style.display = 'none';
  tabPedidos.style.display = 'none';
  tabDrop.style.display = 'none';
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

tabBtnDrop.addEventListener('click', () => {
  if (!permisosActuales.drop) return;
  ocultarTodasLasPestanas();
  tabBtnDrop.classList.add('active');
  tabDrop.style.display = 'block';
  tituloTab.textContent = 'Próximo drop';
  pintarTabDrop();
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
async function pintarUsuariosPanel() {
  const tbody = document.getElementById('tablaUsuariosPanelBody');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--gray);">Cargando usuarios…</td></tr>`;
  const usuarios = await obtenerUsuariosAdminPanel();

  const activos = usuarios.filter(u => u.activo !== false).length;
  const conectados = usuarios.filter(u => u.conectado).length;
  document.getElementById('usuariosStats').innerHTML = `
    <div class="admin-stat admin-stat-forest"><b>${usuarios.length}</b><span>Usuarios</span></div>
    <div class="admin-stat admin-stat-sage"><b>${activos}</b><span>Activos</span></div>
    <div class="admin-stat admin-stat-acento"><b>${conectados}</b><span>Conectados ahora</span></div>
  `;

  if (!usuarios.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--gray);">Todavía no hay usuarios.</td></tr>`;
    return;
  }
  const yo = usuarioAdminActual();
  const ETIQUETAS_PERMISOS = { inventario: 'Inventario', pedidos: 'Pedidos', eliminarPedidos: 'Eliminar pedidos', drop: 'Drop', usuarios: 'Usuarios' };
  const COLORES_AVATAR = ['#1b4332', '#c9a13a', '#8a5a44', '#4a6fa5', '#a3477a', '#3b7a63'];
  const colorAvatar = nombre => COLORES_AVATAR[[...nombre].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORES_AVATAR.length];
  tbody.innerHTML = usuarios.map(u => {
    const creado = u.creado ? new Date(u.creado).toLocaleDateString('es-CO', { dateStyle: 'medium' }) : '—';
    const permisos = normalizarPermisos(u);
    const activosPermisos = Object.keys(permisos).filter(k => permisos[k]);
    const permisosTexto = activosPermisos.length
      ? activosPermisos.map(k => `<span class="admin-permiso-pill">${ETIQUETAS_PERMISOS[k]}</span>`).join(' ')
      : '<span class="admin-foto-hint">Sin permisos</span>';
    const etiqueta = u.correo || u.usuario;
    return `
      <tr>
        <td data-label="Usuario">
          <div class="usuario-fila">
            <span class="usuario-avatar" style="background:${colorAvatar(etiqueta)}" title="${u.usuario}">${etiqueta.charAt(0).toUpperCase()}</span>
            <b>${etiqueta}</b>${u.usuario === yo ? ' <span class="admin-foto-hint">(tú)</span>' : ''}${u.superAdmin ? ' <span class="admin-permiso-pill">superAdmin</span>' : ''}
          </div>
        </td>
        <td data-label="Estado"><span class="usuario-estado-pill ${u.activo === false ? 'usuario-estado-inactivo' : 'usuario-estado-activo'}">${u.activo === false ? 'Desactivado' : 'Activo'}</span></td>
        <td data-label="Permisos">${permisosTexto}</td>
        <td data-label="Conectado">${u.conectado ? '<span class="usuario-estado-pill usuario-estado-conectado">🟢 Sí</span>' : '<span class="usuario-estado-pill usuario-estado-desconectado">⚪ No</span>'}</td>
        <td data-label="Creado" class="mono">${creado}</td>
        <td data-label="">
          <button type="button" class="admin-btn admin-btn-ghost btn-editar-permisos" data-usuario="${u.usuario}" data-correo="${etiqueta}" data-permisos='${JSON.stringify(permisos)}'>Editar permisos</button>
          <button type="button" class="admin-btn admin-btn-ghost btn-toggle-usuario" data-usuario="${u.usuario}" data-correo="${etiqueta}" data-activo="${u.activo !== false}">${u.activo === false ? 'Activar' : 'Desactivar'}</button>
          ${u.usuario === yo ? '' : `<button type="button" class="admin-btn admin-btn-ghost btn-eliminar-usuario" data-usuario="${u.usuario}" data-correo="${etiqueta}">Eliminar</button>`}
        </td>
      </tr>`;
  }).join('');
}

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
  document.querySelectorAll('.chk-permiso-nuevo').forEach(chk => { chk.checked = (chk.value === 'inventario' || chk.value === 'pedidos'); });
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
    if (!confirm(`¿Eliminar a "${etiqueta}"? No se puede deshacer. Esto le quita el acceso real a Firestore y borra su perfil/permisos del panel, pero NO borra su cuenta de Firebase Authentication (eso, si quieres, se hace aparte desde la consola de Firebase).`)) return;
    btnEliminar.disabled = true;
    const res = await eliminarUsuarioAdminPanel(usuario, btnEliminar.dataset.correo);
    btnEliminar.disabled = false;
    if (!res.ok) { showToast(res.msg, true); return; }
    showToast('Usuario eliminado');
    pintarUsuariosPanel();
  }
});

/* ---------- pestaña Drop: fecha del lanzamiento + productos a mostrar ---------- */
let intervaloCountdownDrop = null;

function pintarTabDrop() {
  const config = getConfigDrop();
  const inputFecha = document.getElementById('dropFecha');
  const inputTitulo = document.getElementById('dropTitulo');
  // <input type="datetime-local"> necesita "YYYY-MM-DDTHH:MM" en hora LOCAL del navegador
  if (config.fecha) {
    const d = new Date(config.fecha);
    const pad = n => String(n).padStart(2, '0');
    inputFecha.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } else {
    inputFecha.value = '';
  }
  inputTitulo.value = config.titulo || '';

  const productos = obtenerProductosAdmin();
  const idsElegidos = new Set((config.productos || []).map(String));
  const lista = document.getElementById('dropProductosLista');
  lista.innerHTML = productos.map(p => {
    const foto = (p.fotos && p.fotos[p.colores[0]]) || p.foto;
    const miniatura = foto ? `<img src="${foto}" class="admin-drop-prod-thumb">` : iconoProducto(p.icono, p.colores[0]);
    return `
      <label class="admin-drop-prod-item">
        <input type="checkbox" class="chk-drop-producto" value="${p.id}" ${idsElegidos.has(String(p.id)) ? 'checked' : ''}>
        <span class="admin-drop-prod-thumb-wrap">${miniatura}</span>
        <span>${p.nombre}</span>
      </label>`;
  }).join('') || `<p class="admin-foto-hint">Todavía no hay productos en el inventario.</p>`;

  actualizarContadorDropProductos();
  actualizarCountdownDrop();
  clearInterval(intervaloCountdownDrop);
  intervaloCountdownDrop = setInterval(actualizarCountdownDrop, 1000);
}

function actualizarContadorDropProductos() {
  const total = document.querySelectorAll('.chk-drop-producto:checked').length;
  document.getElementById('dropProductosContador').textContent = `${total} elegido${total === 1 ? '' : 's'}`;
}
document.getElementById('dropProductosLista').addEventListener('change', actualizarContadorDropProductos);

/** Pinta una tarjeta con la cuenta regresiva en vivo, leyendo la
    fecha directamente del campo (así el vendedor ve el efecto
    antes de guardar). Se refresca cada segundo mientras la
    pestaña Drop está abierta. */
function actualizarCountdownDrop() {
  const cont = document.getElementById('dropCountdownStats');
  const valorFecha = document.getElementById('dropFecha').value;
  if (!valorFecha) {
    cont.innerHTML = `<div class="admin-stat"><b>—</b><span>Todavía no hay fecha configurada</span></div>`;
    return;
  }
  const restante = new Date(valorFecha).getTime() - Date.now();
  if (restante <= 0) {
    cont.innerHTML = `<div class="admin-stat admin-stat-forest"><b>🔥 En vivo</b><span>El drop ya está disponible en la tienda</span></div>`;
    return;
  }
  const dias = Math.floor(restante / 86400000);
  const horas = Math.floor((restante % 86400000) / 3600000);
  const minutos = Math.floor((restante % 3600000) / 60000);
  cont.innerHTML = `
    <div class="admin-stat admin-stat-acento"><b>${dias}</b><span>Días</span></div>
    <div class="admin-stat admin-stat-sage"><b>${horas}</b><span>Horas</span></div>
    <div class="admin-stat admin-stat-butter"><b>${minutos}</b><span>Minutos</span></div>
  `;
}
document.getElementById('dropFecha').addEventListener('input', actualizarCountdownDrop);

document.getElementById('btnGuardarDrop').addEventListener('click', () => {
  const inputFecha = document.getElementById('dropFecha');
  const inputTitulo = document.getElementById('dropTitulo');
  const idsElegidos = Array.from(document.querySelectorAll('.chk-drop-producto:checked')).map(chk => Number(chk.value) || chk.value);
  // el <input datetime-local> ya está en hora local -> new Date(...) lo interpreta como local y toISOString() lo pasa a UTC para guardarlo sin ambigüedad
  const fechaISO = inputFecha.value ? new Date(inputFecha.value).toISOString() : null;
  guardarConfigDropAdmin({ fecha: fechaISO, titulo: inputTitulo.value.trim(), productos: idsElegidos });
  showToast('Configuración del drop guardada ✓');
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

async function pintarPedidos() {
  const tbody = document.getElementById('tablaPedidosBody');
  tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--gray);">Cargando pedidos…</td></tr>`;
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
      const bolsa = `${p.nombre_cliente || ''} ${p.email_cliente || ''} ${p.telefono_cliente || ''} ${p.detalle || ''}`.toLowerCase();
      if (!bolsa.includes(texto)) return false;
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
  const totalVendido = pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const pendientesFiltrados = pedidos.filter(p => estadoPedido(p) === 'pendiente').length;
  document.getElementById('pedidosStats').innerHTML = `
    <div class="admin-stat admin-stat-forest"><b>${pedidos.length}</b><span>Pedidos</span></div>
    <div class="admin-stat admin-stat-acento"><b>$${totalVendido.toLocaleString('es-CO')}</b><span>Total vendido</span></div>
    <div class="admin-stat admin-stat-butter"><b>${pendientesFiltrados}</b><span>Pendientes</span></div>
  `;

  if (!pedidosCache.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--gray);">Todavía no hay pedidos.</td></tr>`;
    document.getElementById('paginacionPedidos').innerHTML = '';
    return;
  }
  if (!pedidos.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--gray);">Ningún pedido coincide con el filtro.</td></tr>`;
    document.getElementById('paginacionPedidos').innerHTML = '';
    return;
  }

  // ---- paginación: solo se pinta la página actual, pero stats/CSV arriba usan la lista completa ----
  const totalPaginas = Math.max(1, Math.ceil(pedidos.length / PEDIDOS_POR_PAGINA));
  if (paginaPedidos > totalPaginas) paginaPedidos = totalPaginas;
  const inicio = (paginaPedidos - 1) * PEDIDOS_POR_PAGINA;
  const pedidosPagina = pedidos.slice(inicio, inicio + PEDIDOS_POR_PAGINA);

  tbody.innerHTML = pedidosPagina.map(p => {
    const fecha = p.fecha ? new Date(p.fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    const envioTexto = [p.envio_direccion, p.envio_barrio, p.envio_municipio].filter(Boolean).join(', ');
    const estadoActual = estadoPedido(p);
    const numero = numerosPedidoCache.get(p.id) || '—';
    const opcionesEstado = Object.entries(ESTADOS_PEDIDO).map(([valor, info]) =>
      `<option value="${valor}" ${valor === estadoActual ? 'selected' : ''}>${info.emoji} ${info.label}</option>`).join('');
    return `
      <tr>
        <td data-label="N°"><span class="pedido-numero mono" title="ID interno: ${p.id}">#${numero}</span></td>
        <td data-label="Fecha" class="mono" style="white-space:nowrap;">${fecha}</td>
        <td data-label="Cliente"><b>${p.nombre_cliente || '—'}</b></td>
        <td data-label="Contacto">${p.email_cliente || ''}<br><span style="color:var(--gray);">${p.telefono_cliente || ''}</span></td>
        <td data-label="Productos">${p.detalle || '—'}</td>
        <td data-label="Envío">${envioTexto || '—'}</td>
        <td data-label="Pago">${p.metodo_pago === 'tarjeta' ? `Tarjeta •••• ${p.tarjeta_final || ''}` : 'Contraentrega'}</td>
        <td data-label="Total" class="mono"><b>$${(Number(p.total) || 0).toLocaleString('es-CO')}</b></td>
        <td data-label="Estado"><select class="admin-input select-estado-pedido estado-select-${estadoActual}" data-id="${p.id}">${opcionesEstado}</select></td>
        <td data-label="">
          <button type="button" class="admin-btn admin-btn-ghost btn-ver-historial" data-id="${p.id}">Historial</button>
          ${permisosActuales.eliminarPedidos ? `<button type="button" class="admin-btn admin-btn-ghost btn-borrar-pedido" data-id="${p.id}">Eliminar</button>` : ''}
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
    const pago = p.metodo_pago === 'tarjeta' ? `Tarjeta ****${p.tarjeta_final || ''}` : 'Contraentrega';
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

/* ---------- cambiar el estado de un pedido desde la tabla ---------- */
document.getElementById('tablaPedidosBody').addEventListener('change', async (e) => {
  const select = e.target.closest('.select-estado-pedido');
  if (!select) return;
  const id = select.dataset.id;
  const nuevoEstado = select.value;
  select.disabled = true;
  const res = await actualizarEstadoPedidoAdmin(id, nuevoEstado);
  select.disabled = false;
  if (!res.ok) { showToast(res.msg, true); return; }
  const pedidoLocal = pedidosCache.find(p => p.id === id);
  if (pedidoLocal) {
    pedidoLocal.estado = nuevoEstado;
    pedidoLocal.historial_estados = [...(pedidoLocal.historial_estados || []), res.entradaHistorial];
  }
  select.className = `admin-input select-estado-pedido estado-select-${nuevoEstado}`;
  showToast('Estado del pedido actualizado ✓');
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
  showToast('Pedido eliminado');
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
  const contResumen = document.getElementById('resumenStats');
  contResumen.innerHTML = `<div class="admin-stat"><b>…</b><span>Cargando</span></div>`;

  const [productos, pedidos] = await Promise.all([
    Promise.resolve(obtenerProductosAdmin()),
    obtenerPedidosAdmin(),
  ]);
  pedidosCache = pedidos; // así la pestaña Pedidos no tiene que volver a pedirlos si el admin la abre después
  numerosPedidoCache = mapaNumerosPedido(pedidos);

  const totalVendido = pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const pendientes = pedidos.filter(p => estadoPedido(p) === 'pendiente').length;

  if (permisosActuales.pedidos) {
    contResumen.innerHTML = `
      <div class="admin-stat admin-stat-forest"><b>${pedidos.length}</b><span>Pedidos</span></div>
      <div class="admin-stat admin-stat-acento"><b>$${totalVendido.toLocaleString('es-CO')}</b><span>Total vendido</span></div>
      <div class="admin-stat admin-stat-butter"><b>${pendientes}</b><span>Pedidos pendientes</span></div>
      <div class="admin-stat admin-stat-sage"><b>${productos.length}</b><span>Productos</span></div>
    `;
  } else {
    // usuario sin permiso de pedidos: solo mostramos lo de inventario
    contResumen.innerHTML = `
      <div class="admin-stat admin-stat-sage"><b>${productos.length}</b><span>Productos</span></div>
      <div class="admin-stat admin-stat-warn"><b>${productos.filter(p => estaAgotado(p)).length}</b><span>Agotados</span></div>
    `;
  }

  if (!permisosActuales.pedidos) {
    document.getElementById('resumenChart').innerHTML = `<p class="admin-foto-hint">No tienes permiso para ver los pedidos.</p>`;
    document.getElementById('resumenTopProductos').innerHTML = '';
    document.getElementById('resumenUltimosPedidos').innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--gray);">Sin acceso.</td></tr>`;
    return;
  }

  /* --- gráfica de ventas de los últimos 7 días --- */
  const hoy = new Date();
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    dias.push({ clave: d.toISOString().slice(0, 10), etiqueta: d.toLocaleDateString('es-CO', { weekday: 'short' }) });
  }
  const ventasPorDia = dias.map(d => ({
    ...d,
    total: pedidos.filter(p => p.fecha && p.fecha.slice(0, 10) === d.clave).reduce((s, p) => s + (Number(p.total) || 0), 0),
  }));
  const maxVenta = Math.max(1, ...ventasPorDia.map(d => d.total));
  document.getElementById('resumenChart').innerHTML = ventasPorDia.map(d => `
    <div class="chart-bar-col" title="$${d.total.toLocaleString('es-CO')}">
      <div class="chart-bar" style="height:${Math.max(4, Math.round(d.total / maxVenta * 100))}%"></div>
      <span class="chart-bar-label">${d.etiqueta}</span>
    </div>
  `).join('') || `<p class="admin-foto-hint">Todavía no hay ventas.</p>`;

  /* --- productos más vendidos (contando cuántas veces aparece cada nombre en los pedidos) --- */
  const conteoProductos = {};
  pedidos.forEach(p => (p.items || []).forEach(it => {
    conteoProductos[it.nombre] = (conteoProductos[it.nombre] || 0) + 1;
  }));
  const topProductos = Object.entries(conteoProductos).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCantidad = Math.max(1, ...topProductos.map(([, c]) => c));
  document.getElementById('resumenTopProductos').innerHTML = topProductos.length
    ? topProductos.map(([nombre, cantidad]) => `
        <div class="top-prod-fila">
          <span class="top-prod-nombre">${nombre}</span>
          <div class="top-prod-barra-wrap"><div class="top-prod-barra" style="width:${Math.round(cantidad / maxCantidad * 100)}%"></div></div>
          <span class="top-prod-cantidad">${cantidad}</span>
        </div>`).join('')
    : `<p class="admin-foto-hint">Todavía no hay ventas.</p>`;

  /* --- últimos 5 pedidos --- */
  const ultimos = pedidos.slice(0, 5);
  document.getElementById('resumenUltimosPedidos').innerHTML = ultimos.length
    ? ultimos.map(p => {
        const fecha = p.fecha ? new Date(p.fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
        const est = estadoPedido(p);
        const numero = numerosPedidoCache.get(p.id) || '—';
        return `<tr>
          <td data-label="N°"><span class="pedido-numero mono">#${numero}</span></td>
          <td data-label="Fecha" class="mono" style="white-space:nowrap;">${fecha}</td>
          <td data-label="Cliente"><b>${p.nombre_cliente || '—'}</b></td>
          <td data-label="Total" class="mono">$${(Number(p.total) || 0).toLocaleString('es-CO')}</td>
          <td data-label="Estado"><span class="pedido-estado-pill estado-pill-${est}">${ESTADOS_PEDIDO[est].emoji} ${ESTADOS_PEDIDO[est].label}</span></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--gray);">Todavía no hay pedidos.</td></tr>`;
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
  document.getElementById('adminStats').innerHTML = `
    <div class="admin-stat"><b>${totalProductos}</b><span>Productos</span></div>
    <div class="admin-stat"><b>${totalUnidades}</b><span>Unidades en stock</span></div>
    <div class="admin-stat admin-stat-warn"><b>${agotados}</b><span>Agotados</span></div>
    <div class="admin-stat admin-stat-warn"><b>${tallasAgotadas}</b><span>Tallas agotadas</span></div>
    ${stockBajo > 0 ? `<div class="admin-stat admin-stat-low"><b>${stockBajo}</b><span>Con poco stock (≤ ${STOCK_BAJO_UMBRAL})</span></div>` : ''}
    ${coloresAgotados > 0 ? `<div class="admin-stat admin-stat-warn"><b>${coloresAgotados}</b><span>Colores agotados</span></div>` : ''}
    
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
function renderInventario() {
  const texto = inputBuscarProducto.value.trim().toLowerCase();
  let productos = aplicarOrdenProductos(obtenerProductosAdmin());
  if (texto) {
    productos = productos.filter(p =>
      (p.nombre || '').toLowerCase().includes(texto) || (p.categoria || '').toLowerCase().includes(texto));
  }
  const totalPaginas = Math.max(1, Math.ceil(productos.length / PRODUCTOS_POR_PAGINA));
  if (paginaProductos > totalPaginas) paginaProductos = totalPaginas;
  const inicio = (paginaProductos - 1) * PRODUCTOS_POR_PAGINA;
  pintarTabla(productos.slice(inicio, inicio + PRODUCTOS_POR_PAGINA), !productos.length, !!texto);
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
    tbody.innerHTML = `<tr class="fila-vacia"><td colspan="10" style="text-align:center;padding:30px;color:var(--adm-text-dim);">${hayFiltro ? 'Ningún producto coincide con la búsqueda.' : 'No hay productos en esta página.'}</td></tr>`;
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

    const estadoPill = agotado
      ? '<span class="estado-pill out">Agotado</span>'
      : (nivel === 'bajo' ? `<span class="estado-pill low">Quedan ${stockTotal}</span>` : '<span class="estado-pill ok">Disponible</span>');
    const oculto = !p.activo ? '<span class="estado-pill oculto">Oculto</span>' : '';
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
          <button type="button" class="admin-btn admin-btn-xs btn-editar-fila" aria-label="Editar ${_escAdm(p.nombre)}"><span aria-hidden="true">✏️</span> Editar</button>
          <button type="button" class="admin-btn admin-btn-xs btn-borrar-fila" aria-label="Eliminar ${_escAdm(p.nombre)}"><span aria-hidden="true">🗑</span> Eliminar</button>
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
  renderInventario();
  if (tabResumen.style.display !== 'none') pintarResumen();
}

/* ---------- buscador del inventario (ahora se aplica junto con la paginación en renderInventario) ---------- */
const inputBuscarProducto = document.getElementById('buscarProductoAdmin');
inputBuscarProducto.addEventListener('input', () => { paginaProductos = 1; renderInventario(); });

/* ---------- agregar producto nuevo ---------- */
const cardNuevo = document.getElementById('cardNuevoProducto');
document.getElementById('btnMostrarNuevo').addEventListener('click', () => {
  cardNuevo.style.display = cardNuevo.style.display === 'none' ? 'block' : 'none';
});
document.getElementById('btnCancelarNuevo').addEventListener('click', () => {
  cardNuevo.style.display = 'none';
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
  agregarProductoAdmin({ nombre, categoria, precio, stock, stockColores, stockTallas, icono, colores, tallas, foto: fotoNuevaDataUrl });
  showToast(`${nombre} agregado al catálogo ✓`);
  document.querySelectorAll('.admin-add-grid input').forEach(i => i.value = '');
  nProdStockColorWrap.innerHTML = '';
  nProdStockTallaWrap.innerHTML = '';
  fotoNuevaDataUrl = null;
  previewFotoNuevo.style.display = 'none';
  previewFotoNuevo.src = '';
  textoFotoNuevo.textContent = '📷 Subir foto del producto (opcional)';
  inputFotoNuevo.value = '';
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
