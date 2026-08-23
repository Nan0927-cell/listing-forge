import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { createThumbnailUrl } from '@/lib/imageProcessor';
import { cn } from '@/lib/utils';
import type { Pair1688, ScannedFile } from '@/types';
import { ChevronRight, ChevronLeft, Image as ImageIcon, Users, Link2, Unlink, Plus, Trash2 } from 'lucide-react';
import ImagePreview from '@/components/ImagePreview';

function detectImageType(filename: string): '方图' | '首图' | null {
  if (/方图/.test(filename)) return '方图';
  if (/首图/.test(filename)) return '首图';
  return null;
}

export default function Pair() {
  const navigate = useNavigate();
  const {
    scanResult, pairs1688, setPairs1688, setStepStatus,
    listingMode, multiProductInfos, productInfo,
  } = useStore();

  const isMulti = listingMode !== 'single';

  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [deletedNames, setDeletedNames] = useState<Set<string>>(new Set());
  const [draggedImage, setDraggedImage] = useState<ScannedFile | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const draggedImageRef = useRef<ScannedFile | null>(null);
  const mouseYRef = useRef(0);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 按文件路径第一段(SKU子文件夹名)分组
  const groups = useMemo(() => {
    if (!scanResult || scanResult.folder1688.length === 0) return [];
    const groupMap = new Map<string, ScannedFile[]>();
    for (const img of scanResult.folder1688) {
      const pathParts = img.path.split('/');
      const groupKey = pathParts.length > 2 ? pathParts[0] : 'default';
      if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
      groupMap.get(groupKey)!.push(img);
    }
    return Array.from(groupMap.entries()).map(([key, files], index) => ({
      key,
      files: files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true })),
      index,
      skuCode: isMulti
        ? (multiProductInfos[index]?.productCode || key)
        : productInfo.productCode,
    }));
  }, [scanResult, isMulti, multiProductInfos, productInfo.productCode]);

  const groupCount = groups.length;

  // 当前组的图片
  const currentGroup = groups[activeGroupIndex];
  const currentSkuCode = currentGroup?.skuCode || '';
  const sortedImages = currentGroup?.files || [];

  // 当前组的配对（从pairs1688中筛选groupIndex===activeGroupIndex）
  const currentPairs = useMemo(() => {
    return pairs1688.filter(p => (p.groupIndex ?? 0) === activeGroupIndex);
  }, [pairs1688, activeGroupIndex]);

  // 基于文件名同步检测图片类型
  const imageTypes = useMemo(() => {
    const types: Record<string, '方图' | '首图' | null> = {};
    for (const img of sortedImages) {
      types[img.name] = detectImageType(img.name);
    }
    return types;
  }, [sortedImages]);

  // 生成缩略图（当前组）
  useEffect(() => {
    if (sortedImages.length === 0) return;
    (async () => {
      const newThumbs: Record<string, string> = {};
      for (const img of sortedImages) {
        if (!thumbnails[img.name]) {
          try {
            newThumbs[img.name] = await createThumbnailUrl(img.file, 300);
          } catch {}
        }
      }
      if (Object.keys(newThumbs).length > 0) {
        setThumbnails((prev) => ({ ...prev, ...newThumbs }));
      }
    })();
  }, [sortedImages]);

  // 自动配对：按SKU分组，每组内和单个SKU一样的逻辑
  // 默认创建2组（陈悦组、杜青组），按顺序分配方图和首图
  useEffect(() => {
    if (groups.length > 0 && pairs1688.length === 0) {
      const newPairs: Pair1688[] = [];
      for (const group of groups) {
        const squareImgs = group.files.filter(f => /方图/.test(f.name));
        const mainImgs = group.files.filter(f => /首图/.test(f.name));
        // 默认2组：陈悦组、杜青组
        const defaultNames = ['陈悦组', '杜青组'];
        for (let i = 0; i < defaultNames.length; i++) {
          newPairs.push({
            squareImage: squareImgs[i] || null,
            mainImage: mainImgs[i] || null,
            groupName: defaultNames[i],
            groupIndex: group.index,
          });
        }
      }
      setPairs1688(newPairs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  if (!scanResult) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-ink-400">请先完成图片分类</p>
        <button onClick={() => navigate('/classify')} className="btn-outline mt-4">
          返回分类
        </button>
      </div>
    );
  }

  // 没有1688图片时直接进入下一步
  if (scanResult.folder1688.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <div className="section-tag mb-2">03 · PAIR</div>
          <h1 className="text-3xl font-bold tracking-tightest">1688 配对</h1>
          <p className="mt-1 text-sm text-ink-500">1688 文件夹中没有图片，跳过此步骤。</p>
        </div>
        <div className="flex justify-between">
          <button onClick={() => navigate('/classify')} className="btn-outline">
            返回分类
          </button>
          <button
            onClick={() => {
              setStepStatus('pair', 'done');
              setStepStatus('forge', 'active');
              navigate('/forge');
            }}
            className="btn-industrial"
          >
            跳过，继续 <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const images = sortedImages.filter(img => !deletedNames.has(img.name));

  // 删除图片
  const handleDeleteImage = (img: ScannedFile) => {
    setDeletedNames(prev => new Set(prev).add(img.name));
    const updated = pairs1688.map(p => ({
      ...p,
      squareImage: p.squareImage === img ? null : p.squareImage,
      mainImage: p.mainImage === img ? null : p.mainImage,
    }));
    setPairs1688(updated);
  };

  // 在当前组内添加配对（命名规则：杜青组2、陈悦组2、杜青组3、陈悦组3...）
  const handleAddPair = () => {
    const currentCount = currentPairs.length;
    let groupName: string;
    if (currentCount === 0) groupName = '陈悦组';
    else if (currentCount === 1) groupName = '杜青组';
    else {
      const extraRound = Math.floor((currentCount - 2) / 2) + 2;
      const isDuqing = (currentCount - 2) % 2 === 0;
      const baseName = isDuqing ? '杜青组' : '陈悦组';
      groupName = `${baseName}${extraRound}`;
    }
    setPairs1688([...pairs1688, {
      squareImage: null,
      mainImage: null,
      groupName,
      groupIndex: activeGroupIndex,
    }]);
  };

  // 删除配对（当前组内至少保留1个）
  const handleRemovePair = (pairIdx: number) => {
    if (currentPairs.length <= 1) return;
    const target = currentPairs[pairIdx];
    const globalIdx = pairs1688.indexOf(target);
    setPairs1688(pairs1688.filter((_, i) => i !== globalIdx));
  };

  // 分配图片到当前组的某个配对
  const assignToPair = (img: ScannedFile, pairIdx: number, type: 'square' | 'main') => {
    const target = currentPairs[pairIdx];
    const globalIdx = pairs1688.indexOf(target);
    const updated = [...pairs1688];
    if (type === 'square') {
      updated[globalIdx].squareImage = img;
    } else {
      updated[globalIdx].mainImage = img;
    }
    // 从当前组其他配对移除
    currentPairs.forEach((p, i) => {
      if (i !== pairIdx) {
        const gi = pairs1688.indexOf(p);
        if (updated[gi].squareImage === img) updated[gi].squareImage = null;
        if (updated[gi].mainImage === img) updated[gi].mainImage = null;
      }
    });
    setPairs1688(updated);
  };

  // 从配对中移除
  const removeFromPair = (pairIdx: number, type: 'square' | 'main') => {
    const target = currentPairs[pairIdx];
    const globalIdx = pairs1688.indexOf(target);
    const updated = [...pairs1688];
    if (type === 'square') updated[globalIdx].squareImage = null;
    else updated[globalIdx].mainImage = null;
    setPairs1688(updated);
  };

  // 图片是否已分配到当前组的任一配对
  const isImageAssigned = (img: ScannedFile) => {
    return currentPairs.some(p => p.squareImage === img || p.mainImage === img);
  };

  // 拖拽处理
  const handleDragStart = (e: React.DragEvent, img: ScannedFile) => {
    draggedImageRef.current = img;
    setDraggedImage(img);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    draggedImageRef.current = null;
    setDraggedImage(null);
    setDragOverSlot(null);
    if (scrollIntervalRef.current !== null) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };

  // 拖拽时自动滚动：鼠标接近视口顶部/底部时滚动页面
  const handleContainerDragOver = (e: React.DragEvent) => {
    if (!draggedImage) return;
    mouseYRef.current = e.clientY;
    if (scrollIntervalRef.current === null) {
      scrollIntervalRef.current = setInterval(() => {
        const threshold = 100;
        const speed = 15;
        const y = mouseYRef.current;
        const vh = window.innerHeight;
        if (y < threshold) {
          window.scrollBy(0, -speed);
        } else if (y > vh - threshold) {
          window.scrollBy(0, speed);
        }
      }, 30);
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (scrollIntervalRef.current !== null) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, []);

  const handleSlotDragOver = (e: React.DragEvent, pairIdx: number, type: 'square' | 'main') => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSlot(`${pairIdx}-${type}`);
  };

  const handleSlotDragLeave = () => {
    setDragOverSlot(null);
  };

  const handleSlotDrop = (e: React.DragEvent, pairIdx: number, type: 'square' | 'main') => {
    e.preventDefault();
    setDragOverSlot(null);
    const img = draggedImageRef.current;
    if (img) {
      assignToPair(img, pairIdx, type);
    }
    draggedImageRef.current = null;
    setDraggedImage(null);
  };

  const allCurrentPaired = currentPairs.every(p => p.squareImage && p.mainImage);
  const allGroupsPaired = pairs1688.every(p => p.squareImage && p.mainImage);

  const handleProceed = () => {
    if (groupCount > 1 && activeGroupIndex < groupCount - 1) {
      setActiveGroupIndex(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setStepStatus('pair', 'done');
    setStepStatus('forge', 'active');
    navigate('/forge');
  };

  const handlePrev = () => {
    if (activeGroupIndex > 0) {
      setActiveGroupIndex(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    navigate('/classify');
  };

  return (
    <div className="space-y-6" onDragOver={handleContainerDragOver}>
      <div>
        <div className="section-tag mb-2">03 · PAIR</div>
        <h1 className="text-3xl font-bold tracking-tightest">1688 配对</h1>
        <p className="mt-1 text-sm text-ink-500">
          按 SKU 分组，逐组配对方图和首图。每组以 SKU 编码命名，最终整理到通用命名规则文件夹。
        </p>
      </div>

      {/* 分组指示器 */}
      {groupCount > 0 && (
        <div className="card-industrial flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center border-2 border-ink-900 bg-ink-900 font-mono text-sm font-bold text-bone">
              {activeGroupIndex + 1}
            </span>
            <div>
              <div className="font-mono text-sm font-bold text-flame">{currentSkuCode || '未填写'}</div>
              <div className="text-xs text-ink-500">
                第 {activeGroupIndex + 1} 组 / 共 {groupCount} 组 · 当前组 {images.length} 张图片 · {currentPairs.length} 个配对
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: groupCount }, (_, i) => {
              const groupPairs = pairs1688.filter(p => (p.groupIndex ?? 0) === i);
              const paired = groupPairs.length > 0 && groupPairs.every(p => p.squareImage && p.mainImage);
              return (
                <button
                  key={i}
                  onClick={() => setActiveGroupIndex(i)}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center border-2 font-mono text-[10px] font-bold transition-all',
                    i === activeGroupIndex
                      ? 'border-flame bg-flame text-bone'
                      : paired
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : i < activeGroupIndex
                          ? 'border-ink-300 bg-ink-100 text-ink-500'
                          : 'border-ink-300 bg-transparent text-ink-400'
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左侧：当前组图片列表 */}
        <section className="card-industrial p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="section-tag">IMAGES</span>
            <h2 className="text-lg font-bold">1688 图片 ({currentSkuCode})</h2>
            <span className="font-mono text-sm text-ink-400">({images.length})</span>
          </div>

          {images.length === 0 ? (
            <div className="py-8 text-center text-ink-400">
              <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
              当前组没有图片
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((img, i) => {
                const assigned = isImageAssigned(img);
                const imgType = imageTypes[img.name];
                return (
                  <div
                    key={i}
                    draggable={!assigned}
                    onDragStart={(e) => !assigned && handleDragStart(e, img)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      'border-2 p-2 transition-colors',
                      assigned
                        ? 'border-ink-300 opacity-40'
                        : 'border-ink-900 hover:border-flame',
                      !assigned && 'cursor-grab active:cursor-grabbing',
                      draggedImage === img && 'ring-2 ring-flame ring-offset-1'
                    )}
                  >
                    <div
                      className="relative mb-2 aspect-square cursor-zoom-in overflow-hidden bg-ink-100"
                      onClick={() => setPreviewIndex(i)}
                    >
                      {thumbnails[img.name] ? (
                        <img
                          src={thumbnails[img.name]}
                          alt={img.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-ink-300" />
                        </div>
                      )}
                      {imgType && (
                        <span className={cn(
                          'absolute right-1 top-1 px-1.5 py-0.5 font-mono text-[9px] font-bold',
                          imgType === '方图' ? 'bg-flame text-white' : 'bg-steel text-white'
                        )}>
                          {imgType}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] font-medium">{img.name}</div>
                    <button
                      onClick={() => handleDeleteImage(img)}
                      className="mt-1 flex w-full items-center justify-center gap-1 border border-rust/50 py-1 font-mono text-[10px] text-rust hover:border-rust hover:bg-rust hover:text-white"
                    >
                      <Trash2 className="h-3 w-3" /> 删除
                    </button>
                    {/* 分配UI：≤2组用按钮，>2组用下拉栏 */}
                    {!assigned && currentPairs.length <= 2 && (
                      <div className="mt-1 space-y-1">
                        {currentPairs.map((p, pi) => (
                          <div key={pi} className="grid grid-cols-2 gap-1">
                            <button
                              onClick={() => assignToPair(img, pi, 'square')}
                              className="border border-ink-300 py-1 font-mono text-[10px] hover:border-flame hover:bg-flame hover:text-white"
                            >
                              {p.groupName}方图
                            </button>
                            <button
                              onClick={() => assignToPair(img, pi, 'main')}
                              className="border border-ink-300 py-1 font-mono text-[10px] hover:border-flame hover:bg-flame hover:text-white"
                            >
                              {p.groupName}首图
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {!assigned && currentPairs.length > 2 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const [pairIdx, type] = e.target.value.split('-');
                          if (pairIdx && type) {
                            assignToPair(img, parseInt(pairIdx), type as 'square' | 'main');
                          }
                        }}
                        className="mt-1 w-full border border-ink-300 px-1 py-1 font-mono text-[10px]"
                      >
                        <option value="">分配到...</option>
                        {currentPairs.map((p, pi) => (
                          <optgroup key={pi} label={p.groupName}>
                            <option value={`${pi}-square`}>方图</option>
                            <option value={`${pi}-main`}>首图</option>
                          </optgroup>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 右侧：当前组配对 */}
        <section className="card-industrial p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="section-tag">PAIRS</span>
            <h2 className="text-lg font-bold">配对组 ({currentSkuCode})</h2>
          </div>

          <div className="space-y-4">
            {currentPairs.map((pair, i) => (
              <div key={i} className="border-2 border-ink-900 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="font-bold">{pair.groupName}</span>
                  <div className="ml-auto flex items-center gap-2">
                    {pair.squareImage && pair.mainImage && (
                      <span className="flex items-center gap-1 font-mono text-[10px] text-green-600">
                        <Link2 className="h-3 w-3" /> 已配对
                      </span>
                    )}
                    {currentPairs.length > 1 && (
                      <button
                        onClick={() => handleRemovePair(i)}
                        className="flex items-center gap-1 border border-rust/50 px-1.5 py-0.5 font-mono text-[10px] text-rust hover:border-rust hover:bg-rust hover:text-white"
                      >
                        <Trash2 className="h-3 w-3" /> 删除组
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* 方图 */}
                  <div>
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-industrial text-ink-500">
                      方图 / SQUARE
                    </div>
                    <PairSlot
                      image={pair.squareImage}
                      thumbnail={pair.squareImage ? thumbnails[pair.squareImage.name] : null}
                      onRemove={() => removeFromPair(i, 'square')}
                      onDragOver={(e) => handleSlotDragOver(e, i, 'square')}
                      onDragLeave={handleSlotDragLeave}
                      onDrop={(e) => handleSlotDrop(e, i, 'square')}
                      isDragOver={dragOverSlot === `${i}-square`}
                    />
                  </div>

                  {/* 首图 */}
                  <div>
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-industrial text-ink-500">
                      首图 / MAIN
                    </div>
                    <PairSlot
                      image={pair.mainImage}
                      thumbnail={pair.mainImage ? thumbnails[pair.mainImage.name] : null}
                      onRemove={() => removeFromPair(i, 'main')}
                      onDragOver={(e) => handleSlotDragOver(e, i, 'main')}
                      onDragLeave={handleSlotDragLeave}
                      onDrop={(e) => handleSlotDrop(e, i, 'main')}
                      isDragOver={dragOverSlot === `${i}-main`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddPair}
            className="btn-outline mt-2 flex w-full items-center justify-center gap-1"
          >
            <Plus className="h-4 w-4" /> 添加配对
          </button>

          <div className="mt-4 flex items-center gap-2 text-sm text-ink-500">
            {allCurrentPaired ? (
              <span className="text-green-600">✓ 当前组所有配对完成</span>
            ) : (
              <span>请为每组分配方图和首图（可拖拽或点击按钮）</span>
            )}
          </div>

          {/* 所有组配对状态概览 */}
          {groupCount > 1 && (
            <div className="mt-4 border-t border-ink-200 pt-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-industrial text-ink-500">
                全部配对状态
              </div>
              <div className="space-y-1">
                {groups.map((group, i) => {
                  const groupPairs = pairs1688.filter(p => (p.groupIndex ?? 0) === i);
                  const paired = groupPairs.length > 0 && groupPairs.every(p => p.squareImage && p.mainImage);
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={cn(
                        'inline-block h-2 w-2',
                        paired ? 'bg-green-600' : 'bg-ink-300'
                      )} />
                      <span className="font-mono">{group.skuCode}</span>
                      <span className="text-ink-400">
                        {groupPairs.length} 组 · {paired ? '已配对' : '未完成'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="flex justify-between">
        <button onClick={handlePrev} className="btn-outline">
          {activeGroupIndex > 0 ? (
            <><ChevronLeft className="h-4 w-4" /> 上一组</>
          ) : (
            '返回分类'
          )}
        </button>
        <button
          onClick={handleProceed}
          className="btn-industrial"
          disabled={!allCurrentPaired && images.length > 0}
        >
          {groupCount > 1 && activeGroupIndex < groupCount - 1 ? (
            <>下一组 <ChevronRight className="h-4 w-4" /></>
          ) : (
            <>确认配对，继续 <ChevronRight className="h-4 w-4" /></>
          )}
        </button>
      </div>

      {previewIndex !== null && (
        <ImagePreview
          images={images.map((img) => ({
            src: thumbnails[img.name] || '',
            name: img.name,
          }))}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}

function PairSlot({
  image, thumbnail, onRemove,
  onDragOver, onDragLeave, onDrop, isDragOver,
}: {
  image: ScannedFile | null;
  thumbnail: string | null;
  onRemove: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  isDragOver: boolean;
}) {
  if (!image) {
    return (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'flex aspect-square items-center justify-center border-2 border-dashed bg-bone-50 transition-colors',
          isDragOver ? 'border-flame bg-flame/10' : 'border-ink-300'
        )}
      >
        <div className="text-center">
          <ImageIcon className="mx-auto h-6 w-6 text-ink-300" />
          <span className="mt-1 block font-mono text-[9px] text-ink-400">拖拽到此处</span>
        </div>
      </div>
    );
  }
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'relative border-2 transition-colors',
        isDragOver ? 'border-flame bg-flame/10' : 'border-ink-900'
      )}
    >
      <div className="aspect-square overflow-hidden bg-ink-100">
        {thumbnail && (
          <img src={thumbnail} alt={image.name} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="truncate p-1 text-[10px] font-medium">{image.name}</div>
      <button
        onClick={onRemove}
        className="absolute right-1 top-1 bg-rust p-1 text-white hover:bg-rust/80"
      >
        <Unlink className="h-3 w-3" />
      </button>
    </div>
  );
}
