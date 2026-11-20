import { Navigate, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './auth.jsx';
import AdminLayout from './AdminLayout.jsx';
import Categories from './pages/Categories.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Login from './pages/Login.jsx';
import Messages from './pages/Messages.jsx';
import Overview from './pages/Overview.jsx';
import ProductForm from './pages/ProductForm.jsx';
import Products from './pages/Products.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Settings from './pages/Settings.jsx';
import Users from './pages/Users.jsx';
import Roles from './pages/Roles.jsx';
import Pos from './pages/Pos.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Reports from './pages/Reports.jsx';
import { SaleDetail, SaleList } from './pages/Sales.jsx';
import { NewReservation, ReservationDetail, ReservationList } from './pages/Reservations.jsx';
import { CustomerDetail, Customers, Deliveries, Payments, Returns, Ticket } from './pages/CommerceLists.jsx';
import Movements from './pages/Movements.jsx';
import { NewPurchase, PurchaseDetail, PurchaseList } from './pages/Purchases.jsx';
import { SerialDetail, SerialSearch } from './pages/Serials.jsx';
import Stocks from './pages/Stocks.jsx';
import Suppliers from './pages/Suppliers.jsx';
import { TransferDetail, TransferList } from './pages/Transfers.jsx';

function Guard({ children }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <p className="p-8 muted" aria-live="polite">Chargement…</p>;
  if (status === 'out') return <Navigate to="/admin/connexion" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== '/admin/mot-de-passe') return <Navigate to="/admin/mot-de-passe" replace />;
  return children;
}

function Allowed({ permission, children }) {
  const { can } = useAuth();
  return [].concat(permission).some(can) ? children : <p className="muted">Cette page n'est pas accessible avec votre rôle.</p>;
}

export default function AdminApp() {
  return (
    <div className="admin">
      <meta name="robots" content="noindex, nofollow" />
      <title>Administration | Kira Tech et Solution</title>
      <AuthProvider>
        <Routes>
          <Route path="connexion" element={<Login />} />
          <Route path="reinitialiser" element={<ResetPassword />} />
          <Route element={<Guard><AdminLayout /></Guard>}>
            <Route index element={<Overview />} />
            <Route path="mot-de-passe" element={<ChangePassword />} />
            <Route path="produits" element={<Allowed permission="products:write"><Products /></Allowed>} />
            <Route path="produits/nouveau" element={<Allowed permission="products:write"><ProductForm /></Allowed>} />
            <Route path="produits/:id" element={<Allowed permission="products:write"><ProductForm /></Allowed>} />
            <Route path="journal" element={<Allowed permission="audit:read"><AuditLog /></Allowed>} />
            <Route path="rapports" element={<Allowed permission="dashboard:commercial"><Reports /></Allowed>} />
            <Route path="caisse" element={<Allowed permission="sales:write"><Pos /></Allowed>} />
            <Route path="ventes" element={<Allowed permission="sales:write"><SaleList /></Allowed>} />
            <Route path="ventes/:id" element={<Allowed permission="sales:write"><SaleDetail /></Allowed>} />
            <Route path="ventes/:id/ticket" element={<Allowed permission="sales:write"><Ticket /></Allowed>} />
            <Route path="reservations" element={<Allowed permission="reservations:write"><ReservationList /></Allowed>} />
            <Route path="reservations/nouvelle" element={<Allowed permission="reservations:write"><NewReservation /></Allowed>} />
            <Route path="reservations/:id" element={<Allowed permission="reservations:write"><ReservationDetail /></Allowed>} />
            <Route path="paiements" element={<Allowed permission="payments:write"><Payments /></Allowed>} />
            <Route path="livraisons" element={<Allowed permission="fulfillments:write"><Deliveries /></Allowed>} />
            <Route path="clients" element={<Allowed permission="customers:write"><Customers /></Allowed>} />
            <Route path="clients/:id" element={<Allowed permission="customers:write"><CustomerDetail /></Allowed>} />
            <Route path="retours" element={<Allowed permission="returns:write"><Returns /></Allowed>} />
            <Route path="stocks" element={<Allowed permission="stock:read"><Stocks /></Allowed>} />
            <Route path="mouvements" element={<Allowed permission="stock:read"><Movements /></Allowed>} />
            <Route path="transferts" element={<Allowed permission="stock:read"><TransferList /></Allowed>} />
            <Route path="transferts/:id" element={<Allowed permission="stock:read"><TransferDetail /></Allowed>} />
            <Route path="achats" element={<Allowed permission="purchases:receive"><PurchaseList /></Allowed>} />
            <Route path="achats/nouveau" element={<Allowed permission="purchases:write"><NewPurchase /></Allowed>} />
            <Route path="achats/:id" element={<Allowed permission="purchases:receive"><PurchaseDetail /></Allowed>} />
            <Route path="fournisseurs" element={<Allowed permission="purchases:receive"><Suppliers /></Allowed>} />
            <Route path="series" element={<Allowed permission="stock:read"><SerialSearch /></Allowed>} />
            <Route path="series/:id" element={<Allowed permission="stock:read"><SerialDetail /></Allowed>} />
            <Route path="categories" element={<Allowed permission="categories:write"><Categories /></Allowed>} />
            <Route path="messages" element={<Allowed permission="messages:manage"><Messages /></Allowed>} />
            <Route path="parametres" element={<Allowed permission={['settings:content', 'settings:sensitive', 'branding:write', 'stores:manage']}><Settings /></Allowed>} />
            <Route path="roles" element={<Allowed permission="roles:manage"><Roles /></Allowed>} />
            <Route path="administrateurs" element={<Allowed permission="users:manage"><Users /></Allowed>} />
            <Route path="*" element={<p className="muted">Page introuvable.</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </div>
  );
}
