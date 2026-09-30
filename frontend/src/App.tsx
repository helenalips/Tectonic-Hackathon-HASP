import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./lib/auth";
import { Loading } from "./components/States";
import { ToastProvider } from "./components/Toast";
import { ProfileDrawerProvider } from "./components/profile/ProfileDrawer";
import { AppShell } from "./pages/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ClientLayout } from "./pages/ClientLayout";
import { ClientRecordPage } from "./pages/ClientRecordPage";
import { NewEventPage } from "./pages/NewEventPage";
import { AskPage } from "./pages/AskPage";
import { SolutionPage } from "./pages/SolutionPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ChatPage } from "./pages/ChatPage";
import { InboxPage } from "./pages/InboxPage";
import { SlackPage } from "./pages/SlackPage";
import { GridPage } from "./pages/GridPage";
import { PeoplePage } from "./pages/people/PeoplePage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <main className="mx-auto max-w-content px-6">
        <Loading label="Checking your session" />
      </main>
    );
  }
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function Padded() {
  return (
    <div className="mx-auto max-w-content px-6 pb-16 pt-8">
      <Outlet />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ProfileDrawerProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<ChatPage />} />
              <Route path="inbox" element={<InboxPage />} />
              <Route path="slack" element={<SlackPage />} />
              <Route path="grid" element={<GridPage />} />
              <Route path="people" element={<PeoplePage />} />
              <Route element={<Padded />}>
                <Route path="clients" element={<DashboardPage />} />
                <Route path="clients/:clientId" element={<ClientLayout />}>
                  <Route index element={<ClientRecordPage />} />
                  <Route path="new-event" element={<NewEventPage />} />
                  <Route path="ask" element={<AskPage />} />
                  <Route path="solution" element={<SolutionPage />} />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </ProfileDrawerProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
