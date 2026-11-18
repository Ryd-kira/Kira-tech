import { Link } from 'react-router';
import { useSettings } from '../lib/settings.jsx';
import { whatsappUrl } from '../lib/whatsapp.js';
import Icon from './Icon.jsx';

// Sans numéro configuré, le bouton mène à la page contact plutôt qu'à un lien cassé.
export default function WhatsAppButton({ message, label = 'Demander sur WhatsApp', variant = 'primary', className = '', contactState }) {
  const settings = useSettings();
  const url = whatsappUrl(settings?.whatsappNumber, message);
  const cls = `btn btn-${variant} ${className}`;
  if (!url) {
    return <Link className={cls} to="/contact" state={contactState}><Icon name="chat" />Nous contacter</Link>;
  }
  return (
    <a className={cls} href={url} target="_blank" rel="noopener noreferrer">
      <Icon name="chat" />{label}<span className="sr-only"> (ouvre WhatsApp)</span>
    </a>
  );
}
