import Seo from '../components/Seo.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import { StoresSection } from './Contact.jsx';
import { ServiceList, ServicesIntro } from './Home.jsx';

export default function Services() {
  return (
    <div className="pt-10">
      <Seo title="Maintenance et réparation" description="Dépannage, réparation et maintenance d'ordinateurs à Cotonou et Calavi." />
      <section className="container-page grid gap-12 grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
        <div className="flex flex-col gap-4">
          <h1 className="text-[clamp(31px,4vw,49px)]">Maintenance et réparation</h1>
          <ServicesIntro />
          <WhatsAppButton className="self-start" label="Décrire une panne" message="Bonjour, mon ordinateur a un problème : " />
        </div>
        <ServiceList />
      </section>
      <StoresSection className="pt-24" />
    </div>
  );
}
