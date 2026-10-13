/* ============================================================
   admin-extras.js — Pestaña "Resumen" (panel de control)
   ------------------------------------------------------------
   Se carga DESPUÉS de admin.js y admin-ui.js. No cambia datos,
   reglas ni Firebase: solo LEE lo que admin.js ya cargó
   (productos y pedidos) y dibuja el Resumen:
     · tarjetas del periodo (hoy / 7 días / 30 días / todo) con
       comparación contra el periodo anterior
     · gráfica de ventas de los últimos 7 días
     · pedidos recientes, productos más vendidos y alertas de inventario
     · "Más análisis": pedidos por estado, pagos, ciudades y avisos
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
    { id: 'todo', txt: 'Todo',  dias: 0 },
  ];
  let periodoActual = '1';
  const UMBRAL_ALERTA = 10;   // la tabla "Alertas de inventario" lista lo que tiene menos de 10 unidades

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

  const ICO = {
    up: '<svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    chev: '<svg class="ap-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  };
  /** Línea "↑ +12% vs. periodo anterior". `invertir`: para métricas donde bajar es bueno (cancelados). */
  function delta(actual, previo, invertir) {
    if (previo == null) return '<small class="rs-delta"><em>Todo el historial</em></small>';
    if (!previo) {
      return actual ? `<small class="rs-delta ${invertir ? 'down' : 'up'}">${ICO.up}Nuevo <em>vs. periodo anterior</em></small>`
                    : '<small class="rs-delta"><em>Sin datos del periodo anterior</em></small>';
    }
    const pct = Math.round(((actual - previo) / previo) * 100);
    if (pct === 0) return '<small class="rs-delta"><em>Igual que el periodo anterior</em></small>';
    const sube = pct > 0, bueno = invertir ? !sube : sube;
    return `<small class="rs-delta ${bueno ? 'up' : 'down'}">${sube ? ICO.up : ICO.down}${sube ? '+' : '−'}${Math.abs(pct)}% <em>vs. periodo anterior</em></small>`;
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

  /* ---------- gráfica: ventas de los últimos 7 días ---------- */
  const NOMBRE_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  let datosGrafica = [];
  const serieOn = { ingresos: true, pedidos: false };

  function calcularGrafica(pedidos) {
    const hoy0 = inicioDia(new Date());
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const a = sumaDias(hoy0, -i), b = sumaDias(a, 1);
      const ok = pedidos.filter(p => vigente(p) && enRango(p, a, b));
      out.push({
        fecha: a,
        etiqueta: NOMBRE_DIA[a.getDay()] + ' ' + a.getDate(),
        tip: a.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }),
        ingresos: ok.reduce((s, p) => s + num(p.total), 0),
        pedidos: ok.length,
      });
    }
    return out;
  }
  /** paso "redondo" para 4 divisiones del eje (200k, 250k, 500k…) */
  function pasoBonito(max, minimo) {
    const crudo = Math.max(max, minimo) / 4;
    const pot = Math.pow(10, Math.floor(Math.log10(crudo)));
    return [1, 2, 2.5, 5, 10].map(k => k * pot).find(v => v >= crudo);
  }
  const ejeCorto = (n) => n === 0 ? '$0' : n >= 1e6 ? '$' + (n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + 'M' : '$' + Math.round(n / 1e3) + 'k';

  function dibujarGrafica() {
    const cont = document.getElementById('rsChart');
    if (!cont || !datosGrafica.length || !cont.clientWidth) return;
    const n = datosGrafica.length;
    const W = Math.max(280, cont.clientWidth), H = W < 480 ? 230 : 270;
    const m = { l: 54, r: serieOn.pedidos ? 38 : 16, t: 14, b: W < 460 ? 46 : 32 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const paso = pasoBonito(Math.max(...datosGrafica.map(d => d.ingresos)), 100000), topI = paso * 4;
    const pasoP = Math.max(1, Math.ceil(Math.max(...datosGrafica.map(d => d.pedidos)) / 4)), topP = pasoP * 4;
    const px = (i) => m.l + 14 + i * (iw - 28) / (n - 1);
    const yI = (v) => m.t + ih - (v / topI) * ih;
    const yP = (v) => m.t + ih - (v / topP) * ih;
    const puntos = (f, y) => datosGrafica.map((d, i) => `${px(i).toFixed(1)},${y(d[f]).toFixed(1)}`);
    const sinVentas = datosGrafica.every(d => !d.ingresos && !d.pedidos);

    let svg = `<svg class="rs-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfica de ventas de los últimos 7 días">
      <defs><linearGradient id="rsGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" class="rs-g1"/><stop offset="100%" class="rs-g2"/></linearGradient></defs>`;
    for (let k = 0; k <= 4; k++) {
      const y = m.t + ih - (k / 4) * ih;
      svg += `<line class="rs-grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/>`;
      svg += `<text class="rs-eje" x="${m.l - 10}" y="${y + 4}" text-anchor="end">${ejeCorto(paso * k)}</text>`;
      if (serieOn.pedidos) svg += `<text class="rs-eje rs-eje-p" x="${W - m.r + 8}" y="${y + 4}">${pasoP * k}</text>`;
    }
    if (serieOn.ingresos) {
      const pts = puntos('ingresos', yI);
      svg += `<polygon class="rs-area" points="${px(0).toFixed(1)},${m.t + ih} ${pts.join(' ')} ${px(n - 1).toFixed(1)},${m.t + ih}"/>`;
      svg += `<polyline class="rs-linea" points="${pts.join(' ')}"/>`;
      datosGrafica.forEach((d, i) => { svg += `<circle class="rs-punto" cx="${px(i).toFixed(1)}" cy="${yI(d.ingresos).toFixed(1)}" r="3.6"/>`; });
    }
    if (serieOn.pedidos) {
      svg += `<polyline class="rs-linea-p" points="${puntos('pedidos', yP).join(' ')}"/>`;
      datosGrafica.forEach((d, i) => { svg += `<circle class="rs-punto-p" cx="${px(i).toFixed(1)}" cy="${yP(d.pedidos).toFixed(1)}" r="3.2"/>`; });
    }
    datosGrafica.forEach((d, i) => {
      const [dia, num2] = d.etiqueta.split(' ');
      svg += W < 460
        ? `<text class="rs-eje rs-eje-x" x="${px(i)}" y="${H - 24}" text-anchor="middle">${dia}</text><text class="rs-eje rs-eje-x" x="${px(i)}" y="${H - 10}" text-anchor="middle">${num2}</text>`
        : `<text class="rs-eje rs-eje-x" x="${px(i)}" y="${H - 8}" text-anchor="middle">${d.etiqueta}</text>`;
    });
    svg += `<line class="rs-guia" id="rsGuia" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" hidden/></svg>
      <div class="rs-tip" id="rsTip" hidden></div>
      ${sinVentas ? '<p class="rs-chart-nota">Aún no hay ventas en los últimos 7 días.</p>' : ''}`;
    cont.innerHTML = svg;

    const el = cont.querySelector('svg'), guia = cont.querySelector('#rsGuia'), tip = cont.querySelector('#rsTip');
    const mostrar = (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      let i = Math.round(((x - m.l - 14) / (iw - 28)) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      const d = datosGrafica[i], gx = px(i);
      guia.setAttribute('x1', gx); guia.setAttribute('x2', gx); guia.removeAttribute('hidden');
      tip.innerHTML = `<b>${esc(d.tip)}</b><span>${serieOn.ingresos ? pesos(d.ingresos) : ''}${serieOn.ingresos && serieOn.pedidos ? ' · ' : ''}${serieOn.pedidos || !serieOn.ingresos ? d.pedidos + (d.pedidos === 1 ? ' pedido' : ' pedidos') : ''}</span>`;
      tip.removeAttribute('hidden');
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(4, Math.min(W - tw - 4, gx - tw / 2)) + 'px';
      tip.style.top = Math.max(0, (serieOn.ingresos ? yI(d.ingresos) : yP(d.pedidos)) - 58) + 'px';
    };
    const ocultar = () => { guia.setAttribute('hidden', ''); tip.setAttribute('hidden', ''); };
    el.addEventListener('pointermove', mostrar);
    el.addEventListener('pointerdown', mostrar);
    el.addEventListener('pointerleave', ocultar);
  }

  /* ---------- piezas de la pantalla ---------- */
  const SVG_KPI = {
    ing: '<path d="M12 3v18M16 7.5c0-1.9-1.8-3-4-3s-4 1.1-4 3 1.8 2.6 4 3.2 4 1.3 4 3.3-1.8 3-4 3-4-1.1-4-3"/>',
    ped: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2.5l2.2 11h10.6l2-8H6.3"/>',
    tkt: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    pre: '<path d="M8 3l-5 3 2 4 3-1v12h8V9l3 1 2-4-5-3c-.6 1.6-1.8 2.4-3 2.4S8.6 4.6 8 3z"/>',
    can: '<path d="M6 6l12 12M18 6L6 18"/>',
    prod: '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/>',
    out: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    low: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.5"/>',
  };
  const kpi = (ico, label, valor, pie) => `
    <article class="rs-kpi"><span class="rs-kpi-ico" aria-hidden="true"><svg class="ap-i" viewBox="0 0 24 24">${SVG_KPI[ico]}</svg></span>
      <span class="rs-kpi-l">${label}</span><b>${valor}</b>${pie}</article>`;

  const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fmtFechaCorta = (d) => `${d.getDate()} ${MES_CORTO[d.getMonth()]}, ` +
    d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });   // ej: 27 abr, 16:42
  const fotoDe = (p) => (p && (p.foto || (p.fotos && Object.values(p.fotos).find(Boolean)))) || '';
  const PLACEHOLDER = '<span class="rs-ph" aria-hidden="true"><svg class="ap-i" viewBox="0 0 24 24"><path d="M8 3l-5 3 2 4 3-1v12h8V9l3 1 2-4-5-3c-.6 1.6-1.8 2.4-3 2.4S8.6 4.6 8 3z"/></svg></span>';
  const miniatura = (src) => src ? `<img src="${esc(src)}" alt="" loading="lazy">` : PLACEHOLDER;

  let ctx = { actual: null, productos: [], pedidos: [], permisos: {} };

  function pintarCentro() {
    const permisos = (typeof permisosActuales !== 'undefined') ? permisosActuales : { pedidos: true, inventario: true };
    const productos = permisos.inventario ? obtenerProductosAdmin() : [];
    const pedidos = permisos.pedidos ? (pedidosCache || []) : [];
    const per = PERIODOS.find(x => x.id === periodoActual) || PERIODOS[0];
    const rango = rangoPeriodo(per, pedidos);
    const actual = metricas(pedidos.filter(p => enRango(p, rango.desde, rango.hasta)));
    const previo = rango.prevDesde ? metricas(pedidos.filter(p => enRango(p, rango.prevDesde, rango.prevHasta))) : null;
    ctx = { actual, productos, pedidos, permisos };

    const $ = (id) => document.getElementById(id);
    const mostrarSec = (id, ver) => { const e = $(id); if (e) e.hidden = !ver; };

    /* periodo (arriba a la derecha) */
    const per$ = $('rsPeriodos');
    if (per$) {
      per$.querySelectorAll('[data-per]').forEach(b => {
        const on = b.dataset.per === periodoActual;
        b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      per$.classList.toggle('rs-sin-permiso', !permisos.pedidos);
    }

    /* tarjetas */
    if (permisos.pedidos) {
      $('rsKpis').classList.remove('rs-kpis-inv');
      $('rsKpis').innerHTML =
        kpi('ing', 'Ingresos', pesos(actual.ingresos), delta(actual.ingresos, previo && previo.ingresos)) +
        kpi('ped', 'Pedidos', actual.pedidos.toLocaleString('es-CO'), delta(actual.pedidos, previo && previo.pedidos)) +
        kpi('tkt', 'Ticket promedio', pesos(actual.ticket), delta(actual.ticket, previo && previo.ticket)) +
        kpi('pre', 'Prendas vendidas', actual.prendas.toLocaleString('es-CO'), delta(actual.prendas, previo && previo.prendas)) +
        kpi('can', 'Cancelados', actual.cancelados.toLocaleString('es-CO'), delta(actual.cancelados, previo && previo.cancelados, true));
    } else {
      const activos = productos.filter(p => p.activo);
      $('rsKpis').classList.add('rs-kpis-inv');
      $('rsKpis').innerHTML =
        kpi('prod', 'Productos', productos.length, '<small class="rs-delta"><em>en el catálogo</em></small>') +
        kpi('low', 'Pocas existencias', activos.filter(p => nivelStockProducto(p) === 'bajo').length, `<small class="rs-delta"><em>${STOCK_BAJO_UMBRAL} unidades o menos</em></small>`) +
        kpi('out', 'Agotados', activos.filter(p => nivelStockProducto(p) === 'agotado').length, '<small class="rs-delta"><em>productos activos</em></small>');
    }
    ['rsVentas', 'rsRecientes', 'rsTop'].forEach(id => mostrarSec(id, permisos.pedidos));
    mostrarSec('rsAlertas', permisos.inventario);

    if (permisos.pedidos) {
      /* gráfica (siempre los últimos 7 días, como el título) */
      datosGrafica = calcularGrafica(pedidos);
      dibujarGrafica();

      /* pedidos recientes */
      const recientes = [...pedidos].sort((a, b) => (fechaDe(b) || 0) - (fechaDe(a) || 0)).slice(0, 5);
      $('rsRecientesCont').innerHTML = recientes.length ? `
        <table class="rs-tabla"><thead><tr><th># Pedido</th><th>Cliente</th><th class="rs-c-fecha">Fecha</th><th>Total</th><th>Estado</th><th><span class="sr-only">Abrir</span></th></tr></thead><tbody>
        ${recientes.map(p => {
          const est = estadoPedido(p), d = fechaDe(p), ok = d && !isNaN(d.getTime());
          const numero = (numerosPedidoCache && numerosPedidoCache.get(p.id)) || '—';
          return `<tr data-pedido="${esc(p.id)}" tabindex="0" role="button" aria-label="Ver pedido ${esc(numero)}">
            <td class="rs-mono">#${esc(numero)}</td>
            <td class="rs-cliente">${esc(p.nombre_cliente || '—')}<small class="rs-fecha-mini">${ok ? fmtFechaCorta(d) : ''}</small></td>
            <td class="rs-c-fecha rs-dim">${ok ? fmtFechaCorta(d) : '—'}</td>
            <td class="rs-mono">${pesos(p.total)}</td>
            <td><span class="rs-est rs-est-${est}">${esc(ESTADOS_PEDIDO[est].label)}</span></td>
            <td class="rs-chev">${ICO.chev}</td></tr>`;
        }).join('')}</tbody></table>` : '<p class="rs-vacio">Todavía no hay pedidos.</p>';

      /* productos más vendidos (del periodo elegido) */
      const mapa = new Map();
      actual.ok.forEach(p => (p.items || []).forEach(i => {
        if (!i || typeof i !== 'object') return;
        const k = i.id != null ? 'id:' + i.id : 'n:' + i.nombre;
        const o = mapa.get(k) || { n: 0, ing: 0, id: i.id, nombre: i.nombre, foto: i.foto };
        o.n++; o.ing += num(i.precio); if (!o.foto && i.foto) o.foto = i.foto;
        mapa.set(k, o);
      }));
      const top = [...mapa.values()].sort((a, b) => b.n - a.n || b.ing - a.ing).slice(0, 5);
      $('rsTopLista').innerHTML = top.length ? top.map((t, i) => {
        const prod = productos.find(p => String(p.id) === String(t.id));
        return `<article class="rs-prod"><span class="rs-rank">${i + 1}</span>
          <div class="rs-prod-img">${miniatura(fotoDe(prod) || t.foto)}</div>
          <h4>${esc((prod && prod.nombre) || t.nombre || 'Producto')}</h4>
          <p>${t.n} ${t.n === 1 ? 'venta' : 'ventas'}</p></article>`;
      }).join('') : `<p class="rs-vacio">Aún no hay ventas ${per.id === '1' ? 'hoy' : 'en este periodo'}.</p>`;
    }

    /* alertas de inventario: lo que tiene menos de 10 unidades */
    if (permisos.inventario) {
      const bajos = productos.filter(p => p.activo).map(p => ({ p, st: stockTotalProducto(p) }))
        .filter(x => x.st < UMBRAL_ALERTA).sort((a, b) => a.st - b.st);
      const viejos = permisos.pedidos ? pedidos.filter(p => estadoPedido(p) === 'pendiente' && fechaDe(p) && fechaDe(p).getTime() < Date.now() - 24 * 3600e3).length : 0;
      $('rsAlertasCont').innerHTML = (bajos.length ? `
        <table class="rs-tabla rs-tabla-inv"><thead><tr><th>Producto</th><th>Stock</th><th>Umbral</th><th><span class="sr-only">Editar</span></th></tr></thead><tbody>
        ${bajos.slice(0, 5).map(({ p, st }) => `<tr data-editar="${esc(p.id)}" tabindex="0" role="button" aria-label="Editar ${esc(p.nombre)}">
          <td><div class="rs-prod-fila"><span class="rs-thumb">${miniatura(fotoDe(p))}</span><span>${esc(p.nombre)}</span></div></td>
          <td><b class="rs-stk ${st <= 5 ? 'rojo' : 'ambar'}">${st}</b></td>
          <td class="rs-dim">&lt; ${UMBRAL_ALERTA}</td><td class="rs-chev">${ICO.chev}</td></tr>`).join('')}</tbody></table>
        ${bajos.length > 5 ? `<p class="rs-mas-pie">y ${bajos.length - 5} más · <button type="button" class="rs-link" data-ir="tabBtnInventario">Ver inventario</button></p>` : ''}`
        : `<div class="rs-ok">✅ Todo en orden: ningún producto activo tiene menos de ${UMBRAL_ALERTA} unidades.</div>`) +
        (viejos ? `<p class="rs-aviso-viejos"><span class="ax-dot"></span>${viejos} ${viejos === 1 ? 'pedido sigue pendiente' : 'pedidos siguen pendientes'} hace más de 24 h · <button type="button" class="rs-link" data-ir="tabBtnPedidos">Ver pedidos</button></p>` : '');
    }

    /* más análisis (plegado): lo que ya tenías, sin quitar nada */
    let mas = '';
    if (permisos.pedidos) {
      const porEstado = contar(actual.todos, p => (ESTADOS_PEDIDO[estadoPedido(p)] || {}).label);
      const pagos = contar(actual.ok, p => ({ contraentrega: 'Contra entrega', tarjeta: 'Tarjeta', nequi: 'Nequi', pse: 'PSE' }[p.metodo_pago] || p.metodo_pago));
      const ciudades = contar(actual.ok, p => (p.envio_municipio || '').trim()).slice(0, 5);
      const ingPorProd = {};
      actual.ok.forEach(p => (p.items || []).forEach(i => {
        const o = ingPorProd[i.nombre] || (ingPorProd[i.nombre] = { u: 0, ing: 0 });
        o.u++; o.ing += num(i.precio);
      }));
      const topIng = Object.entries(ingPorProd).sort((a, b) => b[1].ing - a[1].ing).slice(0, 5).map(([n, o]) => [n, o.ing, o.u + ' uds']);
      mas += `<div class="ax-grid">
        <div class="admin-card"><h3>Pedidos por estado</h3>${filasBarras(porEstado)}</div>
        <div class="admin-card"><h3>Mayores ingresos por producto</h3>${filasBarras(topIng, pesos)}</div>
        <div class="admin-card"><h3>Cómo pagan</h3>${filasBarras(pagos)}</div>
        <div class="admin-card"><h3>Dónde compran</h3>${filasBarras(ciudades)}</div>
      </div>`;
    }
    const alertas = [...(permisos.inventario ? alertasInventario(productos) : []), ...(permisos.pedidos ? alertasPedidos(pedidos) : [])];
    mas += `<div class="admin-card" style="margin-top:var(--ap-gap,20px)">
        <h3>🔔 Requiere tu atención ${alertas.length ? `(${alertas.length})` : ''}</h3>
        ${alertas.length ? `<div class="ax-alertas">${alertas.map(a => `
          <div class="ax-alerta ${a.tipo === 'out' ? 'is-out' : a.tipo === 'old' ? 'is-old' : ''}">
            <span class="ax-dot"></span>
            <p>${a.txt}<small>${a.sub}</small></p>
            ${a.id != null ? `<button type="button" class="admin-btn admin-btn-ghost admin-btn-xs" data-editar="${esc(a.id)}">Editar</button>` : ''}
            ${a.pedido ? `<button type="button" class="admin-btn admin-btn-ghost admin-btn-xs" data-ir="tabBtnPedidos">Ver pedidos</button>` : ''}
          </div>`).join('')}</div>` : '<div class="ax-ok">✅ Todo en orden: sin alertas de stock ni pedidos atrasados.</div>'}
      </div>`;
    $('rsMasCont').innerHTML = mas;

    /* exportar y respaldo */
    const resp = $('rsRespaldo');
    resp.hidden = !(permisos.pedidos || permisos.inventario);
    resp.innerHTML = `<h3>💾 Exportar y respaldo</h3>
        <div class="ax-backup">
          <p>Descarga tus datos para guardarlos o abrirlos en Excel. El respaldo incluye datos de clientes: guárdalo en un lugar privado.</p>
          ${permisos.pedidos ? `<button type="button" class="admin-btn admin-btn-ghost" id="axCsv">Pedidos del periodo (CSV)</button>` : ''}
          <button type="button" class="admin-btn admin-btn-primary" id="axBackup">Copia de seguridad (JSON)</button>
        </div>`;
  }

  /* ---------- eventos (se enganchan una sola vez) ---------- */
  function iniciarEventos() {
    const tab = document.getElementById('tabResumen');
    const per$ = document.getElementById('rsPeriodos');
    if (per$) per$.addEventListener('click', (e) => {
      const b = e.target.closest('[data-per]');
      if (!b) return;
      periodoActual = b.dataset.per;
      pintarCentro();
    });
    const accion = (e) => {
      const ir = e.target.closest('[data-ir]');
      if (ir) { const t = document.getElementById(ir.dataset.ir); if (t) t.click(); return; }
      const ley = e.target.closest('.rs-ley');
      if (ley) {
        const s = ley.dataset.serie, otra = s === 'ingresos' ? 'pedidos' : 'ingresos';
        if (serieOn[s] && !serieOn[otra]) return;          // siempre queda una línea visible
        serieOn[s] = !serieOn[s];
        tab.querySelectorAll('.rs-ley').forEach(b => { const on = serieOn[b.dataset.serie]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        dibujarGrafica();
        return;
      }
      if (e.target.closest('#rsDescargarVentas')) {
        if (!datosGrafica.length) return;
        const cab = ['Fecha', 'Ingresos', 'Pedidos'];
        const filas = datosGrafica.map(d => [d.fecha.toISOString().slice(0, 10), d.ingresos, d.pedidos].map(celda).join(','));
        descargar(`maquina-ventas-7-dias-${stamp()}.csv`, '\uFEFF' + [cab.map(celda).join(','), ...filas].join('\n'), 'text/csv;charset=utf-8;');
        showToast('Ventas de los últimos 7 días descargadas.');
        return;
      }
      const ped = e.target.closest('[data-pedido]');
      if (ped) { abrirDetallePedido(ped.dataset.pedido); return; }
      const ed = e.target.closest('[data-editar]');
      if (ed) { abrirEditorProducto(ed.dataset.editar); return; }
      if (e.target.closest('#axCsv')) { exportarPedidosCSV(ctx.actual.todos); return; }
      if (e.target.closest('#axBackup')) { copiaSeguridad(ctx.productos, ctx.pedidos, ctx.permisos); }
    };
    tab.addEventListener('click', accion);
    tab.addEventListener('keydown', (e) => {                // filas con Enter / Espacio
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-pedido],tr[data-editar]')) { e.preventDefault(); accion(e); }
    });
    const ch = document.getElementById('rsChart');
    if (ch && 'ResizeObserver' in window) {
      let ancho = 0;
      new ResizeObserver(() => { if (ch.clientWidth && ch.clientWidth !== ancho) { ancho = ch.clientWidth; dibujarGrafica(); } }).observe(ch);
    }
  }
  iniciarEventos();

  /* se engancha al Resumen existente sin reemplazarlo */
  function cargando() {
    const k = document.getElementById('rsKpis');
    if (k && !k.children.length) k.innerHTML = '<article class="rs-kpi rs-sk"></article>'.repeat(5);
  }
  const original = pintarResumen;
  window.pintarResumen = async function () {
    cargando();
    const r = await original.apply(this, arguments);
    try { pintarCentro(); } catch (e) { console.error('[admin-extras]', e); }
    return r;
  };
})();
