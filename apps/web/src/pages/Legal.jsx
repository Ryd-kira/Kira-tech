import Seo from '../components/Seo.jsx';

// Structure des pages légales. Les passages entre crochets doivent être complétés et le tout
// relu par un juriste avant la mise en ligne : aucun texte juridique n'est inventé ici.
function LegalPage({ title, children }) {
  return (
    <div className="container-page pt-10 prose-legal">
      <Seo title={title} />
      <h1 className="text-[clamp(31px,4vw,49px)]">{title}</h1>
      <p className="mt-4 text-sm">Document à compléter et à faire valider avant la mise en ligne.</p>
      {children}
    </div>
  );
}

export function LegalNotice() {
  return (
    <LegalPage title="Mentions légales">
      <h2>Éditeur du site</h2>
      <p>Kira Tech et Solution. [Forme juridique, numéro RCCM, IFU, adresse du siège, téléphone, e-mail, responsable de la publication.]</p>
      <h2>Hébergement</h2>
      <p>Site : Vercel Inc. Serveur d'application : Render Services Inc. Base de données : Neon (Databricks). Images : Cloudinary. [Adresses des hébergeurs à reporter.]</p>
      <h2>Propriété intellectuelle</h2>
      <p>[Clause à fournir.]</p>
    </LegalPage>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Politique de confidentialité">
      <h2>Données collectées</h2>
      <p>Le formulaire de contact recueille votre nom, votre téléphone, votre e-mail si vous le donnez, l'objet et le contenu de votre message. Le site ne crée pas de compte client et n'enregistre aucun paiement en ligne.</p>
      <h2>Utilisation</h2>
      <p>Ces données servent uniquement à répondre à votre demande. Elles ne sont ni vendues ni transmises à des tiers à des fins commerciales.</p>
      <h2>Conservation</h2>
      <p>[Durée de conservation des messages à définir.]</p>
      <h2>Prestataires techniques</h2>
      <p>Les données sont hébergées par Neon (base de données) et traitées par Render (serveur) et Vercel (site). Les boutons WhatsApp ouvrent le service de WhatsApp, soumis à sa propre politique.</p>
      <h2>Vos droits</h2>
      <p>[Modalités d'accès, de rectification et de suppression, contact du responsable du traitement, références à la réglementation béninoise applicable et à l'APDP, à faire valider par un juriste.]</p>
      <h2>Cookies</h2>
      <p>Le site public n'utilise pas de cookie de suivi ni de mesure d'audience. L'espace d'administration utilise un cookie technique de session, réservé au personnel.</p>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Conditions générales">
      <h2>Objet</h2>
      <p>Le site présente le catalogue de Kira Tech et Solution. Les achats se concluent en boutique ou après échange sur WhatsApp ; aucun paiement n'est effectué sur le site.</p>
      <h2>Prix et disponibilité</h2>
      <p>Les prix sont indiqués en francs CFA. [Mention TTC, validité des prix, confirmation de la disponibilité avant tout achat.]</p>
      <h2>Garantie et retours</h2>
      <p>[Conditions de garantie, de retour, d'échange et de remboursement à fournir.]</p>
      <h2>Livraison</h2>
      <p>[Zones, frais et délais de livraison à fournir.]</p>
    </LegalPage>
  );
}
