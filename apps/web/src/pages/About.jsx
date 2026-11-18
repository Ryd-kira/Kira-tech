import Seo from '../components/Seo.jsx';
import { useSettings } from '../lib/settings.jsx';
import { paragraphs } from '../lib/format.js';
import { StoresSection } from './Contact.jsx';

// Le texte de présentation doit venir de l'entreprise : rien n'est inventé ici.
export default function About() {
  const settings = useSettings();
  const text = paragraphs(settings?.aboutText);
  return (
    <div className="pt-10">
      <Seo title="À propos" description="Kira Tech et Solution : vente de matériel informatique, maintenance et réparation à Cotonou et Calavi." />
      <section className="container-page"><div className="flex flex-col gap-5 max-w-[860px]">
        <h1 className="text-[clamp(31px,4vw,49px)]">À propos</h1>
        {text.length > 0 ? text.map((t, i) => <p key={i} className={`m-0 text-grey max-w-[60ch] whitespace-pre-line ${i === 0 ? 'text-lg' : ''}`}>{t}</p>) : (<>
        <p className="m-0 text-lg text-grey max-w-[60ch]">Kira Tech et Solution vend des ordinateurs portables, des PC de bureau, des PC gaming, des composants et des accessoires, et assure la maintenance et la réparation de matériel informatique.</p>
        <p className="m-0 text-grey max-w-[60ch]">[Présentation de l'entreprise à fournir : histoire, équipe, engagements, garanties.]</p>
        </>)}
      </div></section>
      <StoresSection className="pt-20" />
    </div>
  );
}
