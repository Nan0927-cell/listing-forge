import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Layout from './components/Layout';
import Station from './pages/Station';
import Classify from './pages/Classify';
import Pair from './pages/Pair';
import Forge from './pages/Forge';

// 延迟加载使用ExcelJS的页面，减小初始包体积
const Tables = lazy(() => import('./pages/Tables'));
const ExportPage = lazy(() => import('./pages/Export'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="border-2 border-ink-900 bg-white p-6 shadow-industrial-sm">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin border-2 border-ink-900 border-t-transparent" />
          <span className="font-mono text-sm font-bold uppercase tracking-industrial">LOADING...</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Station />} />
        <Route path="/classify" element={<Classify />} />
        <Route path="/pair" element={<Pair />} />
        <Route path="/forge" element={<Forge />} />
        <Route
          path="/tables"
          element={
            <Suspense fallback={<PageLoader />}>
              <Tables />
            </Suspense>
          }
        />
        <Route
          path="/export"
          element={
            <Suspense fallback={<PageLoader />}>
              <ExportPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
