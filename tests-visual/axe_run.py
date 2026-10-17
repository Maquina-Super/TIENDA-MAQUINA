import json, sys
from common import *
from cart_shots import CART
from e2e_checkout import fill_step1, fill_step2
AXE=open(f'{HARNESS}/node_modules/axe-core/axe.min.js').read()
def axe(page, label, sel=None):
    page.evaluate(AXE)
    r = page.evaluate("""async (sel)=>{const ctx = sel? {include:[[sel]]} : document;
        const r = await axe.run(ctx,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});
        return r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,n:v.nodes.length,ex:v.nodes.slice(0,3).map(n=>n.target.join(' ')+' :: '+(n.any[0]&&n.any[0].message||n.failureSummary||'').slice(0,110))}))}""", sel)
    print(f'--- {label}: {len(r)} tipos de problema')
    for v in r: print(f"  [{v['impact']}] {v['id']} x{v['n']} — {v['help']}"); [print('      ',e) for e in v['ex'][:2]]
    return r
start_server()
admin_user={'admin@maquina.com':{'uid':'uid_admin01','email':'admin@maquina.com','pass':'Admin1234'}}
with sync_playwright() as pw:
    b,ctx,page,probe=launch(pw,'escritorio')
    page.goto(f'{BASE}/servicios.html'); page.wait_for_timeout(1200); axe(page,'CONTACTO servicios.html')
    page.goto(f'{BASE}/index.html'); page.evaluate("c=>localStorage.setItem('maquina_carrito',JSON.stringify(c))",CART)
    page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago'); page.wait_for_timeout(800); axe(page,'CARRITO paso 1')
    fill_step1(page); page.wait_for_timeout(600); fill_step2(page); page.wait_for_selector('.ck-panel[data-step="3"]:not([hidden])'); page.wait_for_timeout(700)
    axe(page,'CHECKOUT paso 3')
    page.goto(f'{BASE}/admin.html'); page.wait_for_selector('#formAdminLogin'); page.wait_for_timeout(500)
    axe(page,'ADMIN login')
    page.evaluate("a=>window.__FBSTUB.seed({},a)",admin_user); page.goto(f'{BASE}/admin.html'); page.wait_for_selector('#formAdminLogin')
    page.fill('#adminUsuario','admin@maquina.com'); page.fill('#adminClave','Admin1234'); page.click('.gl-submit'); page.wait_for_selector('#adminDashView',state='visible'); page.wait_for_timeout(1000)
    for t in ['Resumen','Inventario','Pedidos','Mensajes','Drop','Usuarios']:
        loc=page.locator(f'#tabBtn{t}')
        if loc.count(): loc.click(); page.wait_for_timeout(700); axe(page,f'ADMIN {t}','#adminDashView')
    b.close()
