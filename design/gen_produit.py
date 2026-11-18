from gen_common import *
p = PRODUCTS[1]
rows = [('Processeur','AMD Ryzen 5 7520U'),('Mémoire vive','8 Go LPDDR5'),('Stockage','512 Go SSD NVMe'),('Carte graphique','AMD Radeon 610M (intégrée)'),('Écran','15,6 pouces'),('Résolution','1920 × 1080'),('Système','Windows 11 Famille'),('Performance','Intermédiaire'),('Usages recommandés','Bureautique, études, programmation'),('État','Neuf'),('Garantie','12 mois')]
rowsh = ''.join(f'<tr><th scope="row" style="text-align: left; font-weight: 500; color: #AAB4C5; padding: 14px 16px 14px 0; border-bottom: 1px solid #1C2840; width: 40%">{k}</th><td class="num" style="padding: 14px 0; border-bottom: 1px solid #1C2840">{v}</td></tr>' for k,v in rows)
thumbs = ''.join(f'<button type="button" class="photo" aria-label="Photo {i}" style="aspect-ratio: 1; cursor: pointer; {"border: 2px solid #176BFF" if i==1 else ""}; font: inherit; font-size: 12px">{i}</button>' for i in range(1,5))
sim = ''.join(card(x) for x in [PRODUCTS[0], PRODUCTS[2], PRODUCTS[3]])
html = head('Fiche produit') + header('Catalogue') + f'''<main style="max-width: 1280px; margin: 0 auto; padding: 28px 32px 0">
<nav aria-label="Fil d'Ariane" style="font-size: 14px; color: #AAB4C5; margin-bottom: 28px; display: flex; gap: 8px; flex-wrap: wrap"><a href="Accueil.dc.html">Accueil</a><span aria-hidden="true">/</span><a href="Catalogue.dc.html">Ordinateurs portables</a><span aria-hidden="true">/</span><span aria-current="page" style="color: #F5F7FA">{p["name"]}</span></nav>
<div style="display: flex; flex-wrap: wrap; gap: 56px; align-items: flex-start">
<div style="flex: 1 1 480px; min-width: 0; display: flex; flex-direction: column; gap: 12px">
<div class="photo" style="aspect-ratio: 4 / 3">Photo produit principale</div>
<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px">{thumbs}</div>
</div>
<div style="flex: 1 1 420px; min-width: 0; display: flex; flex-direction: column; gap: 22px">
<div style="display: flex; flex-direction: column; gap: 10px">
<div style="font-size: 14px; color: #AAB4C5">{p["brand"]}, neuf</div>
<h1 style="font-size: clamp(31px, 3.4vw, 43px)">{p["name"]}</h1>
<div class="num" style="font-size: 14px; color: #AAB4C5">Référence LEN-IPS3-15-R5</div>
</div>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid #26344F; border-radius: 8px">
<div style="border-right: 1px solid #26344F">{spec("8", "Go", "Mémoire vive")}</div>
<div style="border-right: 1px solid #26344F">{spec("512", "Go SSD", "Stockage")}</div>
<div>{spec("15,6", "pouces", "Écran")}</div>
</div>
<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap">
<div class="num" style="font-size: 39px; font-weight: 700; font-stretch: 112%; line-height: 1">325 000 <span style="font-size: 18px; color: #AAB4C5">FCFA</span></div>
{badge("low")}
</div>
<div style="display: flex; flex-direction: column; gap: 10px">
<a class="btn btn-primary" href="#whatsapp" style="min-height: 52px; font-size: 16px">{ICON["chat"]}Demander sur WhatsApp</a>
<p style="margin: 0; font-size: 13px; color: #AAB4C5">Message prérempli : « Bonjour, je suis intéressé par le Lenovo IdeaPad Slim 3 15 (réf. LEN-IPS3-15-R5) affiché à 325 000 FCFA. Est-il toujours disponible ? »</p>
</div>
<p style="margin: 0; color: #AAB4C5">[Description du produit rédigée par la boutique]</p>
</div>
</div>
<section style="margin-top: 72px; display: flex; flex-wrap: wrap; gap: 56px">
<div style="flex: 1 1 480px; min-width: 0">
<h2 style="font-size: 25px; margin-bottom: 12px">Fiche technique</h2>
<table style="width: 100%; border-collapse: collapse; font-size: 15px"><tbody>{rowsh}</tbody></table>
</div>
<div style="flex: 1 1 360px; min-width: 0; display: flex; flex-direction: column; gap: 12px">
<h2 style="font-size: 25px">Voir l'appareil en boutique</h2>
<p style="margin: 0; color: #AAB4C5">Demandez sur WhatsApp dans quelle boutique il se trouve avant de vous déplacer : Cotonou ou Calavi.</p>
</div>
</section>
<section style="margin-top: 80px; display: flex; flex-direction: column; gap: 24px">
<h2 style="font-size: 25px">Modèles proches</h2>
<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px">{sim}</div>
</section>
</main>''' + FOOTER + tail('{"$preview":{"width":1440,"height":1700}}')
open('project/Produit.dc.html','w').write(html)
