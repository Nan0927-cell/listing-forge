import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { ProductInfo, TableFillResult, TablePrices } from '@/types';
import { calculateRetailPrice, formatPrice, generateMergedSkuName } from './utils';

// ===================== 后处理：向xlsx注入图片 =====================

interface ImageInjection {
  blob: Blob;
  startRow: number; // 0-indexed (Excel行号-1)
  endRow: number;
  col: number;      // 0-indexed (A=0)
}

async function injectImagesIntoXlsx(
  xlsxBuffer: ArrayBuffer,
  images: ImageInjection[],
  sheetName: string
): Promise<ArrayBuffer> {
  if (images.length === 0) return xlsxBuffer;

  const zip = await JSZip.loadAsync(xlsxBuffer);

  // 1. 找到工作表文件路径
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  if (!workbookXml) return xlsxBuffer;

  const sheetMatch = workbookXml.match(new RegExp(`<sheet[^>]*name="${sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*r:id="(rId\\d+)"`));
  if (!sheetMatch) {
    // 回退：取第一个sheet
    const fallbackMatch = workbookXml.match(/<sheet[^>]*r:id="(rId\d+)"/);
    if (!fallbackMatch) return xlsxBuffer;
    var sheetRId = fallbackMatch[1];
  } else {
    var sheetRId = sheetMatch[1];
  }

  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!relsXml) return xlsxBuffer;
  const relMatch = relsXml.match(new RegExp(`Id="${sheetRId}"[^>]*Target="([^"]+)"`));
  if (!relMatch) return xlsxBuffer;
  const sheetFile = `xl/${relMatch[1].replace(/^\.\//, '')}`;

  // 2. 添加图片文件到xl/media/，构建drawing XML
  const drawingEntries: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const imgBuffer = await img.blob.arrayBuffer();
    const isPng = img.blob.type.includes('png') || /\.(png)$/i.test((img.blob as File).name || '');
    const ext = isPng ? 'png' : 'jpeg';
    const imgFileName = `image${i + 1}.${ext}`;
    zip.file(`xl/media/${imgFileName}`, imgBuffer);

    drawingEntries.push(
      `<xdr:twoCellAnchor>` +
      `<xdr:from><xdr:col>${img.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${img.startRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
      `<xdr:to><xdr:col>${img.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${img.endRow + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
      `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 1}" name="Image ${i + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr>` +
      `<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId${i + 1}"/></xdr:blipFill>` +
      `<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>` +
      `</xdr:twoCellAnchor>`
    );
  }

  // 3. 创建drawing XML
  const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n` +
    drawingEntries.join('\n') + '\n</xdr:wsDr>';
  zip.file('xl/drawings/drawing1.xml', drawingXml);

  // 4. 创建drawing关系
  const drawingRels = images.map((img, i) => {
    const isPng = img.blob.type.includes('png') || /\.(png)$/i.test((img.blob as File).name || '');
    const ext = isPng ? 'png' : 'jpeg';
    return `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i + 1}.${ext}"/>`;
  }).join('');
  zip.file('xl/drawings/_rels/drawing1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels}</Relationships>`);

  // 5. 更新sheet关系文件
  const sheetRelsPath = sheetFile.replace(/worksheets\/([^/]+)$/, 'worksheets/_rels/$1').replace(/$/, '.rels');
  let sheetRels = await zip.file(sheetRelsPath)?.async('string') || '';

  // 找到可用的rId
  let maxRId = 0;
  const rIdMatches = sheetRels.matchAll(/Id="rId(\d+)"/g);
  for (const m of rIdMatches) {
    maxRId = Math.max(maxRId, parseInt(m[1]));
  }
  const drawingRelId = `rId${maxRId + 1}`;

  if (sheetRels) {
    sheetRels = sheetRels.replace('</Relationships>',
      `<Relationship Id="${drawingRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
  } else {
    sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="${drawingRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
  }
  zip.file(sheetRelsPath, sheetRels);

  // 6. 在sheet XML中添加drawing引用
  let sheetXml = await zip.file(sheetFile)?.async('string') || '';
  if (sheetXml && !sheetXml.includes('<drawing')) {
    const rNs = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    if (sheetXml.includes('</worksheet>')) {
      // 确保r命名空间存在
      if (!sheetXml.includes('xmlns:r=')) {
        sheetXml = sheetXml.replace('<worksheet', `<worksheet ${rNs}`);
      }
      sheetXml = sheetXml.replace('</worksheet>',
        `<drawing r:id="${drawingRelId}"/></worksheet>`);
      zip.file(sheetFile, sheetXml);
    }
  }

  // 7. 更新[Content_Types].xml
  let contentTypes = await zip.file('[Content_Types].xml')?.async('string') || '';
  if (!contentTypes.includes('Extension="png"')) {
    contentTypes = contentTypes.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  }
  if (!contentTypes.includes('Extension="jpeg"')) {
    contentTypes = contentTypes.replace('</Types>', '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');
  }
  if (!contentTypes.includes('/xl/drawings/drawing1.xml')) {
    contentTypes = contentTypes.replace('</Types>',
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  }
  zip.file('[Content_Types].xml', contentTypes);

  const result = await zip.generateAsync({ type: 'arraybuffer' });
  return result;
}

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
    multiInfos?: ProductInfo[];
    multiAttrBlobs?: (Blob | null)[];
    mergedCode?: string;
    multiPriceOverrides?: PriceOverrides[];
  }
): Promise<TableFillResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  const ws = workbook.getWorksheet('SP刊登资料');
  if (!ws) throw new Error('SP刊登资料 工作表不存在');

  const isMulti = options?.multiInfos && options.multiInfos.length > 1;
  const allInfos = isMulti ? options.multiInfos! : [info];
  const allAttrBlobs = isMulti && options?.multiAttrBlobs
    ? options.multiAttrBlobs
    : [attributeImageBlob];
  const numSkus = allInfos.length;
  const offset = (numSkus - 1) * 3;
  const pendingImages: { blob: Blob; range: string }[] = [];

  // 辅助函数：复制一行的所有单元格内容和样式到目标行
  const copyRow = (srcRow: number, tgtRow: number) => {
    const src = ws.getRow(srcRow);
    const tgt = ws.getRow(tgtRow);
    src.eachCell({ includeEmpty: true }, (cell: any, colNum: number) => {
      const tgtCell = tgt.getCell(colNum);
      tgtCell.value = cell.value;
      // ExcelJS 的 style 属性 (font/border/fill/alignment) 是原型上的 getter，
      // 不能用 spread 操作符复制，必须逐个访问并构建新对象
      const srcStyle = cell.style;
      if (srcStyle) {
        const styleObj: any = {};
        if (srcStyle.font) styleObj.font = srcStyle.font;
        if (srcStyle.alignment) styleObj.alignment = srcStyle.alignment;
        if (srcStyle.border) styleObj.border = srcStyle.border;
        if (srcStyle.fill) styleObj.fill = srcStyle.fill;
        if (cell.numFmt) styleObj.numFmt = cell.numFmt;
        if (Object.keys(styleObj).length > 0) {
          tgtCell.style = styleObj;
        }
      }
    });
    // 复制行高
    if (src.height) {
      tgt.height = src.height;
    }
  };

  // 多SKU: 为每个额外SKU插入3行，并复制模板行(第2-4行)的内容
  if (isMulti) {
    const rowsToAdd = (numSkus - 1) * 3;

    // 收集模板中已有的合并单元格范围（spliceRows 不会自动移位合并范围）
    // ExcelJS 4.4.0: _merges 是字典对象 { masterAddr: Range }，model.merges 是字符串数组
    const existingMerges: string[] = [];
    if (ws.model.merges) {
      ws.model.merges.forEach((merge: any) => {
        if (typeof merge === 'string') {
          existingMerges.push(merge);
        }
      });
    }

    // 先取消所有合并，避免插入行后合并范围错位导致冲突
    // 注意：ExcelJS 方法名是 unMergeCells（大写M）
    for (const merge of existingMerges) {
      try { (ws as any).unMergeCells(merge); } catch { /* 忽略取消失败 */ }
    }

    // 插入空行
    ws.spliceRows(5, 0, ...Array(rowsToAdd).fill(undefined));

    // 重新应用合并：第5行及以上的范围需要加上偏移量
    for (const merge of existingMerges) {
      const m = merge.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      if (m) {
        const [, col1, row1, col2, row2] = m;
        const r1 = parseInt(row1);
        const r2 = parseInt(row2);
        if (r1 >= 5) {
          ws.mergeCells(`${col1}${r1 + rowsToAdd}:${col2}${r2 + rowsToAdd}`);
        } else {
          ws.mergeCells(`${col1}${r1}:${col2}${r2}`);
        }
      }
    }

    for (let i = 1; i < numSkus; i++) {
      const targetStart = 2 + i * 3;
      copyRow(2, targetStart);
      copyRow(3, targetStart + 1);
      copyRow(4, targetStart + 2);
    }

    // 多SKU: 为参考标题/关键词/参考链接插入额外行（全局去重，内容相同的只写一行）
    if (numSkus > 1) {
      const uniqueTitleSkus: number[] = [0];
      const seenContents = new Set([`${allInfos[0].competitorTitle || ''}||${allInfos[0].keywords || ''}||${allInfos[0].relatedLink || ''}`]);
      for (let i = 1; i < numSkus; i++) {
        const content = `${allInfos[i].competitorTitle || ''}||${allInfos[i].keywords || ''}||${allInfos[i].relatedLink || ''}`;
        if (!seenContents.has(content)) {
          uniqueTitleSkus.push(i);
          seenContents.add(content);
        }
      }

      const extraTitleRows = uniqueTitleSkus.length - 1; // 第一行已有，额外行数=不同的数量-1

      if (extraTitleRows > 0) {
        const titleInsertPos = 8 + offset; // 在第一个参考标题行(7+offset)之后插入

        // 收集插入点及以下的合并范围，取消后重新应用
        const titleMerges: string[] = [];
        if (ws.model.merges) {
          ws.model.merges.forEach((merge: any) => {
            if (typeof merge === 'string') {
              const m = merge.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
              if (m) {
                const r1 = parseInt(m[2]);
                if (r1 >= titleInsertPos) {
                  titleMerges.push(merge);
                }
              }
            }
          });
        }
        for (const merge of titleMerges) {
          try { (ws as any).unMergeCells(merge); } catch { /* 忽略 */ }
        }

        ws.spliceRows(titleInsertPos, 0, ...Array(extraTitleRows).fill(undefined));

        for (const merge of titleMerges) {
          const m = merge.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
          if (m) {
            const [, col1, row1, col2, row2] = m;
            const r1 = parseInt(row1) + extraTitleRows;
            const r2 = parseInt(row2) + extraTitleRows;
            ws.mergeCells(`${col1}${r1}:${col2}${r2}`);
          }
        }

        // 复制参考标题行的格式到新插入的行
        for (let i = 0; i < extraTitleRows; i++) {
          copyRow(7 + offset, titleInsertPos + i);
        }

        // 复制模板参考标题行的合并范围到新插入的行
        const templateRowNum = 7 + offset;
        const templateTitleMerges: { col1: string; col2: string }[] = [];
        if (ws.model.merges) {
          ws.model.merges.forEach((merge: any) => {
            if (typeof merge === 'string') {
              const m = merge.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
              if (m) {
                const r1 = parseInt(m[2]);
                const r2 = parseInt(m[4]);
                if (r1 === templateRowNum && r2 === templateRowNum) {
                  templateTitleMerges.push({ col1: m[1], col2: m[3] });
                }
              }
            }
          });
        }
        for (let i = 0; i < extraTitleRows; i++) {
          const newRow = titleInsertPos + i;
          for (const { col1, col2 } of templateTitleMerges) {
            try { ws.mergeCells(`${col1}${newRow}:${col2}${newRow}`); } catch { /* 忽略合并冲突 */ }
          }
        }
      }
    }
  }

  // 填写每组SKU数据
  for (let skuIdx = 0; skuIdx < numSkus; skuIdx++) {
    const skuInfo = allInfos[skuIdx];
    const startRow = 2 + skuIdx * 3;
    const endRow = startRow + 2;

    const cost = parseFloat(skuInfo.costPrice) || 0;
    const autoPrices = calculatePrices(cost);

    const skuPriceOverrides = options?.multiPriceOverrides?.[skuIdx];
    const prices = {
      tier1: skuPriceOverrides?.tier1 ?? options?.priceOverrides?.tier1 ?? autoPrices.tier1,
      tier2: skuPriceOverrides?.tier2 ?? options?.priceOverrides?.tier2 ?? autoPrices.tier2,
      tier3: skuPriceOverrides?.tier3 ?? options?.priceOverrides?.tier3 ?? autoPrices.tier3,
    };

    // 属性图：收集到 pendingImages，在所有行操作和合并完成后统一插入
    const attrBlob = allAttrBlobs[skuIdx] || null;
    if (attrBlob) {
      pendingImages.push({ blob: attrBlob, range: `A${startRow}:A${endRow}` });
    } else {
      console.warn(`[属性图] SKU ${skuIdx} 无属性图blob (allAttrBlobs长度:${allAttrBlobs.length})`);
    }

    // 多SKU: 合并新增行的单元格
  if (isMulti && skuIdx > 0) {
    ws.mergeCells(`A${startRow}:A${endRow}`);
    ws.mergeCells(`B${startRow}:B${endRow}`);
    ws.mergeCells(`C${startRow}:C${endRow}`);
    ws.mergeCells(`E${startRow}:E${endRow}`);
    ws.mergeCells(`H${startRow}:H${endRow}`);
    ws.mergeCells(`I${startRow}:I${endRow}`);
    ws.mergeCells(`J${startRow}:J${endRow}`);
    ws.mergeCells(`K${startRow}:K${endRow}`);
    ws.mergeCells(`O${startRow}:O${endRow}`);
    ws.mergeCells(`P${startRow}:P${endRow}`);
    ws.mergeCells(`Q${startRow}:Q${endRow}`);
    ws.mergeCells(`R${startRow}:R${endRow}`);
  }

  // D列在模板中没有合并，需要为每个SKU块（含第一个）创建纵向合并
  ws.mergeCells(`D${startRow}:D${endRow}`);

    ws.getCell(`B${startRow}`).value = skuInfo.productCode;
    ws.getCell(`C${startRow}`).value = skuInfo.productName || '';

    const costValue = parseFloat(skuInfo.costPrice) || 0;
    ws.getCell(`D${startRow}`).value = costValue;

    if (!options?.skipPhysicalInfo) {
      ws.getCell(`E${startRow}`).value = parseFloat(skuInfo.weight) || '';
      ws.getCell(`G${startRow}`).value = parseFloat(skuInfo.packageLength) || '';
      ws.getCell(`G${startRow + 1}`).value = parseFloat(skuInfo.packageWidth) || '';
      ws.getCell(`G${startRow + 2}`).value = parseFloat(skuInfo.packageHeight) || '';
    }

    // 材质：使用表单填写的值，不清空其他行（合并单元格后清空会导致值丢失）
    if (skuInfo.material) {
      ws.getCell(`H${startRow}`).value = skuInfo.material;
    }

    ws.getCell(`M${startRow}`).value = prices.tier3;
    ws.getCell(`M${startRow + 1}`).value = prices.tier2;
    ws.getCell(`M${startRow + 2}`).value = prices.tier1;

    const profitRate = (price: number) => price > 0 ? Math.round((1 - costValue / price) * 10000) / 10000 : 0;
    ws.getCell(`N${startRow}`).value = { formula: `1-(D${startRow}/M${startRow})`, result: profitRate(prices.tier3) };
    ws.getCell(`N${startRow + 1}`).value = { formula: `1-(D${startRow}/M${startRow + 1})`, result: profitRate(prices.tier2) };
    ws.getCell(`N${startRow + 2}`).value = { formula: `1-(D${startRow}/M${startRow + 2})`, result: profitRate(prices.tier1) };
  }

  // 共享内容（按偏移量填写）
  const useCode = isMulti && options?.mergedCode ? options.mergedCode : info.productCode;
  const firstInfo = allInfos[0];

  // 参考标题/关键词/参考链接：全局去重，内容相同的只写一行
  const uniqueTitleSkus: number[] = isMulti ? (() => {
    const indices: number[] = [0];
    const seenContents = new Set([`${allInfos[0].competitorTitle || ''}||${allInfos[0].keywords || ''}||${allInfos[0].relatedLink || ''}`]);
    for (let i = 1; i < numSkus; i++) {
      const content = `${allInfos[i].competitorTitle || ''}||${allInfos[i].keywords || ''}||${allInfos[i].relatedLink || ''}`;
      if (!seenContents.has(content)) {
        indices.push(i);
        seenContents.add(content);
      }
    }
    return indices;
  })() : [0];

  for (let i = 0; i < uniqueTitleSkus.length; i++) {
    const skuIdx = uniqueTitleSkus[i];
    const skuInfo = allInfos[skuIdx];
    const titleRow = 7 + offset + i;
    ws.getCell(`A${titleRow}`).value = skuInfo.competitorTitle || '';
    ws.getCell(`D${titleRow}`).value = { formula: `LEN(A${titleRow})`, result: (skuInfo.competitorTitle || '').length };
    ws.getCell(`E${titleRow}`).value = skuInfo.keywords || '';
    ws.getCell(`F${titleRow}`).value = skuInfo.relatedLink || '';
  }

  // 调整后的偏移量（参考标题额外行导致后续行下移）
  const titleExtraOffset = isMulti ? (uniqueTitleSkus.length - 1) : 0;
  const adjustedOffset = offset + titleExtraOffset;

  ws.getCell(`A${9 + adjustedOffset}`).value = `1、${useCode}-1`;
  ws.getCell(`A${14 + adjustedOffset}`).value = firstInfo.material || '';
  ws.getCell(`B${15 + adjustedOffset}`).value = firstInfo.category || '';
  ws.getCell(`B${16 + adjustedOffset}`).value = firstInfo.theme || '';
  ws.getCell(`B${17 + adjustedOffset}`).value = firstInfo.keywords || '';
  // 主卖颜色：各SKU颜色去重后用逗号拼接
  const colorSet = new Set<string>();
  for (const info of allInfos) {
    if (info.mainColor && info.mainColor.trim()) {
      info.mainColor.split(/[,，]/).map(c => c.trim()).filter(c => c).forEach(c => colorSet.add(c));
    }
  }
  ws.getCell(`B${18 + adjustedOffset}`).value = [...colorSet].join('，') || '';

  // 所有行操作和合并完成后，统一插入属性图
  for (const img of pendingImages) {
    try {
      const imgBuffer = await img.blob.arrayBuffer();
      const blobName = (img.blob as File).name || '';
      const isPng = img.blob.type.includes('png') || /\.png$/i.test(blobName);
      const ext = isPng ? 'png' : 'jpeg';
      const imageId = workbook.addImage({ buffer: new Uint8Array(imgBuffer), extension: ext as any });
      ws.addImage(imageId, img.range);
    } catch (imgErr) {
      console.error(`[属性图] 插入失败:`, imgErr);
    }
  }

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
  outputName: string,
  options?: {
    multiInfos?: ProductInfo[];
    mergedCode?: string;
  }
): Promise<TableFillResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  const isMulti = options?.multiInfos && options.multiInfos.length > 1;
  const allInfos = isMulti ? options.multiInfos! : [info];
  const numSkus = allInfos.length;
  const skuRowOffset = numSkus - 1; // sku信息表每组占1行，偏移量 = numSkus - 1
  let titleRowOffset = 0; // 产品信息表参考标题行的偏移量

  // === sku信息 工作表 ===
  const wsSku = workbook.getWorksheet('sku信息');
  if (!wsSku) throw new Error('sku信息 工作表不存在');

  // 辅助函数：复制一行的所有单元格内容和样式到目标行
  const copyTableRow = (ws: ExcelJS.Worksheet, srcRow: number, tgtRow: number) => {
    const src = ws.getRow(srcRow);
    const tgt = ws.getRow(tgtRow);
    src.eachCell({ includeEmpty: true }, (cell: any, colNum: number) => {
      const tgtCell = tgt.getCell(colNum);
      tgtCell.value = cell.value;
      const srcStyle = cell.style;
      if (srcStyle) {
        const styleObj: any = {};
        if (srcStyle.font) styleObj.font = srcStyle.font;
        if (srcStyle.alignment) styleObj.alignment = srcStyle.alignment;
        if (srcStyle.border) styleObj.border = srcStyle.border;
        if (srcStyle.fill) styleObj.fill = srcStyle.fill;
        if (cell.numFmt) styleObj.numFmt = cell.numFmt;
        if (Object.keys(styleObj).length > 0) {
          tgtCell.style = styleObj;
        }
      }
    });
    if (src.height) {
      tgt.height = src.height;
    }
  };

  // 多SKU: 为每个额外SKU插入1行
  if (isMulti) {
    const rowsToAdd = numSkus - 1;
    wsSku.spliceRows(3, 0, ...Array(rowsToAdd).fill(undefined));
    for (let i = 1; i < numSkus; i++) {
      copyTableRow(wsSku, 2, 2 + i);
    }
  }

  for (let skuIdx = 0; skuIdx < numSkus; skuIdx++) {
    const skuInfo = allInfos[skuIdx];
    const row = 2 + skuIdx;
    const costValue = parseFloat(skuInfo.costPrice) || 0;

    wsSku.getCell(`A${row}`).value = skuInfo.productCode;
    wsSku.getCell(`B${row}`).value = skuInfo.productName || '';
    wsSku.getCell(`C${row}`).value = skuInfo.englishAttribute || '';
    wsSku.getCell(`D${row}`).value = costValue;
    wsSku.getCell(`E${row}`).value = parseFloat(skuInfo.weight) || '';
    wsSku.getCell(`K${row}`).value = parseFloat(skuInfo.packageLength) || '';
    wsSku.getCell(`L${row}`).value = parseFloat(skuInfo.packageWidth) || '';
    wsSku.getCell(`M${row}`).value = parseFloat(skuInfo.packageHeight) || '';
  }

  // === 产品信息 工作表 ===
  const wsProduct = workbook.getWorksheet('产品信息');
  if (!wsProduct) throw new Error('产品信息 工作表不存在');

  // 多SKU: 为参考标题/关键词/参考链接插入额外行（仅内容不同的SKU才插入）
  if (isMulti) {
    const uniqueTitleSkus: number[] = [0];
    const seenContents = new Set([`${allInfos[0].competitorTitle || ''}||${allInfos[0].keywords || ''}||${allInfos[0].relatedLink || ''}`]);
    for (let i = 1; i < numSkus; i++) {
      const content = `${allInfos[i].competitorTitle || ''}||${allInfos[i].keywords || ''}||${allInfos[i].relatedLink || ''}`;
      if (!seenContents.has(content)) {
        uniqueTitleSkus.push(i);
        seenContents.add(content);
      }
    }
    const extraTitleRows = uniqueTitleSkus.length - 1;

    if (extraTitleRows > 0) {
      wsProduct.spliceRows(3, 0, ...Array(extraTitleRows).fill(undefined));
      for (let i = 0; i < extraTitleRows; i++) {
        copyTableRow(wsProduct, 2, 3 + i);
      }

      // 复制模板参考标题行(第2行)的合并范围到新插入的行
      const templateTitleMergesT3: { col1: string; col2: string }[] = [];
      if (wsProduct.model.merges) {
        wsProduct.model.merges.forEach((merge: any) => {
          if (typeof merge === 'string') {
            const m = merge.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
            if (m) {
              const r1 = parseInt(m[2]);
              const r2 = parseInt(m[4]);
              if (r1 === 2 && r2 === 2) {
                templateTitleMergesT3.push({ col1: m[1], col2: m[3] });
              }
            }
          }
        });
      }
      for (let i = 0; i < extraTitleRows; i++) {
        const newRow = 3 + i;
        for (const { col1, col2 } of templateTitleMergesT3) {
          try { wsProduct.mergeCells(`${col1}${newRow}:${col2}${newRow}`); } catch { /* 忽略 */ }
        }
      }
    }

    // 填写参考标题行
    for (let i = 0; i < uniqueTitleSkus.length; i++) {
      const skuIdx = uniqueTitleSkus[i];
      const skuInfo = allInfos[skuIdx];
      const row = 2 + i;
      wsProduct.getCell(`A${row}`).value = skuInfo.competitorTitle || '';
      wsProduct.getCell(`D${row}`).value = { formula: `LEN(A${row})`, result: (skuInfo.competitorTitle || '').length };
      wsProduct.getCell(`E${row}`).value = skuInfo.keywords || '';
      wsProduct.getCell(`F${row}`).value = skuInfo.relatedLink || '';
    }

    // 偏移量按实际插入的行数计算
    titleRowOffset = uniqueTitleSkus.length - 1;
  } else {
    // 单SKU直接填第一行
    wsProduct.getCell(`A2`).value = allInfos[0].competitorTitle || '';
    wsProduct.getCell(`D2`).value = { formula: `LEN(A2)`, result: (allInfos[0].competitorTitle || '').length };
    wsProduct.getCell(`E2`).value = allInfos[0].keywords || '';
    wsProduct.getCell(`F2`).value = allInfos[0].relatedLink || '';
    titleRowOffset = 0;
  }

  // 共享内容（按偏移量填写）
  const useCode = isMulti && options?.mergedCode ? options.mergedCode : info.productCode;
  const firstInfo = allInfos[0];

  wsProduct.getCell(`A${4 + titleRowOffset}`).value = `1、${useCode}-1`;
  wsProduct.getCell(`A${9 + titleRowOffset}`).value = firstInfo.material || '';
  wsProduct.getCell(`B${10 + titleRowOffset}`).value = firstInfo.category || '';
  wsProduct.getCell(`B${11 + titleRowOffset}`).value = firstInfo.theme || '';
  wsProduct.getCell(`B${12 + titleRowOffset}`).value = firstInfo.keywords || '';
  // 主卖颜色：各SKU颜色去重后用逗号拼接
  const colorSetT3 = new Set<string>();
  for (const info of allInfos) {
    if (info.mainColor && info.mainColor.trim()) {
      info.mainColor.split(/[,，]/).map(c => c.trim()).filter(c => c).forEach(c => colorSetT3.add(c));
    }
  }
  wsProduct.getCell(`B${13 + titleRowOffset}`).value = [...colorSetT3].join('，') || '';

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
  priceOverrides?: PriceOverrides,
  multiOptions?: {
    multiInfos: ProductInfo[];
    multiAttrBlobs: (Blob | null)[];
    multiPriceOverrides?: PriceOverrides[];
  }
): Promise<TableFillResult[]> {
  const results: TableFillResult[] = [];

  const isMulti = multiOptions && multiOptions.multiInfos.length > 1;
  const mergedCode = isMulti
    ? generateMergedSkuName(multiOptions.multiInfos.map(p => p.productCode).filter(c => c.trim()))
    : info.productCode;

  // 加载模板
  let buf1: ArrayBuffer, buf2: ArrayBuffer, buf3: ArrayBuffer;
  try {
    [buf1, buf2, buf3] = await Promise.all([
      loadTemplate('表一'),
      loadTemplate('表二'),
      loadTemplate('表三'),
    ]);
  } catch (e: any) {
    throw new Error(`模板加载失败: ${e.message}`);
  }

  // 填写表一: 合并编码-SP (填写重量和包装尺寸)
  try {
    const result1 = await fillSPSheet(
      buf1,
      info,
      attributeImageBlob,
      `${mergedCode}-SP`,
      {
        skipPhysicalInfo: false,
        priceOverrides,
        multiInfos: isMulti ? multiOptions!.multiInfos : undefined,
        multiAttrBlobs: isMulti ? multiOptions!.multiAttrBlobs : undefined,
        mergedCode: isMulti ? mergedCode : undefined,
        multiPriceOverrides: isMulti ? multiOptions!.multiPriceOverrides : undefined,
      }
    );
    results.push(result1);
  } catch (e: any) {
    throw new Error(`表一填写失败: ${e.message}`);
  }

  // 填写表二: 合并编码-S (不填写重量和包装尺寸)
  try {
    const result2 = await fillSPSheet(
      buf2,
      info,
      attributeImageBlob,
      `${mergedCode}-S`,
      {
        skipPhysicalInfo: true,
        priceOverrides,
        multiInfos: isMulti ? multiOptions!.multiInfos : undefined,
        multiAttrBlobs: isMulti ? multiOptions!.multiAttrBlobs : undefined,
        mergedCode: isMulti ? mergedCode : undefined,
        multiPriceOverrides: isMulti ? multiOptions!.multiPriceOverrides : undefined,
      }
    );
    results.push(result2);
  } catch (e: any) {
    throw new Error(`表二填写失败: ${e.message}`);
  }

  // 填写表三: 合并编码-商品品类-全平台-刊登资料
  try {
    const result3 = await fillTable3(
      buf3,
      info,
      `${mergedCode}-${info.category || '未分类'}-全平台-刊登资料`,
      {
        multiInfos: isMulti ? multiOptions!.multiInfos : undefined,
        mergedCode: isMulti ? mergedCode : undefined,
      }
    );
    results.push(result3);
  } catch (e: any) {
    throw new Error(`表三填写失败: ${e.message}`);
  }

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
