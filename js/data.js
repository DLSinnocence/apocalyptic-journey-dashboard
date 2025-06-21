import { supabase, TABLE_NAME, ENC_KEY_PASSPHRASE, allData } from './js/config.js';
import { updateUI } from './js/ui.js';
import { showLoading, hideError, showError } from './js/utils.js';

// 加载数据
export async function loadData(forceRefresh = false) {
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

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("*")
      .order("create_at", { ascending: false })
      .limit(1000);

    if (error) throw new Error(`数据获取失败: ${error.message}`);
    if (!data || data.length === 0) throw new Error("没有获取到任何数据");

    allData = data;
    console.log("✅ 数据加载成功，保存到缓存");

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

// 加密/解密函数
async function getCryptoKey(passphrase) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("固定盐值"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptData(data, passphrase) {
  const key = await getCryptoKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  return {
    iv: Array.from(iv),
    data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  };
}

export async function decryptData(encrypted, passphrase) {
  const key = await getCryptoKey(passphrase);
  const iv = new Uint8Array(encrypted.iv);
  const ciphertext = Uint8Array.from(atob(encrypted.data), (c) =>
    c.charCodeAt(0)
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}
