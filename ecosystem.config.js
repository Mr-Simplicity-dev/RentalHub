module.exports = {
  apps: [{
    name: 'rentalhub',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
    },
    max_memory_restart: '1G',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_restarts: 10,
    restart_delay: 4000,
    min_uptime: 10000,
    listen_timeout: 8000,
    kill_timeout: 15000,
    shutdown_with_message: true,
  }],
};
