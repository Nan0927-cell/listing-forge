import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { pickDirectory, scanDirectory, handleDropItems } from '@/lib/fileSystem';
import { isFileSystemAccessSupported, THEME_OPTIONS, cn } from '@/lib/utils';
import {
  FolderOpen, FolderPlus, Upload, ChevronRight, AlertCircle,
  Package, Ruler, Tag, Link2, Palette, FileText, Boxes, Scan,
} from 'lucide-react';

export default function Station() {
  const navigate = useNavigate();
  const {
    productInfo, setProductInfo,
    inputDirHandle, inputDirName, setInputDir,
    outputDirHandle, outputDirName, setOutputDir,
    setScanResult, setStepStatus, setError,
  } = useStore();

  const [scanning, setScanning] = useState(false);
  const [dragOver, setDragOver] = useState<'input' | 'output' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const requiredFilled =
    inputDirHandle &&
    outputDirHandle &&
    productInfo.productCode.trim() &&
    productInfo.styleCode.trim();

  // 选择输入文件夹
  const handlePickInput = async () => {
    try {
      const handle = await pickDirectory();
      if (handle) {
        setInputDir(handle, handle.name);
      }
    } catch (e: any) {
      setError(e.message || '选择文件夹失败');
    }
  };

  // 选择输出文件夹
  const handlePickOutput = async () => {
    try {
      const handle = await pickDirectory();
      if (handle) {
        setOutputDir(handle, handle.name);
      }
    } catch (e: any) {
      setError(e.message || '选择文件夹失败');
    }
  };

  // 拖放处理
  const handleDrop = useCallback(async (e: React.DragEvent, type: 'input' | 'output') => {
    e.preventDefault();
    setDragOver(null);
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      try {
        const result = await handleDropItems(items);
        if (result.dirHandle) {
          if (type === 'input') setInputDir(result.dirHandle, result.dirName);
          else setOutputDir(result.dirHandle, result.dirName);
        } else if (result.files.length > 0) {
          // 如果拖入的是文件，创建一个临时文件列表
          setError('请拖入文件夹而非单个文件');
        }
      } catch (err: any) {
        setError(err.message || '拖放处理失败');
      }
    }
  }, [setInputDir, setOutputDir, setError]);

  // 扫描并进入下一步
  const handleScanAndProceed = async () => {
    if (!requiredFilled) return;
    setScanning(true);
    setError(null);
    try {
      const result = await scanDirectory(inputDirHandle);
      setScanResult(result);
      setStepStatus('station', 'done');
      setStepStatus('classify', 'active');
      navigate('/classify');
    } catch (e: any) {
      setError(`扫描失败: ${e.message}`);
    } finally {
      setScanning(false);
    }
  };

  // 文件输入回退（不支持File System Access API时）
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const first = files[0];
      const path = (first as any).webkitRelativePath || first.name;
      const dirName = path.split('/')[0] || '未知文件夹';
      setInputDir(null, dirName);
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-end justify-between">
        <div>
          <div className="section-tag mb-2">01 · STATION</div>
          <h1 className="text-3xl font-bold tracking-tightest">工作台</h1>
          <p className="mt-1 text-sm text-ink-500">
            输入商品与款式编号，选择输入与输出文件夹，填写产品信息后开始处理流程。
          </p>
        </div>
      </div>

      {/* 浏览器兼容性警告 */}
      {!isFileSystemAccessSupported() && (
        <div className="flex items-start gap-3 border-2 border-flame bg-flame/5 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-flame" />
          <div className="text-sm">
            <span className="font-bold text-flame">浏览器不兼容</span>
            <span className="text-ink-700">
              {' '}— 当前浏览器不支持文件系统访问API，部分功能受限。请使用 Chrome 或 Edge 浏览器以获得完整体验。
            </span>
          </div>
        </div>
      )}

      {/* SECTION A: 编码输入 */}
      <section className="card-industrial p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="section-tag">SECTION_A</span>
          <h2 className="text-lg font-bold">编码输入</h2>
          <span className="font-mono text-[10px] uppercase tracking-industrial text-flame">REQUIRED</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* 产品线 */}
          <div>
            <label className="label-industrial mb-1.5">
              <Boxes className="h-3 w-3" /> 产品线 / PRODUCT LINE
            </label>
            <div className="flex gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setProductInfo({ productLine: n as 1 | 2 | 3 })}
                  className={cn(
                    'flex-1 border-2 py-2 font-mono text-sm font-bold transition-all',
                    productInfo.productLine === n
                      ? 'border-ink-900 bg-ink-900 text-bone'
                      : 'border-ink-300 bg-white text-ink-500 hover:border-ink-500'
                  )}
                >
                  线{n}
                </button>
              ))}
            </div>
          </div>

          {/* 商品编码 */}
          <div>
            <label className="label-industrial mb-1.5">
              <Tag className="h-3 w-3" /> 商品编码 / PRODUCT CODE
            </label>
            <input
              type="text"
              value={productInfo.productCode}
              onChange={(e) => setProductInfo({ productCode: e.target.value })}
              placeholder="XS0607-121"
              className="input-industrial"
            />
          </div>

          {/* 款式编码 */}
          <div>
            <label className="label-industrial mb-1.5">
              <Tag className="h-3 w-3" /> 款式编码 / STYLE CODE
            </label>
            <input
              type="text"
              value={productInfo.styleCode}
              onChange={(e) => setProductInfo({ styleCode: e.target.value })}
              placeholder="XS0607"
              className="input-industrial"
            />
          </div>
        </div>
      </section>

      {/* SECTION B: 文件夹选择 */}
      <section className="card-industrial p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="section-tag">SECTION_B</span>
          <h2 className="text-lg font-bold">文件夹选择</h2>
          <span className="font-mono text-[10px] uppercase tracking-industrial text-ink-400">FOLDERS</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* 输入文件夹 */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver('input'); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => handleDrop(e, 'input')}
            className={cn(
              'flex flex-col items-center justify-center border-2 border-dashed p-6 transition-colors',
              dragOver === 'input' ? 'border-flame bg-flame/5' : 'border-ink-300',
              inputDirHandle && 'border-ink-900 bg-ink-900/5'
            )}
          >
            <FolderOpen className={cn('h-8 w-8 mb-2', inputDirHandle ? 'text-ink-900' : 'text-ink-400')} />
            <div className="text-center">
              <div className="font-mono text-[10px] uppercase tracking-industrial text-ink-500">INPUT</div>
              <div className="mt-1 text-sm font-medium">
                {inputDirName || '点击选择或拖入文件夹'}
              </div>
              <div className="mt-1 text-[11px] text-ink-400">
                包含 1200 / 1688 / 视频文件
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={handlePickInput} className="btn-outline text-xs px-3 py-1.5">
                <FolderPlus className="h-3 w-3" /> 选择文件夹
              </button>
              {!isFileSystemAccessSupported() && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    {...({ webkitdirectory: '', directory: '' } as any)}
                    multiple
                    className="hidden"
                    onChange={handleFileInput}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-outline text-xs px-3 py-1.5"
                  >
                    <Upload className="h-3 w-3" /> 上传
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 输出文件夹 */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver('output'); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => handleDrop(e, 'output')}
            className={cn(
              'flex flex-col items-center justify-center border-2 border-dashed p-6 transition-colors',
              dragOver === 'output' ? 'border-flame bg-flame/5' : 'border-ink-300',
              outputDirHandle && 'border-ink-900 bg-ink-900/5'
            )}
          >
            <FolderOpen className={cn('h-8 w-8 mb-2', outputDirHandle ? 'text-ink-900' : 'text-ink-400')} />
            <div className="text-center">
              <div className="font-mono text-[10px] uppercase tracking-industrial text-ink-500">OUTPUT</div>
              <div className="mt-1 text-sm font-medium">
                {outputDirName || '点击选择或拖入文件夹'}
              </div>
              <div className="mt-1 text-[11px] text-ink-400">
                处理结果将导出到此位置
              </div>
            </div>
            <div className="mt-3">
              <button onClick={handlePickOutput} className="btn-outline text-xs px-3 py-1.5">
                <FolderPlus className="h-3 w-3" /> 选择文件夹
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION C: 产品信息 */}
      <section className="card-industrial p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="section-tag">SECTION_C</span>
          <h2 className="text-lg font-bold">产品信息</h2>
          <span className="font-mono text-[10px] uppercase tracking-industrial text-ink-400">PRODUCT DETAILS</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* 产品中文名 */}
          <Field label="产品中文名" icon={<Package className="h-3 w-3" />} optional>
            <input
              type="text"
              value={productInfo.productName}
              onChange={(e) => setProductInfo({ productName: e.target.value })}
              placeholder="如：桃皮绒枕套"
              className="input-industrial"
            />
          </Field>

          {/* 产品成本价 */}
          <Field label="产品成本价" icon={<Tag className="h-3 w-3" />} optional>
            <input
              type="number"
              value={productInfo.costPrice}
              onChange={(e) => setProductInfo({ costPrice: e.target.value })}
              placeholder="如：15.5"
              className="input-industrial"
            />
          </Field>

          {/* 商品重量 */}
          <Field label="商品重量 (g)" icon={<Ruler className="h-3 w-3" />} optional>
            <input
              type="number"
              value={productInfo.weight}
              onChange={(e) => setProductInfo({ weight: e.target.value })}
              placeholder="如：90"
              className="input-industrial"
            />
          </Field>

          {/* 包装尺寸 - 长 */}
          <Field label="包装尺寸 - 长 (cm)" icon={<Ruler className="h-3 w-3" />} optional>
            <input
              type="number"
              value={productInfo.packageLength}
              onChange={(e) => setProductInfo({ packageLength: e.target.value })}
              placeholder="如：30"
              className="input-industrial"
            />
          </Field>

          {/* 包装尺寸 - 宽 */}
          <Field label="包装尺寸 - 宽 (cm)" icon={<Ruler className="h-3 w-3" />} optional>
            <input
              type="number"
              value={productInfo.packageWidth}
              onChange={(e) => setProductInfo({ packageWidth: e.target.value })}
              placeholder="如：20"
              className="input-industrial"
            />
          </Field>

          {/* 包装尺寸 - 高 */}
          <Field label="包装尺寸 - 高 (cm)" icon={<Ruler className="h-3 w-3" />} optional>
            <input
              type="number"
              value={productInfo.packageHeight}
              onChange={(e) => setProductInfo({ packageHeight: e.target.value })}
              placeholder="如：5"
              className="input-industrial"
            />
          </Field>

          {/* 参考竞品标题 */}
          <Field label="参考竞品标题" icon={<FileText className="h-3 w-3" />} optional>
            <input
              type="text"
              value={productInfo.competitorTitle}
              onChange={(e) => setProductInfo({ competitorTitle: e.target.value })}
              placeholder="竞品标题"
              className="input-industrial"
            />
          </Field>

          {/* 关键词 */}
          <Field label="关键词" icon={<Tag className="h-3 w-3" />} optional>
            <input
              type="text"
              value={productInfo.keywords}
              onChange={(e) => setProductInfo({ keywords: e.target.value })}
              placeholder="如：Peach Skin Pillowcase"
              className="input-industrial"
            />
          </Field>

          {/* 相关链接 */}
          <Field label="相关链接" icon={<Link2 className="h-3 w-3" />} optional>
            <input
              type="text"
              value={productInfo.relatedLink}
              onChange={(e) => setProductInfo({ relatedLink: e.target.value })}
              placeholder="https://..."
              className="input-industrial"
            />
          </Field>

          {/* 商品材质 */}
          <Field label="商品材质" icon={<Package className="h-3 w-3" />} optional>
            <input
              type="text"
              value={productInfo.material}
              onChange={(e) => setProductInfo({ material: e.target.value })}
              placeholder="如：涤纶"
              className="input-industrial"
            />
          </Field>

          {/* 商品品类 */}
          <Field label="商品品类" icon={<Boxes className="h-3 w-3" />} optional>
            <input
              type="text"
              value={productInfo.category}
              onChange={(e) => setProductInfo({ category: e.target.value })}
              placeholder="如：保护罩"
              className="input-industrial"
            />
          </Field>

          {/* 主题 */}
          <Field label="主题" icon={<Tag className="h-3 w-3" />} optional>
            <input
              type="text"
              value={productInfo.theme}
              onChange={(e) => setProductInfo({ theme: e.target.value })}
              placeholder="选择或输入"
              className="input-industrial"
              list="theme-options"
            />
            <datalist id="theme-options">
              {THEME_OPTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>

          {/* 商品主要颜色 */}
          <Field label="商品主要颜色" icon={<Palette className="h-3 w-3" />} optional>
            <input
              type="text"
              value={productInfo.mainColor}
              onChange={(e) => setProductInfo({ mainColor: e.target.value })}
              placeholder="如：粉色"
              className="input-industrial"
            />
          </Field>

          {/* 商品英文属性 */}
          <Field label="商品英文属性" icon={<FileText className="h-3 w-3" />} optional wide>
            <input
              type="text"
              value={productInfo.englishAttribute}
              onChange={(e) => setProductInfo({ englishAttribute: e.target.value })}
              placeholder="如：1 PC Peach Skin Pillowcase"
              className="input-industrial"
            />
          </Field>
        </div>
      </section>

      {/* SECTION D: 扫描与继续 */}
      <section className="card-industrial p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="section-tag">SECTION_D</span>
          <h2 className="text-lg font-bold">扫描与继续</h2>
        </div>

        <div className="flex flex-col items-center gap-4 py-4">
          {!requiredFilled ? (
            <p className="text-sm text-ink-400">
              请完成上方所有必填项后再继续
            </p>
          ) : (
            <p className="text-sm text-ink-600">
              ✓ 所有必填项已完成，可以开始扫描
            </p>
          )}

          <button
            onClick={handleScanAndProceed}
            disabled={!requiredFilled || scanning}
            className="btn-flame px-8 py-3 text-base"
          >
            {scanning ? (
              <>
                <Scan className="h-4 w-4 animate-pulse" /> 扫描中...
              </>
            ) : (
              <>
                扫描并继续 <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

// ===== 辅助组件 =====
function Field({
  label,
  icon,
  optional,
  wide,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  optional?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(wide && 'md:col-span-2 lg:col-span-3')}>
      <label className="label-industrial mb-1.5">
        {icon} {label}
        {optional && (
          <span className="ml-1 font-normal normal-case text-ink-400">· 选填</span>
        )}
      </label>
      {children}
    </div>
  );
}
