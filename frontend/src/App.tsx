import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PendingInvites } from "./components/PendingInvites";
import { AppLoader } from "./components/AppLoader";
import { AppLayout } from "./components/layout/AppLayout";
import { AdminLayout } from "./components/layout/AdminLayout";

// Páginas cargadas de forma perezosa (code-splitting por ruta).
// Cada página usa named export, por eso se mapea a { default: m.X }.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Import = lazy(() => import("./pages/Import").then((m) => ({ default: m.Import })));
const Clients = lazy(() => import("./pages/Clients").then((m) => ({ default: m.Clients })));
const ClientDetail = lazy(() => import("./pages/ClientDetail").then((m) => ({ default: m.ClientDetail })));
const DeletedContacts = lazy(() => import("./pages/DeletedContacts").then((m) => ({ default: m.DeletedContacts })));
const ClientSchema = lazy(() => import("./pages/ClientSchema").then((m) => ({ default: m.ClientSchema })));
const Campaigns = lazy(() => import("./pages/Campaigns").then((m) => ({ default: m.Campaigns })));
const CampaignDetail = lazy(() => import("./pages/CampaignDetail").then((m) => ({ default: m.CampaignDetail })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const Team = lazy(() => import("./pages/Team").then((m) => ({ default: m.Team })));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const Integraciones = lazy(() => import("./pages/Integraciones").then((m) => ({ default: m.Integraciones })));
const Webhooks = lazy(() => import("./pages/Webhooks").then((m) => ({ default: m.Webhooks })));
const WooCommerceIntegration = lazy(() => import("./pages/WooCommerceIntegration").then((m) => ({ default: m.WooCommerceIntegration })));
const ApiReference = lazy(() => import("./pages/ApiReference").then((m) => ({ default: m.ApiReference })));
const ComunicacionesLayout = lazy(() => import("./pages/comunicaciones/ComunicacionesLayout").then((m) => ({ default: m.ComunicacionesLayout })));
const Conversaciones = lazy(() => import("./pages/comunicaciones/chat").then((m) => ({ default: m.Conversaciones })));
const Etiquetas = lazy(() => import("./pages/comunicaciones/Etiquetas").then((m) => ({ default: m.Etiquetas })));
const Campanas = lazy(() => import("./pages/comunicaciones/Campanas").then((m) => ({ default: m.Campanas })));
const CampanaEmpty = lazy(() => import("./pages/comunicaciones/CampanaEmpty").then((m) => ({ default: m.CampanaEmpty })));
const CampanaDetail = lazy(() => import("./pages/comunicaciones/CampanaDetail").then((m) => ({ default: m.CampanaDetail })));
const Canales = lazy(() => import("./pages/comunicaciones/Canales").then((m) => ({ default: m.Canales })));
const CanalEmpty = lazy(() => import("./pages/comunicaciones/CanalEmpty").then((m) => ({ default: m.CanalEmpty })));
const CanalDetail = lazy(() => import("./pages/comunicaciones/CanalDetail").then((m) => ({ default: m.CanalDetail })));
const Plantillas = lazy(() => import("./pages/comunicaciones/Plantillas").then((m) => ({ default: m.Plantillas })));
const PlantillaEmpty = lazy(() => import("./pages/comunicaciones/PlantillaEmpty").then((m) => ({ default: m.PlantillaEmpty })));
const PlantillaDetail = lazy(() => import("./pages/comunicaciones/PlantillaDetail").then((m) => ({ default: m.PlantillaDetail })));
const Bots = lazy(() => import("./pages/comunicaciones/Bots").then((m) => ({ default: m.Bots })));
const BotEmpty = lazy(() => import("./pages/comunicaciones/BotEmpty").then((m) => ({ default: m.BotEmpty })));
const BotDetail = lazy(() => import("./pages/comunicaciones/BotDetail").then((m) => ({ default: m.BotDetail })));
const BotConfig = lazy(() => import("./pages/comunicaciones/BotConfig").then((m) => ({ default: m.BotConfig })));
const NewInbox = lazy(() => import("./pages/NewInbox").then((m) => ({ default: m.NewInbox })));
const Inboxes = lazy(() => import("./pages/Inboxes").then((m) => ({ default: m.Inboxes })));
const InboxSettings = lazy(() => import("./pages/InboxSettings").then((m) => ({ default: m.InboxSettings })));
const FormBuilder = lazy(() => import("./pages/FormBuilder").then((m) => ({ default: m.FormBuilder })));
const ChatWidgetBuilder = lazy(() => import("./pages/ChatWidgetBuilder").then((m) => ({ default: m.ChatWidgetBuilder })));
const EmailBuilderPage = lazy(() => import("./pages/EmailBuilderPage").then((m) => ({ default: m.EmailBuilderPage })));
const PublicForm = lazy(() => import("./pages/PublicForm").then((m) => ({ default: m.PublicForm })));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard").then((m) => ({ default: m.AdminDashboard })));
const AdminAccounts = lazy(() => import("./pages/admin/AdminAccounts").then((m) => ({ default: m.AdminAccounts })));
const AdminAccountDetail = lazy(() => import("./pages/admin/AdminAccountDetail").then((m) => ({ default: m.AdminAccountDetail })));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers").then((m) => ({ default: m.AdminUsers })));
const AdminBilling = lazy(() => import("./pages/admin/AdminBilling").then((m) => ({ default: m.AdminBilling })));
const AdminProviders = lazy(() => import("./pages/admin/AdminProviders").then((m) => ({ default: m.AdminProviders })));
const PrivacyPolicy = lazy(() => import("./pages/legal/PrivacyPolicy").then((m) => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazy(() => import("./pages/legal/TermsOfService").then((m) => ({ default: m.TermsOfService })));
const DataDeletion = lazy(() => import("./pages/legal/DataDeletion").then((m) => ({ default: m.DataDeletion })));
const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const Pending = lazy(() => import("./pages/Pending").then((m) => ({ default: m.Pending })));
const SetupPassword = lazy(() => import("./pages/SetupPassword").then((m) => ({ default: m.SetupPassword })));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword").then((m) => ({ default: m.ForgotPassword })));

function ProtectedAppLayout() {
  const { user } = useAuth();
  const slug = window.location.pathname.split('/')[1];

  if (user && slug) {
    const hasAccess = user.tenantRoles.some((tr) => tr.tenant.slug === slug);
    if (!hasAccess) {
      // Redirect to first available tenant or /pending
      if (user.tenantRoles.length > 0) {
        return <Navigate to={`/${user.tenantRoles[0].tenant.slug}`} replace />;
      }
      return <Navigate to="/pending" replace />;
    }
  }

  return (
    <ProtectedRoute>
      <AppLayout />
    </ProtectedRoute>
  );
}

function ProtectedAdminLayout() {
  const { user } = useAuth();
  if (user && !user.isSuperAdmin) {
    return <Navigate to="/login" replace />;
  }
  return (
    <ProtectedRoute>
      <AdminLayout />
    </ProtectedRoute>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position="bottom-right" richColors closeButton />
      <AuthProvider>
        <PendingInvites />
        <Suspense fallback={<AppLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/pending" element={<Pending />} />
            <Route path="/setup-password" element={<SetupPassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/f/:formSlug" element={<PublicForm />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/data-deletion" element={<DataDeletion />} />
            <Route path="/api-reference" element={<ApiReference />} />

            {/* Redirect root to login */}
            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* Admin routes */}
            <Route element={<ProtectedAdminLayout />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/accounts" element={<AdminAccounts />} />
              <Route path="/admin/accounts/:tenantId" element={<AdminAccountDetail />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/billing" element={<AdminBilling />} />
              <Route path="/admin/providers" element={<AdminProviders />} />
            </Route>

            {/* Email builder — fullscreen, fuera del layout */}
            <Route path="/:slug/email-builder/:inboxId/:templateId" element={<ProtectedRoute><EmailBuilderPage /></ProtectedRoute>} />

            {/* Tenant app routes */}
            <Route element={<ProtectedAppLayout />}>
              <Route path="/:slug" element={<Dashboard />} />
              <Route path="/:slug/clients/import" element={<Import />} />
              <Route path="/:slug/clients" element={<Clients />} />
              <Route path="/:slug/clients/schema" element={<ClientSchema />} />
              <Route path="/:slug/clients/deleted" element={<DeletedContacts />} />
              <Route path="/:slug/clients/:id" element={<ClientDetail />} />
              <Route path="/:slug/campaigns" element={<Campaigns />} />
              <Route path="/:slug/campaigns/:id" element={<CampaignDetail />} />
              <Route path="/:slug/comunicaciones" element={<ComunicacionesLayout />}>
                <Route index element={<Navigate to="conversaciones" replace />} />
                <Route path="conversaciones" element={<Conversaciones />} />
                <Route path="conversaciones/:conversationId" element={<Conversaciones />} />
                <Route path="etiquetas" element={<Etiquetas />} />
                <Route path="campanas" element={<Campanas />}>
                  <Route index element={<CampanaEmpty />} />
                  <Route path=":campaignId" element={<CampanaDetail />} />
                </Route>
                <Route path="canales" element={<Canales />}>
                  <Route index element={<CanalEmpty />} />
                  <Route path=":inboxId" element={<CanalDetail />} />
                </Route>
                <Route path="plantillas" element={<Plantillas />}>
                  <Route index element={<PlantillaEmpty />} />
                  <Route path=":templateId" element={<PlantillaDetail />} />
                </Route>
                <Route path="bots" element={<Bots />}>
                  <Route index element={<BotEmpty />} />
                  <Route path=":botId" element={<BotDetail />} />
                  <Route path=":botId/config" element={<BotConfig />} />
                </Route>
              </Route>
              <Route path="/:slug/inboxes" element={<Inboxes />} />
              <Route path="/:slug/inboxes/new" element={<NewInbox />} />
              <Route path="/:slug/inboxes/:id/settings" element={<InboxSettings />} />
              <Route path="/:slug/forms/:id" element={<FormBuilder />} />
              <Route path="/:slug/chat-widget/:inboxId" element={<ChatWidgetBuilder />} />
              <Route path="/:slug/settings" element={<Settings />} />
              <Route path="/:slug/team" element={<Team />} />
              <Route path="/:slug/profile" element={<Profile />} />
              <Route path="/:slug/integraciones" element={<Integraciones />} />
              <Route path="/:slug/integraciones/webhooks" element={<Webhooks />} />
              <Route path="/:slug/integraciones/woocommerce" element={<WooCommerceIntegration />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
