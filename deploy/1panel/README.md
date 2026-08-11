# 1Panel 网站目录部署包

此目录用于生成 X-UI 搭建助手的 1Panel 网站目录专属包。它不是 1Panel 应用商店包，不需要放入 `resource/apps/local`，也不会出现在“已装应用”列表中。

用户部署顺序：

1. 在 1Panel 中先创建静态网站和域名。
2. 将专属 ZIP 上传并解压到网站根目录。
3. 在 1Panel“网站 -> 运行环境”中创建 Node.js 20 运行环境，代码目录选择网站根目录。
4. 使用 npm 安装依赖并运行 `start` 脚本，端口映射设置为 `127.0.0.1:1888 -> 1888`。
5. 将已创建网站反向代理到 `http://127.0.0.1:1888`。
6. 访问域名，进入管理员初始化向导。

运行环境会读取压缩包顶层的 `package.json`，安装生产依赖并执行 `npm run start`。`start.cjs` 设置生产环境默认值，并将数据库保存在网站目录下的 `data/app.db`。

执行以下命令可以在本地生成待压缩目录：

```text
npm run build
npm run package:1panel
```

GitHub Actions 会把目录内容直接压缩为：

```text
xui-deploy-assistant-1panel.zip
xui-deploy-assistant-1panel-<version>.zip
SHA256SUMS
```

完整的用户操作步骤见仓库根目录 `1PANEL部署说明.md`。
