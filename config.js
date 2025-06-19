// config.js - 配置文件
window.AppConfig = {
  // 从环境变量获取敏感配置，如果没有则使用默认值
  API: {
    BASE_URL: window.ENV?.API_BASE_URL || null,
    API_KEY: window.ENV?.API_KEY || null,
    BACKUP_URL: window.ENV?.BACKUP_URL || null
  }
};

// 验证必要的配置是否存在
window.AppConfig.isConfigured = function() {
  return this.API.BASE_URL && this.API.API_KEY;
};