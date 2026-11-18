from gen_common import *
usages = ['Bureautique','Études','Programmation','Graphisme','Cybersécurité','Gaming']
chips = ''.join(f'<button class="chip" type="button" aria-pressed="{"true" if u=="Programmation" else "false"}">{u}</button>' for u in usages)
budgets = ['Moins de 150 000 FCFA','150 000 à 300 000 FCFA','300 000 à 500 000 FCFA','Plus de 500 000 FCFA']
bud = ''.join(f'<button class="chip" type="button" aria-pressed="{"true" if i==1 else "false"}"><span class="num">{b}</span></button>' for i,b in enumerate(budgets))
cats = [('Ordinateurs portables','Bureautique, études, travail mobile'),('Ordinateurs de bureau','Postes fixes pour le bureau et la maison'),('PC Gaming','Cartes graphiques dédiées, écrans rapides'),('Composants','Mémoire, stockage, alimentation'),('Accessoires','Claviers, souris, sacs, câbles')]
catsh = ''.join(f'<a href="Catalogue.dc.html" style="display: flex; flex-direction: column; gap: 6px; padding: 24px 20px; text-decoration: none; color: #F5F7FA; border-left: {"0" if i==0 else "1px solid #26344F"}"><span style="font-stretch: 112%; font-weight: 700; font-size: 18px; line-height: 1.2">{n}</span><span style="font-size: 14px; color: #AAB4C5">{d}</span></a>' for i,(n,d) in enumerate(cats))
cards = ''.join(card(p) for p in PRODUCTS)
html = head('Accueil') + header() + f'''<main>
<section style="max-width: 1280px; margin: 0 auto; padding: 72px 32px 64px; display: flex; flex-wrap: wrap; gap: 56px; align-items: flex-start">
<div style="flex: 1 1 460px; min-width: 0; display: flex; flex-direction: column; gap: 24px; padding-top: 12px">
<h1 style="font-size: clamp(36px, 5vw, 61px); line-height: 1.02">Ordinateurs et matériel informatique à Cotonou et Calavi</h1>
<p style="margin: 0; font-size: 18px; color: #AAB4C5; max-width: 52ch">Portables, PC de bureau, PC gaming, composants et accessoires, neufs ou d'occasion. Maintenance et réparation dans nos deux boutiques.</p>
<div style="display: flex; gap: 28px; flex-wrap: wrap; font-size: 15px; color: #AAB4C5">
<span style="display: inline-flex; gap: 8px; align-items: center">{ICON["pin"]}Boutique de Cotonou</span>
<span style="display: inline-flex; gap: 8px; align-items: center">{ICON["pin"]}Boutique de Calavi</span>
</div>
</div>
<form aria-labelledby="finder-title" style="flex: 1 1 440px; min-width: 0; background: #172338; border: 1px solid #26344F; border-radius: 10px; padding: 28px; display: flex; flex-direction: column; gap: 22px">
<h2 id="finder-title" style="font-size: 22px">Trouver le bon ordinateur</h2>
<fieldset style="border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px"><legend style="font-size: 14px; font-weight: 600; color: #AAB4C5; padding: 0; margin-bottom: 10px">Pour quel usage ?</legend><div style="display: flex; flex-wrap: wrap; gap: 8px">{chips}</div></fieldset>
<fieldset style="border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px"><legend style="font-size: 14px; font-weight: 600; color: #AAB4C5; padding: 0; margin-bottom: 10px">Quel budget ?</legend><div style="display: flex; flex-wrap: wrap; gap: 8px">{bud}</div></fieldset>
<a class="btn btn-primary" href="Catalogue.dc.html" style="align-self: flex-start">Voir les ordinateurs</a>
</form>
</section>
<section aria-label="Catégories" style="max-width: 1280px; margin: 0 auto; padding: 0 32px">
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); border-top: 1px solid #26344F; border-bottom: 1px solid #26344F">{catsh}</div>
</section>
<section style="max-width: 1280px; margin: 0 auto; padding: 80px 32px 0; display: flex; flex-direction: column; gap: 28px">
<div style="display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap"><h2 style="font-size: 31px">Arrivés récemment</h2><a href="Catalogue.dc.html">Tout le catalogue</a></div>
<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px">{cards}</div>
</section>
<section id="services" style="max-width: 1280px; margin: 0 auto; padding: 96px 32px 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 48px">
<div style="display: flex; flex-direction: column; gap: 16px">
<h2 style="font-size: 31px">Maintenance et réparation</h2>
<p style="margin: 0; color: #AAB4C5; max-width: 48ch">Apportez votre ordinateur dans l'une de nos boutiques ou décrivez la panne sur WhatsApp avant de vous déplacer.</p>
<a class="btn btn-primary" href="#whatsapp" style="align-self: flex-start">{ICON["chat"]}Décrire une panne</a>
</div>
<div style="display: flex; flex-direction: column; border-top: 1px solid #26344F">
<div style="display: flex; gap: 16px; padding: 22px 0; border-bottom: 1px solid #26344F"><span style="color: #5B95FF">{ICON["wrench"]}</span><div style="display: flex; flex-direction: column; gap: 4px"><h3 style="font-size: 20px; font-stretch: 105%">Dépannage et réparation</h3><p style="margin: 0; color: #AAB4C5">[Prestations, délais indicatifs et conditions à fournir]</p></div></div>
<div style="display: flex; gap: 16px; padding: 22px 0; border-bottom: 1px solid #26344F"><span style="color: #5B95FF">{ICON["cpu"]}</span><div style="display: flex; flex-direction: column; gap: 4px"><h3 style="font-size: 20px; font-stretch: 105%">Maintenance informatique</h3><p style="margin: 0; color: #AAB4C5">[Prestations pour particuliers et entreprises à fournir]</p></div></div>
</div>
</section>
<section id="contact" style="max-width: 1280px; margin: 0 auto; padding: 96px 32px 0; display: flex; flex-direction: column; gap: 28px">
<h2 style="font-size: 31px">Nos boutiques</h2>
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px">
<div style="border: 1px solid #26344F; border-radius: 10px; padding: 24px; display: flex; flex-direction: column; gap: 8px"><h3 style="font-size: 20px">Cotonou</h3><span style="color: #AAB4C5">[Adresse à fournir]</span><span style="color: #AAB4C5">[Horaires à fournir]</span><a href="#itineraire-cotonou" style="margin-top: 8px">Voir l'itinéraire</a></div>
<div style="border: 1px solid #26344F; border-radius: 10px; padding: 24px; display: flex; flex-direction: column; gap: 8px"><h3 style="font-size: 20px">Calavi</h3><span style="color: #AAB4C5">[Adresse à fournir]</span><span style="color: #AAB4C5">[Horaires à fournir]</span><a href="#itineraire-calavi" style="margin-top: 8px">Voir l'itinéraire</a></div>
</div>
</section>
</main>''' + FOOTER + tail('{"$preview":{"width":1440,"height":2500}}')
open('project/Accueil.dc.html','w').write(html)
