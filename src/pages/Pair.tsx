import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { createThumbnailUrl } from '@/lib/imageProcessor';
import { cn } from '@/lib/utils';
import type { Pair1688, ScannedFile } from '@/types';
import { ChevronRight, Image as ImageIcon, Users, Link2, Unlink, Plus, Trash2 } from 'lucide-react';
import ImagePreview from '@/components/ImagePreview';

// 基于文件名检测图片类型（方图/首图）
function detectImageType(filename: string): '方图' | '首图' | null {
  if (/方图/.test(filename)) return '方图';
  if (/首图/.test(filename)) return '首图';
  return null;
}

export default function Pair() {
  const navigate = useNavigate();
  const {
    scanResult, pairs1688, setPairs1688, setStepStatus,
  } = useStore();

  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [deletedNames, setDeletedNames] = useState<Set<string>>(new Set());
  const [draggedImage, setDraggedImage] = useState<ScannedFile | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const draggedImageRef = useRef<ScannedFile | null>(null);

  // 按文件名自然排序，保持文件夹原始顺序
  const sortedImages = useMemo(() => {
    if (!scanResult) return [];
    return [...scanResult.folder1688].sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
    );
  }, [scanResult]);

  // 基于文件名同步检测图片类型
  const imageTypes = useMemo(() => {
    const types: Record<string, '方图' | '首图' | null> = {};
    for (const img of sortedImages) {
      types[img.name] = detectImageType(img.name);
    }
    return types;
  }, [sortedImages]);

  // 生成缩略图
  useEffect(() => {
    if (sortedImages.length === 0) return;
    (async () => {
      const newThumbs: Record<string, string> = {};
      for (const img of sortedImages) {
        try {
          newThumbs[img.name] = await createThumbnailUrl(img.file, 300);
        } catch {}
      }
      setThumbnails((prev) => ({ ...prev, ...newThumbs }));
    })();
  }, [sortedImages]);

  // 初始化配对（仅首次进入时自动配对）
  useEffect(() => {
    if (sortedImages.length > 0 && pairs1688.length === 0) {
      const groups: Pair1688[] = [
        { squareImage: null, mainImage: null, groupName: '陈悦组' },
        { squareImage: null, mainImage: null, groupName: '杜青组' },
      ];
      // 分别收集方图和首图，按文件名排序顺序
      const squareImgs: ScannedFile[] = [];
      const mainImgs: ScannedFile[] = [];
      for (const img of sortedImages) {
        const type = detectImageType(img.name);
        if (type === '方图') squareImgs.push(img);
        else if (type === '首图') mainImgs.push(img);
      }
      // 按顺序分配到各组：第1张方图→陈悦组方图，第2张方图→杜青组方图...
      for (let i = 0; i < groups.length; i++) {
        if (squareImgs[i]) groups[i].squareImage = squareImgs[i];
        if (mainImgs[i]) groups[i].mainImage = mainImgs[i];
      }
      setPairs1688(groups);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedImages]);

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

  const images = sortedImages.filter(img => !deletedNames.has(img.name));

  // 删除图片：从列表移除并清理组中的引用
  const handleDeleteImage = (img: ScannedFile) => {
    setDeletedNames(prev => new Set(prev).add(img.name));
    const updated = pairs1688.map(g => ({
      ...g,
      squareImage: g.squareImage === img ? null : g.squareImage,
      mainImage: g.mainImage === img ? null : g.mainImage,
    }));
    setPairs1688(updated);
  };

  // 添加组：新组依次为 杜青组2 → 陈悦组2 → 杜青组3 → 陈悦组3 ...
  const handleAddGroup = () => {
    const currentCount = pairs1688.length;
    const extraRound = Math.floor((currentCount - 2) / 2) + 2;
    const isDuqing = (currentCount - 2) % 2 === 0;
    const baseName = isDuqing ? '杜青组' : '陈悦组';
    const groupName = `${baseName}${extraRound}`;
    setPairs1688([...pairs1688, { squareImage: null, mainImage: null, groupName }]);
  };

  // 删除组（仅当组数>2时允许）
  const handleRemoveGroup = (groupIdx: number) => {
    if (pairs1688.length <= 2) return;
    setPairs1688(pairs1688.filter((_, i) => i !== groupIdx));
  };

  // 分配图片到组
  const assignToGroup = (img: ScannedFile, groupIdx: number, type: 'square' | 'main') => {
    const updated = [...pairs1688];
    if (type === 'square') {
      updated[groupIdx].squareImage = img;
    } else {
      updated[groupIdx].mainImage = img;
    }
    // 从其他组移除
    updated.forEach((g, i) => {
      if (i !== groupIdx) {
        if (g.squareImage === img) g.squareImage = null;
        if (g.mainImage === img) g.mainImage = null;
      }
    });
    setPairs1688(updated);
  };

  // 从组中移除
  const removeFromGroup = (groupIdx: number, type: 'square' | 'main') => {
    const updated = [...pairs1688];
    if (type === 'square') updated[groupIdx].squareImage = null;
    else updated[groupIdx].mainImage = null;
    setPairs1688(updated);
  };

  const isImageAssigned = (img: ScannedFile) => {
    return pairs1688.some(
      (g) => g.squareImage === img || g.mainImage === img
    );
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
  };

  const handleSlotDragOver = (e: React.DragEvent, groupIdx: number, type: 'square' | 'main') => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSlot(`${groupIdx}-${type}`);
  };

  const handleSlotDragLeave = () => {
    setDragOverSlot(null);
  };

  const handleSlotDrop = (e: React.DragEvent, groupIdx: number, type: 'square' | 'main') => {
    e.preventDefault();
    setDragOverSlot(null);
    const img = draggedImageRef.current;
    if (img) {
      assignToGroup(img, groupIdx, type);
    }
    draggedImageRef.current = null;
    setDraggedImage(null);
  };

  const allPaired = pairs1688.every((g) => g.squareImage && g.mainImage);

  const handleProceed = () => {
    setStepStatus('pair', 'done');
    setStepStatus('forge', 'active');
    navigate('/forge');
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="section-tag mb-2">03 · PAIR</div>
        <h1 className="text-3xl font-bold tracking-tightest">1688 配对</h1>
        <p className="mt-1 text-sm text-ink-500">
          将1688文件夹中的方图和首图分别配对到各组，支持拖拽配对。可点击"添加组"增加更多分组。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左侧：图片列表 */}
        <section className="card-industrial p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="section-tag">IMAGES</span>
            <h2 className="text-lg font-bold">1688 图片列表</h2>
            <span className="font-mono text-sm text-ink-400">({images.length})</span>
          </div>

          {images.length === 0 ? (
            <div className="py-8 text-center text-ink-400">
              <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
              1688 文件夹中没有图片
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
                    {!assigned && pairs1688.length <= 2 && (
                      <div className="mt-1 space-y-1">
                        {pairs1688.map((g, gi) => (
                          <div key={gi} className="grid grid-cols-2 gap-1">
                            <button
                              onClick={() => assignToGroup(img, gi, 'square')}
                              className="border border-ink-300 py-1 font-mono text-[10px] hover:border-flame hover:bg-flame hover:text-white"
                            >
                              {g.groupName}方图
                            </button>
                            <button
                              onClick={() => assignToGroup(img, gi, 'main')}
                              className="border border-ink-300 py-1 font-mono text-[10px] hover:border-flame hover:bg-flame hover:text-white"
                            >
                              {g.groupName}首图
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {!assigned && pairs1688.length > 2 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const [groupIdx, type] = e.target.value.split('-');
                          if (groupIdx && type) {
                            assignToGroup(img, parseInt(groupIdx), type as 'square' | 'main');
                          }
                        }}
                        className="mt-1 w-full border border-ink-300 px-1 py-1 font-mono text-[10px]"
                      >
                        <option value="">分配到...</option>
                        {pairs1688.map((g, gi) => (
                          <optgroup key={gi} label={g.groupName}>
                            <option value={`${gi}-square`}>方图</option>
                            <option value={`${gi}-main`}>首图</option>
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

        {/* 右侧：配对组 */}
        <section className="card-industrial p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="section-tag">GROUPS</span>
            <h2 className="text-lg font-bold">配对组</h2>
          </div>

          <div className="space-y-4">
            {pairs1688.map((group, i) => (
              <div key={i} className="border-2 border-ink-900 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="font-bold">{group.groupName}</span>
                  <div className="ml-auto flex items-center gap-2">
                    {group.squareImage && group.mainImage && (
                      <span className="flex items-center gap-1 font-mono text-[10px] text-green-600">
                        <Link2 className="h-3 w-3" /> 已配对
                      </span>
                    )}
                    {pairs1688.length > 2 && (
                      <button
                        onClick={() => handleRemoveGroup(i)}
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
                      image={group.squareImage}
                      thumbnail={group.squareImage ? thumbnails[group.squareImage.name] : null}
                      onRemove={() => removeFromGroup(i, 'square')}
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
                      image={group.mainImage}
                      thumbnail={group.mainImage ? thumbnails[group.mainImage.name] : null}
                      onRemove={() => removeFromGroup(i, 'main')}
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
            onClick={handleAddGroup}
            className="btn-outline mt-2 flex w-full items-center justify-center gap-1"
          >
            <Plus className="h-4 w-4" /> 添加组
          </button>

          <div className="mt-4 flex items-center gap-2 text-sm text-ink-500">
            {allPaired ? (
              <span className="text-green-600">✓ 所有组已配对完成</span>
            ) : (
              <span>请为每组分配方图和首图（可拖拽或点击按钮）</span>
            )}
          </div>
        </section>
      </div>

      <div className="flex justify-between">
        <button onClick={() => navigate('/classify')} className="btn-outline">
          返回分类
        </button>
        <button onClick={handleProceed} className="btn-industrial" disabled={!allPaired && images.length > 0}>
          确认配对，继续 <ChevronRight className="h-4 w-4" />
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
