import { createClient } from "@supabase/supabase-js";

const TABLE_NAME = "save_selection";
const TABLE_NAME_ERROR = "error_selection";
const DEFAULT_ERROR_PAGE_SIZE = 100;
const MAX_ERROR_PAGE_SIZE = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Cursor = {
  offset: number;
};

type PageResult = {
  rows: Record<string, unknown>[];
  nextCursor: Cursor | null;
  hasMore: boolean;
  totalRows: number | null;
};

type DashboardMode = "summary" | "item-detail" | "errors";

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

      const { data, error } = await supabase.rpc("dashboard_item_detail", {
        item_id: itemId,
      });
      if (error) throw new Error(`dashboard_item_detail: ${error.message}`);
      return jsonResponse(data);
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

    const { data, error } = await supabase.rpc("dashboard_data_summary", {
      error_page_size: parsePageSize(body.errorPageSize),
    });
    if (error) throw new Error(`dashboard_data_summary: ${error.message}`);
    return jsonResponse(data);
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
  const offset = Number(value.offset);
  if (!Number.isFinite(offset) || offset < 0) return null;
  return { offset: Math.floor(offset) };
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

async function fetchRowsPage(
  supabase: ReturnType<typeof createClient>,
  tableName: string,
  cursor: Cursor | null,
  pageSize: number,
): Promise<PageResult> {
  const twoMonthsAgoISO = getTwoMonthsAgoISO();

  const offset = cursor?.offset || 0;
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .gte("created_at", twoMonthsAgoISO)
    .range(offset, offset + pageSize);

  const totalRows = await fetchRecentRowCount(supabase, tableName, twoMonthsAgoISO);

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
    nextCursor: hasMore ? { offset: offset + rows.length } : null,
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}