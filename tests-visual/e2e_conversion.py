"""Pruebas de ventas y conversión: envío gratis por monto, "avísame" y analítica.
Ejecutar:  python3 e2e_conversion.py
Límite: el Firestore es simulado, así que NO prueba firestore.rules (eso lo hace tests-reglas/test-conversion.js)."""
import json, sys
from common import *
from cart_shots import CART
from e2e_checkout import seed_cart, fill_step1, fill_step2

results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('  ✓ ' if ok else '  ✗ ') + name + (f'  [{detail}]' if detail and not ok else ''))

ADMIN = {'admin@maquina.com': {'uid': 'uid_admin01', 'email': 'admin@maquina.com', 'pass': 'Admin1234'}}
SUBTOTAL = 459700   # subtotal del carrito de pruebas (cart_shots.CART)

# Sustituye window.track ANTES de que cargue analitica.js: así se ven todos los eventos que la tienda enviaría.
ESPIA = "window.__ga=[]; Object.defineProperty(window,'track',{configurable:true,get(){return (n,p)=>window.__ga.push([n,p]);},set(v){}});"

def pedidos(page):
    d = page.evaluate('window.__FBSTUB.dump()')['docs']
    return [v for k, v in d.items() if k.startswith('pedidos/')]

def config_envio(page, gratis):
    page.goto(f'{BASE}/index.html')
    page.evaluate("g=>window.__FBSTUB.seed({'config/envio': {gratisDesde: g}})", gratis)

def hasta_paso3(page):
    page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago')
    fill_step1(page); fill_step2(page)
    page.wait_for_selector('.ck-panel[data-step="3"]:not([hidden])')
    page.check('#aceptaTerminos')

def run():
    start_server()
    with sync_playwright() as pw:
        # ---------- A) envío gratis: el cliente SÍ llega al monto ----------
        print('A) Envío gratis por monto (alcanza el monto)')
        b, ctx, page, probe = launch(pw, 'escritorio'); page.add_init_script(ESPIA)
        seed_cart(page); config_envio(page, 400000)
        page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago'); page.wait_for_timeout(500)
        check('Carrito: banner de envío gratis visible', page.locator('#shipBanner').count() == 1)
        check('Carrito: dice "¡Envío gratis!"', '¡Envío gratis!' in page.locator('#shipBannerTxt').inner_text(), page.locator('#shipBannerTxt').inner_text())
        hasta_paso3(page)
        page.click('#ckSiguiente'); page.wait_for_selector('text=/pedido|Pedido/', timeout=8000); page.wait_for_timeout(1200)
        ps = pedidos(page)
        check('Se creó 1 pedido', len(ps) == 1, str(len(ps)))
        if ps:
            check('Pedido: costo_envio = 0', ps[0]['costo_envio'] == 0, str(ps[0]['costo_envio']))
            check('Pedido: total = subtotal', ps[0]['total'] == SUBTOTAL, str(ps[0]['total']))
        ga = page.evaluate('window.__ga'); nombres = [e[0] for e in ga]
        check('Analítica: view_cart, begin_checkout, checkout_paso y purchase', all(n in nombres for n in ['view_cart', 'begin_checkout', 'checkout_paso', 'purchase']), str(nombres))
        pur = [e[1] for e in ga if e[0] == 'purchase']
        check('Analítica: purchase con valor, moneda COP y 3 productos', pur and pur[0]['value'] == SUBTOTAL and pur[0]['currency'] == 'COP' and len(pur[0]['items']) == 3, str(pur[:1])[:160])
        check('Analítica: purchase tiene transaction_id', pur and len(pur[0].get('transaction_id', '')) >= 4)
        crudo = json.dumps(ga)
        check('Analítica: NO se filtra correo, teléfono ni nombre', 'camila@gmail.com' not in crudo and '3001234567' not in crudo and 'Camila' not in crudo and 'Calle 45' not in crudo)
        check('Sin errores de consola', not probe.console_errors and not probe.page_errors, str(probe.console_errors + probe.page_errors)[:200])
        b.close()

        # ---------- B) no alcanza el monto: se cobra el envío ----------
        print('B) Envío gratis por monto (NO alcanza)')
        b, ctx, page, probe = launch(pw, 'escritorio')
        seed_cart(page); config_envio(page, 600000)
        page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago'); page.wait_for_timeout(500)
        txt = page.locator('#shipBannerTxt').inner_text()
        check('Banner indica cuánto falta ($140.300)', '140.300' in txt, txt)
        hasta_paso3(page)
        page.click('#ckSiguiente'); page.wait_for_selector('text=/pedido|Pedido/', timeout=8000); page.wait_for_timeout(1000)
        ps = pedidos(page)
        check('Pedido con envío cobrado (> 0)', len(ps) == 1 and ps[0]['costo_envio'] > 0, str([p['costo_envio'] for p in ps]))
        b.close()

        # ---------- C) sin promoción configurada ----------
        print('C) Sin envío gratis configurado')
        b, ctx, page, probe = launch(pw, 'escritorio')
        seed_cart(page); config_envio(page, 0)
        page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago'); page.wait_for_timeout(500)
        check('No hay banner de envío gratis', page.locator('#shipBanner').count() == 0)
        b.close()

        # ---------- D) el servidor manda: el monto cambió justo antes de confirmar ----------
        print('D) El monto cambia antes de confirmar (el servidor manda)')
        b, ctx, page, probe = launch(pw, 'escritorio')
        seed_cart(page); config_envio(page, 400000)
        hasta_paso3(page)
        page.evaluate("window.__FBSTUB.seed({'config/envio': {gratisDesde: 0}})")      # el dueño desactiva la promo
        page.click('#ckSiguiente'); page.wait_for_timeout(1500)
        check('NO se crea el pedido con el envío gratis viejo', len(pedidos(page)) == 0, str(len(pedidos(page))))
        cuerpo = page.locator('body').inner_text()
        check('Se avisa que cambió el costo de envío', 'costo de envío' in cuerpo.lower(), cuerpo[:80])
        b.close()

        # ---------- E) panel admin: configurar el monto ----------
        print('E) Panel admin: Envío gratis por monto')
        b, ctx, page, probe = launch(pw, 'escritorio')
        page.goto(f'{BASE}/admin.html'); page.wait_for_selector('#formAdminLogin')
        page.evaluate("(a)=>window.__FBSTUB.seed({}, a)", ADMIN)
        page.goto(f'{BASE}/admin.html'); page.wait_for_selector('#formAdminLogin')
        page.fill('#adminUsuario', 'admin@maquina.com'); page.fill('#adminClave', 'Admin1234')
        page.click('.gl-submit'); page.wait_for_selector('#adminDashView', state='visible', timeout=10000); page.wait_for_timeout(600)
        if page.locator('.ap-burger').is_visible(): page.click('.ap-burger'); page.wait_for_timeout(350)
        page.click('#tabBtnEnvios'); page.wait_for_selector('#cvGratisValor', state='visible')
        page.fill('#cvGratisValor', '300000'); page.click('#cvGratisGuardar'); page.wait_for_timeout(700)
        v = page.evaluate('window.__FBSTUB.dump()')['docs'].get('config/envio', {}).get('gratisDesde')
        check('Firestore: gratisDesde = 300000', v == 300000, str(v))
        check('El campo se formatea como 300.000', page.locator('#cvGratisValor').input_value() == '300.000', page.locator('#cvGratisValor').input_value())
        page.fill('#cvGratisValor', ''); page.click('#cvGratisGuardar'); page.wait_for_timeout(700)
        v = page.evaluate('window.__FBSTUB.dump()')['docs'].get('config/envio', {}).get('gratisDesde')
        check('Vacío = desactivado (gratisDesde = 0)', v == 0, str(v))
        check('Admin: lista de espera visible en Resumen', page.locator('#cvEspera').count() == 1)
        check('Admin sin errores de consola', not probe.console_errors and not probe.page_errors, str(probe.console_errors + probe.page_errors)[:200])
        b.close()

        # ---------- F) producto agotado: "avísame" ----------
        print('F) Producto agotado: Avísame cuando haya')
        b, ctx, page, probe = launch(pw, 'escritorio'); page.add_init_script(ESPIA)
        page.goto(f'{BASE}/producto.html?id=1'); page.wait_for_selector('#pdpStock'); page.wait_for_timeout(600)
        check('Con stock: NO se muestra el aviso', page.locator('#pdpAviso').is_hidden())
        ga = [e[0] for e in page.evaluate('window.__ga')]
        check('Analítica: view_item al abrir el producto', 'view_item' in ga, str(ga))
        page.locator('#pdpTallas .yd-size:not(.is-out) >> nth=0').click(); page.wait_for_timeout(200)   # la tienda exige elegir talla
        page.click('#pdpAdd'); page.wait_for_timeout(300)
        check('Analítica: add_to_cart al agregar', 'add_to_cart' in [e[0] for e in page.evaluate('window.__ga')])
        page.evaluate("""()=>{const p=buscarProducto('1'); p.stock=0;
          Object.keys(p.stockColores||{}).forEach(k=>p.stockColores[k]=0);
          Object.keys(p.stockTallas||{}).forEach(k=>p.stockTallas[k]=0);}""")
        page.locator('#pdpColores .yd-color >> nth=0').click(); page.wait_for_timeout(300)
        check('Agotado: aparece el formulario "Avísame"', page.locator('#pdpAviso').is_visible())
        page.fill('#pdpAvisoCorreo', 'sin-arroba'); page.click('#pdpAvisoBtn'); page.wait_for_timeout(300)
        check('Correo inválido: se pide uno válido y no se guarda', 'válido' in page.locator('#pdpAvisoMsg').inner_text()
              and not [k for k in page.evaluate('window.__FBSTUB.dump()')['docs'] if k.startswith('avisos_stock/')])
        page.fill('#pdpAvisoCorreo', 'Camila@Gmail.com'); page.click('#pdpAvisoBtn'); page.wait_for_timeout(600)
        docs = page.evaluate('window.__FBSTUB.dump()')['docs']
        av = [v for k, v in docs.items() if k.startswith('avisos_stock/')]
        check('Se guardó 1 aviso en avisos_stock', len(av) == 1, str(len(av)))
        if av:
            check('Aviso: correo en minúsculas, producto 1, notificado=false', av[0]['correo'] == 'camila@gmail.com' and av[0]['producto_id'] == '1' and av[0]['notificado'] is False, str(av[0]))
        check('Mensaje de confirmación visible', 'Listo' in page.locator('#pdpAvisoMsg').inner_text())
        page.click('#pdpAvisoBtn'); page.wait_for_timeout(500)
        n = len([k for k in page.evaluate('window.__FBSTUB.dump()')['docs'] if k.startswith('avisos_stock/')])
        check('Pedirlo dos veces NO duplica el aviso', n == 1, str(n))
        check('Analítica: notify_me', 'notify_me' in [e[0] for e in page.evaluate('window.__ga')])
        check('Producto sin errores de consola', not probe.console_errors and not probe.page_errors, str(probe.console_errors + probe.page_errors)[:200])
        b.close()

        # ---------- G) producto: línea de envío gratis ----------
        print('G) Producto: línea "Envío gratis en compras desde"')
        b, ctx, page, probe = launch(pw, 'escritorio')
        config_envio(page, 250000)
        page.goto(f'{BASE}/producto.html?id=1'); page.wait_for_selector('#envGratis', state='attached'); page.wait_for_timeout(800)
        t = page.locator('#envGratis').inner_text()
        check('Se muestra "Envío gratis en compras desde $250.000"', page.locator('#envGratis').is_visible() and '250.000' in t, t)
        b.close()

    ok = sum(1 for r in results if r[1])
    print(f'\nRESUMEN conversión: {ok}/{len(results)} OK')
    sys.exit(0 if ok == len(results) else 1)

if __name__ == '__main__':
    run()
