/**
 * Cloudflare Pages Function - API 代理
 * 解决前端直接调用 Zepp API 的 CORS 问题
 */

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    
    // 获取请求来源
    const origin = request.headers.get('Origin') || '';
    
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            }
        });
    }
    
    // 只允许 POST 请求
    if (request.method !== 'POST') {
        return jsonResponse({ error: '只支持 POST 请求' }, 405, origin);
    }
    
    try {
        const body = await request.json();
        const { action, user, password, step } = body;
        
        if (action === 'login') {
            // 登录并提交步数
            const result = await loginAndSubmitStep(user, password, step);
            return jsonResponse(result, 200, origin);
        }
        
        return jsonResponse({ error: '未知操作' }, 400, origin);
        
    } catch (error) {
        return jsonResponse({ error: error.message }, 500, origin);
    }
}

// 返回 JSON 响应
function jsonResponse(data, status, origin) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': origin || '',
        }
    });
}

// Zepp API 配置
const HM_AES_KEY = 'xeNtBVqzDc6tuNTh';
const HM_AES_IV = 'MAAAYAAAAAAAAABg';

// AES 加密
async function aesEncrypt(plaintext, key, iv) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key.padEnd(16, '\0').slice(0, 16)),
        { name: 'AES-CBC' },
        false,
        ['encrypt']
    );
    
    const ivBuffer = encoder.encode(iv.padEnd(16, '\0').slice(0, 16));
    
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: ivBuffer },
        cryptoKey,
        data
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

// AES 解密
async function aesDecrypt(ciphertext, key, iv) {
    try {
        const encoder = new TextEncoder();
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(key.padEnd(16, '\0').slice(0, 16)),
            { name: 'AES-CBC' },
            false,
            ['decrypt']
        );
        
        const ivBuffer = encoder.encode(iv.padEnd(16, '\0').slice(0, 16));
        
        // 解码 base64
        const binary = atob(ciphertext);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-CBC', iv: ivBuffer },
            cryptoKey,
            bytes
        );
        
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        return null;
    }
}

// URL 编码
function urlencode(data) {
    return Object.entries(data)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

// 登录并提交步数
async function loginAndSubmitStep(user, password, step) {
    try {
        // 1. 处理账号格式
        let phone = user;
        let isPhone = true;
        if (!phone.startsWith('+86') && !phone.includes('@')) {
            phone = '+86' + phone;
        }
        if (phone.includes('@')) {
            isPhone = false;
        }
        
        // 2. 登录获取 access_token
        const loginResult = await loginAccessToken(phone, password);
        if (!loginResult.success) {
            return { success: false, message: '登录失败: ' + loginResult.error };
        }
        
        // 3. 获取 login_token 和 app_token
        const tokenResult = await grantLoginTokens(loginResult.code, isPhone);
        if (!tokenResult.success) {
            return { success: false, message: '获取令牌失败: ' + tokenResult.error };
        }
        
        // 4. 提交步数
        const submitResult = await submitStep(step, tokenResult.appToken, tokenResult.userId);
        
        return submitResult;
        
    } catch (error) {
        return { success: false, message: '执行异常: ' + error.message };
    }
}

// 登录获取 access_token
async function loginAccessToken(user, password) {
    const loginData = {
        'emailOrPhone': user,
        'password': password,
        'state': 'REDIRECTION',
        'client_id': 'HuaMi',
        'country_code': 'CN',
        'token': 'access',
        'redirect_uri': 'https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html',
    };
    
    const query = urlencode(loginData);
    const encryptedData = await aesEncrypt(query, HM_AES_KEY, HM_AES_IV);
    
    const response = await fetch('https://api-user.zepp.com/v2/registrations/tokens', {
        method: 'POST',
        body: encryptedData,
        headers: {
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'user-agent': 'MiFit6.14.0 (M2007J1SC; Android 12; Density/2.75)',
            'app_name': 'com.xiaomi.hm.health',
            'appname': 'com.xiaomi.hm.health',
            'appplatform': 'android_phone',
            'x-hm-ekv': '1',
        },
        redirect: 'manual' // 手动处理重定向
    });
    
    // Cloudflare Workers 处理重定向
    const location = response.headers.get('Location') || response.headers.get('location') || '';
    
    if (response.status === 303 || response.status === 302 || response.status === 301) {
        if (location) {
            const codeMatch = location.match(/access=([^&]+)/);
            if (codeMatch) {
                return { success: true, code: codeMatch[1] };
            }
            const errorMatch = location.match(/error=([^&]+)/);
            if (errorMatch) {
                return { success: false, error: errorMatch[1] };
            }
        }
    }
    
    // 如果不是重定向，尝试读取响应体
    try {
        const text = await response.text();
        if (text && text.length > 0) {
            // 尝试解密响应
            try {
                const decrypted = await aesDecrypt(text, HM_AES_KEY, HM_AES_IV);
                if (decrypted) {
                    // 从解密结果中提取错误信息
                    const errorMatch = decrypted.match(/error=([^&]+)/);
                    if (errorMatch) {
                        return { success: false, error: '登录失败: ' + decodeURIComponent(errorMatch[1]) };
                    }
                    return { success: false, error: '登录失败: ' + decrypted.substring(0, 50) };
                }
            } catch (e) {}
            return { success: false, error: '账号或密码错误' };
        }
    } catch (e) {}
    
    return { success: false, error: '登录请求失败，状态码: ' + response.status };
}

// 获取 login_token 和 app_token
async function grantLoginTokens(accessToken, isPhone) {
    const deviceId = crypto.randomUUID();
    
    const data = {
        'app_name': 'com.xiaomi.hm.health',
        'app_version': '6.14.0',
        'code': accessToken,
        'country_code': 'CN',
        'device_id': deviceId,
        'device_model': isPhone ? 'phone' : 'android_phone',
        'grant_type': 'access_token',
        'third_name': isPhone ? 'huami_phone' : 'email',
    };
    
    if (!isPhone) {
        data['allow_registration'] = 'false';
        data['dn'] = 'account.zepp.com,api-user.zepp.com,api-mifit.zepp.com,api-watch.zepp.com,app-analytics.zepp.com,api-analytics.huami.com,auth.zepp.com';
        data['lang'] = 'zh_CN';
        data['os_version'] = '1.5.0';
        data['source'] = 'com.xiaomi.hm.health:6.14.0:50818';
    }
    
    const response = await fetch('https://account.huami.com/v2/client/login', {
        method: 'POST',
        body: urlencode(data),
        headers: {
            'app_name': 'com.xiaomi.hm.health',
            'x-request-id': crypto.randomUUID(),
            'accept-language': 'zh-CN',
            'appname': 'com.xiaomi.hm.health',
            'cv': '50818_6.14.0',
            'v': '2.0',
            'appplatform': 'android_phone',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        }
    });
    
    const resp = await response.json();
    
    if (resp.result !== 'ok') {
        return { success: false, error: resp.result };
    }
    
    return {
        success: true,
        loginToken: resp.token_info.login_token,
        appToken: resp.token_info.app_token,
        userId: resp.token_info.user_id
    };
}

// 提交步数
async function submitStep(step, appToken, userId) {
    const t = getBeijingTime();
    const today = new Date().toISOString().split('T')[0];
    
    // 构造步数数据
    const dataJson = createStepData(step, today);
    
    const response = await fetch(`https://api-mifit-cn.huami.com/v1/data/band_data.json?&t=${t}&r=${crypto.randomUUID()}`, {
        method: 'POST',
        body: `userid=${userId}&last_sync_data_time=1597306380&device_type=0&last_deviceid=DA932FFFFE8816E7&data_json=${encodeURIComponent(dataJson)}`,
        headers: {
            'apptoken': appToken,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    
    const resp = await response.json();
    
    if (resp.message === 'success') {
        return { success: true, message: '步数修改成功', step };
    }
    
    return { success: false, message: resp.message };
}

// 获取北京时间戳
function getBeijingTime() {
    const now = new Date();
    const beijingOffset = 8 * 60;
    const localOffset = now.getTimezoneOffset();
    return Math.floor(now.getTime() + (localOffset + beijingOffset) * 60000);
}

// 创建步数数据
function createStepData(step, date) {
    // 这是一个简化版本，实际项目中使用更完整的数据结构
    const template = {
        v: 6,
        stp: {
            ttl: parseInt(step),
            dis: Math.floor(parseInt(step) * 0.6),
            cal: Math.floor(parseInt(step) * 0.03),
            wk: Math.floor(parseInt(step) / 200),
            rn: 50
        },
        tz: 28800,
        goal: 8000
    };
    
    return JSON.stringify([{
        date: date,
        summary: JSON.stringify(template),
        data_hr: '%2F%2F%2F%2F%2F%2F9L%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FVv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F0v',
        data: [{
            start: 0,
            stop: 1439,
            value: 'A'.repeat(1440)
        }],
        tz: 32,
        did: 'DA932FFFFE8816E7',
        src: 24,
        type: 0
    }]);
}
