const CONFIG = Object.freeze({
  notionVersion: '2026-03-11',
  dailyDataSourceId: '292b6d9e-ed1d-80ab-9d8d-000b936c2fce',
  tasksDataSourceId: '37cb6d9e-ed1d-801a-8afe-000b9027f387',
  timeZone: 'Asia/Tokyo',
  maxTasks: 50,
});

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Today')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getDashboard() {
  return guard_(function () {
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
  });
}

function saveDaily(input) {
  return guard_(function () {
    input = input || {};
    const date = validDate_(input.date || today_());
    const properties = dailyProperties_(input, date);
    const found = query_(CONFIG.dailyDataSourceId, {
      filter: { property: '日付', date: { equals: date } },
      page_size: 1,
    }).results[0];

    const page = found
      ? notion_('patch', '/v1/pages/' + found.id, { properties: properties })
      : notion_('post', '/v1/pages', {
          parent: { type: 'data_source_id', data_source_id: CONFIG.dailyDataSourceId },
          properties: Object.assign({
            Day: { title: [{ text: { content: date.replace(/-/g, '/') } }] },
          }, properties),
        });
    return { ok: true, daily: mapDaily_(page) };
  });
}

function addTask(input) {
  return guard_(function () {
    input = input || {};
    const name = String(input.name || '').trim();
    if (!name || name.length > 200) throw new Error('タスク名は1〜200文字で入力してください。');
    const date = validDate_(input.date || today_());
    const priority = ['高', '中', '低'].indexOf(input.priority) >= 0 ? input.priority : '中';
    const page = notion_('post', '/v1/pages', {
      parent: { type: 'data_source_id', data_source_id: CONFIG.tasksDataSourceId },
      properties: {
        '名前': { title: [{ text: { content: name } }] },
        '日付': { date: { start: date } },
        '状況': { status: { name: '未着手' } },
        '優先度': { select: { name: priority } },
      },
    });
    return { ok: true, task: mapTask_(page) };
  });
}

function setTaskCompleted(pageId, completed) {
  return guard_(function () {
    pageId = validPageId_(pageId);
    const page = notion_('patch', '/v1/pages/' + pageId, {
      properties: { '状況': { status: { name: completed ? '完了' : '未着手' } } },
    });
    return { ok: true, task: mapTask_(page) };
  });
}

function notion_(method, path, body) {
  const token = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  if (!token) throw new Error('NOTION_TOKEN が設定されていません。');
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
  const data = JSON.parse(response.getContentText() || '{}');
  if (code < 200 || code >= 300) {
    console.error(JSON.stringify({ code: code, path: path, notionCode: data.code }));
    throw new Error('Notion APIエラー (' + code + '): ' + (data.message || data.code || 'unknown'));
  }
  return data;
}

function query_(dataSourceId, payload) {
  return notion_('post', '/v1/data_sources/' + dataSourceId + '/query', payload);
}

function dailyProperties_(input, date) {
  const properties = { '日付': { date: { start: date } } };
  const numbers = {
    weight: '体重(kg)', bodyFat: '体脂肪率', systolic: '血圧-上',
    diastolic: '血圧-下', steps: '歩数',
  };
  Object.keys(numbers).forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const value = input[key] === '' || input[key] == null ? null : Number(input[key]);
      if (value !== null && !isFinite(value)) throw new Error(numbers[key] + 'は数値で入力してください。');
      properties[numbers[key]] = { number: value };
    }
  });
  if (Object.prototype.hasOwnProperty.call(input, 'weather')) {
    const weather = String(input.weather || '');
    if (['', '☀', '☁', '☔'].indexOf(weather) < 0) throw new Error('天気の値が不正です。');
    properties['天気'] = { select: weather ? { name: weather } : null };
  }
  return properties;
}

function mapDaily_(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    url: page.url,
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
    url: page.url,
    name: titleValue_(p['名前']),
    date: dateValue_(p['日付']),
    status: statusValue_(p['状況']),
    priority: selectValue_(p['優先度']),
  };
}

function numberValue_(property) { return property && property.number != null ? property.number : null; }
function selectValue_(property) { return property && property.select ? property.select.name : ''; }
function statusValue_(property) { return property && property.status ? property.status.name : ''; }
function dateValue_(property) { return property && property.date ? property.date.start : ''; }
function titleValue_(property) {
  return property && property.title ? property.title.map(function (v) { return v.plain_text || ''; }).join('') : '';
}

function today_() { return Utilities.formatDate(new Date(), CONFIG.timeZone, 'yyyy-MM-dd'); }
function validDate_(value) {
  value = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日付の形式が不正です。');
  return value;
}
function validPageId_(value) {
  value = String(value || '').replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(value)) throw new Error('ページIDが不正です。');
  return value;
}
function guard_(fn) {
  try { return fn(); }
  catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    return { ok: false, error: error && error.message ? error.message : '処理に失敗しました。' };
  }
}
