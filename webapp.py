# -*- coding: utf-8 -*-
"""
StepSync Web 管理界面
提供可视化配置界面，替代 GitHub Actions Secrets 配置
"""
import os
import json
import subprocess
from datetime import datetime
from flask import Flask, request, jsonify, send_file

app = Flask(__name__)
app.secret_key = os.urandom(24)

CONFIG_FILE = 'config.json'
INDEX_FILE = 'index.html'

def load_config():
    """加载配置文件"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return {
        'USER': '',
        'PWD': '',
        'MIN_STEP': '18000',
        'MAX_STEP': '25000',
        'PUSH_PLUS_TOKEN': '',
        'PUSH_WECHAT_WEBHOOK_KEY': '',
        'TELEGRAM_BOT_TOKEN': '',
        'TELEGRAM_CHAT_ID': ''
    }

def save_config(data):
    """保存配置文件"""
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def desensitize(text, length=4):
    """脱敏显示"""
    if not text or len(text) < 4:
        return '***'
    return text[:length] + '***' if '@' not in text else text[:3] + '***' + text[text.rfind('@'):]

def run_step_sync():
    """执行步数同步"""
    try:
        config = load_config()
        
        # 构建 CONFIG JSON
        config_json = {
            'USER': config['USER'],
            'PWD': config['PWD'],
            'MIN_STEP': config['MIN_STEP'],
            'MAX_STEP': config['MAX_STEP'],
            'PUSH_PLUS_TOKEN': config.get('PUSH_PLUS_TOKEN', ''),
            'PUSH_PLUS_HOUR': '',
            'PUSH_PLUS_MAX': '30',
            'PUSH_WECHAT_WEBHOOK_KEY': config.get('PUSH_WECHAT_WEBHOOK_KEY', ''),
            'TELEGRAM_BOT_TOKEN': config.get('TELEGRAM_BOT_TOKEN', ''),
            'TELEGRAM_CHAT_ID': config.get('TELEGRAM_CHAT_ID', ''),
            'SLEEP_GAP': '5',
            'USE_CONCURRENT': 'False'
        }
        
        # 设置环境变量并执行
        env = os.environ.copy()
        env['CONFIG'] = json.dumps(config_json)
        
        result = subprocess.run(
            ['python', 'main.py'],
            capture_output=True,
            text=True,
            env=env,
            timeout=120
        )
        
        return {
            'success': result.returncode == 0,
            'stdout': result.stdout,
            'stderr': result.stderr
        }
    except subprocess.TimeoutExpired:
        return {'success': False, 'stdout': '', 'stderr': '执行超时'}
    except Exception as e:
        return {'success': False, 'stdout': '', 'stderr': str(e)}

@app.route('/')
def index():
    """主页"""
    return send_file(INDEX_FILE)

@app.route('/api/config', methods=['GET'])
def get_config():
    """获取配置（脱敏）"""
    config = load_config()
    return jsonify({
        'USER': desensitize(config.get('USER', '')),
        'PWD': '***' if config.get('PWD') else '',
        'MIN_STEP': config.get('MIN_STEP', '18000'),
        'MAX_STEP': config.get('MAX_STEP', '25000'),
        'PUSH_PLUS_TOKEN': '***' if config.get('PUSH_PLUS_TOKEN') else '',
        'PUSH_WECHAT_WEBHOOK_KEY': '***' if config.get('PUSH_WECHAT_WEBHOOK_KEY') else '',
        'TELEGRAM_BOT_TOKEN': '***' if config.get('TELEGRAM_BOT_TOKEN') else '',
        'TELEGRAM_CHAT_ID': '***' if config.get('TELEGRAM_CHAT_ID') else ''
    })

@app.route('/api/config', methods=['POST'])
def update_config():
    """保存配置"""
    data = request.get_json()
    
    required = ['USER', 'PWD', 'MIN_STEP', 'MAX_STEP']
    for field in required:
        if not data.get(field):
            return jsonify({'success': False, 'message': f'{field} 不能为空'}), 400
    
    save_config(data)
    return jsonify({'success': True, 'message': '配置已保存'})

@app.route('/api/run', methods=['POST'])
def execute():
    """执行步数同步"""
    if not load_config().get('USER'):
        return jsonify({'success': False, 'message': '请先配置账号信息'}), 400
    
    result = run_step_sync()
    return jsonify(result)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"""
╔═══════════════════════════════════════════════════╗
║          StepSync Web 管理界面                   ║
║   访问地址: http://0.0.0.0:{port}                    ║
║   按 Ctrl+C 停止服务                             ║
╚═══════════════════════════════════════════════════╝
    """)
    app.run(host='0.0.0.0', port=port, debug=False)
