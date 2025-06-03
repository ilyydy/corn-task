import path from 'node:path';
import readline from 'node:readline/promises';
import fs from 'node:fs/promises';
import chunk from 'lodash-es/chunk.js';
import { setGlobalDispatcher, ProxyAgent } from 'undici';

import { dataPath, mkDataDir, mkTmpDir, tmpPath, toSimplified, createLogger, sendNotifyMsg } from '../common.js';

import type { RefreshTokenData, User, SavedTracksPage, SavedTrack, Track, SimplifiedArtist, MyTrack } from './types.js';

const {
  SPOTIFY_CLIENT_ID: spotifyClientId = '',
  SPOTIFY_CLIENT_SECRET: spotifyClientSecret = '',
  SPOTIFY_REFRESH_TOKEN: spotifyRefreshToken = '',
  SPOTIFY_T2S_ENABLE: _SPOTIFY_T2S_ENABLE = 'true',
  SPOTIFY_DEBUG = 'false',
  NOTIFY_URL = '',
  PROXY_URL = '',
} = process.env;

const debugMode = SPOTIFY_DEBUG === 'true';
const logger = createLogger({ debugMode });

if (!spotifyClientId || !spotifyClientSecret || !spotifyRefreshToken) {
  throw new Error('Spotify 环境变量缺失');
}

if (PROXY_URL) {
  const proxyAgent = new ProxyAgent(PROXY_URL);
  setGlobalDispatcher(proxyAgent);
}

const SPOTIFY_T2S_ENABLE = _SPOTIFY_T2S_ENABLE === 'true';
const baseApiUrl = 'https://api.spotify.com/v1';

/**
 * 根据 refresh token 获取新的 access token
 * @see https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
 */
export async function refreshToken() {
  const response = await fetch(`https://accounts.spotify.com/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(spotifyClientId + ':' + spotifyClientSecret).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: spotifyRefreshToken,
    }),
  });

  const data = await response.json();
  const { status, statusText } = response;
  if (status !== 200) {
    const funName = refreshToken.name;
    logger.error(`${funName} fail, status: ${status} statusText: ${statusText} data: `, data);
    throw new Error(`${funName} fail, status: ${status} statusText: ${statusText}`);
  }

  logger.debug('refreshToken data ', data);
  return data as RefreshTokenData;
}

/**
 * 获取当前用户信息
 * @see https://developer.spotify.com/documentation/web-api/reference/get-current-users-profile
 */
export async function getMe(accessToken: string) {
  const response = await fetch(`${baseApiUrl}/me`, {
    headers: {
      Authorization: 'Bearer ' + accessToken,
    },
  });

  const data = (await response.json()) as User;
  const { status, statusText } = response;

  if (status !== 200) {
    const funName = getMe.name;
    logger.error(`${funName} fail, status: ${status} statusText: ${statusText} data: `, data);
    throw new Error(`${funName} fail, status: ${status} statusText: ${statusText}`);
  }

  return data;
}

/**
 * 批量根据歌曲id获取歌曲信息
 * @see https://developer.spotify.com/documentation/web-api/reference/get-several-tracks
 */
export async function getTracksByIds(accessToken: string, ids: string[], country: string) {
  const query = new URLSearchParams({
    ids: ids.join(','),
    market: country,
    locale: 'zh_CN',
  });
  const response = await fetch(`${baseApiUrl}/tracks?${query.toString()}`, {
    headers: {
      Authorization: 'Bearer ' + accessToken,
    },
  });

  const data = (await response.json()) as { tracks: Track[] };
  const { status, statusText } = response;

  if (status !== 200) {
    const funName = getTracksByIds.name;
    logger.error(`${funName} fail, status: ${status} statusText: ${statusText} data: `, data);
    throw new Error(`${funName} fail, status: ${status} statusText: ${statusText}`);
  }

  return data.tracks;
}

/**
 * 批量根据歌手id获取歌手信息
 * @see https://developer.spotify.com/documentation/web-api/reference/get-multiple-artists
 */
export async function getArtistsByIds(accessToken: string, ids: string[]) {
  const query = new URLSearchParams({
    ids: ids.join(','),
    locale: 'zh_CN',
  });
  const response = await fetch(`${baseApiUrl}/artists?${query.toString()}`, {
    headers: {
      Authorization: 'Bearer ' + accessToken,
    },
  });

  const data = (await response.json()) as { artists: SimplifiedArtist[] };
  const { status, statusText } = response;

  if (status !== 200) {
    const funName = getArtistsByIds.name;
    logger.error(`${funName} fail, status: ${status} statusText: ${statusText} data: `, data);
    throw new Error(`${funName} fail, status: ${status} statusText: ${statusText}`);
  }

  return data.artists;
}

/**
 * 分页获取当前用户点赞的歌曲并进行处理
 * @see https://developer.spotify.com/documentation/web-api/reference/get-users-saved-tracks
 */
export async function getMySavedTracks(
  accessToken: string,
  country: string,
  handlePage: (savedTracks: SavedTrack[]) => Promise<void>,
) {
  let total = 0;
  let count = 0;
  let offset = 0;
  const limit = 50;

  const getOnePage = async () => {
    const query = new URLSearchParams({
      locale: 'zh_CN',
      market: country,
      limit: `${limit}`,
      offset: `${offset}`,
    });
    return fetch(`${baseApiUrl}/me/tracks?${query.toString()}`, {
      headers: {
        Authorization: 'Bearer ' + accessToken,
      },
    });
  };

  while (offset === 0 || total > count) {
    const response = await getOnePage();
    const data = (await response.json()) as SavedTracksPage;
    const { status, statusText } = response;

    if (status !== 200) {
      const funName = getMySavedTracks.name;
      logger.error(`${funName} fail, status: ${status} statusText: ${statusText} data: `, data);
      throw new Error(`${funName} fail, status: ${status} statusText: ${statusText}`);
    }

    total = data.total;
    count += data.items.length;
    await handlePage(data.items);

    if (!data.next || data.items.length < limit || total <= count) {
      break;
    }
    offset += limit;
    logger.info(`${getMySavedTracks.name}, total: ${total}, count: ${count}, offset: ${offset}`);
    // break;
  }

  logger.info(`${getMySavedTracks.name}, total: ${total}, count: ${count}`);
}

export async function handleMySavedTracks() {
  const start = Date.now();
  const { access_token } = await refreshToken();
  const { country } = await getMe(access_token);

  const tracks: Track[] = [];
  const myTracks: MyTrack[] = [];
  const unplayableTracks: MyTrack[] = [];
  const repeatTracksMap = new Map<string, MyTrack[]>();
  await getMySavedTracks(access_token, country, async (savedTracks) => {
    for (const savedTrack of savedTracks) {
      if (debugMode) {
        tracks.push(savedTrack.track);
      }

      const myTrack = {
        id: savedTrack.track.id,
        name: SPOTIFY_T2S_ENABLE ? toSimplified(savedTrack.track.name) : savedTrack.track.name,
        originName: savedTrack.track.name,
        artists: savedTrack.track.artists.map((artist) => {
          return {
            name: SPOTIFY_T2S_ENABLE ? toSimplified(artist.name) : savedTrack.track.name,
            originName: artist.name,
            id: artist.id,
          };
        }),
        album: {
          id: savedTrack.track.album.id,
          name: SPOTIFY_T2S_ENABLE ? toSimplified(savedTrack.track.album.name) : savedTrack.track.name,
          originName: savedTrack.track.album.name,
        },
        added_at: savedTrack.added_at,
        playable: !!savedTrack.track.is_playable,
      };

      const sameIdTrack = myTracks.find((i) => i.id === myTrack.id);
      if (sameIdTrack) {
        const repeatTracks = repeatTracksMap.get(myTrack.id) || [sameIdTrack];
        repeatTracks.push(myTrack);
        repeatTracksMap.set(myTrack.id, repeatTracks);
      }
      myTracks.push(myTrack);
      if (!myTrack.playable) {
        unplayableTracks.push(myTrack);
      }
    }
  });

  if (debugMode) {
    await fs.writeFile(path.join(tmpPath, 'savedTracks.txt'), tracks.map((i) => JSON.stringify(i)).join('\n'));
  }
  logger.info(`${handleMySavedTracks.name} 耗时 ${Date.now() - start}ms`);
  return { tracks: myTracks, unplayableTracks, repeatTracksMap };
}

/**
 * 读取 txt, 输出 map<id, track>
 */
export async function readTracksTxt(filePath: string) {
  try {
    await fs.access(filePath);
    const fileStream = await fs.open(filePath, 'r');
    const rl = readline.createInterface({
      input: fileStream.createReadStream(),
      crlfDelay: Infinity,
    });

    const map = new Map<string, MyTrack>();
    for await (const line of rl) {
      if (!line) continue;
      const track = JSON.parse(line) as MyTrack;
      map.set(track.id, track);
    }
    rl.close();
    await fileStream.close();
    return map;
  } catch (error) {
    logger.info(`txt 不存在 ${filePath}`);
    return;
  }
}

export async function saveTracksTxt(filePath: string, tracks: MyTrack[]) {
  if (!tracks.length) return;
  await fs.writeFile(filePath, tracks.map((i) => JSON.stringify(i)).join('\n'));
}

export function getTracksChangeInfo(tracks: MyTrack[], lastTrackMap?: Map<string, MyTrack>) {
  const tracksAdded = [] as MyTrack[];
  const tracksDeleted = [] as MyTrack[];

  if (!lastTrackMap) {
    return { tracksAdded: tracks, tracksDeleted };
  }

  for (const track of tracks) {
    const trackId = track.id;
    if (!lastTrackMap.has(trackId)) {
      tracksAdded.push(track);
    } else {
      // 删掉共有的, 剩下的全是上次独有的, 即本次减少的
      lastTrackMap.delete(trackId);
    }
  }
  tracksDeleted.push(...lastTrackMap.values());

  return { tracksAdded, tracksDeleted };
}

export async function sendTracksMsgs(tracks: MyTrack[], { title = '' } = {}) {
  if (!NOTIFY_URL || tracks.length === 0) return;
  const trackStrList = tracks.map(
    (track) =>
      `id: ${track.id}\n歌名: ${track.name}\n歌手名: ${track.artists.map((artist) => artist.name)}\n专辑名: ${track.album.name}\n可播放: ${track.playable}`,
  );

  // 每次发的消息最长不超过4096个字节 分批发送
  const chunks = chunk(trackStrList, 20);
  for (let index = 0; index < chunks.length; index++) {
    const i = [...chunks[index]];
    if (title) {
      i.unshift(`## ${title}`);
    }
    const content = i.join('\n \n');
    logger.debug(content);
    const { success } = await sendNotifyMsg(
      { msgtype: 'markdown', markdown: { content } },
      NOTIFY_URL,
      `${title}-${index}`,
    );
    if (!success) {
      logger.debug(`tracksMsgs ${title} ${index + 1} 批次推送失败\n${content}`);
    }
  }
}

export async function exportTracks() {
  const fullTxt = `spotifyTracks-full.txt`; // 本次全量
  const addTxt = `spotifyTracks-add.txt`; // 本次新增
  const delTxt = `spotifyTracks-del.txt`; // 本次减少
  const unplayableTxt = `spotifyTracks-unplayable.txt`; // 本次不能播放
  const unplayableAddTxt = `spotifyTracks-unplayable-add.txt`; // 本次不能播放新增
  const unplayableDelTxt = `spotifyTracks-unplayable-del.txt`; // 本次不能播放减少
  const repeatTxt = `spotifyTracks-repeat.txt`; // 重复的
  const statisticsTxt = `spotifyTracks-statistics.txt`; // 统计信息

  mkTmpDir();
  mkDataDir();
  const fullTxtPath = path.join(dataPath, fullTxt);
  const addTxtPath = path.join(dataPath, addTxt);
  const delTxtPath = path.join(dataPath, delTxt);
  const unplayableTxtPath = path.join(dataPath, unplayableTxt);
  const unplayableAddTxtPath = path.join(dataPath, unplayableAddTxt);
  const unplayableDelTxtPath = path.join(dataPath, unplayableDelTxt);
  const repeatTxtPath = path.join(dataPath, repeatTxt);
  const statisticsTxtPath = path.join(dataPath, statisticsTxt);
  const lastFullTxtPath = path.join(tmpPath, fullTxt);
  const lastUnplayableTxtPath = path.join(tmpPath, unplayableTxt);

  const { tracks, unplayableTracks, repeatTracksMap } = await handleMySavedTracks();
  await saveTracksTxt(fullTxtPath, tracks);
  await saveTracksTxt(unplayableTxtPath, unplayableTracks);

  let repeatCount = 0;
  if (repeatTracksMap.size > 0) {
    for (const tracks of repeatTracksMap.values()) {
      repeatCount += tracks.length - 1;
      await fs.appendFile(repeatTxtPath, tracks.map((i) => JSON.stringify(i)).join('\n') + '\n\n');
    }
  }

  const lastFullTrackMap = await readTracksTxt(lastFullTxtPath);
  const { tracksAdded, tracksDeleted } = getTracksChangeInfo(tracks, lastFullTrackMap);
  await saveTracksTxt(addTxtPath, tracksAdded);
  await saveTracksTxt(delTxtPath, tracksDeleted);

  const lastUnplayableTrackMap = await readTracksTxt(lastUnplayableTxtPath);
  const { tracksAdded: unplayableTracksAdded, tracksDeleted: unplayableTracksDeleted } = getTracksChangeInfo(
    unplayableTracks,
    lastUnplayableTrackMap,
  );
  await saveTracksTxt(unplayableAddTxtPath, unplayableTracksAdded);
  await saveTracksTxt(unplayableDelTxtPath, unplayableTracksDeleted);

  const msg = `Spotify 本次总共 ${tracks.length}, 新增 ${tracksAdded.length}, 减少 ${tracksDeleted.length}. 不能播放 ${unplayableTracks.length}, 新增 ${unplayableTracksAdded.length}, 减少 ${unplayableTracksDeleted.length}, 重复 ${repeatCount}`;
  await fs.writeFile(statisticsTxtPath, msg);
  if (NOTIFY_URL) {
    await sendNotifyMsg({ msgtype: 'text', text: { content: msg } }, NOTIFY_URL, 'statisticsMsg');
  }

  // 第一次不发增删消息
  if (lastFullTrackMap) {
    await sendTracksMsgs(tracksAdded, { title: 'Spotify 已增' });
    await sendTracksMsgs(tracksDeleted, { title: 'Spotify 已删' });

    await sendTracksMsgs(unplayableTracksAdded, { title: 'Spotify 不能播放已增' });
    await sendTracksMsgs(unplayableTracksDeleted, { title: 'Spotify 不能播放已删' });
  }
}
