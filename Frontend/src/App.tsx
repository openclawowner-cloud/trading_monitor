import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './app/AppShell';
import { HomePage } from './pages/HomePage';
import { WooBotsPage } from './woox/WooBotsPage';
import { WooRealPage } from './woo-real/WooRealPage';
import { BybitPage } from './bybit/BybitPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/woox" element={<WooBotsPage />} />
        <Route path="/woo-real" element={<WooRealPage />} />
        <Route path="/bybit" element={<BybitPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
