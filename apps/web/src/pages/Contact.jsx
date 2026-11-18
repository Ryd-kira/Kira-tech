import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import Seo from '../components/Seo.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/settings.jsx';
import { StoreLines } from '../components/Footer.jsx';

export function StoresSection({ className = '' }) {
  const settings = useSettings();
  const stores = settings?.stores ?? [];
  if (stores.length === 0) return null;
  return (
    <section id="boutiques" className={`container-page flex flex-col gap-7 ${className}`}>
      <h2 className="text-[31px]">Nos boutiques</h2>
      <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
        {stores.map((s) => (
          <div key={s.code} className="border border-line rounded-[10px] p-6 flex flex-col gap-2 text-grey">
            <h3 className="text-xl text-paper">{s.city || s.name}</h3>
            <StoreLines store={s} settings={settings} />
          </div>
        ))}
      </div>
    </section>
  );
}

const EMPTY = { name: '', phone: '', email: '', subject: '', message: '', website: '' };

export default function Contact() {
  const location = useLocation();
  const fromProduct = location.state?.product ? location.state : null;
  const [form, setForm] = useState({ ...EMPTY, subject: fromProduct ? `Disponibilité : ${fromProduct.name}` : '' });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const fieldErrors = Object.fromEntries((error?.details ?? []).map((d) => [d.field, d.message]));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    try {
      await api('/public/contact', { method: 'POST', body: { ...form, productSlug: fromProduct?.product } });
      setStatus('sent');
      setForm(EMPTY);
    } catch (err) {
      setError(err);
      setStatus('idle');
    }
  }

  const field = (key, label, props = {}) => (
    <label className="label">
      {label}
      {props.as === 'textarea'
        ? <textarea className="field" value={form[key]} onChange={set(key)} aria-invalid={!!fieldErrors[key]} {...props} as={undefined} />
        : <input className="field" value={form[key]} onChange={set(key)} aria-invalid={!!fieldErrors[key]} {...props} />}
      {fieldErrors[key] && <span className="text-out font-normal">{fieldErrors[key]}</span>}
    </label>
  );

  return (
    <div className="container-page pt-10">
      <Seo title="Contact" description="Contactez Kira Tech et Solution à Cotonou et Calavi : WhatsApp, téléphone ou formulaire." />
      <h1 className="text-[clamp(31px,4vw,49px)] mb-3">Contact</h1>
      <p className="m-0 text-grey max-w-[56ch] mb-10">Le plus rapide est WhatsApp. Vous pouvez aussi laisser un message : nous vous rappelons au numéro indiqué.</p>
      <div className="flex flex-wrap gap-14 items-start">
        <div className="flex-[1_1_300px] flex flex-col gap-4">
          <WhatsAppButton className="self-start" label="Écrire sur WhatsApp" message="Bonjour, " />
        </div>
        <form onSubmit={submit} noValidate className="flex-[2_1_480px] min-w-0 flex flex-col gap-4 max-w-[640px]">
          {status === 'sent' && <p role="status" className="m-0 p-4 rounded-md border border-ok text-ok">Message envoyé. Nous vous recontactons dès que possible.</p>}
          {error && !error.details && <p role="alert" className="m-0 p-4 rounded-md border border-out text-out">{error.message}</p>}
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            {field('name', 'Nom', { required: true, autoComplete: 'name', maxLength: 100 })}
            {field('phone', 'Téléphone', { required: true, type: 'tel', autoComplete: 'tel', inputMode: 'tel', placeholder: '+229 …' })}
          </div>
          {field('email', 'E-mail (facultatif)', { type: 'email', autoComplete: 'email' })}
          {field('subject', 'Objet', { required: true, maxLength: 150 })}
          {field('message', 'Message', { required: true, as: 'textarea', maxLength: 3000 })}
          {/* Champ piège : invisible pour les visiteurs, rempli par les robots. */}
          <div aria-hidden="true" className="absolute -left-[9999px]">
            <label>Site web<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
          </div>
          <p className="m-0 text-[13px] text-grey">Vos coordonnées servent uniquement à vous répondre. Voir la <Link to="/confidentialite">politique de confidentialité</Link>.</p>
          <button type="submit" className="btn btn-primary self-start" disabled={status === 'sending'}>
            {status === 'sending' ? 'Envoi en cours…' : 'Envoyer le message'}
          </button>
        </form>
      </div>
      <StoresSection className="pt-20" />
    </div>
  );
}
