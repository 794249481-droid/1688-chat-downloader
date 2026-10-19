(function () {
  'use strict';

  // ── State ──
  const STATE = {
    running: false,
    customers: [],
    results: [],
    currentIndex: 0,
    totalCustomers: 0,
    employeeName: '',
    employeeId: '',
    employeeNames: [],
    dateStart: '',
    dateEnd: '',
    // API interception
    capturedResponses: [],
    interceptEnabled: false
  };

  // ── API interception ──
  function setupAPIInterception() {
    if (window.__ce_intercept_installed) return;
    window.__ce_intercept_installed = true;

    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const res = await origFetch.apply(this, args);
      if (STATE.interceptEnabled) {
        try {
          const clone = res.clone();
          const text = await clone.text();
          try {
            const json = JSON.parse(text);
            STATE.capturedResponses.push({
              url: typeof args[0] === 'string' ? args[0] : args[0].url,
              data: json,
              time: Date.now()
            });
          } catch (_) {}
        } catch (_) {}
      }
      return res;
    };

    const origXHROpen = XMLHttpRequest.prototype.open;
    const origXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this._ce_url = url;
      return origXHROpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (STATE.interceptEnabled) {
        this.addEventListener('load', function () {
          try {
            const json = JSON.parse(this.responseText);
            STATE.capturedResponses.push({
              url: this._ce_url,
              data: json,
              time: Date.now()
            });
          } catch (_) {}
        });
      }
      return origXHRSend.apply(this, arguments);
    };
  }

  // ── UI injection ──
  function injectUI() {
    if (document.getElementById('ce_1688_app')) return;
    const app = document.createElement('div');
    app.id = 'ce_1688_app';
    const frame = document.createElement('iframe');
    frame.id = 'ce_1688_frame';
    frame.title = '1688聊天记录导出';
    frame.src = chrome.runtime.getURL('popup/popup.html') + '?embedded=1';
    frame.setAttribute('allowtransparency', 'true');
    app.appendChild(frame);
    document.body.appendChild(app);
  }

  function togglePanel() {
    const body = document.getElementById('ce_body');
    const btn = document.getElementById('ce_toggle_btn');
    if (body.classList.contains('ce-hidden')) {
      body.classList.remove('ce-hidden');
      btn.textContent = '_';
    } else {
      body.classList.add('ce-hidden');
      btn.textContent = '+';
    }
  }

  // ── Form reading ──
  function findEmployeeField() {
    return document.querySelector('#userId, input[id*="userId"], input[name="userId"], input[placeholder*="员工账号"], input[placeholder*="员工帐号"]');
  }

  function getEmployeeName() {
    const sel = findEmployeeField();
    if (!sel) return '';
    const selectEl = sel.closest('.ant-select');
    if (!selectEl) return '';
    const item = selectEl.querySelector('.ant-select-selection-item');
    if (item) return item.textContent.trim() || item.getAttribute('title') || '';
    const placeholder = selectEl.querySelector('.ant-select-selection-placeholder');
    if (placeholder) return '';
    return selectEl.textContent.trim().split(/\s+/)[0] || '';
  }

  function getEmployeeId() {
    const sel = findEmployeeField();
    if (!sel) return '';
    const selectEl = sel.closest('.ant-select');
    if (!selectEl) return '';
    const item = selectEl.querySelector('.ant-select-selection-item');
    if (item) return item.getAttribute('title') || item.textContent.trim();
    return getEmployeeName();
  }

  function getDateStart() {
    const el = document.querySelector('input[placeholder*="开始日期"]');
    return el ? el.value : '';
  }

  function getDateEnd() {
    const el = document.querySelector('input[placeholder*="结束日期"]');
    return el ? el.value : '';
  }

  function updateFormInfo() {
    const emp = getEmployeeName();
    const ds = getDateStart();
    const de = getDateEnd();
    document.getElementById('ce_emp').textContent = emp || '未选择';
    document.getElementById('ce_date').textContent = (ds && de) ? ds + ' ~ ' + de : '-';

    STATE.employeeName = emp;
    STATE.employeeId = getEmployeeId();
    STATE.dateStart = ds;
    STATE.dateEnd = de;
  }

  // ── UI helpers ──
  function setStatus(text) {
    document.getElementById('ce_status').textContent = text;
  }

  function showProgress(current, total, label) {
    const wrap = document.getElementById('ce_progress_wrap');
    wrap.style.display = 'block';
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    document.getElementById('ce_progress_fill').style.width = pct + '%';
    document.getElementById('ce_progress_text').textContent = label || (current + ' / ' + total);
  }

  function hideProgress() {
    document.getElementById('ce_progress_wrap').style.display = 'none';
  }

  function addLog(name, count, ok) {
    const log = document.getElementById('ce_log');
    const div = document.createElement('div');
    div.className = 'ce-log-item';
    div.innerHTML = '<span class="' + (ok ? 'ok' : 'fail') + '">' + (ok ? 'OK' : 'X') + '</span><span class="name">' + escapeHtml(name) + '</span><span>' + count + '</span>';
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function clearLog() {
    document.getElementById('ce_log').innerHTML = '';
  }

  function showError(msg) {
    const el = document.getElementById('ce_error');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 8000);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function setRunning(running) {
    STATE.running = running;
    document.getElementById('ce_start_btn').style.display = running ? 'none' : 'block';
    document.getElementById('ce_stop_btn').style.display = running ? 'block' : 'none';
    document.getElementById('ce_start_btn').disabled = running;
  }

  function stopExport() {
    STATE.running = false;
    STATE.interceptEnabled = false;
    setRunning(false);
    setStatus('已停止');
  }

  // ── DOM helpers ──
  function findButton(text) {
    const btns = document.querySelectorAll('button');
    for (let i = 0; i < btns.length; i++) {
      if (btns[i].textContent && btns[i].textContent.trim() === text) return btns[i];
    }
    return null;
  }

  // ── Drawer: wait for it to appear ──
  function waitForDrawer(timeout) {
    const start = Date.now();
    return new Promise(function (resolve) {
      function check() {
        const drawer = document.querySelector('.ant-drawer.ant-drawer-open');
        if (drawer) {
          resolve(drawer);
          return;
        }
        if (Date.now() - start > timeout) {
          resolve(null);
          return;
        }
        setTimeout(check, 500);
      }
      check();
    });
  }

  // ── Drawer: wait for content to finish loading ──
  function waitForDrawerContent(timeout) {
    const start = Date.now();
    return new Promise(function (resolve) {
      function check() {
        const container = document.querySelector('.ant-drawer-open .ant-spin-container');
        if (container) {
          // Check if spin loading is done: either has account list or has empty state
          const accountList = container.querySelector('[class*="_accountList_"]');
          const empty = container.querySelector('.ant-empty');
          if (accountList || empty) {
            resolve(true);
            return;
          }
        }
        if (Date.now() - start > timeout) {
          resolve(false);
          return;
        }
        setTimeout(check, 500);
      }
      check();
    });
  }

  // ── Drawer: extract customer list from account list UL ──
  function getCustomerListFromDrawer() {
    const lists = document.querySelectorAll('[class*="_accountList_"]');
    for (let i = 0; i < lists.length; i++) {
      const list = lists[i];
      // Skip the chat detail list (has both _accountList_ and _chatDetailWrap_)
      if (list.className.indexOf('_chatDetailWrap_') !== -1) continue;

      const items = list.querySelectorAll('li');
      const customers = [];
      items.forEach(function (item) {
        const name = item.textContent.trim();
        if (name) {
          customers.push({ name: name, id: name, element: item });
        }
      });
      if (customers.length > 0) return customers;
    }
    return [];
  }

  // ── Drawer: click a customer in the account list ──
  function clickCustomerInDrawer(customerName) {
    const lists = document.querySelectorAll('[class*="_accountList_"]');
    for (let i = 0; i < lists.length; i++) {
      const list = lists[i];
      if (list.className.indexOf('_chatDetailWrap_') !== -1) continue;

      const items = list.querySelectorAll('li');
      for (let j = 0; j < items.length; j++) {
        if (items[j].textContent.trim() === customerName) {
          items[j].click();
          return true;
        }
      }
    }
    return false;
  }

  // ── Drawer: extract messages from chat detail UL ──
  function getMessagesFromChatDetail() {
    const detail = document.querySelector('[class*="_chatDetailWrap_"]');
    if (!detail) return [];

    const items = detail.querySelectorAll('li');
    const messages = [];
    items.forEach(function (item) {
      // Try to find structured children
      const senderEl = item.querySelector('[class*="sender"], [class*="name"], [class*="nick"]');
      const timeEl = item.querySelector('[class*="time"], [class*="date"]');
      const contentEl = item.querySelector('[class*="content"], [class*="text"], [class*="msg"], [class*="body"]');

      const senderName = senderEl ? senderEl.textContent.trim() : (item.getAttribute('data-sender') || '');
      const timestamp = timeEl ? timeEl.textContent.trim() : (item.getAttribute('data-time') || '');
      const content = contentEl ? contentEl.textContent.trim() : item.textContent.trim();
      const sendId = item.getAttribute('data-sender-id') || '';
      const msgId = item.getAttribute('data-msg-id') || '';

      if (!content) return;
      messages.push({
        senderName: senderName,
        sendId: sendId,
        timestamp: timestamp,
        content: content,
        msgId: msgId
      });
    });
    return messages;
  }

  // ── Drawer: wait for chat messages to load ──
  function waitForChatMessages(timeout, prevFirstMsg) {
    const start = Date.now();
    return new Promise(function (resolve) {
      function check() {
        // Check NEW API responses first
        for (let i = 0; i < STATE.capturedResponses.length; i++) {
          const data = STATE.capturedResponses[i].data;
          const msgs = findChatMessagesInJSON(data);
          if (msgs && msgs.length > 0) {
            resolve({ source: 'api', messages: msgs.map(normalizeChatMsg) });
            return;
          }
        }

        // Fall back to DOM — wait for change if we have a previous state
        const msgs = getMessagesFromChatDetail();
        if (msgs.length > 0) {
          var curFirst = msgs[0].content;
          // If no previous state or content has changed, accept
          if (!prevFirstMsg || curFirst !== prevFirstMsg) {
            resolve({ source: 'dom', messages: msgs });
            return;
          }
        }

        if (Date.now() - start > timeout) {
          // Last attempt: check API again
          for (let j = 0; j < STATE.capturedResponses.length; j++) {
            const d = STATE.capturedResponses[j].data;
            const m = findChatMessagesInJSON(d);
            if (m && m.length > 0) {
              resolve({ source: 'api', messages: m.map(normalizeChatMsg) });
              return;
            }
          }
          // Return whatever DOM has now (even if unchanged)
          var finalMsgs = getMessagesFromChatDetail();
          resolve({ source: 'timeout', messages: finalMsgs });
          return;
        }
        setTimeout(check, 1500);
      }
      check();
    });
  }

  // ── JSON traversal for chat messages ──
  function findChatMessagesInJSON(data) {
    if (!data || typeof data !== 'object') return null;
    if (Array.isArray(data) && data.length > 0 && data[0] && typeof data[0] === 'object' &&
        (data[0].content || data[0].message || data[0].text || data[0].body)) {
      return data;
    }
    for (let i = 0; i < Object.keys(data).length; i++) {
      const val = data[Object.keys(data)[i]];
      if (Array.isArray(val) && val.length > 0 && val[0] && typeof val[0] === 'object' &&
          (val[0].content || val[0].message || val[0].text || val[0].body)) {
        return val;
      }
      if (val && typeof val === 'object') {
        const found = findChatMessagesInJSON(val);
        if (found) return found;
      }
    }
    return null;
  }

  function normalizeChatMsg(msg) {
    if (typeof msg === 'string') return { content: msg };

    var senderName = msg.senderName || msg.sender || msg.nick || msg.fromName || msg.userName || '';
    var sendId = msg.senderId || msg.fromId || msg.userId || msg.sendId || '';
    var timestamp = msg.timestamp || msg.time || msg.dateTime || msg.createTime || msg.sendTime || '';
    var content = msg.content || msg.message || msg.text || msg.body || msg.chatContent || '';
    var msgId = msg.msgId || msg.messageId || msg.id || '';

    // If sender info is missing, parse inline format from content
    if (!senderName && content) {
      var parsed = parseInlineContent(content, STATE.employeeName, STATE.employeeId, STATE.employeeNames);
      if (parsed.senderName) senderName = parsed.senderName;
      if (parsed.sendId) sendId = parsed.sendId;
      if (parsed.hasOwnProperty('content')) content = parsed.content;
      if (!timestamp && parsed.timestamp) timestamp = parsed.timestamp;
    }

    return {
      senderName: senderName,
      sendId: sendId,
      timestamp: timestamp,
      content: content,
      msgId: msgId
    };
  }

  // Collect all employee/sub-account names from the dropdown
  function getEmployeeNameList(keepOpen) {
    var names = [];
    var sel = findEmployeeField();
    if (sel) {
      var selectEl = sel.closest('.ant-select');
      if (selectEl) {
        var wasOpen = !!document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
        if (!wasOpen) {
          var trigger = selectEl.querySelector('.ant-select-selector, .ant-select-selection-search-input') || selectEl;
          trigger.click();
        }
        var opts = document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content, .ant-select-dropdown:not(.ant-select-dropdown-hidden) [role="option"]');
        opts.forEach(function(o) {
          var n = o.textContent.trim();
          if (n && names.indexOf(n) === -1) names.push(n);
        });
        if (!wasOpen && !keepOpen) document.body.click();
      }
    }
    // Always include current agent name and ID
    if (STATE.employeeName && names.indexOf(STATE.employeeName) === -1) names.push(STATE.employeeName);
    if (STATE.employeeId && names.indexOf(STATE.employeeId) === -1) names.push(STATE.employeeId);
    // Sort by length descending so longer names match first
    names.sort(function (a, b) { return b.length - a.length; });
    return names;
  }

  function getEmployeeNameListAsync() {
    var immediate = getEmployeeNameList(true);
    return new Promise(function (resolve) {
      var rounds = 0, unchanged = 0, lastCount = immediate.length;
      function scan() {
        var names = getEmployeeNameList(true);
        var dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
        var holder = dropdown && (dropdown.querySelector('.rc-virtual-list-holder') || dropdown.querySelector('.ant-select-item-option-group') || dropdown);
        if (holder && holder.scrollHeight > holder.clientHeight) holder.scrollTop = Math.min(holder.scrollTop + Math.max(holder.clientHeight - 24, 160), holder.scrollHeight);
        setTimeout(function () {
          var next = getEmployeeNameList(true);
          if (next.length === lastCount) unchanged++; else unchanged = 0;
          lastCount = next.length; rounds++;
          if (rounds >= 80 || unchanged >= 4 || !holder || holder.scrollTop + holder.clientHeight >= holder.scrollHeight - 4) {
            if (dropdown) document.body.click();
            resolve(next.length ? next : names);
          } else scan();
        }, 220);
      }
      scan();
    });
  }

  // Parse inline content format:
  //   Agent:  "{timestamp}{accountId}:{displayName}{message}"
  //   Customer: "{senderName}{timestamp}{message}"
  function parseInlineContent(raw, agentName, agentId, employeeNames) {
    var tsMatch = raw.match(/(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/);
    if (!tsMatch) return {};

    var ts = tsMatch[1];
    var tsIdx = tsMatch.index;

    if (tsIdx === 0) {
      // Agent/system format: {timestamp}{rest}
      var afterTs = raw.substring(ts.length);
      var colonIdx = afterTs.indexOf(':');
      if (colonIdx > 0 && colonIdx < 30) {
        var accountId = afterTs.substring(0, colonIdx);
        var rest = afterTs.substring(colonIdx + 1);
        var senderName = '';
        var content = rest;

        // Try to match all known employee names at the start of rest
        var names = employeeNames && employeeNames.length > 0 ? employeeNames : [agentName];
        if (agentId && names.indexOf(agentId) === -1) names.push(agentId);
        // Sort by length descending to match longer names first
        names.sort(function (a, b) { return b.length - a.length; });
        for (var n = 0; n < names.length; n++) {
          if (names[n] && rest.indexOf(names[n]) === 0) {
            senderName = names[n];
            content = rest.substring(names[n].length);
            break;
          }
        }

        return {
          sendId: accountId,
          senderName: senderName || accountId,
          timestamp: ts,
          content: content
        };
      }
      return { timestamp: ts, content: afterTs };
    }

    // Customer format: {senderName}{timestamp}{message}
    return {
      senderName: raw.substring(0, tsIdx).trim(),
      timestamp: ts,
      content: raw.substring(tsIdx + ts.length)
    };
  }

  // ── Main export flow ──
  async function startExport() {
    if (STATE.running) return;

    const empName = getEmployeeName();
    const empId = getEmployeeId();
    const dateStart = getDateStart();
    const dateEnd = getDateEnd();

    if (!empId) {
      showError('请先选择员工账号');
      return;
    }
    if (!dateStart || !dateEnd) {
      showError('请先选择日期范围');
      return;
    }

    // 1688 requires max 7 days per query
    var dayMs = 24 * 60 * 60 * 1000;
    var daysDiff = Math.round((new Date(dateEnd) - new Date(dateStart)) / dayMs);
    if (daysDiff > 6) {
      showError('1688 限制每次最多查询 7 天，当前选择了 ' + (daysDiff + 1) + ' 天。请将日期范围缩小到 7 天以内。');
      return;
    }

    STATE.running = true;
    STATE.results = [];
    STATE.employeeNames = getEmployeeNameList();
    setRunning(true);
    clearLog();
    setStatus('打开聊天记录...');

    try {
      // Step 1: Click "查询聊天记录" to open the drawer
      STATE.interceptEnabled = true;
      STATE.capturedResponses = [];

      const queryBtn = findButton('查询聊天记录');
      if (!queryBtn) throw new Error('找不到"查询聊天记录"按钮，请确认已在聊天记录查询页面');

      queryBtn.click();

      // Step 2: Wait for drawer to appear
      const drawer = await waitForDrawer(15000);
      if (!drawer) throw new Error('未检测到聊天记录面板，请确认已选择员工和日期');

      // Step 3: Wait for drawer content to finish loading (spin to resolve)
      await waitForDrawerContent(10000);

      // Step 4: Extract customer list from drawer
      const customers = getCustomerListFromDrawer();
      if (customers.length === 0) throw new Error('未获取到客户账号列表，请确认查询结果不为空');

      STATE.totalCustomers = customers.length;
      setStatus('共 ' + customers.length + ' 个客户，开始导出...');
      showProgress(0, customers.length, '0 / ' + customers.length);

      // Step 5: Iterate each customer
      // First customer's messages should already be loaded when drawer opens
      var prevFirstMsg = '';

      for (let i = 0; i < customers.length; i++) {
        if (!STATE.running) break;

        const c = customers[i];
        showProgress(i + 1, customers.length,
          (i + 1) + ' / ' + customers.length + ' - ' + c.name);

        try {
          if (i > 0) {
            // Capture current chat state before clicking next customer
            var curMsgs = getMessagesFromChatDetail();
            prevFirstMsg = curMsgs.length > 0 ? curMsgs[0].content : '';

            // Clear captured responses so we only get THIS customer's data
            STATE.capturedResponses = [];

            // Click customer in the drawer list
            const clicked = clickCustomerInDrawer(c.name);
            if (!clicked) {
              STATE.results.push({ customerName: c.name, messages: [], count: 0, error: '无法点击' });
              addLog(c.name, 0, false);
              continue;
            }

            // Wait for chat to update (pass previous state to detect change)
            var resp = await waitForChatMessages(10000, prevFirstMsg);
          } else {
            // First customer: data already loaded, just read from DOM/API
            var resp = await waitForChatMessages(5000, '');
          }

          STATE.results.push({
            customerName: c.name,
            messages: resp.messages,
            count: resp.messages.length
          });
          addLog(c.name, resp.messages.length, resp.messages.length > 0);
        } catch (e) {
          STATE.results.push({ customerName: c.name, messages: [], count: 0, error: e.message });
          addLog(c.name, 0, false);
        }
      }

      // Step 6: Download directly (avoid large message passing to background)
      if (STATE.results.length > 0 && STATE.running) {
        setStatus('生成下载文件...');
        showProgress(customers.length, customers.length, '下载中...');

        try {
          var content = generateExportJSON(STATE.results, empName, empId, dateStart, dateEnd);
          var filename = buildExportFilename(empName, dateStart);
          triggerDownload(content, filename, 'application/json;charset=utf-8');
          setStatus('完成！已导出 ' + STATE.results.length + ' 个客户');
        } catch (e) {
          setStatus('下载失败: ' + e.message);
        }
      }
    } catch (e) {
      showError(e.message);
      setStatus('失败');
    } finally {
      STATE.running = false;
      STATE.interceptEnabled = false;
      setRunning(false);
      hideProgress();
    }
  }

  function buildExportFilename(agentName, dateStart) {
    var name = (agentName || 'chat')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100) || 'chat_export';
    var dateStr = (dateStart || '').replace(/-/g, '');
    return '1688_' + name + '_' + dateStr + '.json';
  }

  function generateExportJSON(results, agentName, agentId, dateStart, dateEnd) {
    var now = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var iso = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' +
      pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) + '+08:00';

    var agentNames = STATE.employeeNames || [agentName];

    var customers = [];
    var totalMessages = 0;

    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var customerMessages = [];

      for (var j = 0; j < (r.messages || []).length; j++) {
        var m = r.messages[j];
        var role = 'customer';

        if (m.sendId && m.sendId !== r.customerName) {
          role = 'agent';
        } else if (agentNames.indexOf(m.senderName) !== -1 || m.senderName === agentId) {
          role = 'agent';
        } else if (m.senderName === r.customerName) {
          role = 'customer';
        } else if (m.sendId) {
          role = 'agent';
        }

        customerMessages.push({
          role: role,
          speaker: m.senderName || '',
          speaker_id: m.sendId || '',
          timestamp: m.timestamp || '',
          content: m.content || '',
          msg_id: m.msgId || ''
        });
      }

      customers.push({
        customer_name: r.customerName,
        message_count: r.count,
        error: r.error || null,
        messages: customerMessages
      });

      totalMessages += customerMessages.length;
    }

    return JSON.stringify({
      metadata: {
        export_time: iso,
        platform: '1688.com',
        date_range: {
          start: dateStart || '',
          end: dateEnd || ''
        },
        agent: {
          id: agentId || '',
          name: agentName || ''
        },
        total_customers: customers.length,
        total_messages: totalMessages
      },
      customers: customers
    }, null, 2);
  }

  function triggerDownload(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function sendExportProgress(current, total, text, log, done, error) {
    chrome.runtime.sendMessage({
      action: 'exportProgress', current: current, total: total, text: text,
      log: log || '', done: !!done, error: error || ''
    });
  }

  function splitDateRange(startStr, endStr) {
    var ranges = [], cursor = new Date(startStr + 'T00:00:00'), end = new Date(endStr + 'T00:00:00');
    while (cursor <= end) {
      var segmentEnd = new Date(cursor);
      segmentEnd.setDate(segmentEnd.getDate() + 6);
      if (segmentEnd > end) segmentEnd = new Date(end);
      ranges.push({ start: cursor.toISOString().slice(0, 10), end: segmentEnd.toISOString().slice(0, 10) });
      cursor = new Date(segmentEnd);
      cursor.setDate(cursor.getDate() + 1);
    }
    return ranges;
  }

  function escapeXml(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function generateBatchJSON(allResults, task) {
    var customers = [];
    allResults.forEach(function (entry) {
      entry.results.forEach(function (r) {
        customers.push({ employee: entry.employee, customer_name: r.customerName, message_count: r.count, error: r.error || null,
          messages: (r.messages || []).map(function (m) { return { role: m.sendId && m.sendId !== r.customerName ? 'agent' : 'customer', speaker: m.senderName || '', speaker_id: m.sendId || '', timestamp: m.timestamp || '', content: m.content || '', msg_id: m.msgId || '' }; }) });
      });
    });
    return JSON.stringify({ metadata: { export_time: new Date().toISOString(), platform: '1688.com', date_range: { start: task.dateStart, end: task.dateEnd }, shop_name: task.shopName || '', total_employees: task.employees.length, total_customers: customers.length, total_messages: customers.reduce(function (n, c) { return n + c.message_count; }, 0) }, customers: customers }, null, 2);
  }

  function generateBatchExcel(allResults, task) {
    var rows = ['员工\t客户账号\t发送人\t角色\t时间\t聊天内容'];
    allResults.forEach(function (entry) { entry.results.forEach(function (r) { (r.messages || []).forEach(function (m) { var role = m.sendId && m.sendId !== r.customerName ? '业务员' : '客户'; rows.push([entry.employee, r.customerName, m.senderName || '', role, m.timestamp || '', m.content || ''].map(function (v) { return String(v).replace(/[\t\r\n]+/g, ' '); }).join('\t')); }); }); });
    return '\ufeff' + rows.join('\r\n');
  }

  async function runBatchExport(task) {
    var ranges = splitDateRange(task.dateStart, task.dateEnd), total = task.employees.length * ranges.length, current = 0, allResults = [], errors = [];
    for (var e = 0; e < task.employees.length; e++) {
      var employee = task.employees[e];
      for (var d = 0; d < ranges.length; d++) {
        if (!STATE.running) return;
        var range = ranges[d];
        sendExportProgress(current, total, '正在处理 ' + employee + '：' + range.start + ' ~ ' + range.end, '开始：' + employee + ' ' + range.start + ' ~ ' + range.end);
        var selected = await selectEmployee(employee);
        if (!selected) { errors.push(employee + '：无法选择员工'); current++; sendExportProgress(current, total, '跳过 ' + employee, employee + ' 选择失败'); continue; }
        await sleep(500); setDateRange(range.start, range.end); await sleep(500);
        STATE.employeeName = getEmployeeName(); STATE.employeeId = getEmployeeId(); STATE.employeeNames = getEmployeeNameList();
        try { var result = await runSingleExport(employee, STATE.employeeId, range.start, range.end); allResults.push({ employee: employee, results: result }); sendExportProgress(current + 1, total, employee + ' 已完成（' + result.length + ' 个客户）', employee + ' 完成：' + result.length + ' 个客户'); STATE.running = true; }
        catch (err) { errors.push(employee + '：' + err.message); sendExportProgress(current + 1, total, employee + ' 执行失败', errors[errors.length - 1]); }
        current++;
      }
    }
    if (allResults.length) {
      var ext = task.format === 'excel' ? 'xls' : 'json';
      var body = task.format === 'excel' ? generateBatchExcel(allResults, task) : generateBatchJSON(allResults, task);
      triggerDownload(body, '1688_' + (task.shopName || '聊天记录').replace(/[<>:"/\\|?*]/g, '_') + '_' + task.dateStart.replace(/-/g, '') + '_' + task.dateEnd.replace(/-/g, '') + '.' + ext, task.format === 'excel' ? 'application/vnd.ms-excel;charset=utf-8' : 'application/json;charset=utf-8');
    }
    STATE.running = false; STATE.interceptEnabled = false; setRunning(false); sendExportProgress(total, total, errors.length ? '完成，部分任务失败' : '全部导出完成', '任务完成' + (errors.length ? '，失败：' + errors.join('；') : ''), true, errors.join('；'));
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // ── Auto export helpers ──

  function getYesterday() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function selectEmployee(name) {
    return new Promise(function (resolve) {
      var sel = findEmployeeField();
      if (!sel) { resolve(false); return; }
      var selectEl = sel.closest('.ant-select');
      if (!selectEl) { resolve(false); return; }

      var current = selectEl.querySelector('.ant-select-selection-item');
      if (current && current.textContent.trim() === name) {
        resolve(true);
        return;
      }

      selectEl.click();

      setTimeout(function () {
        var opts = document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option');
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].textContent.trim() === name) {
            opts[i].click();
            resolve(true);
            return;
          }
        }
        document.body.click();
        resolve(false);
      }, 500);
    });
  }

  function setDateRange(startStr, endStr) {
    var nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    var startInput = document.querySelector('input[placeholder*="开始日期"]');
    var endInput = document.querySelector('input[placeholder*="结束日期"]');
    if (startInput) {
      nativeSetter.call(startInput, startStr);
      startInput.dispatchEvent(new Event('input', { bubbles: true }));
      startInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (endInput) {
      nativeSetter.call(endInput, endStr);
      endInput.dispatchEvent(new Event('input', { bubbles: true }));
      endInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return !!(startInput || endInput);
  }

  function getDateRangeForDays(days) {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var fmt = function (d) {
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    };
    var end = new Date();
    end.setDate(end.getDate() - 1);
    var start = new Date();
    start.setDate(start.getDate() - Math.min(days || 1, 7));
    return { start: fmt(start), end: fmt(end) };
  }

  async function checkAutoExport() {
    // Check for a pending auto-export task (within last 5 minutes)
    var stored = await chrome.storage.local.get('pendingAutoExport');
    var task = stored.pendingAutoExport;
    if (!task || !task.employees || !task.timestamp) return;

    var age = Date.now() - task.timestamp;
    if (age > 300000) {
      await chrome.storage.local.remove('pendingAutoExport');
      return;
    }

    // Clear the task so we don't re-run on refresh
    await chrome.storage.local.remove('pendingAutoExport');

    var range = getDateRangeForDays(task.days || 1);
    var allResults = [];

    for (var e = 0; e < task.employees.length; e++) {
      var empName = task.employees[e];
      setStatus('定时导出: ' + empName + ' (' + (e + 1) + '/' + task.employees.length + ')');

      var selected = await selectEmployee(empName);
      if (!selected) {
        allResults.push({ employee: empName, error: '无法选择该业务员' });
        continue;
      }

      await sleep(1000);

      setDateRange(range.start, range.end);
      await sleep(500);

      STATE.employeeName = getEmployeeName();
      STATE.employeeId = getEmployeeId();
      STATE.dateStart = range.start;
      STATE.dateEnd = range.end;
      STATE.employeeNames = getEmployeeNameList();

      // Run export for this employee
      try {
        var empResult = await runSingleExport(empName, STATE.employeeId, range.start, range.end);
        allResults.push({
          employee: empName,
          customers: empResult.length,
          messages: empResult.reduce(function (s, r) { return s + r.count; }, 0)
        });
      } catch (err) {
        allResults.push({ employee: empName, error: err.message });
      }

      await sleep(2000);
    }

    // Download all results combined
    if (allResults.length > 0) {
      try {
        var combinedResults = [];
        for (var j = 0; j < allResults.length; j++) {
          if (allResults[j].customers) {
            combinedResults.push({ employee: allResults[j].employee, count: allResults[j].customers, messages: allResults[j].messages });
          }
        }
        var content = generateExportJSON(STATE.results, '定时导出', 'auto', range.start, range.end);
        var filename = '1688_定时导出_' + range.start.replace(/-/g, '') + '_' + range.end.replace(/-/g, '') + '.json';
        triggerDownload(content, filename, 'application/json;charset=utf-8');

        var summary = combinedResults.map(function (r) { return r.employee + ': ' + r.messages + '条'; }).join(', ');
        chrome.runtime.sendMessage({
          action: 'autoExportComplete',
          message: range.start + '~' + range.end + ' 已导出 ' + combinedResults.length + ' 个业务员 (' + summary + ')'
        });
      } catch (err) {}
    }

    setStatus('定时导出完成');
  }

  async function runSingleExport(empName, empId, dateStart, dateEnd) {
    STATE.running = true;
    STATE.results = [];
    STATE.interceptEnabled = true;
    STATE.capturedResponses = [];
    setRunning(true);
    clearLog();

    var queryBtn = findButton('查询聊天记录');
    if (!queryBtn) throw new Error('找不到查询按钮');

    queryBtn.click();

    var drawer = await waitForDrawer(15000);
    if (!drawer) throw new Error('未检测到聊天记录面板');

    await waitForDrawerContent(10000);

    var customers = getCustomerListFromDrawer();
    if (customers.length === 0) throw new Error('未获取到客户列表');

    var prevFirstMsg = '';

    for (var i = 0; i < customers.length; i++) {
      if (!STATE.running) break;

      var c = customers[i];
      showProgress(i + 1, customers.length, (i + 1) + '/' + customers.length + ' ' + c.name);

      try {
        if (i > 0) {
          var curMsgs = getMessagesFromChatDetail();
          prevFirstMsg = curMsgs.length > 0 ? curMsgs[0].content : '';
          STATE.capturedResponses = [];
          var clicked = clickCustomerInDrawer(c.name);
          if (!clicked) {
            STATE.results.push({ customerName: c.name, messages: [], count: 0, error: '无法点击' });
            continue;
          }
          var resp = await waitForChatMessages(10000, prevFirstMsg);
        } else {
          var resp = await waitForChatMessages(5000, '');
        }

        STATE.results.push({
          customerName: c.name,
          messages: resp.messages,
          count: resp.messages.length
        });
      } catch (err) {
        STATE.results.push({ customerName: c.name, messages: [], count: 0, error: err.message });
      }
    }

    STATE.running = false;
    STATE.interceptEnabled = false;
    setRunning(false);
    hideProgress();

    return STATE.results;
  }

  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'getEmployeeList') {
      getEmployeeNameListAsync().then(function (names) {
        sendResponse({ success: true, names: names });
      });
      return true;
    }
    if (request.action === 'startBatchExport') {
      if (STATE.running) { sendResponse({ success: false, error: '已有任务正在执行' }); return true; }
      STATE.running = true; STATE.interceptEnabled = false;
      runBatchExport(request.task).catch(function (err) {
        STATE.running = false; STATE.interceptEnabled = false; setRunning(false); sendExportProgress(0, 1, '任务失败', err.message, true, err.message);
      });
      sendResponse({ success: true });
      return true;
    }
    return false;
  });

  // ── Init ──
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { init(); });
      return;
    }

    if (!findEmployeeField()) {
      setTimeout(init, 1000);
      return;
    }

    setupAPIInterception();
    injectUI();

    // Check for scheduled auto-export
    setTimeout(function () { checkAutoExport(); }, 2000);
  }

  init();
})();
