import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { createThumbnailUrl, isSquareImage } from '@/lib/imageProcessor';
import { cn } from '@/lib/utils';
import type { Pair1688, ScannedFile } from '@/types';
import { ChevronRight, Image as ImageIcon, Users, Link2, Unlink } from 'lucide-react';
import ImagePreview from '@/components/ImagePreview';

export default function Pair() {
  const navigate = useNavigate();
  const {
    scanResult, pairs1688, setPairs1688, setStepStatus,
  } = useStore();

  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [squareFlags, setSquareFlags] = useState<Record<string, boolean>>({});
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // 初始化配对
  useEffect(() => {
    if (scanResult && scanResult.folder1688.length > 0 && pairs1688.length === 0) {
      const images = scanResult.folder1688;
      const groups: Pair1688[] = [
        { squareImage: null, mainImage: null, groupName: '陈悦组' },
        { squareImage: null, mainImage: null, groupName: '杜青组' },
      ];

      // 尝试自动配对
      let groupIdx = 0;
      for (const img of images) {
        if (groupIdx >= 2) break;
        const isSq = squareFlags[img.name];
        if (isSq === undefined) continue;
        if (isSq && !groups[groupIdx].squareImage) {
          groups[groupIdx].squareImage = img;
        } else if (!isSq && !groups[groupIdx].mainImage) {
          groups[groupIdx].mainImage = img;
        }
        if (groups[groupIdx].squareImage && groups[groupIdx].mainImage) {
          groupIdx++;
        }
      }

      setPairs1688(groups);
    }
  }, [scanResult, squareFlags]);

  // 生成缩略图和检测方图
  useEffect(() => {
    if (!scanResult || scanResult.folder1688.length === 0) return;
    const images = scanResult.folder1688;

    (async () => {
      const newThumbs: Record<string, string> = {};
      const newFlags: Record<string, boolean> = {};
      for (const img of images) {
        try {
          newThumbs[img.name] = await createThumbnailUrl(img.file, 300);
          newFlags[img.name] = await isSquareImage(img.file);
        } catch {}
      }
      setThumbnails((prev) => ({ ...prev, ...newThumbs }));
      setSquareFlags((prev) => ({ ...prev, ...newFlags }));
    })();
  }, [scanResult]);

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

  const images = scanResult.folder1688;

  // 分配方图到组
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
          将1688文件夹中的方图和首图分别配对到陈悦组和杜青组，各2张一一对应。
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
                const isSq = squareFlags[img.name];
                return (
                  <div
                    key={i}
                    className={cn(
                      'border-2 p-2 transition-colors',
                      assigned
                        ? 'border-ink-300 opacity-40'
                        : 'border-ink-900 hover:border-flame'
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
                      {isSq !== undefined && (
                        <span className={cn(
                          'absolute right-1 top-1 px-1.5 py-0.5 font-mono text-[9px] font-bold',
                          isSq ? 'bg-flame text-white' : 'bg-steel text-white'
                        )}>
                          {isSq ? '方图' : '首图'}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] font-medium">{img.name}</div>
                    {!assigned && (
                      <div className="mt-2 flex gap-1">
                        <button
                          onClick={() => assignToGroup(img, 0, isSq ? 'square' : 'main')}
                          className="flex-1 border border-ink-300 py-1 font-mono text-[10px] hover:border-flame hover:text-flame"
                        >
                          → 陈悦
                        </button>
                        <button
                          onClick={() => assignToGroup(img, 1, isSq ? 'square' : 'main')}
                          className="flex-1 border border-ink-300 py-1 font-mono text-[10px] hover:border-flame hover:text-flame"
                        >
                          → 杜青
                        </button>
                      </div>
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
                  {group.squareImage && group.mainImage && (
                    <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-green-600">
                      <Link2 className="h-3 w-3" /> 已配对
                    </span>
                  )}
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
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-ink-500">
            {allPaired ? (
              <span className="text-green-600">✓ 所有组已配对完成</span>
            ) : (
              <span>请为每组分配方图和首图</span>
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
}: {
  image: ScannedFile | null;
  thumbnail: string | null;
  onRemove: () => void;
}) {
  if (!image) {
    return (
      <div className="flex aspect-square items-center justify-center border-2 border-dashed border-ink-300 bg-bone-50">
        <ImageIcon className="h-6 w-6 text-ink-300" />
      </div>
    );
  }
  return (
    <div className="relative border-2 border-ink-900">
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
