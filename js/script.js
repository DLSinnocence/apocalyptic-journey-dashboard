import { encryptData, decryptData } from "./utils.js";
import { supabase, TABLE_NAME, ENC_KEY_PASSPHRASE } from "./config.js";
import { initAuthStateListener, setupAuthForms, } from "./auth.js";

// 全局变量
let allData = [];

// DOM 元素
let refreshBtn, loadingDiv, errorDiv;

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

  // 初始化标签页
  initTabs();

  // 检查当前会话
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      showAppContent();
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
    });
  });
}

// 加载数据
async function loadData(forceRefresh = false) {
  console.log("=== 开始加载数据 ===");

  showLoading(true);
  hideError();

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "🔄 加载中...";
  }

  const CACHE_KEY = "dashboard_data_cache";
  const CACHE_TTL = 5 * 60 * 1000; // 5分钟有效

  try {
    if (!forceRefresh) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const decrypted = await decryptData(
          JSON.parse(cached),
          ENC_KEY_PASSPHRASE
        );
        if (Date.now() - decrypted.timestamp < CACHE_TTL) {
          allData = decrypted.data;
          updateUI();
          return;
        }
      }
    }

    // 请求 Supabase 数据
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw new Error(`数据获取失败: ${error.message}`);
    if (!data || data.length === 0) throw new Error("没有获取到任何数据");

    allData = data;
    console.log("✅ 数据加载成功，保存到缓存");

    // 保存缓存
    const encrypted = await encryptData(
      { timestamp: Date.now(), data },
      ENC_KEY_PASSPHRASE
    );
    localStorage.setItem(CACHE_KEY, JSON.stringify(encrypted));

    updateUI();
  } catch (error) {
    console.error("❌ 数据加载失败:", error);
    showError(error.message);
  } finally {
    showLoading(false);
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "🔄 刷新数据";
    }
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
    }

    // 更新统计信息
    updateStats();

    // 更新各个标签页
    updateOverview();
    updatePlayerList();
    updateCardAnalysis();
    updateTimeAnalysis();

    console.log("✅ UI更新完成");
  } catch (error) {
    console.error("❌ UI更新失败:", error);
  }
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
            <div class="activity-desc">玩家 <strong>${
              playerId.slice(0, 6) + "......" // 截断ID显示
            }</strong> 完成了一次游戏</div>
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
              <td><strong>${playerId.slice(0, 6) + "......"}</strong></td>
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
            processItemData(parsedData.HardTags, itemStats.hardTags, "HardTags");
          }
        }
      } catch (e) {
        console.warn(`记录 ${index} 数据解析失败:`, e);
      }
    });

    // 生成完整的分析界面
    const html = generateAnalysisHTML(itemStats);
    cardContent.innerHTML = html;

    // 绑定筛选事件
    bindAnalysisEvents(itemStats);

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
      const itemId =
        typeof item === "object" ? item.Name || item : item;
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
          const itemId =
            typeof item === "object" ? item.Name || item : item;
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
          const itemId =
            typeof item === "object" ? item.Name || item : item;
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
          const itemId =
            typeof item === "object" ? item.Name || item : item;
          if (itemId) {
            stats.buy[itemId] = (stats.buy[itemId] || 0) + 1;
          }
        });
      }
    });
  }
}

// 生成分析界面HTML
function generateAnalysisHTML(itemStats) {
  let html = `
    <div class="analysis-container">
      <!-- 筛选控制面板 -->
      <div class="analysis-controls">
        <div class="control-group">
          <label for="itemTypeSelect">物品类型:</label>
          <select id="itemTypeSelect" class="form-select">
            <option value="cards">🃏 卡牌</option>
            <option value="relics">🏺 遗物</option>
            <option value="blessings">✨ 祝福</option>
            <option value="hardTags">🛠️ 难度标签</option>
          </select>
        </div>
        
        <div class="control-group">
          <label for="analysisTypeSelect">分析类型:</label>
          <select id="analysisTypeSelect" class="form-select">
            <option value="select">选择率分析</option>
            <option value="buy">购买率分析</option>
            <option value="popularity">热门度分析</option>
          </select>
        </div>
        
        <div class="control-group">
          <label for="minCountInput">最小出现次数:</label>
          <input type="number" id="minCountInput" class="form-input" value="3" min="1" max="100">
        </div>
        
        <div class="control-group">
          <label for="sortOrderSelect">排序方式:</label>
          <select id="sortOrderSelect" class="form-select">
            <option value="desc">从高到低</option>
            <option value="asc">从低到高</option>
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
    analysisTable.innerHTML = generateTable(results.slice(0, results.length), analysisType);
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
                      typeof item === "object"
                        ? item.Name || item
                        : item;
                    if (currentItemId === itemId) {
                      // 获取层数信息 - 从底层物品中获取
                      if (typeof item === "object") {
                        currentLayer = item.Level || item.level || item.floor || 1;
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
                      typeof item === "object"
                        ? item.Name || item
                        : item;
                    if (currentItemId === itemId) {
                      // 获取层数信息 - 从底层物品中获取
                      if (typeof item === "object") {
                        currentLayer = item.Level || item.level || item.floor || 1;
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
                      typeof item === "object"
                        ? item.Name || item
                        : item;
                    if (currentItemId === itemId) {
                      // 获取层数信息 - 从底层物品中获取
                      if (typeof item === "object") {
                        currentLayer = item.Level || item.level || item.floor || 1;
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
                    typeof item === "object"
                      ? item.Name || item
                      : item;
                  if (currentItemId === itemId) {
                    // 获取层数信息 - 从底层物品中获取
                    if (typeof item === "object") {
                      currentLayer = item.Level || item.level || item.floor || 1;
                    }
                    foundInSelect = true;
                  }
                });
              }
            }
          });

          // 如果找到了目标物品，更新对应层数的统计
          if (foundInShow || foundInSelect || foundInBuy) {
            const normalizedLayer = Math.min(Math.max(parseInt(currentLayer), 1), 30);
            
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
    contentElExists: !!contentEl
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
    const headers = [
      "排名",
      "物品名称",
      "数值",
      "计数",
      "总数",
      "类型",
    ];
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

    const typeNames = { cards: "卡牌", relics: "遗物", blessings: "祝福", hardTags: "难度标签" };
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
  if (typeof itemId === 'object') {
    if (itemId.toString && itemId.toString() !== '[object Object]') {
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

        csvData.push([time, playerId.slice(0, 6) + "......" , dataType, details]);
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

console.log("🚀 脚本加载完成");


