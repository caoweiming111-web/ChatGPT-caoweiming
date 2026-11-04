const {test}=require('node:test');
const assert=require('node:assert/strict');
const {classifyGitError,createGitEnv}=require('../sync-courses');
test('Git failures distinguish authentication, permission, network and branch rules without exposing raw credentials',()=>{
 for(const [stderr,code] of [
  ['fatal: Authentication failed for https://secret-token@github.com/example','GITHUB_AUTH_REQUIRED'],
  ['fatal: could not read Username: terminal prompts disabled','GITHUB_AUTH_REQUIRED'],
  ['remote: Write access to repository not granted. HTTP 403','GITHUB_ACCESS_DENIED'],
  ['remote: GH013: Repository rule violations found','GITHUB_PUSH_REJECTED'],
  ['fatal: unable to access github.com: Failed to connect','GIT_NETWORK_FAILED']
 ]){const error=classifyGitError({stderr},'push');assert.equal(error.code,code);assert.equal(error.stage,'push');assert.doesNotMatch(error.message,/secret-token/)}
 assert.equal(classifyGitError({code:'ENOENT'},'clone').code,'NO_GIT');
 assert.equal(classifyGitError({stderr:'custom local hook failed'},'push').code,'GIT_FAILED');
});
test('Git environment keeps inherited configuration and disables terminal password prompts',()=>{
 const env=createGitEnv();assert.equal(env.GIT_TERMINAL_PROMPT,'0');assert.ok(env.GCM_INTERACTIVE);
 for(const key of ['GIT_CONFIG_COUNT','GIT_CONFIG_GLOBAL','HTTPS_PROXY'])assert.equal(env[key]===process.env[key],true);
});
test('standalone page embeds the current sync client so the button cannot load stale external logic',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const client=fs.readFileSync(path.join(__dirname,'../git-sync-client.js'),'utf8').trimEnd();
 const match=html.match(/<script id="git-sync-runtime">\n([\s\S]*?)\n<\/script>/);
 assert.ok(match);assert.equal(match[1],client);assert.doesNotMatch(html,/<script src="git-sync-client\.js"/);
});
