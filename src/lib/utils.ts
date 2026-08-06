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
