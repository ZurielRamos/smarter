import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/layout/AppLayout";
import { AdminLayout } from "./components/layout/AdminLayout";
import { Dashboard } from "./pages/Dashboard";
import { Import } from "./pages/Import";
import { Clients } from "./pages/Clients";
import { ClientSchema } from "./pages/ClientSchema";
import { Campaigns } from "./pages/Campaigns";
import { CampaignDetail } from "./pages/CampaignDetail";
import { Settings } from "./pages/Settings";
import { ComunicacionesLayout } from "./pages/comunicaciones/ComunicacionesLayout";
import { Conversaciones } from "./pages/comunicaciones/Conversaciones";
import { Agentes } from "./pages/comunicaciones/Agentes";
import { Equipos } from "./pages/comunicaciones/Equipos";
import { Etiquetas } from "./pages/comunicaciones/Etiquetas";
import { Campanas } from "./pages/comunicaciones/Campanas";
import { CampanaEmpty } from "./pages/comunicaciones/CampanaEmpty";
import { CampanaDetail } from "./pages/comunicaciones/CampanaDetail";
import { NewInbox } from "./pages/NewInbox";
import { Inboxes } from "./pages/Inboxes";
import { InboxSettings } from "./pages/InboxSettings";
import { FormBuilder } from "./pages/FormBuilder";
import { PublicForm } from "./pages/PublicForm";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminAccounts } from "./pages/admin/AdminAccounts";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { Login } from "./pages/Login";

function ProtectedAppLayout() {
  return (
    <ProtectedRoute>
      <AppLayout />
    </ProtectedRoute>
  );
}

function ProtectedAdminLayout() {
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
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/f/:formSlug" element={<PublicForm />} />

          {/* Redirect root to login */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Admin routes */}
          <Route element={<ProtectedAdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/accounts" element={<AdminAccounts />} />
            <Route path="/admin/users" element={<AdminUsers />} />
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
            </Route>
            <Route path="/:slug/inboxes" element={<Inboxes />} />
            <Route path="/:slug/inboxes/new" element={<NewInbox />} />
            <Route path="/:slug/inboxes/:id/settings" element={<InboxSettings />} />
            <Route path="/:slug/forms/:id" element={<FormBuilder />} />
            <Route path="/:slug/settings" element={<Settings />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
