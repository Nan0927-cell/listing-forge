import type { ScanResult, ScannedFile, ScannedFolder } from '@/types';
import { isImageFile, isVideoFile } from './utils';

// ===================== 目录选择 =====================

export async function pickDirectory(): Promise<any | null> {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('当前浏览器不支持文件系统访问API，请使用Chrome或Edge浏览器');
  }
  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
    });
    return handle;
  } catch (e: any) {
    if (e.name === 'AbortError') return null;
    throw e;
  }
}

// ===================== 目录扫描 =====================

export async function scanDirectory(
  dirHandle: any,
  basePath: string = ''
): Promise<ScanResult> {
  const result: ScanResult = {
    folders: [],
    folder1200: [],
    folder1688: [],
    videos: [],
    ozonFiles: [],
    otherFolders: [],
    totalFiles: 0,
  };

  const allFolders: ScannedFolder[] = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      const folderFiles: ScannedFile[] = [];
      let fileCount = 0;
      try {
        for await (const subEntry of entry.values()) {
          if (subEntry.kind === 'file') {
            fileCount++;
            const file = await subEntry.getFile();
            const scanned: ScannedFile = {
              name: subEntry.name,
              file,
              path: `${basePath}${entry.name}/${subEntry.name}`,
              size: file.size,
              type: file.type,
            };
            folderFiles.push(scanned);
          }
        }
      } catch (e) {
        console.warn(`无法扫描文件夹: ${entry.name}`, e);
      }

      const folderInfo: ScannedFolder = {
        name: entry.name,
        handle: entry,
        fileCount,
      };
      allFolders.push(folderInfo);

      // 分类文件夹
      const lowerName = entry.name.toLowerCase().replace(/\s/g, '');
      if (lowerName === '1200') {
        result.folder1200 = folderFiles.filter((f) => isImageFile(f.name));
        result.folders.push(folderInfo);
      } else if (lowerName === '1688') {
        result.folder1688 = folderFiles.filter((f) => isImageFile(f.name));
        result.folders.push(folderInfo);
      } else if (lowerName === 'ozon') {
        result.ozonFiles = folderFiles;
        result.folders.push(folderInfo);
      } else {
        result.otherFolders.push(folderInfo);
      }
    } else if (entry.kind === 'file') {
      // 根目录下的文件
      const file = await entry.getFile();
      const scanned: ScannedFile = {
        name: entry.name,
        file,
        path: `${basePath}${entry.name}`,
        size: file.size,
        type: file.type,
      };

      if (isVideoFile(entry.name)) {
        result.videos.push(scanned);
      }
      // 图片在根目录的也归入1200（如果1200文件夹不存在）
      if (isImageFile(entry.name) && result.folder1200.length === 0) {
        result.folder1200.push(scanned);
      }
    }
  }

  // 检查根目录下是否有"视频"文件夹
  const videoFolder = allFolders.find(f => f.name === '视频' || f.name.toLowerCase().replace(/\s/g, '') === 'video');
  if (videoFolder) {
    try {
      for await (const entry of videoFolder.handle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          if (isVideoFile(entry.name)) {
            result.videos.push({
              name: entry.name,
              file,
              path: `${videoFolder.name}/${entry.name}`,
              size: file.size,
              type: file.type,
            });
          }
        }
      }
    } catch (e) {
      console.warn('无法扫描视频文件夹', e);
    }
  }

  // 如果没有找到1200/1688/ozon文件夹，但有其他文件夹，尝试在子文件夹中查找
  // 支持多SKU结构：父文件夹下每个SKU子文件夹内含1200/1688/ozon/视频
  if (result.folder1200.length === 0 && result.folder1688.length === 0) {
    for (const folder of result.otherFolders) {
      try {
        let has1200 = false;
        let has1688 = false;
        for await (const subEntry of folder.handle.values()) {
          if (subEntry.kind === 'directory') {
            const lowerName = subEntry.name.toLowerCase().replace(/\s/g, '');
            if (lowerName === '1200' || lowerName === '1688' || lowerName === 'ozon' || lowerName === '视频' || lowerName === 'video' || lowerName === 'videos' || lowerName === '视频文件') {
              const subFiles: ScannedFile[] = [];
              for await (const fileEntry of subEntry.values()) {
                if (fileEntry.kind === 'file') {
                  const file = await fileEntry.getFile();
                  subFiles.push({
                    name: fileEntry.name,
                    file,
                    path: `${folder.name}/${subEntry.name}/${fileEntry.name}`,
                    size: file.size,
                    type: file.type,
                  });
                }
              }
              if (lowerName === '1200') {
                // 多SKU模式：追加而非覆盖，按完整路径去重
                const images = subFiles.filter((f) => isImageFile(f.name));
                const existingPaths = new Set(result.folder1200.map(f => f.path));
                for (const img of images) {
                  if (!existingPaths.has(img.path)) {
                    result.folder1200.push(img);
                    existingPaths.add(img.path);
                  }
                }
                has1200 = true;
              } else if (lowerName === '1688') {
                const images = subFiles.filter((f) => isImageFile(f.name));
                const existingPaths = new Set(result.folder1688.map(f => f.path));
                for (const img of images) {
                  if (!existingPaths.has(img.path)) {
                    result.folder1688.push(img);
                    existingPaths.add(img.path);
                  }
                }
                has1688 = true;
              } else if (lowerName === 'ozon') {
                const existingPaths = new Set(result.ozonFiles.map(f => f.path));
                for (const f of subFiles) {
                  if (!existingPaths.has(f.path)) {
                    result.ozonFiles.push(f);
                    existingPaths.add(f.path);
                  }
                }
              } else if (lowerName === '视频' || lowerName === 'video' || lowerName === 'videos' || lowerName === '视频文件') {
                const existingPaths = new Set(result.videos.map(f => f.path));
                for (const f of subFiles) {
                  if (isVideoFile(f.name) && !existingPaths.has(f.path)) {
                    result.videos.push(f);
                    existingPaths.add(f.path);
                  }
                }
              }
            } else if (subEntry.kind === 'directory') {
              // 未匹配已知文件夹名的子文件夹：检查是否含视频文件
              try {
                for await (const fileEntry of subEntry.values()) {
                  if (fileEntry.kind === 'file') {
                    const file = await fileEntry.getFile();
                    if (isVideoFile(fileEntry.name)) {
                      const scanned: ScannedFile = {
                        name: fileEntry.name,
                        file,
                        path: `${folder.name}/${subEntry.name}/${fileEntry.name}`,
                        size: file.size,
                        type: file.type,
                      };
                      const existingPaths = new Set(result.videos.map(f => f.path));
                      if (!existingPaths.has(scanned.path)) {
                        result.videos.push(scanned);
                      }
                    }
                  }
                }
              } catch { /* 忽略 */ }
            }
          }
        }
        // 如果该子文件夹包含1200或1688，则视为SKU文件夹
        if (has1200 || has1688) {
          // SKU文件夹已处理
        }
      } catch (e) {
        console.warn(`无法扫描子文件夹: ${folder.name}`, e);
      }
    }
  }

  result.totalFiles =
    result.folder1200.length +
    result.folder1688.length +
    result.videos.length +
    result.ozonFiles.length;

  return result;
}

// ===================== 文件读取 =====================

export async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

export async function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===================== 文件写入 =====================

export async function writeFileToDir(
  dirHandle: any,
  fileName: string,
  data: Blob | ArrayBuffer | string
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

// ===================== 目录创建 =====================

export async function createDirectory(
  dirHandle: any,
  dirName: string
): Promise<any> {
  return await dirHandle.getDirectoryHandle(dirName, { create: true });
}

export async function getOrCreateDir(
  dirHandle: any,
  path: string[]
): Promise<any> {
  let current = dirHandle;
  for (const segment of path) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

// ===================== 拖放支持 =====================

export async function handleDropItems(
  items: DataTransferItemList
): Promise<{ dirHandle: any | null; dirName: string; files: File[] }> {
  const arr = Array.from(items);

  for (const item of arr) {
    if (item.kind === 'file') {
      // 尝试使用 File System Access API
      if ('getAsFileSystemHandle' in item) {
        try {
          const handle = await (item as any).getAsFileSystemHandle();
          if (handle && handle.kind === 'directory') {
            return { dirHandle: handle, dirName: handle.name, files: [] };
          }
        } catch (e) {
          console.warn('getAsFileSystemHandle failed', e);
        }
      }

      // 回退到 webkitGetAsEntry
      const entry = item.webkitGetAsEntry?.();
      if (entry && entry.isDirectory) {
        // 对于目录，我们只能通过 input 元素回退
        return { dirHandle: null, dirName: entry.name, files: [] };
      }
    }
  }

  // 如果没有目录，收集文件
  const files: File[] = [];
  for (const item of arr) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return { dirHandle: null, dirName: '', files };
}

// ===================== 列出目录内容 =====================

export async function listDirectoryContents(
  dirHandle: any
): Promise<{ name: string; kind: string }[]> {
  const contents: { name: string; kind: string }[] = [];
  for await (const entry of dirHandle.values()) {
    contents.push({ name: entry.name, kind: entry.kind });
  }
  return contents;
}

// ===================== 删除目录条目 =====================

export async function removeEntry(
  dirHandle: any,
  name: string,
  recursive: boolean = true
): Promise<void> {
  await dirHandle.removeEntry(name, { recursive });
}

// ===================== 重命名目录 (创建新名称, 移动内容) =====================

export async function renameDirectory(
  parentHandle: any,
  oldName: string,
  newName: string
): Promise<any> {
  const oldHandle = await parentHandle.getDirectoryHandle(oldName);
  const newHandle = await parentHandle.getDirectoryHandle(newName, { create: true });

  // 复制所有文件
  for await (const entry of oldHandle.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      const buffer = await file.arrayBuffer();
      const newFileHandle = await newHandle.getFileHandle(entry.name, { create: true });
      const writable = await newFileHandle.createWritable();
      await writable.write(buffer);
      await writable.close();
    }
  }

  // 删除旧目录
  await parentHandle.removeEntry(oldName, { recursive: true });
  return newHandle;
}
