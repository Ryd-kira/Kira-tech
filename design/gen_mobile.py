from gen_common import *
MENU = '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>'
def mheader():
    return f'''<header style="display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #1C2840">
<a href="Accueil.dc.html" style="color: #F5F7FA; text-decoration: none; flex: 1; display: flex; align-items: baseline; gap: 5px"><span style="font-stretch: 125%; font-weight: 800; font-size: 18px">KIRA TECH</span><span style="font-size: 12px; color: #AAB4C5">et Solution</span></a>
<a class="btn btn-primary" href="#whatsapp" aria-label="Écrire sur WhatsApp" style="padding: 0; width: 44px">{ICON["chat"]}</a>
<button type="button" class="btn btn-ghost" aria-label="Ouvrir le menu" style="padding: 0; width: 44px">{MENU}</button>
</header>'''

cat = head('Catalogue, téléphone') + f'''<div style="width: 390px; min-height: 1500px">{mheader()}
<main style="padding: 20px 16px; display: flex; flex-direction: column; gap: 16px">
<h1 style="font-size: 31px">Catalogue</h1>
<label class="f">Rechercher un nom ou un modèle<input class="field" type="search" placeholder="Ex. ThinkPad"></label>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">
<button type="button" class="btn btn-ghost">{ICON["filter"]}Filtres <span class="num" style="background: #176BFF; color: #FFFFFF; border-radius: 4px; padding: 0 6px; font-size: 13px">2</span></button>
<label style="position: relative; display: flex"><span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Trier par</span><select class="field" style="width: 100%"><option>Nouveautés</option><option>Prix croissant</option><option>Prix décroissant</option></select></label>
</div>
<div style="display: flex; gap: 8px; flex-wrap: wrap"><button type="button" class="chip" style="min-height: 34px; font-size: 14px; gap: 8px; background: #172338" aria-label="Retirer le filtre 16 Go">16 Go{ICON["x"]}</button><button type="button" class="chip" style="min-height: 34px; font-size: 14px; gap: 8px; background: #172338" aria-label="Retirer le filtre Programmation">Programmation{ICON["x"]}</button></div>
<div style="font-size: 14px; color: #AAB4C5"><span class="num">6</span> ordinateurs</div>
{card(PRODUCTS[0])}
{card(PRODUCTS[2])}
</main></div>''' + tail('{"$preview":{"width":390,"height":1500}}')
open('project/Mobile-Catalogue.dc.html','w').write(cat)

prod = head('Fiche produit, téléphone') + f'''<div style="width: 390px; height: 1600px; position: relative; overflow: hidden">{mheader()}
<main style="padding: 16px 16px 120px; display: flex; flex-direction: column; gap: 18px">
<div class="photo" style="aspect-ratio: 4 / 3">Photo produit</div>
<div style="display: flex; justify-content: center; gap: 8px" aria-hidden="true"><span class="dot" style="background: #F5F7FA"></span><span class="dot" style="background: #2E3D5A"></span><span class="dot" style="background: #2E3D5A"></span><span class="dot" style="background: #2E3D5A"></span></div>
<div style="display: flex; flex-direction: column; gap: 6px"><div style="font-size: 13px; color: #AAB4C5">Lenovo, neuf</div><h1 style="font-size: 28px">Lenovo IdeaPad Slim 3 15</h1><div class="num" style="font-size: 13px; color: #AAB4C5">Référence LEN-IPS3-15-R5</div></div>
<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap"><div class="num" style="font-size: 31px; font-weight: 700; font-stretch: 112%">325 000 <span style="font-size: 15px; color: #AAB4C5">FCFA</span></div>{badge("low")}</div>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid #26344F; border-radius: 8px">
<div style="border-right: 1px solid #26344F">{spec("8", "Go", "RAM")}</div><div style="border-right: 1px solid #26344F">{spec("512", "Go", "SSD")}</div><div>{spec("15,6", "po", "Écran")}</div></div>
<h2 style="font-size: 22px; margin-top: 8px">Fiche technique</h2>
<dl style="margin: 0; display: flex; flex-direction: column; font-size: 15px">
<div style="display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #1C2840"><dt style="color: #AAB4C5">Processeur</dt><dd style="margin: 0; text-align: right">AMD Ryzen 5 7520U</dd></div>
<div style="display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #1C2840"><dt style="color: #AAB4C5">Carte graphique</dt><dd style="margin: 0; text-align: right">Radeon 610M</dd></div>
<div style="display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #1C2840"><dt style="color: #AAB4C5">Résolution</dt><dd class="num" style="margin: 0; text-align: right">1920 × 1080</dd></div>
<div style="display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #1C2840"><dt style="color: #AAB4C5">Système</dt><dd style="margin: 0; text-align: right">Windows 11 Famille</dd></div>
<div style="display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #1C2840"><dt style="color: #AAB4C5">Usages</dt><dd style="margin: 0; text-align: right">Bureautique, études, programmation</dd></div>
<div style="display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #1C2840"><dt style="color: #AAB4C5">Garantie</dt><dd style="margin: 0; text-align: right">12 mois</dd></div>
</dl>
<p style="margin: 0; color: #AAB4C5">[Description du produit rédigée par la boutique]</p>
</main>
<div style="position: absolute; left: 0; right: 0; bottom: 0; padding: 12px 16px 20px; background: #090D16; border-top: 1px solid #26344F; display: flex; gap: 12px; align-items: center">
<div class="num" style="font-weight: 700; font-stretch: 112%; font-size: 18px; white-space: nowrap">325 000 <span style="font-size: 12px; color: #AAB4C5">FCFA</span></div>
<a class="btn btn-primary" href="#whatsapp" style="flex: 1">{ICON["chat"]}Demander sur WhatsApp</a>
</div>
</div>''' + tail('{"$preview":{"width":390,"height":1600}}')
open('project/Mobile-Produit.dc.html','w').write(prod)
