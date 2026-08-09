import ExcelJS from 'exceljs';
import type { ProductInfo, TableFillResult, TablePrices } from '@/types';
import { calculateRetailPrice, formatPrice } from './utils';

// ===================== 加载Excel模板 =====================

export async function loadTemplate(templateName: string): Promise<ArrayBuffer> {
  const basePath = import.meta.env.BASE_URL;
  const url = `${basePath}templates/${templateName}.xlsx`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`无法加载模板: ${templateName}.xlsx (${response.status})`);
  }
  return await response.arrayBuffer();
}

// ===================== 计算三档零售价 =====================

export function calculatePrices(costPrice: number): TablePrices {
  return {
    tier1: formatPrice(calculateRetailPrice(costPrice, 0.50)),  // 50%
    tier2: formatPrice(calculateRetailPrice(costPrice, 0.45)),  // 45%
    tier3: formatPrice(calculateRetailPrice(costPrice, 0.40)),  // 40%
  };
}

// ===================== 填写表一/表二 (SP刊登资料) =====================

export interface PriceOverrides {
  tier1?: number;
  tier2?: number;
  tier3?: number;
}

export async function fillSPSheet(
  templateBuffer: ArrayBuffer,
  info: ProductInfo,
  attributeImageBlob: Blob | null,
  outputName: string,
  options?: {
    skipPhysicalInfo?: boolean;
    priceOverrides?: PriceOverrides;
  }
): Promise<TableFillResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  const ws = workbook.getWorksheet('SP刊登资料');
  if (!ws) throw new Error('SP刊登资料 工作表不存在');

  const cost = parseFloat(info.costPrice) || 0;
  const autoPrices = calculatePrices(cost);
  const productCode = info.productCode;

  // 合并售价：用户覆盖优先，否则用自动计算值
  const prices = {
    tier1: options?.priceOverrides?.tier1 ?? autoPrices.tier1,
    tier2: options?.priceOverrides?.tier2 ?? autoPrices.tier2,
    tier3: options?.priceOverrides?.tier3 ?? autoPrices.tier3,
  };

  // === A2:A4 浮动属性图 ===
  if (attributeImageBlob) {
    const imgBuffer = await attributeImageBlob.arrayBuffer();
    const ext = attributeImageBlob.type.includes('png') ? 'png' : 'jpeg';
    const imageId = workbook.addImage({
      buffer: imgBuffer,
      extension: ext as any,
    });
    ws.addImage(imageId, 'A2:A4');
  }

  // === B2:B4 商品编码 ===
  ws.getCell('B2').value = productCode;

  // === C2:C4 产品中文名 ===
  ws.getCell('C2').value = info.productName || '';

  // === D2,D3,D4 成本价 (填三次) ===
  const costValue = parseFloat(info.costPrice) || 0;
  ws.getCell('D2').value = costValue;
  ws.getCell('D3').value = costValue;
  ws.getCell('D4').value = costValue;

  // === E2:E4 重量 (表二跳过) ===
  if (!options?.skipPhysicalInfo) {
    ws.getCell('E2').value = parseFloat(info.weight) || '';
  }

  // === G2,G3,G4 包装尺寸 (长/宽/高) (表二跳过) ===
  if (!options?.skipPhysicalInfo) {
    ws.getCell('G2').value = parseFloat(info.packageLength) || '';
    ws.getCell('G3').value = parseFloat(info.packageWidth) || '';
    ws.getCell('G4').value = parseFloat(info.packageHeight) || '';
  }

  // === H2:H4 材质 (更新默认值) ===
  if (info.material) {
    ws.getCell('H2').value = info.material;
  }

  // === M2,M3,M4 三档零售价 (从低到高: 40% / 45% / 50%) ===
  ws.getCell('M2').value = prices.tier3;  // 最低价 (40%利润率)
  ws.getCell('M3').value = prices.tier2;  // 中间价 (45%利润率)
  ws.getCell('M4').value = prices.tier1;  // 最高价 (50%利润率)

  // === N2,N3,N4 利润率公式 =1-(D/M)，同时写入预计算结果 ===
  const profitRate = (price: number) => price > 0 ? Math.round((1 - costValue / price) * 10000) / 10000 : 0;
  ws.getCell('N2').value = { formula: '1-(D2/M2)', result: profitRate(prices.tier3) };
  ws.getCell('N3').value = { formula: '1-(D3/M3)', result: profitRate(prices.tier2) };
  ws.getCell('N4').value = { formula: '1-(D4/M4)', result: profitRate(prices.tier1) };

  // === A7:C7 参考标题 ===
  ws.getCell('A7').value = info.competitorTitle || '';

  // === D7 字符长度公式 =LEN(A7)，同时写入预计算结果 ===
  ws.getCell('D7').value = { formula: 'LEN(A7)', result: (info.competitorTitle || '').length };

  // === E7 关键词 ===
  ws.getCell('E7').value = info.keywords || '';

  // === F7 相关链接 ===
  ws.getCell('F7').value = info.relatedLink || '';

  // === A9: "1、-1" → "1、商品编码-1" ===
  ws.getCell('A9').value = `1、${productCode}-1`;

  // === A14 商品材质 ===
  ws.getCell('A14').value = info.material || '';

  // === B15 商品品类 (核心卖点行) ===
  ws.getCell('B15').value = info.category || '';

  // === B16 主题 ===
  ws.getCell('B16').value = info.theme || '';

  // === B17 关键词 ===
  ws.getCell('B17').value = info.keywords || '';

  // === B18 主卖颜色 ===
  ws.getCell('B18').value = info.mainColor || '';

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    name: outputName,
    buffer: buffer as ArrayBuffer,
    size: buffer.byteLength,
  };
}

// ===================== 填写表三 (sku信息 + 产品信息) =====================

export async function fillTable3(
  templateBuffer: ArrayBuffer,
  info: ProductInfo,
  outputName: string
): Promise<TableFillResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  // === sku信息 工作表 ===
  const wsSku = workbook.getWorksheet('sku信息');
  if (!wsSku) throw new Error('sku信息 工作表不存在');

  const costValue = parseFloat(info.costPrice) || 0;

  // A2: SKU
  wsSku.getCell('A2').value = info.productCode;
  // B2: 中文名
  wsSku.getCell('B2').value = info.productName || '';
  // C2: 英文属性
  wsSku.getCell('C2').value = info.englishAttribute || '';
  // D2: 进货价
  wsSku.getCell('D2').value = costValue;
  // E2: 克重
  wsSku.getCell('E2').value = parseFloat(info.weight) || '';
  // K2: 长, L2: 宽, M2: 高
  wsSku.getCell('K2').value = parseFloat(info.packageLength) || '';
  wsSku.getCell('L2').value = parseFloat(info.packageWidth) || '';
  wsSku.getCell('M2').value = parseFloat(info.packageHeight) || '';
  // F2-R2 已有公式和预设值, 保持不变

  // === 产品信息 工作表 ===
  const wsProduct = workbook.getWorksheet('产品信息');
  if (!wsProduct) throw new Error('产品信息 工作表不存在');

  // A2:C2 参考标题
  wsProduct.getCell('A2').value = info.competitorTitle || '';
  // === D2 字符长度公式 =LEN(A2)，同时写入预计算结果 ===
  wsProduct.getCell('D2').value = { formula: 'LEN(A2)', result: (info.competitorTitle || '').length };
  // E2 关键词
  wsProduct.getCell('E2').value = info.keywords || '';
  // F2 相关链接
  wsProduct.getCell('F2').value = info.relatedLink || '';

  // A4: "1、-1" → "1、商品编码-1"
  wsProduct.getCell('A4').value = `1、${info.productCode}-1`;

  // A9 商品材质
  wsProduct.getCell('A9').value = info.material || '';
  // B10 商品品类 (核心卖点行)
  wsProduct.getCell('B10').value = info.category || '';
  // B11 主题
  wsProduct.getCell('B11').value = info.theme || '';
  // B12 关键词
  wsProduct.getCell('B12').value = info.keywords || '';
  // B13 主卖颜色
  wsProduct.getCell('B13').value = info.mainColor || '';

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    name: outputName,
    buffer: buffer as ArrayBuffer,
    size: buffer.byteLength,
  };
}

// ===================== 填写所有表格 =====================

export async function fillAllTables(
  info: ProductInfo,
  attributeImageBlob: Blob | null,
  priceOverrides?: PriceOverrides
): Promise<TableFillResult[]> {
  const results: TableFillResult[] = [];

  // 加载模板
  const [buf1, buf2, buf3] = await Promise.all([
    loadTemplate('表一'),
    loadTemplate('表二'),
    loadTemplate('表三'),
  ]);

  // 填写表一: 商品编码-SP (填写重量和包装尺寸)
  const result1 = await fillSPSheet(
    buf1,
    info,
    attributeImageBlob,
    `${info.productCode}-SP`,
    { skipPhysicalInfo: false, priceOverrides }
  );
  results.push(result1);

  // 填写表二: 商品编码-S (不填写重量和包装尺寸)
  const result2 = await fillSPSheet(
    buf2,
    info,
    attributeImageBlob,
    `${info.productCode}-S`,
    { skipPhysicalInfo: true, priceOverrides }
  );
  results.push(result2);

  // 填写表三: 商品编码-商品品类-全平台-刊登资料
  const result3 = await fillTable3(
    buf3,
    info,
    `${info.productCode}-${info.category || '未分类'}-全平台-刊登资料`
  );
  results.push(result3);

  return results;
}

// ===================== 生成Excel预览数据 (用于UI展示) =====================

export interface ExcelPreviewData {
  sheetName: string;
  rows: { cell: string; value: string }[][];
  mergedCells: string[];
}

export async function generatePreview(
  buffer: ArrayBuffer
): Promise<ExcelPreviewData[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const previews: ExcelPreviewData[] = [];

  workbook.eachSheet((ws) => {
    const rows: { cell: string; value: string }[][] = [];
    const mergedCells: string[] = [];

    // 收集合并单元格
    ws.model.merges?.forEach((merge: any) => {
      mergedCells.push(merge);
    });

    // 收集单元格数据
    const maxRow = Math.min(ws.rowCount, 25);
    const maxCol = Math.min(ws.columnCount, 15);

    for (let r = 1; r <= maxRow; r++) {
      const row: { cell: string; value: string }[] = [];
      for (let c = 1; c <= maxCol; c++) {
        const cell = ws.getCell(r, c);
        let value = '';
        if (cell.value !== null && cell.value !== undefined) {
          if (typeof cell.value === 'object') {
            if ((cell.value as any).formula) {
              value = `=${(cell.value as any).formula}`;
            } else if ((cell.value as any).result !== undefined) {
              value = String((cell.value as any).result);
            } else if ((cell.value as any).text) {
              value = (cell.value as any).text;
            } else {
              value = String(cell.value);
            }
          } else {
            value = String(cell.value);
          }
        }
        row.push({ cell: cell.address, value });
      }
      rows.push(row);
    }

    previews.push({
      sheetName: ws.name,
      rows,
      mergedCells,
    });
  });

  return previews;
}
