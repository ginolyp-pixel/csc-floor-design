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
      // SAM image encoder peaks around ~500 MB transient; model weights are
      // ~150 MB resident; Node + Fastify ~80 MB. 1500 MB gives headroom on
      // the 1.9 GB VPS while still rebooting if a memory leak runs away.
      max_memory_restart: "1500M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3001",
        DATA_DIR: "/var/lib/csc-designer",
      },
      error_file: "/var/log/csc-designer/error.log",
      out_file: "/var/log/csc-designer/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
