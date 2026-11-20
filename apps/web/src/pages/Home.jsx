import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import Banner from '../components/Banner.jsx';
import Icon from '../components/Icon.jsx';
import ProductCard from '../components/ProductCard.jsx';
import Seo from '../components/Seo.jsx';
import Showcase from '../components/Showcase.jsx';
import { CardSkeleton, ErrorState } from '../components/States.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import { toQuery } from '../lib/api.js';
import { useSettings } from '../lib/settings.jsx';
import { useApi } from '../lib/useApi.js';
import { StoresSection } from './Contact.jsx';

const GAMING = { value: 'GAMING', label: 'Gaming' };

function Finder() {
  const { data: filters } = useApi('/public/filters');
  const [usage, setUsage] = useState(null);
  const [budget, setBudget] = useState(null);
  const navigate = useNavigate();
  const usages = filters ? [...filters.usages.map((u) => ({ value: u.slug, label: u.label })), GAMING] : [];

  function submit(e) {
    e.preventDefault();
    const params = usage === 'GAMING' ? { performance: 'GAMING' } : { usage };
    navigate(`/catalogue${toQuery({ ...params, budget })}`);
  }
  return (
    <form onSubmit={submit} aria-labelledby="finder-title" className="flex-[1_1_440px] min-w-0 bg-night border border-line rounded-[10px] p-6 md:p-7 flex flex-col gap-6">
      <h2 id="finder-title" className="text-[22px]">Trouver le bon ordinateur</h2>
      <fieldset className="border-0 m-0 p-0">
        <legend className="text-sm font-semibold text-grey mb-2.5 p-0">Pour quel usage ?</legend>
        <div className="flex flex-wrap gap-2 mt-2.5">
          {usages.map((u) => (
            <button key={u.value} type="button" className="chip" aria-pressed={usage === u.value} onClick={() => setUsage(usage === u.value ? null : u.value)}>{u.label}</button>
          ))}
        </div>
      </fieldset>
      <fieldset className="border-0 m-0 p-0">
        <legend className="text-sm font-semibold text-grey mb-2.5 p-0">Quel budget ?</legend>
        <div className="flex flex-wrap gap-2 mt-2.5">
          {filters?.budget.map((b) => (
            <button key={b.id} type="button" className="chip num" aria-pressed={budget === b.id} onClick={() => setBudget(budget === b.id ? null : b.id)}>{b.label}</button>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="btn btn-primary self-start">Voir les ordinateurs</button>
    </form>
  );
}

const TITLE = 'Ordinateurs et matériel informatique à Cotonou et Calavi';
const LEAD = "Portables, PC de bureau, PC gaming, composants et accessoires, neufs ou d'occasion. Maintenance et réparation dans nos deux boutiques.";

function StoreNames({ stores }) {
  if (stores.length === 0) return null;
  return (
    <div className="flex gap-7 flex-wrap text-[15px] text-grey">
      {stores.map((s) => <span key={s.code} className="inline-flex gap-2 items-center"><Icon name="pin" size={18} />{s.name}</span>)}
    </div>
  );
}

// Accueil « classique » : accroche et recherche guidée côte à côte.
function ClassicHero({ stores }) {
  return (
    <section className="container-page pt-12 md:pt-[72px] pb-16 flex flex-wrap gap-14 items-start">
      <div className="flex-[1_1_460px] min-w-0 flex flex-col gap-6 md:pt-3">
        <h1 className="text-[clamp(36px,5vw,61px)] !leading-[1.02]">{TITLE}</h1>
        <p className="m-0 text-lg text-grey max-w-[52ch]">{LEAD}</p>
        <StoreNames stores={stores} />
      </div>
      <Finder />
    </section>
  );
}

// Accueil « vitrine » : les ordinateurs mis en avant d'abord, la recherche guidée ensuite.
function ShowcaseHero({ items, stores }) {
  return (
    <>
      <section className="container-page pt-10 md:pt-14 pb-16 flex flex-col gap-8">
        <div className="flex flex-wrap justify-between items-end gap-x-10 gap-y-4">
          <div className="flex flex-col gap-3 max-w-[720px]">
            <h1 className="text-[clamp(32px,4.2vw,52px)] !leading-[1.04]">{TITLE}</h1>
            <p className="m-0 text-lg text-grey max-w-[60ch]">{LEAD}</p>
          </div>
          <StoreNames stores={stores} />
        </div>
        <Showcase items={items} />
      </section>
      <section className="container-page pb-16 flex"><Finder /></section>
    </>
  );
}

export default function Home() {
  const settings = useSettings();
  const { data: cats } = useApi('/public/categories');
  const recent = useApi('/public/products?limit=4&sort=new');
  const wantsShowcase = settings?.homeLayout === 'SHOWCASE';
  const showcase = useApi(wantsShowcase ? '/public/showcase' : null);
  const stores = settings?.stores ?? [];
  // Moins de 2 ordinateurs mis en avant : la vitrine n'a pas de sens, l'accueil classique s'affiche.
  const items = showcase.data?.items ?? [];
  let layout = 'classic';
  if (!settings || (wantsShowcase && !showcase.data && !showcase.error)) layout = 'pending';
  else if (wantsShowcase && items.length >= 2) layout = 'showcase';

  return (
    <>
      <Seo description="Ordinateurs portables, PC de bureau, PC gaming, composants et accessoires, neufs ou d'occasion, à Cotonou et Calavi. Maintenance et réparation." />
      <Banner />
      {layout === 'classic' && <ClassicHero stores={stores} />}
      {layout === 'showcase' && <ShowcaseHero items={items} stores={stores} />}
      {layout === 'pending' && <div aria-hidden="true" className="container-page pt-12 pb-16 min-h-[420px]" />}

      {cats?.items.length > 0 && (
        <section aria-label="Catégories" className="container-page">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] border-y border-line">
            {cats.items.map((c, i) => (
              <Link key={c.slug} to={`/categories/${c.slug}`} className={`flex flex-col gap-1.5 px-5 py-6 no-underline text-paper hover:bg-night ${i > 0 ? 'sm:border-l border-line' : ''}`}>
                <span className="wide font-bold text-lg leading-tight">{c.name}</span>
                {c.description && <span className="text-sm text-grey">{c.description}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="container-page pt-20 flex flex-col gap-7">
        <div className="flex justify-between items-baseline gap-4 flex-wrap">
          <h2 className="text-[31px]">Arrivés récemment</h2>
          <Link to="/catalogue">Tout le catalogue</Link>
        </div>
        {recent.error && <ErrorState error={recent.error} onRetry={recent.retry} />}
        <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
          {!recent.data && recent.loading && Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)}
          {recent.data?.items.map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
        {recent.data?.items.length === 0 && <p className="m-0 text-grey">Le catalogue est en cours de mise en ligne.</p>}
      </section>

      <section id="services" className="container-page pt-24 grid gap-12 grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
        <div className="flex flex-col gap-4">
          <h2 className="text-[31px]">Maintenance et réparation</h2>
          <ServicesIntro />
          <WhatsAppButton className="self-start" label="Décrire une panne" message="Bonjour, mon ordinateur a un problème : " />
        </div>
        <ServiceList />
      </section>

      <StoresSection className="pt-24" />
    </>
  );
}

// Textes saisis dans Paramètres ; tant qu'il n'y en a pas, des repères d'attente.
export function ServicesIntro() {
  const settings = useSettings();
  return (
    <p className="m-0 text-grey max-w-[48ch] whitespace-pre-line">
      {settings?.servicesIntro || "Apportez votre ordinateur dans l'une de nos boutiques ou décrivez la panne sur WhatsApp avant de vous déplacer."}
    </p>
  );
}

const PLACEHOLDER_SERVICES = [
  { icon: 'WRENCH', title: 'Dépannage et réparation', description: '[Prestations, délais indicatifs et conditions à fournir]' },
  { icon: 'CPU', title: 'Maintenance informatique', description: '[Prestations pour particuliers et entreprises à fournir]' },
];

export function ServiceList() {
  const settings = useSettings();
  if (!settings) return null;
  const items = settings.services?.length ? settings.services : PLACEHOLDER_SERVICES;
  return (
    <div className="flex flex-col border-t border-line">
      {items.map(({ icon, title, description }) => (
        <div key={title} className="flex gap-4 py-5 border-b border-line">
          <span className="text-link"><Icon name={icon.toLowerCase()} size={22} /></span>
          <div className="flex flex-col gap-1"><h3 className="text-xl" style={{ fontStretch: '105%' }}>{title}</h3><p className="m-0 text-grey whitespace-pre-line">{description}</p></div>
        </div>
      ))}
    </div>
  );
}
