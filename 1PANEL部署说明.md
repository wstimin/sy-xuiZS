# 1Panel 专属部署说明

本说明用于通过 1Panel 网页安装 X-UI 搭建助手。安装过程不要求登录服务器终端，也不需要手工执行 Docker 命令。

## 下载地址

- 永久最新版安装包：[xui-deploy-assistant-1panel.zip](https://github.com/wstimin/sy-xuiZS/releases/download/1panel-latest/xui-deploy-assistant-1panel.zip)
- 永久发布页面：[1panel-latest](https://github.com/wstimin/sy-xuiZS/releases/tag/1panel-latest)
- SHA256 校验文件：[SHA256SUMS](https://github.com/wstimin/sy-xuiZS/releases/download/1panel-latest/SHA256SUMS)

永久发布页面同时提供带版本号的安装包，例如 `xui-deploy-assistant-1panel-3.0.6.zip`。固定文件名始终指向最新构建，可用于后续重新安装或更新。

## 安装前要求

- 已安装并可以正常使用 1Panel。
- 服务器架构为 `linux/amd64`。
- 服务器能够访问 GitHub Container Registry：`ghcr.io`。
- 云服务器安全组已放行准备使用的 Web 访问端口，默认建议使用 `1888/tcp`。

## 网页安装步骤

1. 下载上面的 `xui-deploy-assistant-1panel.zip`。
2. 登录 1Panel，进入应用商店的本地应用或应用导入页面。
3. 选择下载的 ZIP 文件并完成导入。
4. 找到“X-UI 搭建助手”，点击安装。
5. 设置 Web 访问端口，默认端口为 `1888`。
6. 确认安装，等待 1Panel 拉取镜像并启动容器。
7. 安装完成后，在应用详情中点击访问地址，或打开 `http://服务器IP:端口`。
8. 首次访问会显示管理员初始化页面，按页面提示创建第一个管理员账号。

管理员初始化完成后即可登录管理后台，配置站点资料、套餐、支付方式、SMTP、联系方式和其他业务选项。

## 域名与 HTTPS

需要使用域名时，可以在 1Panel 中创建网站，并将网站反向代理到本应用的 Web 端口。随后在 1Panel 网站设置中申请或上传证书并启用 HTTPS。

应用会识别反向代理传入的 HTTPS 协议头，并自动使用安全会话 Cookie。建议公网正式环境使用 HTTPS，不要长期使用明文 HTTP 传输管理员账号、支付配置或服务器凭据。

## 数据保存

1Panel 应用包会将容器内的 `/var/lib/xui-assistant` 映射到应用目录下的 `data` 持久化目录，其中包括：

- 管理员和用户账号
- 套餐、面板次数与节点次数
- 订单、支付和邮件配置
- 搭建任务与执行记录
- 首页、客服和系统设置
- SQLite 数据库及自动生成的商业配置加密密钥

更新或重建容器时必须保留 `data` 目录。删除应用时，如果 1Panel 提示是否同时删除应用数据，请先确认已经备份，避免误删业务数据。

## 更新方式

每次 `main` 分支远端构建成功后，以下内容会自动更新：

- 永久安装包 `xui-deploy-assistant-1panel.zip`
- 当前版本安装包，例如 `xui-deploy-assistant-1panel-3.0.6.zip`
- Docker 镜像 `ghcr.io/wstimin/sy-xuizs:3.0.6`
- Docker 滚动镜像 `ghcr.io/wstimin/sy-xuizs:latest`
- `SHA256SUMS` 校验文件

更新前建议在 1Panel 中备份应用数据。重新导入最新版安装包或更新应用时，继续使用原来的持久化 `data` 目录。

## 运行信息

```text
应用名称：X-UI 搭建助手
容器内部端口：1888
默认公开端口：1888
健康检查：/api/health
持久化目录：/var/lib/xui-assistant
数据库文件：/var/lib/xui-assistant/app.db
镜像：ghcr.io/wstimin/sy-xuizs:3.0.6
支持架构：linux/amd64
```

## 常见问题

### 安装后无法访问

在 1Panel 应用详情中确认容器处于“已启动”或“健康”状态，并确认云厂商安全组和服务器防火墙已放行安装时设置的 Web 端口。

### 镜像拉取失败

确认服务器可以访问 `ghcr.io`。镜像已经设置为公开，正常安装不需要填写 GitHub 用户名或令牌。

### 首次打开没有进入管理员初始化

如果当前数据库中已经存在管理员，系统会直接显示登录页面。这通常表示安装时复用了已有的 `data` 持久化目录。

### 更新后数据不见了

检查新容器是否仍挂载原应用的 `data` 目录。业务数据不存放在镜像内部，正确复用持久化目录后会自动读取原数据库。

### 如何确认服务正常

在 1Panel 中查看容器健康状态，也可以在浏览器访问：

```text
http://服务器IP:端口/api/health
```

返回包含 `"status":"ok"` 表示应用服务正常。

