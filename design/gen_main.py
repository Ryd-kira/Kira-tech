from gen_common import *
sw = [('#090D16','Noir profond','Fond du site'),('#172338','Bleu nuit','Cartes, panneaux'),('#176BFF','Bleu électrique','Boutons et actions (texte blanc)'),('#5B95FF','Bleu lien','Liens et focus sur fond sombre'),('#F5F7FA','Blanc','Texte principal'),('#AAB4C5','Gris secondaire','Texte secondaire')]
swh = ''.join(f'''<div style="display: flex; flex-direction: column; gap: 8px"><div style="height: 88px; border-radius: 8px; background: {h}; border: 1px solid #26344F"></div><div style="font-weight: 600; font-size: 15px">{n}</div><div class="num" style="font-size: 13px; color: #AAB4C5">{h}<br>{r}</div></div>''' for h,n,r in sw)
html = head('Identité visuelle') + f'''<div style="width: 1280px; padding: 64px; display: flex; flex-direction: column; gap: 56px">
<div style="display: flex; flex-direction: column; gap: 12px; max-width: 760px">
<h1 style="font-size: 49px">Identité visuelle</h1>
<p style="margin: 0; color: #AAB4C5; font-size: 17px">Noir et bleu électrique. Une seule famille, Archivo, élargie pour les titres et les chiffres des fiches techniques. Le bleu est réservé à ce qui se clique.</p>
</div>
<section style="display: flex; flex-direction: column; gap: 20px">
<h2 style="font-size: 25px">Couleurs</h2>
<div style="display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 20px">{swh}</div>
<div style="display: flex; gap: 32px; flex-wrap: wrap; font-size: 15px">{badge("ok")}{badge("low")}{badge("out")}{badge("off")}</div>
<p style="margin: 0; font-size: 13px; color: #AAB4C5; max-width: 720px">Le bleu électrique #176BFF n'atteint pas 4,5:1 en texte sur le noir : il sert de fond aux boutons, avec un texte blanc pur (4,6:1). Les liens utilisent #5B95FF (6,1:1).</p>
</section>
<section style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 48px">
<div style="display: flex; flex-direction: column; gap: 20px">
<h2 style="font-size: 25px">Typographie</h2>
<div style="font-stretch: 118%; font-weight: 700; font-size: 49px; line-height: 1.05">Ordinateurs portables</div>
<div style="font-stretch: 118%; font-weight: 700; font-size: 31px; line-height: 1.1">PC de bureau et gaming</div>
<div style="font-stretch: 105%; font-weight: 650; font-size: 20px">Lenovo IdeaPad Slim 3 15</div>
<p style="margin: 0; font-size: 16px; max-width: 60ch">Texte courant en 16 px, interligne 1,55, lignes de 60 à 75 caractères. Le texte reste aligné à gauche partout.</p>
<div class="num" style="font-stretch: 112%; font-weight: 700; font-size: 31px">325 000 <span style="font-size: 16px; color: #AAB4C5">FCFA</span></div>
<div class="num" style="font-size: 13px; color: #AAB4C5">Échelle : 13, 16, 20, 25, 31, 39, 49 px. Chiffres tabulaires pour les prix et les caractéristiques.</div>
</div>
<div style="display: flex; flex-direction: column; gap: 20px">
<h2 style="font-size: 25px">Commandes</h2>
<div style="display: flex; gap: 12px; flex-wrap: wrap"><a class="btn btn-primary" href="#">Voir les ordinateurs</a><a class="btn btn-ghost" href="#">Réinitialiser les filtres</a></div>
<div style="display: flex; gap: 12px; flex-wrap: wrap"><a class="btn btn-primary" href="#">{ICON["chat"]}Demander sur WhatsApp</a></div>
<div style="display: flex; gap: 8px; flex-wrap: wrap"><button class="chip" aria-pressed="true" type="button">Programmation</button><button class="chip" aria-pressed="false" type="button">Bureautique</button><button class="chip" aria-pressed="false" type="button">Graphisme</button></div>
<label class="f">Rechercher un modèle<input class="field" type="search" placeholder="Ex. EliteBook 840"></label>
<p style="margin: 0; font-size: 13px; color: #AAB4C5">Angles de 6 px pour les commandes, 10 px pour les cartes. Aucune forme pilule, aucun dégradé, aucune ombre décorative. Focus clavier : contour bleu de 2 px.</p>
</div>
</section>
<section style="display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 48px; align-items: start">
<div>{card(PRODUCTS[1])}</div>
<div style="display: flex; flex-direction: column; gap: 14px; max-width: 520px">
<h2 style="font-size: 25px">La plaque produit</h2>
<p style="margin: 0; color: #AAB4C5">L'élément signature du site. Chaque carte se lit comme la plaque signalétique d'une machine : les trois chiffres qui décident d'un achat (mémoire, stockage, processeur) sont plus grands que le nom.</p>
<p style="margin: 0; color: #AAB4C5">Si le prix est masqué, la carte affiche « Prix sur demande » et garde le bouton WhatsApp. La disponibilité suit le réglage de l'administration.</p>
</div>
</section>
</div>''' + tail('{"$preview":{"width":1280,"height":1960}}')
open('project/Main.dc.html','w').write(html)
