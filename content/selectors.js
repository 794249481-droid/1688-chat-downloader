const SELECTORS = {
  // ── Page detection ──
  page: '#userId',

  // ── Form inputs (Ant Design) ──
  employeeInput: '#userId',
  employeeSelect: '.ant-select-selection-search-input',
  customerInput: 'input[placeholder*="客户账号"]',
  dateStart: 'input[placeholder*="开始日期"]',
  dateEnd: 'input[placeholder*="结束日期"]',

  // ── Buttons ──
  queryChatBtn: '查询聊天记录',

  // ── Ant Table results ──
  tableBody: '.ant-table-tbody',
  tableRows: '.ant-table-tbody tr.ant-table-row',
  tableCell: '.ant-table-cell',
  tableEmpty: '.ant-empty',

  // ── Ant Select dropdown ──
  selectDropdown: '.ant-select-dropdown',
  selectOption: '.ant-select-item-option',
  selectOptionText: '.ant-select-item-option-content',

  // ── Drawer (chat result panel) ──
  drawer: '.ant-drawer',
  drawerBody: '.ant-drawer-body',
  drawerWrapper: '.ant-drawer-content-wrapper',

  // ── Drawer: customer account list ──
  accountList: '[class*="_accountList_"]',
  accountListItem: '[class*="_accountList_"] li',

  // ── Drawer: chat detail/messages ──
  chatDetailWrap: '[class*="_chatDetailWrap_"]',
  chatDetailItem: '[class*="_chatDetailWrap_"] li',

  // ── Tabs ──
  tabs: '.ant-tabs-tab-btn',
  selfCheckTab: '自查工具',
  tabPanel: '[role="tabpanel"]',

  // ── Chat result modal/panel (fallback) ──
  chatResultPanel: '.ant-drawer-body, .ant-modal-body, [class*="chat-detail"], [class*="message-detail"]',
  chatMessages: '.ant-table-row, [class*="message-item"], [class*="chat-item"], [class*="msg-row"]'
};
