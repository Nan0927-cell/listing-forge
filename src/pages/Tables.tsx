import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { fillAllTables, calculatePrices } from '@/lib/excelProcessor';
import type { PriceOverrides } from '@/lib/excelProcessor';
import { downloadBlob, formatPrice, cn, generateMergedSkuName } from '@/lib/utils';
import type { TableFillResult, ProductInfo } from '@/types';
import {
  ChevronRight, FileSpreadsheet, Download, Loader2,
  CheckCircle2, Table as TableIcon, Eye, Edit3, RotateCcw, Pencil,
} from 'lucide-react';

// 预览字段配置：label / 填写位置
type PreviewField = { label: string; table: string };

const FIELDS: PreviewField[] = [
  { label: '商品编码', table: '全部' },
  { label: '产品中文名', table: '表一/二/三' },
  { label: '成本价', table: '表一/二/三' },
  { label: '重量', table: '表一/三' },
  { label: '包装尺寸', table: '表一/三' },
  { label: '1档售价 (40%)', table: '表一/二 M2' },
  { label: '2档售价 (45%)', table: '表一/二 M3' },
  { label: '3档售价 (50%)', table: '表一/二 M4' },
  { label: '参考标题', table: '全部 A7/A2' },
  { label: '关键词', table: '全部 E7/E2' },
  { label: '相关链接', table: '全部 F7/F2' },
  { label: '商品材质', table: '表一/二 A14, 表三 A9' },
  { label: '核心卖点', table: '表一/二 B15, 表三 B10' },
  { label: '主题', table: '表一/二 B16, 表三 B11' },
  { label: '主卖颜色', table: '表一/二 B18, 表三 B13' },
  { label: '英文属性', table: '表三 C2' },
  { label: '编号文本', table: '全部 A9/A4' },
];

// 仅编号文本为自动计算（只读），售价三档现在可编辑
const COMPUTED_LABELS = new Set([
  '编号文本',
]);

const isComputed = (label: string) => COMPUTED_LABELS.has(label);

// 售价三档字段标签 (从低到高: 40% / 45% / 50%)
const PRICE_LABELS = ['1档售价 (40%)', '2档售价 (45%)', '3档售价 (50%)'] as const;
const isPriceField = (label: string) => (PRICE_LABELS as readonly string[]).includes(label);

// 从 ProductInfo 构建初始可编辑数据（key 为预览字段 label）
const buildInitialEditable = (
  info: ProductInfo,
  prices: ReturnType<typeof calculatePrices>,
  mergedCode?: string
): Record<string, string> => ({
  '商品编码': mergedCode || info.productCode,
  '产品中文名': info.productName,
  '成本价': info.costPrice,
  '重量': info.weight,
  '包装尺寸': `${info.packageLength || ''} × ${info.packageWidth || ''} × ${info.packageHeight || ''}`.trim(),
  '1档售价 (40%)': String(formatPrice(prices.tier3)),
  '2档售价 (45%)': String(formatPrice(prices.tier2)),
  '3档售价 (50%)': String(formatPrice(prices.tier1)),
  '参考标题': info.competitorTitle,
  '关键词': info.keywords,
  '相关链接': info.relatedLink,
  '商品材质': info.material,
  '核心卖点': info.category,
  '主题': info.theme,
  '主卖颜色': info.mainColor,
  '英文属性': info.englishAttribute,
  '编号文本': `1、${mergedCode || info.productCode}-1`,
});

// 将原始值格式化为预览展示文本
const formatDisplay = (label: string, raw: string): string => {
  if (label === '包装尺寸') {
    const parts = raw.split('×').map((s) => s.trim());
    if (parts.every((p) => !p)) return '—';
    return `${parts.map((p) => p || '?').join(' × ')} cm`;
  }
  if (!raw) return '—';
  if (label === '成本价') return `¥${raw}`;
  if (label === '重量') return `${raw}g`;
  if (
    label === '1档售价 (50%)' ||
    label === '2档售价 (45%)' ||
    label === '3档售价 (40%)'
  ) {
    return `¥${raw}`;
  }
  return raw;
};

// 将编辑后的数据映射回 ProductInfo（用于生成表格）
const toProductInfo = (
  info: ProductInfo,
  data: Record<string, string>
): ProductInfo => {
  const pkgParts = (data['包装尺寸'] || '')
    .split(/[×x]/i)
    .map((s) => s.trim());
  return {
    ...info,
    productCode: data['商品编码'] ?? info.productCode,
    productName: data['产品中文名'] ?? info.productName,
    costPrice: data['成本价'] ?? info.costPrice,
    weight: data['重量'] ?? info.weight,
    packageLength: pkgParts[0] ?? info.packageLength,
    packageWidth: pkgParts[1] ?? info.packageWidth,
    packageHeight: pkgParts[2] ?? info.packageHeight,
    competitorTitle: data['参考标题'] ?? info.competitorTitle,
    keywords: data['关键词'] ?? info.keywords,
    relatedLink: data['相关链接'] ?? info.relatedLink,
    material: data['商品材质'] ?? info.material,
    category: data['核心卖点'] ?? info.category,
    theme: data['主题'] ?? info.theme,
    mainColor: data['主卖颜色'] ?? info.mainColor,
    englishAttribute: data['英文属性'] ?? info.englishAttribute,
  };
};

export default function Tables() {
  const navigate = useNavigate();
  const {
    productInfo, classifiedImages, scanResult, fillTables, setFillTables,
    tableResults, setTableResults, setStepStatus, setError,
    listingMode, multiProductInfos,
  } = useStore();

  // 多SKU模式计算
  const isMulti = listingMode !== 'single' && multiProductInfos.length > 1;
  const mergedCode = isMulti
    ? generateMergedSkuName(multiProductInfos.map(p => p.productCode).filter(c => c.trim()))
    : productInfo.productCode;
  const baseInfo = isMulti ? multiProductInfos[0] : productInfo;

  const [processing, setProcessing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [activeSkuTab, setActiveSkuTab] = useState(0);

  // 记录用户手动修改过的售价字段（修改后不再自动同步）
  const [manualPriceFlags, setManualPriceFlags] = useState<Set<string>>(new Set());

  // 多SKU模式：每个SKU独立的可编辑数据（包含所有字段）
  const buildMultiEditable = (infos: ProductInfo[]) =>
    infos.map(info => {
      const cost = parseFloat(info.costPrice) || 0;
      const prices = calculatePrices(cost);
      return {
        '产品中文名': info.productName,
        '成本价': info.costPrice,
        '重量': info.weight,
        '包装尺寸': `${info.packageLength || ''} × ${info.packageWidth || ''} × ${info.packageHeight || ''}`.trim(),
        '1档售价 (40%)': String(formatPrice(prices.tier3)),
        '2档售价 (45%)': String(formatPrice(prices.tier2)),
        '3档售价 (50%)': String(formatPrice(prices.tier1)),
        '英文属性': info.englishAttribute,
        '参考标题': info.competitorTitle,
        '关键词': info.keywords,
        '相关链接': info.relatedLink,
        '商品材质': info.material,
        '核心卖点': info.category,
        '主题': info.theme,
        '主卖颜色': info.mainColor,
      } as Record<string, string>;
    });

  const [multiEditable, setMultiEditable] = useState<Record<string, string>[]>(() =>
    isMulti ? buildMultiEditable(multiProductInfos) : []
  );
  const [multiManualPriceFlags, setMultiManualPriceFlags] = useState<Set<string>[]>(() =>
    isMulti ? multiProductInfos.map(() => new Set()) : []
  );

  // 原始（初始）可编辑数据快照，用于重置与脏值比较
  const initialEditable = useMemo(
    () => buildInitialEditable(
      baseInfo,
      calculatePrices(parseFloat(baseInfo.costPrice) || 0),
      isMulti ? mergedCode : undefined
    ),
    [baseInfo, isMulti, mergedCode]
  );

  // 可编辑数据：key 为预览字段 label，value 为原始字符串
  const [editableData, setEditableData] = useState<Record<string, string>>(
    () => initialEditable
  );

  // 自动计算字段随 成本价 / 商品编码 实时同步（售价仅同步未手动修改的）
  useEffect(() => {
    const cost = parseFloat(editableData['成本价']) || 0;
    const livePrices = calculatePrices(cost);
    const code = isMulti ? mergedCode : (editableData['商品编码'] || '');
    setEditableData((prev) => ({
      ...prev,
      '1档售价 (40%)': manualPriceFlags.has('1档售价 (40%)')
        ? prev['1档售价 (40%)']
        : String(formatPrice(livePrices.tier3)),
      '2档售价 (45%)': manualPriceFlags.has('2档售价 (45%)')
        ? prev['2档售价 (45%)']
        : String(formatPrice(livePrices.tier2)),
      '3档售价 (50%)': manualPriceFlags.has('3档售价 (50%)')
        ? prev['3档售价 (50%)']
        : String(formatPrice(livePrices.tier1)),
      '编号文本': `1、${code}-1`,
      ...(isMulti ? { '商品编码': mergedCode } : {}),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableData['成本价'], editableData['商品编码'], manualPriceFlags, isMulti, mergedCode]);

  // 字段是否被编辑过（编号文本为纯自动计算，不参与标记）
  const isDirty = (label: string) => {
    if (isComputed(label)) return false;
    return (editableData[label] ?? '') !== (initialEditable[label] ?? '');
  };

  const dirtyCount = FIELDS.filter((f) => isDirty(f.label)).length;
  const hasEdits = dirtyCount > 0;

  const handleFieldChange = (label: string, value: string) => {
    setEditableData((prev) => ({ ...prev, [label]: value }));
    // 售价字段被手动修改后标记，不再自动同步
    if (isPriceField(label)) {
      setManualPriceFlags((prev) => new Set(prev).add(label));
    }
  };

  // 多SKU：各SKU独立字段修改
  const handleMultiFieldChange = (skuIdx: number, label: string, value: string) => {
    setMultiEditable(prev => {
      const updated = [...prev];
      updated[skuIdx] = { ...updated[skuIdx], [label]: value };
      return updated;
    });
    if (isPriceField(label)) {
      setMultiManualPriceFlags(prev => {
        const updated = [...prev];
        updated[skuIdx] = new Set(updated[skuIdx]).add(label);
        return updated;
      });
    }
  };

  // 多SKU：各SKU售价按成本价自动计算（手动修改的跳过）
  const multiCostPrices = multiEditable.map(d => d['成本价']).join('¬');
  useEffect(() => {
    if (!isMulti || multiEditable.length === 0) return;
    setMultiEditable(prev => {
      const updated = [...prev];
      for (let i = 0; i < updated.length; i++) {
        const cost = parseFloat(updated[i]['成本价']) || 0;
        const prices = calculatePrices(cost);
        const flags = multiManualPriceFlags[i] || new Set();
        if (!flags.has('1档售价 (40%)')) {
          updated[i] = { ...updated[i], '1档售价 (40%)': String(formatPrice(prices.tier3)) };
        }
        if (!flags.has('2档售价 (45%)')) {
          updated[i] = { ...updated[i], '2档售价 (45%)': String(formatPrice(prices.tier2)) };
        }
        if (!flags.has('3档售价 (50%)')) {
          updated[i] = { ...updated[i], '3档售价 (50%)': String(formatPrice(prices.tier1)) };
        }
      }
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiCostPrices, multiManualPriceFlags, isMulti]);

  const handleReset = () => {
    setEditableData(initialEditable);
    setManualPriceFlags(new Set());
    if (isMulti) {
      setMultiEditable(buildMultiEditable(multiProductInfos));
      setMultiManualPriceFlags(multiProductInfos.map(() => new Set()));
    }
  };

  // 获取属性图（单SKU模式）
  const getAttributeImage = (): Blob | null => {
    const attrImg = classifiedImages.find((img) => img.category === 'attribute');
    if (attrImg) return attrImg.file.file;
    // 回退：从scanResult中查找文件名匹配SKU编码的图片
    if (scanResult && productInfo.productCode) {
      const scannedFile = scanResult.folder1200.find(f => {
        const baseName = f.name.replace(/\.[^.]+$/, '');
        return baseName === productInfo.productCode ||
               baseName === productInfo.productCode.replace(/-/g, '_');
      });
      if (scannedFile) return scannedFile.file;
    }
    return null;
  };

  // 获取多SKU属性图（多重匹配策略，最终回退到原始扫描文件）
  const getMultiAttrBlobs = (): (Blob | null)[] => {
    const allAttrImages = classifiedImages.filter(img => img.category === 'attribute');

    return multiProductInfos.map((info, idx) => {
      const code = info.productCode;
      const codeUnd = code.replace(/-/g, '_');

      // 1. 按newName匹配SKU编码
      let attrImg = allAttrImages.find(
        img => img.newName.replace(/\.[^.]+$/, '') === code
      );
      // 2. 按groupIndex匹配
      if (!attrImg) {
        attrImg = allAttrImages.find(img => img.groupIndex === idx);
      }
      // 3. 按原始文件名匹配SKU编码
      if (!attrImg) {
        attrImg = allAttrImages.find(
          img => img.file.name.replace(/\.[^.]+$/, '') === code ||
                 img.file.name.includes(code)
        );
      }
      // 4. 最后回退：按索引取
      if (!attrImg && allAttrImages.length > idx) {
        attrImg = allAttrImages[idx];
      }

      // 5. 从scanResult原始文件中查找文件名匹配SKU编码的图片
      if (!attrImg && scanResult) {
        // 5a. 精确匹配
        let scannedFile = scanResult.folder1200.find(f => {
          const baseName = f.name.replace(/\.[^.]+$/, '');
          return baseName === code || baseName === codeUnd;
        });
        // 5b. 大小写不敏感匹配
        if (!scannedFile) {
          const lowerCode = code.toLowerCase();
          const lowerCodeUnd = codeUnd.toLowerCase();
          scannedFile = scanResult.folder1200.find(f => {
            const baseName = f.name.replace(/\.[^.]+$/, '').toLowerCase();
            return baseName === lowerCode || baseName === lowerCodeUnd;
          });
        }
        // 5c. 在SKU子文件夹中查找包含"属性"或"attribute"关键词的文件
        if (!scannedFile) {
          scannedFile = scanResult.folder1200.find(f => {
            if (!f.path || !f.path.startsWith(code + '/')) return false;
            return /属性|attribute/i.test(f.name);
          });
        }
        // 5d. 在SKU子文件夹中查找文件名以SKU编码开头但非序列编号的文件
        if (!scannedFile) {
          const skuFiles = scanResult.folder1200
            .filter(f => f.path && f.path.startsWith(code + '/'))
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
          scannedFile = skuFiles.find(f => {
            const baseName = f.name.replace(/\.[^.]+$/, '');
            if (baseName.startsWith(code)) {
              const suffix = baseName.slice(code.length);
              if (!/^[-_]?\d+$/.test(suffix)) return true;
            }
            return false;
          }) || null;
        }
        if (scannedFile) {
          return scannedFile.file;
        }
      }
      return attrImg ? attrImg.file.file : null;
    });
  };

  const handleFillTables = async () => {
    setProcessing(true);
    setError(null);
    try {
      const tempInfo = toProductInfo(baseInfo, editableData);

      if (isMulti) {
        tempInfo.productCode = multiProductInfos[0].productCode;
      }

      let results: TableFillResult[];
      let attrWarning = '';
      if (isMulti) {
        // 每个SKU独立构建ProductInfo，使用各自的全量编辑数据
        const multiInfos = multiProductInfos.map((info, idx) => {
          const skuData = multiEditable[idx] || {};
          const pkgParts = (skuData['包装尺寸'] || '').split(/[×x]/i).map(s => s.trim());
          return {
            ...info,
            productName: skuData['产品中文名'] ?? info.productName,
            costPrice: skuData['成本价'] ?? info.costPrice,
            weight: skuData['重量'] ?? info.weight,
            packageLength: pkgParts[0] ?? info.packageLength,
            packageWidth: pkgParts[1] ?? info.packageWidth,
            packageHeight: pkgParts[2] ?? info.packageHeight,
            englishAttribute: skuData['英文属性'] ?? info.englishAttribute,
            competitorTitle: skuData['参考标题'] ?? info.competitorTitle,
            keywords: skuData['关键词'] ?? info.keywords,
            relatedLink: skuData['相关链接'] ?? info.relatedLink,
            material: skuData['商品材质'] ?? info.material,
            category: skuData['核心卖点'] ?? info.category,
            theme: skuData['主题'] ?? info.theme,
            mainColor: skuData['主卖颜色'] ?? info.mainColor,
          } as ProductInfo;
        });

        // 每个SKU独立的售价覆盖
        const multiPriceOverrides: PriceOverrides[] = multiManualPriceFlags.map((flags, idx) => {
          const data = multiEditable[idx] || {};
          const overrides: PriceOverrides = {};
          if (flags.has('1档售价 (40%)')) {
            overrides.tier3 = parseFloat(data['1档售价 (40%)']) || undefined;
          }
          if (flags.has('2档售价 (45%)')) {
            overrides.tier2 = parseFloat(data['2档售价 (45%)']) || undefined;
          }
          if (flags.has('3档售价 (50%)')) {
            overrides.tier1 = parseFloat(data['3档售价 (50%)']) || undefined;
          }
          return overrides;
        });

        const multiAttrBlobs = getMultiAttrBlobs();
        const foundAttrCount = multiAttrBlobs.filter(b => b !== null).length;
        const allAttrInClassified = classifiedImages.filter(img => img.category === 'attribute');
        if (foundAttrCount === 0) {
          const classifiedCount = classifiedImages.length;
          const attrCount = allAttrInClassified.length;
          const scanCount = scanResult ? scanResult.folder1200.length : -1;
          const codes = multiProductInfos.map(p => p.productCode).join(', ');
          const sampleNames = scanResult
            ? scanResult.folder1200.slice(0, 8).map(f => `${f.name}(path:${f.path})`).join(' | ')
            : 'N/A';
          attrWarning = `[诊断] 属性图未找到！classifiedImages:${classifiedCount}张, 属性图:${attrCount}张, scanResult1200:${scanCount}个文件。SKU编码: ${codes}。文件名样本: ${sampleNames}`;
          console.warn(attrWarning);
        }
        results = await fillAllTables(multiInfos[0], null, undefined, {
          multiInfos,
          multiAttrBlobs,
          multiPriceOverrides,
        });
      } else {
        const attrBlob = getAttributeImage();
        if (!attrBlob) {
          const classifiedCount = classifiedImages.length;
          const attrCount = classifiedImages.filter(img => img.category === 'attribute').length;
          const scanCount = scanResult ? scanResult.folder1200.length : -1;
          const sampleNames = scanResult
            ? scanResult.folder1200.slice(0, 8).map(f => `${f.name}(path:${f.path})`).join(' | ')
            : 'N/A';
          attrWarning = `[诊断] 属性图未找到！classifiedImages:${classifiedCount}张, 属性图:${attrCount}张, scanResult1200:${scanCount}个文件。SKU编码: ${productInfo.productCode}。文件名样本: ${sampleNames}`;
          console.warn(attrWarning);
        }
        const priceOverrides: PriceOverrides = {};
        if (manualPriceFlags.has('1档售价 (40%)')) {
          priceOverrides.tier3 = parseFloat(editableData['1档售价 (40%)']) || undefined;
        }
        if (manualPriceFlags.has('2档售价 (45%)')) {
          priceOverrides.tier2 = parseFloat(editableData['2档售价 (45%)']) || undefined;
        }
        if (manualPriceFlags.has('3档售价 (50%)')) {
          priceOverrides.tier1 = parseFloat(editableData['3档售价 (50%)']) || undefined;
        }
        results = await fillAllTables(tempInfo, attrBlob, priceOverrides);
      }
      setTableResults(results);
      setShowPreview(true);
      setStepStatus('tables', 'done');
      setStepStatus('export', 'active');
      if (attrWarning) {
        setError(attrWarning);
      }
    } catch (e: any) {
      const msg = e?.message || String(e) || '未知错误';
      setError(`表格填写失败: ${msg}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleSkip = () => {
    setFillTables(false);
    setStepStatus('tables', 'done');
    setStepStatus('export', 'active');
    navigate('/export');
  };

  const handleDownload = (result: TableFillResult) => {
    const blob = new Blob([result.buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, `${result.name}.xlsx`);
  };

  const productCodeReady = isMulti
    ? multiProductInfos.every(p => p.productCode.trim())
    : !!(editableData['商品编码'] || '').trim();

  return (
    <div className="space-y-6">
      <div>
        <div className="section-tag mb-2">05 · TABLES</div>
        <h1 className="text-3xl font-bold tracking-tightest">表格填写</h1>
        <p className="mt-1 text-sm text-ink-500">
          自动填写三个Excel表格模板（SP刊登资料、S刊登资料、全平台刊登资料），支持预览与在线编辑定稿。
        </p>
      </div>

      {/* 选择是否填写表格 */}
      <section className="card-industrial p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="section-tag">OPTION</span>
          <h2 className="text-lg font-bold">是否填写表格</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* 填写表格 */}
          <button
            onClick={() => setFillTables(true)}
            className={cn(
              'border-2 p-4 text-left transition-all',
              fillTables ? 'border-flame bg-flame/5 shadow-industrial-sm' : 'border-ink-300 hover:border-ink-500'
            )}
          >
            <FileSpreadsheet className={cn('h-6 w-6 mb-2', fillTables ? 'text-flame' : 'text-ink-400')} />
            <div className="font-bold">填写表格</div>
            <div className="mt-1 text-sm text-ink-500">
              自动填写表一(SP)、表二(S)、表三(全平台)三个Excel模板
            </div>
          </button>

          {/* 跳过 */}
          <button
            onClick={() => setFillTables(false)}
            className={cn(
              'border-2 p-4 text-left transition-all',
              !fillTables ? 'border-ink-900 bg-ink-900/5 shadow-industrial-sm' : 'border-ink-300 hover:border-ink-500'
            )}
          >
            <Eye className={cn('h-6 w-6 mb-2', !fillTables ? 'text-ink-900' : 'text-ink-400')} />
            <div className="font-bold">跳过表格</div>
            <div className="mt-1 text-sm text-ink-500">
             不填写表格，直接导出图片文件夹
            </div>
          </button>
        </div>
      </section>

      {/* 填写表格内容 */}
      {fillTables && (
        <>
          {/* 预览数据（支持在线编辑） */}
          <section className="card-industrial p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="section-tag">PREVIEW</span>
                <h2 className="text-lg font-bold">填写数据预览</h2>
                {hasEdits && (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-industrial text-flame">
                    <span className="h-1.5 w-1.5 rounded-full bg-flame" />
                    已修改 {dirtyCount}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* 预览 / 编辑 切换 */}
                <div className="flex border-2 border-ink-300">
                  <button
                    onClick={() => setEditMode(false)}
                    className={cn(
                      'flex items-center gap-1 px-3 py-1 text-xs font-bold transition-colors',
                      !editMode ? 'bg-ink-900 text-bone' : 'text-ink-500 hover:text-ink-900'
                    )}
                  >
                    <Eye className="h-3 w-3" /> 预览
                  </button>
                  <button
                    onClick={() => setEditMode(true)}
                    className={cn(
                      'flex items-center gap-1 px-3 py-1 text-xs font-bold transition-colors',
                      editMode ? 'bg-flame text-bone' : 'text-ink-500 hover:text-ink-900'
                    )}
                  >
                    <Edit3 className="h-3 w-3" /> 编辑
                  </button>
                </div>
                <button
                  onClick={handleReset}
                  disabled={!hasEdits && !isMulti}
                  className="btn-outline text-xs disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw className="h-3 w-3" /> 重置
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="btn-outline text-xs"
                >
                  <Pencil className="h-3 w-3" /> 修改产品信息
                </button>
              </div>
            </div>

            {isMulti ? (
              <>
                {/* 多SKU Tab式编辑 */}
                <div className="mb-4 border-2 border-flame/30 bg-flame/5 px-3 py-2">
                  <p className="font-mono text-[11px] text-flame-700">
                    ※ 多SKU模式（共 {multiProductInfos.length} 个SKU，合并编码：{mergedCode}）：点击标签切换SKU，每个SKU所有字段均可独立编辑。售价默认按各自成本价自动计算，手动修改后按你的值生成表格。
                  </p>
                </div>

                {/* SKU Tab 标签栏 */}
                <div className="mb-4 flex flex-wrap gap-1 border-b-2 border-ink-200">
                  {multiProductInfos.map((sku, idx) => {
                    const flags = multiManualPriceFlags[idx] || new Set<string>();
                    const hasManualPrice = flags.size > 0;
                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveSkuTab(idx)}
                        className={cn(
                          'flex items-center gap-1.5 border-2 border-b-0 px-3 py-1.5 text-xs font-bold transition-colors',
                          idx === activeSkuTab
                            ? 'border-ink-900 bg-ink-900 text-bone'
                            : 'border-ink-200 bg-transparent text-ink-500 hover:text-ink-900'
                        )}
                      >
                        <span className="font-mono">{idx + 1}</span>
                        <span>{sku.productCode || '未填写'}</span>
                        {hasManualPrice && (
                          <span className="flex h-1.5 w-1.5 rounded-full bg-flame" title="有手动售价" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* 当前SKU编辑表单 */}
                {(() => {
                  const idx = activeSkuTab;
                  const sku = multiProductInfos[idx];
                  const skuData = multiEditable[idx] || {};
                  const flags = multiManualPriceFlags[idx] || new Set<string>();

                  const MULTI_FIELDS: { label: string; table: string; unit?: string; fullWidth?: boolean }[] = [
                    { label: '产品中文名', table: '表一/二/三', fullWidth: true },
                    { label: '成本价', table: '表一/二/三', unit: '¥' },
                    { label: '重量', table: '表一/三', unit: 'g' },
                    { label: '包装尺寸', table: '表一/三', fullWidth: true },
                    { label: '1档售价 (40%)', table: '表一/二 M2', unit: '¥' },
                    { label: '2档售价 (45%)', table: '表一/二 M3', unit: '¥' },
                    { label: '3档售价 (50%)', table: '表一/二 M4', unit: '¥' },
                    { label: '参考标题', table: '全部 A7/A2', fullWidth: true },
                    { label: '关键词', table: '全部 E7/E2', fullWidth: true },
                    { label: '相关链接', table: '全部 F7/F2', fullWidth: true },
                    { label: '商品材质', table: '表一/二 A14', fullWidth: true },
                    { label: '核心卖点', table: '表一/二 B15', fullWidth: true },
                    { label: '主题', table: '表一/二 B16', fullWidth: true },
                    { label: '主卖颜色', table: '表一/二 B18', fullWidth: true },
                    { label: '英文属性', table: '表三 C2', fullWidth: true },
                  ];

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-ink-200 pb-2">
                        <span className="flex h-6 w-6 items-center justify-center border-2 border-ink-900 bg-ink-900 font-mono text-[10px] font-bold text-bone">
                          {idx + 1}
                        </span>
                        <span className="font-mono text-sm font-bold text-flame">
                          {sku.productCode || '未填写'}
                        </span>
                        <span className="font-mono text-[10px] text-ink-400">
                          编号文本: 1、{mergedCode}-1 <span className="border border-ink-300 px-1 uppercase">AUTO</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {MULTI_FIELDS.map((field) => {
                          const isPrice = isPriceField(field.label);
                          const isManual = flags.has(field.label);
                          return (
                            <div
                              key={field.label}
                              className={cn(field.fullWidth && 'sm:col-span-2 lg:col-span-3')}
                            >
                              <label className="mb-0.5 flex items-center gap-1 text-xs text-ink-500">
                                {field.label}
                                <span className="font-mono text-[9px] text-ink-400">{field.table}</span>
                                {isPrice && (
                                  isManual ? (
                                    <span className="border border-flame px-1 font-mono text-[9px] text-flame">手动</span>
                                  ) : (
                                    <span className="border border-ink-300 px-1 font-mono text-[9px] text-ink-400">自动</span>
                                  )
                                )}
                              </label>
                              <div className="flex items-center gap-1">
                                {field.unit && (
                                  <span className="text-xs text-ink-400">{field.unit}</span>
                                )}
                                <input
                                  className={cn(
                                    'input-industrial !px-2 !py-1 flex-1 text-xs',
                                    isPrice && 'font-bold text-flame'
                                  )}
                                  value={skuData[field.label] ?? ''}
                                  onChange={(e) => handleMultiFieldChange(idx, field.label, e.target.value)}
                                  placeholder={field.label}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <>
                {editMode && (
                  <p className="mb-3 font-mono text-[11px] text-ink-500">
                    ※ 编辑模式下可直接修改值。售价默认按成本价自动计算，手动修改后将按你的值生成表格。标有 <span className="border border-ink-300 px-1 uppercase">AUTO</span> 的字段由商品编码自动推算。
                  </p>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-ink-900">
                        <th className="py-2 pr-4 text-left font-mono text-[10px] uppercase tracking-industrial text-ink-500">字段</th>
                        <th className="py-2 pr-4 text-left font-mono text-[10px] uppercase tracking-industrial text-ink-500">值</th>
                        <th className="py-2 text-left font-mono text-[10px] uppercase tracking-industrial text-ink-500">填写位置</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FIELDS.map((row, i) => {
                        const raw = editableData[row.label] ?? '';
                        const display = formatDisplay(row.label, raw);
                        const dirty = isDirty(row.label);
                        const computed = isComputed(row.label);
                        const isPrice = isPriceField(row.label);
                        const priceManual = isPrice && manualPriceFlags.has(row.label);
                        const editable = editMode && !computed;
                        return (
                          <tr
                            key={i}
                            className={cn('border-b border-ink-200', dirty && 'bg-flame/5')}
                          >
                            <td className="py-2 pr-4 font-medium align-top">
                              <span className="flex items-center gap-1.5">
                                {dirty && (
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-flame"
                                    title="已修改"
                                  />
                                )}
                                {row.label}
                                {computed && (
                                  <span className="border border-ink-300 px-1 font-mono text-[9px] uppercase tracking-industrial text-ink-400">
                                    AUTO
                                  </span>
                                )}
                                {isPrice && !priceManual && !computed && (
                                  <span className="border border-ink-300 px-1 font-mono text-[9px] uppercase tracking-industrial text-ink-400">
                                    自动
                                  </span>
                                )}
                                {priceManual && (
                                  <span className="border border-flame px-1 font-mono text-[9px] uppercase tracking-industrial text-flame">
                                    手动
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="py-2 pr-4 font-mono text-ink-700 align-top">
                              {editable ? (
                                <input
                                  className="input-industrial !px-2 !py-1 text-sm"
                                  value={raw}
                                  onChange={(e) => handleFieldChange(row.label, e.target.value)}
                                  placeholder={row.label}
                                />
                              ) : (
                                <span className={cn(dirty && 'text-flame')}>
                                  {display || '—'}
                                </span>
                              )}
                            </td>
                            <td className="py-2 font-mono text-[11px] text-ink-400 align-top">{row.table}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* 生成与下载 */}
          <section className="card-industrial p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="section-tag">GENERATE</span>
              <h2 className="text-lg font-bold">生成与下载</h2>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleFillTables}
                disabled={processing || !productCodeReady}
                className="btn-flame"
              >
                {processing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> 生成中...</>
                ) : tableResults.length > 0 ? (
                  <><CheckCircle2 className="h-4 w-4" /> 重新生成</>
                ) : (
                  <><TableIcon className="h-4 w-4" /> 生成表格</>
                )}
              </button>
            </div>

            {hasEdits && (
              <p className="mt-2 font-mono text-[11px] text-flame">
                ※ 将使用编辑后的数据生成表格（{dirtyCount} 项已修改）
              </p>
            )}

            {/* 生成结果 */}
            {tableResults.length > 0 && (
              <div className="mt-4 space-y-2">
                {tableResults.map((result, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 border-2 border-green-600 bg-green-50 p-3"
                  >
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{result.name}.xlsx</div>
                      <div className="font-mono text-[11px] text-ink-500">
                        {(result.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(result)}
                      className="btn-outline text-xs"
                    >
                      <Download className="h-3 w-3" /> 下载
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* 导航 */}
      <div className="flex justify-between">
        <button onClick={() => navigate('/forge')} className="btn-outline">
          返回处理
        </button>
        {fillTables && tableResults.length > 0 ? (
          <button onClick={() => navigate('/export')} className="btn-industrial">
            前往归类导出 <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={handleSkip} className="btn-industrial">
            {fillTables ? '跳过填写，继续' : '继续到导出'} <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
