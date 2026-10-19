'use strict';
process.env.TZ = 'Asia/Shanghai';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const NativeDate = Date;
let current = '2026-03-01T00:30:00+08:00';
class FixedDate extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [current])); }
  static now() { return new NativeDate(current).getTime(); }
}
const event = { addListener() {} };
const worker = { Date: FixedDate, chrome: { runtime: { onInstalled: event, onStartup: event, onMessage: event }, alarms: { onAlarm: event } } };
vm.createContext(worker);
vm.runInContext(fs.readFileSync(path.join(root, 'background/background.js'), 'utf8'), worker);
assert.equal(new NativeDate(worker.nextFireTime('00:00')).toString().slice(0, 24), new NativeDate('2026-03-02T00:00:00+08:00').toString().slice(0, 24));
assert.equal(new NativeDate(worker.nextFireTime('09:00')).getHours(), 9);

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, { value: '', style: {}, dataset: {}, classList: { add() {}, remove() {} }, addEventListener() {}, querySelectorAll() { return []; }, click() { this.onclick?.(); } });
  return elements.get(id);
}
const buttons = ['yesterday', '7', 'thisMonth', 'lastMonth'].map(key => ({ dataset: { range: key } }));
const popup = { Date: FixedDate, Set, document: { getElementById: element, querySelectorAll() { return buttons; }, addEventListener(_, cb) { cb(); } }, chrome: { runtime: { onMessage: event }, storage: { local: { get(_, cb) { cb({}); } } } } };
vm.createContext(popup);
vm.runInContext(fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8'), popup);
function check(key, start, end) { buttons.find(b => b.dataset.range === key).onclick(); assert.equal(element('dateStart').value, start); assert.equal(element('dateEnd').value, end); }
check('yesterday', '2026-02-28', '2026-02-28');
check('7', '2026-02-22', '2026-02-28');
check('thisMonth', '2026-03-01', '2026-03-01');
check('lastMonth', '2026-02-01', '2026-02-28');
console.log('日期快捷选项和定时任务测试通过');
