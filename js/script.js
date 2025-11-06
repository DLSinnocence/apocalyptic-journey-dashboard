import { encryptData, decryptData } from "./utils.js";
import {
  supabase,
  TABLE_NAME,
  ENC_KEY_PASSPHRASE,
  TABLE_NAME_ERROR,
} from "./config.js";
import { initAuthStateListener, setupAuthForms } from "./auth.js";

// 全局变量
let allData = [];
let errorData = [];

// DOM 元素
let refreshBtn, loadingDiv, errorDiv;

// 全局缓存状态
let cacheEnabled = true;
let cacheFailureCount = 0;
const MAX_CACHE_FAILURES = 3;

// 禁用缓存函数
function disableCache() {
  cacheEnabled = false;
  console.warn("⚠️ 缓存已禁用，将直接加载数据");
  showMessage("缓存功能已禁用，数据将直接从服务器加载", "warning");
}

// 检查是否应该禁用缓存
function shouldDisableCache() {
  if (cacheFailureCount >= MAX_CACHE_FAILURES) {
    disableCache();
    return true;
  }
  return false;
}

// 增强的存储错误处理
function handleStorageError(error, operation) {
  if (error.name === "QuotaExceededError") {
    console.error(`存储配额超限 (${operation}):`, error);
    cacheFailureCount++;

    // 尝试清除缓存
    if (clearCache()) {
      showMessage("存储空间不足，已自动清除缓存。请重试操作。", "warning");
    } else {
      showMessage("存储空间不足，请手动清除浏览器数据或联系管理员。", "error");
    }

    // 检查是否应该禁用缓存
    if (shouldDisableCache()) {
      return false;
    }

    return false;
  } else {
    console.error(`存储操作失败 (${operation}):`, error);
    cacheFailureCount++;

    // 检查是否应该禁用缓存
    if (shouldDisableCache()) {
      return false;
    }

    showMessage(`存储操作失败: ${error.message}`, "error");
    return false;
  }
}

// 显示应用内容
function showAppContent() {
  document.getElementById("login-container").classList.add("hidden");
  document.getElementById("app-container").classList.remove("hidden");

  // 初始化应用的其他部分
  refreshBtn = document.getElementById("refreshBtn");
  loadingDiv = document.getElementById("loading");
  errorDiv = document.getElementById("error");

  initTabs();
  loadData();
}

// 显示登录表单
function showLoginForm() {
  document.getElementById("login-container").classList.remove("hidden");
  document.getElementById("app-container").classList.add("hidden");

  // 清空错误信息
  const errorEl = document.getElementById("login-error");
  if (errorEl) {
    errorEl.classList.add("hidden");
  }
}

// 初始化应用
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM 加载完成，开始初始化...");

  // 获取DOM元素
  refreshBtn = document.getElementById("refreshBtn");
  loadingDiv = document.getElementById("loading");
  errorDiv = document.getElementById("error");

  // 初始化Supabase认证状态监听器
  initAuthStateListener((isLoggedIn) => {
    if (isLoggedIn) {
      showAppContent();
    } else {
      showLoginForm();
    }
  });

  // 设置登录表单事件
  setupAuthForms();

  // 设置事件监听器
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => loadData(true));
  }

  // 绑定清除缓存按钮事件
  const clearCacheBtn = document.getElementById("clearCacheBtn");
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", () => {
      if (confirm("确定要清除所有缓存数据吗？这将强制重新加载数据。")) {
        clearCache();
        showMessage("缓存已清除，正在重新加载数据...", "info");
        setTimeout(() => loadData(true), 1000);
      }
    });
  }

  // 初始化标签页
  initTabs();

  // 检查当前会话
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      showAppContent();

      // 检查存储空间
      const quotaCheck = checkStorageQuota();
      if (!quotaCheck.available) {
        showMessage(quotaCheck.message, "warning");
      }
    }
  });
});

// 标签页功能
function initTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  console.log(
    "初始化标签页 - 按钮数量:",
    tabBtns.length,
    "面板数量:",
    tabPanes.length
  );

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      console.log("切换到标签页:", targetTab);

      // 移除所有活动状态
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabPanes.forEach((p) => p.classList.remove("active"));

      // 添加当前活动状态
      btn.classList.add("active");
      const targetPane = document.getElementById(targetTab);
      if (targetPane) {
        targetPane.classList.add("active");
      }

      // 更新UI以显示新标签页的内容
      updateUI();
    });
  });
}

// 加载数据
async function loadData(forceRefresh = false) {
  console.log("=== 开始加载数据 ===");

  // 保存当前页面状态
  const currentScrollPosition = window.scrollY;
  const currentActiveTab = document
    .querySelector(".tab-btn.active")
    ?.getAttribute("data-tab");
  const currentItemDetailModal = document.querySelector(
    ".item-detail-modal.show"
  );

  showLoading(true);
  hideError();

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "🔄 加载中...";
  }

  const CACHE_KEY = "dashboard_data_cache";
  const CACHE_TTL = 5 * 60 * 1000; // 5分钟有效

  try {
    if (!forceRefresh && cacheEnabled) {
      const cached = retrieveDataFromChunks(CACHE_KEY);
      if (cached) {
        try {
          let decrypted;
          // 尝试解密数据
          try {
            decrypted = await decryptData(cached, ENC_KEY_PASSPHRASE);
          } catch (decryptError) {
            // 如果解密失败，可能是未加密的数据
            console.log("缓存数据解密失败，尝试直接使用:", decryptError);
            decrypted = cached;
          }

          if (Date.now() - decrypted.timestamp < CACHE_TTL) {
            allData = decrypted.data;
            errorData = decrypted.errorData; // 从缓存中恢复 errorData
            console.log("✅ 从缓存加载数据成功");
            updateUI();
            restorePageState(
              currentScrollPosition,
              currentActiveTab,
              currentItemDetailModal
            );
            showLoading(false); // 手动隐藏加载状态，因为会跳过 finally 块
            if (refreshBtn) {
              refreshBtn.disabled = false;
              refreshBtn.textContent = "🔄 刷新数据";
            }
            return; // 这里会跳过 finally 块，所以需要在 return 前手动隐藏加载状态
          }
        } catch (error) {
          console.warn("缓存数据解析失败，清除缓存:", error);
          clearDataChunks(CACHE_KEY);
          cacheFailureCount++;
          if (shouldDisableCache()) {
            showMessage("缓存功能已禁用，将直接从服务器加载数据", "warning");
          }
        }
      }
    }

    // 请求 Supabase 数据
    const { data, error } = await fetchAllData(supabase, TABLE_NAME);
    const { data: errorDataResult, error: errorFetch } = await fetchAllData(
      supabase,
      TABLE_NAME_ERROR
    );
    if (error) throw new Error(`数据获取失败: ${error.message}`);
    if (errorFetch) throw new Error(`错误数据获取失败: ${errorFetch.message}`);
    if (!data || data.length === 0) throw new Error("没有获取到任何数据");

    allData = data;
    errorData = errorDataResult || []; // 正确赋值给全局变量
    console.log("✅ 数据加载成功，记录数:", allData.length);
    console.log("✅ 数据加载成功，保存到缓存");

    // 保存缓存 - 使用分块存储避免配额超限
    if (cacheEnabled) {
      const cacheData = {
        timestamp: Date.now(),
        data: data,
        errorData: errorDataResult || [], // 使用正确的变量名
      };

      // 先尝试加密，如果失败则使用分块存储
      try {
        const encrypted = await encryptData(cacheData, ENC_KEY_PASSPHRASE);
        const result = storeDataInChunks(encrypted, CACHE_KEY);
        if (result.success) {
          console.log(`✅ 缓存保存成功，使用 ${result.chunks} 个分块`);
          cacheFailureCount = 0; // 重置失败计数
        } else {
          console.warn("⚠️ 分块存储失败，跳过缓存:", result.error);
          if (
            result.error.includes("QuotaExceededError") ||
            result.error.includes("配额超限")
          ) {
            showMessage(
              "存储空间不足，已跳过缓存。建议清除浏览器数据。",
              "warning"
            );
          }
        }
      } catch (error) {
        console.warn("⚠️ 数据加密失败，尝试直接分块存储:", error);
        const result = storeDataInChunks(cacheData, CACHE_KEY);
        if (result.success) {
          console.log(
            `✅ 缓存保存成功（未加密），使用 ${result.chunks} 个分块`
          );
          cacheFailureCount = 0; // 重置失败计数
        } else {
          console.warn("⚠️ 分块存储失败，跳过缓存:", result.error);
          if (
            result.error.includes("QuotaExceededError") ||
            result.error.includes("配额超限")
          ) {
            showMessage(
              "存储空间不足，已跳过缓存。建议清除浏览器数据。",
              "warning"
            );
          }
        }
      }
    } else {
      console.log("⚠️ 缓存已禁用，跳过数据缓存");
    }

    updateUI();
    restorePageState(
      currentScrollPosition,
      currentActiveTab,
      currentItemDetailModal
    );
  } catch (error) {
    console.error("❌ 数据加载失败:", error);
    showError(error.message);
  } finally {
    showLoading(false);
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "🔄 刷新数据";
    }

    // 强制浏览器重绘，确保UI更新可见
    if (document.body) {
      // 触发重绘
      document.body.offsetHeight;
      // 确保主内容区域可见
      const mainContent = document.querySelector(".main-content");
      if (mainContent) {
        mainContent.style.display = "block";
        mainContent.style.visibility = "visible";
      }

      // 强制重绘当前活动的标签页内容
      const activeTab = document
        .querySelector(".tab-btn.active")
        ?.getAttribute("data-tab");
      if (activeTab) {
        const activePane = document.getElementById(activeTab);
        if (activePane) {
          activePane.style.display = "none";
          // 强制重绘
          activePane.offsetHeight;
          activePane.style.display = "block";
        }
      }

      // 使用 requestAnimationFrame 确保在下一帧重绘
      requestAnimationFrame(() => {
        console.log("强制重绘完成");
      });
    }
  }
}

async function fetchAllData(supabase, tableName, batchSize = 1000) {
  const allData = [];
  let page = 0;

  // 计算近两个月的起始时间（ISO 格式）
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  const twoMonthsAgoISO = twoMonthsAgo.toISOString();

  console.log(`📥 开始读取表 ${tableName} 的近两个月数据（自 ${twoMonthsAgoISO} 起）...`);

  while (true) {
    const from = page * batchSize;
    const to = from + batchSize - 1;

    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      // ⚠️ 时间过滤条件：仅取 created_at >= 两个月前
      .gte("created_at", twoMonthsAgoISO)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) {
      console.error(`❌ 第 ${page + 1} 页查询出错:`, error.message);
      return { data: null, error };
    }

    if (!data || data.length === 0) {
      console.log(`✅ 数据读取完毕，共 ${allData.length} 条`);
      break;
    }

    console.log(`📦 第 ${page + 1} 页：${data.length} 条`);
    allData.push(...data);

    if (data.length < batchSize) {
      console.log(`✅ 已到最后一页，共 ${allData.length} 条`);
      break;
    }

    page++;
  }

  return { data: allData, error: null };
}

// 恢复页面状态
function restorePageState(scrollPosition, activeTab, itemDetailModal) {
  // 恢复滚动位置
  if (scrollPosition !== undefined) {
    setTimeout(() => {
      window.scrollTo(0, scrollPosition);
    }, 100);
  }

  // 恢复活动标签页
  if (activeTab) {
    const tabBtn = document.querySelector(`[data-tab="${activeTab}"]`);
    if (tabBtn) {
      // 移除所有活动状态
      document
        .querySelectorAll(".tab-btn")
        .forEach((btn) => btn.classList.remove("active"));
      document
        .querySelectorAll(".tab-pane")
        .forEach((pane) => pane.classList.remove("active"));

      // 添加当前活动状态
      tabBtn.classList.add("active");
      const targetPane = document.getElementById(activeTab);
      if (targetPane) {
        targetPane.classList.add("active");
      }
    }
  }

  // 恢复物品详情模态框（如果存在）
  if (itemDetailModal) {
    // 模态框状态会在updateUI中保持，这里不需要额外处理
    console.log("保持物品详情模态框状态");
  }
}
// 切换报错状态
async function toggleErrorStatus(index) {
  if (!errorData[index]) return;

  try {
    let parsedData;
    if (typeof errorData[index].data === "string") {
      parsedData = JSON.parse(errorData[index].data);
    } else {
      parsedData = errorData[index].data;
    }

    parsedData.isSolved = !parsedData.isSolved;

    // 更新数据库
    const { error } = await supabase
      .from(TABLE_NAME_ERROR)
      .update({ data: parsedData })
      .eq("id", errorData[index].id);

    if (error) {
      console.error("更新报错状态失败:", error);
      alert("更新失败: " + error.message);
      return;
    }

    // 保存当前页面状态
    const currentScrollPosition = window.scrollY;
    const currentActiveTab = document
      .querySelector(".tab-btn.active")
      ?.getAttribute("data-tab");

    // 更新本地数据
    errorData[index].data = parsedData;

    // 刷新显示
    updateErrorReport();

    updateCache(); // 更新缓存

    // 恢复页面状态
    restorePageState(currentScrollPosition, currentActiveTab, null);
  } catch (error) {
    console.error("切换报错状态失败:", error);
    alert("操作失败: " + error.message);
  }
}

async function updateCache() {
  // 保存当前页面状态
  const currentScrollPosition = window.scrollY;
  const currentActiveTab = document
    .querySelector(".tab-btn.active")
    ?.getAttribute("data-tab");

  // 更新缓存
  if (cacheEnabled) {
    const CACHE_KEY = "dashboard_data_cache";
    const cached = retrieveDataFromChunks(CACHE_KEY);
    if (cached) {
      try {
        let decrypted;
        // 尝试解密数据
        try {
          decrypted = await decryptData(cached, ENC_KEY_PASSPHRASE);
        } catch (decryptError) {
          // 如果解密失败，可能是未加密的数据
          decrypted = cached;
        }

        decrypted.errorData = errorData; // 更新缓存中的 errorData

        // 使用分块存储更新缓存
        try {
          const encrypted = await encryptData(decrypted, ENC_KEY_PASSPHRASE);
          const result = storeDataInChunks(encrypted, CACHE_KEY);
          if (result.success) {
            console.log(`✅ 缓存更新成功，使用 ${result.chunks} 个分块`);
            cacheFailureCount = 0; // 重置失败计数
          } else {
            console.warn("⚠️ 缓存更新失败:", result.error);
          }
        } catch (error) {
          console.warn("⚠️ 缓存加密失败，尝试直接分块存储:", error);
          const result = storeDataInChunks(decrypted, CACHE_KEY);
          if (result.success) {
            console.log(
              `✅ 缓存更新成功（未加密），使用 ${result.chunks} 个分块`
            );
            cacheFailureCount = 0; // 重置失败计数
          } else {
            console.warn("⚠️ 缓存更新失败:", result.error);
          }
        }
      } catch (error) {
        console.error("缓存更新失败:", error);
        cacheFailureCount++;
        if (shouldDisableCache()) {
          showMessage("缓存功能已禁用，将直接从服务器加载数据", "warning");
        }
      }
    }
    console.log("报错状态已保存到缓存");
  } else {
    console.log("⚠️ 缓存已禁用，跳过缓存更新");
  }

  // 恢复页面状态
  restorePageState(currentScrollPosition, currentActiveTab, null);
}

// 添加或编辑批注
async function addErrorNote(index) {
  if (!errorData[index]) return;

  try {
    let parsedData;
    if (typeof errorData[index].data === "string") {
      parsedData = JSON.parse(errorData[index].data);
    } else {
      parsedData = errorData[index].data;
    }

    const currentNote = parsedData.note || "";
    const newNote = prompt("请输入批注:", currentNote);

    if (newNote === null) return; // 用户取消

    parsedData.note = newNote;

    // 更新数据库
    const { error } = await supabase
      .from(TABLE_NAME_ERROR)
      .update({ data: parsedData })
      .eq("id", errorData[index].id);

    if (error) {
      console.error("更新批注失败:", error);
      alert("更新失败: " + error.message);
      return;
    }
    console.log("批注更新成功:", parsedData.note);

    // 保存当前页面状态
    const currentScrollPosition = window.scrollY;
    const currentActiveTab = document
      .querySelector(".tab-btn.active")
      ?.getAttribute("data-tab");

    // 更新本地数据
    errorData[index].data = parsedData;

    // 刷新显示
    updateErrorReport();
    updateCache(); // 更新缓存

    // 恢复页面状态
    restorePageState(currentScrollPosition, currentActiveTab, null);
  } catch (error) {
    console.error("添加批注失败:", error);
    alert("操作失败: " + error.message);
  }
}
// 更新UI
function updateUI() {
  console.log("=== 开始更新UI ===");

  try {
    // 显示主要内容
    const mainContent = document.querySelector(".main-content");
    if (mainContent) {
      mainContent.style.display = "block";
      mainContent.style.visibility = "visible";
    }

    // 更新统计信息
    updateStats();

    // 获取当前活动的标签页
    const activeTab = document
      .querySelector(".tab-btn.active")
      ?.getAttribute("data-tab");

    // 确保所有非活动标签页都被隐藏，活动标签页被显示
    document.querySelectorAll(".tab-pane").forEach((pane) => {
      if (pane.classList.contains("active")) {
        pane.style.display = "block";
      } else {
        pane.style.display = "none";
      }
    });

    // 只更新当前活动的标签页内容，避免不必要的渲染
    if (activeTab) {
      switch (activeTab) {
        case "overview":
          updateOverview();
          break;
        case "players":
          updatePlayerList();
          break;
        case "cards":
          updateCardAnalysis();
          break;
        case "time":
          updateTimeAnalysis();
          break;
        case "errors":
          updateErrorReport();
          break;
        default:
          // 如果没有活动标签页，更新概览
          updateOverview();
      }
    } else {
      // 如果没有活动标签页，更新概览
      updateOverview();
    }

    console.log("✅ UI更新完成");
  } catch (error) {
    console.error("❌ UI更新失败:", error);
  }
}

function updateErrorReport() {
  console.log("=== 更新报错报告 ===");

  const errorContent = document.getElementById("errors-content");
  if (!errorContent) {
    console.error("找不到 errors-content 元素");
    return;
  }

  if (!errorData || errorData.length === 0) {
    errorContent.innerHTML = '<div class="no-data">暂无报错数据</div>';
    return;
  }

  try {
    // 保存当前的筛选状态
    const currentStatusFilter =
      document.getElementById("errorStatusFilter")?.value || "all";
    const currentSortFilter =
      document.getElementById("errorSortFilter")?.value || "count";

    // 保存展开的错误组状态
    const expandedGroups = [];
    document
      .querySelectorAll(".error-group-details")
      .forEach((detail, index) => {
        if (detail.style.display !== "none") {
          const groupHeader = detail.previousElementSibling;
          const message = groupHeader?.querySelector(
            ".error-group-message"
          )?.textContent;
          if (message) {
            expandedGroups.push(message.trim());
          }
        }
      });

    let html = '<div class="error-report-container">';

    // 处理和分组错误数据
    const groupedErrors = groupErrorsByMessage(errorData);

    // 简单的统计信息
    const totalErrors = errorData.length;
    const uniqueErrors = Object.keys(groupedErrors).length;
    const solvedErrors = errorData.filter((error) => {
      try {
        let parsedData;
        if (typeof error.data === "string") {
          parsedData = JSON.parse(error.data);
        } else {
          parsedData = error.data;
        }
        return parsedData && parsedData.isSolved;
      } catch (e) {
        return false;
      }
    }).length;

    html += `
      <div class="error-stats">
        <h3>📊 报错统计</h3>
        <p>总数: ${totalErrors} | 独特错误: ${uniqueErrors} | 已解决: ${solvedErrors} | 未解决: ${
      totalErrors - solvedErrors
    }</p>
      </div>
    `;

    // 添加筛选控件，保持当前选择
    html += `
      <div class="error-filter">
        <label for="errorStatusFilter">筛选状态:</label>
        <select id="errorStatusFilter">
          <option value="all" ${
            currentStatusFilter === "all" ? "selected" : ""
          }>全部</option>
          <option value="solved" ${
            currentStatusFilter === "solved" ? "selected" : ""
          }>已解决</option>
          <option value="unsolved" ${
            currentStatusFilter === "unsolved" ? "selected" : ""
          }>未解决</option>
        </select>
        
        <label for="errorSortFilter">排序方式:</label>
        <select id="errorSortFilter">
          <option value="count" ${
            currentSortFilter === "count" ? "selected" : ""
          }>按出现次数</option>
          <option value="time" ${
            currentSortFilter === "time" ? "selected" : ""
          }>按最新时间</option>
        </select>
      </div>
    `;

    // 报错列表
    html += '<div class="error-list">';
    html += "<h3>🐛 报错列表 (按错误类型分组)</h3>";
    html += '<div id="error-items-container">';

    // 按出现次数排序分组后的错误
    const sortedGroups = Object.entries(groupedErrors).sort(
      (a, b) => b[1].count - a[1].count
    );

    sortedGroups.forEach(([message, group]) => {
      const { errors, count, latestTime, solvedCount } = group;
      const isAllSolved = solvedCount === count;
      const groupClass = isAllSolved
        ? "error-group-solved"
        : "error-group-unsolved";
      const statusText = isAllSolved
        ? "✅ 全部已解决"
        : `❌ ${count - solvedCount}/${count} 未解决`;

      // 检查这个组是否应该保持展开状态
      const shouldExpand = expandedGroups.some(
        (expandedMsg) =>
          expandedMsg.includes(message) || message.includes(expandedMsg)
      );

      html += `
        <div class="error-group ${groupClass}" data-status="${
        isAllSolved ? "solved" : "unsolved"
      }">
          <div class="error-group-header" onclick="toggleErrorGroup(this)">
            <div class="error-group-info">
              <span class="error-count-badge">${count}次</span>
              <span class="error-status">${statusText}</span>
              <span class="error-latest-time">最新: ${latestTime}</span>
              <span class="toggle-icon">${shouldExpand ? "▲" : "▼"}</span>
            </div>
            <div class="error-group-message">
              <strong>错误信息:</strong> ${escapeHtml(message)}
            </div>
          </div>
          
          <div class="error-group-details" style="display: ${
            shouldExpand ? "block" : "none"
          };">
            <div class="error-instances">
              <h4>具体实例 (${count}个):</h4>
      `;

      // 显示该错误类型的所有实例
      errors.forEach((error, instanceIndex) => {
        try {
          let parsedData;
          if (typeof error.data === "string") {
            parsedData = JSON.parse(error.data);
          } else {
            parsedData = error.data;
          }

          if (parsedData) {
            const isSolved = parsedData.isSolved || false;
            const stackTrace = parsedData.stackTrace || "无堆栈信息";
            const playerid = parsedData.playerid || "未知用户";
            const note = parsedData.note || "";
            const errorId = error.id || error.originalIndex;
            const timestamp = error.created_at
              ? new Date(error.created_at).toLocaleString("zh-CN")
              : "未知时间";

            const errorClass = isSolved ? "error-solved" : "error-unsolved";
            const instanceStatusText = isSolved ? "✅ 已解决" : "❌ 未解决";
            const dataStatus = isSolved ? "solved" : "unsolved";

            html += `
              <div class="error-instance ${errorClass}" data-status="${dataStatus}">
                <div class="error-instance-header">
                  <span class="error-status">${instanceStatusText}</span>
                  <span class="error-uploader">👤 ${escapeHtml(playerid)}</span>
                  <span class="error-time">${timestamp}</span>
                </div>
                
                <div class="error-stack">
                  <strong>堆栈跟踪:</strong>
                  <pre>${escapeHtml(stackTrace)}</pre>
                </div>
                
                ${
                  note
                    ? `
                  <div class="error-note">
                    <strong>批注:</strong>
                    <p>${escapeHtml(note)}</p>
                  </div>
                `
                    : ""
                }
                
                <div class="error-actions">
                  <button class="btn btn-sm toggle-status-btn" data-index="${
                    error.originalIndex
                  }">
                    ${isSolved ? "标记为未解决" : "标记为已解决"}
                  </button>
                  <button class="btn btn-sm btn-primary add-note-btn" data-index="${
                    error.originalIndex
                  }">
                    ${note ? "编辑批注" : "添加批注"}
                  </button>
                  <button class="btn btn-sm btn-danger delete-error-btn" data-index="${
                    error.originalIndex
                  }" data-error-id="${errorId}">
                    🗑️ 删除
                  </button>
                </div>
              </div>
            `;
          }
        } catch (e) {
          console.warn(`报错记录解析失败:`, e);
        }
      });

      html += `
            </div>
          </div>
        </div>
      `;
    });

    html += "</div>"; // 结束 error-items-container
    html += "</div>"; // 结束 error-list
    html += "</div>"; // 结束 error-report-container

    errorContent.innerHTML = html;

    // 绑定事件监听器
    bindErrorEvents();
    bindGroupEvents();

    console.log("✅ 报错报告更新完成");
  } catch (error) {
    console.error("报错报告更新失败:", error);
    errorContent.innerHTML = '<div class="error">报错数据加载失败</div>';
  }
}

// 根据错误消息分组错误
function groupErrorsByMessage(errorData) {
  const groups = {};

  errorData.forEach((error, originalIndex) => {
    try {
      let parsedData;
      if (typeof error.data === "string") {
        parsedData = JSON.parse(error.data);
      } else {
        parsedData = error.data;
      }

      if (parsedData) {
        const message = parsedData.message || "未知错误";
        const isSolved = parsedData.isSolved || false;
        const timestamp = error.created_at
          ? new Date(error.created_at)
          : new Date();

        // 添加原始索引以便后续操作
        error.originalIndex = originalIndex;

        if (!groups[message]) {
          groups[message] = {
            errors: [],
            count: 0,
            solvedCount: 0,
            latestTime: timestamp,
          };
        }

        groups[message].errors.push(error);
        groups[message].count++;

        if (isSolved) {
          groups[message].solvedCount++;
        }

        // 更新最新时间
        if (timestamp > groups[message].latestTime) {
          groups[message].latestTime = timestamp;
        }
      }
    } catch (e) {
      console.warn(`处理错误记录 ${originalIndex} 时失败:`, e);
    }
  });

  // 格式化时间显示
  Object.values(groups).forEach((group) => {
    group.latestTime = group.latestTime.toLocaleString("zh-CN");
  });

  return groups;
}

// 切换错误组的展开/收起状态
function toggleErrorGroup(header) {
  const details = header.nextElementSibling;
  const icon = header.querySelector(".toggle-icon");

  if (details.style.display === "none") {
    details.style.display = "block";
    icon.textContent = "▲";
  } else {
    details.style.display = "none";
    icon.textContent = "▼";
  }
}

// 绑定分组相关事件
function bindGroupEvents() {
  // 排序筛选事件
  const sortFilter = document.getElementById("errorSortFilter");
  if (sortFilter) {
    sortFilter.addEventListener("change", function () {
      // 保存当前页面状态
      const currentScrollPosition = window.scrollY;
      const currentActiveTab = document
        .querySelector(".tab-btn.active")
        ?.getAttribute("data-tab");

      updateErrorReport(); // 重新渲染以应用新的排序

      // 恢复页面状态
      restorePageState(currentScrollPosition, currentActiveTab, null);
    });
  }
}

// 删除错误报告的函数
async function deleteErrorReport(errorId, index) {
  if (!confirm("确定要删除这个错误报告吗？此操作不可撤销！")) {
    return;
  }

  try {
    console.log(`正在删除错误报告 ID: ${errorId}, Index: ${index}`);

    // 显示加载状态
    const deleteBtn = document.querySelector(
      `[data-index="${index}"].delete-error-btn`
    );
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.innerHTML = "删除中...";
    }

    // 获取要删除的错误记录的实际ID
    const actualErrorId = errorData[index]?.id;
    if (!actualErrorId) {
      throw new Error("找不到要删除的错误记录");
    }

    // 发送删除请求到 Supabase
    const { error } = await supabase
      .from(TABLE_NAME_ERROR)
      .delete()
      .eq("id", actualErrorId);

    if (error) {
      throw new Error(`删除失败: ${error.message}`);
    }

    // 保存当前页面状态
    const currentScrollPosition = window.scrollY;
    const currentActiveTab = document
      .querySelector(".tab-btn.active")
      ?.getAttribute("data-tab");

    // 从本地数据中移除该错误
    errorData.splice(index, 1);

    // 更新缓存
    await updateCache();

    // 重新渲染错误报告列表
    updateErrorReport();

    // 恢复页面状态
    restorePageState(currentScrollPosition, currentActiveTab, null);

    console.log("✅ 错误报告删除成功");

    // 显示成功消息
    showMessage("错误报告已删除", "success");
  } catch (error) {
    console.error("删除错误报告失败:", error);

    // 恢复按钮状态
    const deleteBtn = document.querySelector(
      `[data-index="${index}"].delete-error-btn`
    );
    if (deleteBtn) {
      deleteBtn.disabled = false;
      deleteBtn.innerHTML = "🗑️ 删除";
    }

    // 显示错误消息
    showMessage(`删除失败: ${error.message}`, "error");
  }
}

// 显示消息的辅助函数
function showMessage(message, type = "info") {
  // 创建消息元素
  const messageDiv = document.createElement("div");
  messageDiv.className = `message message-${type}`;
  messageDiv.textContent = message;

  // 添加样式
  messageDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: white;
    font-weight: bold;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;

  // 根据类型设置背景色
  switch (type) {
    case "success":
      messageDiv.style.backgroundColor = "#4CAF50";
      break;
    case "error":
      messageDiv.style.backgroundColor = "#f44336";
      break;
    case "warning":
      messageDiv.style.backgroundColor = "#ff9800";
      break;
    default:
      messageDiv.style.backgroundColor = "#2196F3";
  }

  // 添加到页面
  document.body.appendChild(messageDiv);

  // 3秒后自动移除
  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.style.animation = "slideOut 0.3s ease-in";
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.remove();
        }
      }, 300);
    }
  }, 3000);
}

// 修正后的 bindErrorEvents 函数
function bindErrorEvents() {
  const errorContent = document.getElementById("errors-content");
  if (!errorContent) return;

  // 先移除之前的事件监听器（如果存在）
  const oldHandler = errorContent._errorEventHandler;
  if (oldHandler) {
    errorContent.removeEventListener("click", oldHandler);
  }

  // 创建新的事件处理函数
  const newHandler = function (e) {
    const target = e.target;

    console.log("按钮被点击:", target.className); // 调试日志

    if (target.classList.contains("toggle-status-btn")) {
      e.preventDefault();
      e.stopPropagation();
      const index = parseInt(target.getAttribute("data-index"));
      console.log("切换状态，索引:", index); // 调试日志
      toggleErrorStatus(index);
    } else if (target.classList.contains("add-note-btn")) {
      e.preventDefault();
      e.stopPropagation();
      const index = parseInt(target.getAttribute("data-index"));
      console.log("添加批注，索引:", index); // 调试日志
      addErrorNote(index);
    } else if (target.classList.contains("delete-error-btn")) {
      e.preventDefault();
      e.stopPropagation();
      const index = parseInt(target.getAttribute("data-index"));
      const errorId = target.getAttribute("data-error-id");
      console.log("删除错误，索引:", index, "ID:", errorId); // 调试日志
      deleteErrorReport(errorId, index);
    }
  };

  // 绑定新的事件监听器
  errorContent.addEventListener("click", newHandler);

  // 保存引用以便下次移除
  errorContent._errorEventHandler = newHandler;

  // 绑定筛选事件
  const filterSelect = document.getElementById("errorStatusFilter");
  if (filterSelect) {
    // 移除旧的筛选事件监听器
    const oldFilterHandler = filterSelect._filterEventHandler;
    if (oldFilterHandler) {
      filterSelect.removeEventListener("change", oldFilterHandler);
    }

    // 绑定新的筛选事件监听器
    const newFilterHandler = function () {
      console.log("筛选器改变"); // 调试日志
      filterErrors();
    };

    filterSelect.addEventListener("change", newFilterHandler);
    filterSelect._filterEventHandler = newFilterHandler;
  }
}

// 筛选错误函数
function filterErrors() {
  const filterSelect = document.getElementById("errorStatusFilter");
  const filterValue = filterSelect.value;
  const errorItems = document.querySelectorAll(".error-item");

  let visibleCount = 0;

  errorItems.forEach((item) => {
    const status = item.getAttribute("data-status");
    let shouldShow = true;

    if (filterValue === "solved" && status !== "solved") {
      shouldShow = false;
    } else if (filterValue === "unsolved" && status !== "unsolved") {
      shouldShow = false;
    }

    if (shouldShow) {
      item.style.display = "block";
      visibleCount++;
    } else {
      item.style.display = "none";
    }
  });

  // 更新显示计数
  updateFilterCount(visibleCount, errorItems.length, filterValue);
}

// 更新筛选计数显示
function updateFilterCount(visibleCount, totalCount, filterType) {
  const errorList = document.querySelector(".error-list h3");
  if (errorList) {
    let filterText = "";
    switch (filterType) {
      case "solved":
        filterText = " (已解决)";
        break;
      case "unsolved":
        filterText = " (未解决)";
        break;
      default:
        filterText = "";
    }

    errorList.textContent = `🐛 报错列表${filterText} - 显示 ${visibleCount}/${totalCount} 条`;
  }
}

// HTML转义函数
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// 更新统计信息
function updateStats() {
  console.log("=== 更新统计信息 ===");

  if (!allData || allData.length === 0) {
    console.log("没有数据");
    return;
  }

  try {
    const totalRecords = allData.length;
    const uniquePlayers = new Set();

    // 统计唯一玩家
    allData.forEach((record) => {
      try {
        let parsedData;
        if (typeof record.data === "string") {
          parsedData = JSON.parse(record.data);
        } else {
          parsedData = record.data;
        }

        if (parsedData && parsedData.PlayerId) {
          uniquePlayers.add(parsedData.PlayerId);
        }
      } catch (e) {
        console.warn("数据解析失败:", e);
      }
    });

    // 获取最后更新时间
    let lastUpdate = "无数据";
    if (allData.length > 0 && allData[0].created_at) {
      try {
        lastUpdate = new Date(allData[0].created_at).toLocaleString("zh-CN");
      } catch (e) {
        lastUpdate = "时间格式错误";
      }
    }

    // 更新DOM
    const totalElement = document.getElementById("totalRecords");
    const playersElement = document.getElementById("activePlayers");
    const updateElement = document.getElementById("lastUpdate");

    if (totalElement) {
      totalElement.textContent = totalRecords.toLocaleString();
      console.log("✅ 总记录数已更新:", totalRecords);
    }

    if (playersElement) {
      playersElement.textContent = uniquePlayers.size.toLocaleString();
      console.log("✅ 活跃玩家数已更新:", uniquePlayers.size);
    }

    if (updateElement) {
      updateElement.textContent = lastUpdate;
      console.log("✅ 最后更新时间已更新:", lastUpdate);
    }
  } catch (error) {
    console.error("统计信息更新失败:", error);
  }
}

// 更新概览
function updateOverview() {
  console.log("=== 更新概览 ===");

  const overviewContent = document.getElementById("overview-content");
  if (!overviewContent) {
    console.error("找不到 overview-content 元素");
    return;
  }

  if (!allData || allData.length === 0) {
    overviewContent.innerHTML = '<div class="no-data">暂无数据</div>';
    return;
  }

  try {
    let html = '<div class="overview-container">';

    // 基本统计
    const uniquePlayers = new Set();
    let totalSelections = 0;
    const itemCounts = {};

    allData.forEach((record) => {
      try {
        let parsedData;
        if (typeof record.data === "string") {
          parsedData = JSON.parse(record.data);
        } else {
          parsedData = record.data;
        }

        if (parsedData) {
          if (parsedData.PlayerId) {
            uniquePlayers.add(parsedData.PlayerId);
          }

          // 统计各种选择
          ["Cards", "Relics", "Blessings", "HardTags"].forEach((category) => {
            if (parsedData[category] && parsedData[category].Select) {
              parsedData[category].Select.forEach((item) => {
                const itemId = item.Name || item;
                itemCounts[itemId] = (itemCounts[itemId] || 0) + 1;
                totalSelections++;
              });
            }
          });
        }
      } catch (e) {
        console.warn("数据解析失败:", e);
      }
    });

    // 热门物品
    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    html += `
      <div class="overview-cards">
        <div class="info-card">
          <h3>📊 数据概览</h3>
          <ul>
            <li>总记录数: <strong>${allData.length}</strong></li>
            <li>活跃玩家: <strong>${uniquePlayers.size}</strong></li>
            <li>总选择次数: <strong>${totalSelections}</strong></li>
            <li>不同物品种类: <strong>${
              Object.keys(itemCounts).length
            }</strong></li>
          </ul>
        </div>
    `;

    if (topItems.length > 0) {
      html += `
        <div class="info-card">
          <h3>🔥 热门选择</h3>
          <ul>
      `;
      topItems.forEach(([item, count]) => {
        const itemName = formatItemName(item);
        html += `<li>${itemName}: <strong>${count}次</strong></li>`;
      });
      html += "</ul></div>";
    }

    html += "</div>"; // 结束 overview-cards

    // 最近活动
    html += '<div class="recent-activity">';
    html += "<h3>📝 最近活动</h3>";
    html += '<div class="activity-list">';

    const recentRecords = allData.slice(0, 10);
    recentRecords.forEach((record) => {
      try {
        const time = new Date(record.created_at).toLocaleString("zh-CN");
        let parsedData;
        if (typeof record.data === "string") {
          parsedData = JSON.parse(record.data);
        } else {
          parsedData = record.data;
        }

        const playerId = parsedData?.PlayerId || "未知玩家";
        html += `
          <div class="activity-item">
            <div class="activity-time">${time}</div>
            <div class="activity-desc">玩家 <strong>${playerId}</strong> 完成了一次游戏</div>
          </div>
        `;
      } catch (e) {
        console.warn("活动记录解析失败:", e);
      }
    });

    html += "</div></div>"; // 结束 recent-activity
    html += "</div>"; // 结束 overview-container

    overviewContent.innerHTML = html;
    console.log("✅ 概览更新完成");
  } catch (error) {
    console.error("概览更新失败:", error);
    overviewContent.innerHTML = '<div class="error">概览数据加载失败</div>';
  }
}

// 更新玩家列表
function updatePlayerList() {
  console.log("=== 更新玩家列表 ===");

  const playerContent = document.getElementById("players-content");
  if (!playerContent) {
    console.error("找不到 players-content 元素");
    return;
  }

  if (!allData || allData.length === 0) {
    playerContent.innerHTML = '<div class="no-data">暂无玩家数据</div>';
    return;
  }

  try {
    const playerStats = {};

    allData.forEach((record) => {
      try {
        let parsedData;
        if (typeof record.data === "string") {
          parsedData = JSON.parse(record.data);
        } else {
          parsedData = record.data;
        }

        if (parsedData && parsedData.PlayerId) {
          const playerId = parsedData.PlayerId;
          if (!playerStats[playerId]) {
            playerStats[playerId] = {
              count: 0,
              lastSeen: record.created_at,
            };
          }
          playerStats[playerId].count++;

          if (
            new Date(record.created_at) >
            new Date(playerStats[playerId].lastSeen)
          ) {
            playerStats[playerId].lastSeen = record.created_at;
          }
        }
      } catch (e) {
        console.warn("玩家数据解析失败:", e);
      }
    });

    let html = '<div class="player-list-container">';
    html += "<h3>👥 玩家统计</h3>";

    if (Object.keys(playerStats).length === 0) {
      html += '<div class="no-data">没有找到有效的玩家数据</div>';
    } else {
      html += '<div class="table-container">';
      html += '<table class="player-table">';
      html +=
        "<thead><tr><th>玩家ID</th><th>游戏次数</th><th>最后活动</th></tr></thead>";
      html += "<tbody>";

      Object.entries(playerStats)
        .sort((a, b) => b[1].count - a[1].count)
        .forEach(([playerId, stats]) => {
          const lastSeen = new Date(stats.lastSeen).toLocaleString("zh-CN");
          html += `
            <tr>
              <td><strong>${playerId}</strong></td>
              <td>${stats.count}</td>
              <td>${lastSeen}</td>
            </tr>
          `;
        });

      html += "</tbody></table>";
      html += "</div>";
    }

    html += "</div>";
    playerContent.innerHTML = html;
    console.log("✅ 玩家列表更新完成");
  } catch (error) {
    console.error("玩家列表更新失败:", error);
    playerContent.innerHTML = '<div class="error">玩家数据加载失败</div>';
  }
}

// 更新卡牌分析函数 - 支持多种物品类型
function updateCardAnalysis() {
  console.log("=== 更新物品分析 ===");

  const cardContent = document.getElementById("cards-content");
  if (!cardContent) {
    console.error("找不到 cards-content 元素");
    return;
  }

  if (!allData || allData.length === 0) {
    cardContent.innerHTML = '<div class="no-data">暂无数据</div>';
    return;
  }

  try {
    // 保存当前的筛选状态
    const currentItemType =
      document.getElementById("itemTypeSelect")?.value || "cards";
    const currentAnalysisType =
      document.getElementById("analysisTypeSelect")?.value || "select";
    const currentMinCount =
      document.getElementById("minCountInput")?.value || "3";
    const currentSortOrder =
      document.getElementById("sortOrderSelect")?.value || "desc";

    // 统计所有物品类型的数据
    const itemStats = {
      cards: { show: {}, select: {}, buy: {} },
      relics: { show: {}, select: {}, buy: {} },
      blessings: { show: {}, select: {}, buy: {} },
      hardTags: { show: {}, select: {}, buy: {} },
    };

    // 处理数据
    allData.forEach((record, index) => {
      try {
        let parsedData;
        if (typeof record.data === "string") {
          parsedData = JSON.parse(record.data);
        } else {
          parsedData = record.data;
        }

        if (parsedData) {
          // 处理卡牌数据
          if (parsedData.Cards) {
            processItemData(parsedData.Cards, itemStats.cards, "Cards");
          }

          // 处理遗物数据
          if (parsedData.Relics) {
            processItemData(parsedData.Relics, itemStats.relics, "Relics");
          }

          // 处理祝福数据
          if (parsedData.Blessings) {
            processItemData(
              parsedData.Blessings,
              itemStats.blessings,
              "Blessings"
            );
          }
          if (parsedData.HardTags) {
            processItemData(
              parsedData.HardTags,
              itemStats.hardTags,
              "HardTags"
            );
          }
        }
      } catch (e) {
        console.warn(`记录 ${index} 数据解析失败:`, e);
      }
    });

    // 生成完整的分析界面，保持当前筛选状态
    const html = generateAnalysisHTML(itemStats, {
      itemType: currentItemType,
      analysisType: currentAnalysisType,
      minCount: currentMinCount,
      sortOrder: currentSortOrder,
    });
    cardContent.innerHTML = html;

    // 绑定筛选事件
    bindAnalysisEvents(itemStats);

    // 恢复筛选状态
    restoreAnalysisFilters(
      currentItemType,
      currentAnalysisType,
      currentMinCount,
      currentSortOrder
    );

    console.log("✅ 物品分析更新完成");
  } catch (error) {
    console.error("物品分析更新失败:", error);
    cardContent.innerHTML =
      '<div class="error">数据加载失败: ' + error.message + "</div>";
  }
}

// 处理单个物品类型的数据
function processItemData(itemData, stats, itemType) {
  if (Array.isArray(itemData)) {
    // 如果是数组格式，直接统计为选择
    itemData.forEach((item) => {
      const itemId = typeof item === "object" ? item.Name || item : item;
      if (itemId) {
        stats.select[itemId] = (stats.select[itemId] || 0) + 1;
      }
    });
  } else if (typeof itemData === "object") {
    // 如果是对象格式，分别处理不同类型

    // 处理展示数据
    ["RewardShow", "ShopShow", "Show"].forEach((showType) => {
      if (itemData[showType] && Array.isArray(itemData[showType])) {
        itemData[showType].forEach((item) => {
          const itemId = typeof item === "object" ? item.Name || item : item;
          if (itemId) {
            stats.show[itemId] = (stats.show[itemId] || 0) + 1;
          }
        });
      }
    });

    // 处理选择数据
    ["Select", "Selected", "Picked"].forEach((selectType) => {
      if (itemData[selectType] && Array.isArray(itemData[selectType])) {
        itemData[selectType].forEach((item) => {
          const itemId = typeof item === "object" ? item.Name || item : item;
          if (itemId) {
            stats.select[itemId] = (stats.select[itemId] || 0) + 1;
          }
        });
      }
    });

    // 处理购买数据
    ["Buy", "Bought", "Purchased"].forEach((buyType) => {
      if (itemData[buyType] && Array.isArray(itemData[buyType])) {
        itemData[buyType].forEach((item) => {
          const itemId = typeof item === "object" ? item.Name || item : item;
          if (itemId) {
            stats.buy[itemId] = (stats.buy[itemId] || 0) + 1;
          }
        });
      }
    });
  }
}

// 生成分析界面HTML
function generateAnalysisHTML(itemStats, currentFilters = {}) {
  const {
    itemType = "cards",
    analysisType = "select",
    minCount = "3",
    sortOrder = "desc",
  } = currentFilters;

  let html = `
    <div class="analysis-container">
      <!-- 筛选控制面板 -->
      <div class="analysis-controls">
        <div class="control-group">
          <label for="itemTypeSelect">物品类型:</label>
          <select id="itemTypeSelect" class="form-select">
            <option value="cards" ${
              itemType === "cards" ? "selected" : ""
            }>🃏 卡牌</option>
            <option value="relics" ${
              itemType === "relics" ? "selected" : ""
            }>🏺 遗物</option>
            <option value="blessings" ${
              itemType === "blessings" ? "selected" : ""
            }>✨ 祝福</option>
            <option value="hardTags" ${
              itemType === "hardTags" ? "selected" : ""
            }>🛠️ 难度标签</option>
          </select>
        </div>
        
        <div class="control-group">
          <label for="analysisTypeSelect">分析类型:</label>
          <select id="analysisTypeSelect" class="form-select">
            <option value="select" ${
              analysisType === "select" ? "selected" : ""
            }>选择率分析</option>
            <option value="buy" ${
              analysisType === "buy" ? "selected" : ""
            }>购买率分析</option>
            <option value="popularity" ${
              analysisType === "popularity" ? "selected" : ""
            }>热门度分析</option>
          </select>
        </div>
        
        <div class="control-group">
          <label for="minCountInput">最小出现次数:</label>
          <input type="number" id="minCountInput" class="form-input" value="${minCount}" min="1" max="100">
        </div>
        
        <div class="control-group">
          <label for="sortOrderSelect">排序方式:</label>
          <select id="sortOrderSelect" class="form-select">
            <option value="desc" ${
              sortOrder === "desc" ? "selected" : ""
            }>从高到低</option>
            <option value="asc" ${
              sortOrder === "asc" ? "selected" : ""
            }>从低到高</option>
          </select>
        </div>
        
        <button id="applyAnalysisBtn" class="btn btn-primary">🔍 应用筛选</button>
        <button id="exportAnalysisBtn" class="btn btn-success">📊 导出分析</button>
      </div>
      
      <!-- 分析结果展示区域 -->
      <div class="analysis-results">
        <div class="results-header">
          <h3 id="resultsTitle">🃏 卡牌选择率分析</h3>
          <div class="results-stats">
            <span id="resultsCount">共 0 项</span>
            <span id="resultsRange">显示前 20 项</span>
          </div>
        </div>
        
        <div id="analysisChart" class="analysis-chart">
          <!-- 图表区域 -->
        </div>
        
        <div id="analysisTable" class="analysis-table">
          <!-- 表格区域 -->
        </div>
      </div>
      
      <!-- 详细统计信息 -->
      <div class="analysis-summary">
        <div class="summary-cards">
          <div class="summary-card">
            <h4>📊 统计概览</h4>
            <div id="summaryStats"></div>
          </div>
          
          <div class="summary-card">
            <h4>🔥 热门物品</h4>
            <div id="topItems"></div>
          </div>
          
          <div class="summary-card">
            <h4>📈 趋势分析</h4>
            <div id="trendAnalysis"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  return html;
}

// 恢复分析筛选状态
function restoreAnalysisFilters(itemType, analysisType, minCount, sortOrder) {
  const itemTypeSelect = document.getElementById("itemTypeSelect");
  const analysisTypeSelect = document.getElementById("analysisTypeSelect");
  const minCountInput = document.getElementById("minCountInput");
  const sortOrderSelect = document.getElementById("sortOrderSelect");

  if (itemTypeSelect) itemTypeSelect.value = itemType;
  if (analysisTypeSelect) analysisTypeSelect.value = analysisType;
  if (minCountInput) minCountInput.value = minCount;
  if (sortOrderSelect) sortOrderSelect.value = sortOrder;
}

// 绑定分析事件
function bindAnalysisEvents(itemStats) {
  const itemTypeSelect = document.getElementById("itemTypeSelect");
  const analysisTypeSelect = document.getElementById("analysisTypeSelect");
  const minCountInput = document.getElementById("minCountInput");
  const sortOrderSelect = document.getElementById("sortOrderSelect");
  const applyBtn = document.getElementById("applyAnalysisBtn");
  const exportBtn = document.getElementById("exportAnalysisBtn");

  // 应用筛选
  function applyAnalysis() {
    const itemType = itemTypeSelect.value;
    const analysisType = analysisTypeSelect.value;
    const minCount = parseInt(minCountInput.value) || 1;
    const sortOrder = sortOrderSelect.value;

    const results = calculateAnalysisResults(
      itemStats[itemType],
      analysisType,
      minCount,
      sortOrder
    );
    displayAnalysisResults(results, itemType, analysisType);
    updateSummaryStats(itemStats[itemType], itemType);
  }

  // 绑定事件
  if (applyBtn) {
    applyBtn.addEventListener("click", applyAnalysis);
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", () => exportAnalysisResults(itemStats));
  }

  // 自动触发初始分析
  setTimeout(applyAnalysis, 100);
}

// 计算分析结果
function calculateAnalysisResults(stats, analysisType, minCount, sortOrder) {
  const results = [];

  if (analysisType === "select") {
    // 选择率分析
    Object.keys(stats.show).forEach((itemId) => {
      const showCount = stats.show[itemId];
      const selectCount = stats.select[itemId] || 0;

      if (showCount >= minCount) {
        const rate = showCount > 0 ? (selectCount / showCount) * 100 : 0;
        results.push({
          id: itemId,
          name: formatItemName(itemId),
          rate: rate,
          count: selectCount,
          total: showCount,
          type: "select",
        });
      }
    });

    // 如果没有show数据，使用select数据
    if (results.length === 0) {
      Object.keys(stats.select).forEach((itemId) => {
        const selectCount = stats.select[itemId];
        if (selectCount >= minCount) {
          results.push({
            id: itemId,
            name: formatItemName(itemId),
            rate: 100,
            count: selectCount,
            total: selectCount,
            type: "select",
          });
        }
      });
    }
  } else if (analysisType === "buy") {
    // 购买率分析
    Object.keys(stats.show).forEach((itemId) => {
      const showCount = stats.show[itemId];
      const buyCount = stats.buy[itemId] || 0;

      if (showCount >= minCount) {
        const rate = showCount > 0 ? (buyCount / showCount) * 100 : 0;
        results.push({
          id: itemId,
          name: formatItemName(itemId),
          rate: rate,
          count: buyCount,
          total: showCount,
          type: "buy",
        });
      }
    });

    // 如果没有show数据，使用buy数据
    if (results.length === 0) {
      Object.keys(stats.buy).forEach((itemId) => {
        const buyCount = stats.buy[itemId];
        if (buyCount >= minCount) {
          results.push({
            id: itemId,
            name: formatItemName(itemId),
            rate: 100,
            count: buyCount,
            total: buyCount,
            type: "buy",
          });
        }
      });
    }
  } else if (analysisType === "popularity") {
    // 热门度分析（基于总出现次数）
    const allItems = new Set([
      ...Object.keys(stats.show),
      ...Object.keys(stats.select),
      ...Object.keys(stats.buy),
    ]);

    allItems.forEach((itemId) => {
      const showCount = stats.show[itemId] || 0;
      const selectCount = stats.select[itemId] || 0;
      const buyCount = stats.buy[itemId] || 0;
      const totalCount = showCount + selectCount + buyCount;

      if (totalCount >= minCount) {
        results.push({
          id: itemId,
          name: formatItemName(itemId),
          rate: totalCount,
          count: selectCount + buyCount,
          total: totalCount,
          type: "popularity",
        });
      }
    });
  }

  // 排序
  results.sort((a, b) => {
    return sortOrder === "desc" ? b.rate - a.rate : a.rate - b.rate;
  });

  return results;
}

// 显示分析结果
function displayAnalysisResults(results, itemType, analysisType) {
  const resultsTitle = document.getElementById("resultsTitle");
  const resultsCount = document.getElementById("resultsCount");
  const resultsRange = document.getElementById("resultsRange");
  const analysisChart = document.getElementById("analysisChart");
  const analysisTable = document.getElementById("analysisTable");

  // 更新标题和统计
  const typeNames = {
    cards: "🃏 卡牌",
    relics: "🏺 遗物",
    blessings: "✨ 祝福",
    hardTags: "🛠️ 难度标签",
  };

  const analysisNames = {
    select: "选择率",
    buy: "购买率",
    popularity: "热门度",
  };

  if (resultsTitle) {
    resultsTitle.textContent = `${typeNames[itemType]} ${analysisNames[analysisType]}分析`;
  }

  if (resultsCount) {
    resultsCount.textContent = `共 ${results.length} 项`;
  }

  if (resultsRange) {
    const displayCount = results.length;
    resultsRange.textContent = `显示前 ${displayCount} 项`;
  }

  // 生成图表
  if (analysisChart) {
    analysisChart.innerHTML = generateChart(results.slice(0, 10), analysisType);
  }

  // 生成表格
  if (analysisTable) {
    analysisTable.innerHTML = generateTable(
      results.slice(0, results.length),
      analysisType
    );
  }
}

// 生成图表HTML
function generateChart(data, analysisType) {
  if (data.length === 0) {
    return '<div class="no-data">没有数据可显示</div>';
  }

  const maxValue = Math.max(...data.map((item) => item.rate));
  const unit = analysisType === "popularity" ? "次" : "%";

  let html = '<div class="chart-container">';

  data.forEach((item, index) => {
    const percentage = maxValue > 0 ? (item.rate / maxValue) * 100 : 0;
    const color = getChartColor(index);

    html += `
      <div class="chart-item" title="${item.name}: ${item.rate.toFixed(
      1
    )}${unit} (${item.count}/${item.total})">
        <div class="chart-bar">
          <div class="chart-bar-fill" style="width: ${percentage}%; background: ${color}"></div>
        </div>
        <div class="chart-label">
          <span class="chart-name">${item.name}</span>
          <span class="chart-value">${item.rate.toFixed(1)}${unit}</span>
        </div>
      </div>
    `;
  });

  html += "</div>";
  return html;
}

// 在generateTable函数中为物品名称添加点击事件
function generateTable(data, analysisType) {
  if (data.length === 0) {
    return '<div class="no-data">没有数据可显示</div>';
  }

  const unit = analysisType === "popularity" ? "次" : "%";
  const headers = {
    select: ["排名", "物品名称", "选择率", "选择次数", "出现次数"],
    buy: ["排名", "物品名称", "购买率", "购买次数", "出现次数"],
    popularity: ["排名", "物品名称", "热门度", "互动次数", "总出现次数"],
  };

  let html = `
    <div class="table-container">
      <table class="analysis-table-grid">
        <thead>
          <tr>
  `;

  headers[analysisType].forEach((header) => {
    html += `<th>${header}</th>`;
  });

  html += `
          </tr>
        </thead>
        <tbody>
  `;

  data.forEach((item, index) => {
    const rankClass = index < 3 ? `rank-${index + 1}` : "";
    html += `
      <tr class="${rankClass}">
        <td class="rank-cell">
          <span class="rank-number">#${index + 1}</span>
          ${index < 3 ? '<span class="rank-medal">🏆</span>' : ""}
        </td>
        <td class="name-cell">
          <span class="item-name clickable-item" data-item-id="${
            item.id
          }" data-item-name="${item.name}">
            ${item.name} 🔍
          </span>
          <span class="item-id">${item.id}</span>
        </td>
        <td class="rate-cell">
          <span class="rate-value">${item.rate.toFixed(1)}${unit}</span>
          <div class="rate-bar">
            <div class="rate-bar-fill" style="width: ${Math.min(
              item.rate,
              100
            )}%"></div>
          </div>
        </td>
        <td class="count-cell">${item.count}</td>
        <td class="total-cell">${item.total}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  // 绑定点击事件
  setTimeout(() => {
    document.querySelectorAll(".clickable-item").forEach((item) => {
      item.addEventListener("click", function () {
        const itemId = this.getAttribute("data-item-id");
        const itemName = this.getAttribute("data-item-name");
        showItemDetail(itemId, itemName);
      });
    });
  }, 100);

  return html;
}

// 显示物品详情
function showItemDetail(itemId, itemName) {
  console.log(`显示物品详情: ${itemName} (${itemId})`);

  // 创建模态框
  const modal = createItemDetailModal(itemId, itemName);
  document.body.appendChild(modal);

  // 显示模态框
  setTimeout(() => {
    modal.classList.add("show");
  }, 10);

  // 加载详情数据
  loadItemDetailData(itemId, itemName);
}

// 创建物品详情模态框
function createItemDetailModal(itemId, itemName) {
  const modal = document.createElement("div");
  modal.className = "item-detail-modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h2 class="modal-title">
          <span class="item-icon">🎯</span>
          ${itemName} 详细分析
        </h2>
        <button class="modal-close" onclick="closeItemDetail()">&times;</button>
      </div>
      
      <div class="modal-body">
        <div class="item-detail-loading">
          <div class="loading-spinner"></div>
          <span>正在分析物品数据...</span>
        </div>
        
        <div class="item-detail-content" style="display: none;">
          <!-- 基本信息 -->
          <div class="detail-section">
            <h3>📊 基本信息</h3>
            <div class="detail-info-grid" id="itemBasicInfo">
              <!-- 基本信息将在这里填充 -->
            </div>
          </div>
          
          <!-- 层数分析 -->
          <div class="detail-section">
            <h3>🏗️ 层数分析 (1-30层)</h3>
            <div class="layer-analysis-controls">
              <div class="control-group">
                <label for="layerAnalysisType">分析类型:</label>
                <select id="layerAnalysisType" class="form-select">
                  <option value="show">出现次数</option>
                  <option value="select">选择次数</option>
                  <option value="buy">购买次数</option>
                  <option value="rate">选择率</option>
                </select>
              </div>
              <button id="updateLayerChart" class="btn btn-primary">🔄 更新图表</button>
            </div>
            <div class="layer-chart-container" id="layerChart">
              <!-- 层数图表将在这里显示 -->
            </div>
          </div>
          
          <!-- 详细统计 -->
          <div class="detail-section">
            <h3>📈 详细统计</h3>
            <div class="detail-stats-grid" id="itemDetailStats">
              <!-- 详细统计将在这里填充 -->
            </div>
          </div>
      
      <div class="modal-footer">
        <button class="btn btn-success" onclick="exportItemDetail('${itemId}', '${itemName}')">
          📊 导出详情
        </button>
        <button class="btn btn-secondary" onclick="closeItemDetail()">
          关闭
        </button>
      </div>
    </div>
  `;

  return modal;
}

// 加载物品详情数据
// 简化加载物品详情数据函数
function loadItemDetailData(itemId, itemName) {
  try {
    console.log(`开始分析物品: ${itemId}`);

    // 初始化层数数据 (1-30层)
    const layerData = {};
    for (let i = 1; i <= 30; i++) {
      layerData[i] = {
        show: 0,
        select: 0,
        buy: 0,
        total: 0,
      };
    }

    let totalShow = 0,
      totalSelect = 0,
      totalBuy = 0;
    let firstSeen = null,
      lastSeen = null;

    // 分析所有数据
    allData.forEach((record, index) => {
      try {
        let parsedData;
        if (typeof record.data === "string") {
          parsedData = JSON.parse(record.data);
        } else {
          parsedData = record.data;
        }

        if (parsedData) {
          // 检查是否包含目标物品
          let foundInShow = false,
            foundInSelect = false,
            foundInBuy = false;
          let currentLayer = 1; // 默认层数

          // 检查各种数据结构
          ["Cards", "Relics", "Blessings", "HardTags"].forEach((itemType) => {
            if (parsedData[itemType]) {
              const itemData = parsedData[itemType];

              // 检查展示数据
              ["RewardShow", "ShopShow", "Show"].forEach((showType) => {
                if (itemData[showType] && Array.isArray(itemData[showType])) {
                  itemData[showType].forEach((item) => {
                    const currentItemId =
                      typeof item === "object" ? item.Name || item : item;
                    if (currentItemId === itemId) {
                      // 获取层数信息 - 从底层物品中获取
                      if (typeof item === "object") {
                        currentLayer =
                          item.Level || item.level || item.floor || 1;
                      }
                      foundInShow = true;
                    }
                  });
                }
              });

              // 检查选择数据
              ["Select", "Selected", "Picked"].forEach((selectType) => {
                if (
                  itemData[selectType] &&
                  Array.isArray(itemData[selectType])
                ) {
                  itemData[selectType].forEach((item) => {
                    const currentItemId =
                      typeof item === "object" ? item.Name || item : item;
                    if (currentItemId === itemId) {
                      // 获取层数信息 - 从底层物品中获取
                      if (typeof item === "object") {
                        currentLayer =
                          item.Level || item.level || item.floor || 1;
                      }
                      foundInSelect = true;
                    }
                  });
                }
              });

              // 检查购买数据
              ["Buy", "Bought", "Purchased"].forEach((buyType) => {
                if (itemData[buyType] && Array.isArray(itemData[buyType])) {
                  itemData[buyType].forEach((item) => {
                    const currentItemId =
                      typeof item === "object" ? item.Name || item : item;
                    if (currentItemId === itemId) {
                      // 获取层数信息 - 从底层物品中获取
                      if (typeof item === "object") {
                        currentLayer =
                          item.Level || item.level || item.floor || 1;
                      }
                      foundInBuy = true;
                    }
                  });
                }
              });

              // 如果是数组格式，检查是否包含目标物品
              if (Array.isArray(itemData)) {
                itemData.forEach((item) => {
                  const currentItemId =
                    typeof item === "object" ? item.Name || item : item;
                  if (currentItemId === itemId) {
                    // 获取层数信息 - 从底层物品中获取
                    if (typeof item === "object") {
                      currentLayer =
                        item.Level || item.level || item.floor || 1;
                    }
                    foundInSelect = true;
                  }
                });
              }
            }
          });

          // 如果找到了目标物品，更新对应层数的统计
          if (foundInShow || foundInSelect || foundInBuy) {
            const normalizedLayer = Math.min(
              Math.max(parseInt(currentLayer), 1),
              30
            );

            if (foundInShow) {
              layerData[normalizedLayer].show++;
              totalShow++;
            }
            if (foundInSelect) {
              layerData[normalizedLayer].select++;
              totalSelect++;
            }
            if (foundInBuy) {
              layerData[normalizedLayer].buy++;
              totalBuy++;
            }

            layerData[normalizedLayer].total++;

            // 更新首次和最后出现时间
            const recordTime = new Date(
              record.created_at || record.timestamp || Date.now()
            );
            if (!firstSeen || recordTime < firstSeen) {
              firstSeen = recordTime;
            }
            if (!lastSeen || recordTime > lastSeen) {
              lastSeen = recordTime;
            }
          }
        }
      } catch (e) {
        console.warn(`记录 ${index} 处理失败:`, e);
      }
    });

    console.log(`物品 ${itemId} 分析完成:`, {
      totalShow,
      totalSelect,
      totalBuy,
      layerData: Object.keys(layerData).filter(
        (layer) => layerData[layer].total > 0
      ),
    });

    // 显示详情内容
    displayItemDetail({
      itemId,
      itemName,
      layerData,
      totalShow,
      totalSelect,
      totalBuy,
      firstSeen,
      lastSeen,
    });
  } catch (error) {
    console.error("物品详情加载失败:", error);
    showItemDetailError(error.message);
  }
}

// 显示物品详情
// 显示物品详情 - 删除相关物品部分
function displayItemDetail(data) {
  const loadingEl = document.querySelector(".item-detail-loading");
  const contentEl = document.querySelector(".item-detail-content");

  if (loadingEl) loadingEl.style.display = "none";
  if (contentEl) contentEl.style.display = "block";

  console.log("找到的元素:", {
    loadingEl,
    contentEl,
    loadingElExists: !!loadingEl,
    contentElExists: !!contentEl,
  });
  // 填充基本信息
  const basicInfoEl = document.getElementById("itemBasicInfo");
  if (basicInfoEl) {
    const selectRate =
      data.totalShow > 0
        ? ((data.totalSelect / data.totalShow) * 100).toFixed(1)
        : "N/A";
    const buyRate =
      data.totalShow > 0
        ? ((data.totalBuy / data.totalShow) * 100).toFixed(1)
        : "N/A";

    basicInfoEl.innerHTML = `
      <div class="info-item">
        <span class="info-label">物品ID:</span>
        <span class="info-value">${data.itemId}</span>
      </div>
      <div class="info-item">
        <span class="info-label">总出现次数:</span>
        <span class="info-value">${data.totalShow}</span>
      </div>
      <div class="info-item">
        <span class="info-label">总选择次数:</span>
        <span class="info-value">${data.totalSelect}</span>
      </div>
      <div class="info-item">
        <span class="info-label">总购买次数:</span>
        <span class="info-value">${data.totalBuy}</span>
      </div>
      <div class="info-item">
        <span class="info-label">选择率:</span>
        <span class="info-value">${selectRate}%</span>
      </div>
      <div class="info-item">
        <span class="info-label">购买率:</span>
        <span class="info-value">${buyRate}%</span>
      </div>
      <div class="info-item">
        <span class="info-label">首次出现:</span>
        <span class="info-value">${
          data.firstSeen ? data.firstSeen.toLocaleString() : "N/A"
        }</span>
      </div>
      <div class="info-item">
        <span class="info-label">最后出现:</span>
        <span class="info-value">${
          data.lastSeen ? data.lastSeen.toLocaleString() : "N/A"
        }</span>
      </div>
    `;
  }

  // 生成层数图表
  generateLayerChart(data.layerData, "show");

  // 绑定图表更新事件
  const updateBtn = document.getElementById("updateLayerChart");
  const typeSelect = document.getElementById("layerAnalysisType");

  if (updateBtn && typeSelect) {
    updateBtn.addEventListener("click", () => {
      const analysisType = typeSelect.value;
      generateLayerChart(data.layerData, analysisType);
    });
  }

  // 填充详细统计
  const detailStatsEl = document.getElementById("itemDetailStats");
  if (detailStatsEl) {
    const layerStats = calculateLayerStats(data.layerData);
    detailStatsEl.innerHTML = `
      <div class="stat-card">
        <h4>🎯 最佳表现层数</h4>
        <div class="stat-content">
          <div class="stat-row">
            <span>最高选择率:</span>
            <span class="stat-highlight">第${layerStats.bestSelectLayer}层 (${
      layerStats.bestSelectRate
    }%)</span>
          </div>
          <div class="stat-row">
            <span>最高出现频率:</span>
            <span class="stat-highlight">第${layerStats.mostFrequentLayer}层 (${
      layerStats.mostFrequentCount
    }次)</span>
          </div>
        </div>
      </div>
      
      <div class="stat-card">
        <h4>📊 层数分布</h4>
        <div class="stat-content">
          <div class="stat-row">
            <span>出现层数范围:</span>
            <span class="stat-highlight">${layerStats.minLayer} - ${
      layerStats.maxLayer
    }层</span>
          </div>
          <div class="stat-row">
            <span>活跃层数:</span>
            <span class="stat-highlight">${layerStats.activeLayers}层</span>
          </div>
          <div class="stat-row">
            <span>平均每层出现:</span>
            <span class="stat-highlight">${layerStats.avgPerLayer.toFixed(
              1
            )}次</span>
          </div>
        </div>
      </div>
      
      <div class="stat-card">
        <h4>📈 趋势分析</h4>
        <div class="stat-content">
          <div class="stat-row">
            <span>前期表现 (1-10层):</span>
            <span class="stat-highlight ${
              layerStats.earlyTrend > 0 ? "trend-up" : "trend-down"
            }">
              ${layerStats.earlyPerformance}% ${
      layerStats.earlyTrend > 0 ? "↗️" : "↘️"
    }
            </span>
          </div>
          <div class="stat-row">
            <span>中期表现 (11-20层):</span>
            <span class="stat-highlight ${
              layerStats.midTrend > 0 ? "trend-up" : "trend-down"
            }">
              ${layerStats.midPerformance}% ${
      layerStats.midTrend > 0 ? "↗️" : "↘️"
    }
            </span>
          </div>
          <div class="stat-row">
            <span>后期表现 (21-30层):</span>
            <span class="stat-highlight ${
              layerStats.lateTrend > 0 ? "trend-up" : "trend-down"
            }">
              ${layerStats.latePerformance}% ${
      layerStats.lateTrend > 0 ? "↗️" : "↘️"
    }
            </span>
          </div>
        </div>
      </div>
    `;
  }
}

// 生成层数图表
function generateLayerChart(layerData, analysisType) {
  const chartEl = document.getElementById("layerChart");
  if (!chartEl) return;

  const maxValue = Math.max(
    ...Object.keys(layerData).map((layer) => {
      if (analysisType === "rate") {
        const show = layerData[layer].show;
        const select = layerData[layer].select;
        return show > 0 ? (select / show) * 100 : 0;
      }
      return layerData[layer][analysisType] || 0;
    })
  );

  const unit = analysisType === "rate" ? "%" : "次";
  const title = {
    show: "出现次数",
    select: "选择次数",
    buy: "购买次数",
    rate: "选择率",
  }[analysisType];

  let chartHtml = `
    <div class="layer-chart-header">
      <h4>📊 ${title}分布图</h4>
      <div class="chart-legend">
        <span class="legend-item">
          <span class="legend-color" style="background: linear-gradient(135deg, #007bff, #66b3ff)"></span>
          ${title}
        </span>
      </div>
    </div>
    <div class="layer-chart-grid">
  `;

  for (let layer = 1; layer <= 30; layer++) {
    const data = layerData[layer];
    let value = 0;

    if (analysisType === "rate") {
      value = data.show > 0 ? (data.select / data.show) * 100 : 0;
    } else {
      value = data[analysisType] || 0;
    }

    const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
    const hasData = value > 0;

    chartHtml += `
      <div class="layer-bar ${hasData ? "has-data" : ""}" 
           title="第${layer}层: ${value.toFixed(1)}${unit}${
      analysisType === "rate" ? ` (${data.select}/${data.show})` : ""
    }">
        <div class="layer-bar-fill" style="height: ${percentage}%"></div>
        <div class="layer-label">${layer}</div>
        <div class="layer-value">${hasData ? value.toFixed(0) : ""}</div>
      </div>
    `;
  }

  chartHtml += `
    </div>
    <div class="chart-stats">
      <p>💡 提示: 鼠标悬停在柱子上查看详细数据</p>
    </div>
  `;

  chartEl.innerHTML = chartHtml;
}

// 计算层数统计
function calculateLayerStats(layerData) {
  let bestSelectLayer = 1,
    bestSelectRate = 0;
  let mostFrequentLayer = 1,
    mostFrequentCount = 0;
  let minLayer = 30,
    maxLayer = 1;
  let activeLayers = 0;
  let totalAppearances = 0;

  // 计算各种统计数据
  Object.keys(layerData).forEach((layer) => {
    const data = layerData[layer];
    const layerNum = parseInt(layer);

    if (data.total > 0) {
      activeLayers++;
      totalAppearances += data.show;

      if (layerNum < minLayer) minLayer = layerNum;
      if (layerNum > maxLayer) maxLayer = layerNum;

      // 最高选择率
      const selectRate = data.show > 0 ? (data.select / data.show) * 100 : 0;
      if (selectRate > bestSelectRate) {
        bestSelectRate = selectRate;
        bestSelectLayer = layerNum;
      }

      // 最高出现频率
      if (data.show > mostFrequentCount) {
        mostFrequentCount = data.show;
        mostFrequentLayer = layerNum;
      }
    }
  });

  // 计算趋势
  const earlyLayers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const midLayers = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const lateLayers = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30];

  const calculatePeriodPerformance = (layers) => {
    let totalShow = 0,
      totalSelect = 0;
    layers.forEach((layer) => {
      if (layerData[layer]) {
        totalShow += layerData[layer].show;
        totalSelect += layerData[layer].select;
      }
    });
    return totalShow > 0 ? (totalSelect / totalShow) * 100 : 0;
  };

  const earlyPerformance = calculatePeriodPerformance(earlyLayers);
  const midPerformance = calculatePeriodPerformance(midLayers);
  const latePerformance = calculatePeriodPerformance(lateLayers);

  return {
    bestSelectLayer,
    bestSelectRate: bestSelectRate.toFixed(1),
    mostFrequentLayer,
    mostFrequentCount,
    minLayer: activeLayers > 0 ? minLayer : 0,
    maxLayer: activeLayers > 0 ? maxLayer : 0,
    activeLayers,
    avgPerLayer: activeLayers > 0 ? totalAppearances / activeLayers : 0,
    earlyPerformance: earlyPerformance.toFixed(1),
    midPerformance: midPerformance.toFixed(1),
    latePerformance: latePerformance.toFixed(1),
    earlyTrend: midPerformance - earlyPerformance,
    midTrend: latePerformance - midPerformance,
    lateTrend: latePerformance - midPerformance,
  };
}

// 显示错误信息
function showItemDetailError(message) {
  const loadingEl = document.querySelector(".item-detail-loading");
  if (loadingEl) {
    loadingEl.innerHTML = `
      <div class="error-icon">❌</div>
      <div class="error-message">
        <h4>加载失败</h4>
        <p>${message}</p>
        <button class="btn btn-primary" onclick="closeItemDetail()">关闭</button>
      </div>
    `;
  }
}

// 关闭物品详情
function closeItemDetail() {
  try {
    const modal = document.querySelector(".item-detail-modal");
    if (modal) {
      modal.classList.remove("show");
      setTimeout(() => {
        // 添加安全检查
        if (modal && modal.parentNode && document.body.contains(modal)) {
          document.body.removeChild(modal);
        }
      }, 300);
    }
  } catch (error) {
    console.error("关闭模态框时出错:", error);
  }
}

// 导出物品详情
function exportItemDetail(itemId, itemName) {
  try {
    console.log(`导出物品详情: ${itemName}`);

    // 获取当前显示的数据
    const basicInfo = document.getElementById("itemBasicInfo");
    const detailStats = document.getElementById("itemDetailStats");

    if (!basicInfo || !detailStats) {
      alert("没有可导出的数据");
      return;
    }

    // 准备导出数据
    const exportData = [];

    // 添加基本信息
    exportData.push(["=== 物品详情分析报告 ==="]);
    exportData.push(["物品名称", itemName]);
    exportData.push(["物品ID", itemId]);
    exportData.push(["导出时间", new Date().toLocaleString()]);
    exportData.push([""]);

    // 添加基本统计
    exportData.push(["=== 基本统计 ==="]);
    const infoItems = basicInfo.querySelectorAll(".info-item");
    infoItems.forEach((item) => {
      const label = item.querySelector(".info-label")?.textContent || "";
      const value = item.querySelector(".info-value")?.textContent || "";
      exportData.push([label.replace(":", ""), value]);
    });
    exportData.push([""]);

    // 添加层数数据
    exportData.push(["=== 层数分析 ==="]);
    exportData.push(["层数", "出现次数", "选择次数", "购买次数", "选择率"]);

    // 这里需要从当前数据中获取层数信息
    // 由于数据在闭包中，我们需要重新计算或者存储在全局变量中

    // 转换为CSV
    const csvContent = exportData
      .map((row) => row.map((field) => `"${field}"`).join(","))
      .join("\n");

    // 创建下载
    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${itemName}_详情分析_${new Date().toISOString().slice(0, 10)}.csv`
    );
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log("✅ 物品详情导出成功");
  } catch (error) {
    console.error("❌ 物品详情导出失败:", error);
    alert("导出失败: " + error.message);
  }
}

// 点击背景关闭模态框
document.addEventListener("click", function (e) {
  if (e.target.classList.contains("modal-backdrop")) {
    closeItemDetail();
  }
});

// ESC键关闭模态框
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    closeItemDetail();
  }
});

// 更新统计概览
function updateSummaryStats(stats, itemType) {
  const summaryStats = document.getElementById("summaryStats");
  const topItems = document.getElementById("topItems");
  const trendAnalysis = document.getElementById("trendAnalysis");

  if (summaryStats) {
    const totalShow = Object.values(stats.show).reduce(
      (sum, count) => sum + count,
      0
    );
    const totalSelect = Object.values(stats.select).reduce(
      (sum, count) => sum + count,
      0
    );
    const totalBuy = Object.values(stats.buy).reduce(
      (sum, count) => sum + count,
      0
    );
    const uniqueItems = new Set([
      ...Object.keys(stats.show),
      ...Object.keys(stats.select),
      ...Object.keys(stats.buy),
    ]).size;

    summaryStats.innerHTML = `
      <div class="stat-item">
        <span class="stat-label">不同物品数量:</span>
        <span class="stat-value">${uniqueItems}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">总展示次数:</span>
        <span class="stat-value">${totalShow}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">总选择次数:</span>
        <span class="stat-value">${totalSelect}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">总购买次数:</span>
        <span class="stat-value">${totalBuy}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">平均选择率:</span>
        <span class="stat-value">${
          totalShow > 0 ? ((totalSelect / totalShow) * 100).toFixed(1) : 0
        }%</span>
      </div>
    `;

    if (topItems) {
      // 找出最热门的5个物品
      const allItems = new Set([
        ...Object.keys(stats.show),
        ...Object.keys(stats.select),
        ...Object.keys(stats.buy),
      ]);

      const topItemsList = Array.from(allItems)
        .map((itemId) => ({
          id: itemId,
          name: formatItemName(itemId),
          total:
            (stats.show[itemId] || 0) +
            (stats.select[itemId] || 0) +
            (stats.buy[itemId] || 0),
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      let topItemsHtml = "";
      topItemsList.forEach((item, index) => {
        topItemsHtml += `
        <div class="top-item">
          <span class="top-rank">#${index + 1}</span>
          <span class="top-name">${item.name}</span>
          <span class="top-count">${item.total}次</span>
        </div>
      `;
      });

      topItems.innerHTML =
        topItemsHtml || '<div class="no-data">暂无数据</div>';
    }

    if (trendAnalysis) {
      // 简单的趋势分析
      const selectRate = totalShow > 0 ? (totalSelect / totalShow) * 100 : 0;
      const buyRate = totalShow > 0 ? (totalBuy / totalShow) * 100 : 0;

      let trendHtml = `
      <div class="trend-item">
        <span class="trend-label">整体选择率:</span>
        <span class="trend-value ${
          selectRate > 50
            ? "trend-high"
            : selectRate > 25
            ? "trend-medium"
            : "trend-low"
        }">${selectRate.toFixed(1)}%</span>
      </div>
      <div class="trend-item">
        <span class="trend-label">整体购买率:</span>
        <span class="trend-value ${
          buyRate > 30
            ? "trend-high"
            : buyRate > 15
            ? "trend-medium"
            : "trend-low"
        }">${buyRate.toFixed(1)}%</span>
      </div>
      <div class="trend-item">
        <span class="trend-label">物品多样性:</span>
        <span class="trend-value ${
          uniqueItems > 50
            ? "trend-high"
            : uniqueItems > 25
            ? "trend-medium"
            : "trend-low"
        }">${
        uniqueItems > 50 ? "丰富" : uniqueItems > 25 ? "一般" : "较少"
      }</span>
      </div>
    `;

      trendAnalysis.innerHTML = trendHtml;
    }
  }
}

// 导出分析结果
function exportAnalysisResults(itemStats) {
  try {
    const itemTypeSelect = document.getElementById("itemTypeSelect");
    const analysisTypeSelect = document.getElementById("analysisTypeSelect");
    const minCountInput = document.getElementById("minCountInput");

    const itemType = itemTypeSelect?.value || "cards";
    const analysisType = analysisTypeSelect?.value || "select";
    const minCount = parseInt(minCountInput?.value) || 1;

    const results = calculateAnalysisResults(
      itemStats[itemType],
      analysisType,
      minCount,
      "desc"
    );

    // 准备CSV数据
    const csvData = [];
    const headers = ["排名", "物品名称", "数值", "计数", "总数", "类型"];
    csvData.push(headers);

    results.forEach((item, index) => {
      csvData.push([
        index + 1,
        item.name,
        item.rate.toFixed(2),
        item.count,
        item.total,
        analysisType,
      ]);
    });

    // 转换为CSV格式
    const csvContent = csvData
      .map((row) => row.map((field) => `"${field}"`).join(","))
      .join("\n");

    // 创建下载链接
    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    const typeNames = {
      cards: "卡牌",
      relics: "遗物",
      blessings: "祝福",
      hardTags: "难度标签",
    };
    const analysisNames = {
      select: "选择率",
      buy: "购买率",
      popularity: "热门度",
    };

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${typeNames[itemType]}_${analysisNames[analysisType]}_分析_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`
    );
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log("✅ 分析结果导出成功");
  } catch (error) {
    console.error("❌ 分析结果导出失败:", error);
    alert("导出失败: " + error.message);
  }
}

// 获取图表颜色
function getChartColor(index) {
  const colors = [
    "#3498db",
    "#e74c3c",
    "#2ecc71",
    "#f39c12",
    "#9b59b6",
    "#1abc9c",
    "#34495e",
    "#e67e22",
    "#95a5a6",
    "#16a085",
  ];
  return colors[index % colors.length];
}

// 更新时间分析
function updateTimeAnalysis() {
  console.log("=== 更新时间分析 ===");

  const timeContent = document.getElementById("time-content");
  if (!timeContent) {
    console.error("找不到 time-content 元素");
    return;
  }

  if (!allData || allData.length === 0) {
    timeContent.innerHTML = '<div class="no-data">暂无时间数据</div>';
    return;
  }

  try {
    const hourlyStats = new Array(24).fill(0);
    const dailyStats = {};
    const weeklyStats = {
      周日: 0,
      周一: 0,
      周二: 0,
      周三: 0,
      周四: 0,
      周五: 0,
      周六: 0,
    };

    // 统计时间数据
    allData.forEach((record) => {
      try {
        const date = new Date(record.created_at);
        const hour = date.getHours();
        const dateStr = date.toLocaleDateString("zh-CN");
        const weekday = [
          "周日",
          "周一",
          "周二",
          "周三",
          "周四",
          "周五",
          "周六",
        ][date.getDay()];

        hourlyStats[hour]++;
        dailyStats[dateStr] = (dailyStats[dateStr] || 0) + 1;
        weeklyStats[weekday]++;
      } catch (e) {
        console.warn("时间数据解析失败:", e);
      }
    });

    // 生成HTML
    let html = '<div class="time-analysis-container">';

    // 24小时活动分布
    html += '<div class="time-section">';
    html += "<h3>🕐 24小时活动分布</h3>";
    html += '<div class="hourly-chart">';

    const maxHourly = Math.max(...hourlyStats);
    hourlyStats.forEach((count, hour) => {
      const height = maxHourly > 0 ? (count / maxHourly) * 100 : 0;
      html += `
        <div class="hour-bar" title="${hour}:00 - ${count}次">
          <div class="hour-bar-fill" style="height: ${height}%"></div>
          <div class="hour-label">${hour}</div>
        </div>
      `;
    });

    html += "</div>";
    html += `<div class="chart-stats"><p>峰值时段: ${hourlyStats.indexOf(
      maxHourly
    )}:00 (${maxHourly}次)</p></div>`;
    html += "</div>";

    // 星期活动统计
    html += '<div class="time-section">';
    html += "<h3>📅 星期活动统计</h3>";
    html += '<div class="weekly-stats">';

    const maxWeekly = Math.max(...Object.values(weeklyStats));
    Object.entries(weeklyStats).forEach(([day, count]) => {
      const width = maxWeekly > 0 ? (count / maxWeekly) * 100 : 0;
      html += `
        <div class="week-stat-item">
          <div class="week-day">${day}</div>
          <div class="week-bar">
            <div class="week-bar-fill" style="width: ${width}%"></div>
          </div>
          <div class="week-count">${count}</div>
        </div>
      `;
    });

    html += "</div></div>";

    // 每日活动列表
    html += '<div class="time-section">';
    html += "<h3>📊 每日活动统计</h3>";
    html += '<div class="daily-list">';

    const sortedDays = Object.entries(dailyStats)
      .sort((a, b) => new Date(b[0]) - new Date(a[0]))
      .slice(0, 30); // 显示最近30天

    const maxDaily = Math.max(...Object.values(dailyStats));

    sortedDays.forEach(([date, count]) => {
      const width = maxDaily > 0 ? (count / maxDaily) * 100 : 0;
      const dateObj = new Date(date);
      const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
        dateObj.getDay()
      ];

      html += `
        <div class="daily-item">
          <div class="daily-date">
            <div class="date">${date}</div>
            <div class="weekday">${weekday}</div>
          </div>
          <div class="daily-bar">
            <div class="daily-bar-fill" style="width: ${width}%"></div>
          </div>
          <div class="daily-count">${count}</div>
        </div>
      `;
    });

    html += "</div></div>";

    html += "</div>"; // 结束 time-analysis-container

    timeContent.innerHTML = html;
    console.log("✅ 时间分析更新完成");
  } catch (error) {
    console.error("时间分析更新失败:", error);
    timeContent.innerHTML = '<div class="error">时间数据加载失败</div>';
  }
}

// 格式化物品名称
function formatItemName(itemId) {
  console.log("格式化物品名称:", itemId);
  if (!itemId) return "未知物品";

  // 如果是对象，尝试获取其字符串表示
  if (typeof itemId === "object") {
    if (itemId.toString && itemId.toString() !== "[object Object]") {
      return itemId.toString();
    }
    // 如果是对象但没有有效的toString，尝试JSON.stringify
    try {
      return JSON.stringify(itemId);
    } catch (e) {
      return "未知物品";
    }
  }

  // 确保返回字符串
  return String(itemId);
}

// 显示加载状态
function showLoading(show) {
  if (loadingDiv) {
    loadingDiv.style.display = show ? "flex" : "none";
  }
}

// 隐藏错误信息
function hideError() {
  if (errorDiv) {
    errorDiv.style.display = "none";
  }
}

// 显示错误信息
function showError(message = "数据加载失败，请检查配置并重试") {
  if (errorDiv) {
    errorDiv.style.display = "block";
    errorDiv.innerHTML = `<p>${message}</p>`;
  }
  showLoading(false);
}

// 导出数据功能
function exportData() {
  if (!allData || allData.length === 0) {
    alert("没有数据可以导出");
    return;
  }

  try {
    // 准备CSV数据
    const csvData = [];
    csvData.push(["时间", "玩家ID", "数据类型", "详细信息"]);

    allData.forEach((record) => {
      try {
        let parsedData;
        if (typeof record.data === "string") {
          parsedData = JSON.parse(record.data);
        } else {
          parsedData = record.data;
        }

        const time = new Date(record.created_at).toLocaleString("zh-CN");
        const playerId = parsedData?.PlayerId || "未知";
        const dataType = "游戏选择";
        const details = JSON.stringify(parsedData);

        csvData.push([time, playerId, dataType, details]);
      } catch (e) {
        console.warn("导出数据解析失败:", e);
      }
    });

    // 转换为CSV格式
    const csvContent = csvData
      .map((row) => row.map((field) => `"${field}"`).join(","))
      .join("\n");

    // 创建下载链接
    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `游戏数据_${new Date().toISOString().slice(0, 10)}.csv`
    );
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log("✅ 数据导出成功");
  } catch (error) {
    console.error("❌ 数据导出失败:", error);
    alert("数据导出失败: " + error.message);
  }
}

// 全局导出函数
window.exportData = exportData;
window.loadData = loadData;
window.closeItemDetail = closeItemDetail;
// 错误处理
window.addEventListener("error", function (e) {
  console.error("全局错误:", e.error);
  showError("发生未知错误，请刷新页面重试");
});

// 未捕获的Promise错误
window.addEventListener("unhandledrejection", function (e) {
  console.error("未处理的Promise错误:", e.reason);
  showError("数据处理错误，请刷新页面重试");
});
// 在文件末尾添加，将函数绑定到全局作用域
window.toggleErrorStatus = toggleErrorStatus;
window.addErrorNote = addErrorNote;
window.deleteErrorReport = deleteErrorReport;
window.escapeHtml = escapeHtml;
window.toggleErrorGroup = toggleErrorGroup;
window.clearCache = clearCache;
window.handleStorageError = handleStorageError;
console.log("🚀 脚本加载完成");

// 数据压缩和分块工具函数
function compressData(data) {
  try {
    const input = typeof data === "string" ? data : JSON.stringify(data);

    if (typeof LZString !== "undefined") {
      return LZString.compress(input);
    } else {
      // 简单 JSON 优化
      return JSON.stringify(data, (key, value) => {
        if (value === null || value === undefined) return undefined;
        if (typeof value === "number" && value === 0) return 0;
        if (typeof value === "string" && value === "") return undefined;
        return value;
      });
    }
  } catch (error) {
    console.warn("数据压缩失败，使用原始数据:", error);
    return typeof data === "string" ? data : JSON.stringify(data);
  }
}

function decompressData(compressedData) {
  try {
    if (typeof LZString !== "undefined") {
      const decompressed = LZString.decompress(data);
      try {
        return JSON.parse(decompressed);
      } catch {
        return decompressed; // 已经是字符串
      }
    } else {
      return JSON.parse(compressedData);
    }
  } catch (error) {
    console.warn("数据解压失败，尝试直接解析:", error);
    try {
      return JSON.parse(compressedData);
    } catch (e) {
      throw new Error("数据解析失败");
    }
  }
}

function chunkData(data, chunkSize = 100) {
  const chunks = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }
  return chunks;
}

function storeDataInChunks(data, baseKey, maxChunkSize = 500000) {
  // 500KB per chunk
  try {
    const compressed = compressData(data);

    if (compressed.length <= maxChunkSize) {
      // 数据足够小，直接存储
      try {
        localStorage.setItem(baseKey, compressed);
        return { success: true, chunks: 1 };
      } catch (storageError) {
        if (handleStorageError(storageError, "存储主数据")) {
          return { success: false, error: "存储失败" };
        }
        return { success: false, error: storageError.message };
      }
    } else {
      // 数据太大，需要分块
      const chunks = chunkData(
        data,
        Math.ceil(data.length / Math.ceil(compressed.length / maxChunkSize))
      );

      try {
        // 存储分块信息
        const chunkInfo = {
          totalChunks: chunks.length,
          totalSize: compressed.length,
          timestamp: Date.now(),
        };

        localStorage.setItem(`${baseKey}_info`, JSON.stringify(chunkInfo));

        // 存储每个分块
        chunks.forEach((chunk, index) => {
          const chunkData = compressData(chunk);
          localStorage.setItem(`${baseKey}_chunk_${index}`, chunkData);
        });

        return { success: true, chunks: chunks.length };
      } catch (storageError) {
        if (handleStorageError(storageError, "存储分块数据")) {
          return { success: false, error: "存储失败" };
        }
        return { success: false, error: storageError.message };
      }
    }
  } catch (error) {
    console.error("存储数据分块失败:", error);
    return { success: false, error: error.message };
  }
}

function retrieveDataFromChunks(baseKey) {
  try {
    // 检查是否有分块信息
    const chunkInfo = localStorage.getItem(`${baseKey}_info`);

    if (!chunkInfo) {
      // 没有分块信息，尝试直接读取
      const data = localStorage.getItem(baseKey);
      if (data) {
        return decompressData(data);
      }
      return null;
    }

    const info = JSON.parse(chunkInfo);
    const chunks = [];

    // 读取所有分块
    for (let i = 0; i < info.totalChunks; i++) {
      const chunkData = localStorage.getItem(`${baseKey}_chunk_${i}`);
      if (chunkData) {
        chunks.push(decompressData(chunkData));
      } else {
        throw new Error(`分块 ${i} 数据丢失`);
      }
    }

    // 合并分块数据
    return chunks.flat();
  } catch (error) {
    console.error("读取分块数据失败:", error);
    return null;
  }
}

function clearDataChunks(baseKey) {
  try {
    // 清除分块信息
    localStorage.removeItem(`${baseKey}_info`);

    // 清除所有可能的分块
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(`${baseKey}_chunk_`)) {
        localStorage.removeItem(key);
      }
    });

    // 清除主键（如果存在）
    localStorage.removeItem(baseKey);
  } catch (error) {
    console.error("清除分块数据失败:", error);
  }
}

// 清除缓存函数
function clearCache() {
  try {
    clearDataChunks("dashboard_data_cache");
    console.log("✅ 缓存已清除");

    // 重新启用缓存
    enableCache();

    return true;
  } catch (error) {
    console.error("清除缓存失败:", error);
    return false;
  }
}

// 检查 localStorage 可用空间
function checkStorageQuota() {
  try {
    const testKey = "__storage_test__";
    const testValue = "x".repeat(1000000); // 1MB 测试数据

    localStorage.setItem(testKey, testValue);
    localStorage.removeItem(testKey);

    return { available: true, message: "存储空间充足" };
  } catch (error) {
    if (error.name === "QuotaExceededError") {
      return { available: false, message: "存储空间不足，建议清除缓存" };
    }
    return { available: false, message: "存储检查失败: " + error.message };
  }
}

// 重新启用缓存函数
function enableCache() {
  cacheEnabled = true;
  cacheFailureCount = 0;
  console.log("✅ 缓存已重新启用");
  showMessage("缓存功能已重新启用", "success");
}
