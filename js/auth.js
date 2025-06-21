import { supabase } from "./config.js";

let currentUser = null;

// 初始化认证状态监听器
export function initAuthStateListener(onAuthChange) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      // 用户已登录
      currentUser = session.user;
      console.log("用户已登录:", currentUser.email);
      onAuthChange(true); // 通知主应用用户已登录
    } else if (event === "SIGNED_OUT") {
      // 用户已登出
      currentUser = null;
      console.log("用户已登出");
      onAuthChange(false); // 通知主应用用户已登出
    }
  });
}

// 设置登录表单事件
export function setupAuthForms() {
  const loginForm = document.getElementById("login-form");
  const logoutBtn = document.getElementById("logoutBtn");

  // 登录表单提交
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

  // 登出按钮
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
    errorEl.style.display = "block"; // 强制显示
  }
}

// 获取当前用户
export function getCurrentUser() {
  return currentUser;
}
