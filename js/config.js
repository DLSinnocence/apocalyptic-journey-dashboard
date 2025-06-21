// Supabase 配置
const TABLE_NAME = "save_selection";
const BASE_URL = "https://swtxytbwwwaacdvubkgy.supabase.co";
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3dHh5dGJ3d3dhYWNkdnVia2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwODU1MjUsImV4cCI6MjA2NTY2MTUyNX0.ja59qjtcnOb2KEOVM-KeWDZ1KfQr2J1eld2VX8mvSWc";

// 加密配置
const ENC_KEY_PASSPHRASE = "魔女密钥@2024";

// 全局变量
let allData = [];
let currentUser = null;

// DOM 元素引用
let refreshBtn, loadingDiv, errorDiv;
