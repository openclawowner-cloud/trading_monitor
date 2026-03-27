import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './app/AppShell';
import { HomeOverviewPage } from './home/HomeOverviewPage';
import { BinancePage } from './binance/BinancePage';
import { WooBotsPage } from './woox/WooBotsPage';
import { WooRealPage } from './woo-real/WooRealPage';
import { BybitPage } from './bybit/BybitPage';
import { CryptoComPage } from './crypto-com/CryptoComPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomeOverviewPage />} />
        <Route path="/binance" element={<BinancePage />} />
        <Route path="/woox" element={<WooBotsPage />} />
        <Route path="/woo-real" element={<WooRealPage />} />
        <Route path="/bybit" element={<BybitPage />} />
        <Route path="/crypto-com" element={<CryptoComPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
