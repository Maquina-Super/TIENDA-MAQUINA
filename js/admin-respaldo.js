/* ============================================================
   RESPALDO DE FIRESTORE (panel admin)
   ------------------------------------------------------------
   Agrega el botón "Descargar respaldo" al panel. Baja los datos
   de la tienda a un archivo .json en tu computador, para tener
   una copia si algo se borra por error. Solo LEE datos: no
   modifica nada. Funciona en el plan gratuito de Firebase.

   No se incluyen (por seguridad): admin_usuarios, admin_sesiones,
   panel_codigos y telefonos. La colección "usuarios" tampoco,
   porque las reglas solo dejan a cada cliente leer la suya.
   Cómo restaurar: ver docs/RESPALDO_FIRESTORE.txt
   ============================================================ */
(function () {
  'use strict';

  const COLECCIONES = [
    'productos', 'pedidos', 'resenas', 'mensajes_contacto',
    'voltage_club', 'config', 'drop_borradores', 'admin_config'
  ];
  const COLECCIONES_FOTOS = ['resenas_fotos', 'mensajes_contacto_fotos'];

  function aviso(txt, error) {
    if (typeof showToast === 'function') showToast(txt, !!error);
    else alert(txt);
  }

  /* Convierte fechas de Firestore (Timestamp) y referencias a JSON legible. */
  function limpiar(v) {
    if (v === null || v === undefined) return v;
    if (typeof v.toDate === 'function') return { __fecha: v.toDate().toISOString() };
    if (Array.isArray(v)) return v.map(limpiar);
    if (typeof v === 'object') {
      if (v.path && v.firestore) return { __ref: v.path };
      const o = {};
      Object.keys(v).forEach(function (k) { o[k] = limpiar(v[k]); });
      return o;
    }
    return v;
  }

  async function leerColeccion(nombre) {
    const snap = await fbDb.collection(nombre).get();
    const docs = {};
    snap.forEach(function (d) { docs[d.id] = limpiar(d.data()); });
    return docs;
  }

  async function descargarRespaldo(btn) {
    if (typeof fbDb === 'undefined') return aviso('Firebase no está listo todavía.', true);
    const conFotos = confirm(
      '¿Incluir también las fotos de reseñas y de mensajes de contacto?\n\n' +
      'Aceptar = con fotos (el archivo puede pesar varios MB).\n' +
      'Cancelar = solo textos y datos (recomendado para el día a día).'
    );
    const lista = COLECCIONES.concat(conFotos ? COLECCIONES_FOTOS : []);
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    const respaldo = {
      _info: {
        proyecto: (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId) || '',
        generado: new Date().toISOString(),
        incluyeFotos: conFotos,
        nota: 'Respaldo de lectura generado desde el panel admin. Las fechas van como {__fecha: ISO}.'
      },
      colecciones: {},
      errores: {}
    };
    let total = 0;
    for (let i = 0; i < lista.length; i++) {
      const nombre = lista[i];
      btn.textContent = 'Respaldando ' + (i + 1) + '/' + lista.length + '…';
      try {
        respaldo.colecciones[nombre] = await leerColeccion(nombre);
        total += Object.keys(respaldo.colecciones[nombre]).length;
      } catch (e) {
        respaldo.errores[nombre] = String((e && e.message) || e);
        console.error('[respaldo]', nombre, e);
      }
    }
    try {
      const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      const f = new Date();
      const p = function (n) { return String(n).padStart(2, '0'); };
      a.href = URL.createObjectURL(blob);
      a.download = 'respaldo-maquina-' + f.getFullYear() + '-' + p(f.getMonth() + 1) + '-' + p(f.getDate()) +
        '_' + p(f.getHours()) + p(f.getMinutes()) + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      const fallos = Object.keys(respaldo.errores).length;
      aviso('Respaldo descargado: ' + total + ' registros' + (fallos ? ' (' + fallos + ' colección(es) con error, ver el archivo)' : '') + '.', fallos > 0);
    } catch (e) {
      console.error('[respaldo]', e);
      aviso('No se pudo crear el archivo de respaldo.', true);
    }
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }

  function montar() {
    const salir = document.getElementById('btnSalirAdmin');
    if (!salir || document.getElementById('btnRespaldo')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btnRespaldo';
    btn.className = 'admin-btn admin-btn-ghost';
    btn.textContent = 'Descargar respaldo';
    btn.title = 'Baja una copia de los datos de la tienda (pedidos, productos, mensajes...) a tu computador';
    btn.addEventListener('click', function () { descargarRespaldo(btn); });
    salir.parentNode.insertBefore(btn, salir);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
