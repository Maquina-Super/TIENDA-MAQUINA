import sys, json, os
from common import *

PAGES = ['index.html','productos.html','categorias.html','catalogo.html','favoritos.html','producto.html?id=1','quienes-somos.html',
         'servicios.html','carrito.html','seguimiento.html','legal.html','login.html','registro.html','admin.html']
OUT = os.environ.get('SHOTS', 'capturas')
os.makedirs(OUT, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

OVERFLOW_JS = """() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  document.querySelectorAll('body *').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display==='none' || cs.visibility==='hidden' || cs.position==='fixed') return;
    const r = el.getBoundingClientRect();
    if (r.width===0 || r.height===0) return;
    if (r.right > vw + 1 || r.left < -1) {
      // ignora si algún ancestro hace scroll horizontal propio
      let p = el.parentElement, scrolls=false;
      while (p && p!==document.body) { const o=getComputedStyle(p).overflowX; if (o==='auto'||o==='scroll'||o==='hidden'||o==='clip') {scrolls=true;break;} p=p.parentElement; }
      if (!scrolls) out.push((el.id?'#'+el.id:'')+'.'+(el.className&&el.className.baseVal===undefined?String(el.className).split(' ').slice(0,2).join('.'):'')+' <'+el.tagName.toLowerCase()+'> r='+Math.round(r.right)+' l='+Math.round(r.left));
    }
  });
  return { vw, scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, offenders: out.slice(0,8) };
}"""

def run(pages=PAGES, vps=('movil','tablet','escritorio'), shots=True):
    start_server()
    res = {}
    with sync_playwright() as pw:
        for vp in vps:
            for pg in pages:
                b, ctx, page, probe = launch(pw, vp)
                try:
                    page.goto(f'{BASE}/{pg}', wait_until='load', timeout=20000)
                    page.wait_for_timeout(1200)
                    ov = page.evaluate(OVERFLOW_JS)
                    if shots:
                        name = pg.split('?')[0].replace('.html','')
                        page.screenshot(path=f'{OUT}/{name}_{vp}.png', full_page=True)
                    res[f'{pg}@{vp}'] = dict(overflowX=ov['scrollW']>ov['vw']+1, scrollW=ov['scrollW'], vw=ov['vw'], offenders=ov['offenders'],
                        console=probe.console_errors[:5], pageerr=probe.page_errors[:5], http=probe.not_found[:5], blocked=probe.failed[:5])
                except Exception as e:
                    res[f'{pg}@{vp}'] = dict(fatal=str(e)[:200])
                b.close()
    return res

if __name__ == '__main__':
    r = run()
    json.dump(r, open(f'{OUT}/_resumen.json','w'), indent=1, ensure_ascii=False)
    for k, v in r.items():
        flags = []
        if v.get('fatal'): flags.append('FATAL '+v['fatal'])
        if v.get('overflowX'): flags.append(f"OVERFLOW-X {v['scrollW']}>{v['vw']}")
        if v.get('pageerr'): flags.append('PAGEERR '+'; '.join(v['pageerr'])[:160])
        if v.get('console'): flags.append('CONSOLE '+'; '.join(v['console'])[:160])
        if v.get('http'): flags.append('HTTP '+', '.join(f"{s} {u.replace(BASE,'')}" for s,u in v['http'])[:160])
        print(('✗ ' if flags else '✓ ')+k, ' | '.join(flags))
