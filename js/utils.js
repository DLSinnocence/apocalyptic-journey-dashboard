async function encryptData(data, passphrase) {
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

async function decryptData(encrypted, passphrase) {
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