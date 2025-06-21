// Supabase 配置
export const TABLE_NAME = "save_selection";
export const BASE_URL = "https://swtxytbwwwaacdvubkgy.supabase.co";
export const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3dHh5dGJ3d3dhYWNkdnVia2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwODU1MjUsImV4cCI6MjA2NTY2MTUyNX0.ja59qjtcnOb2KEOVM-KeWDZ1KfQr2J1eld2VX8mvSWc";

// 加密配置
export const ENC_KEY_PASSPHRASE = "魔女密钥@2024";

// 全局变量
export let allData = [];
export let currentUser = null;

// DOM 元素引用
export let refreshBtn, loadingDiv, errorDiv;

// 初始化 Supabase 客户端
export let supabase = window.supabase.createClient(BASE_URL, API_KEY);
