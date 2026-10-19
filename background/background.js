'use strict';

const ALARM_NAME = 'daily-1688-export';
const PAGE_URL = 'https://air.1688.com/app/1688-pc-front/pc-message-manage/';

// ── Alarm management ──

function nextFireTime(timeStr) {
  const now = new Date();
  const parts = (timeStr || '09:00').split(':');
  const h = parseInt(parts[0], 10) || 9;
  const m = parseInt(parts[1], 10) || 0;
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (target.getTime() <= now.getTime() + 60000) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

async function syncAlarm() {
  const stored = await chrome.storage.local.get('scheduleConfig');
  const cfg = stored.scheduleConfig;
  await chrome.alarms.clear(ALARM_NAME);
  if (cfg && cfg.enabled && cfg.time) {
    chrome.alarms.create(ALARM_NAME, {
      when: nextFireTime(cfg.time),
      periodInMinutes: 1440
    });
  }
}

chrome.runtime.onInstalled.addListener(syncAlarm);
chrome.runtime.onStartup.addListener(syncAlarm);

// ── Scheduled export ──

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  const stored = await chrome.storage.local.get('scheduleConfig');
  const cfg = stored.scheduleConfig;
  if (!cfg || !cfg.enabled) return;

  // Save pending task so content script picks it up on load
  await chrome.storage.local.set({
    pendingAutoExport: {
      employees: cfg.employees || [],
      days: cfg.days || 1,
      timestamp: Date.now()
    }
  });

  try {
    let tabs = await chrome.tabs.query({ url: '*://air.1688.com/app/1688-pc-front/pc-message-manage/*' });
    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      // Reload so content script re-runs and picks up the task
      await chrome.tabs.reload(tabs[0].id);
    } else {
      await chrome.tabs.create({ url: PAGE_URL, active: false });
    }
  } catch (_) {
    // Silently fail
  }
});

// ── Message handling ──

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getScheduleConfig') {
    (async () => {
      const stored = await chrome.storage.local.get('scheduleConfig');
      sendResponse(stored.scheduleConfig || null);
    })();
    return true;
  }

  if (request.action === 'saveScheduleConfig') {
    (async () => {
      await chrome.storage.local.set({ scheduleConfig: request.config });
      await syncAlarm();
      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.action === 'autoExportComplete') {
    (async () => {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '1688 定时导出完成',
        message: request.message || '导出完成'
      });
      sendResponse({ success: true });
    })();
    return true;
  }

  sendResponse({ success: false });
  return true;
});
