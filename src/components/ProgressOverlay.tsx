import { useStore } from '@/store/useStore';
import { Loader2 } from 'lucide-react';

export default function ProgressOverlay() {
  const { progress } = useStore();

  if (!progress.visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="border-2 border-ink-900 bg-white p-6 shadow-industrial-sm w-[400px] max-w-[90vw]">
        {/* 标题 */}
        <div className="mb-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-flame" />
          <h3 className="font-mono text-sm font-bold uppercase tracking-industrial">
            {progress.title}
          </h3>
        </div>

        {/* 进度条 */}
        <div className="mb-2 h-3 w-full overflow-hidden border-2 border-ink-900 bg-bone">
          <div
            className="h-full bg-flame transition-all duration-300"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>

        {/* 百分比和详情 */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-ink-500">
            {progress.detail}
          </span>
          <span className="font-mono text-sm font-bold text-ink-900">
            {progress.percentage}%
          </span>
        </div>

        {/* 计数 */}
        {progress.total > 0 && (
          <div className="mt-1 font-mono text-[10px] text-ink-400">
            {progress.current} / {progress.total}
          </div>
        )}
      </div>
    </div>
  );
}
