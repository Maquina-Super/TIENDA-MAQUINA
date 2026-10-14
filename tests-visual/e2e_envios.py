import json, os
from common import *
from cart_shots import CART

OUT = os.environ.get('SHOTS', 'capturas')
os.makedirs(OUT, exist_ok=True)
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('  ✓ ' if ok else '  ✗ ') + name + (f'  [{detail}]' if detail and not ok else ''))

ADMIN = {'admin@maquina.com': {'uid': 'uid_admin01', 'email': 'admin@maquina.com', 'pass': 'Admin1234'}}

def cfg(page):
    return page.evaluate('window.__FBSTUB.dump()')['docs'].get('config/envio', {})

def abrir_envios(page):
    page.goto(f'{BASE}/admin.html'); page.wait_for_selector('#formAdminLogin')
    page.evaluate("(a)=>window.__FBSTUB.seed({}, a)", ADMIN)
    page.goto(f'{BASE}/admin.html'); page.wait_for_selector('#formAdminLogin')
    page.fill('#adminUsuario', 'admin@maquina.com'); page.fill('#adminClave', 'Admin1234')
    page.click('.gl-submit'); page.wait_for_selector('#adminDashView', state='visible', timeout=10000)
    page.wait_for_timeout(500)
    if page.locator('.ap-burger').is_visible(): page.click('.ap-burger'); page.wait_for_timeout(350)   # móvil: abre el menú lateral
    page.click('#tabBtnEnvios'); page.wait_for_selector('#evBuscar', state='visible')

def elegir(page, texto, nombre):
    page.fill('#evBuscar', texto); page.wait_for_selector('.ev-res')
    page.click(f'.ev-res:has-text("{nombre}") >> nth=0')

def run():
    start_server()
    with sync_playwright() as pw:
        # ---------- A) panel del vendedor ----------
        print('A) Panel Envíos: buscar, configurar, tabla')
        b, ctx, page, probe = launch(pw, 'escritorio')
        abrir_envios(page)
        check('Selector de departamento tiene 33 + "Todos"', page.locator('#evDepto option').count() == 34, str(page.locator('#evDepto option').count()))
        check('Tabla vacía muestra mensaje guía', 'Aún no hay tarifas' in page.locator('#evTablaBody').inner_text())
        check('Botón Guardar deshabilitado sin ubicación', page.locator('#evGuardar').is_disabled())

        elegir(page, 'rionegro', 'Rionegro')
        check('Buscar "rionegro" (sin tildes/mayúsculas) selecciona Rionegro', page.locator('#evSelNombre').inner_text() == 'Rionegro')
        check('Departamento y municipio se sincronizan', page.locator('#evDepto').input_value() == 'Antioquia')
        check('Guardar sigue deshabilitado sin valor', page.locator('#evGuardar').is_disabled())
        page.fill('#evValor', 'abc'); page.locator('#evValor').blur()
        check('Valor no numérico: error visible', 'números' in page.locator('#evError').inner_text(), page.locator('#evError').inner_text())
        check('Valor no numérico: no deja guardar', page.locator('#evGuardar').is_disabled())
        page.fill('#evValor', '0'); page.locator('#evValor').blur()
        check('Valor 0 en envío normal: pide usar "gratis"', 'gratis' in page.locator('#evError').inner_text())
        page.fill('#evValor', '12000'); page.locator('#evValor').blur()
        check('Valor se formatea como 12.000', page.locator('#evValor').input_value() == '12.000', page.locator('#evValor').input_value())
        page.screenshot(path=f'{OUT}/envios_admin_formulario.png', full_page=True)
        page.click('#evGuardar'); page.wait_for_timeout(700)
        c = cfg(page)
        check('Firestore: config/envio.municipios guarda Rionegro 12000', c.get('municipios', {}).get('m05'.ljust(3) + '') is None and any(v.get('costo') == 12000 and v.get('nombre') == 'Rionegro' for v in c.get('municipios', {}).values()), json.dumps(c.get('municipios'))[:200])
        check('Firestore: "costos" incluye 12000 y los costos de las zonas', 12000 in c.get('costos', []), str(c.get('costos')))
        check('Formulario se limpia tras guardar', page.locator('#evSelNombre').inner_text() == 'Ubicación seleccionada' and page.locator('#evGuardar').is_disabled())
        check('Tabla muestra 1 ubicación con $ 12.000', '1 ubicación' == page.locator('#evConteo').inner_text() and '$ 12.000' in page.locator('#evTablaBody').inner_text())

        # envío gratis en Bogotá
        elegir(page, 'bogota', 'Bogotá')
        page.check('input[name="evTipo"][value="gratis"]', force=True)
        check('Envío gratis: campo valor deshabilitado y Guardar habilitado', page.locator('#evValor').is_disabled() and page.locator('#evGuardar').is_enabled())
        page.click('#evGuardar'); page.wait_for_timeout(700)
        c = cfg(page)
        gr = [v for v in c.get('municipios', {}).values() if v.get('nombre') == 'Bogotá']
        check('Firestore: Bogotá gratis (costo 0, gratis true)', gr and gr[0]['costo'] == 0 and gr[0]['gratis'] is True, str(gr))
        check('Firestore: "costos" incluye 0 (para validar el pedido)', 0 in c.get('costos', []), str(c.get('costos')))
        check('Tabla: 2 ubicaciones, Bogotá con badge Gratis', page.locator('#evConteo').inner_text() == '2 ubicaciones' and page.locator('.ev-badge.is-gratis').count() == 1)

        # editar
        page.click('tr:has-text("Rionegro") button[data-ac="editar"]'); page.wait_for_timeout(300)
        check('Editar: carga la tarifa en el formulario', page.locator('#evValor').input_value() == '12.000' and page.locator('#evSelNombre').inner_text() == 'Rionegro')
        page.fill('#evValor', '14.500'); page.click('#evGuardar'); page.wait_for_timeout(700)
        check('Editar: se actualiza a 14.500', '$ 14.500' in page.locator('#evTablaBody').inner_text())
        check('Editar: "costos" ya no tiene 12000', 12000 not in cfg(page).get('costos', []) and 14500 in cfg(page).get('costos', []))

        # filtros de tabla
        page.fill('#evFiltroQ', 'bogo'); page.wait_for_timeout(200)
        check('Filtro de la tabla por nombre', page.locator('#evTablaBody tr').count() == 1 and 'Bogotá' in page.locator('#evTablaBody').inner_text())
        page.fill('#evFiltroQ', ''); page.select_option('#evFiltroDepto', 'Antioquia'); page.wait_for_timeout(200)
        check('Filtro de la tabla por departamento', page.locator('#evTablaBody tr').count() == 1 and 'Rionegro' in page.locator('#evTablaBody').inner_text())
        page.select_option('#evFiltroDepto', '')

        # paginación: 25 tarifas más
        page.evaluate("""async()=>{ const ms=todosLosMunicipios().filter(m=>m.departamento==='Boyacá').slice(0,24);
          for (const m of ms) await guardarTarifaMunicipio(m.id,{costo:9000+ (m.id.slice(-2)*1),gratis:false}); pintarEnviosCiudades(); }""")
        page.wait_for_timeout(500)
        check('Paginación aparece con >10 tarifas', page.locator('#evPaginacion').is_visible() and page.locator('#evTablaBody tr').count() == 10)
        page.click('#evPaginacion button[data-p="2"]'); page.wait_for_timeout(200)
        check('Página 2 muestra otras filas', page.locator('#evTablaBody tr').count() == 10 and page.locator('#evPaginacion .is-on').inner_text() == '2')
        page.screenshot(path=f'{OUT}/envios_admin_tabla_escritorio.png', full_page=True)

        # eliminar
        page.select_option('#evFiltroDepto', 'Antioquia')
        page.click('tr:has-text("Rionegro") button[data-ac="eliminar"]'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/envios_admin_confirmar.png')
        page.click('text=Sí, eliminar'); page.wait_for_timeout(700)
        check('Eliminar: Rionegro sale de Firestore y de "costos"', not any(v.get('nombre') == 'Rionegro' for v in cfg(page).get('municipios', {}).values()) and 14500 not in cfg(page).get('costos', []))
        check('Tabla de zonas base sigue disponible (plegable)', page.locator('details.env-base').count() == 1)
        check('Sin errores de consola en el panel', not probe.console_errors and not probe.page_errors, str(probe.console_errors + probe.page_errors))
        b.close()

        # ---------- B) panel en móvil ----------
        print('B) Panel Envíos en móvil')
        b, ctx, page, probe = launch(pw, 'movil')
        abrir_envios(page)
        ancho = page.evaluate('document.documentElement.scrollWidth')
        check('Móvil: sin desborde horizontal de la página', ancho <= 376, str(ancho))
        page.screenshot(path=f'{OUT}/envios_admin_movil.png', full_page=True)
        b.close()

        # ---------- C) carrito aplica las tarifas ----------
        print('C) Carrito aplica tarifas por ciudad')
        zonas_def = None
        b, ctx, page, probe = launch(pw, 'escritorio')
        page.goto(f'{BASE}/index.html')
        page.evaluate("""c=>{localStorage.setItem('maquina_carrito',JSON.stringify(c)); sessionStorage.clear();
          const ms=(n)=>todosLosMunicipios ? 0 : 0;}""", CART)
        # sembrar config/envio con tarifas (ids reales del módulo)
        page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago')
        ids = page.evaluate("""()=>{const f=(n,d)=>todosLosMunicipios().find(m=>m.nombre===n&&m.departamento===d).id;
          return {rio:f('Rionegro','Antioquia'), bog:f('Bogotá','Bogotá D.C.'), cali:f('Cali','Valle del Cauca')}}""")
        costos = [8000, 10000, 15000, 18000, 20000, 25000, 14500, 0, 11000]
        page.evaluate("""(a)=>window.__FBSTUB.seed({'config/envio': {municipios: {
            [a.ids.rio]: {costo:14500, gratis:false, nombre:'Rionegro', departamento:'Antioquia'},
            [a.ids.bog]: {costo:0, gratis:true, nombre:'Bogotá', departamento:'Bogotá D.C.'},
            [a.ids.cali]: {costo:11000, gratis:false, nombre:'Cali', departamento:'Valle del Cauca'}},
            costos: a.costos}}, {})""", {'ids': ids, 'costos': costos})
        page.evaluate("sessionStorage.clear()")
        page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago')
        page.fill('#nombreCliente', 'Camila Rodríguez'); page.fill('#emailCliente', 'camila@gmail.com'); page.fill('#telefonoCliente', '3001234567')
        page.click('#ckSiguiente'); page.wait_for_selector('.ck-panel[data-step="2"]:not([hidden])'); page.wait_for_timeout(500)

        page.click('#municipioInput'); page.keyboard.type('rione', delay=30)
        txt = page.locator('.municipio-sug >> nth=0').inner_text()
        check('Antioquia: sugerencia Rionegro muestra la tarifa del panel ($14.500)', 'Rionegro' in txt and '14.500' in txt, txt)
        page.click('.municipio-sug >> nth=0'); page.wait_for_timeout(200)
        check('Carrito: envío de Rionegro = $14.500', '14.500' in page.locator('#envioValor').inner_text(), page.locator('#envioValor').inner_text())

        page.select_option('#departamentoEnvio', 'Valle del Cauca'); page.wait_for_timeout(200)
        page.click('#municipioInput'); page.keyboard.type('cali', delay=30)
        sug = page.locator('.municipio-sug').all_inner_texts()
        check('Otro departamento: busca entre sus municipios', any('Cali' in s for s in sug), str(sug[:4]))
        page.click('.municipio-sug:has-text("Cali") >> nth=0'); page.wait_for_timeout(200)
        check('Cali = $11.000 (tarifa del panel)', '11.000' in page.locator('#envioValor').inner_text(), page.locator('#envioValor').inner_text())

        page.select_option('#departamentoEnvio', 'Bogotá D.C.'); page.wait_for_timeout(200)
        page.click('#municipioInput'); page.keyboard.type('bogo', delay=30)
        page.click('.municipio-sug >> nth=0'); page.wait_for_timeout(200)
        check('Bogotá con envío gratis: carrito muestra ¡Gratis!', '¡Gratis!' in page.locator('#envioValor').inner_text(), page.locator('#envioValor').inner_text())

        page.select_option('#departamentoEnvio', 'Boyacá'); page.wait_for_timeout(200)
        page.click('#municipioInput'); page.keyboard.type('Tunja', delay=30); page.wait_for_timeout(200)
        page.click('.municipio-sug:has-text("Tunja") >> nth=0'); page.wait_for_timeout(200)
        check('Ciudad sin tarifa propia: usa tarifa base "otra ciudad" ($25.000)', '25.000' in page.locator('#envioValor').inner_text(), page.locator('#envioValor').inner_text())

        page.select_option('#departamentoEnvio', 'Chocó'); page.wait_for_timeout(200)
        page.fill('#municipioInput', 'Pueblo Inventado'); page.wait_for_timeout(200)
        check('Ciudad escrita a mano (fuera de lista): se acepta con tarifa estándar', '25.000' in page.locator('#envioValor').inner_text(), page.locator('#envioValor').inner_text())

        # pedido real con tarifa por ciudad (Cali) y con gratis (Bogotá)
        for depto, buscar, esperado, gratis in [('Valle del Cauca', 'cali', 11000, False), ('Bogotá D.C.', 'bogo', 0, True)]:
            page.goto(f'{BASE}/index.html')
            page.evaluate("c=>{localStorage.setItem('maquina_carrito',JSON.stringify(c)); sessionStorage.clear();}", CART)
            page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago')
            page.fill('#nombreCliente', 'Camila Rodríguez'); page.fill('#emailCliente', 'camila@gmail.com'); page.fill('#telefonoCliente', '3001234567')
            page.click('#ckSiguiente'); page.wait_for_selector('.ck-panel[data-step="2"]:not([hidden])'); page.wait_for_timeout(500)
            page.select_option('#departamentoEnvio', depto); page.wait_for_timeout(200)
            page.click('#municipioInput'); page.keyboard.type(buscar, delay=30)
            page.click('.municipio-sug >> nth=0')
            page.fill('#direccionCliente', 'Calle 45 # 30-12'); page.click('#ckSiguiente')
            page.wait_for_selector('.ck-panel[data-step="3"]:not([hidden])')
            page.check('#aceptaTerminos'); page.click('#ckSiguiente')
            page.wait_for_selector('text=/pedido|Pedido/', timeout=8000); page.wait_for_timeout(1500)
            db = page.evaluate('window.__FBSTUB.dump()')['docs']
            peds = [v for k, v in db.items() if k.startswith('pedidos/') and v.get('envio_departamento') == depto]
            check(f'Pedido en {depto}: se crea con costo_envio {esperado}', len(peds) == 1 and peds[0]['costo_envio'] == esperado, str([p.get('costo_envio') for p in peds]))
            if peds:
                check(f'Pedido en {depto}: total = subtotal + envío y zona guardada', peds[0]['total'] == peds[0]['subtotal'] + esperado and peds[0]['envio_zona'].startswith('m'), peds[0].get('envio_zona'))
                # espejo de firestore.rules: el costo debe estar en config/envio.costos
                check(f'Pedido en {depto}: pasa la regla envioPermitido (costo ∈ costos)', peds[0]['costo_envio'] in db['config/envio']['costos'])
        page.screenshot(path=f'{OUT}/envios_carrito_confirmacion.png')
        check('Sin errores de consola en el carrito', not probe.console_errors and not probe.page_errors, str(probe.console_errors + probe.page_errors))
        b.close()

        # ---------- D) tarifa cambia mientras el cliente paga ----------
        print('D) El servidor rechaza un envío desactualizado')
        b, ctx, page, probe = launch(pw, 'escritorio')
        page.goto(f'{BASE}/index.html')
        page.evaluate("c=>{localStorage.setItem('maquina_carrito',JSON.stringify(c)); sessionStorage.clear();}", CART)
        page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago')
        ids = page.evaluate("()=>({cali: todosLosMunicipios().find(m=>m.nombre==='Cali').id})")
        page.evaluate("""(a)=>window.__FBSTUB.seed({'config/envio': {municipios: {[a.id]: {costo:11000, gratis:false}}, costos:[8000,11000,25000]}}, {})""", {'id': ids['cali']})
        page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago')
        page.fill('#nombreCliente', 'Camila Rodríguez'); page.fill('#emailCliente', 'camila@gmail.com'); page.fill('#telefonoCliente', '3001234567')
        page.click('#ckSiguiente'); page.wait_for_selector('.ck-panel[data-step="2"]:not([hidden])'); page.wait_for_timeout(500)
        page.select_option('#departamentoEnvio', 'Valle del Cauca'); page.click('#municipioInput'); page.keyboard.type('cali', delay=30)
        page.click('.municipio-sug:has-text("Cali") >> nth=0'); page.fill('#direccionCliente', 'Calle 45 # 30-12'); page.click('#ckSiguiente')
        page.wait_for_selector('.ck-panel[data-step="3"]:not([hidden])'); page.check('#aceptaTerminos')
        # el vendedor cambia la tarifa justo antes de confirmar
        page.evaluate("""(a)=>window.__FBSTUB.seed({'config/envio': {municipios: {[a.id]: {costo:16000, gratis:false}}, costos:[8000,16000,25000]}}, {})""", {'id': ids['cali']})
        n0 = len([k for k in page.evaluate('window.__FBSTUB.dump()')['docs'] if k.startswith('pedidos/')])
        page.click('#ckSiguiente'); page.wait_for_timeout(2000)
        n1 = len([k for k in page.evaluate('window.__FBSTUB.dump()')['docs'] if k.startswith('pedidos/')])
        check('Tarifa cambiada: NO se crea el pedido con el valor viejo', n1 == n0, f'{n0}->{n1}')
        check('Tarifa cambiada: se avisa al cliente', 'envío' in page.locator('body').inner_text().lower() and 'cambi' in page.locator('body').inner_text().lower())
        b.close()

    bad = [r for r in results if not r[1]]
    print(f'\nRESUMEN envíos: {len(results)-len(bad)}/{len(results)} OK')
    if bad:
        for n, _, d in bad: print('  FALLA:', n, d)

if __name__ == '__main__':
    run()
