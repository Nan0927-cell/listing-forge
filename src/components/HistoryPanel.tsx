import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import {
  X, History, RotateCcw, Trash2, Clock, Package,
  CheckCircle2, AlertCircle, FileX,
} from 'lucide-react';
import type { ProductInfo } from '@/types';

interface HistoryPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function HistoryPanel({ open, onClose }: HistoryPanelProps) {
  const { history, removeHistory, clearHistory, setProductInfo } = useStore();

  const handleReuse = (info: ProductInfo) => {
    setProductInfo(info);
    onClose();
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - ts;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <>
      {/* 遮罩 */}
      {open && (
        <div
          className="fixed inset-0 z-[90] bg-black/40"
          onClick={onClose}
        />
      )}

      {/* 侧边面板 */}
      <div
        className={cn(
          'fixed right-0 top-0 z-[95] h-full w-[400px] max-w-[90vw] border-l-2 border-ink-900 bg-bone shadow-industrial-sm transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b-2 border-ink-900 bg-ink-900 px-4 py-3 text-bone">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="font-mono text-sm font-bold uppercase tracking-industrial">
              历史记录
            </span>
            <span className="font-mono text-xs text-bone/50">({history.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="font-mono text-[10px] uppercase tracking-industrial text-bone/50 hover:text-flame"
              >
                清空
              </button>
            )}
            <button onClick={onClose} className="text-bone/70 hover:text-flame">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 列表 */}
        <div className="h-[calc(100%-60px)] overflow-y-auto scrollbar-thin">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-ink-400">
              <FileX className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">暂无历史记录</p>
              <p className="mt-1 text-xs text-ink-300">
                完成处理后将自动保存记录
              </p>
            </div>
          ) : (
            <div className="space-y-2 p-3">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="border-2 border-ink-300 bg-white p-3 transition-colors hover:border-ink-900"
                >
                  {/* 状态和编码 */}
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {entry.status === 'completed' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : entry.status === 'partial' ? (
                        <AlertCircle className="h-4 w-4 text-flame" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-rust" />
                      )}
                      <span className="font-mono text-sm font-bold">
                        {entry.productInfo.productCode || '未命名'}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 font-mono text-[10px] text-ink-400">
                      <Clock className="h-3 w-3" />
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>

                  {/* 产品信息摘要 */}
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    <div className="text-ink-400">产品线</div>
                    <div className="font-mono text-ink-700">线{entry.productInfo.productLine}</div>

                    {entry.productInfo.productName && (
                      <>
                        <div className="text-ink-400">中文名</div>
                        <div className="truncate text-ink-700">{entry.productInfo.productName}</div>
                      </>
                    )}

                    {entry.productInfo.category && (
                      <>
                        <div className="text-ink-400">品类</div>
                        <div className="text-ink-700">{entry.productInfo.category}</div>
                      </>
                    )}
                  </div>

                  {/* 文件统计 */}
                  <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-ink-400">
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {entry.fileCount.folder1200 + entry.fileCount.folder1688} 图
                    </span>
                    {entry.fileCount.videos > 0 && (
                      <span>{entry.fileCount.videos} 视频</span>
                    )}
                    {entry.fileCount.ozonFiles > 0 && (
                      <span>{entry.fileCount.ozonFiles} OZON</span>
                    )}
                    {entry.fillTables && (
                      <span className="text-flame">含表格</span>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleReuse(entry.productInfo)}
                      className="flex flex-1 items-center justify-center gap-1 border-2 border-ink-900 py-1.5 font-mono text-[10px] font-bold uppercase tracking-industrial hover:bg-ink-900 hover:text-bone"
                    >
                      <RotateCcw className="h-3 w-3" /> 复用配置
                    </button>
                    <button
                      onClick={() => removeHistory(entry.id)}
                      className="border-2 border-ink-300 px-2 hover:border-rust hover:text-rust"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
