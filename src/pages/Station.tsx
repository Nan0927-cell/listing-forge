import { useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { pickDirectory, scanDirectory, handleDropItems } from '@/lib/fileSystem';
import { isFileSystemAccessSupported, THEME_OPTIONS, cn, generateMergedSkuName } from '@/lib/utils';
import type { ListingMode } from '@/types';
import {
  FolderOpen, FolderPlus, Upload, ChevronRight, AlertCircle,
  Package, Ruler, Tag, Link2, Palette, FileText, Boxes, Scan,
  RotateCcw, AlertTriangle, X, Plus, Trash2, Copy, Layers,
} from 'lucide-react';

export default function Station() {
  const navigate = useNavigate();
  const {
    listingMode, setListingMode,
    productInfo, setProductInfo,
    multiProductInfos, setMultiProductInfo, addMultiProductInfo, removeMultiProductInfo, copyFromPrevProductInfo,
    inputDirHandle, inputDirName, setInputDir,
    outputDirHandle, outputDirName, setOutputDir,
    setScanResult, setStepStatus, setError, resetAll,
  } = useStore();

  const [scanning, setScanning] = useState(false);
  const [dragOver, setDragOver] = useState<'input' | 'output' | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sectionCRef = useRef<HTMLElement>(null);

  const isMulti = listingMode !== 'single';

  const handleClearAll = () => {
    resetAll();
    setShowClearConfirm(false);
    setError(null);
  };

  // 同步多SKU共享字段到所有组
  const syncSharedField = (field: 'productLine' | 'styleCode', value: any) => {
    if (!isMulti) {
      setProductInfo({ [field]: value } as any);
      return;
    }
    multiProductInfos.forEach((_, i) => setMultiProductInfo(i, { [field]: value } as any));
  };

  // 获取共享字段值
  const sharedProductLine = isMulti ? multiProductInfos[0]?.productLine ?? 2 : productInfo.productLine;
  const sharedStyleCode = isMulti ? multiProductInfos[0]?.styleCode ?? '' : productInfo.styleCode;

  // 多SKU合并命名预览
  const mergedCodePreview = useMemo(() => {
    if (!isMulti) return productInfo.productCode;
    const codes = multiProductInfos.map(p => p.productCode).filter(c => c.trim());
    if (codes.length === 0) return '';
    return generateMergedSkuName(codes);
  }, [isMulti, multiProductInfos, productInfo.productCode]);

  const requiredFilled = isMulti
    ? inputDirHandle && outputDirHandle &&
      multiProductInfos.every(p => p.productCode.trim()) &&
      multiProductInfos[0]?.styleCode.trim()
    : inputDirHandle && outputDirHandle &&
      productInfo.productCode.trim() && productInfo.styleCode.trim();

  const handlePickInput = async () => {
    try {
      const handle = await pickDirectory();
      if (handle) setInputDir(handle, handle.name);
    } catch (e: any) {
      setError(e.message || '选择文件夹失败');
    }
  };

  const handlePickOutput = async () => {
    try {
      const handle = await pickDirectory();
      if (handle) setOutputDir(handle, handle.name);
    } catch (e: any) {
      setError(e.message || '选择文件夹失败');
    }
  };

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
          setError('请拖入文件夹而非单个文件');
        }
      } catch (err: any) {
        setError(err.message || '拖放处理失败');
      }
    }
  }, [setInputDir, setOutputDir, setError]);

  const handleScanAndProceed = async () => {
 if (!requiredFilled) return;
 setScanning(true);
 setError(null);
 try {
 if (isMulti) {
 const codes = multiProductInfos.map(p => p.productCode).filter(c => c.trim());
 const mergedName = generateMergedSkuName(codes);
 const first = multiProductInfos[0];
 setProductInfo({
 productLine: first.productLine,
 productCode: mergedName,
 styleCode: first.styleCode,
 productName: first.productName,
 costPrice: first.costPrice,
 weight: first.weight,
 packageLength: first.packageLength,
 packageWidth: first.packageWidth,
 packageHeight: first.packageHeight,
 competitorTitle: first.competitorTitle,
 keywords: first.keywords,
 relatedLink: first.relatedLink,
 material: first.material,
 category: first.category,
 theme: first.theme,
 mainColor: first.mainColor,
 englishAttribute: first.englishAttribute,
 });
 }
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

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const first = files[0];
      const path = (first as any).webkitRelativePath || first.name;
      const dirName = path.split('/')[0] || '未知文件夹';
      setInputDir(null, dirName);
    }
  };

  const handleFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const currentInput = e.target as HTMLInputElement;
    const section = sectionCRef.current;
    if (!section) return;
    const inputs = Array.from(section.querySelectorAll('input'));
    if (!inputs.includes(currentInput)) return;
    e.preventDefault();
    const curRect = currentInput.getBoundingClientRect();
    const curCx = curRect.left + curRect.width / 2;
    const curCy = curRect.top + curRect.height / 2;
    let bestInput: HTMLInputElement | null = null;
    let bestScore = Infinity;
    for (const inp of inputs) {
      if (inp === currentInput) continue;
      const r = inp.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cx - curCx;
      const dy = cy - curCy;
      let valid = false;
      let score = Infinity;
      switch (e.key) {
        case 'ArrowLeft':
          if (dx < -5) { valid = true; score = Math.abs(dy) * 3 + Math.abs(dx); }
          break;
        case 'ArrowRight':
          if (dx > 5) { valid = true; score = Math.abs(dy) * 3 + dx; }
          break;
        case 'ArrowUp':
          if (dy < -5) { valid = true; score = Math.abs(dx) * 3 + Math.abs(dy); }
          break;
        case 'ArrowDown':
          if (dy > 5) { valid = true; score = Math.abs(dx) * 3 + dy; }
          break;
      }
      if (valid && score < bestScore) { bestScore = score; bestInput = inp; }
    }
    if (bestInput) { bestInput.focus(); bestInput.select(); }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-end justify-between">
        <div>
          <div className="section-tag mb-2">01 · STATION</div>
          <h1 className="text-3xl font-bold tracking-tightest">工作台</h1>
          <p className="mt-1 text-sm text-ink-500">
            {isMulti
              ? '多SKU刊登模式：输入多组商品信息，选择文件夹后开始处理流程。'
              : '输入商品与款式编号，选择输入与输出文件夹，填写产品信息后开始处理流程。'}
          </p>
        </div>
        <button
          onClick={() => setShowClearConfirm(true)}
          className="btn-outline flex items-center gap-1.5 border-rust/40 text-rust hover:bg-rust hover:text-bone hover:border-rust px-4 py-2 text-sm"
        >
          <RotateCcw className="h-4 w-4" />
          一键清除
        </button>
      </div>

      {/* 清除确认弹窗 */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50" onClick={() => setShowClearConfirm(false)}>
          <div className="mx-4 w-full max-w-md border-2 border-ink-900 bg-bone p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rust" />
                <h3 className="text-lg font-bold">确认清除所有内容？</h3>
              </div>
              <button onClick={() => setShowClearConfirm(false)} className="text-ink-400 hover:text-ink-900"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-6 text-sm text-ink-600">此操作将清除以下所有数据，且不可恢复：</p>
            <ul className="mb-6 space-y-1 text-sm text-ink-500">
              <li>· 产品信息（编码、名称、价格、尺寸等）</li>
              <li>· 输入/输出文件夹选择</li>
              <li>· 图片扫描与分类结果</li>
              <li>· 1688配对数据</li>
              <li>· 处理结果与表格填写数据</li>
              <li>· 导出结构与步骤状态</li>
            </ul>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowClearConfirm(false)} className="btn-outline px-5 py-2 text-sm">取消</button>
              <button onClick={handleClearAll} className="bg-rust px-5 py-2 text-sm font-bold text-bone transition-colors hover:bg-rust/80">确认清除</button>
            </div>
          </div>
        </div>
      )}

      {/* 浏览器兼容性警告 */}
      {!isFileSystemAccessSupported() && (
        <div className="flex items-start gap-3 border-2 border-flame bg-flame/5 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-flame" />
          <div className="text-sm">
            <span className="font-bold text-flame">浏览器不兼容</span>
            <span className="text-ink-700"> — 当前浏览器不支持文件系统访问API，部分功能受限。请使用 Chrome 或 Edge 浏览器以获得完整体验。</span>
          </div>
        </div>
      )}

      {/* SECTION 0: 模式选择 */}
      <section className="card-industrial p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="section-tag">SECTION_0</span>
          <h2 className="text-lg font-bold">刊登模式</h2>
          <span className="font-mono text-[10px] uppercase tracking-industrial text-flame">REQUIRED</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {([
            { mode: 'single' as ListingMode, label: '单SKU刊登', desc: '单个商品编码的刊登流程', icon: <Package className="h-5 w-5" /> },
            { mode: 'multiA' as ListingMode, label: '多SKU · 同款不同数量', desc: '同款商品不同数量，合并命名', icon: <Boxes className="h-5 w-5" /> },
            { mode: 'multiB' as ListingMode, label: '多SKU · 普通多SKU', desc: '多组SKU分别处理后整合', icon: <Layers className="h-5 w-5" /> },
          ]).map(({ mode, label, desc, icon }) => (
            <button
              key={mode}
              onClick={() => setListingMode(mode)}
              className={cn(
                'border-2 p-4 text-left transition-all',
                listingMode === mode ? 'border-flame bg-flame/5 shadow-industrial-sm' : 'border-ink-300 hover:border-ink-500'
              )}
            >
              <div className={cn('mb-2', listingMode === mode ? 'text-flame' : 'text-ink-400')}>{icon}</div>
              <div className="font-bold text-sm">{label}</div>
              <div className="mt-1 text-xs text-ink-500">{desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* SECTION A: 编码输入 */}
      <section className="card-industrial p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="section-tag">SECTION_A</span>
          <h2 className="text-lg font-bold">编码输入</h2>
          <span className="font-mono text-[10px] uppercase tracking-industrial text-flame">REQUIRED</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="label-industrial mb-1.5"><Boxes className="h-3 w-3" /> 产品线 / PRODUCT LINE</label>
            <div className="flex gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => syncSharedField('productLine', n as 1 | 2 | 3)}
                  className={cn(
                    'flex-1 border-2 py-2 font-mono text-sm font-bold transition-all',
                    sharedProductLine === n ? 'border-ink-900 bg-ink-900 text-bone' : 'border-ink-300 bg-white text-ink-500 hover:border-ink-500'
                  )}
                >线{n}</button>
              ))}
            </div>
          </div>
          {!isMulti ? (
            <>
              <div>
                <label className="label-industrial mb-1.5"><Tag className="h-3 w-3" /> 商品编码 / PRODUCT CODE</label>
                <input type="text" value={productInfo.productCode} onChange={(e) => setProductInfo({ productCode: e.target.value })} placeholder="XS0607-121" className="input-industrial" />
              </div>
              <div>
                <label className="label-industrial mb-1.5"><Tag className="h-3 w-3" /> 款式编码 / STYLE CODE</label>
                <input type="text" value={productInfo.styleCode} onChange={(e) => setProductInfo({ styleCode: e.target.value })} placeholder="XS0607" className="input-industrial" />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label-industrial mb-1.5"><Tag className="h-3 w-3" /> 款式编码 / STYLE CODE</label>
                <input type="text" value={sharedStyleCode} onChange={(e) => syncSharedField('styleCode', e.target.value)} placeholder="XS0607" className="input-industrial" />
              </div>
              <div>
                <label className="label-industrial mb-1.5"><Boxes className="h-3 w-3" /> 合并编码预览 / MERGED CODE</label>
                <div className="border-2 border-flame bg-flame/5 px-3 py-2 font-mono text-sm font-bold text-flame">
                  {mergedCodePreview || '—'}
                </div>
              </div>
            </>
          )}
        </div>
        {isMulti && (
          <p className="mt-3 font-mono text-[11px] text-ink-500">
            ※ 多SKU模式下，款式编码为共享字段。合并编码将用于1688文件夹、视频文件夹及导出文件夹命名。
          </p>
        )}
      </section>

      {/* SECTION B: 文件夹选择 */}
      <section className="card-industrial p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="section-tag">SECTION_B</span>
          <h2 className="text-lg font-bold">文件夹选择</h2>
          <span className="font-mono text-[10px] uppercase tracking-industrial text-ink-400">FOLDERS</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              <div className="mt-1 text-sm font-medium">{inputDirName || '点击选择或拖入文件夹'}</div>
              <div className="mt-1 text-[11px] text-ink-400">包含 1200 / 1688 / 视频文件</div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={handlePickInput} className="btn-outline text-xs px-3 py-1.5"><FolderPlus className="h-3 w-3" /> 选择文件夹</button>
              {!isFileSystemAccessSupported() && (
                <>
                  <input ref={fileInputRef} type="file" {...({ webkitdirectory: '', directory: '' } as any)} multiple className="hidden" onChange={handleFileInput} />
                  <button onClick={() => fileInputRef.current?.click()} className="btn-outline text-xs px-3 py-1.5"><Upload className="h-3 w-3" /> 上传</button>
                </>
              )}
            </div>
          </div>
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
              <div className="mt-1 text-sm font-medium">{outputDirName || '点击选择或拖入文件夹'}</div>
              <div className="mt-1 text-[11px] text-ink-400">处理结果将导出到此位置</div>
            </div>
            <div className="mt-3">
              <button onClick={handlePickOutput} className="btn-outline text-xs px-3 py-1.5"><FolderPlus className="h-3 w-3" /> 选择文件夹</button>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION C: 产品信息 */}
      {!isMulti ? (
        <section ref={sectionCRef} className="card-industrial p-5" onKeyDown={handleFieldKeyDown}>
          <div className="mb-4 flex items-center gap-2">
            <span className="section-tag">SECTION_C</span>
            <h2 className="text-lg font-bold">产品信息</h2>
            <span className="font-mono text-[10px] uppercase tracking-industrial text-ink-400">PRODUCT DETAILS</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="产品中文名" icon={<Package className="h-3 w-3" />} optional>
              <input type="text" value={productInfo.productName} onChange={(e) => setProductInfo({ productName: e.target.value })} placeholder="如：桃皮绒枕套" className="input-industrial" />
            </Field>
            <Field label="产品成本价" icon={<Tag className="h-3 w-3" />} optional>
              <input type="number" value={productInfo.costPrice} onChange={(e) => setProductInfo({ costPrice: e.target.value })} placeholder="如：15.5" className="input-industrial" />
            </Field>
            <Field label="商品重量 (g)" icon={<Ruler className="h-3 w-3" />} optional>
              <input type="number" value={productInfo.weight} onChange={(e) => setProductInfo({ weight: e.target.value })} placeholder="如：90" className="input-industrial" />
            </Field>
            <Field label="包装尺寸 - 长 (cm)" icon={<Ruler className="h-3 w-3" />} optional>
              <input type="number" value={productInfo.packageLength} onChange={(e) => setProductInfo({ packageLength: e.target.value })} placeholder="如：30" className="input-industrial" />
            </Field>
            <Field label="包装尺寸 - 宽 (cm)" icon={<Ruler className="h-3 w-3" />} optional>
              <input type="number" value={productInfo.packageWidth} onChange={(e) => setProductInfo({ packageWidth: e.target.value })} placeholder="如：20" className="input-industrial" />
            </Field>
            <Field label="包装尺寸 - 高 (cm)" icon={<Ruler className="h-3 w-3" />} optional>
              <input type="number" value={productInfo.packageHeight} onChange={(e) => setProductInfo({ packageHeight: e.target.value })} placeholder="如：5" className="input-industrial" />
            </Field>
            <Field label="参考竞品标题" icon={<FileText className="h-3 w-3" />} optional>
              <input type="text" value={productInfo.competitorTitle} onChange={(e) => setProductInfo({ competitorTitle: e.target.value })} placeholder="竞品标题" className="input-industrial" />
            </Field>
            <Field label="关键词" icon={<Tag className="h-3 w-3" />} optional>
              <input type="text" value={productInfo.keywords} onChange={(e) => setProductInfo({ keywords: e.target.value })} placeholder="如：Peach Skin Pillowcase" className="input-industrial" />
            </Field>
            <Field label="相关链接" icon={<Link2 className="h-3 w-3" />} optional>
              <input type="text" value={productInfo.relatedLink} onChange={(e) => setProductInfo({ relatedLink: e.target.value })} placeholder="https://..." className="input-industrial" />
            </Field>
            <Field label="商品材质" icon={<Package className="h-3 w-3" />} optional>
              <input type="text" value={productInfo.material} onChange={(e) => setProductInfo({ material: e.target.value })} placeholder="如：涤纶" className="input-industrial" />
            </Field>
            <Field label="核心卖点" icon={<Boxes className="h-3 w-3" />} optional>
              <input type="text" value={productInfo.category} onChange={(e) => setProductInfo({ category: e.target.value })} placeholder="如：保护罩" className="input-industrial" />
            </Field>
            <Field label="主题" icon={<Tag className="h-3 w-3" />} optional>
              <input type="text" value={productInfo.theme} onChange={(e) => setProductInfo({ theme: e.target.value })} placeholder="选择或输入" className="input-industrial" list="theme-options" />
              <datalist id="theme-options">{THEME_OPTIONS.map((t) => <option key={t} value={t} />)}</datalist>
            </Field>
            <Field label="商品主要颜色" icon={<Palette className="h-3 w-3" />} optional>
              <input type="text" value={productInfo.mainColor} onChange={(e) => setProductInfo({ mainColor: e.target.value })} placeholder="如：粉色" className="input-industrial" />
            </Field>
            <Field label="商品英文属性" icon={<FileText className="h-3 w-3" />} optional wide>
              <input type="text" value={productInfo.englishAttribute} onChange={(e) => setProductInfo({ englishAttribute: e.target.value })} placeholder="如：1 PC Peach Skin Pillowcase" className="input-industrial" />
            </Field>
          </div>
        </section>
      ) : (
        <MultiSkuForm
          multiProductInfos={multiProductInfos}
          setMultiProductInfo={setMultiProductInfo}
          addMultiProductInfo={addMultiProductInfo}
          removeMultiProductInfo={removeMultiProductInfo}
          copyFromPrevProductInfo={copyFromPrevProductInfo}
          sectionCRef={sectionCRef}
          handleFieldKeyDown={handleFieldKeyDown}
        />
      )}

      {/* SECTION D: 扫描与继续 */}
      <section className="card-industrial p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="section-tag">SECTION_D</span>
          <h2 className="text-lg font-bold">扫描与继续</h2>
        </div>
        <div className="flex flex-col items-center gap-4 py-4">
          {!requiredFilled ? (
            <p className="text-sm text-ink-400">请完成上方所有必填项后再继续</p>
          ) : (
            <p className="text-sm text-ink-600">✓ 所有必填项已完成，可以开始扫描</p>
          )}
          <button onClick={handleScanAndProceed} disabled={!requiredFilled || scanning} className="btn-flame px-8 py-3 text-base">
            {scanning ? (<><Scan className="h-4 w-4 animate-pulse" /> 扫描中...</>) : (<>扫描并继续 <ChevronRight className="h-4 w-4" /></>)}
          </button>
        </div>
      </section>
    </div>
  );
}

// ===== 多SKU表单组件 =====
function MultiSkuForm({
  multiProductInfos,
  setMultiProductInfo,
  addMultiProductInfo,
  removeMultiProductInfo,
  copyFromPrevProductInfo,
  sectionCRef,
  handleFieldKeyDown,
}: {
  multiProductInfos: any[];
  setMultiProductInfo: (index: number, info: any) => void;
  addMultiProductInfo: () => void;
  removeMultiProductInfo: (index: number) => void;
  copyFromPrevProductInfo: (index: number) => void;
  sectionCRef: React.RefObject<HTMLElement>;
  handleFieldKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <section ref={sectionCRef} className="card-industrial p-5" onKeyDown={handleFieldKeyDown}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="section-tag">SECTION_C</span>
          <h2 className="text-lg font-bold">产品信息（多SKU）</h2>
          <span className="font-mono text-[10px] uppercase tracking-industrial text-ink-400">{multiProductInfos.length} 组</span>
        </div>
        <button onClick={addMultiProductInfo} className="btn-outline text-xs flex items-center gap-1">
          <Plus className="h-3 w-3" /> 添加SKU组
        </button>
      </div>

      <div className="space-y-6">
        {multiProductInfos.map((info, index) => (
          <div key={index} className="border-2 border-ink-300 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center border-2 border-ink-900 bg-ink-900 font-mono text-xs font-bold text-bone">
                  {index + 1}
                </span>
                <span className="font-bold text-sm">SKU {index + 1}</span>
                <span className="font-mono text-[10px] text-ink-400">{info.productCode || '未填写'}</span>
              </div>
              <div className="flex items-center gap-2">
                {index > 0 && (
                  <button
                    onClick={() => copyFromPrevProductInfo(index)}
                    className="flex items-center gap-1 border border-flame px-2 py-1 font-mono text-[10px] font-bold text-flame hover:bg-flame hover:text-white"
                  >
                    <Copy className="h-3 w-3" /> 同上
                  </button>
                )}
                {multiProductInfos.length > 1 && (
                  <button
                    onClick={() => removeMultiProductInfo(index)}
                    className="flex items-center gap-1 border border-rust/50 px-1.5 py-1 font-mono text-[10px] text-rust hover:border-rust hover:bg-rust hover:text-white"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="商品编码" icon={<Tag className="h-3 w-3" />} required>
                <input type="text" value={info.productCode} onChange={(e) => setMultiProductInfo(index, { productCode: e.target.value })} placeholder={`XS0607-12${index + 1}`} className="input-industrial" />
              </Field>
              <Field label="产品中文名" icon={<Package className="h-3 w-3" />} optional>
                <input type="text" value={info.productName} onChange={(e) => setMultiProductInfo(index, { productName: e.target.value })} placeholder="如：桃皮绒枕套" className="input-industrial" />
              </Field>
              <Field label="产品成本价" icon={<Tag className="h-3 w-3" />} optional>
                <input type="number" value={info.costPrice} onChange={(e) => setMultiProductInfo(index, { costPrice: e.target.value })} placeholder="如：15.5" className="input-industrial" />
              </Field>
              <Field label="商品重量 (g)" icon={<Ruler className="h-3 w-3" />} optional>
                <input type="number" value={info.weight} onChange={(e) => setMultiProductInfo(index, { weight: e.target.value })} placeholder="如：90" className="input-industrial" />
              </Field>
              <Field label="包装尺寸 - 长 (cm)" icon={<Ruler className="h-3 w-3" />} optional>
                <input type="number" value={info.packageLength} onChange={(e) => setMultiProductInfo(index, { packageLength: e.target.value })} placeholder="如：30" className="input-industrial" />
              </Field>
              <Field label="包装尺寸 - 宽 (cm)" icon={<Ruler className="h-3 w-3" />} optional>
                <input type="number" value={info.packageWidth} onChange={(e) => setMultiProductInfo(index, { packageWidth: e.target.value })} placeholder="如：20" className="input-industrial" />
              </Field>
              <Field label="包装尺寸 - 高 (cm)" icon={<Ruler className="h-3 w-3" />} optional>
                <input type="number" value={info.packageHeight} onChange={(e) => setMultiProductInfo(index, { packageHeight: e.target.value })} placeholder="如：5" className="input-industrial" />
              </Field>
              <Field label="参考竞品标题" icon={<FileText className="h-3 w-3" />} optional>
                <input type="text" value={info.competitorTitle} onChange={(e) => setMultiProductInfo(index, { competitorTitle: e.target.value })} placeholder="竞品标题" className="input-industrial" />
              </Field>
              <Field label="关键词" icon={<Tag className="h-3 w-3" />} optional>
                <input type="text" value={info.keywords} onChange={(e) => setMultiProductInfo(index, { keywords: e.target.value })} placeholder="如：Peach Skin Pillowcase" className="input-industrial" />
              </Field>
              <Field label="相关链接" icon={<Link2 className="h-3 w-3" />} optional>
                <input type="text" value={info.relatedLink} onChange={(e) => setMultiProductInfo(index, { relatedLink: e.target.value })} placeholder="https://..." className="input-industrial" />
              </Field>
              <Field label="商品材质" icon={<Package className="h-3 w-3" />} optional>
                <input type="text" value={info.material} onChange={(e) => setMultiProductInfo(index, { material: e.target.value })} placeholder="如：涤纶" className="input-industrial" />
              </Field>
              <Field label="核心卖点" icon={<Boxes className="h-3 w-3" />} optional>
                <input type="text" value={info.category} onChange={(e) => setMultiProductInfo(index, { category: e.target.value })} placeholder="如：保护罩" className="input-industrial" />
              </Field>
              <Field label="主题" icon={<Tag className="h-3 w-3" />} optional>
                <input type="text" value={info.theme} onChange={(e) => setMultiProductInfo(index, { theme: e.target.value })} placeholder="选择或输入" className="input-industrial" list={`theme-options-${index}`} />
                <datalist id={`theme-options-${index}`}>{THEME_OPTIONS.map((t) => <option key={t} value={t} />)}</datalist>
              </Field>
              <Field label="商品主要颜色" icon={<Palette className="h-3 w-3" />} optional>
                <input type="text" value={info.mainColor} onChange={(e) => setMultiProductInfo(index, { mainColor: e.target.value })} placeholder="如：粉色" className="input-industrial" />
              </Field>
              <Field label="商品英文属性" icon={<FileText className="h-3 w-3" />} optional wide>
                <input type="text" value={info.englishAttribute} onChange={(e) => setMultiProductInfo(index, { englishAttribute: e.target.value })} placeholder="如：1 PC Peach Skin Pillowcase" className="input-industrial" />
              </Field>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ===== 辅助组件 =====
function Field({
  label,
  icon,
  optional,
  required,
  wide,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  optional?: boolean;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(wide && 'md:col-span-2 lg:col-span-3')}>
      <label className="label-industrial mb-1.5">
        {icon} {label}
        {optional && <span className="ml-1 font-normal normal-case text-ink-400">· 选填</span>}
        {required && <span className="ml-1 font-normal normal-case text-flame">· 必填</span>}
      </label>
      {children}
    </div>
  );
}
