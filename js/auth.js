import { supabase, currentUser } from './js/config.js';

// 初始化认证状态监听器
export function initAuthStateListener() {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      currentUser = session.user;
      console.log("用户已登录:", currentUser.email);
      showAppContent();
    } else if (event === "SIGNED_OUT") {
      currentUser = null;
      console.log("用户已登出");
      showLoginForm();
    }
  });
}

// 设置登录表单事件
export function setupAuthForms() {
  const loginForm = document.getElementById("login-form");
  const logoutBtn = document.getElementById("logoutBtn");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        showLoginError("登录失败: " + error.message);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      const { error } = await supabase.auth.signOut();
      if (error) console.error("登出失败:", error);
    });
  }
}

// 显示登录错误
export function showLoginError(message) {
  const errorEl = document.getElementById("login-error");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
    errorEl.style.display = "block";
  }
}

// 显示应用内容
export function showAppContent() {
  document.getElementById("login-container").classList.add("hidden");
  document.getElementById("app-container").classList.remove("hidden");
  initTabs();
  loadData();
}

// 显示登录表单
export function showLoginForm() {
  document.getElementById("login-container").classList.remove("hidden");
  document.getElementById("app-container").classList.add("hidden");
  
  const errorEl = document.getElementById("login-error");
  if (errorEl) {
    errorEl.classList.add("hidden");
  }
}
