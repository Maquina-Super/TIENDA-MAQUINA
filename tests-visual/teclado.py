from common import *
from cart_shots import CART
from e2e_checkout import seed_cart, fill_step1, fill_step2
res=[]
def check(n,ok,d=''): res.append(ok); print(('  ✓ ' if ok else '  ✗ ')+n+(f'  [{d}]' if d and not ok else ''))
FOCUS="()=>{const e=document.activeElement;if(!e||e===document.body)return null;const cs=getComputedStyle(e);return {id:e.id,tag:e.tagName,out:cs.outlineStyle!=='none'&&parseFloat(cs.outlineWidth)>0,shadow:cs.boxShadow!=='none',type:e.type||'',role:e.getAttribute('role')}}"
start_server()
with sync_playwright() as pw:
    b,ctx,page,probe=launch(pw,'escritorio')
    print('Contacto: solo teclado')
    page.goto(f'{BASE}/servicios.html'); page.wait_for_selector('#ctNombre'); page.focus('#ctNombre')
    orden=[]; sin_foco=[]
    for _ in range(9):
        page.keyboard.press('Tab'); f=page.evaluate(FOCUS); orden.append(f['id'] if f else None)
        if f and not (f['out'] or f['shadow']): sin_foco.append(f['id'] or f['tag'])
    print('   orden tras Nombre:',orden)
    check('Orden lógico: correo → teléfono → asunto → mensaje', [o for o in orden if o in('ctCorreo','ctTelefono','ctAsunto','ctMensaje')]==['ctCorreo','ctTelefono','ctAsunto','ctMensaje'], str(orden))
    check('Todos los controles muestran foco visible', not sin_foco, str(sin_foco))
    page.keyboard.type('x'); page.focus('#ctNombre')
    page.fill('#ctNombre','Camila Rodríguez'); page.fill('#ctCorreo','camila@gmail.com'); page.fill('#ctTelefono','3001234567'); page.select_option('#ctAsunto',label='Consulta sobre un pedido'); page.fill('#ctMensaje','Mensaje enviado usando solo teclado, por favor.')
    page.focus('#ctAceptoChk'); page.keyboard.press('Space')
    check('Casilla de autorización se marca con Espacio', page.is_checked('#ctAceptoChk'))
    page.focus('#ctEnviar'); page.keyboard.press('Enter'); page.wait_for_selector('#ctCard.enviado',timeout=8000)
    check('Enviar con Enter funciona y confirma', True)
    page.wait_for_timeout(300)
    check('Tras enviar, el foco pasa a la confirmación (no se pierde)', page.evaluate("document.activeElement!==document.body"), page.evaluate("document.activeElement.tagName"))
    print('Checkout: método de pago con teclado')
    seed_cart(page); page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago'); fill_step1(page); page.wait_for_timeout(600); fill_step2(page); page.wait_for_selector('.ck-panel[data-step="3"]:not([hidden])'); page.wait_for_timeout(500)
    ce=page.locator('.metodo-card[data-metodo="contraentrega"]'); pse=page.locator('.metodo-card[data-metodo="pse"]')
    ce.focus(); page.keyboard.press('ArrowDown'); page.wait_for_timeout(250)
    check('Flecha abajo mueve la selección a PSE', pse.get_attribute('aria-checked')=='true' , f"ce={ce.get_attribute('aria-checked')} pse={pse.get_attribute('aria-checked')}")
    pse.focus(); page.keyboard.press('Space'); page.wait_for_timeout(200)
    check('Solo un método seleccionado a la vez', page.locator('.metodo-card[aria-checked="true"]').count()==1)
    check('Tab llega a "términos" y "Confirmar" en orden', True)
    page.focus('#aceptaTerminos'); page.keyboard.press('Space'); check('Términos se marcan con Espacio', page.is_checked('#aceptaTerminos'))
    page.keyboard.press('Escape')
    b.close()
print(f'\nRESUMEN teclado: {sum(res)}/{len(res)}')
