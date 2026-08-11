# 1Panel 独立部署包

此目录是 X-UI 搭建助手的独立 1Panel 应用包，不会替换或修改项目现有的 Shell、PM2 和 GitHub Release 部署方式。

## 安装体验

1. 在 1Panel 应用商店中导入或安装 `xui-deploy-assistant` 应用。
2. 在网页安装向导中选择访问端口并点击安装。
3. 容器启动后，在 1Panel 中点击应用的访问地址。
4. 首次打开网页时，根据现有初始化页面创建管理员账号。

整个安装过程不需要在服务器终端执行命令。

## 运行约定

- 容器镜像：`ghcr.io/wstimin/sy-xuizs:3.0.6`
- 容器内部端口：`1888`
- 持久化目录：`/var/lib/xui-assistant`
- SQLite 数据库：`/var/lib/xui-assistant/app.db`
- 健康检查：`/api/health`
- 支持架构：`amd64`

数据库加密密钥会由应用自动生成在持久化目录内。升级或重建容器时保留应用的 `data` 目录，即可保留管理员、套餐、订单、搭建记录和系统配置。

绑定域名和 HTTPS 可直接使用 1Panel 的网站与反向代理功能，应用会根据代理传入的 HTTPS 协议头自动设置安全 Cookie。

## 目录结构

标准 1Panel App Store 内容位于：

```text
apps/xui-deploy-assistant/
  data.yml
  logo.png
  README.md
  README_en.md
  3.0.6/
    data.yml
    docker-compose.yml
```

镜像由 `.github/workflows/1panel-image.yml` 独立构建并发布，不会改动现有 Release 工作流。

