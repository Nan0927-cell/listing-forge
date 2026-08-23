// ===================== 刊登模式 =====================
export type ListingMode = 'single' | 'multiA' | 'multiB';

// ===================== 产品信息类型 =====================
export interface ProductInfo {
  productLine: 1 | 2 | 3;
  productCode: string;       // 商品编码 e.g. XS0607-121
  styleCode: string;          // 款式编码 e.g. XS0607
  productName: string;        // 产品中文名
  costPrice: string;          // 产品成本价
  weight: string;             // 商品重量(g) 只填数字
  packageLength: string;      // 包装尺寸长(cm)
  packageWidth: string;       // 包装尺寸宽(cm)
  packageHeight: string;      // 包装尺寸高(cm)
  competitorTitle: string;    // 参考竞品标题
  keywords: string;           // 关键词
  relatedLink: string;        // 相关链接
  material: string;           // 商品材质
  category: string;           // 商品品类
  theme: string;              // 主题
  mainColor: string;          // 商品主要颜色
  englishAttribute: string;   // 商品英文属性
}

// ===================== 文件项类型 =====================
export interface ScannedFile {
  name: string;
  file: File;
  path: string;       // 相对路径
  size: number;
  type: string;
}

export interface ScannedFolder {
  name: string;
  handle: any; // FileSystemDirectoryHandle
  fileCount: number;
}

// ===================== 扫描结果 =====================
export interface ScanResult {
  folders: ScannedFolder[];
  folder1200: ScannedFile[];    // 1200 文件夹图片
  folder1688: ScannedFile[];    // 1688 文件夹图片
  videos: ScannedFile[];        // 视频文件
  ozonFiles: ScannedFile[];     // ozon 文件夹文件
  otherFolders: ScannedFolder[]; // 其他文件夹
  totalFiles: number;
}

// ===================== 图片分类类型 =====================
export type ImageCategory =
  | 'main'        // 主图(首图)
  | 'scene'       // 场景图(效果图)
  | 'detail-grid' // 产品详情(四宫格)
  | 'detail'      // 细节图
  | 'white-bg'    // 白底图
  | 'attribute'   // 属性图(白底+说明)
  | 'unclassified';

export interface ClassifiedImage {
  file: ScannedFile;
  category: ImageCategory;
  newName: string;     // 新文件名
  order: number;       // 顺序
  groupIndex?: number; // 多SKU模式下的组索引（0-based）
}

// ===================== 1688配对类型 =====================
export interface Pair1688 {
  squareImage: ScannedFile | null;  // 方图
  mainImage: ScannedFile | null;     // 首图
  groupName: string;                 // 组名 (SKU编码)
  groupIndex?: number;               // 组索引（用于多SKU导航）
}

// ===================== 处理结果 =====================
export interface ProcessResult {
  folder1200Renamed: { original: string; newName: string }[];
  folder800: { name: string; blob: Blob }[];
  folder750: { name: string; blob: Blob }[];
  folder1688Renamed: string;       // 重命名后的1688文件夹名
  videoFolderName: string;         // 视频文件夹名
  ozonRenamed: string | null;      // ozon重命名后的名称
  attributeImages: string[];       // 属性图名称列表
}

// ===================== 表格数据 =====================
export interface TablePrices {
  tier1: number;  // 1档 50%利润率
  tier2: number;  // 2档 45%利润率
  tier3: number;  // 3档 40%利润率
}

export interface TableFillResult {
  name: string;         // 表格名称
  buffer: ArrayBuffer;  // 生成的Excel数据
  size: number;
}

// ===================== 导出结构 =====================
export interface ExportGroup {
  folderName: string;
  items: ExportItem[];
}

export interface ExportChild {
  name: string;
  blob?: Blob;              // 文件时有值
  children?: ExportChild[]; // 文件夹时有值
}

export interface ExportItem {
  type: 'folder' | 'file';
  name: string;
  source: string;     // 来源描述
  blob?: Blob;        // 文件数据(如果是文件)
  children?: ExportChild[]; // 文件夹内的内容（支持嵌套子文件夹）
}

// ===================== 步骤状态 =====================
export type StepStatus = 'idle' | 'active' | 'done' | 'error';

export interface StepState {
  id: string;
  label: string;
  labelEn: string;
  status: StepStatus;
  path: string;
}

// ===================== 进度状态 =====================
export interface ProgressInfo {
  visible: boolean;
  title: string;
  current: number;
  total: number;
  detail: string;
  percentage: number;
}

// ===================== 历史记录 =====================
export interface HistoryEntry {
  id: string;
  timestamp: number;
  productInfo: ProductInfo;
  fileCount: {
    folder1200: number;
    folder1688: number;
    videos: number;
    ozonFiles: number;
  };
  fillTables: boolean;
  status: 'completed' | 'partial' | 'failed';
}
