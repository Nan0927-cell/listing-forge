/**
 * 测试数据注入脚本
 *
 * 使用方法：
 * 1. 在浏览器中打开 http://localhost:5173
 * 2. 按 F12 打开开发者工具
 * 3. 在 Console 中粘贴本文件全部内容并回车
 * 4. 点击顶部导航栏的"历史"按钮即可查看注入的测试数据
 *
 * 也可以在浏览器地址栏输入:
 *   javascript:void(import('/src/dev/injectTestData.ts'))
 * (仅限开发环境)
 */

interface MockHistoryEntry {
  id: string;
  timestamp: number;
  productInfo: {
    productLine: 1 | 2 | 3;
    productCode: string;
    styleCode: string;
    productName: string;
    costPrice: string;
    weight: string;
    packageLength: string;
    packageWidth: string;
    packageHeight: string;
    competitorTitle: string;
    keywords: string;
    relatedLink: string;
    material: string;
    category: string;
    theme: string;
    mainColor: string;
    englishAttribute: string;
  };
  fileCount: {
    folder1200: number;
    folder1688: number;
    videos: number;
    ozonFiles: number;
  };
  fillTables: boolean;
  status: 'completed' | 'partial' | 'failed';
}

// 生成测试数据
function generateMockHistory(): MockHistoryEntry[] {
  const now = Date.now();
  const day = 86400000;
  const hour = 3600000;

  const templates = [
    {
      productInfo: {
        productLine: 2 as const,
        productCode: 'XS0607-121',
        styleCode: 'XS0607',
        productName: '桃皮绒枕套',
        costPrice: '15.5',
        weight: '90',
        packageLength: '30',
        packageWidth: '20',
        packageHeight: '5',
        competitorTitle: 'Peach Skin Pillowcase Soft Comfortable',
        keywords: 'Peach Skin Pillowcase',
        relatedLink: 'https://www.amazon.com/dp/B08XYZ123',
        material: '涤纶',
        category: '保护罩',
        theme: '',
        mainColor: '粉色',
        englishAttribute: '1 PC Peach Skin Pillowcase',
      },
      fileCount: { folder1200: 12, folder1688: 4, videos: 1, ozonFiles: 0 },
      fillTables: true,
      status: 'completed' as const,
    },
    {
      productInfo: {
        productLine: 1 as const,
        productCode: 'XS7046-101',
        styleCode: 'XS7046',
        productName: '圣诞门帘',
        costPrice: '22.0',
        weight: '180',
        packageLength: '50',
        packageWidth: '40',
        packageHeight: '8',
        competitorTitle: 'Christmas Door Curtain Xmas Decor',
        keywords: 'Christmas Curtain Door Cover',
        relatedLink: 'https://www.amazon.com/dp/B08ABC456',
        material: '亚麻',
        category: '门帘',
        theme: '圣诞',
        mainColor: '红色',
        englishAttribute: '1 PC Christmas Door Curtain',
      },
      fileCount: { folder1200: 18, folder1688: 4, videos: 2, ozonFiles: 6 },
      fillTables: true,
      status: 'completed' as const,
    },
    {
      productInfo: {
        productLine: 3 as const,
        productCode: 'XS3022-005',
        styleCode: 'XS3022',
        productName: '万圣节抱枕套',
        costPrice: '8.8',
        weight: '65',
        packageLength: '25',
        packageWidth: '18',
        packageHeight: '4',
        competitorTitle: 'Halloween Pillow Cover Spooky Decor',
        keywords: 'Halloween Pillow Cover',
        relatedLink: 'https://www.amazon.com/dp/B08DEF789',
        material: '棉',
        category: '抱枕套',
        theme: '万圣节',
        mainColor: '黑色',
        englishAttribute: '1 PC Halloween Pillow Cover',
      },
      fileCount: { folder1200: 8, folder1688: 4, videos: 0, ozonFiles: 0 },
      fillTables: false,
      status: 'partial' as const,
    },
    {
      productInfo: {
        productLine: 2 as const,
        productCode: 'XS5018-203',
        styleCode: 'XS5018',
        productName: '情人节桌布',
        costPrice: '32.5',
        weight: '320',
        packageLength: '60',
        packageWidth: '45',
        packageHeight: '10',
        competitorTitle: "Valentine's Day Tablecloth Romantic Decor",
        keywords: 'Valentine Tablecloth Heart Print',
        relatedLink: 'https://www.amazon.com/dp/B08GHI012',
        material: '涤纶',
        category: '桌布',
        theme: '情人节',
        mainColor: '酒红色',
        englishAttribute: '1 PC Valentine Tablecloth 60x45 inch',
      },
      fileCount: { folder1200: 15, folder1688: 4, videos: 1, ozonFiles: 4 },
      fillTables: true,
      status: 'completed' as const,
    },
    {
      productInfo: {
        productLine: 1 as const,
        productCode: 'XS8033-077',
        styleCode: 'XS8033',
        productName: '复活节彩蛋收纳袋',
        costPrice: '12.0',
        weight: '45',
        packageLength: '20',
        packageWidth: '15',
        packageHeight: '3',
        competitorTitle: 'Easter Egg Storage Bag Colorful',
        keywords: 'Easter Egg Bag Storage',
        relatedLink: 'https://www.amazon.com/dp/B08JKL345',
        material: '塑料',
        category: '收纳袋',
        theme: '复活节',
        mainColor: '彩色',
        englishAttribute: '1 PC Easter Egg Storage Bag',
      },
      fileCount: { folder1200: 6, folder1688: 4, videos: 0, ozonFiles: 0 },
      fillTables: false,
      status: 'failed' as const,
    },
    {
      productInfo: {
        productLine: 2 as const,
        productCode: 'XS6041-309',
        styleCode: 'XS6041',
        productName: '母亲节围裙',
        costPrice: '18.8',
        weight: '150',
        packageLength: '35',
        packageWidth: '28',
        packageHeight: '6',
        competitorTitle: "Mother's Day Apron Kitchen Gift",
        keywords: 'Mother Day Apron Gift',
        relatedLink: 'https://www.amazon.com/dp/B08MNO678',
        material: '棉',
        category: '围裙',
        theme: '母亲节',
        mainColor: '蓝色',
        englishAttribute: '1 PC Mothers Day Apron',
      },
      fileCount: { folder1200: 10, folder1688: 4, videos: 1, ozonFiles: 2 },
      fillTables: true,
      status: 'completed' as const,
    },
  ];

  // 按时间倒序排列（最新的在前）
  const timeOffsets = [2 * hour, 5 * hour, 1 * day + 3 * hour, 2 * day, 4 * day + 6 * hour, 7 * day];

  return templates.map((tpl, i) => ({
    ...tpl,
    id: `mock-${i}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now - timeOffsets[i],
  }));
}

// 注入到 localStorage
function injectTestData() {
  const STORAGE_KEY = 'zewphoto-store';
  const mockHistory = generateMockHistory();

  // 读取现有数据
  let stored: any = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {
    // ignore
  }

  // 合并历史记录（去重：保留mock数据，同时保留已有的真实数据）
  const existingHistory = stored.state?.history || [];
  const existingIds = new Set(existingHistory.map((h: any) => h.id));
  const newHistory = [
    ...mockHistory.filter((h) => !existingIds.has(h.id)),
    ...existingHistory,
  ].slice(0, 50);

  // 写入 localStorage
  const newState = {
    ...stored,
    state: {
      ...stored.state,
      productInfo: stored.state?.productInfo || {
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
      },
      history: newHistory,
    },
    version: 0,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));

  console.log(
    `%c✅ 已注入 ${mockHistory.length} 条测试历史记录！`,
    'color: #FF6B35; font-weight: bold; font-size: 14px;'
  );
  console.log(
    `%c点击顶部导航栏的「历史」按钮查看。`,
    'color: #666; font-size: 12px;'
  );
  console.log(
    `%c如需清除测试数据，运行: clearTestData()`,
    'color: #999; font-size: 11px;'
  );

  // 刷新页面以让 zustand 读取新数据
  setTimeout(() => window.location.reload(), 500);
}

// 清除测试数据
function clearTestData() {
  const STORAGE_KEY = 'zewphoto-store';
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  const data = JSON.parse(raw);
  if (data.state?.history) {
    data.state.history = data.state.history.filter(
      (h: any) => !h.id?.startsWith('mock-')
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log('%c已清除所有测试数据', 'color: #FF6B35; font-weight: bold;');
    setTimeout(() => window.location.reload(), 500);
  }
}

// 暴露到全局
(window as any).injectTestData = injectTestData;
(window as any).clearTestData = clearTestData;

// 自动执行
injectTestData();
