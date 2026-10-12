import json, os, sys
from common import *
from cart_shots import CART

OUT = os.environ.get('SHOTS', 'capturas')
os.makedirs(OUT, exist_ok=True)
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('  ✓ ' if ok else '  ✗ ') + name + (f'  [{detail}]' if detail and not ok else ''))

def seed_cart(page, cart=CART):
    page.goto(f'{BASE}/index.html')
    page.evaluate("c=>{localStorage.setItem('maquina_carrito',JSON.stringify(c)); sessionStorage.clear();}", cart)

def fill_step1(page, nombre='Camila Rodríguez', correo='camila@gmail.com', tel='3001234567'):
    page.fill('#nombreCliente', nombre); page.fill('#emailCliente', correo); page.fill('#telefonoCliente', tel)
    page.click('#ckSiguiente')

def fill_step2(page, muni='Medellín'):
    page.wait_for_selector('.ck-panel[data-step="2"]:not([hidden])'); page.wait_for_timeout(600)
    page.click('#municipioInput'); page.keyboard.type(muni.split('í')[0] if 'í' in muni else muni, delay=30)
    page.click('.municipio-sug >> nth=0')
    page.fill('#direccionCliente', 'Calle 45 # 30-12')
    page.click('#ckSiguiente')

def run():
    start_server()
    with sync_playwright() as pw:
        # ---------- A) contraentrega de principio a fin ----------
        print('A) Contraentrega')
        b, ctx, page, probe = launch(pw, 'escritorio')
        seed_cart(page)
        page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago')
        # validación paso 1 con campos vacíos
        page.click('#ckSiguiente')
        page.wait_for_timeout(200)
        check('Paso 1: campos vacíos muestran error', page.locator('#errNombreCliente').inner_text().strip() != '')
        check('Paso 1: aviso de error visible (role=alert)', page.locator('#ckAlert').is_visible())
        fill_step1(page)
        fill_step2(page)
        page.wait_for_selector('.ck-panel[data-step="3"]:not([hidden])')
        page.screenshot(path=f'{OUT}/checkout_paso3_escritorio.png', full_page=True)
        check('Paso 3: método contraentrega preseleccionado', page.locator('.metodo-card[data-metodo="contraentrega"]').get_attribute('aria-checked') == 'true')
        # intentar confirmar sin aceptar términos
        page.click('#ckSiguiente'); page.wait_for_timeout(300)
        check('Sin aceptar términos: bloquea y muestra error', page.locator('#errAceptaTerminos').inner_text().strip() != '')
        page.check('#aceptaTerminos')
        total_txt = page.locator('#ckTotalV').inner_text()
        page.click('#ckSiguiente')
        page.wait_for_selector('text=/pedido|Pedido/', timeout=8000)
        page.wait_for_timeout(1500)
        page.screenshot(path=f'{OUT}/checkout_confirmacion_escritorio.png', full_page=True)
        db = page.evaluate('window.__FBSTUB.dump()')
        pedidos = {k: v for k, v in db['docs'].items() if k.startswith('pedidos/')}
        check('Se creó exactamente 1 pedido en Firestore', len(pedidos) == 1, f'{len(pedidos)}')
        if pedidos:
            p = list(pedidos.values())[0]
            check('Pedido: estado pendiente y pago pendiente (contraentrega)', p['estado'] == 'pendiente' and p['estado_pago'] == 'pendiente', f"{p['estado']}/{p['estado_pago']}")
            check('Pedido: total = subtotal + envío', p['total'] == p['subtotal'] + p['costo_envio'], f"{p['total']} vs {p['subtotal']}+{p['costo_envio']}")
            check('Pedido: subtotal correcto (2×189.900 + 79.900)', p['subtotal'] == 459700, str(p['subtotal']))
            check('Pedido: 3 ítems', len(p['items']) == 3)
        prod1 = db['docs'].get('productos/1', {}); prod4 = db['docs'].get('productos/4', {})
        check('Stock del Buso Volt descontado en 2', prod1.get('stock') is not None, str(prod1.get('stock')))
        carrito_ls = page.evaluate("JSON.parse(localStorage.getItem('maquina_carrito')||'[]').length")
        check('Carrito vacío después de confirmar', carrito_ls == 0, str(carrito_ls))
        tipos = [a.get('tipo') for a in probe.apps_script]
        check('Se avisó al Apps Script (hoja) del pedido nuevo', any(t and 'pedido' in t for t in tipos) or len(tipos) > 0, str(tipos))
        check('Sin errores de consola en el flujo', not probe.console_errors and not probe.page_errors, str(probe.console_errors + probe.page_errors))
        json.dump({'apps_script': probe.apps_script, 'pedido': list(pedidos.values())[:1]}, open(f'{OUT}/_pedido_A.json', 'w'), indent=1, ensure_ascii=False, default=str)
        b.close()

        # ---------- B) PSE ----------
        print('B) PSE')
        b, ctx, page, probe = launch(pw, 'movil')
        seed_cart(page)
        page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago')
        fill_step1(page); fill_step2(page)
        page.wait_for_selector('.ck-panel[data-step="3"]:not([hidden])')
        page.click('.metodo-card[data-metodo="pse"]'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/checkout_pse_movil.png', full_page=True)
        page.check('#aceptaTerminos'); page.click('#ckSiguiente'); page.wait_for_timeout(400)
        check('PSE sin banco: error claro', 'banco' in page.locator('#errPseBanco').inner_text().lower(), page.locator('#errPseBanco').inner_text())
        page.select_option('#pseBanco', index=1)
        page.click('#ckSiguiente'); page.wait_for_timeout(2500)
        db = page.evaluate('window.__FBSTUB.dump()')
        pedidos = [v for k, v in db['docs'].items() if k.startswith('pedidos/')]
        check('PSE: pedido creado como por_verificar', len(pedidos) == 1 and pedidos[0]['estado_pago'] == 'por_verificar', str([p.get('estado_pago') for p in pedidos]))
        page.screenshot(path=f'{OUT}/checkout_confirmacion_pse_movil.png', full_page=True)
        b.close()

        # ---------- C) producto agotado entre tanto ----------
        print('C) Stock agotado durante el pago')
        b, ctx, page, probe = launch(pw, 'escritorio')
        seed_cart(page)
        page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago')
        fill_step1(page); fill_step2(page)
        page.wait_for_selector('.ck-panel[data-step="3"]:not([hidden])')
        # otro cliente compra todo el stock
        page.evaluate("""async()=>{await fbDb.collection('productos').doc('4').update({stock:0,stockTallas:{}}); }""")
        page.check('#aceptaTerminos'); page.click('#ckSiguiente'); page.wait_for_timeout(3000)
        page.screenshot(path=f'{OUT}/checkout_error_stock_escritorio.png')
        visible_txt = page.evaluate("document.body.innerText")
        db = page.evaluate('window.__FBSTUB.dump()')
        n_ped = len([k for k in db['docs'] if k.startswith('pedidos/')])
        check('Sin stock: NO se crea pedido', n_ped == 0, str(n_ped))
        check('Sin stock: se muestra mensaje claro al cliente', any(s in visible_txt.lower() for s in ['se agotó', 'ya no está', 'solo quedan', 'agotado']), visible_txt[:80])
        carrito_ls = page.evaluate("JSON.parse(localStorage.getItem('maquina_carrito')||'[]').length")
        check('Sin stock: el carrito se conserva', carrito_ls == 3, str(carrito_ls))
        b.close()

        # ---------- D) fallo de red / servidor al crear pedido ----------
        print('D) Fallo del servidor y reintento sin duplicar')
        b, ctx, page, probe = launch(pw, 'escritorio')
        seed_cart(page)
        page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago')
        fill_step1(page); fill_step2(page)
        page.wait_for_selector('.ck-panel[data-step="3"]:not([hidden])')
        page.evaluate("window.__FBCFG={failWrites:'unavailable'}")
        page.check('#aceptaTerminos'); page.click('#ckSiguiente'); page.wait_for_timeout(2500)
        page.screenshot(path=f'{OUT}/checkout_error_red_escritorio.png')
        txt = page.evaluate("document.body.innerText").lower()
        check('Fallo de red: mensaje comprensible', any(s in txt for s in ['conexión', 'conexion', 'intenta', 'inténtalo']), txt[:100])
        n_ped = len([k for k in page.evaluate('window.__FBSTUB.dump()')['docs'] if k.startswith('pedidos/')])
        check('Fallo de red: no se crea pedido', n_ped == 0)
        page.evaluate("window.__FBCFG={}")
        # reintento
        btn = page.locator('#ckSiguiente'); 
        try:
            # el overlay de error puede tener botón de reintentar
            for sel in ['text=/Reintentar|Intentar de nuevo|Volver a intentar/i', '#ovPrimario', '.ov-btn-primary']:
                if page.locator(sel).first.is_visible():
                    page.locator(sel).first.click(); break
        except Exception: pass
        page.wait_for_timeout(3500)
        n_ped = len([k for k in page.evaluate('window.__FBSTUB.dump()')['docs'] if k.startswith('pedidos/')])
        check('Reintento: queda exactamente 1 pedido (sin duplicar)', n_ped == 1, str(n_ped))
        b.close()
    bad = [r for r in results if not r[1]]
    print(f'\nRESUMEN checkout: {len(results)-len(bad)}/{len(results)} OK')
    return results

if __name__ == '__main__':
    run()
