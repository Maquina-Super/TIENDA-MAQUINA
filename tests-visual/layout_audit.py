import json, sys
from common import *
from cart_shots import CART
from e2e_checkout import fill_step1, fill_step2
from smoke import OVERFLOW_JS
SIZES=[('320',dict(width=320,height=640)),('375',dict(width=375,height=812)),('768',dict(width=768,height=1024)),('1024',dict(width=1024,height=768)),('1366',dict(width=1366,height=900))]
TAP_JS="""()=>{const out=[];const min=%d;
 document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=radio],summary').forEach(el=>{
  const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden')return; const r=el.getBoundingClientRect(); if(!r.width||!r.height)return;
  if(el.closest('[hidden],[aria-hidden=true]'))return; if(el.type==='checkbox'||el.type==='radio'){const l=el.closest('label'); if(l){const lr=l.getBoundingClientRect(); if(lr.height>=min)return;}}
  if(el.tagName==='A' && el.closest('p,li,.legal-link-mini,.footer-col')) return; // enlaces en texto corrido
  if(r.height<min||r.width<min){ if(el.tagName==='A'&&r.height>=min-8&&r.width>=min)return; out.push((el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+String(el.className).split(' ')[0])+' '+Math.round(r.width)+'x'+Math.round(r.height)+' "'+(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,22)+'"');}
 }); return out.slice(0,12);}"""
COVER_JS="""(sel)=>{const el=document.querySelector(sel); if(!el)return 'no-existe'; el.scrollIntoView({block:'center',behavior:'instant'}); const r=el.getBoundingClientRect();
 const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); return (t===el||el.contains(t))?'ok':('TAPADO por '+(t&&(t.id||t.className||t.tagName)));}"""
def audit(page,label,vpname,tap=True):
    ov=page.evaluate(OVERFLOW_JS); res=[]
    if ov['scrollW']>ov['vw']+1: res.append(f"OVERFLOW-X {ov['scrollW']}>{ov['vw']} {ov['offenders'][:3]}")
    elif ov['offenders']: res.append(f"fuera-de-pantalla {ov['offenders'][:3]}")
    if tap and vpname in('320','375','768'):
        t=page.evaluate(TAP_JS%40)
        if t: res.append('TAP<40px: '+'; '.join(t[:6]))
    return res
start_server(); report={}
admin_user={'admin@maquina.com':{'uid':'uid_admin01','email':'admin@maquina.com','pass':'Admin1234'}}
with sync_playwright() as pw:
  for name,vp in SIZES:
    b=pw.chromium.launch(); ctx=b.new_context(viewport=vp,locale='es-CO'); page=ctx.new_page(); probe=Probe(); attach(ctx,page,probe)
    def rec(label,res):
        report[f'{label}@{name}']=res; print(('✗ ' if res else '✓ ')+f'{label}@{name}',' | '.join(res)[:330])
    import os
    ONLY=os.environ.get('ONLY_ADMIN')
    if not ONLY:
      page.goto(f'{BASE}/servicios.html'); page.wait_for_timeout(900); rec('Contacto',audit(page,'c',name))
    if not ONLY:
      cov=page.evaluate(COVER_JS,'#ctEnviar'); 
      if cov!='ok': rec('Contacto botón enviar',[cov])
      page.goto(f'{BASE}/index.html'); page.evaluate("c=>localStorage.setItem('maquina_carrito',JSON.stringify(c))",CART)
      page.goto(f'{BASE}/carrito.html'); page.wait_for_selector('#form-pago'); page.wait_for_timeout(700); rec('Carrito paso1',audit(page,'p1',name))
      cov=page.evaluate(COVER_JS,'#ckSiguiente'); 
      if cov!='ok': rec('Checkout botón continuar p1',[cov])
      fill_step1(page); page.wait_for_timeout(700); rec('Checkout paso2',audit(page,'p2',name)); fill_step2(page)
      page.wait_for_selector('.ck-panel[data-step="3"]:not([hidden])'); page.wait_for_timeout(700); rec('Checkout paso3',audit(page,'p3',name))
      cov=page.evaluate(COVER_JS,'#ckSiguiente'); 
      if cov!='ok': rec('Checkout botón confirmar p3',[cov])
    page.goto(f'{BASE}/admin.html'); page.wait_for_selector('#formAdminLogin'); rec('Admin login',audit(page,'a',name))
    page.evaluate("a=>window.__FBSTUB.seed({},a)",admin_user); page.goto(f'{BASE}/admin.html'); page.wait_for_selector('#formAdminLogin')
    page.fill('#adminUsuario','admin@maquina.com'); page.fill('#adminClave','Admin1234'); page.click('.gl-submit'); page.wait_for_selector('#adminDashView',state='visible'); page.wait_for_timeout(900)
    for t in ['Resumen','Inventario','Pedidos','Mensajes','Drop','Usuarios']:
        if page.locator(f'#tabBtn{t}').count():
            if page.locator('#apBurger').is_visible() and page.get_attribute('#apBurger','aria-expanded')=='false': page.click('#apBurger'); page.wait_for_timeout(450)
            try: page.locator(f'#tabBtn{t}').click(timeout=3000)
            except Exception as e2: rec(f'Admin {t}',['NO SE PUEDE ABRIR la pestaña: '+str(e2)[:90]]); continue
            page.wait_for_timeout(600); rec(f'Admin {t}',audit(page,t,name))
    if probe.page_errors: print('   PAGEERR',probe.page_errors[:2])
    b.close()
json.dump(report,open(__import__('os').environ.get('LAYOUT_OUT','capturas/_layout.json'),'w'),indent=1,ensure_ascii=False)
