import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import Providers from '@/components/Providers';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SwapPage from '@/app/page';
import ActivityPage from '@/app/activity/page';
import ProfilePage from '@/app/profile/page';
import PoolsPage from '@/app/pools/page';
import CreatePoolPage from '@/app/pools/create/page';
import PoolDetailsPage from '@/app/pools/[id]/page';
import PositionDetailsPage from '@/app/positions/[id]/page';
import CreatePositionPage from '@/app/positions/create/[params]/page';

function AppContent() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="flex flex-col min-h-screen bg-[#060608] text-white relative selection:bg-primary/20 selection:text-primary overflow-x-hidden">
      {/* Ambient Lighting Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-primary/10 rounded-full blur-[140px] opacity-70" />
        <div className="absolute top-1/3 -left-40 w-[500px] h-[400px] bg-[#8B5CF6]/10 rounded-full blur-[140px] opacity-50" />
        <div className="absolute top-2/3 -right-40 w-[500px] h-[400px] bg-primary/8 rounded-full blur-[140px] opacity-50" />
      </div>

      <Navbar />
      <main className={`relative z-10 ${isHome ? 'shrink-0 h-screen min-h-[640px] pt-20 flex flex-col justify-center' : 'flex-1 pt-24'}`}>
        <div className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full ${isHome ? 'h-full flex flex-col justify-center py-4' : 'pb-16'}`}>
          <Routes>
            <Route path="/" element={<SwapPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/pools" element={<PoolsPage />} />
            <Route path="/pools/create" element={<CreatePoolPage />} />
            <Route path="/pools/:id" element={<PoolDetailsPage />} />
            <Route path="/positions/:id" element={<PositionDetailsPage />} />
            <Route path="/positions/create/:params" element={<CreatePositionPage />} />
          </Routes>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <Providers>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </Providers>
  );
}
