/**
 * Personal Portal - Google Apps Script Backend
 * Notes / Journal / Tasks / Daily のCRUD API
 */

const SPREADSHEET_ID = '1YCEnMZmrE-TBbiDAVpSNg9zMNVSE02t9VctvT95Pp2E';
const SHEET_NAMES = {
  notes: 'Notes',
  journal: 'Journal',
  tasks: 'Tasks',
  daily: 'Daily'
};
const NOTE_HEADERS = ['id', 'title', 'content', 'read', 'created'];
const TASK_HEADERS = ['id', 'title', 'priority', 'due', 'status', 'note', 'created', 'completedDate'];
const JOURNAL_HEADERS = ['id', 'date', 'content', 'created'];
const DAILY_HEADERS = ['date', 'time', 'type', 'content', 'checked'];

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    let headers;
    switch(name) {
      case SHEET_NAMES.notes: headers = NOTE_HEADERS; break;
      case SHEET_NAMES.tasks: headers = TASK_HEADERS; break;
      case SHEET_NAMES.journal: headers = JOURNAL_HEADERS; break;
      case SHEET_NAMES.daily: headers = DAILY_HEADERS; break;
    }
    if (headers) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  }
  return sheet;
}

// --- GET ---
function doGet(e) {
  const callback = e.parameter.callback;
  const type = e.parameter.type || 'notes';

  let result;
  if (type === 'test') {
    result = { success: true, message: 'Connected' };
  } else if (type === 'notes') {
    result = getNotes();
  } else if (type === 'tasks') {
    result = getTasks();
  } else if (type === 'all') {
    result = {
      success: true,
      notes: getNotes().notes || [],
      tasks: getTasks().tasks || [],
    };
  } else {
    result = { success: false, message: 'Unknown type: ' + type };
  }

  const jsonStr = JSON.stringify(result);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + jsonStr + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(jsonStr)
    .setMimeType(ContentService.MimeType.JSON);
}

function getNotes() {
  try {
    const sheet = getSheet(SHEET_NAMES.notes);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, notes: [], count: 0 };
    const headers = data[0];
    const notes = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let val = row[i];
        if (h === 'id') val = Number(val);
        if (h === 'read') val = val === true || val === 'TRUE' || val === 'true';
        obj[h] = val;
      });
      return obj;
    });
    return { success: true, notes: notes, count: notes.length };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

function getTasks() {
  try {
    const sheet = getSheet(SHEET_NAMES.tasks);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, tasks: [], count: 0 };
    const headers = data[0];
    const tasks = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      obj.id = Number(obj.id);
      return obj;
    });
    return { success: true, tasks: tasks, count: tasks.length };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

// --- POST ---
function doPost(e) {
  try {
    const raw = e.parameter.data || e.postData.contents;
    const payload = JSON.parse(raw);
    const type = payload.type || 'notes';

    if (type === 'notes') {
      return saveNotes(payload.items || []);
    } else if (type === 'tasks') {
      return saveTasks(payload.items || []);
    }
    return makeResponse({ success: false, message: 'Unknown type' });
  } catch(e) {
    return makeResponse({ success: false, message: e.message });
  }
}

function saveNotes(items) {
  const sheet = getSheet(SHEET_NAMES.notes);
  // Clear and rewrite
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, NOTE_HEADERS.length).clearContent();
  }
  if (items.length > 0) {
    const rows = items.map(item => NOTE_HEADERS.map(h => {
      let val = item[h] || '';
      if (h === 'read') val = item[h] === true ? 'TRUE' : 'FALSE';
      if (h === 'content') val = (item[h] || '').substring(0, 50000); // Sheets cell limit
      return val;
    }));
    sheet.getRange(2, 1, rows.length, NOTE_HEADERS.length).setValues(rows);
  }
  return makeResponse({ success: true, type: 'notes', count: items.length });
}

function saveTasks(items) {
  const sheet = getSheet(SHEET_NAMES.tasks);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, TASK_HEADERS.length).clearContent();
  }
  if (items.length > 0) {
    const rows = items.map(item => TASK_HEADERS.map(h => item[h] || ''));
    sheet.getRange(2, 1, rows.length, TASK_HEADERS.length).setValues(rows);
  }
  return makeResponse({ success: true, type: 'tasks', count: items.length });
}

function makeResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- Note API (for n8n / external calls) ---
function addNoteExternal(title, content) {
  const sheet = getSheet(SHEET_NAMES.notes);
  const id = Date.now();
  const created = new Date().toISOString();
  sheet.appendRow([id, title, content, 'FALSE', created]);
  return { success: true, id: id };
}

// --- Daily Schedule API (for n8n 0:01 cron) ---
function writeDailySchedule(date, entries) {
  const sheet = getSheet(SHEET_NAMES.daily);
  entries.forEach(entry => {
    sheet.appendRow([date, entry.time, entry.type || 'plan', entry.content, 'FALSE']);
  });
  return { success: true, date: date, count: entries.length };
}
