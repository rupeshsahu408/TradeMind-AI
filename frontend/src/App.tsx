import React from 'react';
import { Route, Switch, Redirect } from 'wouter';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import Stock from './pages/Stock';
import Briefing from './pages/Briefing';
import Watchlist from './pages/Watchlist';
import Sectors from './pages/Sectors';
import Macro from './pages/Macro';
import Accuracy from './pages/Accuracy';
import CalendarPage from './pages/CalendarPage';
import History from './pages/History';
import SettingsPage from './pages/Settings';

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/chat" component={Chat} />
        <Route path="/stock/:ticker?" component={Stock} />
        <Route path="/briefing" component={Briefing} />
        <Route path="/watchlist" component={Watchlist} />
        <Route path="/sectors" component={Sectors} />
        <Route path="/macro" component={Macro} />
        <Route path="/accuracy" component={Accuracy} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/history" component={History} />
        <Route path="/settings" component={SettingsPage} />
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}
