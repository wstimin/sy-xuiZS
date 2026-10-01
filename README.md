# sy-xuiZS

`sy-xuiZS` 是一个带用户端和管理端的 3x-ui 商业部署助手。它保留原有 SSH、3x-ui API、节点创建和 SOCKS5 路由逻辑，并在执行入口增加订单、权益和搭建次数控制。

正式仓库：<https://github.com/wstimin/sy-xuiZS>

## 1Panel 网页安装（无需命令）

使用 1Panel 的用户可以直接下载网站目录专属包，在 1Panel 网页中创建网站、上传解压并通过 Node.js 运行环境启动，不需要登录服务器终端执行命令。

- [下载永久最新版 1Panel 安装包](https://github.com/wstimin/sy-xuiZS/releases/download/1panel-latest/xui-deploy-assistant-1panel.zip)
- [查看 1Panel 专属部署说明](./1PANEL部署说明.md)
- [查看 1Panel 永久发布页面](https://github.com/wstimin/sy-xuiZS/releases/tag/1panel-latest)

基本流程：先创建静态网站和域名，将 ZIP 解压到网站根目录；再用 1Panel 的 Node.js 20 运行环境启动该目录，并把网站反向代理到 `http://127.0.0.1:1888`。访问域名后会直接进入管理员初始化向导，业务数据保存在网站目录的 `data` 子目录中。

## 主要能力

- 使用 SSH 密码或私钥连接 VPS，检测系统、架构、systemd、内存和权限。
- 安装 3x-ui，并显示精简的阶段进度，不向浏览器暴露完整脚本输出。
- 可自定义面板管理员用户名和密码；留空时自动生成安全凭据，同时自动生成面板端口和 Web 路径。
- 面板搭建完成后自动带入 API Token，节点创建直接调用管理 API。
- 创建 VLESS、VMess、Trojan、Shadowsocks 入站和分享链接。
- Reality 密钥对由目标 3x-ui 面板实时生成。
- TLS 节点复用面板安装阶段读取的 Web 证书路径，页面不要求手工填写证书路径。
- 可向当前 Xray 模板注入 SOCKS5 出站、入站路由和多代理随机负载均衡。
- 部署历史敏感详情按用户隔离并仅保存在创建任务的当前浏览器；服务器只保留脱敏摘要，不保存密码、Token、分享链接或节点密钥。
- 用户可使用邮箱注册、登录和找回密码，并在永久有效权益仍有剩余次数时直接执行面板或节点搭建。
- 管理员可手动配置永久次数套餐的价格、面板次数、节点次数和并发限制。
- 支持聚合支付自动收款；金额卡密可充值余额，也可在购买套餐时直接抵扣，支付成功后按订单快照自动发放权益。
- 支持通过标准 JSON 接口对接第三方卡密系统；本地卡密优先匹配，第三方密钥加密保存，并使用幂等键和本地核销记录防止重复入账。
- 管理后台可配置 SMTP、邮箱验证码、支付渠道、站点资料、管理员用户名和管理入口后缀。
- 管理后台显示当前版本，可检查官方最新版本；受管 Linux 安装可从网页启动带 SHA256 校验、更新前备份与失败回滚的一键更新。
- 管理后台可下载带密码加密的 `.xuibak` 完整备份，在使用不同商业配置密钥的新服务器上直接上传恢复业务数据与敏感配置。
- 搭建成功扣除次数，明确失败退还次数，结果不确定时保留占用并交由管理员处理。

## 一键安装助手

支持 Ubuntu 20.04+、Debian 11+、CentOS 8+、Rocky Linux 和 AlmaLinux。请先切换到 `root` 用户，然后执行以下命令打开原有交互菜单：

```bash
bash <(curl -fsSL --retry 3 https://raw.githubusercontent.com/wstimin/sy-xuiZS/main/install.sh)
```

需要跳过菜单、直接执行安装或更新时使用：

```bash
bash <(curl -fsSL --retry 3 https://raw.githubusercontent.com/wstimin/sy-xuiZS/main/install.sh) install
```

上述 `raw.githubusercontent.com` 地址只用于获取管理脚本。GitHub Actions 会在远端执行测试、类型检查和生产构建，并生成 Linux 生产构建包；每次推送到 `main` 后还会更新滚动的 `latest` 生产 Release，管理脚本随后从 GitHub Latest Release 下载 `xui-zhushou-linux.tar.gz` 和 `SHA256SUMS`。VPS 不会下载应用源码，也不会执行 Vite、TypeScript 或其他源码构建。默认访问地址为：

```text
http://服务器IP:1888
```

云厂商安全组需要放行助手端口，默认为 `1888/tcp`。申请助手自身的域名证书时还需要临时放行 `80/tcp`。

安装完成后可以运行 `sy` 打开管理菜单：

```text
[1] 安装或更新助手（下载远端生产构建包）
[2] 仅为助手申请域名 SSL 证书并推送到面板
[3] 查看服务与证书状态
[4] 检查服务器环境
[5] 诊断域名访问
[6] 修改管理员用户名 / 重置管理密码
[7] 卸载助手
```

也可以显式运行 `sy menu` 调出同一菜单；即使通过非交互命令转发调用，也不会误触发安装更新。

常用维护命令：

```bash
sy
pm2 status
pm2 logs 3xui-deploy-assistant
sudo bash /opt/3xui-deploy-assistant/install.sh install
```

一键脚本默认从 GitHub Releases 下载 `xui-zhushou-linux.tar.gz`，通过 `SHA256SUMS` 校验完整性后部署到 `/opt/3xui-deploy-assistant`。通过 `sy` 或 `sudo bash install.sh install` 更新时，会保留现有 `.env`、`/var/lib/xui-assistant/app.db` 数据库、数据库旁可能存在的 `app.db.key` 商业配置加密密钥和 `/etc/3xui-assistant/ssl` 证书目录，仅替换应用构建包并重启 PM2。升级前会将数据库及其现有加密密钥备份到 `/var/backups/xui-assistant`，新构建包启动失败或运行版本校验不一致时会自动恢复上一版本。

默认页面入口：

```text
/           官网首页
/login      用户登录
/register   用户注册
/console    用户控制台
/admin      管理后台（后缀可在管理后台修改）
```

检查服务器当前代码和运行版本：

```bash
cat /opt/3xui-deploy-assistant/VERSION
curl -s http://127.0.0.1:1888/api/health
```

菜单 `[3]` 会显示管理员用户名、真实管理入口、注册/搭建开关、SMTP 和支付渠道状态。密码采用不可逆哈希保存，因此不会显示明文；忘记密码时使用菜单 `[6]` 安全重置，重置后旧管理端会话会全部失效。

`VERSION` 与健康检查返回的 `version` 应一致。当前商业版版本为 `3.0.22`。

### v3.0.22 更新内容

- 客服联系方式改为自适应卡片列表，彻底移除弹窗内不必要的横向滚动。
- 二维码缩为紧凑缩略图，上传、更换、删除、编辑操作集中排列，窄屏自动切换双列或单列布局。
- 系统设置入口统一字体、字号、间距和点击反馈，移除右侧孤立的“设置”文字。
- “发件身份”和“邮件检测”调整为更直观的“发件人信息”和“发送测试邮件”。

### v3.0.21 更新内容

- 优化第三方卡密配置的启停交互：底部统一显示“保存配置”，不再使用容易误解的“保存为停用”。
- 停用状态新增醒目的“启用并保存”入口，管理员无需返回顶部寻找开关。
- 验卡结果明确提示当前是否已启用，避免验卡通过后用户端仍无法兑换却无法判断原因。

### v3.0.20 更新内容

- 修复十夜卡密被误送入本地 `XUI-XXXX-...` 格式校验的问题；第三方核销停用时会返回明确的管理配置提示。
- 卡密设置弹窗支持直接保存，新增十夜卡密只读验卡按钮，通过 `/verify` 检查卡状态和金额而不激活、绑定或核销。
- 修复从无需鉴权的通用接口切换到十夜模式时 App Secret 可能被清空的问题。
- 面板安装与节点创建统一使用炫彩进度条和多色步骤卡片，增强当前状态反馈并支持减少动态效果。

### v3.0.19 更新内容

- 恢复 SSH 环境检测的彩色状态卡片，并重做安装进度、步骤状态和错误提示的炫彩视觉。
- 面板连接失败时区分端口拒绝、连接超时、DNS 与 TLS 证书问题，避免仅显示 `fetch failed`。
- 修复管理后台设置开关样式缺失问题，第三方卡密核销现在明确显示“已启用 / 未启用”。

## 远端构建与发布

推送到 `main` 后，GitHub Actions 会自动执行测试、类型检查、安装脚本语法检查、生产构建、纯生产依赖启动测试与构建包校验，并把构建包保存为工作流产物。推送与 `package.json` 版本一致的标签（例如 `v3.0.22`）时，会自动创建 GitHub Release，永久保留该版本的一键部署包和 1Panel 网站目录包：

```text
xui-zhushou-linux-v3.0.22.tar.gz
xui-zhushou-linux.tar.gz
xui-deploy-assistant-1panel-3.0.22.zip
SHA256SUMS
SHA256SUMS-1panel
```

一键安装脚本固定下载 `releases/latest/download/xui-zhushou-linux.tar.gz`，因此新标签发布完成后，所有服务器通过菜单 `[1]` 更新时都会拉取同一份已经验证的生产构建包。

每次发布都必须递增 `package.json` 的版本号，并让 `package-lock.json`、发布标签和生成的 `VERSION` 保持一致；禁止复用已有版本标签。推荐使用补丁版本递增（例如 `3.0.15` → `3.0.16`），只有存在不兼容 API 或数据迁移时才提升主/次版本号。旧版本通过 Git 标签和带版本号的 Release 永久保留。

## 3x-ui 安装脚本

这里有两个不同用途的 `install.sh`，不要混淆：

- `sy-xuiZS/install.sh`：安装和管理本 Web 助手。
- 远程安装面板：本助手固定使用官方脚本。

安装完成后，助手会通过官方 `x-ui setting` 命令写入用户填写或助手生成的用户名、密码、端口和 Web 路径，并在确认命令返回成功后重启服务。后端读取面板的实际证书状态、证书路径和 API Token；没有现成 Token 时会在安装完成后读取一次。安装成功弹窗会显示实际生效的账号密码与 Token，并在跳转“搭建节点”时自动填写 Token 和 TLS 证书路径。

非 root SSH 用户必须具备 `sudo -n` 免密 sudo 权限。

## 节点与鉴权

支持的主要组合：

- `VLESS + TCP + Reality`
- VLESS、VMess、Trojan 配合 TCP、WebSocket、gRPC、mKCP，并按协议规则选择 None 或 TLS
- `Shadowsocks + TCP + None`

当前 Reality 稳定实现限定为 `VLESS + TCP`。

节点创建要求提供 API Token，并直接使用 `Authorization: Bearer <token>` 调用 `/panel/api/**`，不再执行重复登录、认证检查、Token 获取或设置读取。普通协议和 TLS 通常只发起一次创建请求；Reality 额外调用一次面板密钥生成接口。TLS 直接复用面板安装阶段读取的证书路径。只有配置 SOCKS 链式路由时，才会使用账号密码 Session 读写 Xray 全局配置。本项目不使用 2FA 输入。

## TLS 证书复用

TLS 节点要求目标 3x-ui 面板已经配置可用的 Web TLS 证书。面板搭建完成后，助手会读取一次：

```text
POST /panel/setting/defaultSettings
```

接口返回的 `defaultCert` 和 `defaultKey` 是目标服务器上的真实路径。它们会随安装结果带入节点页面，并直接写入新入站的 `tlsSettings.certificates`，正式创建时不会再次请求。手动录入旧面板且没有缓存路径时，页面保留一次性读取按钮。

页面不会提供服务器证书路径输入框。默认 SNI 使用面板连接域名；如果面板通过 IP 访问但证书签发给域名，可以只填写证书域名作为 SNI。

## 环境配置

本地开发和生产部署支持 Node.js 20 或 22。受管 Linux 安装会在系统同时存在 Node.js 24 等其他版本时，自动优先选择 `/usr/bin/node` 等路径中的受支持版本；如果没有找到 20/22，会在错误信息中列出检测到的 Node 路径：

```bash
npm ci
npm run dev
```

生产检查与构建：

```bash
npm run test
npm run lint
npm run build
npm start
```

复制 `.env.example` 为 `.env` 后可设置：

```env
PORT=1888
APP_AUTH_TOKEN=
DATABASE_PATH=/var/lib/xui-assistant/app.db
SESSION_COOKIE_SECURE=
COMMERCIAL_SECRET_KEY=
SSL_CERT=
SSL_KEY=
```

- `PORT`：助手监听端口，安装脚本会同步用于防火墙和访问提示。
- `APP_AUTH_TOKEN`：可选的助手 API 保护。设置后，请由受信任的反向代理添加 `Authorization: Bearer <token>` 或 `X-App-Token` 请求头。
- `DATABASE_PATH`：用户、订单、权益和任务数据库路径。正式安装默认放在应用目录之外，升级不会覆盖。
- `SESSION_COOKIE_SECURE`：使用 HTTPS 时建议设为 `true`；留空时按当前请求协议自动判断。
- `COMMERCIAL_SECRET_KEY`：可选的 SMTP 密码、支付商户密钥加密主密钥。应在保存商业敏感配置前设置并长期保持不变；留空时会先复用 `APP_AUTH_TOKEN`，两者都为空时程序才会自动创建并复用数据库旁的 `app.db.key`。
- `SSL_CERT` / `SSL_KEY`：助手自身 HTTPS 证书路径。两者留空时，服务端也会自动检查 `/etc/3xui-assistant/ssl/cert.pem` 和 `/etc/3xui-assistant/ssl/key.pem`。

## 第三方卡密系统

在“管理后台 → 系统设置 → 业务设置 → 卡密与第三方系统”中配置核销接口。系统始终先查询本地卡密；本地不存在且第三方功能已启用时，才会从服务端调用第三方接口。

### 十夜卡密原生适配

接口类型选择“十夜卡密（原生适配）”，填写：

- 十夜卡密服务地址，例如 `http://服务器IP:1111` 或其 HTTPS 域名；
- 在十夜卡密后台“项目管理”中创建项目后获得的 `app_key`；
- 仅展示一次的 `app_secret`。

助手会按照十夜卡密文档生成 `X-App-Key / X-Timestamp / X-Nonce / X-Sign` HMAC-SHA256 签名，并调用 `/api/v1/card/activate` 原子激活卡密。该接入只接受十夜卡密中的“金额卡”，其 `data.amount` 按元换算为账户余额；时长卡、次数卡和永久卡不会被误当作金额充值。若激活响应中断、重试时返回“卡密已被使用”，助手会调用 `/api/v1/card/query` 核对是否已经归属当前项目，再尝试完成本地入账。

建议为本助手单独创建一个十夜卡密项目，并根据实际部署配置出口 IP 白名单。这样已归属该项目的金额卡只用于本助手，便于超时恢复和对账。

### 通用 JSON 适配

请求方法为 `POST`，请求体为：

```json
{
  "code": "用户输入的卡密",
  "requestId": "同一卡密稳定不变的幂等键",
  "userId": "本系统用户 ID",
  "username": "本系统用户名",
  "planId": "用户当前准备购买的套餐 ID，可为空"
}
```

鉴权可选择 `Authorization: Bearer <API_KEY>`、`X-API-Key: <API_KEY>` 或无鉴权。请求同时携带 `X-Idempotency-Key`，第三方系统应按该值实现幂等核销：同一请求重试时返回同一核销结果，不能重复消耗卡密。

成功响应：

```json
{
  "success": true,
  "amountCents": 990,
  "tradeNo": "CARD-TRADE-20260001"
}
```

`success`、`amountCents`、`amount` 和 `tradeNo` 也可以放在 `data` 对象中。使用 `amount` 时按后台选择的“分/元”单位换算；`amountCents` 始终按分处理。失败时返回 `{ "success": false, "message": "原因" }`，并建议使用合适的非 2xx HTTP 状态。

为避免第三方已经核销但本地权益不足导致金额丢失，当第三方卡密金额与当前余额不足以购买所选套餐时，系统会先将卡密金额充入余额并提示差额。默认禁止接口地址解析到环回或私网；只有第三方系统确实部署在可信内网时，才应开启“允许访问内网接口”。

## SOCKS 路由

SOCKS 功能修改的是 3x-ui 全局 Xray 模板，不只是单个入站。助手会保留原模板并使用唯一 tag 添加出站和路由；后续步骤失败时会尝试恢复原模板并删除刚创建的入站。修改前仍建议在 3x-ui 中备份配置。

支持以下输入格式：

```text
socks5://user:password@127.0.0.1:1080
127.0.0.1:1080:user:password
127.0.0.1:1080
```

## 安全说明

SSH 密码、私钥、面板密码和 API Token 都会经过助手后端。不要在不可信网络中通过明文 HTTP 使用公开部署的助手。公网部署建议启用助手自身 HTTPS，并限制来源 IP，或放在带认证的 HTTPS 反向代理之后。

助手会尝试放行 VPS 本机防火墙，但无法可靠修改云厂商安全组。助手端口、3x-ui 面板端口以及创建的节点入站端口仍需在云控制台手工放行。

## 验证范围

仓库包含后端单元测试，覆盖商业账户与订单流程、权益发放、面板与节点独立配额、并发保护、不确定任务处理，以及原有 URL 与端口验证、Shell 转义、安装命令、Reality/TLS 入站、订阅 URL 和 SOCKS 模板注入。发布检查还包括 TypeScript 类型检查、Vite/服务端生产构建、纯生产包启动测试和 `install.sh` Bash 语法检查。

自动验证不会连接真实 VPS，也不会向真实 3x-ui 面板写入配置。
