import json, os, re
from common import *
from cart_shots import CART
from e2e_checkout import seed_cart, fill_step1, fill_step2
OUT=os.environ.get('SHOTS','capturas'); results=[]
def check(n,ok,d=''):
    results.append((n,bool(ok),d)); print(('  ✓ ' if ok else '  ✗ ')+n+(f'  [{d}]' if d and not ok else ''))
start_server()
au={'admin@maquina.com':{'uid':'uid_admin01','email':'admin@maquina.com','pass':'Admin1234'}}
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport=VIEWPORTS['escritorio'],locale='es-CO'); page=ctx.new_page(); probe=Probe(); attach(ctx,page,probe)
    print('1) Cliente compra')
    seed_cart(page); page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago')
    fill_step1(page); fill_step2(page); page.wait_for_selector('.ck-panel[data-step="3"]:not([hidden])')
    page.check('#aceptaTerminos'); page.click('#ckSiguiente'); page.wait_for_timeout(2500)
    db=page.evaluate('window.__FBSTUB.dump()'); ids=[k.split('/')[1] for k in db['docs'] if k.startswith('pedidos/')]
    check('Pedido creado',len(ids)==1); pid=ids[0]
    shown=page.evaluate("document.body.innerText")
    check('La confirmación muestra el código del pedido', re.search(r'#[A-Z0-9]{5,8}', shown) is not None, shown[:60])
    check('El botón "Rastrear mi pedido" lleva a seguimiento con el ID', page.locator(f'a[href*="seguimiento.html?pedido={pid}"]').count()==1)
    check('El encabezado ya no dice "Revisa tus productos"', 'Revisa tus productos' not in shown and 'gracias por tu compra' in shown.lower(), shown[:80])
    print('2) Seguimiento del cliente')
    def buscar(tel):
        page.goto(f'{BASE}/seguimiento.html'); page.wait_for_selector('#segForm')
        page.fill('#segPedidoId',pid); page.fill('#segTelefono',tel); page.click('#segBtnBuscar'); page.wait_for_timeout(1500)
        return page.evaluate("document.body.innerText")
    t=buscar('3009999999'); check('Teléfono equivocado: no revela el pedido y explica el error', 'Camila' not in t and ('no coincide' in t.lower() or 'no encontr' in t.lower() or 'verifica' in t.lower()), t[300:420])
    t=buscar('3001234567'); page.screenshot(path=f'{OUT}/seguimiento_resultado.png',full_page=True)
    check('Datos correctos: muestra el pedido y su estado', ('pendiente' in t.lower() or 'recibido' in t.lower()) and '467.700' in t.replace(',','.'), t[300:520])
    print('3) Panel: gestión del pedido')
    page.goto(f'{BASE}/admin.html'); page.evaluate("a=>window.__FBSTUB.seed({},a)",au); page.goto(f'{BASE}/admin.html'); page.wait_for_selector('#formAdminLogin')
    page.fill('#adminUsuario','admin@maquina.com'); page.fill('#adminClave','Admin1234'); page.click('.gl-submit'); page.wait_for_selector('#adminDashView',state='visible'); page.wait_for_timeout(1000)
    page.click('#tabBtnPedidos'); page.wait_for_timeout(1200); page.screenshot(path=f'{OUT}/admin_pedidos_escritorio.png',full_page=True)
    check('El pedido aparece en el panel con el nombre del cliente','Camila' in page.inner_text('#tablaPedidosBody'))
    sel=page.locator(f'.select-estado-pedido[data-id="{pid}"]'); check('Hay selector de estado para el pedido',sel.count()==1)
    estado=lambda: page.evaluate('window.__FBSTUB.dump()')['docs'][f'pedidos/{pid}']['estado']
    opts=page.evaluate(f"[...document.querySelector('.select-estado-pedido[data-id=\"{pid}\"]').options].map(o=>o.value)"); print('   estados:',opts)
    sel.select_option('enviado'); page.wait_for_timeout(1200); check('Cambiar a "enviado" guarda en Firestore',estado()=='enviado',estado())
    page.locator(f'.select-estado-pedido[data-id="{pid}"]').select_option('cancelado'); page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/admin_confirmar_cancelar.png')
    check('Cancelar pide confirmación con diálogo de marca (alertdialog)',page.locator('.mq-confirm').is_visible())
    check('El foco empieza en "Cancelar" (acción peligrosa)',page.evaluate("document.activeElement.className")=='mq-confirm-no')
    page.keyboard.press('Tab'); check('Tab se queda dentro del diálogo',page.evaluate("document.activeElement.closest('.mq-confirm')!==null"))
    page.keyboard.press('Escape'); page.wait_for_timeout(500)
    check('Escape cierra el diálogo sin cancelar el pedido',not page.locator('.mq-confirm').count() and estado()=='enviado',estado())
    check('El selector vuelve a "enviado"',page.input_value(f'.select-estado-pedido[data-id="{pid}"]')=='enviado')
    page.locator(f'.select-estado-pedido[data-id="{pid}"]').select_option('cancelado'); page.wait_for_timeout(400)
    page.click('.mq-confirm-si'); page.wait_for_timeout(1500)
    check('Confirmar guarda el pedido como cancelado',estado()=='cancelado',estado())
    print('4) Cliente ve el cambio')
    t=buscar('3001234567'); check('Seguimiento muestra "cancelado"','cancelad' in t.lower(),t[300:460])
    check('Sin errores de JS en todo el ciclo',not probe.page_errors,str(probe.page_errors))
    b.close()
bad=[r for r in results if not r[1]]; print(f'\nRESUMEN pedidos: {len(results)-len(bad)}/{len(results)} OK')
