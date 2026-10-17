import os, re, glob, sys
from bs4 import BeautifulSoup
from urllib.parse import urlparse, unquote
ROOT=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
SKIP={'carrito.original.html','login - copia.html'}
pages=[f for f in sorted(os.listdir(ROOT)) if f.endswith('.html') and f not in SKIP]
ids={}
for f in pages:
    s=open(f'{ROOT}/{f}',encoding='utf-8',errors='replace').read(); sp=BeautifulSoup(s,'lxml')
    ids[f]={e.get('id') for e in sp.find_all(id=True)}|{e.get('name') for e in sp.find_all('a',attrs={'name':True})}
    # ids creados por JS en plantillas
    ids[f]|=set(re.findall(r'id=\\?["\']([\w-]+)',s))
broken=[]; externos={}
def chk(src,ref,kind):
    ref=ref.strip()
    if not ref or ref.startswith(('javascript:','data:','blob:','#!')): return
    if ref.startswith('#'):
        a=ref[1:]
        if a and a not in ids.get(src,()): broken.append((src,kind,ref,'ancla inexistente en la misma página'))
        return
    if ref.startswith(('mailto:','tel:')): return
    if ref.startswith('https://wa.me/'):
        if not re.match(r'https://wa\.me/57\d{10}',ref): broken.append((src,kind,ref,'WhatsApp con formato raro'))
        return
    if ref.startswith(('http://','https://','//')):
        externos.setdefault(urlparse(ref).netloc,set()).add(src); return
    if '${' in ref or '{{' in ref: return
    u=urlparse(ref); path=unquote(u.path)
    full=os.path.normpath(os.path.join(ROOT,path))
    if not os.path.exists(full): broken.append((src,kind,ref,'archivo no existe')); return
    if u.fragment and path.endswith('.html'):
        t=os.path.basename(path)
        if t in ids and u.fragment not in ids[t]: broken.append((src,kind,ref,f'ancla #{u.fragment} no existe en {t}'))
for f in pages:
    sp=BeautifulSoup(open(f'{ROOT}/{f}',encoding='utf-8',errors='replace').read(),'lxml')
    for t,a in (('a','href'),('link','href'),('script','src'),('img','src'),('source','src'),('iframe','src'),('form','action')):
        for e in sp.find_all(t):
            if e.get(a): chk(f,e[a],f'<{t}>')
# referencias dentro de JS y CSS
for f in glob.glob(f'{ROOT}/js/*.js')+[f'{ROOT}/{p}' for p in pages]:
    s=open(f,encoding='utf-8',errors='replace').read(); name=os.path.relpath(f,ROOT)
    for m in set(re.findall(r'''["'`]((?:\.{0,2}/)?[\w\-./]*\.html(?:\?[^"'`#]*)?(?:#[\w-]+)?)["'`]''',s)):
        if m.startswith('http'): continue
        src=name if name.endswith('.html') else None
        u=urlparse(m); full=os.path.normpath(os.path.join(ROOT,u.path))
        if not os.path.exists(full): broken.append((name,'js',m,'archivo no existe'))
        elif u.fragment and os.path.basename(u.path) in ids and u.fragment not in ids[os.path.basename(u.path)]: broken.append((name,'js',m,'ancla inexistente'))
    for m in set(re.findall(r'''["'`]((?:\.{0,2}/)?(?:img|css|js|fonts)/[\w\-./ %]+\.\w{2,5})["'`]''',s)):
        if not os.path.exists(os.path.normpath(os.path.join(ROOT,m))): broken.append((name,'js-recurso',m,'archivo no existe'))
for f in glob.glob(f'{ROOT}/css/*.css'):
    s=open(f,encoding='utf-8',errors='replace').read()
    for m in set(re.findall(r'url\(\s*[\'"]?(?!data:|http|#)([^)\'"]+)',s)):
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f),m.split('?')[0]))): broken.append((os.path.relpath(f,ROOT),'css-url',m,'archivo no existe'))
print('ENLACES ROTOS:',len(broken))
for b in sorted(set(broken)): print('  ✗',b)
print('\nDominios externos usados:'); [print('  ',d,sorted(v)[:3]) for d,v in sorted(externos.items())]
