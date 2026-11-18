import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import Layout from './components/Layout.jsx';
import { NotFoundBlock } from './components/States.jsx';
import About from './pages/About.jsx';
import Catalog from './pages/Catalog.jsx';
import Contact from './pages/Contact.jsx';
import Home from './pages/Home.jsx';
import { LegalNotice, Privacy, Terms } from './pages/Legal.jsx';
import NotFound from './pages/NotFound.jsx';
import Product from './pages/Product.jsx';
import Services from './pages/Services.jsx';

// L'administration est chargée à part : le site public ne télécharge pas son code.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

export const router = createBrowserRouter([
  { path: 'admin/*', element: <Suspense fallback={<p style={{ padding: 32 }}>Chargement…</p>}><AdminApp /></Suspense> },
  {
    element: <Layout />,
    errorElement: <div className="container-page"><NotFoundBlock title="Une erreur est survenue" text="Rechargez la page. Si le problème continue, contactez-nous." /></div>,
    children: [
      { index: true, element: <Home /> },
      { path: 'catalogue', element: <Catalog /> },
      { path: 'categories/:slug', element: <Catalog /> },
      { path: 'produits/:slug', element: <Product /> },
      { path: 'services', element: <Services /> },
      { path: 'a-propos', element: <About /> },
      { path: 'contact', element: <Contact /> },
      { path: 'conditions-generales', element: <Terms /> },
      { path: 'confidentialite', element: <Privacy /> },
      { path: 'mentions-legales', element: <LegalNotice /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
