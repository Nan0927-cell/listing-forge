/**
 * 历史记录面板 - 测试数据注入脚本 (纯JS版)
 *
 * 使用方法：
 * 1. 在浏览器中打开 http://localhost:5173
 * 2. 按 F12 打开开发者工具，切到 Console
 * 3. 复制本文件全部内容，粘贴到 Console 回车
 * 4. 页面自动刷新后，点击顶部「历史」按钮即可查看
 *
 * 清除测试数据：在 Console 输入 clearTestData() 回车
 */
;(function () {
  var STORAGE_KEY = 'zewphoto-store'
  var now = Date.now()
  var day = 86400000
  var hour = 3600000

  var templates = [
    {
      productInfo: {
        productLine: 2, productCode: 'XS0607-121', styleCode: 'XS0607',
        productName: '桃皮绒枕套', costPrice: '15.5', weight: '90',
        packageLength: '30', packageWidth: '20', packageHeight: '5',
        competitorTitle: 'Peach Skin Pillowcase Soft Comfortable',
        keywords: 'Peach Skin Pillowcase',
        relatedLink: 'https://www.amazon.com/dp/B08XYZ123',
        material: '涤纶', category: '保护罩', theme: '', mainColor: '粉色',
        englishAttribute: '1 PC Peach Skin Pillowcase',
      },
      fileCount: { folder1200: 12, folder1688: 4, videos: 1, ozonFiles: 0 },
      fillTables: true, status: 'completed',
    },
    {
      productInfo: {
        productLine: 1, productCode: 'XS7046-101', styleCode: 'XS7046',
        productName: '圣诞门帘', costPrice: '22.0', weight: '180',
        packageLength: '50', packageWidth: '40', packageHeight: '8',
        competitorTitle: 'Christmas Door Curtain Xmas Decor',
        keywords: 'Christmas Curtain Door Cover',
        relatedLink: 'https://www.amazon.com/dp/B08ABC456',
        material: '亚麻', category: '门帘', theme: '圣诞', mainColor: '红色',
        englishAttribute: '1 PC Christmas Door Curtain',
      },
      fileCount: { folder1200: 18, folder1688: 4, videos: 2, ozonFiles: 6 },
      fillTables: true, status: 'completed',
    },
  ]

  var offsets = [2 * hour, 5 * hour]

  var mockHistory = templates.map(function (tpl, i) {
    return Object.assign({}, tpl, {
      id: 'mock-' + i + '-' + Math.random().toString(36).slice(2, 7),
      timestamp: now - offsets[i],
    })
  })

  // 读取现有 localStorage 数据
  var stored = {}
  try {
    var raw = localStorage.getItem(STORAGE_KEY)
    if (raw) stored = JSON.parse(raw)
  } catch (e) {}

  // 合并历史（去重）
  var existing = (stored.state && stored.state.history) || []
  var existingIds = {}
  existing.forEach(function (h) { existingIds[h.id] = true })

  var merged = mockHistory
    .filter(function (h) { return !existingIds[h.id] })
    .concat(existing)
    .slice(0, 50)

  // 确保产品信息有默认值
  var defaultProductInfo = {
    productLine: 2, productCode: '', styleCode: '', productName: '',
    costPrice: '', weight: '', packageLength: '', packageWidth: '',
    packageHeight: '', competitorTitle: '', keywords: '', relatedLink: '',
    material: '', category: '', theme: '', mainColor: '', englishAttribute: '',
  }

  stored.state = stored.state || {}
  stored.state.productInfo = stored.state.productInfo || defaultProductInfo
  stored.state.history = merged
  stored.version = 0

  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

  // 暴露清除函数到全局
  window.clearTestData = function () {
    var raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    var data = JSON.parse(raw)
    if (data.state && data.state.history) {
      data.state.history = data.state.history.filter(function (h) {
        return !h.id || !h.id.startsWith('mock-')
      })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      console.log('%c已清除所有测试数据', 'color:#FF6B35;font-weight:bold;font-size:14px')
      setTimeout(function () { window.location.reload() }, 500)
    }
  }

  console.log(
    '%c✅ 已注入 ' + mockHistory.length + ' 条测试历史记录！',
    'color:#FF6B35;font-weight:bold;font-size:14px'
  )
  console.log('%c页面将在 0.5 秒后刷新...', 'color:#666;font-size:12px')
  console.log('%c清除测试数据请运行: clearTestData()', 'color:#999;font-size:11px')

  setTimeout(function () { window.location.reload() }, 500)
})()
