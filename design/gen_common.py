FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&amp;display=swap" rel="stylesheet">'

BASE_CSS = """
body{margin:0;background:#090D16;color:#F5F7FA;font-family:'Archivo',system-ui,sans-serif;font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
a{color:#5B95FF;text-decoration:underline;text-underline-offset:3px}a:hover{color:#8DB5FF}
h1,h2,h3{font-stretch:118%;font-weight:700;letter-spacing:-0.01em;line-height:1.1;margin:0}
.num{font-variant-numeric:tabular-nums}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:44px;padding:0 20px;border-radius:6px;font:inherit;font-weight:600;font-size:15px;text-decoration:none;cursor:pointer;border:1px solid transparent;white-space:nowrap}
.btn-primary{background:#176BFF;color:#FFFFFF}.btn-primary:hover{background:#0F5BE0;color:#FFFFFF}
.btn-ghost{background:transparent;color:#F5F7FA;border-color:#2E3D5A}.btn-ghost:hover{border-color:#5B95FF;color:#F5F7FA}
.btn:focus-visible,.chip:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #5B95FF;outline-offset:2px}
.chip{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border-radius:6px;border:1px solid #2E3D5A;background:transparent;color:#F5F7FA;font:inherit;font-size:15px;cursor:pointer}
.chip[aria-pressed="true"]{background:#176BFF;border-color:#176BFF;color:#FFFFFF}
.badge{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.photo{background:#111A2B;border:1px dashed #2E3D5A;display:flex;align-items:center;justify-content:center;color:#AAB4C5;font-size:13px;border-radius:8px}
label.f{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;color:#AAB4C5}
.field{min-height:44px;border-radius:6px;border:1px solid #2E3D5A;background:#0E1524;color:#F5F7FA;font:inherit;font-size:15px;padding:0 12px}
"""

def head(title, extra_css=''):
    return f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
{FONT}
<style>{BASE_CSS}{extra_css}</style>
</helmet>
'''

def tail(props, logic='renderVals() { return {}; }'):
    return f'''
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{props}'>
class Component extends DCLogic {{
{logic}
}}
</script>
</body>
</html>
'''

ICON = {
 'chat': '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5 5.3 15A8 8 0 1 1 9 18.7z"></path><path d="M9 10h6M9 13h4"></path></svg>',
 'search': '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>',
 'filter': '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"></path></svg>',
 'x': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>',
 'wrench': '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0 5 5L17 14l-7 7-3-3 7-7z"></path><path d="M14.7 6.3 17.5 3.5a4 4 0 0 0-2.8 2.8z"></path></svg>',
 'cpu': '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="6" y="6" width="12" height="12" rx="1.5"></rect><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"></path></svg>',
 'pin': '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"></path><circle cx="12" cy="9" r="2.5"></circle></svg>',
}

STATUS = {
 'ok': ('#3DD68C', 'Disponible'),
 'low': ('#F5B83D', 'Stock faible'),
 'out': ('#FF7A7A', 'Rupture de stock'),
 'off': ('#AAB4C5', 'Indisponible'),
}

def badge(kind):
    c, label = STATUS[kind]
    return f'<span class="badge" style="color: {c}"><span class="dot" style="background: {c}"></span>{label}</span>'

def spec(value, unit, label):
    return f'''<div style="padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; min-width: 0">
<div class="num" style="font-size: 22px; font-weight: 700; font-stretch: 112%; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{value}<span style="font-size: 13px; font-weight: 600; color: #AAB4C5; margin-left: 4px">{unit}</span></div>
<div style="font-size: 13px; color: #AAB4C5">{label}</div>
</div>'''

def card(p, href='Produit.dc.html'):
    price = (f'<div class="num" style="font-size: 22px; font-weight: 700; font-stretch: 112%">{p["price"]} <span style="font-size: 14px; color: #AAB4C5">FCFA</span></div>'
             if p.get('price') else '<div style="font-size: 17px; font-weight: 600">Prix sur demande</div>')
    return f'''<article style="background: #172338; border: 1px solid #26344F; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; min-width: 0">
<div class="photo" style="aspect-ratio: 4 / 3; border-radius: 0; border: 0; border-bottom: 1px solid #26344F">Photo produit</div>
<div style="padding: 16px 16px 4px; display: flex; flex-direction: column; gap: 4px">
<div style="display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: #AAB4C5"><span>{p["brand"]}</span><span>{p["cond"]}</span></div>
<h3 style="font-size: 18px; font-stretch: 105%; font-weight: 650; line-height: 1.25"><a href="{href}" style="color: #F5F7FA; text-decoration: none">{p["name"]}</a></h3>
</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 12px 16px; border: 1px solid #26344F; border-radius: 6px">
<div style="border-right: 1px solid #26344F; border-bottom: 1px solid #26344F">{spec(p["ram"], "Go", "Mémoire vive")}</div>
<div style="border-bottom: 1px solid #26344F">{spec(p["sto"], p["stou"], "Stockage")}</div>
<div style="border-right: 1px solid #26344F; grid-column: span 2">{spec(p["cpu"], "", "Processeur")}</div>
</div>
<div style="padding: 4px 16px 16px; margin-top: auto; display: flex; flex-direction: column; gap: 12px">
<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap">{price}{badge(p["status"])}</div>
<a class="btn btn-ghost" href="#whatsapp" style="width: 100%">{ICON["chat"]}Demander sur WhatsApp</a>
</div>
</article>'''

PRODUCTS = [
 dict(brand='HP', cond='Occasion', name='HP EliteBook 840 G6', ram='16', sto='512', stou='Go SSD', cpu='Core i5-8365U', price='245 000', status='ok'),
 dict(brand='Lenovo', cond='Neuf', name='Lenovo IdeaPad Slim 3 15', ram='8', sto='512', stou='Go SSD', cpu='Ryzen 5 7520U', price='325 000', status='low'),
 dict(brand='Dell', cond='Occasion', name='Dell Latitude 5420', ram='16', sto='256', stou='Go SSD', cpu='Core i7-1185G7', price=None, status='ok'),
 dict(brand='ASUS', cond='Neuf', name='ASUS TUF Gaming A15', ram='16', sto='1', stou='To SSD', cpu='Ryzen 7 7735HS + RTX 4060', price='785 000', status='out'),
]

def header(active=''):
    links = [('Catalogue', 'Catalogue.dc.html'), ('Services', '#services'), ('À propos', '#a-propos'), ('Contact', '#contact')]
    nav = ''.join(f'<a href="{h}" style="color: {"#F5F7FA" if n == active else "#AAB4C5"}; text-decoration: none; font-weight: {600 if n == active else 500}; font-size: 15px; padding: 10px 2px{"; box-shadow: inset 0 -2px 0 #176BFF" if n == active else ""}">{n}</a>' for n, h in links)
    return f'''<header style="border-bottom: 1px solid #1C2840">
<div style="max-width: 1280px; margin: 0 auto; padding: 14px 32px; display: flex; align-items: center; gap: 32px; flex-wrap: wrap">
<a href="Accueil.dc.html" style="color: #F5F7FA; text-decoration: none; display: flex; align-items: baseline; gap: 6px"><span style="font-stretch: 125%; font-weight: 800; font-size: 20px; letter-spacing: -0.01em">KIRA TECH</span><span style="font-size: 13px; color: #AAB4C5">et Solution</span></a>
<nav aria-label="Navigation principale" style="display: flex; gap: 24px; flex-wrap: wrap; flex: 1 1 auto">{nav}</nav>
<a class="btn btn-primary" href="#whatsapp">{ICON["chat"]}Écrire sur WhatsApp</a>
</div>
</header>'''

FOOTER = '''<footer style="border-top: 1px solid #1C2840; margin-top: 96px">
<div style="max-width: 1280px; margin: 0 auto; padding: 48px 32px; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 32px; font-size: 15px; color: #AAB4C5">
<div style="display: flex; flex-direction: column; gap: 8px"><span style="font-stretch: 125%; font-weight: 800; color: #F5F7FA">KIRA TECH et Solution</span><span>Vente de matériel informatique, maintenance et réparation.</span></div>
<div style="display: flex; flex-direction: column; gap: 8px"><span style="color: #F5F7FA; font-weight: 600">Boutique de Cotonou</span><span>[Adresse à fournir]</span><span>[Horaires à fournir]</span></div>
<div style="display: flex; flex-direction: column; gap: 8px"><span style="color: #F5F7FA; font-weight: 600">Boutique de Calavi</span><span>[Adresse à fournir]</span><span>[Horaires à fournir]</span></div>
<div style="display: flex; flex-direction: column; gap: 8px"><a href="#cgu">Conditions générales</a><a href="#confidentialite">Politique de confidentialité</a><a href="#mentions">Mentions légales</a></div>
</div>
</footer>'''
