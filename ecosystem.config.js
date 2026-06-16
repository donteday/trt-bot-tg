module.exports = {
  apps: [
    {
      name: "tarot-bot",
      script: "index.js",
      kill_timeout: 130000,   // ждём до 130 сек перед SIGKILL (наш graceful ждёт 120)
      wait_ready: false,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
