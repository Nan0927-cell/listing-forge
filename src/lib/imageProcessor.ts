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

// 单组分类逻辑（单SKU或多SKU的某一组）
function classifySingleGroup(
  files: ScannedFile[],
  styleCode: string,
  productCode: string,
  allCodes: string[],
  startOrder: number,
  groupIndex: number = 0,
  groupFolderName?: string
): { result: ClassifiedImage[]; nextOrder: number; attrImages: ClassifiedImage[] } {
  const result: ClassifiedImage[] = [];
  let order = startOrder;

  const sorted = [...files].sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
  );

  const categorized: { file: ScannedFile; category: ImageCategory; attrCode?: string }[] = [];

  for (const file of sorted) {
    const lowerName = file.name.toLowerCase();

    const baseName = file.name.replace(/\.[^.]+$/, '');
    let matchedCode: string | null = null;

    // 1. 精确匹配（大小写敏感）
    for (const code of allCodes) {
      if (baseName === code || baseName === code.replace(/-/g, '_')) {
        matchedCode = code;
        break;
      }
    }
    // 2. 精确匹配（大小写不敏感）
    if (!matchedCode) {
      for (const code of allCodes) {
        const lowerBase = baseName.toLowerCase();
        const lowerCode = code.toLowerCase();
        const lowerCodeUnd = code.replace(/-/g, '_').toLowerCase();
        if (lowerBase === lowerCode || lowerBase === lowerCodeUnd) {
          matchedCode = code;
          break;
        }
      }
    }
    // 3. 匹配组文件夹名
    if (!matchedCode && groupFolderName) {
      if (baseName === groupFolderName || baseName === groupFolderName.replace(/-/g, '_')) {
        matchedCode = groupFolderName;
      }
    }
    // 4. 关键词匹配：文件名包含"属性"或"attribute"
    if (!matchedCode && /属性|attribute/i.test(lowerName)) {
      // 尝试关联到具体SKU编码
      for (const code of allCodes) {
        if (baseName.includes(code) || baseName.includes(code.replace(/-/g, '_'))) {
          matchedCode = code;
          break;
        }
      }
      if (!matchedCode) {
        matchedCode = allCodes[groupIndex] || productCode;
      }
    }
    // 5. 宽松前缀匹配：文件名以SKU编码开头，后缀不是纯数字序列
    if (!matchedCode) {
      for (const code of allCodes) {
        if (baseName.startsWith(code)) {
          const suffix = baseName.slice(code.length);
          // 排除序列编号后缀（如 -01, _02, 03）
          if (!/^[-_]?\d+$/.test(suffix)) {
            matchedCode = code;
            break;
          }
        }
      }
    }
    if (matchedCode) {
      categorized.push({ file, category: 'attribute', attrCode: matchedCode });
      continue;
    }

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

  const hasMain = categorized.some((c) => c.category === 'main');
  if (!hasMain) {
    let mainCount = 0;
    let sceneCount = 0;
    let detailGridCount = 0;
    let detailCount = 0;

    for (const item of categorized) {
      if (item.category === 'attribute') continue;

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
      }
    }
  }

  // 先处理非属性图（顺序编号），属性图收集起来单独返回
  for (const item of categorized) {
    if (item.category === 'attribute') continue;

    const ext = item.file.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
    const newName = `${styleCode}-00-${padZero(order)}.${ext}`;
    result.push({
      file: item.file,
      category: item.category,
      newName,
      order: order,
      groupIndex,
    });
    order++;
  }

  // 收集属性图，由调用方统一放到最末尾
  const attrImages: ClassifiedImage[] = [];
  for (const item of categorized) {
    if (item.category !== 'attribute') continue;
    const ext = item.file.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
    attrImages.push({
      file: item.file,
      category: 'attribute',
      newName: `${item.attrCode || productCode}.${ext}`,
      order: 0,
      groupIndex,
    });
  }

  return { result, nextOrder: order, attrImages };
}

export function autoClassifyImages(
  files: ScannedFile[],
  styleCode: string,
  productCode: string,
  multiProductCodes?: string[]
): ClassifiedImage[] {
  const allCodes = multiProductCodes && multiProductCodes.length > 0
    ? multiProductCodes
    : [productCode];

  // 按路径第一段（SKU子文件夹名）分组
  const groupOrder: string[] = [];
  const groups = new Map<string, ScannedFile[]>();

  for (const file of files) {
    let groupName: string | null = null;
    if (file.path) {
      const pathParts = file.path.split('/');
      if (pathParts.length > 1) {
        groupName = pathParts[0];
      }
    }
    if (groupName === null) {
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const matched = allCodes.find(code => baseName === code || baseName === code.replace(/-/g, '_'));
      if (matched) groupName = matched;
    }
    if (groupName === null) {
      groupName = '_default';
    }

    if (!groups.has(groupName)) {
      groups.set(groupName, []);
      groupOrder.push(groupName);
    }
    groups.get(groupName)!.push(file);
  }

  // 只有一组时按单SKU处理
  if (groupOrder.length <= 1) {
    const groupName = groupOrder[0] || '_default';
    const groupFiles = groups.get(groupName) || files;
    const groupCode = allCodes.includes(groupName) ? groupName : productCode;
    const { result, attrImages } = classifySingleGroup(
      groupFiles, styleCode, groupCode, allCodes, 1, 0, groupName
    );
    return [...result, ...attrImages];
  }

  // 多组：按allCodes顺序排列，未匹配的组保持原序
  const originalOrder = new Map<string, number>();
  groupOrder.forEach((name, i) => originalOrder.set(name, i));

  groupOrder.sort((a, b) => {
    const idxA = allCodes.indexOf(a);
    const idxB = allCodes.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0);
  });

  // 按组顺序处理，组间编号接续，属性图统一收集
  let globalOrder = 1;
  let groupIdx = 0;
  const result: ClassifiedImage[] = [];
  const allAttrImages: ClassifiedImage[] = [];

  for (const groupName of groupOrder) {
    const groupFiles = groups.get(groupName)!;
    const groupCode = allCodes.includes(groupName) ? groupName : (allCodes[groupIdx] || groupName);

    const { result: groupResult, nextOrder, attrImages } = classifySingleGroup(
      groupFiles, styleCode, groupCode, allCodes, globalOrder, groupIdx, groupName
    );
    result.push(...groupResult);
    allAttrImages.push(...attrImages);
    globalOrder = nextOrder;
    groupIdx++;
  }

  // 所有属性图统一放在最末尾
  result.push(...allAttrImages);

  return result;
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
