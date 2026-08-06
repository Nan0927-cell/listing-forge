import type { ScannedFile, ClassifiedImage, ImageCategory } from '@/types';
import { padZero } from './utils';

// ===================== 加载图片 =====================

export function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    if (typeof src === 'string') {
      img.src = src;
    } else {
      img.src = URL.createObjectURL(src);
    }
  });
}

// ===================== 获取图片尺寸 =====================

export async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  const img = await loadImage(file);
  const { naturalWidth: width, naturalHeight: height } = img;
  URL.revokeObjectURL(img.src);
  return { width, height };
}

// ===================== Canvas转Blob =====================

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string = 'image/jpeg',
  quality: number = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      type,
      quality
    );
  });
}

// ===================== 调整图片尺寸 (等比缩放至目标尺寸内) =====================

export async function resizeImage(
  file: File | Blob,
  targetWidth: number,
  targetHeight: number,
  maintainAspect: boolean = true
): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d')!;

  // 白色背景
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  if (maintainAspect) {
    // 等比缩放，居中
    const scale = Math.min(
      targetWidth / img.naturalWidth,
      targetHeight / img.naturalHeight
    );
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const x = (targetWidth - w) / 2;
    const y = (targetHeight - h) / 2;
    ctx.drawImage(img, x, y, w, h);
  } else {
    // 拉伸到目标尺寸
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  }

  URL.revokeObjectURL(img.src);
  return canvasToBlob(canvas);
}

// ===================== 生成800x800方图 =====================

export async function resizeTo800(file: File | Blob): Promise<Blob> {
  return resizeImage(file, 800, 800, true);
}

// ===================== 生成750x757图 (750x750 + 底部扩展7px) =====================

export async function resizeTo750(file: File | Blob): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = 750;
  canvas.height = 757;
  const ctx = canvas.getContext('2d')!;

  // 白色背景
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 750, 757);

  // 等比缩放到750x750，居中
  const scale = Math.min(
    750 / img.naturalWidth,
    750 / img.naturalHeight
  );
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const x = (750 - w) / 2;
  const y = (750 - h) / 2;
  ctx.drawImage(img, x, y, w, h);

  URL.revokeObjectURL(img.src);
  return canvasToBlob(canvas);
}

// ===================== 自动分类图片 =====================

export function autoClassifyImages(
  files: ScannedFile[],
  productCode: string
): ClassifiedImage[] {
  const result: ClassifiedImage[] = [];
  let order = 1;

  // 按文件名排序
  const sorted = [...files].sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
  );

  // 尝试根据文件名关键词分类
  const categorized: { file: ScannedFile; category: ImageCategory }[] = [];

  for (const file of sorted) {
    const lowerName = file.name.toLowerCase();

    // 检查是否为属性图（文件名只包含商品编码，无序号）
    const baseName = file.name.replace(/\.[^.]+$/, ''); // 去扩展名
    if (baseName === productCode || baseName === productCode.replace(/-/g, '_')) {
      categorized.push({ file, category: 'attribute' });
      continue;
    }

    // 关键词匹配
    if (/主图|首图|main|primary|cover/i.test(lowerName)) {
      categorized.push({ file, category: 'main' });
    } else if (/场景|效果|scene|effect/i.test(lowerName)) {
      categorized.push({ file, category: 'scene' });
    } else if (/详情|四宫格|detail|grid/i.test(lowerName)) {
      categorized.push({ file, category: 'detail-grid' });
    } else if (/细节|close|detail-/i.test(lowerName)) {
      categorized.push({ file, category: 'detail' });
    } else if (/白底|white|纯白/i.test(lowerName)) {
      categorized.push({ file, category: 'white-bg' });
    } else {
      categorized.push({ file, category: 'unclassified' });
    }
  }

  // 如果没有关键词匹配，按顺序自动分类
  const hasMain = categorized.some((c) => c.category === 'main');
  if (!hasMain) {
    // 重新按顺序分类
    let mainCount = 0;
    let sceneCount = 0;
    let detailGridCount = 0;
    let detailCount = 0;
    let whiteBgCount = 0;

    for (const item of categorized) {
      if (item.category === 'attribute') {
        result.push({
          file: item.file,
          category: 'attribute',
          newName: productCode,
          order: 0,
        });
        continue;
      }

      // 按顺序分配类别
      if (mainCount < 1) {
        item.category = 'main';
        mainCount++;
      } else if (sceneCount < 2) {
        item.category = 'scene';
        sceneCount++;
      } else if (detailGridCount < 4) {
        item.category = 'detail-grid';
        detailGridCount++;
      } else if (detailCount < 6) {
        item.category = 'detail';
        detailCount++;
      } else {
        item.category = 'white-bg';
        whiteBgCount++;
      }
    }
  }

  // 生成新文件名
  const categoryOrder: ImageCategory[] = [
    'main',
    'scene',
    'detail-grid',
    'detail',
    'white-bg',
  ];

  const categoryCounts: Record<string, number> = {};
  for (const item of categorized) {
    if (item.category === 'attribute') {
      if (!result.find((r) => r.file === item.file)) {
        result.push({
          file: item.file,
          category: 'attribute',
          newName: productCode,
          order: 0,
        });
      }
      continue;
    }

    if (!categoryCounts[item.category]) {
      categoryCounts[item.category] = 0;
    }
    categoryCounts[item.category]++;

    const catIndex = categoryOrder.indexOf(item.category);
    // 计算全局序号
    let globalOrder = 0;
    for (let i = 0; i < catIndex; i++) {
      globalOrder += categoryCounts[categoryOrder[i]] || 0;
    }
    const localIndex = categoryCounts[item.category];
    globalOrder = order++;

    // 保留原扩展名
    const ext = item.file.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
    const newName = `${productCode}-${padZero(globalOrder)}.${ext}`;

    if (!result.find((r) => r.file === item.file)) {
      result.push({
        file: item.file,
        category: item.category,
        newName,
        order: globalOrder,
      });
    }
  }

  return result.sort((a, b) => a.order - b.order);
}

// ===================== 生成缩略图URL =====================

export async function createThumbnailUrl(
  file: File,
  maxSize: number = 120
): Promise<string> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight);
  canvas.width = img.naturalWidth * scale;
  canvas.height = img.naturalHeight * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// ===================== 判断是否为方图 =====================

export async function isSquareImage(file: File): Promise<boolean> {
  const { width, height } = await getImageDimensions(file);
  return Math.abs(width - height) <= 5; // 允许5px误差
}
