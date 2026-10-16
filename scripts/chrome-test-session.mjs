// Isolated headless browser transport. WebSocket works on Windows and Linux;
// Chrome's fd 3/4 debugging pipe is not portable to Windows child processes.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
export async function chromeSession() {
  const candidates = [process.env.CHROME_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  const executable = candidates.find(path => existsSync(path));
  if (!executable) throw new Error('Chrome/Chromium unavailable. Set CHROME_BIN.');
  const profile = await mkdtemp(join(tmpdir(), 'miportal-browser-test-'));
  const chrome = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--disable-background-networking', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`], { stdio:['ignore','ignore','pipe'], windowsHide:true });
  let socket;
  const close = async () => {
    socket?.close();
    if (chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill();
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]);
    }
    if (resolve(profile).startsWith(resolve(tmpdir()) + '/') || resolve(profile).startsWith(resolve(tmpdir()) + '\\')) {
      await rm(profile, {recursive:true, force:true, maxRetries:5, retryDelay:200}).catch(() => {});
    }
  };
  try {
    const address = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Headless browser startup timed out')), 15000);
      let output='';
      chrome.stderr.on('data',chunk=>{
        output += chunk;
        const match=output.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/);
        if(match){clearTimeout(timeout);resolve(match[1])}
      });
      chrome.once('error',error=>{clearTimeout(timeout);reject(error)});
      chrome.once('exit',code=>{clearTimeout(timeout);reject(Error(`Headless browser exited ${code}: ${output.slice(-300)}`))});
    });
    socket = new WebSocket(address);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
    let sequence=0;const pending=new Map();
    socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data);const waiter=pending.get(message.id);
      if(!waiter)return;pending.delete(message.id);clearTimeout(waiter.timer);
      if(message.error)waiter.reject(Error(JSON.stringify(message.error)));else waiter.resolve(message.result);
    });
    const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
      const id=++sequence;
      const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`))},10000);
      pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,sessionId}));
    });
    // A running browser process does not prove its sandboxed renderer can run.
    // Fail once here rather than timing out every assertion in every suite.
    const {targetId} = await send('Target.createTarget', {url:'about:blank'});
    try {
      const {sessionId} = await send('Target.attachToTarget', {targetId,flatten:true});
      const probe = await send('Runtime.evaluate', {expression:'1+1',returnByValue:true},sessionId);
      if (probe.result?.value !== 2) throw Error('Browser renderer readiness check failed');
    } finally { await send('Target.closeTarget', {targetId}).catch(()=>{}); }
    return {send,close};
  } catch(error){await close();throw error}
}
