import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PendingInvites } from "./components/PendingInvites";
import { AppLayout } from "./components/layout/AppLayout";
import { AdminLayout } from "./components/layout/AdminLayout";
import { Dashboard } from "./pages/Dashboard";
import { Import } from "./pages/Import";
import { Clients } from "./pages/Clients";
import { ClientSchema } from "./pages/ClientSchema";
import { Campaigns } from "./pages/Campaigns";
import { CampaignDetail } from "./pages/CampaignDetail";
import { Settings } from "./pages/Settings";
import { Integraciones } from "./pages/Integraciones";
import { ComunicacionesLayout } from "./pages/comunicaciones/ComunicacionesLayout";
import { Conversaciones } from "./pages/comunicaciones/Conversaciones";
import { Agentes } from "./pages/comunicaciones/Agentes";
import { Equipos } from "./pages/comunicaciones/Equipos";
import { Etiquetas } from "./pages/comunicaciones/Etiquetas";
import { Campanas } from "./pages/comunicaciones/Campanas";
import { CampanaEmpty } from "./pages/comunicaciones/CampanaEmpty";
import { CampanaDetail } from "./pages/comunicaciones/CampanaDetail";
import { Canales } from "./pages/comunicaciones/Canales";
import { CanalEmpty } from "./pages/comunicaciones/CanalEmpty";
import { CanalDetail } from "./pages/comunicaciones/CanalDetail";
import { NewInbox } from "./pages/NewInbox";
import { Inboxes } from "./pages/Inboxes";
import { InboxSettings } from "./pages/InboxSettings";
import { FormBuilder } from "./pages/FormBuilder";
import { PublicForm } from "./pages/PublicForm";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminAccounts } from "./pages/admin/AdminAccounts";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { AdminBilling } from "./pages/admin/AdminBilling";
import { AdminProviders } from "./pages/admin/AdminProviders";
import { PrivacyPolicy } from "./pages/legal/PrivacyPolicy";
import { TermsOfService } from "./pages/legal/TermsOfService";
import { DataDeletion } from "./pages/legal/DataDeletion";
import { Login } from "./pages/Login";
import { Pending } from "./pages/Pending";
import { SetupPassword } from "./pages/SetupPassword";
import { ForgotPassword } from "./pages/ForgotPassword";

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
      <AuthProvider>
        <PendingInvites />
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

          {/* Redirect root to login */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Admin routes */}
          <Route element={<ProtectedAdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/accounts" element={<AdminAccounts />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/billing" element={<AdminBilling />} />
            <Route path="/admin/providers" element={<AdminProviders />} />
          </Route>

          {/* Tenant app routes */}
          <Route element={<ProtectedAppLayout />}>
            <Route path="/:slug" element={<Dashboard />} />
            <Route path="/:slug/clients/import" element={<Import />} />
            <Route path="/:slug/clients" element={<Clients />} />
            <Route path="/:slug/clients/schema" element={<ClientSchema />} />
            <Route path="/:slug/campaigns" element={<Campaigns />} />
            <Route path="/:slug/campaigns/:id" element={<CampaignDetail />} />
            <Route path="/:slug/comunicaciones" element={<ComunicacionesLayout />}>
              <Route index element={<Navigate to="conversaciones" replace />} />
              <Route path="conversaciones" element={<Conversaciones />} />
              <Route path="conversaciones/:conversationId" element={<Conversaciones />} />
              <Route path="agentes" element={<Agentes />} />
              <Route path="equipos" element={<Equipos />} />
              <Route path="etiquetas" element={<Etiquetas />} />
              <Route path="campanas" element={<Campanas />}>
                <Route index element={<CampanaEmpty />} />
                <Route path=":campaignId" element={<CampanaDetail />} />
              </Route>
              <Route path="canales" element={<Canales />}>
                <Route index element={<CanalEmpty />} />
                <Route path=":inboxId" element={<CanalDetail />} />
              </Route>
            </Route>
            <Route path="/:slug/inboxes" element={<Inboxes />} />
            <Route path="/:slug/inboxes/new" element={<NewInbox />} />
            <Route path="/:slug/inboxes/:id/settings" element={<InboxSettings />} />
            <Route path="/:slug/forms/:id" element={<FormBuilder />} />
            <Route path="/:slug/settings" element={<Settings />} />
            <Route path="/:slug/integraciones" element={<Integraciones />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
