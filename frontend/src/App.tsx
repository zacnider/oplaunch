import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import HomePage from './pages/HomePage';
import LaunchPage from './pages/LaunchPage';
import CreateTokenPage from './pages/CreateTokenPage';
import TokenDetailPage from './pages/TokenDetailPage';
import SwapPage from './pages/SwapPage';
import StakingPage from './pages/StakingPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/launch" element={<LaunchPage />} />
        <Route path="/create" element={<CreateTokenPage />} />
        <Route path="/token/:tokenId" element={<TokenDetailPage />} />
        <Route path="/swap" element={<SwapPage />} />
        <Route path="/staking" element={<StakingPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
