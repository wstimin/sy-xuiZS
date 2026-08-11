# 1Panel 专属部署说明

本文档适用于 X-UI 搭建助手的 **1Panel 网站目录专属包**。正确部署顺序是：

```text
创建静态网站 -> 上传并解压部署包 -> 创建 Node.js 运行环境
-> 给网站设置反向代理 -> 访问域名进入管理员初始化向导
```

这个 ZIP 不是 1Panel 应用商店包，不要上传到 `resource/apps/local`，也不需要在“已装应用”中寻找 X-UI 搭建助手。整个部署过程均可在 1Panel 网页完成，不需要执行终端命令。

## 下载地址

- 永久最新版：[xui-deploy-assistant-1panel.zip](https://github.com/wstimin/sy-xuiZS/releases/download/1panel-latest/xui-deploy-assistant-1panel.zip)
- 永久发布页：[1panel-latest](https://github.com/wstimin/sy-xuiZS/releases/tag/1panel-latest)
- SHA256 校验：[SHA256SUMS](https://github.com/wstimin/sy-xuiZS/releases/download/1panel-latest/SHA256SUMS)

每个正式版本的发布页还会永久保留带版本号的 ZIP，例如 `xui-deploy-assistant-1panel-3.0.7.zip`。固定文件名始终指向最近一次构建成功的版本，旧版本发布包不会被覆盖或删除。

## 一、运行环境

### 必要条件

- 推荐使用最新稳定版 1Panel。
- Linux 服务器架构为 `amd64/x86_64`。
- 1Panel 已安装 OpenResty 网站环境。
- 1Panel 应用商店中可以安装 Node.js 20 运行环境。
- 服务器可以访问 npm 软件源，用于第一次安装生产依赖。
- 服务器可以通过 SSH 和目标面板/API 端口连接要搭建的客户 VPS。

### 建议配置

```text
CPU：最低 1 核
内存：最低 512 MB，建议 1 GB 或以上
磁盘：至少预留 2 GB，并额外预留业务数据和备份空间
Node.js：20.x
应用端口：1888
```

Node.js 由 1Panel 运行环境提供，宿主机不需要手工安装 Node.js、npm 或 PM2。

## 二、创建网站

1. 登录 1Panel，进入“网站”。
2. 点击“创建网站”。
3. 选择 **静态网站**，不要选择“一键部署”。
4. 填写主域名，例如 `xui.example.com`。
5. 填写代号，例如 `xui-assistant`。代号会用于生成网站目录。
6. 其他域名、备注和 FTP 根据实际需要填写。
7. 点击“确认”，先让 1Panel 创建域名、Nginx 配置和网站目录。

创建完成后，进入该网站的设置并确认网站根目录。不同 1Panel 版本和 OpenResty 安装位置可能不同，因此后续应以面板实际显示的目录为准。

常见目录形式类似：

```text
/opt/1panel/apps/openresty/openresty/www/sites/xui-assistant/index
```

## 三、上传和解压部署包

1. 在网站设置中点击网站目录，或进入 1Panel“文件”管理器打开网站根目录。
2. 上传 `xui-deploy-assistant-1panel.zip`。
3. 使用文件管理器的解压功能，直接解压到网站根目录。
4. 解压完成后确认 `package.json` 位于网站根目录顶层。

正确结构：

```text
网站根目录/
  package.json
  package-lock.json
  start.cjs
  VERSION
  .npmrc
  .env.example
  1PANEL部署说明.md
  dist/
    server.cjs
    index.html
  data/
```

错误结构：

```text
网站根目录/xui-deploy-assistant-1panel/package.json
```

如果解压后多了一层文件夹，请把该文件夹内的全部文件移动到网站根目录。运行环境选择的代码目录必须是 **直接包含 `package.json` 的目录**。

压缩包可以在任意网站目录中使用，不依赖固定的 `/opt/1panel` 路径。

## 四、创建 Node.js 20 运行环境

进入 1Panel 的“网站 -> 运行环境”，选择 Node.js 并创建运行环境。不同版本的字段排列可能略有差异，按下面填写即可。

### 基本配置

```text
名称：xui-assistant
运行环境：Node.js 20.x
代码目录：刚才解压部署包的网站根目录
容器名称：xui-assistant
包管理器：npm
安装 node_modules：开启
软件源：https://registry.npmjs.org/
```

如果服务器访问 npm 官方源较慢，可以将软件源换成 1Panel 提供的可用镜像源。

### 启动脚本

压缩包中的 `package.json` 已经提供 `start` 脚本：

```text
自定义脚本：关闭
运行脚本：start
```

如果当前 1Panel 版本没有识别到脚本，也可以开启“自定义脚本”并填写：

```text
npm run start
```

这只是填写在网页表单中的启动配置，不需要登录终端执行。

### 端口配置

在运行环境的“端口”选项中添加：

```text
外部端口：1888
应用端口：1888
协议：tcp
允许外部访问：关闭
```

关闭“允许外部访问”后，1Panel 会把端口监听在 `127.0.0.1`，只供本机 OpenResty 反向代理使用，更适合正式环境。

如果服务器的 `1888` 已被占用，可以把 **外部端口** 改成其他未占用端口，例如 `1889`，但 **应用端口仍保持 `1888`**。后续反向代理地址要使用修改后的外部端口。

### 环境变量

正常情况下无需新增环境变量，`start.cjs` 已提供以下默认值：

```text
NODE_ENV=production
PORT=1888
DATABASE_PATH=网站根目录/data/app.db
APP_VERSION=压缩包内 VERSION 的版本号
```

需要自定义时，可以在运行环境的“环境变量”中覆盖这些值。不要把 `DATABASE_PATH` 设置到会在更新时被删除的临时目录。

填写完成后点击“确认”，等待 1Panel 安装生产依赖并启动运行环境。第一次启动需要下载依赖，耗时取决于服务器网络。

## 五、设置网站反向代理

Node.js 运行环境启动后：

1. 返回“网站”，打开刚才创建的网站设置。
2. 进入“反向代理”。部分版本位于“基本设置 -> 反向代理”。
3. 点击“创建反向代理”。
4. 代理名称填写 `xui-assistant`。
5. 代理地址填写：

```text
http://127.0.0.1:1888
```

6. 发送域名通常保持默认值或使用 `$host`。
7. 保存并启用反向代理。

如果运行环境的外部端口改成了 `1889`，代理地址相应改为：

```text
http://127.0.0.1:1889
```

反向代理生效后，不需要删除静态网站创建时的默认首页；域名根路径会由反向代理交给 X-UI 搭建助手处理。

## 六、访问安装向导

现在打开创建网站时填写的域名：

```text
http://xui.example.com
```

全新数据目录会直接显示管理员初始化页面。按照页面提示创建第一个管理员账号，随后登录管理后台完成站点、套餐、支付、SMTP 和联系方式配置。

如果打开的是 1Panel 默认静态页面：

- 检查反向代理是否已经创建并启用。
- 检查代理路径是否为 `/`。
- 检查代理地址是否使用了运行环境的 **外部端口**。

如果打开的是管理员登录页而不是初始化页，说明 `data` 目录内已经存在初始化过的数据库。

## 七、配置 HTTPS

1. 确认域名 DNS 已解析到当前服务器。
2. 在网站的 HTTPS 设置中申请或上传证书。
3. 启用 HTTPS。
4. 确认 `https://你的域名` 可以正常访问后，再开启强制 HTTPS。

应用会识别 1Panel 反向代理传入的 HTTPS 协议头，并自动使用安全会话 Cookie。运行环境端口只需监听 `127.0.0.1`，公网安全组通常只需放行 `80/tcp` 和 `443/tcp`。

## 八、首次业务配置顺序

建议按下面顺序配置：

1. 创建第一个管理员账号。
2. 设置站点名称、官网文案、联系方式和客服二维码。
3. 设置用户注册开关。
4. 配置 SMTP、验证码和邮件通知。
5. 配置支付渠道并测试支付回调。
6. 创建套餐，设置价格、有效期、面板次数、节点次数和官网展示开关。
7. 使用测试 VPS 验证 SSH、目标面板端口和节点任务。
8. 确认域名、HTTPS、支付和邮件都正常后再正式开放。

## 九、目标 VPS 网络要求

搭建助手运行在 1Panel 的 Node.js 容器中，需要从当前服务器主动连接客户 VPS：

- 客户 VPS 的 SSH 端口必须可达，默认是 `22/tcp`。
- 使用自定义 SSH 端口时，以实际端口为准。
- 搭建任务所需的目标面板端口或 API 端口必须可达。
- 客户 VPS 的安全组和防火墙应允许当前 1Panel 服务器公网出口 IP。
- SSH 地址、账号、密码或密钥必须正确。

网站可以打开但远程搭建失败时，应优先检查这一段网络和凭据，而不是重新上传网站部署包。

## 十、数据与备份

业务数据保存在网站根目录的 `data` 子目录，主要文件包括：

```text
data/app.db
data/app.db-wal
data/app.db-shm
data/app.db.key
```

这里包含管理员、用户、套餐、次数、订单、支付配置、SMTP、搭建记录、官网和客服设置。

备份时必须备份整个 `data` 目录，不能只保存 `app.db`。`app.db.key` 用于解密商业配置，必须与数据库一起保留。

建议先在“网站 -> 运行环境”中停止 `xui-assistant`，再通过文件管理器压缩并下载整个 `data` 目录。备份完成后重新启动运行环境。

## 十一、更新方法

已部署的网站不会静默自动更新。每次 `main` 分支远端构建成功后，永久下载地址会更新为最新构建。

更新步骤：

1. 停止 `xui-assistant` Node.js 运行环境。
2. 完整备份网站根目录下的 `data` 目录。
3. 下载最新的 `xui-deploy-assistant-1panel.zip`。
4. 在网站根目录解压并覆盖程序文件。
5. **不要删除或覆盖原来的 `data` 目录。**
6. 在运行环境中重新构建或重新安装依赖，然后启动运行环境。
7. 访问域名的 `/api/health` 检查版本和状态。
8. 检查管理员登录、套餐、订单、支付和历史记录。

固定下载地址：

```text
https://github.com/wstimin/sy-xuiZS/releases/download/1panel-latest/xui-deploy-assistant-1panel.zip
```

## 十二、迁移与卸载

迁移到新服务器时：

1. 停止旧服务器的 Node.js 运行环境。
2. 备份完整 `data` 目录。
3. 在新 1Panel 中按本文重新创建网站并部署相同或更新版本的 ZIP。
4. 停止新运行环境，将旧 `data` 目录恢复到新网站根目录。
5. 启动运行环境并检查登录和历史数据。
6. 最后迁移域名解析和 HTTPS 证书。

卸载前也应先备份整个 `data` 目录。删除网站、运行环境或网站目录都会导致程序或业务数据不可用。

## 十三、健康检查和排障

### 健康检查

访问：

```text
https://你的域名/api/health
```

返回内容包含 `"status":"ok"` 表示服务正常。也可以在服务器内部通过反向代理端口检查：

```text
http://127.0.0.1:1888/api/health
```

### 运行环境创建失败

- 检查代码目录中是否直接存在 `package.json`。
- 检查 Node.js 版本是否为 20.x。
- 检查“安装 node_modules”是否开启。
- 检查服务器能否访问所选 npm 软件源。
- 检查外部端口是否被占用。

### 提示找不到 start 脚本

确认代码目录选择正确，并确认网站根目录中的 `package.json` 没有被修改。自定义脚本开启时填写 `npm run start`。

### 运行环境已启动但域名无法访问

- 检查反向代理是否启用。
- 检查代理地址端口是否与运行环境的外部端口一致。
- 检查域名 DNS、OpenResty 状态、云安全组和服务器防火墙。
- 在运行环境日志中检查应用是否成功监听 `1888`。

### 更新后数据不见了

检查网站根目录的 `data` 是否仍包含原来的 `app.db` 和 `app.db.key`，并检查运行环境中的 `DATABASE_PATH` 是否指向该目录。

### 运行信息

```text
运行环境：1Panel Node.js 20
运行命令：npm run start
应用端口：1888
默认外部端口：127.0.0.1:1888
健康检查：/api/health
默认数据库：网站根目录/data/app.db
支持架构：linux/amd64
```
