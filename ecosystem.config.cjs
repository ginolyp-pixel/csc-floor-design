module.exports = {
  apps: [
    {
      name: "csc-designer",
      script: "server/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      cwd: "/opt/csc-floor-design",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3001",
      },
      error_file: "/var/log/csc-designer/error.log",
      out_file: "/var/log/csc-designer/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
