import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import {
  writeFileToDir, createDirectory, getOrCreateDir, removeEntry,
} from '@/lib/fileSystem';
import { cn, generateMergedSkuName } from '@/lib/utils';
import type { ExportGroup, ExportItem, ExportChild, Pair1688, ScannedFile } from '@/types';
import {
  ChevronRight, ChevronDown, Loader2, CheckCircle2, FolderTree,
  Download, Folder, FileText, Image as ImageIcon,
  Video, Package, RotateCcw,
} from 'lucide-react';

export default function ExportPage() {
  const navigate = useNavigate();
  const {
    productInfo, scanResult, classifiedImages, pairs1688,
    processResult, tableResults, fillTables,
    outputDirHandle, outputDirName,
    setStepStatus, setError, resetAll,
    showProgress, updateProgress, hideProgress, addHistory,
    listingMode, multiProductInfos,
  } = useStore();

  // 多SKU合并编码
  const isMulti = listingMode !== 'single' && multiProductInfos.length > 1;
  const mergedCode = isMulti
    ? generateMergedSkuName(multiProductInfos.map(p => p.productCode).filter(c => c.trim()))
    : productInfo.productCode;

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentGroup, setCurrentGroup] = useState('');
  const [done, setDone] = useState(false);

  if (!processResult || !scanResult) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-ink-400">请先完成前面的步骤</p>
        <button onClick={() => navigate('/')} className="btn-outline mt-4">返回工作台</button>
      </div>
    );
  }

  const baseInfo = isMulti ? multiProductInfos[0] : productInfo;
  const { category, productLine } = baseInfo;
  const lineLabel = `产品线${productLine}`;

  // 递归统计子项文件数
  const countChildrenFiles = (children: ExportChild[]): number => {
    return children.reduce((sum, child) => {
      if (child.children) return sum + countChildrenFiles(child.children);
      return sum + 1;
    }, 0);
  };

  // 获取1200图片文件 (重命名后，包含属性图)
  const get1200Files = (): ExportChild[] => {
    return classifiedImages
      .map(img => ({ name: img.newName, blob: img.file.file }));
  };

  // 获取1688配对图片文件
  // multiA(同款不同数): 直接返回所有图片，不分SKU子文件夹
  // multiB(普通多SKU): 按SKU分组，每组一个子文件夹
  const get1688Files = (): ExportChild[] => {
    if (!scanResult) return [];
    const pairedFiles = new Set<string>();

    // 按文件路径分组1688图片（和Pair.tsx相同的逻辑）
    const imgGroupMap = new Map<string, ScannedFile[]>();
    for (const img of scanResult.folder1688) {
      const pathParts = img.path.split('/');
      const groupKey = pathParts.length > 2 ? pathParts[0] : 'default';
      if (!imgGroupMap.has(groupKey)) imgGroupMap.set(groupKey, []);
      imgGroupMap.get(groupKey)!.push(img);
    }

    const imgGroups = Array.from(imgGroupMap.entries()).map(([key, files], index) => ({
      key,
      files,
      index,
      skuCode: isMulti
        ? (multiProductInfos[index]?.productCode || key)
        : productInfo.productCode,
    }));

    // 按 groupIndex 分组配对
    const pairGroupMap = new Map<number, Pair1688[]>();
    for (const pair of pairs1688) {
      const gi = pair.groupIndex ?? 0;
      if (!pairGroupMap.has(gi)) pairGroupMap.set(gi, []);
      pairGroupMap.get(gi)!.push(pair);
    }

    // multiA: 直接返回所有图片，不分SKU子文件夹
    if (listingMode === 'multiA') {
      const flatChildren: ExportChild[] = [];
      for (const imgGroup of imgGroups) {
        const groupPairs = pairGroupMap.get(imgGroup.index) || [];
        for (const pair of groupPairs) {
          if (pair.squareImage) {
            const ext = pair.squareImage.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
            flatChildren.push({ name: `${pair.groupName}方图.${ext}`, blob: pair.squareImage.file });
            pairedFiles.add(pair.squareImage.name);
          }
          if (pair.mainImage) {
            const ext = pair.mainImage.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
            flatChildren.push({ name: `${pair.groupName}首图.${ext}`, blob: pair.mainImage.file });
            pairedFiles.add(pair.mainImage.name);
          }
        }
        for (const img of imgGroup.files) {
          if (!pairedFiles.has(img.name)) {
            flatChildren.push({ name: img.name, blob: img.file });
          }
        }
      }
      return flatChildren;
    }

    // multiB / single: 按SKU子文件夹组织
    const children: ExportChild[] = [];
    for (const imgGroup of imgGroups) {
      const skuChildren: ExportChild[] = [];
      const groupPairs = pairGroupMap.get(imgGroup.index) || [];
      for (const pair of groupPairs) {
        if (pair.squareImage) {
          const ext = pair.squareImage.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
          skuChildren.push({ name: `${pair.groupName}方图.${ext}`, blob: pair.squareImage.file });
          pairedFiles.add(pair.squareImage.name);
        }
        if (pair.mainImage) {
          const ext = pair.mainImage.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
          skuChildren.push({ name: `${pair.groupName}首图.${ext}`, blob: pair.mainImage.file });
          pairedFiles.add(pair.mainImage.name);
        }
      }
      for (const img of imgGroup.files) {
        if (!pairedFiles.has(img.name)) {
          skuChildren.push({ name: img.name, blob: img.file });
        }
      }
      children.push({ name: imgGroup.skuCode, children: skuChildren });
    }

    return children;
  };

  // 获取视频文件
  const getVideoFiles = (): ExportChild[] => {
    return scanResult.videos.map(v => ({ name: v.name, blob: v.file }));
  };

  // 获取OZON文件 — 按顺序重命名避免不同SKU同名文件覆盖
  const getOzonFiles = (): ExportChild[] => {
    return scanResult.ozonFiles.map((f, i) => {
      const ext = f.name.match(/\.([^.]+)$/)?.[1] || 'jpg';
      return { name: `${i + 1}.${ext}`, blob: f.file };
    });
  };

  // 构建导出结构
  const buildExportGroups = (): ExportGroup[] => {
    const groups: ExportGroup[] = [];

    const has1688 = scanResult.folder1688.length > 0;

    // 组1: 商品编码-S-产品线N (仅当有1688文件夹时生成)
    if (has1688) {
      const group1Name = `${mergedCode}-S-${lineLabel}`;
      const group1Items: ExportItem[] = [
        // 1688文件夹：内含SKU子文件夹，替换已有同名文件夹
        { type: 'folder', name: mergedCode, source: '1688文件夹(SKU分组)', children: get1688Files(), replaceIfExists: true },
        { type: 'folder', name: processResult.videoFolderName, source: '视频文件夹', children: getVideoFiles() },
      ];
      if (fillTables && tableResults[1]) {
        group1Items.push({
          type: 'file' as const,
          name: `${tableResults[1].name}.xlsx`,
          source: '表二',
          blob: new Blob([tableResults[1].buffer]),
        });
      }
      group1Items.push({ type: 'folder' as const, name: 'gprs实拍图', source: '空文件夹', children: [] });
      group1Items.push({ type: 'folder' as const, name: '包装图', source: '空文件夹', children: [] });
      groups.push({ folderName: group1Name, items: group1Items });
    }

    // 组2: 商品编码-品类-ozon-产品线N (仅当有ozon时)
    if (processResult.ozonRenamed && scanResult.ozonFiles.length > 0) {
      const group2Name = `${mergedCode}-${category || '未分类'}-ozon-${lineLabel}`;
      groups.push({
        folderName: group2Name,
        items: [
          { type: 'folder', name: processResult.videoFolderName, source: '视频文件夹', children: getVideoFiles() },
          { type: 'folder', name: '900 1200', source: 'OZON文件夹', children: getOzonFiles() },
        ],
      });
    }

    // 组3: 商品编码-品类-刊登资料
    const group3Name = `${mergedCode}-${category || '未分类'}-刊登资料`;
    const group3Items: ExportItem[] = [
      { type: 'folder', name: '750', source: '750图片', children: processResult.folder750.map(f => ({ name: f.name, blob: f.blob })) },
      { type: 'folder', name: '800', source: '800图片', children: processResult.folder800.map(f => ({ name: f.name, blob: f.blob })) },
      { type: 'folder', name: '1200', source: '1200图片', children: get1200Files() },
      { type: 'folder', name: processResult.videoFolderName, source: '视频文件夹', children: getVideoFiles() },
    ];
    if (fillTables && tableResults[2]) {
      group3Items.push({
        type: 'file' as const,
        name: `${tableResults[2].name}.xlsx`,
        source: '表三',
        blob: new Blob([tableResults[2].buffer]),
      });
    }
    groups.push({ folderName: group3Name, items: group3Items });

    // 组4: 商品编码-PDD-产品线N
    const group4Name = `${mergedCode}-PDD-${lineLabel}`;
    const group4Items: ExportItem[] = [
      { type: 'folder', name: '1200', source: '1200图片', children: get1200Files() },
      { type: 'folder', name: processResult.videoFolderName, source: '视频文件夹', children: getVideoFiles() },
    ];
    if (fillTables && tableResults[0]) {
      group4Items.push({
        type: 'file' as const,
        name: `${tableResults[0].name}.xlsx`,
        source: '表一',
        blob: new Blob([tableResults[0].buffer]),
      });
    }
    group4Items.push({ type: 'folder' as const, name: '包装图', source: '空文件夹', children: [] });
    groups.push({ folderName: group4Name, items: group4Items });

    return groups;
  };

  const groups = buildExportGroups();

  // 递归统计导出文件总数
  const countExportFiles = (items: ExportItem[]): number => {
    return items.reduce((sum, item) => {
      if (item.type === 'folder' && item.children) {
        return sum + countChildrenFiles(item.children);
      }
      return sum + 1;
    }, 0);
  };

  const totalExportFiles = groups.reduce((sum, g) => sum + countExportFiles(g.items), 0);

  // 递归写入子项
  const writeChildrenRecursive = async (dirHandle: any, children: ExportChild[]): Promise<number> => {
    let count = 0;
    for (const child of children) {
      if (child.children) {
        const subDir = await createDirectory(dirHandle, child.name);
        count += await writeChildrenRecursive(subDir, child.children);
      } else if (child.blob) {
        await writeFileToDir(dirHandle, child.name, child.blob);
        count++;
      }
    }
    return count;
  };

  // 执行导出
  const handleExport = async () => {
    if (!outputDirHandle) {
      setError('请先选择输出文件夹');
      return;
    }

    setExporting(true);
    setError(null);
    setProgress(0);
    showProgress('导出文件中...', totalExportFiles);

    try {
      let completed = 0;

      for (const group of groups) {
        setCurrentGroup(group.folderName);

        // 创建组文件夹
        const groupDir = await createDirectory(outputDirHandle, group.folderName);

        for (const item of group.items) {
          if (item.type === 'folder' && item.children) {
            // 如果需要替换已有文件夹，先删除
            if ((item as any).replaceIfExists) {
              try {
                await removeEntry(groupDir, item.name, true);
              } catch { /* 文件夹不存在，正常 */ }
            }
            const subDir = await createDirectory(groupDir, item.name);
            const written = await writeChildrenRecursive(subDir, item.children);
            completed += written;
            updateProgress(completed, `正在导出: ${item.name}`);
            setProgress(Math.round((completed / totalExportFiles) * 100));
          } else if (item.type === 'file' && item.blob) {
            await writeFileToDir(groupDir, item.name, item.blob);
            completed++;
            updateProgress(completed, `正在导出: ${item.name}`);
            setProgress(Math.round((completed / totalExportFiles) * 100));
          }
        }
      }

      addHistory({
        productInfo: baseInfo,
        fileCount: {
          folder1200: scanResult.folder1200.length,
          folder1688: scanResult.folder1688.length,
          videos: scanResult.videos.length,
          ozonFiles: scanResult.ozonFiles.length,
        },
        fillTables,
        status: 'completed',
      });

      setDone(true);
      setStepStatus('export', 'done');
    } catch (e: any) {
      setError(`导出失败: ${e.message}`);
    } finally {
      setExporting(false);
      setCurrentGroup('');
      hideProgress();
    }
  };

  const handleReset = () => {
    resetAll();
    navigate('/');
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="section-tag mb-2">06 · EXPORT</div>
        <h1 className="text-3xl font-bold tracking-tightest">归类导出</h1>
        <p className="mt-1 text-sm text-ink-500">
          将处理后的文件按规则归类到对应文件夹，导出到指定位置。
        </p>
      </div>

      {/* 输出位置 */}
      <div className="card-industrial p-4">
        <div className="flex items-center gap-3">
          <Folder className="h-5 w-5 text-ink-500" />
          <div>
            <div className="font-mono text-[10px] uppercase tracking-industrial text-ink-500">OUTPUT</div>
            <div className="text-sm font-bold">{outputDirName || '未选择'}</div>
          </div>
          {!outputDirHandle && (
            <button onClick={() => navigate('/')} className="btn-outline ml-auto text-xs">
              去选择
            </button>
          )}
        </div>
      </div>

      {/* 导出预览 */}
      <TreePreview groups={groups} />

      {/* 导出进度 */}
      {(exporting || done) && (
        <section className="card-industrial p-5">
          <div className="mb-3 flex items-center gap-2">
            {done ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-flame" />
            )}
            <h2 className="text-lg font-bold">
              {done ? '导出完成' : '导出中...'}
            </h2>
          </div>

          {/* 进度条 */}
          <div className="mb-2">
            <div className="flex justify-between font-mono text-xs text-ink-500">
              <span>{currentGroup || (done ? '完成' : '准备中')}</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-1 h-3 border-2 border-ink-900 bg-bone-100">
              <div
                className={cn('h-full transition-all', done ? 'bg-green-600' : 'bg-flame')}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </section>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-between">
        <button onClick={() => navigate('/tables')} className="btn-outline">
          返回表格
        </button>
        {!done ? (
          <button
            onClick={handleExport}
            disabled={exporting || !outputDirHandle}
            className="btn-flame px-8"
          >
            {exporting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> 导出中...</>
            ) : (
              <><Download className="h-4 w-4" /> 执行导出</>
            )}
          </button>
        ) : (
          <div className="flex gap-3">
            <button onClick={handleReset} className="btn-outline">
              <RotateCcw className="h-4 w-4" /> 新建任务
            </button>
          </div>
        )}
      </div>

      {/* 完成提示 */}
      {done && (
        <div className="border-2 border-green-600 bg-green-50 p-5 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-600" />
          <h3 className="text-lg font-bold text-green-700">导出完成！</h3>
          <p className="mt-1 text-sm text-ink-600">
            所有文件已成功导出到「{outputDirName}」文件夹
          </p>
        </div>
      )}
    </div>
  );
}

// ===================== 文件类型判断 =====================
function getFileType(name: string): 'image' | 'video' | 'excel' | 'file' {
  const ext = name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm'].includes(ext)) return 'video';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel';
  return 'file';
}

// ===================== 文件类型图标 =====================
function FileTypeIcon({
  type,
  className,
}: {
  type: 'image' | 'video' | 'excel' | 'file';
  className?: string;
}) {
  if (type === 'image') return <ImageIcon className={className} />;
  if (type === 'video') return <Video className={className} />;
  return <FileText className={className} />;
}

// ===================== 树节点数据类型 =====================
interface TreeNodeData {
  name: string;
  type: 'folder' | 'file';
  fileType?: 'image' | 'video' | 'excel' | 'file';
  children?: TreeNodeData[];
  source?: string;
  fileCount?: number;
}

// 递归构建ExportChild的树形数据
function buildChildTreeData(children: ExportChild[]): TreeNodeData[] {
  return children.map((child) => {
    if (child.children) {
      return {
        name: child.name,
        type: 'folder' as const,
        fileCount: countChildrenFilesRecursive(child.children),
        children: buildChildTreeData(child.children),
      };
    }
    return {
      name: child.name,
      type: 'file' as const,
      fileType: getFileType(child.name),
    };
  });
}

function countChildrenFilesRecursive(children: ExportChild[]): number {
  return children.reduce((sum, child) => {
    if (child.children) return sum + countChildrenFilesRecursive(child.children);
    return sum + 1;
  }, 0);
}

// ===================== 构建树形数据 =====================
function buildTreeData(groups: ExportGroup[]): TreeNodeData[] {
  return groups.map((group) => {
    const fileCount = group.items.reduce((s, item) => {
      if (item.type === 'folder' && item.children) {
        return s + countChildrenFilesRecursive(item.children);
      }
      return s + 1;
    }, 0);

    return {
      name: group.folderName,
      type: 'folder' as const,
      fileCount,
      children: group.items.map((item) => {
        if (item.type === 'folder' && item.children) {
          return {
            name: item.name,
            type: 'folder' as const,
            source: item.source,
            fileCount: countChildrenFilesRecursive(item.children),
            children: buildChildTreeData(item.children),
          };
        }
        return {
          name: item.name,
          type: 'file' as const,
          fileType: getFileType(item.name),
          source: item.source,
        };
      }),
    };
  });
}

// ===================== 递归树节点组件 =====================
interface TreeNodeProps {
  node: TreeNodeData;
  depth: number;
  nodeKey: string;
  collapsed: Set<string>;
  toggleNode: (key: string) => void;
}

function TreeNode({ node, depth, nodeKey, collapsed, toggleNode }: TreeNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = !collapsed.has(nodeKey);

  return (
    <div>
      {/* 节点行 */}
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 pr-3 transition-colors',
          depth === 0 && 'border-b-2 border-ink-900 bg-ink-900 px-3',
          depth === 1 && 'border-b border-ink-200 bg-white',
          depth >= 2 && 'border-b border-ink-100 bg-bone-50'
        )}
        style={depth > 0 ? { paddingLeft: `${depth * 18 + 12}px` } : undefined}
      >
        {/* 展开/折叠按钮 */}
        {hasChildren ? (
          <button
            onClick={() => toggleNode(nodeKey)}
            className="shrink-0 cursor-pointer"
            aria-label={isExpanded ? '折叠' : '展开'}
          >
            {isExpanded ? (
              <ChevronDown
                className={cn('h-3.5 w-3.5', depth === 0 ? 'text-bone' : 'text-ink-500')}
              />
            ) : (
              <ChevronRight
                className={cn('h-3.5 w-3.5', depth === 0 ? 'text-bone' : 'text-ink-500')}
              />
            )}
          </button>
        ) : (
          <span className="inline-block w-3.5 shrink-0" />
        )}

        {/* 文件夹/文件图标 */}
        {node.type === 'folder' ? (
          <Folder
            className={cn('h-4 w-4 shrink-0', depth === 0 ? 'text-flame' : 'text-steel')}
          />
        ) : (
          <FileTypeIcon
            type={node.fileType || 'file'}
            className={cn(
              'h-4 w-4 shrink-0',
              node.fileType === 'excel' || node.fileType === 'file'
                ? 'text-flame'
                : 'text-ink-400'
            )}
          />
        )}

        {/* 名称 */}
        <span
          className={cn(
            'truncate',
            depth === 0
              ? 'font-mono text-xs font-bold text-bone'
              : 'text-sm font-medium text-ink-700'
          )}
        >
          {node.name}
        </span>

        {/* 文件数量统计 */}
        {node.fileCount !== undefined && node.fileCount > 0 && (
          <span
            className={cn(
              'font-mono text-[11px]',
              depth === 0 ? 'text-bone/50' : 'text-ink-400'
            )}
          >
            ({node.fileCount} 文件)
          </span>
        )}

        {/* 来源标签 */}
        {node.source && depth < 2 && (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-industrial text-ink-400">
            {node.source}
          </span>
        )}
      </div>

      {/* 子节点（递归渲染） */}
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child, i) => (
            <TreeNode
              key={`${nodeKey}-${i}`}
              node={child}
              depth={depth + 1}
              nodeKey={`${nodeKey}-${i}`}
              collapsed={collapsed}
              toggleNode={toggleNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===================== 树形预览组件 =====================
function TreePreview({ groups }: { groups: ExportGroup[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleNode = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const treeData = buildTreeData(groups);

  const totalFolders = groups.length;
  const totalFiles = groups.reduce((sum, g) => {
    return sum + g.items.reduce((s, item) => {
      if (item.type === 'folder' && item.children) {
        return s + countChildrenFilesRecursive(item.children);
      }
      return s + 1;
    }, 0);
  }, 0);

  return (
    <section className="card-industrial p-5">
      {/* 标题栏 */}
      <div className="mb-4 flex items-center gap-2">
        <span className="section-tag">PREVIEW</span>
        <h2 className="text-lg font-bold">导出预览</h2>
        <span className="font-mono text-sm text-ink-400">
          ({totalFolders} 个文件夹 · {totalFiles} 个文件)
        </span>
      </div>

      {/* 树形结构 */}
      <div className="space-y-2">
        {treeData.map((node, i) => (
          <div key={`root-${i}`} className="overflow-hidden border-2 border-ink-900">
            <TreeNode
              node={node}
              depth={0}
              nodeKey={`root-${i}`}
              collapsed={collapsed}
              toggleNode={toggleNode}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
