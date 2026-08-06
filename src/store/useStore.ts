import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ProductInfo,
  ScanResult,
  ClassifiedImage,
  Pair1688,
  ProcessResult,
  TableFillResult,
  ExportGroup,
  StepStatus,
  ProgressInfo,
  HistoryEntry,
} from '@/types';

// 默认产品信息
const defaultProductInfo: ProductInfo = {
  productLine: 2,
  productCode: '',
  styleCode: '',
  productName: '',
  costPrice: '',
  weight: '',
  packageLength: '',
  packageWidth: '',
  packageHeight: '',
  competitorTitle: '',
  keywords: '',
  relatedLink: '',
  material: '',
  category: '',
  theme: '',
  mainColor: '',
  englishAttribute: '',
};

// 步骤定义
export const STEPS = [
  { id: 'station',  label: '工作台',   labelEn: 'STATION',  path: '/' },
  { id: 'classify', label: '图片分类', labelEn: 'CLASSIFY', path: '/classify' },
  { id: 'pair',     label: '1688配对', labelEn: 'PAIR',     path: '/pair' },
  { id: 'forge',    label: '执行处理', labelEn: 'FORGE',    path: '/forge' },
  { id: 'tables',   label: '表格填写', labelEn: 'TABLES',   path: '/tables' },
  { id: 'export',   label: '归类导出', labelEn: 'EXPORT',   path: '/export' },
] as const;

// 默认进度状态
const defaultProgress: ProgressInfo = {
  visible: false,
  title: '',
  current: 0,
  total: 0,
  detail: '',
  percentage: 0,
};

interface StoreState {
  // 产品信息
  productInfo: ProductInfo;
  setProductInfo: (info: Partial<ProductInfo>) => void;
  resetProductInfo: () => void;

  // 文件夹句柄
  inputDirHandle: any | null;
  outputDirHandle: any | null;
  inputDirName: string;
  outputDirName: string;
  setInputDir: (handle: any, name: string) => void;
  setOutputDir: (handle: any, name: string) => void;

  // 扫描结果
  scanResult: ScanResult | null;
  setScanResult: (result: ScanResult | null) => void;

  // 分类后的1200图片
  classifiedImages: ClassifiedImage[];
  setClassifiedImages: (images: ClassifiedImage[]) => void;

  // 1688配对
  pairs1688: Pair1688[];
  setPairs1688: (pairs: Pair1688[]) => void;

  // 处理结果
  processResult: ProcessResult | null;
  setProcessResult: (result: ProcessResult | null) => void;

  // 表格结果
  tableResults: TableFillResult[];
  setTableResults: (results: TableFillResult[]) => void;
  fillTables: boolean;
  setFillTables: (fill: boolean) => void;

  // 导出结构
  exportGroups: ExportGroup[];
  setExportGroups: (groups: ExportGroup[]) => void;

  // 步骤状态
  stepStatuses: Record<string, StepStatus>;
  setStepStatus: (stepId: string, status: StepStatus) => void;
  currentStep: number;
  setCurrentStep: (step: number) => void;

  // 全局错误
  error: string | null;
  setError: (error: string | null) => void;

  // 进度状态
  progress: ProgressInfo;
  showProgress: (title: string, total: number) => void;
  updateProgress: (current: number, detail?: string) => void;
  hideProgress: () => void;

  // 历史记录
  history: HistoryEntry[];
  addHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;

  // 重置全部
  resetAll: () => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // 产品信息
      productInfo: defaultProductInfo,
      setProductInfo: (info) =>
        set((state) => ({ productInfo: { ...state.productInfo, ...info } })),
      resetProductInfo: () => set({ productInfo: defaultProductInfo }),

      // 文件夹句柄
      inputDirHandle: null,
      outputDirHandle: null,
      inputDirName: '',
      outputDirName: '',
      setInputDir: (handle, name) =>
        set({ inputDirHandle: handle, inputDirName: name }),
      setOutputDir: (handle, name) =>
        set({ outputDirHandle: handle, outputDirName: name }),

      // 扫描结果
      scanResult: null,
      setScanResult: (result) => set({ scanResult: result }),

      // 分类图片
      classifiedImages: [],
      setClassifiedImages: (images) => set({ classifiedImages: images }),

      // 1688配对
      pairs1688: [],
      setPairs1688: (pairs) => set({ pairs1688: pairs }),

      // 处理结果
      processResult: null,
      setProcessResult: (result) => set({ processResult: result }),

      // 表格结果
      tableResults: [],
      setTableResults: (results) => set({ tableResults: results }),
      fillTables: false,
      setFillTables: (fill) => set({ fillTables: fill }),

      // 导出结构
      exportGroups: [],
      setExportGroups: (groups) => set({ exportGroups: groups }),

      // 步骤状态
      stepStatuses: {
        station: 'active',
        classify: 'idle',
        pair: 'idle',
        forge: 'idle',
        tables: 'idle',
        export: 'idle',
      },
      setStepStatus: (stepId, status) =>
        set((state) => ({
          stepStatuses: { ...state.stepStatuses, [stepId]: status },
        })),
      currentStep: 0,
      setCurrentStep: (step) => set({ currentStep: step }),

      // 全局错误
      error: null,
      setError: (error) => set({ error }),

      // 进度状态
      progress: defaultProgress,
      showProgress: (title, total) =>
        set({
          progress: {
            visible: true,
            title,
            current: 0,
            total,
            detail: '准备中...',
            percentage: 0,
          },
        }),
      updateProgress: (current, detail) =>
        set((state) => {
          const percentage = state.progress.total > 0
            ? Math.round((current / state.progress.total) * 100)
            : 0;
          return {
            progress: {
              ...state.progress,
              current,
              detail: detail || state.progress.detail,
              percentage,
            },
          };
        }),
      hideProgress: () =>
        set((state) => ({ progress: { ...state.progress, visible: false } })),

      // 历史记录
      history: [],
      addHistory: (entry) =>
        set((state) => ({
          history: [
            {
              ...entry,
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
              timestamp: Date.now(),
            },
            ...state.history,
          ].slice(0, 50), // 最多保留50条
        })),
      removeHistory: (id) =>
        set((state) => ({
          history: state.history.filter((h) => h.id !== id),
        })),
      clearHistory: () => set({ history: [] }),

      // 重置全部
      resetAll: () =>
        set({
          productInfo: defaultProductInfo,
          inputDirHandle: null,
          outputDirHandle: null,
          inputDirName: '',
          outputDirName: '',
          scanResult: null,
          classifiedImages: [],
          pairs1688: [],
          processResult: null,
          tableResults: [],
          fillTables: false,
          exportGroups: [],
          stepStatuses: {
            station: 'active',
            classify: 'idle',
            pair: 'idle',
            forge: 'idle',
            tables: 'idle',
            export: 'idle',
          },
          currentStep: 0,
          error: null,
          progress: defaultProgress,
        }),
    }),
    {
      name: 'zewphoto-store',
      // 只持久化产品信息和历史记录
      partialize: (state) => ({
        productInfo: state.productInfo,
        history: state.history,
      }),
    }
  )
);
