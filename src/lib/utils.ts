import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 检查浏览器是否支持 File System Access API
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// 检查是否为图片文件
export function isImageFile(name: string): boolean {
  return /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(name);
}

// 检查是否为视频文件
export function isVideoFile(name: string): boolean {
  return /\.(mp4|mov|avi|mkv|flv|wmv|m4v|webm)$/i.test(name);
}

// 格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 数字补零
export function padZero(num: number, length: number = 2): string {
  return String(num).padStart(length, '0');
}

// 计算零售价 (基于成本价和利润率)
// 利润率 = 1 - 成本/售价 → 售价 = 成本 / (1 - 利润率)
export function calculateRetailPrice(costPrice: number, profitRate: number): number {
  if (costPrice <= 0) return 0;
  const price = costPrice / (1 - profitRate);
  // 保留一位小数，整数则保持整数
  const rounded = Math.round(price * 10) / 10;
  return rounded;
}

// 格式化价格: 保留一位小数，整数则显示整数
export function formatPrice(price: number): number {
  if (Number.isInteger(price)) return price;
  return Math.round(price * 10) / 10;
}

// 下载 Blob 为文件
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 主题选项
export const THEME_OPTIONS = [
  '圣诞', '万圣节', '情人节', '复活节', '感恩节',
  '独立日', '新年', '春节', '母亲节', '父亲节',
  '儿童节', '教师节', '万圣夜', '七夕', '中秋',
];

// 生成唯一ID
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ===================== 多SKU合并命名 =====================
// 规则：
// - 2个SKU：用&连接 (如 121&122)
// - 3+个连续SKU：用~连接 (如 121~123)
// - 3+个不连续SKU：用&连接 (如 121&122&124)
// - 混合情况：连续段(3+)用~，其余用&，各段间用&连接
export function generateMergedSkuName(productCodes: string[]): string {
  if (productCodes.length === 0) return '';
  if (productCodes.length === 1) return productCodes[0];

  const parts = productCodes.map(code => {
    const match = code.match(/^(.+)-(\d+)$/);
    return {
      prefix: match ? match[1] : code,
      suffix: match ? parseInt(match[2]) : null,
    };
  });

  const prefix = parts[0].prefix;
  const numbers = parts.map(p => p.suffix).filter((n): n is number => n !== null);

  if (numbers.length !== parts.length) {
    return productCodes.join('&');
  }

  const sorted = [...new Set(numbers)].sort((a, b) => a - b);

  const runs: number[][] = [];
  let currentRun: number[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      currentRun.push(sorted[i]);
    } else {
      runs.push(currentRun);
      currentRun = [sorted[i]];
    }
  }
  runs.push(currentRun);

  const nameParts = runs.map(run => {
    if (run.length >= 3) {
      return `${run[0]}~${run[run.length - 1]}`;
    }
    return run.join('&');
  });

  return `${prefix}-${nameParts.join('&')}`;
}

// 从款式编码和商品编码列表中提取合并命名
export function getMergedCodeFromProducts(codes: string[], styleCode: string): string {
  if (codes.length <= 1) return codes[0] || '';
  return generateMergedSkuName(codes);
}
