from gen_common import *
import json
extra = [
 dict(brand='Dell', cond='Occasion', name='Dell OptiPlex 7090 Tour', ram='8', sto='256', stou='Go SSD', cpu='Core i5-10500', price='185 000', status='ok'),
 dict(brand='Apple', cond='Occasion', name='MacBook Air 13 M1', ram='8', sto='256', stou='Go SSD', cpu='Apple M1', price='450 000', status='low'),
]
cards = ''.join(card(p) for p in PRODUCTS + extra)
groups = [
 ('cat','Catégorie',['Portables','Bureau','Gaming']),
 ('ram','Mémoire vive',['4 Go','8 Go','16 Go','32 Go','64 Go']),
 ('sto','Stockage',['128 Go','256 Go','512 Go','1 To','2 To']),
 ('use','Usage',['Bureautique','Études','Programmation','Graphisme','Cybersécurité']),
 ('perf','Performance',['Basique','Intermédiaire','Avancée','Gaming']),
 ('bud','Budget',['Moins de 150 000 FCFA','150 000 à 300 000 FCFA','300 000 à 500 000 FCFA','Plus de 500 000 FCFA']),
 ('cond','État',['Neuf','Occasion']),
]
gjs = json.dumps([{'id':i,'label':l,'options':o} for i,l,o in groups], ensure_ascii=False)
logic = f'''
constructor(props) {{ super(props); this.state = {{ sel: {{ ram: ['16 Go'], use: ['Programmation'] }} }}; }}
renderVals() {{
  const GROUPS = {gjs};
  const sel = this.state.sel;
  const toggle = (gid, label) => () => {{
    const cur = sel[gid] || [];
    const next = cur.includes(label) ? cur.filter((x) => x !== label) : cur.concat([label]);
    this.setState({{ sel: Object.assign({{}}, sel, {{ [gid]: next }}) }});
  }};
  const groups = GROUPS.map((g) => ({{
    label: g.label,
    options: g.options.map((o) => ({{ label: o, pressed: String((sel[g.id] || []).includes(o)), toggle: toggle(g.id, o) }})),
  }}));
  const active = [];
  GROUPS.forEach((g) => (sel[g.id] || []).forEach((o) => active.push({{ label: o, remove: toggle(g.id, o), aria: 'Retirer le filtre ' + o }})));
  return {{ groups, active, hasActive: active.length > 0, reset: () => this.setState({{ sel: {{}} }}) }};
}}'''
html = head('Catalogue') + header('Catalogue') + f'''<main style="max-width: 1280px; margin: 0 auto; padding: 40px 32px 0">
<div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 28px"><h1 style="font-size: clamp(31px, 4vw, 49px)">Catalogue</h1><p style="margin: 0; color: #AAB4C5">Combinez les filtres : les résultats se mettent à jour à chaque choix.</p></div>
<div style="display: flex; flex-wrap: wrap; gap: 40px; align-items: flex-start">
<aside aria-label="Filtres" style="flex: 1 1 260px; max-width: 300px; display: flex; flex-direction: column; gap: 24px">
<sc-for list="{{{{groups}}}}" as="g" hint-placeholder-count="7">
<fieldset style="border: 0; margin: 0; padding: 0 0 20px; border-bottom: 1px solid #1C2840"><legend style="font-size: 14px; font-weight: 600; color: #F5F7FA; padding: 0; margin-bottom: 10px">{{{{g.label}}}}</legend>
<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px"><sc-for list="{{{{g.options}}}}" as="o" hint-placeholder-count="4"><button class="chip" type="button" aria-pressed="{{{{o.pressed}}}}" onClick="{{{{o.toggle}}}}" style="min-height: 36px; font-size: 14px">{{{{o.label}}}}</button></sc-for></div>
</fieldset>
</sc-for>
</aside>
<div style="flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 20px">
<div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end">
<label class="f" style="flex: 1 1 280px">Rechercher un nom ou un modèle<span style="position: relative; display: flex"><span style="position: absolute; left: 12px; top: 13px; color: #AAB4C5">{ICON["search"]}</span><input class="field" type="search" placeholder="Ex. ThinkPad, RTX 4060" style="width: 100%; padding-left: 38px"></span></label>
<label class="f" style="flex: 0 1 220px">Trier par<select class="field"><option>Nouveautés</option><option>Prix croissant</option><option>Prix décroissant</option></select></label>
</div>
<sc-if value="{{{{hasActive}}}}" hint-placeholder-val="{{{{true}}}}">
<div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center">
<sc-for list="{{{{active}}}}" as="a" hint-placeholder-count="2"><button type="button" class="chip" onClick="{{{{a.remove}}}}" aria-label="{{{{a.aria}}}}" style="min-height: 34px; font-size: 14px; gap: 8px; background: #172338">{{{{a.label}}}}{ICON["x"]}</button></sc-for>
<button type="button" class="btn" onClick="{{{{reset}}}}" style="min-height: 34px; padding: 0 8px; background: transparent; color: #5B95FF; border: 0; text-decoration: underline; text-underline-offset: 3px">Réinitialiser les filtres</button>
</div>
</sc-if>
<div style="font-size: 14px; color: #AAB4C5" aria-live="polite"><span class="num">6</span> ordinateurs</div>
<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px">{cards}</div>
<nav aria-label="Pagination" style="display: flex; justify-content: center; padding-top: 12px"><a class="btn btn-ghost" href="#plus">Afficher plus de résultats</a></nav>
</div>
</div>
</main>''' + FOOTER + tail('{"$preview":{"width":1440,"height":1900}}', logic)
open('project/Catalogue.dc.html','w').write(html)
