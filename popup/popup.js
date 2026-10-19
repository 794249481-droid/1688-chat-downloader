'use strict';

document.addEventListener('DOMContentLoaded', function () {
  var selected = new Set();
  var list = document.getElementById('employeeList');
  var selectedCount = document.getElementById('selectedCount');
  var status = document.getElementById('taskStatus');
  var summary = document.getElementById('taskSummary');
  var fill = document.getElementById('progressFill');
  var log = document.getElementById('log');
  var activeTabId = null;

  setDates(today(-1), today(-1));

  function today(offset) { var d = new Date(); d.setDate(d.getDate() + (offset || 0)); return d.toISOString().slice(0, 10); }
  function setDates(start, end) { document.getElementById('dateStart').value = start; document.getElementById('dateEnd').value = end; }
  function setStatus(text, cls) { status.textContent = text; status.className = 'status-pill ' + (cls || 'idle'); }
  function writeLog(text) { var line = document.createElement('div'); line.textContent = text; log.appendChild(line); log.scrollTop = log.scrollHeight; }
  function updateCount() { selectedCount.textContent = '已选择 ' + selected.size + ' 个员工'; }
  function renderEmployees(names) {
    list.innerHTML = '';
    names.forEach(function (name) {
      var label = document.createElement('label'); label.className = 'employee-item';
      var input = document.createElement('input'); input.type = 'checkbox'; input.value = name; input.checked = selected.has(name);
      input.addEventListener('change', function () { input.checked ? selected.add(name) : selected.delete(name); updateCount(); });
      label.appendChild(input); var text = document.createElement('span'); text.textContent = name; label.appendChild(text); list.appendChild(label);
    });
    if (!names.length) list.innerHTML = '<div class="empty">未读取到员工，请确认已登录并打开查询页</div>';
    updateCount();
  }
  function getTab(cb) { chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) { var tab = tabs[0]; if (!tab || !/1688\.com/.test(tab.url || '')) { cb(null); return; } activeTabId = tab.id; cb(tab); }); }
  function send(message, cb) {
    getTab(function (tab) {
      if (!tab) { document.getElementById('connectionText').textContent = '请切换到1688聊天记录查询页'; cb({ success: false, error: '请打开1688聊天记录查询页' }); return; }
      function deliver() { chrome.tabs.sendMessage(tab.id, message, function (response) { if (chrome.runtime.lastError) cb({ success: false, error: '当前页面未加载1688插件脚本，请刷新1688页面后重试' }); else cb(response || { success: false }); }); }
      chrome.tabs.sendMessage(tab.id, message, function (response) {
        if (!chrome.runtime.lastError) { cb(response || { success: false }); return; }
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/selectors.js', 'content/content.js'] }, function () {
          if (chrome.runtime.lastError) { cb({ success: false, error: '无法注入页面脚本，请确认当前是1688聊天记录查询页' }); return; }
          chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content/inject.css'] }, function () { deliver(); });
        });
      });
    });
  }

  document.getElementById('openPageBtn').onclick = function () { chrome.tabs.create({ url: 'https://air.1688.com/app/1688-pc-front/pc-message-manage/index.html#/diversionManage' }); };
  document.getElementById('refreshEmployeesBtn').onclick = function () { setStatus('读取中', 'running'); summary.textContent = '正在读取员工列表...'; send({ action: 'getEmployeeList' }, function (r) { if (r && r.success) { renderEmployees(r.names || []); setStatus('已就绪', 'done'); summary.textContent = '员工列表已刷新，共 ' + (r.names || []).length + ' 个员工'; } else { setStatus('读取失败', 'error'); summary.textContent = r.error || '读取失败'; } }); };
  document.getElementById('selectAllBtn').onclick = function () { Array.from(list.querySelectorAll('input')).forEach(function (i) { i.checked = true; selected.add(i.value); }); updateCount(); };
  document.getElementById('clearEmployeesBtn').onclick = function () { selected.clear(); Array.from(list.querySelectorAll('input')).forEach(function (i) { i.checked = false; }); updateCount(); };
  document.getElementById('customModeBtn').onclick = function () { this.classList.add('active'); document.getElementById('quickModeBtn').classList.remove('active'); };
  document.getElementById('quickModeBtn').onclick = function () { this.classList.add('active'); document.getElementById('customModeBtn').classList.remove('active'); };
  document.querySelectorAll('[data-range]').forEach(function (btn) { btn.onclick = function () { var key = this.dataset.range, end = today(-1), start = end; if (key === 'yesterday') start = end; else if (/^\d+$/.test(key)) { var d = new Date(end); d.setDate(d.getDate() - Number(key) + 1); start = d.toISOString().slice(0, 10); } else { var now = new Date(); if (key === 'thisMonth') { start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10); end = today(); } else { start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10); end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10); } } setDates(start, end); document.getElementById('quickModeBtn').click(); }; });
  function start(format) { var employees = Array.from(selected), startDate = document.getElementById('dateStart').value, endDate = document.getElementById('dateEnd').value; if (!employees.length) { setStatus('请先选择员工', 'error'); return; } if (!startDate || !endDate || startDate > endDate) { setStatus('日期无效', 'error'); return; } setStatus('执行中', 'running'); fill.style.width = '0%'; summary.textContent = '任务已发送，正在导出...'; writeLog('开始导出 ' + employees.length + ' 个员工'); send({ action: 'startBatchExport', task: { employees: employees, dateStart: startDate, dateEnd: endDate, format: format, shopName: document.getElementById('shopName').value.trim() } }, function (r) { if (!r || !r.success) { setStatus('启动失败', 'error'); summary.textContent = r && r.error || '启动失败'; } }); }
  document.getElementById('exportJsonBtn').onclick = function () { start('json'); };
  document.getElementById('exportExcelBtn').onclick = function () { start('excel'); };
  document.getElementById('clearLogBtn').onclick = function () { log.innerHTML = ''; };
  document.getElementById('copyLogBtn').onclick = function () { navigator.clipboard.writeText(log.innerText || '暂无日志'); };
  chrome.runtime.onMessage.addListener(function (message) { if (message.action !== 'exportProgress') return; var pct = message.total ? Math.round(message.current / message.total * 100) : 0; fill.style.width = pct + '%'; summary.textContent = message.text || (message.current + '/' + message.total); if (message.log) writeLog(message.log); if (message.done) { setStatus(message.error ? '部分完成' : '已完成', message.error ? 'error' : 'done'); fill.style.width = '100%'; } });

  chrome.storage.local.get(['scheduleConfig'], function (d) { var c = d.scheduleConfig; if (c) { document.getElementById('scheduleEnabled').checked = !!c.enabled; document.getElementById('scheduleTime').value = c.time || '09:00'; document.getElementById('scheduleEmployees').value = (c.employees || []).join(', '); document.getElementById('scheduleDays').value = c.days || '1'; } });
  document.getElementById('saveScheduleBtn').onclick = function () { var employees = document.getElementById('scheduleEmployees').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean); var cfg = { enabled: document.getElementById('scheduleEnabled').checked, time: document.getElementById('scheduleTime').value || '09:00', employees: employees, days: Number(document.getElementById('scheduleDays').value) || 1 }; chrome.runtime.sendMessage({ action: 'saveScheduleConfig', config: cfg }, function (r) { document.getElementById('scheduleStatus').textContent = r && r.success ? '设置已保存' : '保存失败'; }); };
});
