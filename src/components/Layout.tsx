import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useStore, STEPS } from '@/store/useStore';
import { cn, generateMergedSkuName } from '@/lib/utils';
import { AlertTriangle, X, History } from 'lucide-react';
import { useState } from 'react';
import ProgressOverlay from './ProgressOverlay';
import HistoryPanel from './HistoryPanel';

export default function Layout() {
  const location = useLocation();
  const { productInfo, stepStatuses, error, setError, listingMode, multiProductInfos } = useStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const currentIndex = STEPS.findIndex((s) => s.path === location.pathname);

  const isMulti = listingMode !== 'single' && multiProductInfos.length > 1;
  const displayCode = isMulti
    ? generateMergedSkuName(multiProductInfos.map(p => p.productCode).filter(c => c.trim()))
    : productInfo.productCode;

  return (
    <div className="min-h-screen bg-bone">
      {/* ===== 顶部标题栏 ===== */}
      <header className="sticky top-0 z-50 border-b-2 border-ink-900 bg-ink-900 text-bone">
        <div className="flex items-center justify-between px-4 py-2.5 md:px-6">
          <div className="flex items-center gap-3">
            <button
              className="border-2 border-bone/30 p-1.5 hover:border-flame md:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <div className="space-y-1">
                <div className="h-0.5 w-4 bg-bone" />
                <div className="h-0.5 w-4 bg-bone" />
                <div className="h-0.5 w-4 bg-bone" />
              </div>
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center border-2 border-flame bg-flame font-mono text-xs font-bold text-white">
                IF
              </div>
              <div className="hidden sm:block">
                <div className="font-mono text-sm font-bold tracking-industrial">
                  LISTING FORGE
                </div>
                <div className="font-sans text-[10px] text-bone/60">
                  刊登资料工作台
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* 历史记录按钮 */}
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-1.5 border-2 border-bone/30 px-2.5 py-1 font-mono text-[10px] uppercase tracking-industrial text-bone/70 hover:border-flame hover:text-flame"
              title="查看历史记录"
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">历史</span>
            </button>

            <div className="hidden text-right md:block">
              <div className="font-mono text-[10px] uppercase tracking-industrial text-bone/50">
                商品编号 / PRODUCT
              </div>
              <div className="font-mono text-xs font-bold text-bone">
                {displayCode || '—'}
              </div>
            </div>
            <div className="h-8 w-px bg-bone/20" />
            <div className="hidden text-right md:block">
              <div className="font-mono text-[10px] uppercase tracking-industrial text-bone/50">
                款式编号 / STYLE
              </div>
              <div className="font-mono text-xs font-bold text-bone">
                {productInfo.styleCode || '—'}
              </div>
            </div>
            {listingMode !== 'single' && (
              <div className={cn(
                'border px-2 py-0.5 font-mono text-[10px] font-bold',
                listingMode === 'multiA'
                  ? 'border-flame/50 text-flame'
                  : 'border-steel/50 text-steel'
              )}>
                {listingMode === 'multiA' ? '多SKU·同款' : '多SKU·通用'}
              </div>
            )}
            <div className="border border-bone/30 px-2 py-0.5 font-mono text-[10px] text-bone/70">
              v3.0
            </div>
          </div>
        </div>

        {/* 步骤指示器 - 横向 */}
        <nav className="flex overflow-x-auto border-t border-bone/10 bg-ink-800 scrollbar-thin">
          {STEPS.map((step, i) => {
            const status = stepStatuses[step.id];
            const isActive = i === currentIndex;
            return (
              <NavLink
                key={step.id}
                to={step.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'group flex min-w-[100px] flex-1 items-center gap-2 border-r border-bone/10 px-3 py-2 transition-colors',
                  isActive
                    ? 'bg-flame text-white'
                    : status === 'done'
                    ? 'bg-ink-700 text-bone hover:bg-ink-600'
                    : 'text-bone/50 hover:bg-ink-700 hover:text-bone'
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center border font-mono text-[10px] font-bold',
                    isActive
                      ? 'border-white'
                      : status === 'done'
                      ? 'border-bone/40'
                      : 'border-bone/20'
                  )}
                >
                  {status === 'done' ? '✓' : String(i).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-sans text-xs font-medium">
                    {step.label}
                  </div>
                  <div className="truncate font-mono text-[9px] tracking-industrial opacity-60">
                    {step.labelEn}
                  </div>
                </div>
              </NavLink>
            );
          })}
        </nav>
      </header>

      {/* ===== 错误提示 ===== */}
      {error && (
        <div className="flex items-center gap-3 border-b-2 border-rust bg-rust/10 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rust" />
          <span className="flex-1 text-sm text-rust">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-rust hover:opacity-70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ===== 主内容区 ===== */}
      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-6 md:py-8">
        <Outlet />
      </main>

      {/* ===== 底部 ===== */}
      <footer className="border-t-2 border-ink-900 bg-ink-900 px-6 py-3 text-center">
        <span className="font-mono text-[10px] uppercase tracking-industrial text-bone/40">
          LISTING FORGE · BROWSER-NATIVE · {new Date().getFullYear()}
        </span>
      </footer>

      {/* ===== 全局组件 ===== */}
      <ProgressOverlay />
      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
