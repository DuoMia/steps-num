# 小米运动刷步数

一个简单的在线刷步数工具，无需安装，直接通过网页使用。

## 在线使用

1. 部署到 Cloudflare Pages（或直接使用 GitHub Pages）
2. 打开页面，输入账号、密码和步数
3. 点击提交

## 部署到 Cloudflare Pages

1. Fork 本项目到你的 GitHub
2. 登录 [Cloudflare Pages](https://pages.cloudflare.com)
3. 选择你的 GitHub 仓库
4. 构建命令留空，输出目录填 `/`
5. 部署完成，获得访问地址

## 项目结构

```
steps-num/
├── index.html              # 前端页面
├── functions/api/
│   └── [[path]].js         # API 函数（Cloudflare Pages Functions）
├── README.md
└── LICENSE
```

## 注意事项

1. 账号是 **小米运动/Zepp Life** 账号，不是小米账号
2. 提交后需等待几秒刷新小米运动 App 查看效果
3. 步数修改后可能不会立即同步到支付宝等第三方应用

## License

MIT
