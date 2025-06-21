import { initAuthStateListener, setupAuthForms} from './auth.js';
import { loadData } from './data.js';
import { initTabs } from './ui.js';

// 页面加载完成后初始化
document.addEventListener("DOMContentLoaded", function() {
  console.log("DOM 加载完成，开始初始化...");
  
  refreshBtn = document.getElementById("refreshBtn");
  loadingDiv = document.getElementById("loading");
  errorDiv = document.getElementById("error");
  
  initAuthStateListener();
  setupAuthForms();

  if (refreshBtn) refreshBtn.addEventListener("click", () => loadData(true));
  
  initTabs();
  loadData();
});

// 全局导出函数
window.exportData = exportData;
window.loadData = loadData;

// 错误处理
window.addEventListener("error", function(e) {
  console.error("全局错误:", e.error);
  showError("发生未知错误，请刷新页面重试");
});

window.addEventListener("unhandledrejection", function(e) {
  console.error("未处理的Promise错误:", e.reason);
  showError("数据处理错误，请刷新页面重试");
});

console.log("🚀 脚本加载完成");
