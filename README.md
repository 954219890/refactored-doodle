# 个人所得税 App — iOS 构建指南

## 📋 项目说明

本项目是一个 **PWA（Progressive Web App）**，已通过 **Capacitor** 包裹为原生 iOS 应用壳。
你可以通过以下任一 **免费方式** 构建 `.ipa` 安装包。

---

## 🚀 方式一：GitHub Actions（推荐）

最灵活的方式，利用 GitHub 免费提供的 macOS 云编译环境。

### 第 1 步：推送到 GitHub

```bash
# 在 3.1 目录下
git init
git add .
git commit -m "🎉 初始化：个人所得税 iOS 应用"
# 在 GitHub 新建一个仓库，然后：
git remote add origin https://github.com/你的用户名/个税助手-iOS.git
git push -u origin main
```

### 第 2 步：触发构建

推送到 `main` 分支后，GitHub Actions 会自动开始构建。
也可以手动触发：

1. 打开 GitHub 仓库页面
2. 点击 **Actions** 标签
3. 选择 **📱 Build iOS .ipa**
4. 点击 **Run workflow** → **Run workflow**

### 第 3 步：下载 .ipa

构建完成后（约 10-15 分钟）：

1. 进入 Actions 页面
2. 点击刚刚完成的 workflow run
3. 在底部的 **Artifacts** 区域下载 `TaxApp-iOS-xxx.zip`
4. 解压得到 `.ipa` 文件

### ⚠️ 关于签名

- **有 Apple Developer 账号（$99/年）：** 在 GitHub 仓库设置中添加 Secrets（见 workflow 文件注释），构建的 .ipa 可直接安装
- **免费 Apple 账号：** 可以构建 development 版本，需要在 Mac 上用 Xcode 手动签名，或用 **AltStore/SideStore** 侧载
- **无需签名：** 选择 `sign_type: unsigned` 手动触发构建，得到的 .xcarchive 可在 Mac 上用 `codesign` 自行签名

---

## 🌐 方式二：PWABuilder（最简单，零代码）

Microsoft 的免费工具，直接通过 URL 打包 PWA。

### 步骤：

1. **先部署 Web 应用**
   - 运行 `deploy-to-netlify.bat` 或直接把 `www` 文件夹拖到 https://app.netlify.com/drop
   - 得到类似 `https://xxx.netlify.app` 的地址

2. **打开 PWABuilder**
   - 访问 https://pwabuilder.com
   - 输入你的 Netlify 地址
   - 点击 **Start**

3. **生成 iOS 包**
   - 点击 **Package for Stores**
   - 选择 **iOS** 标签
   - 点击 **Generate iOS Package**
   - 下载生成的 `.ipa` 或 `.xcworkspace`

### 优点
- ✅ 完全免费
- ✅ 不需要 Mac
- ✅ 不需要 Apple Developer 账号
- ✅ 可生成 GitHub Actions workflow 自动构建

---

## 🛠️ 方式三：Codemagic（免费 500 分钟/月）

专为移动应用设计的 CI/CD，完美支持 Capacitor。

### 步骤：

1. 将代码推送到 GitHub/GitLab/Bitbucket
2. 打开 https://codemagic.io
3. 使用 GitHub 账号登录
4. 点击 **Add application** → 选择你的仓库
5. 在 **Build configuration** 中选择 **Capacitor App**
6. 在 **iOS code signing** 中上传你的 Apple 签名证书（或使用自动签名）
7. 点击 **Start build**

免费额度：每月 500 分钟 macOS 构建时间。

---

## 📱 安装 .ipa 到 iPhone

### 方法 A：通过 Xcode（需要 Mac）

1. 连接 iPhone 到 Mac
2. 打开 Xcode → Window → Devices and Simulators
3. 将 `.ipa` 拖到设备列表中

### 方法 B：通过 AltStore（免费侧载）

1. 在电脑安装 [AltServer](https://altstore.io)
2. iPhone 上安装 AltStore
3. 通过 AltStore 侧载 `.ipa`

### 方法 C：通过 TestFlight（需要开发者账号）

开发者可以将构建上传到 App Store Connect，通过 TestFlight 分发。

---

## 🧩 PWA 直接使用（最简单、无门槛）

如果只是想在 iPhone 上用，**不需要 .ipa**：

1. 将 `www` 文件夹部署到 Netlify（运行 `deploy-to-netlify.bat`）
2. iPhone Safari 打开部署后的网址
3. 点击底部分享按钮 → **添加到主屏幕**
4. 就像原生 App 一样离线可用 ✅

---

## 📁 项目结构

```
3.1/
├── www/                         # PWA 前端代码
│   ├── index.html              # 主页面
│   ├── new_tab_page.js         # 应用主逻辑
│   ├── sw.js                   # Service Worker（离线缓存）
│   ├── manifest.webmanifest    # PWA 配置
│   └── assets/                 # 图片资源
├── ios/                        # Xcode 项目（Capacitor 生成）
├── capacitor.config.json       # Capacitor 配置
├── .github/workflows/          # CI 构建配置
│   └── build-ios.yml           # GitHub Actions iOS 构建
└── README.md                   # 本文件
```

---

## 🔧 本地开发

```bash
# 启动本地 HTTP 服务器
python start-local-server.py

# 或 HTTPS 版本（用于 iPhone 测试）
python serve-https.py 4433

# 同步 Web 变更到 iOS 项目
npx cap sync ios

# 在连接的 Mac 上构建运行
npx cap open ios
```

---

## 🖥️ 系统要求

- **构建 .ipa：** macOS + Xcode 15+（在 GitHub Actions 上免费提供）
- **开发测试：** 任意系统，浏览器即可
- **部署：** 任意系统，Netlify 免费托管
