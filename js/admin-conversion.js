/* ============================================================
   admin-conversion.js — herramientas de ventas del panel
   ------------------------------------------------------------
   Se carga DESPUÉS de admin.js. admin.js llama a iniciarConversionAdmin()
   cuando el usuario ya entró al panel (así las lecturas a Firestore
   ya tienen permiso de administrador). Agrega dos tarjetas:

   1) Pestaña Envíos → "Envío gratis por monto"
      Guarda config/envio.gratisDesde. El carrito y firestore.rules lo usan.
   2) Pestaña Resumen → "Lista de espera (avísame)"
      Correos de clientes que pidieron aviso de un producto agotado,
      agrupados por producto, con botón para escribirles y marcarlos.
   ============================================================ */
(function () {
  'use strict';
  const esc = (v) => (typeof escaparHtml === 'function' ? escaparHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const aviso = (t, err) => { if (typeof showToast === 'function') showToast(t, !!err); };
  const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
  let _iniciado = false;

  /* ---------- 1) Envío gratis por monto ---------- */
  function iniciarEnvioGratis() {
    const tab = document.getElementById('tabEnvios');
    if (!tab || document.getElementById('cvGratis')) return;
    const sec = document.createElement('section');
    sec.className = 'admin-card ev-card';
    sec.id = 'cvGratis';
    sec.setAttribute('aria-labelledby', 'cvGratisT');
    sec.innerHTML = `
      <h3 class="ev-h"><span id="cvGratisT">Envío gratis por monto</span></h3>
      <p class="ev-ej" style="margin:0 0 12px">Si el subtotal del pedido llega a este valor, el envío es gratis en todo el país.
        Sirve para subir el valor promedio de cada compra. Deja 0 para no usarlo.</p>
      <label class="ev-label" for="cvGratisValor">Envío gratis desde (COP)</label>
      <div class="ev-valor"><span aria-hidden="true">$</span><input type="text" id="cvGratisValor" inputmode="numeric" autocomplete="off" placeholder="0 = desactivado"></div>
      <small class="ev-ej" id="cvGratisEj">Ejemplo: 250000</small>
      <p class="ev-error" id="cvGratisErr" role="alert"></p>
      <div class="ev-btns"><button type="button" class="admin-btn admin-btn-primary" id="cvGratisGuardar">Guardar</button></div>`;
    const cab = tab.querySelector('.ev-head');
    if (cab && cab.nextSibling) tab.insertBefore(sec, cab.nextSibling); else tab.prepend(sec);

    const inp = document.getElementById('cvGratisValor'), err = document.getElementById('cvGratisErr'), btn = document.getElementById('cvGratisGuardar');
    const leer = () => { const s = inp.value.replace(/\D/g, ''); return s === '' ? 0 : Number(s); };
    const pintar = (v) => { inp.value = v > 0 ? v.toLocaleString('es-CO') : ''; };
    pintar(typeof envioGratisDesde === 'function' ? envioGratisDesde() : 0);
    inp.addEventListener('input', () => { err.textContent = ''; const d = inp.value.replace(/\D/g, ''); inp.value = d ? Number(d).toLocaleString('es-CO') : ''; });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } });
    btn.addEventListener('click', async () => {
      const v = leer();
      if (v > 50000000) { err.textContent = 'El monto máximo es $50.000.000.'; return; }
      btn.disabled = true; const t = btn.textContent; btn.textContent = 'Guardando…';
      try {
        await guardarEnvioGratisDesde(v);
        pintar(v);
        aviso(v > 0 ? `Envío gratis desde ${pesos(v)} guardado ✓ Ya se ve en el carrito.` : 'Envío gratis desactivado ✓');
      } catch (e) {
        console.error('Error guardando el envío gratis:', e);
        err.textContent = 'No se pudo guardar. Revisa tu conexión o permisos e inténtalo de nuevo.';
      } finally { btn.disabled = false; btn.textContent = t; }
    });
  }

  /* ---------- 2) Lista de espera (avísame) ---------- */
  let _avisos = [];
  function nombreProducto(id) {
    try { const p = buscarProducto(id); if (p && p.nombre) return p.nombre; } catch (e) { /* producto borrado */ }
    return 'Producto ' + id + ' (ya no está en el catálogo)';
  }
  function enlaceProducto(id) { try { return new URL('producto.html?id=' + encodeURIComponent(id), location.href).href; } catch (e) { return ''; } }

  function pintarEspera() {
    const cont = document.getElementById('cvEsperaCont'), cnt = document.getElementById('cvEsperaConteo');
    if (!cont) return;
    const pend = _avisos.filter(a => !a.notificado);
    if (cnt) cnt.textContent = pend.length + (pend.length === 1 ? ' pendiente' : ' pendientes');
    if (!_avisos.length) { cont.innerHTML = '<p class="ev-ej" style="margin:0">Todavía nadie pidió aviso. Cuando un cliente deje su correo en una pieza agotada, aparecerá aquí.</p>'; return; }
    const grupos = {};
    _avisos.forEach(a => { (grupos[a.producto_id] = grupos[a.producto_id] || []).push(a); });
    const ordenados = Object.entries(grupos).sort((x, y) => y[1].filter(a => !a.notificado).length - x[1].filter(a => !a.notificado).length);
    cont.innerHTML = ordenados.map(([id, lista]) => {
      const p = lista.filter(a => !a.notificado);
      const variantes = {};
      p.forEach(a => { const k = [a.color, a.talla].filter(Boolean).join(' / ') || 'sin variante'; variantes[k] = (variantes[k] || 0) + 1; });
      const det = Object.entries(variantes).map(([k, n]) => `${esc(k)}: ${n}`).join(' · ');
      return `<div class="cv-grupo" data-id="${esc(id)}" style="padding:12px 0;border-top:1px solid var(--line,#262626)">
        <div><b>${esc(nombreProducto(id))}</b> — ${p.length} esperando${lista.length > p.length ? ` <small>(${lista.length - p.length} ya avisados)</small>` : ''}</div>
        <small style="display:block;margin:4px 0 8px;opacity:.75">${det || 'Todos ya fueron avisados.'}</small>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="admin-btn admin-btn-primary" data-cv="mail" ${p.length ? '' : 'disabled'}>Escribirles</button>
          <button type="button" class="admin-btn admin-btn-ghost" data-cv="copiar" ${p.length ? '' : 'disabled'}>Copiar correos</button>
          <button type="button" class="admin-btn admin-btn-ghost" data-cv="hecho" ${p.length ? '' : 'disabled'}>Marcar como avisados</button>
          <button type="button" class="admin-btn admin-btn-ghost" data-cv="borrar">Borrar lista</button>
        </div></div>`;
    }).join('');
  }

  async function cargarEspera() {
    const cont = document.getElementById('cvEsperaCont');
    if (cont) cont.innerHTML = '<p class="ev-ej" style="margin:0">Cargando…</p>';
    try { _avisos = await listarAvisosStock(); pintarEspera(); }
    catch (e) {
      console.error('Error cargando la lista de espera:', e);
      if (cont) cont.innerHTML = '<p class="ev-error" style="margin:0">No se pudo cargar la lista de espera. ¿Publicaste las reglas nuevas de Firestore?</p>';
    }
  }

  function iniciarEspera() {
    const ancla = document.getElementById('rsMas');
    if (!ancla || document.getElementById('cvEspera')) return;
    const sec = document.createElement('section');
    sec.className = 'admin-card';
    sec.id = 'cvEspera';
    sec.setAttribute('aria-labelledby', 'cvEsperaT');
    sec.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
        <h3 id="cvEsperaT" style="margin:0">Lista de espera (avísame)</h3>
        <span class="ev-pill" id="cvEsperaConteo" aria-live="polite">0 pendientes</span>
        <button type="button" class="admin-btn admin-btn-ghost" id="cvEsperaRef" style="margin-left:auto">Actualizar</button>
      </div>
      <p class="ev-ej" style="margin:0 0 6px">Clientes que quieren una pieza agotada. Cuando vuelva el stock, escríbeles desde aquí: cada pedido que se pierde por falta de inventario puede recuperarse.</p>
      <div id="cvEsperaCont"></div>`;
    ancla.parentNode.insertBefore(sec, ancla);
    document.getElementById('cvEsperaRef').addEventListener('click', cargarEspera);

    sec.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-cv]'); if (!b) return;
      const g = b.closest('.cv-grupo'); const id = g && g.dataset.id; if (!id) return;
      const lista = _avisos.filter(a => a.producto_id === id), pend = lista.filter(a => !a.notificado);
      const correos = [...new Set(pend.map(a => a.correo))];
      const acc = b.dataset.cv;
      if (acc === 'copiar') {
        aviso(await _copiarTexto(correos.join(', ')) ? `${correos.length} correos copiados ✓` : 'No se pudo copiar.', false);
      } else if (acc === 'mail') {
        const nombre = nombreProducto(id);
        const asunto = `¡Ya volvió ${nombre}! — MAQUINA`;
        const cuerpo = `Hola,\n\nMe pediste que te avisara cuando ${nombre} volviera a estar disponible. Ya hay stock, pero las piezas vuelan:\n${enlaceProducto(id)}\n\nEquipo MAQUINA`;
        const url = `mailto:?bcc=${encodeURIComponent(correos.join(','))}&subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
        if (url.length > 1900) { aviso('Son muchos correos para abrir de un golpe. Usa "Copiar correos" y pégalos en tu correo (en copia oculta).', true); return; }
        location.href = url;
      } else if (acc === 'hecho') {
        try { await marcarAvisosStock(pend.map(a => a._id), true); aviso('Marcados como avisados ✓'); await cargarEspera(); }
        catch (e) { console.error(e); aviso('No se pudo actualizar.', true); }
      } else if (acc === 'borrar') {
        const sigue = await confirmarAccion({
          titulo: 'Borrar lista de espera',
          mensaje: `Se borrarán los ${lista.length} avisos de "${nombreProducto(id)}". Esta acción no se puede deshacer.`,
          textoOk: 'Borrar', peligro: true
        });
        if (!sigue) return;
        try { await Promise.all(lista.map(a => borrarAvisoStock(a._id))); aviso('Lista borrada ✓'); await cargarEspera(); }
        catch (e) { console.error(e); aviso('No se pudo borrar.', true); }
      }
    });
    cargarEspera();
  }

  /** La llama admin.js (entrarAlPanel) cuando ya hay sesión de administrador. */
  window.iniciarConversionAdmin = function () {
    if (_iniciado) return;
    _iniciado = true;
    try { iniciarEnvioGratis(); } catch (e) { console.error('Envío gratis (admin):', e); }
    try { iniciarEspera(); } catch (e) { console.error('Lista de espera (admin):', e); }
  };
})();
