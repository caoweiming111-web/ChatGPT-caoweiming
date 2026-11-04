'use strict';
// Exit 0: the correct server is running; 1: start it; 2: show a conflict to the user.
const http = require('node:http');
const path = require('node:path');
const port = Number(process.env.PORT || 3456);
if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('PORT 必须是 1–65535 的端口号。'); process.exitCode = 2; }
else {
  const request = http.get({ hostname: '127.0.0.1', port, path: '/git-sync/status', headers: { Host: 'localhost:' + port }, timeout: 2500 }, response => {
    let body = ''; response.setEncoding('utf8');
    response.on('data', chunk => { if (body.length < 65536) body += chunk; });
    response.on('end', () => {
      try {
        const info = JSON.parse(body);
        const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
        if (response.statusCode === 200 && info.version === '2026-11-04.sync2' && normalize(info.directory) === normalize(__dirname)) {
          console.log('当前目录的 MakeX 服务已经运行，将打开页面。'); process.exitCode = 0; return;
        }
      } catch {}
      console.error('端口 ' + port + ' 正在运行旧版或其他目录的服务。请关闭旧的 MakeX 服务器窗口，再从这个新版文件夹启动。不会自动关闭其他程序。');
      process.exitCode = 2;
    });
  });
  request.on('timeout', () => request.destroy(Object.assign(Error('timeout'), { code: 'ETIMEDOUT' })));
  request.on('error', error => {
    if (error.code === 'ECONNREFUSED') process.exitCode = 1;
    else { console.error('无法确认本地服务状态，请先关闭旧服务器后重试。'); process.exitCode = 2; }
  });
}
