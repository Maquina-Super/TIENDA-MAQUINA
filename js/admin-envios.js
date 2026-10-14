/* ============================================================
   admin-envios.js — Pestaña Envíos: tarifas por ciudad / municipio
   - Busca cualquier municipio de Colombia (js/envio-municipios.js).
   - Tarifa en COP o envío gratis.
   - Se guarda en Firestore (config/envio -> municipios) con
     guardarTarifaMunicipio() de js/store.js y el carrito la aplica sola.
   - Las tarifas base por zona (editor de abajo) siguen igual: se usan
     en las ciudades que no tienen tarifa propia.
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  if (!$('evGuardar')) return;

  const POR_PAGINA = 10;
  const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const st = { sel: null, pagina: 1, q: '', depto: '', guardando: false, iniciado: false };

  const ICO_PIN = '<svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  const ICO_EDIT = '<svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
  const ICO_DEL = '<svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';

  /* ---------- selects de departamento / municipio ---------- */
  function departamentosOrdenados() {
    return departamentosColombia().slice().sort((a, b) => a.localeCompare(b, 'es'));
  }
  function poblarDepartamentos() {
    const opts = departamentosOrdenados().map(d => `<option value="${_escAdm(d)}">${_escAdm(d)}</option>`).join('');
    $('evDepto').innerHTML = '<option value="">Todos los departamentos</option>' + opts;
    $('evFiltroDepto').innerHTML = '<option value="">Todos los departamentos</option>' + opts;
  }
  function poblarMunicipios() {
    const dep = $('evDepto').value;
    const lista = todosLosMunicipios().filter(m => !dep || m.departamento === dep)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    $('evMuni').innerHTML = '<option value="">Selecciona una ubicación</option>' + lista.map(m =>
      `<option value="${m.id}">${_escAdm(m.nombre)}${dep ? '' : ' — ' + _escAdm(m.departamento)}</option>`).join('');
    if (st.sel && lista.some(m => m.id === st.sel.id)) $('evMuni').value = st.sel.id;
  }

  /* ---------- buscador con sugerencias ---------- */
  let sugeridos = [], activo = -1;
  function cerrarResultados() { $('evResultados').hidden = true; $('evBuscar').setAttribute('aria-expanded', 'false'); }
  function pintarResultados() {
    const q = norm($('evBuscar').value);
    if (q.length < 2) { cerrarResultados(); return; }
    sugeridos = todosLosMunicipios()
      .filter(m => m.clave.includes(q) || norm(m.departamento).includes(q))
      .sort((a, b) => (b.clave.startsWith(q) - a.clave.startsWith(q)) || a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, 8);
    activo = sugeridos.length ? 0 : -1;
    $('evResultados').innerHTML = sugeridos.length
      ? sugeridos.map((m, i) => {
          const t = tarifaMunicipio(m.id);
          return `<button type="button" role="option" class="ev-res${i === activo ? ' is-active' : ''}" data-i="${i}"><span><b>${_escAdm(m.nombre)}</b><small>${_escAdm(m.departamento)}</small></span>${t ? `<em>${t.gratis ? 'Gratis' : _pesos(t.costo)}</em>` : ''}</button>`;
        }).join('')
      : '<div class="ev-res-vacio">No encontramos esa ubicación. Revisa la ortografía o busca por departamento.</div>';
    $('evResultados').hidden = false;
    $('evBuscar').setAttribute('aria-expanded', 'true');
  }

  /* ---------- formulario ---------- */
  function tipoActual() { return document.querySelector('input[name="evTipo"]:checked').value; }
  function ponerTipo(tipo) {
    document.querySelector(`input[name="evTipo"][value="${tipo}"]`).checked = true;
    sincronizarTipo();
  }
  function sincronizarTipo() {
    const gratis = tipoActual() === 'gratis';
    $('evTipoNormal').classList.toggle('is-on', !gratis);
    $('evTipoGratis').classList.toggle('is-on', gratis);
    $('evValor').disabled = gratis;
    $('evValorWrap').classList.toggle('is-off', gratis);
    $('evEjemplo').hidden = gratis;
    if (gratis) { $('evValor').value = ''; $('evError').textContent = ''; }
    actualizarBoton();
  }
  /** Acepta "12000" o "12.000". */
  function leerValor() {
    if (tipoActual() === 'gratis') return { ok: true, valor: 0, gratis: true };
    let t = String($('evValor').value || '').trim().replace(/^\$\s*/, '');
    if (t === '') return { ok: false, vacio: true, msg: 'Ingresa el valor del envío.' };
    if (t.startsWith('-')) return { ok: false, msg: 'El valor no puede ser negativo.' };
    if (t.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(t)) return { ok: false, msg: 'Usa solo números enteros, ej: 12000 o 12.000.' };
    t = t.replace(/\./g, '');
    if (!/^\d+$/.test(t)) return { ok: false, msg: 'Solo se permiten números.' };
    const v = Number(t);
    if (v === 0) return { ok: false, msg: 'Para un envío sin costo elige "Envío gratis".' };
    if (v > ENVIO_MUN_MAX) return { ok: false, msg: `El máximo permitido es ${_pesos(ENVIO_MUN_MAX)}.` };
    return { ok: true, valor: v, gratis: false };
  }
  function actualizarBoton() {
    const l = leerValor();
    $('evGuardar').disabled = st.guardando || !st.sel || !l.ok;
  }
  function pintarSeleccion() {
    const m = st.sel;
    $('evSelNombre').textContent = m ? m.nombre : 'Ubicación seleccionada';
    const t = m ? tarifaMunicipio(m.id) : null;
    $('evSelDetalle').textContent = m
      ? `${m.departamento}${t ? ' · Ya tiene tarifa: ' + (t.gratis ? 'envío gratis' : _pesos(t.costo)) : ' · Aún sin tarifa propia'}`
      : 'Selecciona una ciudad o municipio para continuar.';
    $('evSeleccion').classList.toggle('is-ok', !!m);
    $('evCancelar').hidden = !m;
  }
  function seleccionar(id) {
    const m = municipioPorId(id);
    if (!m) return;
    st.sel = m;
    $('evDepto').value = m.departamento;
    poblarMunicipios();
    $('evMuni').value = m.id;
    $('evBuscar').value = '';
    cerrarResultados();
    const t = tarifaMunicipio(m.id);
    ponerTipo(t && t.gratis ? 'gratis' : 'normal');
    $('evValor').value = t && !t.gratis ? t.costo.toLocaleString('es-CO') : '';
    $('evError').textContent = '';
    pintarSeleccion();
    actualizarBoton();
  }
  function limpiarSeleccion() {
    st.sel = null;
    $('evMuni').value = '';
    $('evValor').value = '';
    $('evError').textContent = '';
    ponerTipo('normal');
    pintarSeleccion();
    actualizarBoton();
  }

  async function guardar() {
    if (st.guardando || !st.sel) return;
    const l = leerValor();
    if (!l.ok) { $('evError').textContent = l.msg; return; }
    const m = st.sel, btn = $('evGuardar'), txt = btn.innerHTML;
    st.guardando = true;
    btn.classList.add('is-cargando');
    btn.innerHTML = '<span class="mq-spin" aria-hidden="true"></span>Guardando…';
    actualizarBoton();
    try {
      await guardarTarifaMunicipio(m.id, { costo: l.valor, gratis: l.gratis });
      showToast(`Tarifa de ${m.nombre} guardada ✓ Ya se aplica en el carrito.`);
      st.guardando = false;
      limpiarSeleccion();
      pintarTabla();
    } catch (err) {
      console.error('Error guardando la tarifa de envío:', err);
      showToast('No se pudo guardar la tarifa. Revisa tu conexión o permisos e inténtalo de nuevo.', true);
    } finally {
      st.guardando = false;
      btn.classList.remove('is-cargando');
      btn.innerHTML = txt;
      actualizarBoton();
    }
  }

  async function eliminar(id) {
    const m = municipioPorId(id);
    if (!m) return;
    const ok = await confirmarAccion({
      titulo: 'Eliminar tarifa',
      mensaje: `Se elimina la tarifa de ${m.nombre} (${m.departamento}). Esa ciudad volverá a usar la tarifa base de su zona. Los pedidos anteriores no se modifican.`,
      textoOk: 'Sí, eliminar', peligro: true
    });
    if (!ok) return;
    try {
      await guardarTarifaMunicipio(id, null);
      if (st.sel && st.sel.id === id) limpiarSeleccion();
      showToast(`Tarifa de ${m.nombre} eliminada.`);
      pintarTabla();
    } catch (err) {
      console.error('Error eliminando la tarifa de envío:', err);
      showToast('No se pudo eliminar la tarifa. Inténtalo de nuevo.', true);
    }
  }

  /* ---------- tabla de tarifas configuradas ---------- */
  function listaFiltrada() {
    const q = norm(st.q);
    return municipiosConTarifa()
      .filter(m => (!st.depto || m.departamento === st.depto) && (!q || norm(m.nombre).includes(q) || norm(m.departamento).includes(q)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  function paginasVisibles(actual, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const set = new Set([1, total, actual - 1, actual, actual + 1]);
    const orden = [...set].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
    const out = [];
    orden.forEach((n, i) => { if (i && n - orden[i - 1] > 1) out.push('…'); out.push(n); });
    return out;
  }
  function pintarTabla() {
    const total = municipiosConTarifa().length;
    $('evConteo').textContent = `${total} ${total === 1 ? 'ubicación' : 'ubicaciones'}`;
    const lista = listaFiltrada();
    const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    if (st.pagina > paginas) st.pagina = paginas;
    const desde = (st.pagina - 1) * POR_PAGINA;
    const body = $('evTablaBody');
    if (!lista.length) {
      body.innerHTML = `<tr><td colspan="5" class="ev-vacio">${total
        ? 'Ninguna tarifa coincide con tu búsqueda.'
        : 'Aún no hay tarifas por ciudad. Busca una ubicación a la izquierda y configura la primera. Mientras tanto se usan las tarifas base por zona.'}</td></tr>`;
    } else {
      body.innerHTML = lista.slice(desde, desde + POR_PAGINA).map(m => `
        <tr data-id="${m.id}">
          <td><div class="ev-td-ub"><span class="ev-pin" aria-hidden="true">${ICO_PIN}</span><span><b>${_escAdm(m.nombre)}</b><small>${_escAdm(m.departamento)}</small></span></div></td>
          <td class="ev-col-dep">${_escAdm(m.departamento)}</td>
          <td class="ev-td-tarifa">${m.gratis ? 'Gratis' : '$ ' + m.costo.toLocaleString('es-CO')}</td>
          <td><span class="ev-badge${m.gratis ? ' is-gratis' : ''}">${m.gratis ? 'Gratis' : 'Activo'}</span></td>
          <td class="ev-td-acc">
            <button type="button" class="ev-ib" data-ac="editar" aria-label="Editar tarifa de ${_escAdm(m.nombre)}" title="Editar">${ICO_EDIT}</button>
            <button type="button" class="ev-ib ev-ib-del" data-ac="eliminar" aria-label="Eliminar tarifa de ${_escAdm(m.nombre)}" title="Eliminar">${ICO_DEL}</button>
          </td>
        </tr>`).join('');
    }
    const nav = $('evPaginacion');
    nav.hidden = paginas <= 1;
    if (paginas > 1) {
      nav.innerHTML = `<button type="button" data-p="${st.pagina - 1}" aria-label="Página anterior"${st.pagina === 1 ? ' disabled' : ''}>‹</button>`
        + paginasVisibles(st.pagina, paginas).map(n => n === '…'
          ? '<span class="ev-pag-gap" aria-hidden="true">…</span>'
          : `<button type="button" data-p="${n}"${n === st.pagina ? ' class="is-on" aria-current="page"' : ''}>${n}</button>`).join('')
        + `<button type="button" data-p="${st.pagina + 1}" aria-label="Página siguiente"${st.pagina === paginas ? ' disabled' : ''}>›</button>`;
    }
  }

  /* ---------- eventos ---------- */
  function iniciar() {
    if (st.iniciado) return;
    st.iniciado = true;
    poblarDepartamentos();
    poblarMunicipios();
    pintarSeleccion();
    sincronizarTipo();

    $('evDepto').addEventListener('change', () => { poblarMunicipios(); if (st.sel && $('evDepto').value && st.sel.departamento !== $('evDepto').value) limpiarSeleccion(); });
    $('evMuni').addEventListener('change', () => { if ($('evMuni').value) seleccionar($('evMuni').value); else limpiarSeleccion(); });

    const buscar = $('evBuscar');
    buscar.addEventListener('input', pintarResultados);
    buscar.addEventListener('focus', pintarResultados);
    buscar.addEventListener('keydown', (e) => {
      if ($('evResultados').hidden) return;
      const marcar = () => $('evResultados').querySelectorAll('.ev-res').forEach((b, i) => { b.classList.toggle('is-active', i === activo); if (i === activo) b.scrollIntoView({ block: 'nearest' }); });
      if (e.key === 'ArrowDown') { e.preventDefault(); activo = Math.min(sugeridos.length - 1, activo + 1); marcar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activo = Math.max(0, activo - 1); marcar(); }
      else if (e.key === 'Escape') cerrarResultados();
      else if (e.key === 'Enter') { e.preventDefault(); if (sugeridos[activo]) seleccionar(sugeridos[activo].id); }
    });
    $('evResultados').addEventListener('mousedown', (e) => e.preventDefault());
    $('evResultados').addEventListener('click', (e) => { const b = e.target.closest('.ev-res'); if (b) seleccionar(sugeridos[Number(b.dataset.i)].id); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.ev-buscador:not(.ev-buscador-lista)')) cerrarResultados(); });

    document.querySelectorAll('input[name="evTipo"]').forEach(r => r.addEventListener('change', sincronizarTipo));
    $('evValor').addEventListener('input', () => { $('evError').textContent = ''; actualizarBoton(); });
    $('evValor').addEventListener('blur', () => {
      const l = leerValor();
      if (l.ok && !l.gratis) $('evValor').value = l.valor.toLocaleString('es-CO');
      else if (!l.ok && !l.vacio) $('evError').textContent = l.msg;
    });
    $('evValor').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!$('evGuardar').disabled) guardar(); } });
    $('evGuardar').addEventListener('click', guardar);
    $('evCancelar').addEventListener('click', limpiarSeleccion);

    $('evFiltroQ').addEventListener('input', () => { st.q = $('evFiltroQ').value; st.pagina = 1; pintarTabla(); });
    $('evFiltroDepto').addEventListener('change', () => { st.depto = $('evFiltroDepto').value; st.pagina = 1; pintarTabla(); });
    $('evPaginacion').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-p]');
      if (!b || b.disabled) return;
      st.pagina = Number(b.dataset.p);
      pintarTabla();
    });
    $('evTablaBody').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-ac]');
      if (!b) return;
      const id = b.closest('tr').dataset.id;
      if (b.dataset.ac === 'editar') {
        seleccionar(id);
        $('evSeleccion').scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('evValor').disabled ? $('evGuardar').focus() : $('evValor').focus();
      } else eliminar(id);
    });
  }

  /** La llama admin.js al entrar al panel (cuando ya cargó config/envio). */
  window.pintarEnviosCiudades = function () {
    iniciar();
    pintarTabla();
    pintarSeleccion();
  };
})();
