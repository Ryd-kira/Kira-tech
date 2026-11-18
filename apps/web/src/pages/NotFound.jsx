import Seo from '../components/Seo.jsx';
import { NotFoundBlock } from '../components/States.jsx';

export default function NotFound() {
  return <div className="container-page"><Seo title="Page introuvable" noindex /><NotFoundBlock /></div>;
}
