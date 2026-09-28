export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/add/index',
    'pages/history/index',
    'pages/stats/index',
    'pages/categories/index',
    'pages/recurring/index',
    'pages/todos/index',
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#FFFFFF',
    navigationBarTitleText: '每日小记',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#A8A8A4',
    selectedColor: '#2E3A8C',
    backgroundColor: '#FFFFFF',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/index/index', text: '首页' },
      { pagePath: 'pages/add/index', text: '记一笔' },
      { pagePath: 'pages/history/index', text: '账单' },
      { pagePath: 'pages/stats/index', text: '统计' },
    ],
  },
})
