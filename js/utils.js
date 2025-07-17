// 改进的加密函数 - 修复调用栈溢出问题
export async function encryptData(data, passphrase) {
  try {
    const key = await getCryptoKey(passphrase);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // 检查数据是否包含循环引用
    let jsonString;
    try {
      jsonString = JSON.stringify(data);
    } catch (e) {
      throw new Error('数据包含循环引用，无法序列化');
    }
    
    const encoded = new TextEncoder().encode(jsonString);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key, // 直接使用 CryptoKey
      encoded
    );
    
    // 修复：使用分块处理避免调用栈溢出
    const base64Data = arrayBufferToBase64(ciphertext);
    
    return {
      iv: Array.from(iv),
      data: base64Data,
    };
  } catch (error) {
    console.error('加密失败:', error);
    throw new Error(`加密失败: ${error.message}`);
  }
}

// 改进的解密函数 - 添加错误处理
export async function decryptData(encrypted, passphrase) {
  try {
    // 验证输入参数
    if (!encrypted || !encrypted.iv || !encrypted.data) {
      throw new Error('加密数据格式无效');
    }
    
    const key = await getCryptoKey(passphrase);
    const iv = new Uint8Array(encrypted.iv);
    
    // 改进的 base64 解码
    const ciphertext = base64ToArrayBuffer(encrypted.data);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key, // 直接使用 CryptoKey
      ciphertext
    );
    
    const jsonString = new TextDecoder().decode(decrypted);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('解密失败:', error);
    throw new Error(`解密失败: ${error.message}`);
  }
}

// 修复：基础版本的密钥生成函数 - 直接返回 CryptoKey
async function getCryptoKey(passphrase) {
  try {
    const enc = new TextEncoder();
    
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(passphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode("固定盐值"), // 基础版本使用固定盐值
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    
    return key; // 直接返回 CryptoKey
  } catch (error) {
    console.error('密钥生成失败:', error);
    throw new Error(`密钥生成失败: ${error.message}`);
  }
}

// 现代版本的密钥生成函数 - 返回对象包含 key 和 salt
async function getCryptoKeyWithSalt(passphrase, salt = null) {
  try {
    const enc = new TextEncoder();
    
    // 使用随机盐值或提供的盐值
    const saltBytes = salt || crypto.getRandomValues(new Uint8Array(16));
    
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(passphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    
    return { key, salt: saltBytes };
  } catch (error) {
    console.error('密钥生成失败:', error);
    throw new Error(`密钥生成失败: ${error.message}`);
  }
}

// 修复调用栈溢出的 ArrayBuffer 转 Base64 函数
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192; // 8KB chunks
  
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  
  return btoa(binary);
}

// Base64 转 ArrayBuffer 函数
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes.buffer;
}

// 使用现代浏览器 API 的替代方案（推荐）
export async function encryptDataModern(data, passphrase) {
  try {
    const keyData = await getCryptoKeyWithSalt(passphrase);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    let jsonString;
    try {
      jsonString = JSON.stringify(data);
    } catch (e) {
      throw new Error('数据包含循环引用，无法序列化');
    }
    
    const encoded = new TextEncoder().encode(jsonString);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      keyData.key, // 使用 keyData.key
      encoded
    );
    
    // 使用 Blob 和 FileReader 处理大数据
    const blob = new Blob([ciphertext]);
    const base64String = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    return {
      iv: Array.from(iv),
      salt: Array.from(keyData.salt),
      data: base64String,
    };
  } catch (error) {
    console.error('加密失败:', error);
    throw new Error(`加密失败: ${error.message}`);
  }
}

// 对应的现代解密函数
export async function decryptDataModern(encrypted, passphrase) {
  try {
    if (!encrypted || !encrypted.iv || !encrypted.data || !encrypted.salt) {
      throw new Error('加密数据格式无效');
    }
    
    const salt = new Uint8Array(encrypted.salt);
    const keyData = await getCryptoKeyWithSalt(passphrase, salt);
    const iv = new Uint8Array(encrypted.iv);
    
    // 使用 fetch 解码 base64
    const response = await fetch(`data:application/octet-stream;base64,${encrypted.data}`);
    const ciphertext = await response.arrayBuffer();
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      keyData.key, // 使用 keyData.key
      ciphertext
    );
    
    const jsonString = new TextDecoder().decode(decrypted);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('解密失败:', error);
    throw new Error(`解密失败: ${error.message}`);
  }
}

// 工具函数：检查数据大小
export function getDataSize(data) {
  try {
    const jsonString = JSON.stringify(data);
    return {
      characters: jsonString.length,
      bytes: new TextEncoder().encode(jsonString).length,
      readable: formatBytes(new TextEncoder().encode(jsonString).length)
    };
  } catch (e) {
    return { error: '无法计算数据大小' };
  }
}

// 格式化字节大小
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 使用示例和测试函数
export async function testEncryption() {
  try {
    const testData = { 
      message: "测试数据", 
      timestamp: Date.now(),
      array: new Array(1000).fill('test')
    };
    
    console.log('原始数据大小:', getDataSize(testData));
    
    // 测试基础版本
    const encrypted = await encryptData(testData, "test-password");
    console.log('加密成功');
    
    const decrypted = await decryptData(encrypted, "test-password");
    console.log('解密成功:', decrypted);
    
    // 测试现代版本
    const encryptedModern = await encryptDataModern(testData, "test-password");
    console.log('现代加密成功');
    
    const decryptedModern = await decryptDataModern(encryptedModern, "test-password");
    console.log('现代解密成功:', decryptedModern);
    
    return true;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}