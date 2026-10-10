/* ============================================================
   admin-extras.js — Centro de control de la pestaña "Resumen"
   ------------------------------------------------------------
   Se carga DESPUÉS de admin.js y admin-ui.js. No cambia datos,
   reglas ni Firebase: solo LEE lo que admin.js ya cargó
   (productos y pedidos) y añade encima del Resumen:
     · KPIs por periodo (hoy / 7 / 30 / 90 días / todo) con
       comparación contra el periodo anterior
     · gráfica de ventas del periodo
     · pedidos por estado, métodos de pago y ciudades
     · alertas: stock agotado / bajo, tallas y colores agotados,
       pedidos pendientes hace más de 24 h
     · productos que más ingresos dejan
     · exportar pedidos (CSV) y copia de seguridad (JSON)
   Respeta permisosActuales (pedidos / inventario).
   ============================================================ */
(function () {
  'use strict';
  if (typeof pintarResumen !== 'function') return;

  const PERIODOS = [
    { id: '1',  txt: 'Hoy',     dias: 1 },
    { id: '7',  txt: '7 días',  dias: 7 },
    { id: '30', txt: '30 días', dias: 30 },
    { id: '90', txt: '90 días', dias: 90 },
    { id: 'todo', txt: 'Todo',  dias: 0 },
  ];
  let periodoActual = '7';

  const esc = (v) => (typeof _escAdm === 'function' ? _escAdm(v) : String(v == null ? '' : v));
  const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  const num = (n) => Number(n) || 0;
  const inicioDia = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const sumaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const vigente = (p) => estadoPedido(p) !== 'cancelado';
  const fechaDe = (p) => (p.fecha ? new Date(p.fecha) : null);

  /* ---------- cálculo ---------- */
  function rangoPeriodo(per, pedidos) {
    const hoy0 = inicioDia(new Date());
    if (per.dias > 0) {
      const desde = sumaDias(hoy0, -(per.dias - 1));
      return { desde, hasta: sumaDias(hoy0, 1), prevDesde: sumaDias(desde, -per.dias), prevHasta: desde };
    }
    const fechas = pedidos.map(fechaDe).filter(Boolean);
    const min = fechas.length ? inicioDia(new Date(Math.min(...fechas))) : hoy0;
    return { desde: min, hasta: sumaDias(hoy0, 1), prevDesde: null, prevHasta: null };
  }
  const enRango = (p, a, b) => { const f = fechaDe(p); return !!f && f >= a && f < b; };

  function metricas(lista) {
    const ok = lista.filter(vigente);
    const ingresos = ok.reduce((s, p) => s + num(p.total), 0);
    const prendas = ok.reduce((s, p) => s + (p.items ? p.items.length : 0), 0);
    return {
      todos: lista, ok, ingresos, prendas,
      pedidos: ok.length,
      ticket: ok.length ? ingresos / ok.length : 0,
      cancelados: lista.length - ok.length,
    };
  }

  function variacion(actual, previo) {
    if (previo == null) return '';
    if (!previo) return actual ? '<small class="ax-up">▲ nuevo frente al periodo anterior</small>' : '<small>Sin datos del periodo anterior</small>';
    const pct = Math.round(((actual - previo) / previo) * 100);
    if (pct === 0) return '<small>Igual que el periodo anterior</small>';
    return `<small class="${pct > 0 ? 'ax-up' : 'ax-down'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs periodo anterior</small>`;
  }

  /* cubetas de la gráfica según el periodo */
  function cubetas(per, rango, ok) {
    const out = [];
    const fmtDia = (d) => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
    if (per.id === '1') {
      for (let h = 0; h < 24; h++) {
        const a = new Date(rango.desde); a.setHours(h);
        out.push({ a, b: new Date(a.getTime() + 3600e3), tip: h + ':00' });
      }
    } else if (per.id === '90') {
      for (let a = new Date(rango.desde); a < rango.hasta; a = sumaDias(a, 7)) {
        out.push({ a, b: sumaDias(a, 7), tip: 'Semana del ' + fmtDia(a) });
      }
    } else if (per.id === 'todo') {
      const fin = new Date(rango.hasta);
      for (let i = 11; i >= 0; i--) {
        const a = new Date(fin.getFullYear(), fin.getMonth() - i, 1);
        out.push({ a, b: new Date(a.getFullYear(), a.getMonth() + 1, 1), tip: a.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }) });
      }
    } else {
      for (let a = new Date(rango.desde); a < rango.hasta; a = sumaDias(a, 1)) {
        out.push({ a, b: sumaDias(a, 1), tip: fmtDia(a) });
      }
    }
    out.forEach(c => { c.total = ok.filter(p => enRango(p, c.a, c.b)).reduce((s, p) => s + num(p.total), 0); });
    return out;
  }

  function filasBarras(pares, formato) {
    if (!pares.length) return '<p class="ax-vacio">Sin datos en este periodo.</p>';
    const max = Math.max(1, ...pares.map(x => x[1]));
    return `<div class="ax-rows">${pares.map(([k, v, extra]) => `
      <div class="ax-row"><em title="${esc(k)}">${esc(k)}</em>
        <div class="ax-bar"><i style="width:${Math.max(3, Math.round(v / max * 100))}%"></i></div>
        <strong>${formato ? formato(v) : v}${extra ? ' · ' + esc(extra) : ''}</strong></div>`).join('')}</div>`;
  }
  const contar = (arr, fn) => {
    const m = {};
    arr.forEach(x => { const k = fn(x); if (k) m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  /* ---------- alertas de inventario y pedidos ---------- */
  function alertasInventario(productos) {
    const out = [];
    productos.filter(p => p.activo).forEach(p => {
      const nivel = nivelStockProducto(p);
      const nombre = esc(p.nombre);
      if (nivel === 'agotado') {
        out.push({ tipo: 'out', orden: 0, id: p.id, txt: `<b>${nombre}</b> está agotado`, sub: 'No se puede comprar hasta reponer stock.' });
        return;
      }
      const tallas = (p.stockTallas && Object.keys(p.stockTallas).length) ? (p.tallas || []).filter(t => tallaAgotada(p, t)) : [];
      const colores = (p.stockColores && Object.keys(p.stockColores).length) ? (p.colores || []).filter(c => colorAgotado(p, c)) : [];
      if (nivel === 'bajo') {
        out.push({ tipo: 'low', orden: 1, id: p.id, txt: `<b>${nombre}</b>: quedan ${stockTotalProducto(p)}`, sub: 'Pocas unidades en total.' });
      }
      if (tallas.length || colores.length) {
        const partes = [];
        if (tallas.length) partes.push('Tallas agotadas: ' + tallas.map(esc).join(', '));
        if (colores.length) partes.push('Colores agotados: ' + colores.map(c => `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(c)};border:1px solid rgba(255,255,255,.3);vertical-align:-1px"></span>`).join(' '));
        out.push({ tipo: 'low', orden: 2, id: p.id, txt: `<b>${nombre}</b>`, sub: partes.join(' · ') });
      }
    });
    return out.sort((a, b) => a.orden - b.orden);
  }

  function alertasPedidos(pedidos) {
    const limite = Date.now() - 24 * 3600e3;
    return pedidos.filter(p => estadoPedido(p) === 'pendiente' && fechaDe(p) && fechaDe(p).getTime() < limite)
      .sort((a, b) => fechaDe(a) - fechaDe(b)).slice(0, 8)
      .map(p => {
        const h = Math.floor((Date.now() - fechaDe(p).getTime()) / 3600e3);
        return { tipo: 'old', txt: `Pedido de <b>${esc(p.nombre_cliente || 'cliente')}</b> sigue pendiente`, sub: `Hace ${h >= 48 ? Math.floor(h / 24) + ' días' : h + ' horas'} · ${pesos(p.total)}`, pedido: true };
      });
  }

  /* ---------- exportar ---------- */
  function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  const celda = (v) => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // evita que Excel ejecute fórmulas
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const stamp = () => new Date().toISOString().slice(0, 10);

  function exportarPedidosCSV(lista) {
    if (!lista.length) { showToast('No hay pedidos en este periodo.', true); return; }
    const cab = ['Fecha', 'Cliente', 'Correo', 'Teléfono', 'Estado', 'Pago', 'Municipio', 'Dirección', 'Productos', 'Subtotal', 'Envío', 'Total'];
    const filas = lista.map(p => [
      p.fecha || '', p.nombre_cliente, p.email_cliente, p.telefono_cliente,
      (ESTADOS_PEDIDO[estadoPedido(p)] || {}).label, p.metodo_pago, p.envio_municipio,
      [p.envio_direccion, p.envio_barrio].filter(Boolean).join(', '),
      p.detalle || (p.items || []).map(i => `${i.nombre} (${i.talla})`).join(' | '),
      p.subtotal, p.costo_envio, p.total,
    ].map(celda).join(','));
    descargar(`maquina-pedidos-${stamp()}.csv`, '\uFEFF' + [cab.map(celda).join(','), ...filas].join('\n'), 'text/csv;charset=utf-8;');
    showToast(`Se exportaron ${lista.length} pedidos.`);
  }

  function copiaSeguridad(productos, pedidos, permisos) {
    const data = { app: 'MAQUINA', generado: new Date().toISOString(), version: 1 };
    if (permisos.inventario) data.productos = productos;
    if (permisos.pedidos) data.pedidos = pedidos;
    descargar(`maquina-respaldo-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
    showToast('Copia de seguridad descargada. Guárdala en un lugar privado.');
  }

  /* ---------- pintado ---------- */
  async function pintarCentro() {
    const tab = document.getElementById('tabResumen');
    if (!tab) return;
    let cont = document.getElementById('axCentro');
    if (!cont) {
      cont = document.createElement('section');
      cont.id = 'axCentro';
      cont.className = 'ax-wrap';
      tab.insertBefore(cont, tab.firstChild);
    }
    const permisos = (typeof permisosActuales !== 'undefined') ? permisosActuales : { pedidos: true, inventario: true };
    const productos = permisos.inventario ? obtenerProductosAdmin() : [];
    const pedidos = permisos.pedidos ? (pedidosCache || []) : [];

    const per = PERIODOS.find(x => x.id === periodoActual) || PERIODOS[1];
    const rango = rangoPeriodo(per, pedidos);
    const actual = metricas(pedidos.filter(p => enRango(p, rango.desde, rango.hasta)));
    const previo = rango.prevDesde ? metricas(pedidos.filter(p => enRango(p, rango.prevDesde, rango.prevHasta))) : null;

    let html = `
      <div class="ax-head">
        <h3>📊 Centro de control</h3>
        ${permisos.pedidos ? `<div class="ax-periodos" role="group" aria-label="Periodo">${PERIODOS.map(x => `<button type="button" class="ax-per ${x.id === periodoActual ? 'is-on' : ''}" data-per="${x.id}">${x.txt}</button>`).join('')}</div>` : ''}
      </div>`;

    if (permisos.pedidos) {
      const tasaCanc = actual.todos.length ? Math.round(actual.cancelados / actual.todos.length * 100) : 0;
      html += `
      <div class="ax-kpis">
        <div class="ax-kpi"><span>Ingresos</span><b>${pesos(actual.ingresos)}</b>${variacion(actual.ingresos, previo && previo.ingresos)}</div>
        <div class="ax-kpi"><span>Pedidos</span><b>${actual.pedidos}</b>${variacion(actual.pedidos, previo && previo.pedidos)}</div>
        <div class="ax-kpi"><span>Ticket promedio</span><b>${pesos(actual.ticket)}</b>${variacion(actual.ticket, previo && previo.ticket)}</div>
        <div class="ax-kpi"><span>Prendas vendidas</span><b>${actual.prendas}</b>${variacion(actual.prendas, previo && previo.prendas)}</div>
        <div class="ax-kpi"><span>Cancelados</span><b>${actual.cancelados}</b><small>${tasaCanc}% de los pedidos del periodo</small></div>
      </div>`;

      const cub = cubetas(per, rango, actual.ok);
      const maxC = Math.max(1, ...cub.map(c => c.total));
      const ejeA = cub[0] ? cub[0].tip : '', ejeB = cub.length ? cub[cub.length - 1].tip : '';
      const porEstado = contar(actual.todos, p => (ESTADOS_PEDIDO[estadoPedido(p)] || {}).label);
      const pagos = contar(actual.ok, p => ({ contraentrega: 'Contra entrega', tarjeta: 'Tarjeta', nequi: 'Nequi' }[p.metodo_pago] || p.metodo_pago));
      const ciudades = contar(actual.ok, p => (p.envio_municipio || '').trim()).slice(0, 5);
      const ingPorProd = {};
      actual.ok.forEach(p => (p.items || []).forEach(i => {
        const o = ingPorProd[i.nombre] || (ingPorProd[i.nombre] = { u: 0, ing: 0 });
        o.u++; o.ing += num(i.precio);
      }));
      const topIng = Object.entries(ingPorProd).sort((a, b) => b[1].ing - a[1].ing).slice(0, 5).map(([n, o]) => [n, o.ing, o.u + ' uds']);

      html += `
      <div class="ax-grid">
        <div class="admin-card"><h3>Ventas del periodo</h3>
          ${actual.ingresos ? `<div class="ax-chart">${cub.map(c => `<div title="${esc(c.tip)}: ${pesos(c.total)}"><i style="height:${Math.max(2, Math.round(c.total / maxC * 100))}%"></i></div>`).join('')}</div>
          <div class="ax-chart-ejes"><span>${esc(ejeA)}</span><span>${esc(ejeB)}</span></div>` : '<p class="ax-vacio">Aún no hay ventas en este periodo.</p>'}
        </div>
        <div class="admin-card"><h3>Pedidos por estado</h3>${filasBarras(porEstado)}</div>
        <div class="admin-card"><h3>Mayores ingresos por producto</h3>${filasBarras(topIng, pesos)}</div>
        <div class="admin-card"><h3>Cómo pagan</h3>${filasBarras(pagos)}</div>
        <div class="admin-card"><h3>Dónde compran</h3>${filasBarras(ciudades)}</div>
      </div>`;
    }

    /* alertas */
    const alertas = [...(permisos.inventario ? alertasInventario(productos) : []), ...(permisos.pedidos ? alertasPedidos(pedidos) : [])];
    html += `
      <div class="admin-card" style="margin-top:var(--ap-gap,20px)">
        <h3>🔔 Requiere tu atención ${alertas.length ? `(${alertas.length})` : ''}</h3>
        ${alertas.length ? `<div class="ax-alertas">${alertas.map(a => `
          <div class="ax-alerta ${a.tipo === 'out' ? 'is-out' : a.tipo === 'old' ? 'is-old' : ''}">
            <span class="ax-dot"></span>
            <p>${a.txt}<small>${a.sub}</small></p>
            ${a.id != null ? `<button type="button" class="admin-btn admin-btn-ghost admin-btn-xs" data-editar="${esc(a.id)}">Editar</button>` : ''}
            ${a.pedido ? `<button type="button" class="admin-btn admin-btn-ghost admin-btn-xs" data-ir-pedidos="1">Ver pedidos</button>` : ''}
          </div>`).join('')}</div>` : '<div class="ax-ok">✅ Todo en orden: sin alertas de stock ni pedidos atrasados.</div>'}
      </div>`;

    /* exportar y respaldo */
    if (permisos.pedidos || permisos.inventario) {
      html += `
      <div class="admin-card">
        <h3>💾 Exportar y respaldo</h3>
        <div class="ax-backup">
          <p>Descarga tus datos para guardarlos o abrirlos en Excel. El respaldo incluye datos de clientes: guárdalo en un lugar privado.</p>
          ${permisos.pedidos ? `<button type="button" class="admin-btn admin-btn-ghost" id="axCsv">Pedidos del periodo (CSV)</button>` : ''}
          <button type="button" class="admin-btn admin-btn-primary" id="axBackup">Copia de seguridad (JSON)</button>
        </div>
      </div>`;
    }

    cont.innerHTML = html;

    cont.querySelectorAll('[data-per]').forEach(b => b.addEventListener('click', () => { periodoActual = b.dataset.per; pintarCentro(); }));
    cont.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => abrirEditorProducto(b.dataset.editar)));
    cont.querySelectorAll('[data-ir-pedidos]').forEach(b => b.addEventListener('click', () => { const t = document.getElementById('tabBtnPedidos'); if (t) t.click(); }));
    const csv = document.getElementById('axCsv');
    if (csv) csv.addEventListener('click', () => exportarPedidosCSV(actual.todos));
    const bk = document.getElementById('axBackup');
    if (bk) bk.addEventListener('click', () => copiaSeguridad(productos, pedidos, permisos));
  }

  /* se engancha al Resumen existente sin reemplazarlo */
  const original = pintarResumen;
  window.pintarResumen = async function () {
    await original.apply(this, arguments);
    try { await pintarCentro(); } catch (e) { console.error('[admin-extras]', e); }
  };
})();
