const CONFIG = Object.freeze({
  notionVersion: '2026-03-11',
  dailyDataSourceId: '292b6d9e-ed1d-80ab-9d8d-000b936c2fce',
  tasksDataSourceId: '37cb6d9e-ed1d-801a-8afe-000b9027f387',
  timeZone: 'Asia/Tokyo',
  maxTasks: 50,
  maxRequestBytes: 12000,
});

/**
 * Public health check only. Notion data is never returned from GET requests.
 */
function doGet() {
  return json_({ ok: true, service: 'notion-home-widget', authenticated: false });
}

/**
 * Authenticated JSON API for the GitHub Pages widget.
 * The client deliberately sends text/plain so browsers do not need a CORS preflight.
 */
function doPost(e) {
  return json_(guard_(function () {
    const request = parseRequest_(e);
    authenticate_(request.token);
    const action = String(request.action || '');
    const payload = request.payload && typeof request.payload === 'object' ? request.payload : {};
    rateLimit_(action);

    switch (action) {
      case 'dashboard': return getDashboard_();
      case 'saveDaily': return withWriteLock_(function () { return saveDaily_(payload); });
      case 'addTask': return withWriteLock_(function () { return addTask_(payload); });
      case 'completeTask': return withWriteLock_(function () { return completeTask_(payload); });
      default: throw clientError_('BAD_ACTION', '許可されていない操作です。');
    }
  }));
}

function getDashboard_() {
  const today = today_();
  const daily = query_(CONFIG.dailyDataSourceId, {
    filter: { property: '日付', date: { equals: today } },
    page_size: 1,
  }).results[0] || null;

  const tasks = query_(CONFIG.tasksDataSourceId, {
    filter: {
      and: [
        { property: '日付', date: { equals: today } },
        { property: '状況', status: { does_not_equal: '完了' } },
      ],
    },
    sorts: [
      { property: '優先度', direction: 'ascending' },
      { property: '日付', direction: 'ascending' },
    ],
    page_size: CONFIG.maxTasks,
  }).results;

  return {
    ok: true,
    date: today,
    daily: daily ? mapDaily_(daily) : null,
    tasks: tasks.map(mapTask_),
    updatedAt: new Date().toISOString(),
  };
}

function saveDaily_(input) {
  const date = today_();
  const properties = dailyProperties_(input || {}, date);
  const found = query_(CONFIG.dailyDataSourceId, {
    filter: { property: '日付', date: { equals: date } },
    page_size: 1,
  }).results[0];

  const page = found
    ? notion_('patch', '/v1/pages/' + normalizePageId_(found.id), { properties: properties })
    : notion_('post', '/v1/pages', {
        parent: { type: 'data_source_id', data_source_id: CONFIG.dailyDataSourceId },
        properties: Object.assign({
          Day: { title: [{ text: { content: date.replace(/-/g, '/') } }] },
        }, properties),
      });
  return { ok: true, daily: mapDaily_(page) };
}

function addTask_(input) {
  input = input || {};
  const name = String(input.name || '').trim();
  if (!name || name.length > 200) {
    throw clientError_('INVALID_INPUT', 'タスク名は1〜200文字で入力してください。');
  }
  const priority = ['高', '中', '低'].indexOf(input.priority) >= 0 ? input.priority : '中';
  const page = notion_('post', '/v1/pages', {
    parent: { type: 'data_source_id', data_source_id: CONFIG.tasksDataSourceId },
    properties: {
      '名前': { title: [{ text: { content: name } }] },
      '日付': { date: { start: today_() } },
      '状況': { status: { name: '未着手' } },
      '優先度': { select: { name: priority } },
    },
  });
  return { ok: true, task: mapTask_(page) };
}

function completeTask_(input) {
  const pageId = validPageId_(input && input.pageId);
  const normalized = normalizePageId_(pageId);
  const allowed = query_(CONFIG.tasksDataSourceId, {
    filter: {
      and: [
        { property: '日付', date: { equals: today_() } },
        { property: '状況', status: { does_not_equal: '完了' } },
      ],
    },
    page_size: CONFIG.maxTasks,
  }).results.some(function (page) {
    return normalizePageId_(page.id) === normalized;
  });
  if (!allowed) {
    throw clientError_('NOT_ALLOWED', 'このタスクは今日の未完了タスクではありません。');
  }

  const page = notion_('patch', '/v1/pages/' + normalized, {
    properties: { '状況': { status: { name: '完了' } } },
  });
  return { ok: true, task: mapTask_(page) };
}

function notion_(method, path, body) {
  const token = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  if (!token) throw clientError_('SERVER_CONFIG', 'Notion連携が設定されていません。');
  const options = {
    method: method,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      'Notion-Version': CONFIG.notionVersion,
    },
    muteHttpExceptions: true,
  };
  if (body) options.payload = JSON.stringify(body);
  const response = UrlFetchApp.fetch('https://api.notion.com' + path, options);
  const code = response.getResponseCode();
  let data = {};
  try { data = JSON.parse(response.getContentText() || '{}'); } catch (_) {}
  if (code < 200 || code >= 300) {
    console.error(JSON.stringify({ code: code, path: path, notionCode: data.code || '' }));
    throw clientError_('NOTION_ERROR', 'Notionとの同期に失敗しました (' + code + ')。');
  }
  return data;
}

function query_(dataSourceId, payload) {
  return notion_('post', '/v1/data_sources/' + dataSourceId + '/query', payload);
}

function dailyProperties_(input, date) {
  const properties = { '日付': { date: { start: date } } };
  const rules = {
    weight: { property: '体重(kg)', min: 20, max: 400, integer: false },
    bodyFat: { property: '体脂肪率', min: 0, max: 100, integer: false },
    systolic: { property: '血圧-上', min: 50, max: 300, integer: true },
    diastolic: { property: '血圧-下', min: 30, max: 200, integer: true },
    steps: { property: '歩数', min: 0, max: 500000, integer: true },
  };
  Object.keys(rules).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) return;
    const rule = rules[key];
    properties[rule.property] = {
      number: validatedNumber_(input[key], rule.property, rule.min, rule.max, rule.integer),
    };
  });
  if (Object.prototype.hasOwnProperty.call(input, 'weather')) {
    const weather = String(input.weather || '');
    if (['', '☀', '☁', '☔'].indexOf(weather) < 0) {
      throw clientError_('INVALID_INPUT', '天気の値が不正です。');
    }
    properties['天気'] = { select: weather ? { name: weather } : null };
  }
  return properties;
}

function validatedNumber_(raw, label, min, max, integer) {
  if (raw === '' || raw == null) return null;
  const value = Number(raw);
  if (!isFinite(value) || value < min || value > max || (integer && Math.floor(value) !== value)) {
    throw clientError_('INVALID_INPUT', label + 'の値を確認してください。');
  }
  return value;
}

function mapDaily_(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    url: safeNotionUrl_(page.url),
    date: dateValue_(p['日付']),
    weather: selectValue_(p['天気']),
    weight: numberValue_(p['体重(kg)']),
    bodyFat: numberValue_(p['体脂肪率']),
    systolic: numberValue_(p['血圧-上']),
    diastolic: numberValue_(p['血圧-下']),
    steps: numberValue_(p['歩数']),
  };
}

function mapTask_(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    url: safeNotionUrl_(page.url),
    name: titleValue_(p['名前']),
    date: dateValue_(p['日付']),
    status: statusValue_(p['状況']),
    priority: selectValue_(p['優先度']),
  };
}

function parseRequest_(e) {
  const text = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!text || text.length > CONFIG.maxRequestBytes) {
    throw clientError_('BAD_REQUEST', 'リクエストが不正です。');
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('bad');
    return value;
  } catch (_) {
    throw clientError_('BAD_REQUEST', 'JSONを読み取れませんでした。');
  }
}

function authenticate_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty('WIDGET_KEY');
  if (!expected || expected.length < 32) {
    throw clientError_('SERVER_CONFIG', 'ウィジェット認証が設定されていません。');
  }
  if (!constantTimeEquals_(String(provided || ''), expected)) {
    throw clientError_('UNAUTHORIZED', 'アクセスキーが違います。');
  }
}

function constantTimeEquals_(a, b) {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ (b.charCodeAt(i % (b.length || 1)) || 0);
  }
  return diff === 0;
}

function rateLimit_(action) {
  const limits = { dashboard: 60, saveDaily: 20, addTask: 20, completeTask: 30 };
  if (!limits[action]) return;
  const bucket = Utilities.formatDate(new Date(), CONFIG.timeZone, 'yyyyMMddHHmm');
  const key = 'rl:' + action + ':' + bucket;
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 70);
  if (count > limits[action]) throw clientError_('RATE_LIMIT', '操作が多すぎます。1分ほど待ってください。');
}

function withWriteLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw clientError_('BUSY', '別の更新処理中です。少し待って再試行してください。');
  try { return fn(); } finally { lock.releaseLock(); }
}

function safeNotionUrl_(value) {
  value = String(value || '');
  return /^https:\/\/(?:www\.)?notion\.so\//i.test(value) ? value : '';
}

function numberValue_(property) { return property && property.number != null ? property.number : null; }
function selectValue_(property) { return property && property.select ? property.select.name : ''; }
function statusValue_(property) { return property && property.status ? property.status.name : ''; }
function dateValue_(property) { return property && property.date ? property.date.start : ''; }
function titleValue_(property) {
  return property && property.title
    ? property.title.map(function (value) { return value.plain_text || ''; }).join('')
    : '';
}

function today_() { return Utilities.formatDate(new Date(), CONFIG.timeZone, 'yyyy-MM-dd'); }
function normalizePageId_(value) { return String(value || '').replace(/-/g, '').toLowerCase(); }
function validPageId_(value) {
  const normalized = normalizePageId_(value);
  if (!/^[0-9a-f]{32}$/.test(normalized)) throw clientError_('INVALID_INPUT', 'ページIDが不正です。');
  return normalized;
}

function clientError_(code, message) {
  const error = new Error(message);
  error.clientCode = code;
  return error;
}

function guard_(fn) {
  try { return fn(); }
  catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    return {
      ok: false,
      code: error && error.clientCode ? error.clientCode : 'INTERNAL',
      error: error && error.message ? error.message : '処理に失敗しました。',
    };
  }
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
