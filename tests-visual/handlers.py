from common import *
from cart_shots import CART
from e2e_checkout import fill_step1, fill_step2
JS="""()=>{const bad=new Set(), seen=new Set();
 document.querySelectorAll('*').forEach(el=>{for(const a of el.attributes){ if(!/^on(click|change|submit|input|keydown|keyup|focus|blur)$/.test(a.name))continue;
   const m=a.value.match(/^\\s*(?:return\\s+)?(?:if\\s*\\([^)]*\\)\\s*)?([A-Za-z_$][\\w$.]*)\\s*\\(/); if(!m)continue; const path=m[1]; if(['event','this','confirm','alert','window.open','history.back','document.getElementById'].includes(path))continue;
   seen.add(path); let o=window; for(const k of path.split('.')){ o=o&&o[k]; } if(typeof o!=='function') bad.add(path+'  ← '+(el.id?'#'+el.id:el.tagName.toLowerCase())+' "'+(el.textContent||'').trim().slice(0,25)+'"'); }});
 return {n:seen.size,bad:[...bad]}}"""
start_server(); au={'admin@maquina.com':{'uid':'uid_admin01','email':'admin@maquina.com','pass':'Admin1234'}}
tot=0
with sync_playwright() as pw:
    b,ctx,page,probe=launch(pw,'escritorio')
    def rep(l):
        global tot; r=page.evaluate(JS); tot+=r['n']; print(('✗ ' if r['bad'] else '✓ ')+f"{l}: {r['n']} funciones referenciadas", *r['bad'])
    for pg in ['index.html','catalogo.html','productos.html','categorias.html','favoritos.html','producto.html?id=1','servicios.html','seguimiento.html','legal.html']:
        page.goto(f'{BASE}/{pg}'); page.wait_for_timeout(900); rep(pg)
    page.goto(f'{BASE}/servicios.html'); page.wait_for_timeout(500)
    for k in ['cambios','tallas','envios','whatsapp']:
        try: page.evaluate(f"document.querySelector('.btn-opciones').click()"); break
        except: pass
    page.wait_for_timeout(400); rep('servicios (modal abierto)')
    page.goto(f'{BASE}/index.html'); page.evaluate("c=>localStorage.setItem('maquina_carrito',JSON.stringify(c))",CART)
    page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago'); rep('carrito paso 1'); fill_step1(page); page.wait_for_timeout(500); fill_step2(page); page.wait_for_selector('.ck-panel[data-step="3"]:not([hidden])'); rep('checkout paso 3')
    page.goto(f'{BASE}/admin.html'); page.evaluate("a=>window.__FBSTUB.seed({},a)",au); page.goto(f'{BASE}/admin.html'); page.wait_for_selector('#formAdminLogin'); rep('admin login')
    page.fill('#adminUsuario','admin@maquina.com'); page.fill('#adminClave','Admin1234'); page.click('.gl-submit'); page.wait_for_selector('#adminDashView',state='visible'); page.wait_for_timeout(800)
    for t in ['Resumen','Inventario','Pedidos','Mensajes','Drop','Usuarios']:
        page.click(f'#tabBtn{t}'); page.wait_for_timeout(600); rep('admin '+t)
    print('JS errors:',probe.page_errors[:3]); print('total funciones comprobadas',tot)
    b.close()
