module.exports = {
  apps: [
    {
      name: "3xui-deploy-assistant",
      script: "dist/server.cjs",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        APP_VERSION: process.env.APP_VERSION || "development",
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      time: true,
    },
  ],
};
