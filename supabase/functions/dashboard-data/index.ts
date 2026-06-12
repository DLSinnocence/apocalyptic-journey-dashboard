import { createClient } from "@supabase/supabase-js";

const TABLE_NAME = "save_selection";
const TABLE_NAME_ERROR = "error_selection";
const TABLE_NAME_PING = "ping_selection";
const PAGE_SIZE = 1000;
const DEFAULT_ERROR_PAGE_SIZE = 100;
const MAX_ERROR_PAGE_SIZE = 500;
const PLAYER_LIMIT = 100;
const RECENT_ACTIVITY_LIMIT = 10;
const DAILY_LIMIT = 30;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Cursor = {
  created_at: string;
  id: string | number;
};

type PageResult = {
  rows: Record<string, unknown>[];
  nextCursor: Cursor | null;
  hasMore: boolean;
  totalRows: number | null;
};

type DashboardMode = "summary" | "item-detail" | "errors";

type ItemStats = {
  show: Record<string, number>;
  select: Record<string, number>;
  buy: Record<string, number>;
};

type ItemStatsByType = {
  cards: ItemStats;
  relics: ItemStats;
  blessings: ItemStats;
  hardTags: ItemStats;
};

type LayerStats = {
  show: number;
  select: number;
  buy: number;
  total: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("Missing Authorization header", 401);
    }

    const body = await req.json().catch(() => ({}));
    const mode = normalizeMode(body.mode);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = getSupabaseClientKey(req);

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonError("Missing Supabase environment variables", 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    if (mode === "item-detail") {
      const itemId = typeof body.itemId === "string" ? body.itemId : "";
      if (!itemId) return jsonError("Missing itemId", 400);

      const rows = await fetchAllRows(supabase, TABLE_NAME);
      return jsonResponse(buildItemDetail(rows, itemId));
    }

    if (mode === "errors") {
      const page = await fetchRowsPage(
        supabase,
        TABLE_NAME_ERROR,
        parseCursor(body.cursor),
        parsePageSize(body.pageSize),
      );
      return jsonResponse({
        rows: page.rows,
        pagination: {
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          pageSize: page.rows.length,
          totalRows: page.totalRows,
        },
      });
    }

    const [mainRows, errorPage, pingRows] = await Promise.all([
      fetchAllRows(supabase, TABLE_NAME),
      fetchRowsPage(
        supabase,
        TABLE_NAME_ERROR,
        null,
        parsePageSize(body.errorPageSize),
      ),
      fetchAllRows(supabase, TABLE_NAME_PING),
    ]);

    return jsonResponse(buildDashboardSummary(mainRows, errorPage, pingRows));
  } catch (error) {
    console.error("Dashboard data failed:", error);
    return jsonError(
      error instanceof Error ? error.message : "Dashboard data failed",
      500,
    );
  }
});

function normalizeMode(value: unknown): DashboardMode {
  if (value === "item-detail" || value === "errors") return value;
  return "summary";
}

function parsePageSize(value: unknown) {
  const pageSize = Number(value);
  if (!Number.isFinite(pageSize) || pageSize <= 0) return DEFAULT_ERROR_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(pageSize), 1), MAX_ERROR_PAGE_SIZE);
}

function parseCursor(value: unknown): Cursor | null {
  if (!isObjectRecord(value)) return null;
  if (!value.created_at || value.id == null) return null;
  return {
    created_at: String(value.created_at),
    id: value.id as string | number,
  };
}

function getSupabaseClientKey(req: Request) {
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (publishableKeys) {
    try {
      const parsed = JSON.parse(publishableKeys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch (_) {
      // Fall back to legacy env vars/request headers below.
    }
  }

  return (
    Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
    req.headers.get("apikey") ||
    ""
  );
}

function jsonResponse(data: unknown) {
  return Response.json(data, {
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
    },
  });
}

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: corsHeaders,
    },
  );
}

async function fetchAllRows(
  supabase: ReturnType<typeof createClient>,
  tableName: string,
) {
  const allRows: Record<string, unknown>[] = [];

  const twoMonthsAgoISO = getTwoMonthsAgoISO();
  let cursor: Cursor | null = null;

  while (true) {
    let query = supabase
      .from(tableName)
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE)
      .gte("created_at", twoMonthsAgoISO);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`${tableName}: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    allRows.push(...(data as Record<string, unknown>[]));

    if (data.length < PAGE_SIZE) break;

    const last = data[data.length - 1] as Record<string, unknown>;
    cursor = {
      created_at: String(last.created_at),
      id: last.id as string | number,
    };
  }

  return allRows;
}

async function fetchRowsPage(
  supabase: ReturnType<typeof createClient>,
  tableName: string,
  cursor: Cursor | null,
  pageSize: number,
): Promise<PageResult> {
  const twoMonthsAgoISO = getTwoMonthsAgoISO();

  let query = supabase
    .from(tableName)
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1)
    .gte("created_at", twoMonthsAgoISO);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }

  const [{ data, error }, totalRows] = await Promise.all([
    query,
    fetchRecentRowCount(supabase, tableName, twoMonthsAgoISO),
  ]);

  if (error) {
    throw new Error(`${tableName}: ${error.message}`);
  }

  const fetchedRows = (data || []) as Record<string, unknown>[];
  const hasMore = fetchedRows.length > pageSize;
  const rows = hasMore ? fetchedRows.slice(0, pageSize) : fetchedRows;
  const last = rows[rows.length - 1];

  return {
    rows,
    hasMore,
    totalRows,
    nextCursor:
      hasMore && last
        ? {
            created_at: String(last.created_at),
            id: last.id as string | number,
          }
        : null,
  };
}

async function fetchRecentRowCount(
  supabase: ReturnType<typeof createClient>,
  tableName: string,
  twoMonthsAgoISO: string,
) {
  const { count, error } = await supabase
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .gte("created_at", twoMonthsAgoISO);

  if (error) {
    throw new Error(`${tableName} count: ${error.message}`);
  }

  return count ?? null;
}

function getTwoMonthsAgoISO() {
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  return twoMonthsAgo.toISOString();
}

function buildDashboardSummary(
  mainRows: Record<string, unknown>[],
  errorPage: PageResult,
  pingRows: Record<string, unknown>[],
) {
  const uniquePlayers = new Set<string>();
  const itemCounts: Record<string, number> = {};
  const playerStats: Record<string, { count: number; lastSeen: string }> = {};
  const itemStats = createItemStats();
  const hourlyStats = new Array(24).fill(0);
  const dailyStats: Record<string, number> = {};
  const weeklyStats: Record<string, number> = {
    "周日": 0,
    "周一": 0,
    "周二": 0,
    "周三": 0,
    "周四": 0,
    "周五": 0,
    "周六": 0,
  };
  const recentActivity: Array<{ time: string; playerId: string }> = [];
  let totalSelections = 0;

  for (const record of mainRows) {
    const parsedData = parseRecordData(record.data);
    const createdAt = String(record.created_at || "");
    if (!parsedData) continue;

    const playerId = getStringField(parsedData, ["PlayerId"]);
    if (playerId) {
      uniquePlayers.add(playerId);
      if (!playerStats[playerId]) {
        playerStats[playerId] = { count: 0, lastSeen: createdAt };
      }
      playerStats[playerId].count++;
      if (createdAt && createdAt > playerStats[playerId].lastSeen) {
        playerStats[playerId].lastSeen = createdAt;
      }
    }

    if (recentActivity.length < RECENT_ACTIVITY_LIMIT) {
      recentActivity.push({
        time: createdAt,
        playerId: playerId || "未知玩家",
      });
    }

    for (const category of ["Cards", "Relics", "Blessings", "HardTags"]) {
      const categoryData = parsedData[category];
      if (isObjectRecord(categoryData) && Array.isArray(categoryData.Select)) {
        for (const item of categoryData.Select) {
          const itemId = getItemId(item);
          if (itemId) {
            itemCounts[itemId] = (itemCounts[itemId] || 0) + 1;
            totalSelections++;
          }
        }
      }
    }

    if (parsedData.Cards) processItemData(parsedData.Cards, itemStats.cards);
    if (parsedData.Relics) processItemData(parsedData.Relics, itemStats.relics);
    if (parsedData.Blessings) {
      processItemData(parsedData.Blessings, itemStats.blessings);
    }
    if (parsedData.HardTags) processItemData(parsedData.HardTags, itemStats.hardTags);

    const date = createdAt ? new Date(createdAt) : null;
    if (date && !Number.isNaN(date.getTime())) {
      const hour = date.getHours();
      const dateStr = date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
      const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
        date.getDay()
      ];
      hourlyStats[hour]++;
      dailyStats[dateStr] = (dailyStats[dateStr] || 0) + 1;
      weeklyStats[weekday]++;
    }
  }

  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({ id, count }));

  const players = Object.entries(playerStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, PLAYER_LIMIT)
    .map(([playerId, stats]) => ({
      playerId,
      count: stats.count,
      lastSeen: stats.lastSeen,
    }));

  const sortedDaily = Object.entries(dailyStats)
    .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
    .slice(0, DAILY_LIMIT)
    .map(([date, count]) => ({ date, count }));

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      totalRecords: mainRows.length,
      activePlayers: uniquePlayers.size,
      lastUpdate: mainRows[0]?.created_at || null,
    },
    overview: {
      totalRecords: mainRows.length,
      activePlayers: uniquePlayers.size,
      totalSelections,
      uniqueItemCount: Object.keys(itemCounts).length,
      topItems,
      recentActivity,
    },
    players: {
      totalPlayers: Object.keys(playerStats).length,
      rows: players,
    },
    itemStats,
    time: {
      hourlyStats,
      weeklyStats,
      dailyStats: sortedDaily,
    },
    ping: buildPingSummary(pingRows),
    errors: {
      rows: errorPage.rows,
      pagination: {
        nextCursor: errorPage.nextCursor,
        hasMore: errorPage.hasMore,
        pageSize: errorPage.rows.length,
        totalRows: errorPage.totalRows,
      },
    },
  };
}

function buildPingSummary(pingRows: Record<string, unknown>[]) {
  const byDay: Record<
    string,
    { sumAvg: number; countAvg: number; sumMax: number; countMax: number }
  > = {};

  for (const row of pingRows) {
    const createdAt = String(row.created_at || "");
    if (!createdAt) continue;
    const day = createdAt.slice(0, 10);
    const avgPing = Number(row.average_ping);
    const maxPing = Number(row.max_ping);
    if (!byDay[day]) {
      byDay[day] = { sumAvg: 0, countAvg: 0, sumMax: 0, countMax: 0 };
    }
    if (!Number.isNaN(avgPing)) {
      byDay[day].sumAvg += avgPing;
      byDay[day].countAvg += 1;
    }
    if (!Number.isNaN(maxPing)) {
      byDay[day].sumMax += maxPing;
      byDay[day].countMax += 1;
    }
  }

  return Object.entries(byDay)
    .map(([day, s]) => ({
      day,
      avg: s.countAvg ? Math.round(s.sumAvg / s.countAvg) : null,
      max: s.countMax ? Math.round(s.sumMax / s.countMax) : null,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function buildItemDetail(rows: Record<string, unknown>[], itemId: string) {
  const layerData: Record<number, LayerStats> = {};
  for (let i = 1; i <= 30; i++) {
    layerData[i] = { show: 0, select: 0, buy: 0, total: 0 };
  }

  let totalShow = 0;
  let totalSelect = 0;
  let totalBuy = 0;
  let firstSeen: string | null = null;
  let lastSeen: string | null = null;

  for (const record of rows) {
    const parsedData = parseRecordData(record.data);
    if (!parsedData) continue;

    let foundInShow = false;
    let foundInSelect = false;
    let foundInBuy = false;
    let currentLayer = 1;

    for (const itemType of ["Cards", "Relics", "Blessings", "HardTags"]) {
      const itemData = parsedData[itemType];
      if (!itemData) continue;

      for (const showType of ["RewardShow", "ShopShow", "Show"]) {
        for (const item of getArrayField(itemData, showType)) {
          if (getItemId(item) === itemId) {
            currentLayer = getItemLayer(item);
            foundInShow = true;
          }
        }
      }

      for (const selectType of ["Select", "Selected", "Picked"]) {
        for (const item of getArrayField(itemData, selectType)) {
          if (getItemId(item) === itemId) {
            currentLayer = getItemLayer(item);
            foundInSelect = true;
          }
        }
      }

      for (const buyType of ["Buy", "Bought", "Purchased"]) {
        for (const item of getArrayField(itemData, buyType)) {
          if (getItemId(item) === itemId) {
            currentLayer = getItemLayer(item);
            foundInBuy = true;
          }
        }
      }

      if (Array.isArray(itemData)) {
        for (const item of itemData) {
          if (getItemId(item) === itemId) {
            currentLayer = getItemLayer(item);
            foundInSelect = true;
          }
        }
      }
    }

    if (!foundInShow && !foundInSelect && !foundInBuy) continue;

    const normalizedLayer = Math.min(Math.max(Number.parseInt(String(currentLayer)), 1), 30);
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

    const createdAt = String(record.created_at || "");
    if (createdAt) {
      if (!firstSeen || createdAt < firstSeen) firstSeen = createdAt;
      if (!lastSeen || createdAt > lastSeen) lastSeen = createdAt;
    }
  }

  return {
    itemId,
    layerData,
    totalShow,
    totalSelect,
    totalBuy,
    firstSeen,
    lastSeen,
  };
}

function createItemStats(): ItemStatsByType {
  return {
    cards: createEmptyItemStats(),
    relics: createEmptyItemStats(),
    blessings: createEmptyItemStats(),
    hardTags: createEmptyItemStats(),
  };
}

function createEmptyItemStats(): ItemStats {
  return { show: {}, select: {}, buy: {} };
}

function processItemData(itemData: unknown, stats: ItemStats) {
  if (Array.isArray(itemData)) {
    for (const item of itemData) {
      const itemId = getItemId(item);
      if (itemId) stats.select[itemId] = (stats.select[itemId] || 0) + 1;
    }
    return;
  }

  if (!isObjectRecord(itemData)) return;

  for (const showType of ["RewardShow", "ShopShow", "Show"]) {
    for (const item of getArrayField(itemData, showType)) {
      const itemId = getItemId(item);
      if (itemId) stats.show[itemId] = (stats.show[itemId] || 0) + 1;
    }
  }

  for (const selectType of ["Select", "Selected", "Picked"]) {
    for (const item of getArrayField(itemData, selectType)) {
      const itemId = getItemId(item);
      if (itemId) stats.select[itemId] = (stats.select[itemId] || 0) + 1;
    }
  }

  for (const buyType of ["Buy", "Bought", "Purchased"]) {
    for (const item of getArrayField(itemData, buyType)) {
      const itemId = getItemId(item);
      if (itemId) stats.buy[itemId] = (stats.buy[itemId] || 0) + 1;
    }
  }
}

function getArrayField(value: unknown, field: string) {
  if (!isObjectRecord(value) || !Array.isArray(value[field])) return [];
  return value[field] as unknown[];
}

function getItemId(item: unknown) {
  if (!item) return "";
  if (isObjectRecord(item)) return String(item.Name || item.name || "");
  return String(item);
}

function getItemLayer(item: unknown) {
  if (!isObjectRecord(item)) return 1;
  return Number(item.Level || item.level || item.floor || 1) || 1;
}

function parseRecordData(data: unknown): Record<string, unknown> | null {
  if (!data) return null;
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      return isObjectRecord(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  return isObjectRecord(data) ? data : null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getStringField(
  data: Record<string, unknown> | null,
  fieldNames: string[],
) {
  if (!data) return "";
  for (const fieldName of fieldNames) {
    const value = data[fieldName];
    if (value != null) return String(value);
  }
  return "";
}
