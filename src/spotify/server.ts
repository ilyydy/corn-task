/**
 * 用于获取 Spotify refresh token
 * @see https://developer.spotify.com/documentation/web-api/tutorials/code-flow
 */

import express from 'express';
import querystring from 'node:querystring';
import 'dotenv/config';
import { setGlobalDispatcher, ProxyAgent } from 'undici';

const { SPOTIFY_CLIENT_ID: spotifyClientId, SPOTIFY_CLIENT_SECRET: spotifyClientSecret } = process.env;

if (!spotifyClientId || !spotifyClientSecret) {
  throw new Error('Spotify 环境变量缺失');
}

if (process.env.PROXY_URL) {
  const proxyAgent = new ProxyAgent(process.env.PROXY_URL);
  setGlobalDispatcher(proxyAgent);
}

const port = 9000;
// 与 Spotify App 的 Redirect URI 一样
const redirect_uri = `http://127.0.0.1:${port}/spotify/callback`;

const app = express();

app.get('/', function (req, res) {
  res.send('ok');
});

/**
 * 浏览器访问该接口后会自动跳转 Spotify 页面, 手动点击确认对 App 进行授权
 */
app.get('/login', function (req, res) {
  const state = `${Math.floor(Math.pow(10, 10) * Math.random())}`;
  const scope = 'playlist-read-private user-library-read';

  res.redirect(
    'https://accounts.spotify.com/authorize?' +
      querystring.stringify({
        response_type: 'code',
        client_id: spotifyClientId,
        scope: scope,
        redirect_uri: redirect_uri,
        state,
      }),
  );
});

/**
 * 授权成功后 Spotify 回调该接口, 再请求 Spotify 接口获取 token
 */
app.get('/spotify/callback', async function (req, res) {
  const code = req.query.code || null;
  const state = req.query.state || null;

  const form = new URLSearchParams();
  form.set('code', code as string);
  form.set('redirect_uri', redirect_uri);
  form.set('grant_type', 'authorization_code');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(spotifyClientId + ':' + spotifyClientSecret).toString('base64'),
    },
    body: form,
  });

  const data = await response.json();
  console.log('token info: ', data);
  res.send('Ok');
});

app.listen(port, () => {
  console.log(`app running on port ${port}`);
});
