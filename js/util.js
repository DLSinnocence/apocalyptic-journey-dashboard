import { allData } from './js/config.js';

// 格式化物品名称
export function formatItemName(itemId) {
  if (!itemId) return "未知物品";
  return itemId;
}

// 显示加载状态
export function showLoading(show) {
  if (loadingDiv) loadingDiv.style.display = show ? "flex" : "none";
}

// 隐藏错误信息
export function hideError() {
  if (errorDiv) errorDiv.style.display = "none";
}

// 显示错误信息
export function showError(message = "数据加载失败，请检查配置并重试") {
  if (errorDiv) {
    errorDiv.style.display = "block";
    errorDiv.innerHTML = `<p>${message}</p>`;
  }
  showLoading(false);
}

// 获取图表颜色
export function getChartColor(index) {
  const colors = ["#3498db", "#e74c3c", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#34495e", "#e67e22", "#95a5a6", "#16a085"];
  return colors[index % colors.length];
}
