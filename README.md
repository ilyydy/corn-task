# corn-task

定时任务集合

## requirements

Node.js 18 及以上, 推荐 pnpm 配合使用

## Spotify 点赞歌单导出

使用 [Spotify Authorization Code](https://developer.spotify.com/documentation/web-api/tutorials/code-flow) 认证授权后, 调用官方 Web API 导出点赞歌单

导出后的信息存在 `spotifyTracks` 分支

- spotifyTracks-full.txt: 本次全量歌曲
- spotifyTracks-add.txt: 本次相比上次新增的歌曲
- spotifyTracks-del.txt: 本次相比上次减少的歌曲
- spotifyTracks-unplayable.txt: 本次不可播放的歌曲
- spotifyTracks-unplayable-add.txt: 本次不可播放的新增的歌曲
- spotifyTracks-unplayable-del.txt: 本次不可播放的减少的歌曲
- spotifyTracks-statistics.txt: 本次统计信息

定时任务 [spotifyExportTracks](./.github/workflows/spotifyExportTracks.yaml) 在北京时间每周日晚上10点执行一次

### 使用

1. 按照 Spotify 官方流程创建勾选了 Web API 的 App, Redirect URI 填 `http://localhost:9000/spotify/callback`, 获得 Client ID 和 Client secret
2. fork 本仓库并 clone 到本地。fork 的仓库最好改为私密仓库, 你也不想自己的歌单公开吧
3. 安装依赖, 复制 `.template.env` 为 `.env`, `.env` 中填入第1步获取的 Client ID 和 Client secret, `SPOTIFY_CLIENT_ID` 即 Client ID, `SPOTIFY_CLIENT_SECRET` 即 Client secret
4. 运行 `src/spotify/server.ts`, 启动一个本地服务, 走 Spotify 认证权限流程, 浏览器访问 `http://localhost:9000/login` 后会自动跳转 Spotify 页面, 点击确认对你的 App 进行授权, 然后 Spotify 回调 `http://localhost:9000/spotify/callback`, 本地服务会请求 Spotify 接口获取并打印 token 信息
5. 复制 access token 填入 `.env` 中的 `SPOTIFY_REFRESH_TOKEN`
6. 如果一切正常, 本地运行 `src/spotify/exportTracks.ts` 则会导出点赞歌单
7. 本地运行确认正常后, 仓库设置中找到 `Workflow permissions` 选择 `Read and write permissions`, 并配置 `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` 3个 secrets
8. 手动运行 `Spotify Export Tracks` 这个 workflow, 如果一切正常则会生成 txt, 并自动提交推送到 `spotifyTracks` 分支

## 其他

### 配置项 SPOTIFY_T2S_ENABLE

variables 中配置

用于控制是否对 Spotify 歌曲名, 歌手名, 专辑名进行繁体中文转简体中文

转换库使用 [chinese-simple2traditional](https://github.com/pengzhanbo/chinese-simple2traditional)

### 配置项 T2S_PHRASES

variables 中配置

繁体中文转简体中文时用到, 一些转换可能不正确, 支持自定义 繁体转简体 短语集合

`T2S_PHRASES` 格式为

```txt
[
  ['雙台子區', '双台子区'],
  ['雖覆能復', '虽覆能复'],
]
```

### 配置项 NOTIFY_URL

secrets 中配置

用于推送消息的地址, 比如企业微信群机器人。如有配置:

- Spotify 点赞歌单导出会推送本次统计信息, 本次相比上次减少的歌曲, 本次相比上次新增的歌曲
