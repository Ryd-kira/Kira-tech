from gen_common import *
ADMIN_CSS = """
body{background:#F5F7FA;color:#090D16}
a{color:#0F5BE0}a:hover{color:#0A47B3}
.btn-ghost{color:#090D16;border-color:#C9D1DD;background:#FFFFFF}.btn-ghost:hover{border-color:#176BFF;color:#090D16}
.chip{color:#090D16;border-color:#C9D1DD;background:#FFFFFF}
.field{background:#FFFFFF;border-color:#C9D1DD;color:#090D16}
label.f{color:#4A5568}
.panel{background:#FFFFFF;border:1px solid #DDE3EC;border-radius:10px}
.muted{color:#4A5568}
.side a{display:block;padding:9px 14px;border-radius:6px;color:#AAB4C5;text-decoration:none;font-size:14px}
.side a:hover{color:#F5F7FA;background:#172338}
.side a[aria-current="page"]{background:#172338;color:#F5F7FA;box-shadow:inset 3px 0 0 #176BFF}
td,th{padding:12px 14px;border-bottom:1px solid #E6EAF0;text-align:left;font-size:14px}
th{font-weight:600;color:#4A5568;font-size:13px}
"""
SECTIONS = ['Vue générale','Produits','Stocks','Mouvements de stock','Achats','Ventes','Transactions','Paiements','Livraisons','Clients','Fournisseurs','Retours et remboursements','Administrateurs',"Journal d'activité",'Rapports']
def side(active):
    items = ''.join(f'<a href="#" {"aria-current=\"page\"" if s==active else ""}>{s}</a>' for s in SECTIONS)
    return f'''<nav class="side" aria-label="Administration" style="flex: 1 1 220px; max-width: 240px; background: #090D16; padding: 20px 12px; display: flex; flex-direction: column; gap: 2px; min-height: 100%">
<div style="padding: 4px 14px 18px; color: #F5F7FA"><div style="font-stretch: 125%; font-weight: 800; font-size: 17px">KIRA TECH</div><div style="font-size: 12px; color: #AAB4C5">Administration</div></div>
{items}
<div style="margin-top: auto; padding: 16px 14px 0; border-top: 1px solid #1C2840; font-size: 13px; color: #AAB4C5">Compte : Admin Cotonou<br><a href="#" style="display: inline; padding: 0; color: #5B95FF">Se déconnecter</a></div>
</nav>'''

# ---------- Caisse ----------
logic = '''
constructor(props) {
  super(props);
  this.state = { lines: [{ id: 'p2', qty: 1 }], pay: 'MOBILE_MONEY', handover: 'now' };
}
renderVals() {
  const CATALOG = [
    { id: 'p1', name: 'HP EliteBook 840 G6', ref: 'HP-EB840-G6', price: 245000, avail: 3 },
    { id: 'p2', name: 'Lenovo IdeaPad Slim 3 15', ref: 'LEN-IPS3-15-R5', price: 325000, avail: 2 },
    { id: 'p3', name: 'Souris sans fil Logitech M185', ref: 'LOG-M185', price: 9500, avail: 14 },
    { id: 'p4', name: 'Sacoche 15,6 pouces', ref: 'ACC-SAC156', price: 12000, avail: 0 },
  ];
  const fmt = (n) => n.toLocaleString('fr-FR').replace(/\\u202f|\\u00a0/g, ' ') + ' FCFA';
  const lines = this.state.lines;
  const setQty = (id, d) => () => {
    const next = lines.map((l) => l.id === id ? Object.assign({}, l, { qty: l.qty + d }) : l).filter((l) => l.qty > 0);
    this.setState({ lines: next });
  };
  const results = CATALOG.map((p) => {
    const inTicket = lines.find((l) => l.id === p.id);
    const left = p.avail - (inTicket ? inTicket.qty : 0);
    return Object.assign({}, p, {
      priceTxt: fmt(p.price), availTxt: p.avail === 0 ? 'Rupture' : p.avail + ' disponibles',
      availColor: p.avail === 0 ? '#B42318' : (p.avail <= 2 ? '#8A5A00' : '#0B7A47'),
      disabled: left <= 0, aria: 'Ajouter ' + p.name,
      add: () => this.setState({ lines: inTicket ? lines.map((l) => l.id === p.id ? Object.assign({}, l, { qty: l.qty + 1 }) : l) : lines.concat([{ id: p.id, qty: 1 }]) }),
    });
  });
  const ticket = lines.map((l) => {
    const p = CATALOG.find((x) => x.id === l.id);
    return { name: p.name, ref: p.ref, qty: l.qty, unit: fmt(p.price), total: fmt(p.price * l.qty), plus: setQty(l.id, 1), minus: setQty(l.id, -1), canPlus: l.qty >= p.avail, ariaPlus: 'Augmenter la quantité de ' + p.name, ariaMinus: 'Diminuer la quantité de ' + p.name };
  });
  const subtotal = lines.reduce((s, l) => s + CATALOG.find((x) => x.id === l.id).price * l.qty, 0);
  const discount = lines.length ? 10000 : 0;
  const methods = [['CASH', 'Espèces'], ['MOBILE_MONEY', 'Mobile Money'], ['BANK_TRANSFER', 'Virement'], ['CARD', 'Carte'], ['OTHER', 'Autre']]
    .map(([id, label]) => ({ label, pressed: String(this.state.pay === id), pick: () => this.setState({ pay: id }) }));
  const handovers = [['now', 'Remis maintenant'], ['later', 'Retrait différé'], ['delivery', 'Livraison']]
    .map(([id, label]) => ({ label, pressed: String(this.state.handover === id), pick: () => this.setState({ handover: id }) }));
  return {
    results, ticket, hasLines: lines.length > 0, empty: lines.length === 0, methods, handovers,
    subtotal: fmt(subtotal), discount: fmt(discount), total: fmt(Math.max(subtotal - discount, 0)),
    clear: () => this.setState({ lines: [] }),
  };
}'''
caisse = head('Caisse', ADMIN_CSS) + f'''<div style="display: flex; flex-wrap: wrap; min-height: 900px">
{side('Ventes')}
<main style="flex: 999 1 640px; min-width: 0; padding: 28px 32px; display: flex; flex-direction: column; gap: 20px">
<div style="display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap">
<div><h1 style="font-size: 31px">Caisse</h1><p class="muted" style="margin: 4px 0 0">Nouvelle vente en boutique</p></div>
<label class="f" style="min-width: 220px">Boutique<select class="field"><option>Cotonou</option><option>Calavi</option></select></label>
</div>
<div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start">
<section class="panel" aria-labelledby="search-title" style="flex: 1 1 420px; min-width: 0; padding: 20px; display: flex; flex-direction: column; gap: 14px">
<h2 id="search-title" style="font-size: 18px; font-stretch: 105%">Ajouter un produit</h2>
<label class="f">Nom, référence ou numéro de série<span style="position: relative; display: flex"><span style="position: absolute; left: 12px; top: 13px; color: #4A5568">{ICON["search"]}</span><input class="field" type="search" placeholder="Ex. LEN-IPS3, EliteBook" style="width: 100%; padding-left: 38px"></span></label>
<ul style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column">
<sc-for list="{{{{results}}}}" as="r" hint-placeholder-count="4">
<li style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #E6EAF0">
<div style="flex: 1; min-width: 0"><div style="font-weight: 600; font-size: 15px">{{{{r.name}}}}</div><div class="num muted" style="font-size: 13px">{{{{r.ref}}}}</div></div>
<div style="text-align: right"><div class="num" style="font-weight: 600">{{{{r.priceTxt}}}}</div><div class="num" style="font-size: 13px; color: {{{{r.availColor}}}}">{{{{r.availTxt}}}}</div></div>
<button type="button" class="btn btn-ghost" onClick="{{{{r.add}}}}" disabled="{{{{r.disabled}}}}" aria-label="{{{{r.aria}}}}" style="padding: 0 14px">Ajouter</button>
</li>
</sc-for>
</ul>
</section>
<section class="panel" aria-labelledby="ticket-title" style="flex: 1 1 400px; min-width: 0; padding: 20px; display: flex; flex-direction: column; gap: 16px">
<div style="display: flex; justify-content: space-between; align-items: baseline"><h2 id="ticket-title" style="font-size: 18px; font-stretch: 105%">Ticket</h2><sc-if value="{{{{hasLines}}}}" hint-placeholder-val="{{{{true}}}}"><button type="button" onClick="{{{{clear}}}}" style="background: none; border: 0; color: #0F5BE0; font: inherit; font-size: 14px; text-decoration: underline; cursor: pointer; min-height: 32px">Vider le ticket</button></sc-if></div>
<sc-if value="{{{{empty}}}}" hint-placeholder-val="{{{{false}}}}"><p class="muted" style="margin: 0; padding: 24px 0; text-align: center">Ajoutez un produit depuis la liste pour commencer la vente.</p></sc-if>
<sc-for list="{{{{ticket}}}}" as="t" hint-placeholder-count="1">
<div style="display: flex; gap: 12px; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #E6EAF0">
<div style="flex: 1; min-width: 0"><div style="font-weight: 600; font-size: 15px">{{{{t.name}}}}</div><div class="num muted" style="font-size: 13px">{{{{t.unit}}}} l'unité</div></div>
<div style="display: flex; align-items: center; gap: 6px"><button type="button" class="btn btn-ghost" onClick="{{{{t.minus}}}}" aria-label="{{{{t.ariaMinus}}}}" style="padding: 0; width: 36px; min-height: 36px">-</button><span class="num" style="min-width: 24px; text-align: center; font-weight: 600">{{{{t.qty}}}}</span><button type="button" class="btn btn-ghost" onClick="{{{{t.plus}}}}" disabled="{{{{t.canPlus}}}}" aria-label="{{{{t.ariaPlus}}}}" style="padding: 0; width: 36px; min-height: 36px">+</button></div>
<div class="num" style="min-width: 110px; text-align: right; font-weight: 600">{{{{t.total}}}}</div>
</div>
</sc-for>
<label class="f">Client<input class="field" type="search" placeholder="Nom ou téléphone, ou laisser vide pour un client occasionnel"></label>
<label class="f">Remise (FCFA)<input class="field num" type="text" value="10 000" inputmode="numeric"><span style="font-weight: 400; font-size: 13px">Plafond de votre rôle : 10 % du sous-total</span></label>
<dl class="num" style="margin: 0; display: flex; flex-direction: column; gap: 6px; font-size: 15px">
<div style="display: flex; justify-content: space-between"><dt class="muted">Sous-total</dt><dd style="margin: 0">{{{{subtotal}}}}</dd></div>
<div style="display: flex; justify-content: space-between"><dt class="muted">Remise</dt><dd style="margin: 0">- {{{{discount}}}}</dd></div>
<div style="display: flex; justify-content: space-between; font-size: 22px; font-weight: 700; font-stretch: 112%; padding-top: 8px; border-top: 1px solid #E6EAF0"><dt>Total</dt><dd style="margin: 0">{{{{total}}}}</dd></div>
</dl>
<fieldset style="border: 0; padding: 0; margin: 0"><legend style="font-size: 13px; font-weight: 600; color: #4A5568; margin-bottom: 8px">Paiement reçu</legend>
<div style="display: flex; flex-wrap: wrap; gap: 6px"><sc-for list="{{{{methods}}}}" as="m" hint-placeholder-count="5"><button type="button" class="chip" aria-pressed="{{{{m.pressed}}}}" onClick="{{{{m.pick}}}}" style="min-height: 36px; font-size: 14px">{{{{m.label}}}}</button></sc-for></div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px"><label class="f">Montant reçu<input class="field num" type="text" value="315 000" inputmode="numeric"></label><label class="f">Référence Mobile Money<input class="field" type="text" placeholder="Facultatif"></label></div>
</fieldset>
<fieldset style="border: 0; padding: 0; margin: 0"><legend style="font-size: 13px; font-weight: 600; color: #4A5568; margin-bottom: 8px">Remise du produit</legend>
<div style="display: flex; flex-wrap: wrap; gap: 6px"><sc-for list="{{{{handovers}}}}" as="h" hint-placeholder-count="3"><button type="button" class="chip" aria-pressed="{{{{h.pressed}}}}" onClick="{{{{h.pick}}}}" style="min-height: 36px; font-size: 14px">{{{{h.label}}}}</button></sc-for></div>
</fieldset>
<button type="button" class="btn btn-primary" style="min-height: 52px; font-size: 16px">Valider la vente</button>
<p class="muted" style="margin: 0; font-size: 13px">La validation, le paiement et la remise sont enregistrés comme trois événements distincts.</p>
</section>
</div>
</main></div>''' + tail('{"$preview":{"width":1440,"height":900}}', logic)
open('project/Caisse.dc.html','w').write(caisse)

# ---------- Fiche vente ----------
def track(title, state, color, body):
    return f'''<section class="panel" style="flex: 1 1 280px; min-width: 0; padding: 20px; display: flex; flex-direction: column; gap: 10px">
<h2 style="font-size: 15px; font-stretch: 100%; font-weight: 600" class="muted">{title}</h2>
<div style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 18px; font-stretch: 108%"><span class="dot" style="background: {color}; width: 10px; height: 10px"></span>{state}</div>
{body}</section>'''
pay_body = '''<dl class="num" style="margin: 0; display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; font-size: 14px"><dt class="muted">Total</dt><dd style="margin: 0">300 000 FCFA</dd><dt class="muted">Encaissé</dt><dd style="margin: 0">100 000 FCFA</dd><dt style="font-weight: 600">Reste à payer</dt><dd style="margin: 0; font-weight: 700">200 000 FCFA</dd></dl>
<div role="img" aria-label="33 % encaissé" style="height: 6px; background: #E6EAF0; border-radius: 3px"><div style="width: 33%; height: 6px; background: #176BFF; border-radius: 3px"></div></div>
<a class="btn btn-primary" href="#" style="margin-top: 6px">Enregistrer un paiement</a>'''
del_body = '''<p class="muted" style="margin: 0; font-size: 14px">Remise au livreur le 18/11/2026 à 11 h 20. Stock passé de Cotonou à En transit.</p>
<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px"><a class="btn btn-primary" href="#">Confirmer la réception</a><a class="btn btn-ghost" href="#">Signaler un échec</a></div>'''
val_body = '''<p class="muted" style="margin: 0; font-size: 14px">Le 18/11/2026 à 09 h 42 par Admin Cotonou Convertie depuis la réservation R-2026-000031.</p>
<a class="btn btn-ghost" href="#" style="margin-top: 6px; align-self: flex-start">Imprimer le ticket</a>'''
hist = [('18/11 11:20','Livraison','Prête à expédier','En cours de livraison','Admin Cotonou'),('18/11 10:05','Livraison','En préparation','Prête à expédier','Gestionnaire Cotonou'),('18/11 09:42','Vente','','Validée','Admin Cotonou'),('18/11 09:42','Réservation R-2026-000031','Confirmée','Convertie en vente','Admin Cotonou'),('16/11 16:10','Paiement P-2026-000118','','Enregistré : 100 000 FCFA, Mobile Money','Admin Cotonou')]
histh = ''.join(f'<tr><td class="num" style="white-space: nowrap">{d}</td><td>{o}</td><td>{f"{a} vers {b}" if a else b}</td><td>{u}</td></tr>' for d,o,a,b,u in hist)
vente = head('Fiche vente', ADMIN_CSS) + f'''<div style="display: flex; flex-wrap: wrap; min-height: 1200px">
{side('Ventes')}
<main style="flex: 999 1 640px; min-width: 0; padding: 28px 32px; display: flex; flex-direction: column; gap: 20px">
<nav aria-label="Fil d'Ariane" style="font-size: 14px"><a href="#">Ventes</a> <span class="muted">/ V-2026-000123</span></nav>
<div style="display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap">
<div><h1 class="num" style="font-size: 31px">Vente V-2026-000123</h1><p class="muted" style="margin: 4px 0 0">Vente avec livraison, boutique de Cotonou. Client : [nom du client], [téléphone]</p></div>
<a class="btn btn-ghost" href="#">Annuler la vente</a>
</div>
<div style="display: flex; flex-wrap: wrap; gap: 16px">
{track('Validation commerciale', 'Validée', '#0B7A47', val_body)}
{track('Paiement', 'Partiellement payée', '#8A5A00', pay_body)}
{track('Remise au client', 'En cours de livraison', '#176BFF', del_body)}
</div>
<section class="panel" style="overflow-x: auto"><h2 style="font-size: 18px; font-stretch: 105%; padding: 18px 20px 6px">Articles</h2>
<table class="num" style="width: 100%; border-collapse: collapse"><thead><tr><th>Produit</th><th>N° de série</th><th style="text-align: right">Qté</th><th style="text-align: right">Prix appliqué</th><th style="text-align: right">Remise</th><th style="text-align: right">Total</th></tr></thead>
<tbody><tr><td>Dell Latitude 5420</td><td>[n° de série]</td><td style="text-align: right">1</td><td style="text-align: right">285 000</td><td style="text-align: right">0</td><td style="text-align: right">285 000</td></tr>
<tr><td>Sacoche 15,6 pouces</td><td class="muted">Non suivi</td><td style="text-align: right">1</td><td style="text-align: right">12 000</td><td style="text-align: right">2 000</td><td style="text-align: right">10 000</td></tr>
<tr><td colspan="5" class="muted">Frais de livraison</td><td style="text-align: right">5 000</td></tr>
<tr><td colspan="5" style="font-weight: 700">Total</td><td style="text-align: right; font-weight: 700">300 000 FCFA</td></tr></tbody></table></section>
<div style="display: flex; flex-wrap: wrap; gap: 16px">
<section class="panel" style="flex: 1 1 360px; min-width: 0; overflow-x: auto"><h2 style="font-size: 18px; font-stretch: 105%; padding: 18px 20px 6px">Paiements</h2>
<table class="num" style="width: 100%; border-collapse: collapse"><thead><tr><th>Référence</th><th>Date</th><th>Moyen</th><th style="text-align: right">Montant</th></tr></thead>
<tbody><tr><td>P-2026-000118</td><td>16/11/2026</td><td>Mobile Money<br><span class="muted" style="font-size: 12px">Réf. déclarée [n° opération]</span></td><td style="text-align: right">100 000</td></tr></tbody></table></section>
<section class="panel" style="flex: 1 1 360px; min-width: 0; padding: 18px 20px; display: flex; flex-direction: column; gap: 8px"><h2 style="font-size: 18px; font-stretch: 105%">Livraison L-2026-000057</h2>
<dl style="margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; font-size: 14px"><dt class="muted">Destinataire</dt><dd style="margin: 0">[nom du client]</dd><dt class="muted">Adresse</dt><dd style="margin: 0">Calavi, quartier [à saisir]</dd><dt class="muted">Livreur</dt><dd style="margin: 0">[Nom du livreur]</dd><dt class="muted">Prévue le</dt><dd class="num" style="margin: 0">18/11/2026</dd></dl></section>
</div>
<section class="panel" style="overflow-x: auto"><h2 style="font-size: 18px; font-stretch: 105%; padding: 18px 20px 6px">Historique</h2>
<table style="width: 100%; border-collapse: collapse"><thead><tr><th>Date</th><th>Élément</th><th>Changement</th><th>Par</th></tr></thead><tbody>{histh}</tbody></table></section>
</main></div>''' + tail('{"$preview":{"width":1440,"height":1200}}')
open('project/Vente.dc.html','w').write(vente)
