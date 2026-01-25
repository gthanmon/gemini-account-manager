/**
 * TOTP (Time-based One-Time Password) 生成器
 * 实现 RFC 6238 标准
 */

/**
 * Base32 解码
 * @param {string} base32 - Base32 编码的字符串
 * @returns {Uint8Array} 解码后的字节数组
 */
function base32Decode(base32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleanedBase32 = base32.toUpperCase().replace(/=+$/, '');

    let bits = '';
    for (let i = 0; i < cleanedBase32.length; i++) {
        const val = alphabet.indexOf(cleanedBase32[i]);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }

    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
    }

    return bytes;
}

/**
 * 生成 TOTP 验证码
 * @param {string} secret - Base32 编码的密钥
 * @param {number} timeStep - 时间步长(秒),默认 30
 * @returns {Promise<string>} 6 位验证码
 */
export async function generateTOTP(secret, timeStep = 30) {
    try {
        // 解码 Base32 密钥
        const key = base32Decode(secret);

        // 计算时间计数器
        const epoch = Math.floor(Date.now() / 1000);
        const counter = Math.floor(epoch / timeStep);

        // 将计数器转换为 8 字节数组(大端序)
        const counterBytes = new ArrayBuffer(8);
        const counterView = new DataView(counterBytes);
        counterView.setUint32(4, counter, false);

        // 导入密钥
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key,
            { name: 'HMAC', hash: 'SHA-1' },
            false,
            ['sign']
        );

        // 计算 HMAC-SHA1
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBytes);
        const signatureArray = new Uint8Array(signature);

        // 动态截断
        const offset = signatureArray[signatureArray.length - 1] & 0x0f;
        const binary =
            ((signatureArray[offset] & 0x7f) << 24) |
            ((signatureArray[offset + 1] & 0xff) << 16) |
            ((signatureArray[offset + 2] & 0xff) << 8) |
            (signatureArray[offset + 3] & 0xff);

        // 生成 6 位数字
        const otp = (binary % 1000000).toString().padStart(6, '0');

        return otp;
    } catch (error) {
        console.error('TOTP generation error:', error);
        return null;
    }
}

/**
 * 获取当前验证码及剩余时间
 * @param {string} secret - Base32 编码的密钥
 * @returns {Promise<Object>} {code: string, remaining: number}
 */
export async function getCurrentTOTP(secret) {
    const code = await generateTOTP(secret);
    const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);

    return {
        code,
        remaining
    };
}
