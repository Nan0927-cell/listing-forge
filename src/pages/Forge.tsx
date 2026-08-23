import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { resizeTo800, resizeTo750 } from '@/lib/imageProcessor';
import { writeFileToDir, createDirectory, renameDirectory } from '@/lib/fileSystem';
import type { ProcessResult } from '@/types';
import { cn, generateMergedSkuName } from '@/lib/utils';
import {
  ChevronRight, Loader2, CheckCircle2, Circle, Play,
  Image as ImageIcon, Crop, FolderInput, Video, FileBox,
} from 'lucide-react';

interface Step {
  id: string;
  label: string;
  labelEn: string;
  icon: React.ReactNode;
  status: 'pending' | 'processing' | 'done' | 'error';
  detail?: string;
}

export default function Forge() {
  const navigate = useNavigate();
  const {
    scanResult, classifiedImages, pairs1688, productInfo,
    inputDirHandle, processResult, setProcessResult,
    setStepStatus, setError,
    showProgress, updateProgress, hideProgress,
    listingMode, multiProductInfos,
  } = useStore();

  // 多SKU合并编码
  const isMulti = listingMode !== 'single' && multiProductInfos.length > 1;
  const mergedCode = isMulti
    ? generateMergedSkuName(multiProductInfos.map(p => p.productCode).filter(c => c.trim()))
    : productInfo.productCode;

  const [steps, setSteps] = useState<Step[]>([
    { id: 'rename', label: '重命名1200图片', labelEn: 'RENAME 1200', icon: <ImageIcon className="h-4 w-4" />, status: 'pending' },
    { id: 'resize800', label: '生成800x800方图', labelEn: 'RESIZE 800', icon: <Crop className="h-4 w-4" />, status: 'pending' },
    { id: 'resize750', label: '生成750x757图', labelEn: 'RESIZE 750', icon: <Crop className="h-4 w-4" />, status: 'pending' },
    { id: 'pair1688', label: '处理1688配对(SKU分组)', labelEn: 'PAIR 1688', icon: <FolderInput className="h-4 w-4" />, status: 'pending' },
    { id: 'video', label: '创建视频文件夹', labelEn: 'VIDEO', icon: <Video className="h-4 w-4" />, status: 'pending' },
    { id: 'ozon', label: '重命名OZON文件夹', labelEn: 'OZON', icon: <FileBox className="h-4 w-4" />, status: 'pending' },
  ]);
  const [processing, setProcessing] = useState(false);
  const [allDone, setAllDone] = useState(false);

  if (!scanResult) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-ink-400">请先完成前面的步骤</p>
        <button onClick={() => navigate('/')} className="btn-outline mt-4">返回工作台</button>
      </div>
    );
  }

  const updateStep = (id: string, status: Step['status'], detail?: string) => {
    setSteps((prev) => prev.map((s) => s.id === id ? { ...s, status, detail } : s));
  };

  const handleProcess = async () => {
    setProcessing(true);
    setError(null);

    const totalItems = classifiedImages.length * 2 + pairs1688.length * 2 + 2;
    showProgress('处理图片中...', totalItems);
    let progressCount = 0;

    const result: ProcessResult = {
      folder1200Renamed: [],
      folder800: [],
      folder750: [],
      folder1688Renamed: mergedCode,
      videoFolderName: `${mergedCode}视频`,
      ozonRenamed: null,
      attributeImages: [],
    };

    try {
      // 1. 重命名1200图片
      updateStep('rename', 'processing');
      for (const img of classifiedImages) {
        updateProgress(progressCount, `重命名: ${img.file.name}`);
        result.folder1200Renamed.push({
          original: img.file.name,
          newName: img.newName,
        });
        if (img.category === 'attribute') {
          result.attributeImages.push(img.newName);
        }
      }
      updateStep('rename', 'done', `${classifiedImages.length} 张图片`);

      // 2. 生成800x800
      updateStep('resize800', 'processing');
      for (const img of classifiedImages) {
        progressCount++;
        updateProgress(progressCount, `生成800: ${img.newName}`);
        const blob = await resizeTo800(img.file.file);
        result.folder800.push({ name: img.newName, blob });
      }
      updateStep('resize800', 'done', `${result.folder800.length} 张`);

      // 3. 生成750x757
      updateStep('resize750', 'processing');
      for (const img of classifiedImages) {
        progressCount++;
        updateProgress(progressCount, `生成750: ${img.newName}`);
        const blob = await resizeTo750(img.file.file);
        result.folder750.push({ name: img.newName, blob });
      }
      updateStep('resize750', 'done', `${result.folder750.length} 张`);

      // 4. 处理1688配对（按SKU分组，配对图在导出时直接从pairs1688读取）
      updateStep('pair1688', 'processing');
      for (const pair of pairs1688) {
        progressCount++;
        updateProgress(progressCount, `确认1688配对: ${pair.groupName}`);
      }
      updateStep('pair1688', 'done', `${pairs1688.length} 组SKU配对`);

      // 5. 视频文件夹
      updateStep('video', 'processing');
      progressCount++;
      updateProgress(progressCount, '创建视频文件夹');
      if (scanResult.videos.length > 0) {
        updateStep('video', 'done', `${scanResult.videos.length} 个视频`);
      } else {
        updateStep('video', 'done', '无视频文件');
      }

      // 6. OZON文件夹
      updateStep('ozon', 'processing');
      progressCount++;
      updateProgress(progressCount, '重命名OZON文件夹');
      if (scanResult.ozonFiles.length > 0) {
        result.ozonRenamed = '900 1200';
        updateStep('ozon', 'done', '重命名为 900 1200');
      } else {
        updateStep('ozon', 'done', '无OZON文件夹');
      }

      setProcessResult(result);
      setAllDone(true);
      setStepStatus('forge', 'done');
      setStepStatus('tables', 'active');
    } catch (e: any) {
      setError(`处理失败: ${e.message}`);
      updateStep('rename', 'error', e.message);
    } finally {
      setProcessing(false);
      hideProgress();
    }
  };

  const handleProceed = () => {
    navigate('/tables');
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="section-tag mb-2">04 · FORGE</div>
        <h1 className="text-3xl font-bold tracking-tightest">执行处理</h1>
        <p className="mt-1 text-sm text-ink-500">
          自动执行图片重命名、尺寸转换、1688配对、视频与OZON文件夹处理。
        </p>
      </div>

      {/* 处理流水线 */}
      <section className="card-industrial p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="section-tag">PIPELINE</span>
            <h2 className="text-lg font-bold">处理流水线</h2>
          </div>
          {!allDone && (
            <button
              onClick={handleProcess}
              disabled={processing}
              className="btn-flame"
            >
              {processing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> 处理中...</>
              ) : (
                <><Play className="h-4 w-4" /> 开始处理</>
              )}
            </button>
          )}
        </div>

        <div className="space-y-2">
          {steps.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                'flex items-center gap-4 border-2 p-3 transition-colors',
                step.status === 'done' ? 'border-green-600 bg-green-50' :
                step.status === 'processing' ? 'border-flame bg-flame/5' :
                step.status === 'error' ? 'border-rust bg-rust/5' :
                'border-ink-300'
              )}
            >
              {/* 状态图标 */}
              <div className="shrink-0">
                {step.status === 'done' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : step.status === 'processing' ? (
                  <Loader2 className="h-5 w-5 animate-spin text-flame" />
                ) : step.status === 'error' ? (
                  <Circle className="h-5 w-5 text-rust" />
                ) : (
                  <Circle className="h-5 w-5 text-ink-300" />
                )}
              </div>

              {/* 步骤号 */}
              <span className="font-mono text-xs font-bold text-ink-400">
                {String(i + 1).padStart(2, '0')}
              </span>

              {/* 图标和标签 */}
              <div className="flex items-center gap-2">
                {step.icon}
                <div>
                  <div className="text-sm font-bold">{step.label}</div>
                  <div className="font-mono text-[10px] uppercase tracking-industrial text-ink-400">
                    {step.labelEn}
                  </div>
                </div>
              </div>

              {/* 详情 */}
              <div className="ml-auto text-sm text-ink-500">
                {step.detail || (step.status === 'pending' ? '等待处理' : '')}
              </div>
            </div>
          ))}
        </div>

        {allDone && (
          <div className="mt-4 flex items-center gap-2 border-2 border-green-600 bg-green-50 p-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-bold text-green-700">所有处理已完成！</span>
          </div>
        )}
      </section>

      {/* 处理结果概览 */}
      {processResult && (
        <section className="card-industrial p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="section-tag">RESULT</span>
            <h2 className="text-lg font-bold">处理结果</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <ResultItem label="1200 重命名" value={`${processResult.folder1200Renamed.length} 张`} />
            <ResultItem label="800 文件夹" value={`${processResult.folder800.length} 张`} />
            <ResultItem label="750 文件夹" value={`${processResult.folder750.length} 张`} />
            <ResultItem label="1688 文件夹" value={processResult.folder1688Renamed} />
            <ResultItem label="视频文件夹" value={processResult.videoFolderName} />
            <ResultItem label="OZON 文件夹" value={processResult.ozonRenamed || '无'} />
          </div>
        </section>
      )}

      {/* 导航 */}
      <div className="flex justify-between">
        <button onClick={() => navigate('/pair')} className="btn-outline">
          返回配对
        </button>
        <button
          onClick={handleProceed}
          disabled={!allDone}
          className="btn-industrial"
        >
          继续到表格填写 <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-ink-300 p-2">
      <div className="font-mono text-[10px] uppercase tracking-industrial text-ink-400">{label}</div>
      <div className="mt-1 font-mono text-sm font-bold text-ink-900">{value}</div>
    </div>
  );
}
