/* 计序 · 设计 demo 共享假数据（确定性生成，三版共用；字段与 miniapp RecordItem 一致） */
(function () {
  'use strict';

  var TODAY = '2026-11-05';
  var NOW_TIME = '21:40';

  var CATEGORIES = [
    { key: 'food', name: '餐饮饮食', glyph: '食', en: 'Dining', hue: 18, subs: [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐'], ['snack', '零食饮料'], ['takeout', '外卖'], ['party', '聚餐聚会']] },
    { key: 'transport', name: '交通出行', glyph: '行', en: 'Transit', hue: 205, subs: [['bus', '公交地铁'], ['taxi', '网约车'], ['fuel', '加油充电'], ['parking', '停车费'], ['train', '火车高铁'], ['flight', '飞机']] },
    { key: 'shopping', name: '购物消费', glyph: '购', en: 'Shopping', hue: 330, subs: [['clothing', '服装鞋帽'], ['digital', '数码产品'], ['daily', '日用百货'], ['beauty', '美妆护肤'], ['luxury', '奢侈品']] },
    { key: 'housing', name: '住房居家', glyph: '住', en: 'Home', hue: 38, subs: [['rent', '房租/房贷'], ['utility', '水电燃气'], ['property', '物业费'], ['furniture', '家具家电'], ['repair', '维修保养'], ['household', '日用品']] },
    { key: 'entertainment', name: '娱乐休闲', glyph: '乐', en: 'Leisure', hue: 265, subs: [['movie', '电影演出'], ['travel', '旅游度假'], ['fitness', '运动健身'], ['game', '游戏充值'], ['bar', 'KTV酒吧']] },
    { key: 'medical', name: '医疗健康', glyph: '医', en: 'Health', hue: 150, subs: [['doctor', '看病就诊'], ['medicine', '药品购买'], ['checkup', '体检保健']] },
    { key: 'education', name: '教育学习', glyph: '学', en: 'Learning', hue: 228, subs: [['course', '培训课程'], ['book', '书籍资料'], ['exam', '考试报名'], ['stationery', '文具用品']] },
    { key: 'social', name: '人情往来', glyph: '礼', en: 'Gifts', hue: 0, subs: [['gift', '红包礼品'], ['treat', '请客吃饭'], ['wedding', '婚丧嫁娶'], ['donate', '捐款慈善']] },
    { key: 'finance', name: '金融保险', glyph: '金', en: 'Finance', hue: 48, subs: [['insurance', '保险缴费'], ['invest', '投资理财'], ['loan', '贷款还款'], ['fee', '手续费']] },
    { key: 'pet', name: '宠物', glyph: '宠', en: 'Pets', hue: 95, subs: [['pet_food', '宠物食品'], ['pet_medical', '宠物医疗'], ['pet_supply', '宠物用品'], ['pet_beauty', '美容洗护'], ['pet_boarding', '寄养服务'], ['pet_other', '其他宠物']] },
    { key: 'other', name: '其他杂项', glyph: '杂', en: 'Misc', hue: 210, subs: [['express', '快递邮寄'], ['misc', '其他']] }
  ].map(function (c) {
    return { key: c.key, name: c.name, glyph: c.glyph, en: c.en, hue: c.hue, subs: c.subs.map(function (s) { return { key: s[0], name: s[1] }; }) };
  });

  var CAT = {};
  CATEGORIES.forEach(function (c) { CAT[c.key] = c; });

  function subName(ck, sk) {
    var c = CAT[ck];
    for (var i = 0; i < c.subs.length; i++) if (c.subs[i].key === sk) return c.subs[i].name;
    return sk;
  }

  // mulberry32
  var seed = 20261105;
  function rnd() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function chance(p) { return rnd() < p; }
  function between(a, b) { return Math.round((a + rnd() * (b - a)) * 2) / 2; }
  function pick(list) { return list[Math.floor(rnd() * list.length)]; }

  var NOTES = {
    breakfast: ['楼下包子铺', '豆浆油条', '便利店饭团', '肠粉加蛋', '咖啡 + 可颂'],
    lunch: ['公司食堂', '兰州拉面', '轻食沙拉', '黄焖鸡', '麻辣香锅', '和同事拼饭'],
    dinner: ['回家路上的面馆', '潮汕牛肉火锅', '日料小馆', '家常小炒', '酸菜鱼'],
    snack: ['瑞幸 生椰拿铁', '奶茶 少冰', '水果捞', '711 夜宵', '便利店零食'],
    takeout: ['美团 烧腊饭', '饿了么 麻辣烫', '外卖 披萨', '外卖 寿司'],
    party: ['周五团建', '大学室友聚餐', '生日局'],
    bus: ['地铁通勤', '公交', '地铁 往返'],
    taxi: ['滴滴 加班回家', '打车去机场', '雨天打车'],
    fuel: ['充电桩'],
    parking: ['商场停车'],
    train: ['高铁 回老家'],
    daily: ['纸巾洗衣液', '超市采购', '收纳盒', '牙膏牙刷'],
    clothing: ['优衣库 摇粒绒', '跑鞋', '冬季外套'],
    digital: ['降噪耳机', '机械键盘'],
    beauty: ['防晒霜', '洗面奶'],
    rent: ['十一月房租'],
    utility: ['国家电网', '燃气费', '水费'],
    household: ['拖把替换头', '垃圾袋'],
    movie: ['IMAX 场', '话剧《雷雨》', 'Livehouse'],
    fitness: ['健身房月卡', '羽毛球场地'],
    game: ['Switch 卡带'],
    travel: ['民宿定金'],
    medicine: ['感冒药', '维生素 D'],
    doctor: ['牙科复诊'],
    book: ['《置身事内》', '《长安的荔枝》', '技术书一本'],
    course: ['英语网课'],
    stationery: ['手账本'],
    gift: ['妈妈生日红包', '同事婚礼份子'],
    treat: ['请客 烤肉'],
    insurance: ['重疾险 月缴'],
    fee: ['跨行转账'],
    pet_food: ['猫粮 2kg', '冻干零食', '猫罐头 一箱'],
    pet_medical: ['疫苗加强针'],
    pet_supply: ['猫砂 豆腐砂', '逗猫棒'],
    pet_beauty: ['洗澡修毛'],
    express: ['顺丰寄件', '退货运费'],
    misc: ['打印资料']
  };

  var records = [];
  var uid = 0;
  function add(type, date, time, ck, sk, amount, note, person, extra) {
    uid += 1;
    var r = {
      id: 'r' + String(uid).padStart(4, '0'),
      type: type,
      amount: Math.round(amount * 100) / 100,
      categoryKey: ck,
      categoryName: CAT[ck].name,
      subcategoryKey: sk,
      subcategoryName: subName(ck, sk),
      note: note || '',
      date: date,
      time: time,
      person: person || '我',
      photo: !!(extra && extra.photo)
    };
    records.push(r);
    return r;
  }
  function note(sk) { var n = NOTES[sk]; return n ? pick(n) : ''; }
  function who() { return chance(0.24) ? '阿念' : '我'; }
  function hm(h1, h2) {
    var h = h1 + Math.floor(rnd() * (h2 - h1 + 1));
    var m = Math.floor(rnd() * 12) * 5;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function daysIn(y, m) { return new Date(y, m, 0).getDate(); }

  var MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];

  MONTHS.forEach(function (ym) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    var last = ym === TODAY.slice(0, 7) ? +TODAY.slice(8, 10) - 1 : daysIn(y, m);
    for (var d = 1; d <= last; d++) {
      var date = ym + '-' + pad(d);
      var dow = new Date(y, m - 1, d).getDay();
      var weekday = dow > 0 && dow < 6;

      if (d === 1) add('expense', date, '09:00', 'housing', 'rent', 3200, NOTES.rent[0].replace('十一月', m + '月'), '我', null);
      if (d === 3) add('expense', date, '20:15', 'entertainment', 'fitness', 199, '健身房月卡', '我');
      if (d === 8) add('expense', date, '19:30', 'housing', 'utility', between(168, 262), '国家电网', '阿念');
      if (d === 10) add('income', date, '10:00', 'finance', 'invest', 16800, m + '月工资', '我');
      if (d === 12) add('expense', date, '08:00', 'entertainment', 'movie', 25, '视频会员 自动续费', '我');
      if (d === 15) add('expense', date, '09:30', 'finance', 'insurance', 268, '重疾险 月缴', '我');
      if (d === 20 && chance(0.6)) add('income', date, '18:00', 'other', 'misc', between(1200, 3200), '设计外包尾款', '我');
      if (ym === '2026-11' && d === 2) add('income', date, '10:30', 'other', 'misc', 6800, '项目结款 · 十一月', '我');
      if (ym === '2026-11' && d === 4) add('income', date, '21:10', 'finance', 'invest', 96, '基金收益', '我');
      if (d === 28) add('income', date, '07:00', 'finance', 'invest', between(96, 168), '基金收益', '我');

      if (chance(weekday ? 0.62 : 0.35)) add('expense', date, hm(7, 9), 'food', 'breakfast', between(8, 22), note('breakfast'), who());
      if (chance(weekday ? 0.86 : 0.55)) add('expense', date, hm(11, 13), 'food', 'lunch', between(22, 48), note('lunch'), who());
      if (chance(0.42)) add('expense', date, hm(18, 20), 'food', 'dinner', between(32, 96), note('dinner'), who(), { photo: chance(0.25) });
      else if (chance(0.45)) add('expense', date, hm(18, 21), 'food', 'takeout', between(26, 58), note('takeout'), who());
      if (chance(0.4)) add('expense', date, hm(14, 16), 'food', 'snack', between(9, 28), note('snack'), who());
      if (!weekday && chance(0.18)) add('expense', date, hm(18, 20), 'food', 'party', between(180, 460), note('party'), '我', { photo: true });

      if (weekday && chance(0.82)) add('expense', date, hm(8, 9), 'transport', 'bus', between(4, 8), note('bus'), '我');
      if (chance(0.14)) add('expense', date, hm(21, 23), 'transport', 'taxi', between(18, 72), note('taxi'), '我');
      if (chance(0.05)) add('expense', date, hm(10, 16), 'transport', 'parking', between(10, 30), note('parking'), '阿念');

      if (chance(0.22)) add('expense', date, hm(12, 21), 'shopping', 'daily', between(15, 128), note('daily'), who());
      if (chance(0.045)) add('expense', date, hm(20, 22), 'shopping', 'clothing', between(199, 699), note('clothing'), who(), { photo: true });
      if (chance(0.03)) add('expense', date, hm(20, 22), 'shopping', 'beauty', between(89, 329), note('beauty'), '阿念');
      if (chance(0.012)) add('expense', date, hm(20, 22), 'shopping', 'digital', between(899, 2499), note('digital'), '我', { photo: true });

      if (chance(0.06)) add('expense', date, hm(19, 21), 'entertainment', 'movie', between(45, 168), note('movie'), who());
      if (chance(0.03)) add('expense', date, hm(10, 18), 'medical', 'medicine', between(26, 98), note('medicine'), who());
      if (chance(0.09)) add('expense', date, hm(20, 23), 'education', 'book', between(29, 89), note('book'), '我');
      if (chance(0.025)) add('expense', date, hm(18, 21), 'social', 'gift', pick([200, 500, 666, 800]), note('gift'), '我');
      if (chance(0.12)) add('expense', date, hm(19, 22), 'pet', pick(['pet_food', 'pet_supply']), between(39, 169), '', '阿念');
      if (chance(0.05)) add('expense', date, hm(10, 18), 'other', 'express', between(10, 23), note('express'), who());
    }
  });

  // 今天（11-05）的几笔固定账，保证首页「今天」区块有内容
  add('expense', TODAY, '08:20', 'food', 'breakfast', 14, '肠粉加蛋', '我');
  add('expense', TODAY, '08:45', 'transport', 'bus', 6, '地铁通勤', '我');
  add('expense', TODAY, '12:10', 'food', 'lunch', 32, '和同事拼饭', '我');
  add('expense', TODAY, '15:30', 'food', 'snack', 18, '瑞幸 生椰拿铁', '阿念');
  add('expense', TODAY, '19:50', 'pet', 'pet_food', 129, '猫罐头 一箱', '阿念', { photo: true });

  // 补上 pet 的 note
  records.forEach(function (r) { if (!r.note && NOTES[r.subcategoryKey]) r.note = pick(NOTES[r.subcategoryKey]); });

  records.sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });

  // ---------- 聚合 ----------
  function cents(n) { return Math.round(n * 100); }
  function inMonth(ym, type) {
    return records.filter(function (r) { return r.date.slice(0, 7) === ym && (!type || r.type === type); });
  }
  function totals(ym) {
    var e = 0, i = 0;
    inMonth(ym).forEach(function (r) { if (r.type === 'expense') e += cents(r.amount); else i += cents(r.amount); });
    return { expense: e / 100, income: i / 100, balance: (i - e) / 100, count: inMonth(ym).length };
  }
  function byCategory(ym, level, type) {
    var map = {};
    inMonth(ym, type || 'expense').forEach(function (r) {
      var k = level === 'sub' ? r.subcategoryKey : r.categoryKey;
      if (!map[k]) map[k] = { key: k, categoryKey: r.categoryKey, name: level === 'sub' ? r.subcategoryName : r.categoryName, total: 0, count: 0 };
      map[k].total += cents(r.amount); map[k].count += 1;
    });
    var list = Object.keys(map).map(function (k) { var o = map[k]; o.total = o.total / 100; return o; });
    var sum = list.reduce(function (s, o) { return s + o.total; }, 0) || 1;
    list.forEach(function (o) { o.share = o.total / sum; });
    return list.sort(function (a, b) { return b.total - a.total; });
  }
  function daily(ym, type) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7), n = daysIn(y, m), out = [];
    for (var d = 1; d <= n; d++) out.push({ date: ym + '-' + pad(d), day: d, total: 0, future: (ym + '-' + pad(d)) > TODAY });
    inMonth(ym, type || 'expense').forEach(function (r) { out[+r.date.slice(8, 10) - 1].total += r.amount; });
    out.forEach(function (o) { o.total = Math.round(o.total * 100) / 100; });
    return out;
  }
  function monthly(type) {
    return MONTHS.map(function (ym) { var t = totals(ym); return { month: ym, label: (+ym.slice(5, 7)) + '月', expense: t.expense, income: t.income }; });
  }

  var BUDGET = 8000;
  function budgetInfo(ym) {
    ym = ym || TODAY.slice(0, 7);
    var spent = totals(ym).expense;
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7), n = daysIn(y, m);
    var daysLeft = n - (+TODAY.slice(8, 10)) + 1;
    var remain = Math.round((BUDGET - spent) * 100) / 100;
    return { budget: BUDGET, spent: spent, remain: remain, ratio: spent / BUDGET, daysLeft: daysLeft, perDay: Math.max(0, Math.floor(remain / daysLeft * 100) / 100) };
  }

  function report(ym) {
    var t = totals(ym), cats = byCategory(ym), prevYm = MONTHS[MONTHS.indexOf(ym) - 1];
    var lines = [];
    if (!cats.length) return ['这个月还没有记账。'];
    lines.push('本月花了 ¥' + fmt(t.expense) + '，其中「' + cats[0].name + '」占 ' + Math.round(cats[0].share * 100) + '%。');
    if (prevYm) {
      var pt = totals(prevYm);
      var diff = t.expense - pt.expense;
      lines.push('比上月' + (diff >= 0 ? '多花' : '少花') + ' ¥' + fmt(Math.abs(diff)) + '。');
    }
    var biggest = inMonth(ym, 'expense').slice().sort(function (a, b) { return b.amount - a.amount; })[0];
    if (biggest) lines.push('最大的一笔是「' + (biggest.note || biggest.subcategoryName) + '」¥' + fmt(biggest.amount) + '。');
    return lines;
  }

  // ---------- 周期账单 & 待办 ----------
  var RECURRING = [
    { id: 'p1', name: '房租', amount: 3200, categoryKey: 'housing', subcategoryKey: 'rent', cycle: '每月 1 日', next: '2026-12-01', enabled: true },
    { id: 'p2', name: '视频会员', amount: 25, categoryKey: 'entertainment', subcategoryKey: 'movie', cycle: '每月 12 日', next: '2026-11-12', enabled: true },
    { id: 'p3', name: '重疾险', amount: 268, categoryKey: 'finance', subcategoryKey: 'insurance', cycle: '每月 15 日', next: '2026-11-15', enabled: true },
    { id: 'p4', name: '健身房', amount: 199, categoryKey: 'entertainment', subcategoryKey: 'fitness', cycle: '每月 3 日', next: '2026-12-03', enabled: true },
    { id: 'p5', name: '云盘年费', amount: 98, categoryKey: 'other', subcategoryKey: 'misc', cycle: '每年 3 月 9 日', next: '2027-03-09', enabled: false }
  ];
  var TODOS = [
    { id: 't1', title: '还信用卡', due: '2026-11-06', time: '10:00', amount: 2386.4, categoryKey: 'finance', repeat: '每月', done: false },
    { id: 't2', title: '给猫约疫苗', due: '2026-11-09', time: '', amount: 0, categoryKey: 'pet', repeat: '一次', done: false },
    { id: 't3', title: '交物业费', due: '2026-11-05', time: '18:00', amount: 312, categoryKey: 'housing', repeat: '每季度', done: false },
    { id: 't4', title: '续费域名', due: '2026-11-02', time: '', amount: 69, categoryKey: 'other', repeat: '每年', done: true }
  ];

  // ---------- 格式化 ----------
  function fmt(n, opts) {
    opts = opts || {};
    var neg = n < 0; n = Math.abs(n);
    var fixed = (Math.round(n * 100) / 100).toFixed(opts.decimals === 0 ? 0 : 2);
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var s = parts.join('.');
    if (opts.trim && s.slice(-3) === '.00') s = s.slice(0, -3);
    return (neg ? '-' : '') + s;
  }
  function splitMoney(n) {
    var s = fmt(Math.abs(n));
    return { int: s.split('.')[0], dec: s.split('.')[1], neg: n < 0 };
  }
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  function dateLabel(date) {
    if (date === TODAY) return '今天';
    var t = new Date(TODAY), d = new Date(date);
    var diff = Math.round((t - d) / 86400000);
    if (diff === 1) return '昨天';
    return (+date.slice(5, 7)) + '月' + (+date.slice(8, 10)) + '日';
  }
  function weekday(date) { var p = date.split('-'); return WEEK[new Date(+p[0], +p[1] - 1, +p[2]).getDay()]; }

  window.JX = {
    TODAY: TODAY, NOW_TIME: NOW_TIME, MONTHS: MONTHS,
    categories: CATEGORIES, cat: CAT,
    records: records,
    recurring: RECURRING, todos: TODOS,
    inMonth: inMonth, totals: totals, byCategory: byCategory, daily: daily, monthly: monthly,
    budget: budgetInfo, report: report,
    fmt: fmt, splitMoney: splitMoney, dateLabel: dateLabel, weekday: weekday, subName: subName,
    persons: ['我', '阿念']
  };
})();
