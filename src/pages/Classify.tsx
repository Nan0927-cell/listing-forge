import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { autoClassifyImages, createThumbnailUrl } from '@/lib/imageProcessor';
import { formatFileSize, cn } from '@/lib/utils';
import type { ClassifiedImage, ImageCategory } from '@/types';
import ImagePreview from '@/components/ImagePreview';
import {
  Image as ImageIcon, Folder, Video, FileBox,
  ChevronRight, ChevronLeft, RefreshCw, GripVertical,
  CheckSquare, Square, Layers, X, Trash2,
} from 'lucide-react';

const CATEGORY_LABELS: Record<ImageCategory, string> = {
  'main': '主图/首图',
  'scene': '场景图',
  'detail-grid': '产品详情(四宫格)',
  'detail': '细节图',
  'white-bg': '白底图',
  'attribute': '属性图',
  'unclassified': '未分类',
};

const CATEGORY_COLORS: Record<ImageCategory, string> = {
  'main': 'border-flame bg-flame/10 text-flame',
  'scene': 'border-steel bg-steel/10 text-steel',
  'detail-grid': 'border-rust bg-rust/10 text-rust',
  'detail': 'border-ink-500 bg-ink-500/10 text-ink-700',
  'white-bg': 'border-ink-300 bg-ink-100 text-ink-600',
  'attribute': 'border-flame bg-flame/5 text-flame-700',
  'unclassified': 'border-ink-300 bg-transparent text-ink-400',
};

export default function Classify() {
  const navigate = useNavigate();
  const {
    scanResult, productInfo, classifiedImages,
    setClassifiedImages, setStepStatus, setError,
    listingMode, multiProductInfos,
  } = useStore();

  // 多SKU模式下使用第一组SKU的信息
  const isMulti = listingMode !== 'single';
  const activeInfo = isMulti ? (multiProductInfos[0] || productInfo) : productInfo;

  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);

  // 属性图配对拖拽状态（仅multiA）
  const [draggedAttrIdx, setDraggedAttrIdx] = useState<number | null>(null);
  const [dragOverSkuIdx, setDragOverSkuIdx] = useState<number | null>(null);
  const draggedAttrRef = useRef<number | null>(null);
  const attrMouseYRef = useRef(0);
  const attrScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 多SKU分组：计算组数和当前组图片
  const groupCount = useMemo(() => {
    if (!isMulti) return 1;
    const indices = new Set(classifiedImages.map(img => img.groupIndex ?? 0));
    return indices.size;
  }, [classifiedImages, isMulti]);

  // 当前组图片在 classifiedImages 中的全局索引
  const currentGroupGlobalIndices = useMemo(() => {
    if (!isMulti) return classifiedImages.map((_, i) => i);
    return classifiedImages
      .map((img, i) => ({ gi: img.groupIndex ?? 0, i }))
      .filter(({ gi }) => gi === activeGroupIndex)
      .map(({ i }) => i);
  }, [classifiedImages, isMulti, activeGroupIndex]);

  // 当前组显示的图片
  const displayImages = useMemo(() => {
    return currentGroupGlobalIndices.map(i => classifiedImages[i]);
  }, [classifiedImages, currentGroupGlobalIndices]);

  // 当前组的SKU编码
  const currentSkuCode = useMemo(() => {
    if (!isMulti) return activeInfo.productCode;
    return multiProductInfos[activeGroupIndex]?.productCode || '';
  }, [isMulti, multiProductInfos, activeGroupIndex, activeInfo.productCode]);

  // multiA属性图配对：所有属性图及其全局索引
  const attrImagesWithIdx = useMemo(() => {
    if (listingMode !== 'multiA') return [];
    return classifiedImages
      .map((img, i) => ({ img, i }))
      .filter(({ img }) => img.category === 'attribute');
  }, [classifiedImages, listingMode]);

  // 未配对的属性图（newName === 原文件名）
  const unpairedAttrImages = attrImagesWithIdx.filter(({ img }) => img.newName === img.file.name);

  // 所有SKU编码（来自首页填写）
  const attrSkuCodes = useMemo(() => {
    return multiProductInfos.map(p => p.productCode).filter(c => c.trim());
  }, [multiProductInfos]);

  // 获取已配对到某个SKU的属性图
  const getAttrForSku = (skuCode: string) => {
    return attrImagesWithIdx.filter(({ img }) => {
      const ext = img.file.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
      return img.newName === `${skuCode}.${ext}`;
    });
  };

  // 属性图拖拽处理
  const handleAttrDragStart = (globalIdx: number) => {
    draggedAttrRef.current = globalIdx;
    setDraggedAttrIdx(globalIdx);
  };

  const handleAttrDragEnd = () => {
    draggedAttrRef.current = null;
    setDraggedAttrIdx(null);
    setDragOverSkuIdx(null);
    if (attrScrollRef.current) {
      clearInterval(attrScrollRef.current);
      attrScrollRef.current = null;
    }
  };

  const handleAttrContainerDragOver = (e: React.DragEvent) => {
    if (draggedAttrIdx === null) return;
    attrMouseYRef.current = e.clientY;
    if (attrScrollRef.current === null) {
      attrScrollRef.current = setInterval(() => {
        const threshold = 100;
        const speed = 15;
        const y = attrMouseYRef.current;
        const vh = window.innerHeight;
        if (y < threshold) window.scrollBy(0, -speed);
        else if (y > vh - threshold) window.scrollBy(0, speed);
      }, 30);
    }
  };

  const handleSkuDragOver = (e: React.DragEvent, skuIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSkuIdx(skuIdx);
  };

  const handleSkuDrop = (e: React.DragEvent, skuIdx: number) => {
    e.preventDefault();
    setDragOverSkuIdx(null);
    const idx = draggedAttrRef.current;
    const skuCode = attrSkuCodes[skuIdx];
    if (idx !== null && skuCode) {
      const updated = [...classifiedImages];
      const ext = updated[idx].file.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
      updated[idx] = { ...updated[idx], newName: `${skuCode}.${ext}` };
      setClassifiedImages(updated);
    }
    draggedAttrRef.current = null;
    setDraggedAttrIdx(null);
    if (attrScrollRef.current) {
      clearInterval(attrScrollRef.current);
      attrScrollRef.current = null;
    }
  };

  // 取消配对（重置为原文件名）
  const handleUnpairAttr = (globalIdx: number) => {
    const updated = [...classifiedImages];
    updated[globalIdx] = { ...updated[globalIdx], newName: updated[globalIdx].file.name };
    setClassifiedImages(updated);
  };

  // 组件卸载时清理滚动定时器
  useEffect(() => {
    return () => {
      if (attrScrollRef.current) clearInterval(attrScrollRef.current);
    };
  }, []);

  // 自动分类
  useEffect(() => {
    if (scanResult && scanResult.folder1200.length > 0 && classifiedImages.length === 0) {
      const multiCodes = isMulti
        ? multiProductInfos.map(p => p.productCode).filter(c => c.trim())
        : undefined;
      const classified = autoClassifyImages(
        scanResult.folder1200,
        activeInfo.styleCode,
        activeInfo.productCode,
        multiCodes,
        listingMode === 'multiA'
      );
      setClassifiedImages(classified);
    }
  }, [scanResult, activeInfo.productCode, activeInfo.styleCode, classifiedImages.length, setClassifiedImages, isMulti, multiProductInfos]);

  // 生成缩略图 — 用path作key避免不同组同名文件冲突
  useEffect(() => {
    if (classifiedImages.length === 0) return;
    setLoading(true);
    const promises = classifiedImages.map(async (img) => {
      const key = img.file.path || img.file.name;
      if (!thumbnails[key]) {
        try {
          const url = await createThumbnailUrl(img.file.file, 200);
          return { key, url };
        } catch {
          return null;
        }
      }
      return null;
    });
    Promise.all(promises).then((results) => {
      const newThumbs: Record<string, string> = {};
      results.forEach((r) => {
        if (r) newThumbs[r.key] = r.url;
      });
      if (Object.keys(newThumbs).length > 0) {
        setThumbnails((prev) => ({ ...prev, ...newThumbs }));
      }
      setLoading(false);
    });
  }, [classifiedImages]);

  if (!scanResult) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-ink-400">请先在工作台完成扫描</p>
        <button onClick={() => navigate('/')} className="btn-outline mt-4">
          返回工作台
        </button>
      </div>
    );
  }

  // 修改分类（localIndex 为当前组内索引）
  const handleCategoryChange = (localIndex: number, category: ImageCategory) => {
    const globalIdx = isMulti ? currentGroupGlobalIndices[localIndex] : localIndex;
    const updated = [...classifiedImages];
    updated[globalIdx] = { ...updated[globalIdx], category };
    recalculateNames(updated, activeInfo.styleCode);
    setClassifiedImages(updated);
  };

  // 多选：切换选中状态
  const toggleSelect = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // 多选：全选 / 取消全选（当前组）
  const toggleSelectAll = () => {
    if (selectedIndices.size === displayImages.length && displayImages.length > 0) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(displayImages.map((_, i) => i)));
    }
  };

  // 多选：清空选择
  const clearSelection = () => setSelectedIndices(new Set());

  // 多选：批量修改分类
  const handleBatchCategoryChange = (category: ImageCategory) => {
    const updated = [...classifiedImages];
    for (const localIdx of selectedIndices) {
      const globalIdx = isMulti ? currentGroupGlobalIndices[localIdx] : localIdx;
      updated[globalIdx] = { ...updated[globalIdx], category };
    }
    recalculateNames(updated, activeInfo.styleCode);
    setClassifiedImages(updated);
    clearSelection();
  };

  // 拖拽排序 - 开始拖拽
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  // 拖拽排序 - 拖拽经过目标
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      setDragOverIndex(index);
    }
  };

  // 拖拽排序 - 结束拖拽
  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // 拖拽排序 - 放置（组内拖拽）
  const handleDrop = (localDropIndex: number) => {
    if (dragIndex === null || dragIndex === localDropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const globalDragIdx = isMulti ? currentGroupGlobalIndices[dragIndex] : dragIndex;
    const globalDropIdx = isMulti ? currentGroupGlobalIndices[localDropIndex] : localDropIndex;
    const updated = [...classifiedImages];
    const [draggedItem] = updated.splice(globalDragIdx, 1);
    const adjustedDropIdx = globalDragIdx < globalDropIdx ? globalDropIdx - 1 : globalDropIdx;
    updated.splice(adjustedDropIdx, 0, draggedItem);
    recalculateNames(updated, activeInfo.styleCode);
    setClassifiedImages(updated);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // 重新计算名称（分组感知：组内按类别排序，组间编号接续）
  const recalculateNames = (images: ClassifiedImage[], styleCode: string) => {
    const groupMap = new Map<number, ClassifiedImage[]>();
    for (const img of images) {
      const gi = img.groupIndex ?? 0;
      if (!groupMap.has(gi)) groupMap.set(gi, []);
      groupMap.get(gi)!.push(img);
    }

    const catOrder: ImageCategory[] = ['main', 'scene', 'detail-grid', 'detail', 'white-bg'];
    let orderNum = 1;

    for (const gi of [...groupMap.keys()].sort((a, b) => a - b)) {
      const groupImgs = groupMap.get(gi)!;

      for (const cat of catOrder) {
        for (const img of groupImgs) {
          if (img.category === cat) {
            const ext = img.file.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
            img.newName = `${styleCode}-00-${String(orderNum).padStart(2, '0')}.${ext}`;
            img.order = orderNum;
            orderNum++;
          }
        }
      }
      for (const img of groupImgs) {
        if (img.category === 'unclassified') {
          const ext = img.file.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
          img.newName = `${styleCode}-00-${String(orderNum).padStart(2, '0')}.${ext}`;
          img.order = orderNum;
          orderNum++;
        }
      }
    }

    // 属性图命名
    for (const img of images) {
      if (img.category === 'attribute') {
        if (listingMode === 'multiA') {
          // multiA：不覆盖已配对的名称，未配对的保持原文件名
          if (!img.newName || img.newName === img.file.name) {
            img.newName = img.file.name;
          }
          img.order = 0;
        } else {
          // 其他模式：按组对应的SKU编码命名
          const ext = img.file.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
          const gi = img.groupIndex ?? 0;
          const groupCode = isMulti
            ? (multiProductInfos[gi]?.productCode || activeInfo.productCode)
            : activeInfo.productCode;
          img.newName = `${groupCode}.${ext}`;
          img.order = 0;
        }
      }
    }
  };

  // 删除图片（localIndex 为当前组内索引）
  const handleDeleteImage = (localIndex: number) => {
    const globalIdx = isMulti ? currentGroupGlobalIndices[localIndex] : localIndex;
    const updated = classifiedImages.filter((_, i) => i !== globalIdx);
    recalculateNames(updated, activeInfo.styleCode);
    setClassifiedImages(updated);
    setSelectedIndices((prev) => {
      const next = new Set<number>();
      prev.forEach((idx) => {
        if (idx < localIndex) next.add(idx);
        else if (idx > localIndex) next.add(idx - 1);
      });
      return next;
    });
  };

  // 下一步：多SKU模式下切换到下一组，最后一组才进入配对
  const handleProceed = () => {
    if (isMulti && activeGroupIndex < groupCount - 1) {
      setActiveGroupIndex(prev => prev + 1);
      setSelectedIndices(new Set());
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setStepStatus('classify', 'done');
    setStepStatus('pair', 'active');
    navigate('/pair');
  };

  // 上一步：多SKU模式下回到上一组，第一组返回工作台
  const handlePrev = () => {
    if (isMulti && activeGroupIndex > 0) {
      setActiveGroupIndex(prev => prev - 1);
      setSelectedIndices(new Set());
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    navigate('/');
  };

  // 构建预览图片数组（当前组）
  const previewImages = displayImages
    .map((img, originalIndex) => ({
      src: thumbnails[img.file.path || img.file.name] || '',
      name: img.file.name,
      originalIndex,
    }))
    .filter((item) => item.src !== '');

  // 点击缩略图打开预览
  const handleThumbnailClick = (originalIndex: number) => {
    const previewIdx = previewImages.findIndex((p) => p.originalIndex === originalIndex);
    if (previewIdx >= 0) {
      setPreviewIndex(previewIdx);
    }
  };

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <div className="section-tag mb-2">02 · CLASSIFY</div>
        <h1 className="text-3xl font-bold tracking-tightest">图片分类</h1>
        <p className="mt-1 text-sm text-ink-500">
          扫描输入文件夹，自动分类1200图片，可手动调整分类与顺序。
        </p>
      </div>

      {/* 扫描概览 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<Folder className="h-5 w-5" />} label="1200 图片" value={scanResult.folder1200.length} color="flame" />
        <StatCard icon={<Folder className="h-5 w-5" />} label="1688 图片" value={scanResult.folder1688.length} color="steel" />
        <StatCard icon={<Video className="h-5 w-5" />} label="视频文件" value={scanResult.videos.length} color="rust" />
        <StatCard icon={<FileBox className="h-5 w-5" />} label="OZON 文件" value={scanResult.ozonFiles.length} color="ink" />
      </div>

      {/* 1688 图片预览（提示） */}
      {scanResult.folder1688.length > 0 && !isMulti && (
        <div className="card-industrial p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold">1688 文件夹</h3>
              <p className="text-sm text-ink-500">
                共 {scanResult.folder1688.length} 张图片，将在下一步进行配对
              </p>
            </div>
            <button onClick={() => navigate('/pair')} className="btn-outline text-xs">
              前往配对 <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* 多SKU分组指示器 */}
      {isMulti && groupCount > 0 && (
        <div className="card-industrial flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center border-2 border-ink-900 bg-ink-900 font-mono text-sm font-bold text-bone">
              {activeGroupIndex + 1}
            </span>
            <div>
              <div className="font-mono text-sm font-bold text-flame">{currentSkuCode || '未填写'}</div>
              <div className="text-xs text-ink-500">
                第 {activeGroupIndex + 1} 组 / 共 {groupCount} 组 · 当前组 {displayImages.length} 张图片
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: groupCount }, (_, i) => (
              <button
                key={i}
                onClick={() => { setActiveGroupIndex(i); setSelectedIndices(new Set()); }}
                className={cn(
                  'flex h-6 w-6 items-center justify-center border-2 font-mono text-[10px] font-bold transition-all',
                  i === activeGroupIndex
                    ? 'border-flame bg-flame text-bone'
                    : i < activeGroupIndex
                      ? 'border-ink-300 bg-ink-100 text-ink-500'
                      : 'border-ink-300 bg-transparent text-ink-400'
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 1200 图片分类 */}
      <section className="card-industrial p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 font-mono text-xs text-ink-600 hover:text-flame"
              title="全选 / 取消全选"
            >
              {selectedIndices.size === displayImages.length && displayImages.length > 0 ? (
                <CheckSquare className="h-4 w-4 text-flame" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              {selectedIndices.size > 0 ? `已选 ${selectedIndices.size}` : '全选'}
            </button>
            <span className="section-tag">1200</span>
            <h2 className="text-lg font-bold">图片分类与命名</h2>
          </div>
          <button
            onClick={() => {
              if (scanResult) {
                const multiCodes = isMulti
                  ? multiProductInfos.map(p => p.productCode).filter(c => c.trim())
                  : undefined;
                const classified = autoClassifyImages(
                  scanResult.folder1200,
                  activeInfo.styleCode,
                  activeInfo.productCode,
                  multiCodes,
                  listingMode === 'multiA'
                );
                setClassifiedImages(classified);
                clearSelection();
                setActiveGroupIndex(0);
              }
            }}
            className="btn-outline text-xs"
          >
            <RefreshCw className="h-3 w-3" /> 重新自动分类
          </button>
        </div>

        {displayImages.length === 0 ? (
          <div className="py-8 text-center text-ink-400">
            <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
            {isMulti ? '当前组没有图片' : '1200 文件夹中没有找到图片'}
          </div>
        ) : (
          <div className="space-y-2">
            {displayImages.map((img, i) => (
              <div
                key={i}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragEnd={handleDragEnd}
                onDrop={() => handleDrop(i)}
                className={cn(
                  'flex items-center gap-3 border-2 p-2 transition-all',
                  CATEGORY_COLORS[img.category],
                  dragIndex === i && 'opacity-40',
                  dragOverIndex === i && dragIndex !== i && 'border-flame ring-2 ring-flame',
                  selectedIndices.has(i) && 'ring-2 ring-flame ring-offset-1'
                )}
              >
                {/* 多选复选框 */}
                <button
                  onClick={() => toggleSelect(i)}
                  className="shrink-0"
                  title="点击选中/取消"
                >
                  {selectedIndices.has(i) ? (
                    <CheckSquare className="h-5 w-5 text-flame" />
                  ) : (
                    <Square className="h-5 w-5 text-ink-300 hover:text-ink-500" />
                  )}
                </button>

                {/* 拖拽手柄 */}
                <div className="flex cursor-grab items-center text-ink-400 hover:text-ink-900 active:cursor-grabbing">
                  <GripVertical className="h-5 w-5" />
                </div>

                {/* 缩略图（点击预览大图） */}
                <button
                  type="button"
                  onClick={() => handleThumbnailClick(i)}
                  className="h-14 w-14 shrink-0 overflow-hidden border border-ink-300 bg-white hover:border-flame"
                  title="点击查看大图"
                >
                  {thumbnails[img.file.path || img.file.name] ? (
          <img
            src={thumbnails[img.file.path || img.file.name]}
                      alt={img.file.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-ink-300" />
                    </div>
                  )}
                </button>

                {/* 文件信息 */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{img.file.name}</div>
                  <div className="flex items-center gap-2 text-[11px] text-ink-500">
                    <span>{formatFileSize(img.file.size)}</span>
                    <span>→</span>
                    <span className="font-mono font-bold text-ink-900">{img.newName}</span>
                  </div>
                </div>

                {/* 分类选择 */}
                <select
                  value={img.category}
                  onChange={(e) => handleCategoryChange(i, e.target.value as ImageCategory)}
                  className="border-2 border-ink-300 bg-white px-2 py-1 font-mono text-xs font-bold focus:border-flame focus:outline-none"
                >
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>

                {/* 删除按钮 */}
                <button
                  onClick={() => handleDeleteImage(i)}
                  className="shrink-0 p-1.5 text-ink-400 hover:text-rust hover:bg-rust/5"
                  title="删除图片"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 批量分类操作栏 */}
      {selectedIndices.size > 0 && (
        <div className="sticky bottom-4 z-50 border-2 border-ink-900 bg-bone shadow-industrial-sm">
          <div className="flex items-center gap-3 px-4 py-3">
            <Layers className="h-5 w-5 text-flame" />
            <span className="font-mono text-sm font-bold">
              已选 {selectedIndices.size} 项
            </span>
            <span className="font-mono text-[10px] uppercase tracking-industrial text-ink-500">
              批量分类为
            </span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  handleBatchCategoryChange(e.target.value as ImageCategory);
                }
              }}
              className="border-2 border-ink-900 bg-white px-3 py-1.5 font-mono text-xs font-bold focus:border-flame focus:outline-none"
            >
              <option value="">选择分类...</option>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <button
              onClick={clearSelection}
              className="ml-auto flex items-center gap-1 font-mono text-xs text-ink-500 hover:text-rust"
            >
              <X className="h-3 w-3" /> 取消选择
            </button>
          </div>
        </div>
      )}

      {/* 属性图配对 - 仅multiA模式 */}
      {listingMode === 'multiA' && attrImagesWithIdx.length > 0 && (
        <section className="card-industrial p-5" onDragOver={handleAttrContainerDragOver}>
          <div className="mb-4 flex items-center gap-2">
            <span className="section-tag">ATTR PAIR</span>
            <h2 className="text-lg font-bold">属性图配对</h2>
            <span className="font-mono text-sm text-ink-400">
              (未配对 {unpairedAttrImages.length} · 共 {attrImagesWithIdx.length} 张)
            </span>
          </div>
          <p className="mb-4 text-sm text-ink-500">
            将左侧未配对的属性图拖拽到右侧对应的SKU框中，配对后图片将以该SKU编码命名。
          </p>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* 左侧：未配对的属性图 */}
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-industrial text-ink-500">
                未配对属性图 / UNPAIRED
              </div>
              {unpairedAttrImages.length === 0 ? (
                <div className="flex items-center justify-center border-2 border-dashed border-ink-300 py-8 text-sm text-ink-400">
                  <CheckSquare className="mr-2 h-4 w-4 text-green-600" />
                  所有属性图已配对
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {unpairedAttrImages.map(({ img, i }) => (
                    <div
                      key={i}
                      draggable
                      onDragStart={() => handleAttrDragStart(i)}
                      onDragEnd={handleAttrDragEnd}
                      className={cn(
                        'border-2 p-2 transition-colors cursor-grab active:cursor-grabbing',
                        'border-ink-900 hover:border-flame',
                        draggedAttrIdx === i && 'ring-2 ring-flame ring-offset-1 opacity-40'
                      )}
                    >
                      <div className="relative mb-2 aspect-square overflow-hidden bg-ink-100">
                        {thumbnails[img.file.path || img.file.name] ? (
                          <img
                            src={thumbnails[img.file.path || img.file.name]}
                            alt={img.file.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageIcon className="h-5 w-5 text-ink-300" />
                          </div>
                        )}
                      </div>
                      <div className="truncate text-[11px] font-medium">{img.file.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 右侧：SKU配对区 */}
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-industrial text-ink-500">
                SKU配对区 / DROP ZONES
              </div>
              <div className="space-y-3">
                {attrSkuCodes.map((sku, skuIdx) => {
                  const paired = getAttrForSku(sku);
                  return (
                    <div
                      key={skuIdx}
                      onDragOver={(e) => handleSkuDragOver(e, skuIdx)}
                      onDragLeave={() => setDragOverSkuIdx(null)}
                      onDrop={(e) => handleSkuDrop(e, skuIdx)}
                      className={cn(
                        'border-2 p-3 transition-colors',
                        dragOverSkuIdx === skuIdx
                          ? 'border-flame bg-flame/10'
                          : 'border-ink-300'
                      )}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-flame">{sku}</span>
                        <span className="text-xs text-ink-500">({paired.length} 张)</span>
                      </div>
                      {paired.length === 0 ? (
                        <div className="py-4 text-center text-xs text-ink-400">
                          {dragOverSkuIdx === skuIdx ? '松开以配对' : '拖拽属性图到此处'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {paired.map(({ img, i }) => (
                            <div key={i} className="relative border border-ink-300 p-1">
                              <div className="aspect-square overflow-hidden bg-ink-100">
                                {thumbnails[img.file.path || img.file.name] && (
                                  <img
                                    src={thumbnails[img.file.path || img.file.name]}
                                    alt={img.file.name}
                                    className="h-full w-full object-cover"
                                  />
                                )}
                              </div>
                              <div className="truncate text-[10px] font-mono font-bold text-green-700">
                                {img.newName}
                              </div>
                              <button
                                onClick={() => handleUnpairAttr(i)}
                                className="absolute right-0.5 top-0.5 bg-rust p-0.5 text-white hover:bg-rust/80"
                                title="取消配对"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 导航 */}
      <div className="flex justify-between">
        <button onClick={handlePrev} className="btn-outline">
          {isMulti && activeGroupIndex > 0 ? (
            <><ChevronLeft className="h-4 w-4" /> 上一组</>
          ) : (
            '返回工作台'
          )}
        </button>
        <button onClick={handleProceed} className="btn-industrial">
          {isMulti && activeGroupIndex < groupCount - 1 ? (
            <>下一组 <ChevronRight className="h-4 w-4" /></>
          ) : (
            <>确认分类，继续 <ChevronRight className="h-4 w-4" /></>
          )}
        </button>
      </div>

      {/* 图片预览 */}
      {previewIndex !== null && previewImages.length > 0 && (
        <ImagePreview
          images={previewImages.map(({ src, name }) => ({ src, name }))}
          initialIndex={Math.min(previewIndex, previewImages.length - 1)}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'flame' | 'steel' | 'rust' | 'ink';
}) {
  const colorMap = {
    flame: 'border-flame text-flame',
    steel: 'border-steel text-steel',
    rust: 'border-rust text-rust',
    ink: 'border-ink-900 text-ink-900',
  };
  return (
    <div className={cn('card-industrial border-l-4 p-3', colorMap[color])}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-industrial text-ink-500">{label}</span>
      </div>
      <div className="mt-1 font-mono text-2xl font-bold">{value}</div>
    </div>
  );
}
