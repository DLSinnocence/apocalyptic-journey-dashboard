import { allData } from './js/config.js';
import { formatItemName } from './js/utils.js';

// 更新UI
export function updateUI() {
  console.log("=== 开始更新UI ===");
  try {
    const mainContent = document.querySelector(".main-content");
    if (mainContent) mainContent.style.display = "block";
    
    updateStats();
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
    if (allData.length > 0 && allData[0].create_at) {
      try {
        lastUpdate = new Date(allData[0].create_at).toLocaleString("zh-CN");
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
          ["Cards", "Relics", "Blessings"].forEach((category) => {
            if (parsedData[category] && parsedData[category].Select) {
              parsedData[category].Select.forEach((item) => {
                const itemId = item.Id || item;
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
        const time = new Date(record.create_at).toLocaleString("zh-CN");
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
              lastSeen: record.create_at,
            };
          }
          playerStats[playerId].count++;

          if (
            new Date(record.create_at) >
            new Date(playerStats[playerId].lastSeen)
          ) {
            playerStats[playerId].lastSeen = record.create_at;
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

// 更新卡牌分析
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
        const date = new Date(record.create_at);
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

// 初始化标签页
export function initTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabPanes.forEach((p) => p.classList.remove("active"));
      
      btn.classList.add("active");
      const targetPane = document.getElementById(targetTab);
      if (targetPane) targetPane.classList.add("active");
    });
  });
}
