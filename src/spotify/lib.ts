import path from 'node:path';
import readline from 'node:readline/promises';
import fs from 'node:fs/promises';
import chunk from 'lodash-es/chunk.js';

import {
  dataPath,
  mkDataDir,
  mkTmpDir,
  projectRootPath,
  tmpPath,
  toSimplified,
  createLogger,
  sendNotifyMsg,
} from '../common.js';

import type {
  RefreshTokenData,
  SavedTracksPage,
  SavedTrack,
  Track,
  SimplifiedArtist,
  MyTrack,
} from './types.js';

const {
  SPOTIFY_CLIENT_ID: spotifyClientId = '',
  SPOTIFY_CLIENT_SECRET: spotifyClientSecret = '',
  SPOTIFY_REFRESH_TOKEN: spotifyRefreshToken = '',
  SPOTIFY_T2S_ENABLE: _SPOTIFY_T2S_ENABLE = 'true',
  SPOTIFY_DEBUG = 'true',
  NOTIFY_URL = '',
} = process.env;

const debugMode = SPOTIFY_DEBUG === 'true';
const logger = createLogger({ debugMode });

if (!spotifyClientId || !spotifyClientSecret || !spotifyRefreshToken) {
  throw new Error('Spotify 环境变量缺失');
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
 * 批量根据歌曲id获取歌曲信息
 * @see https://developer.spotify.com/documentation/web-api/reference/get-several-tracks
 */
export async function getTracksByIds(accessToken: string, ids: string[]) {
  const query = new URLSearchParams({
    ids: ids.join(','),
    locale: 'zh_CN',
  });
  const response = await fetch(`${baseApiUrl}/tracks?${query.toString()}`, {
    headers: {
      Authorization: 'Bearer ' + accessToken,
    },
  });

  const data: { tracks: Track[] } = await response.json();
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

  const data: { artists: SimplifiedArtist[] } = await response.json();
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
  handlePage: (savedTracks: SavedTrack[]) => Promise<void>,
) {
  let total = 0;
  let count = 0;
  let offset = 0;
  const limit = 50;

  const getOnePage = async () => {
    const query = new URLSearchParams({
      locale: 'zh_CN',
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
    const data: SavedTracksPage = await response.json();
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

export async function handleMySavedTracks(outputPath: string) {
  const start = Date.now();
  const { access_token } = await refreshToken();

  const lineList = [] as string[];
  const trackMap = new Map<string, MyTrack>();
  const unplayableTracks: MyTrack[] = [];
  await getMySavedTracks(access_token, async (savedTracks) => {
    // get-users-saved-tracks 接口数据有 preview_url 肯定可以, 没有的需根据 get-several-tracks 接口进一步确认
    const trackIdListWithoutPreviewUrl = savedTracks.filter((i) => !i.track.preview_url).map((i) => i.track.id);
    const tracks =
      trackIdListWithoutPreviewUrl.length > 0 ? await getTracksByIds(access_token, trackIdListWithoutPreviewUrl) : [];

    for (const savedTrack of savedTracks) {
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
        playable:
          !savedTrack.track.preview_url && !tracks.find((track) => track.id === savedTrack.track.id)?.preview_url
            ? false
            : true,
      };
      lineList.push(JSON.stringify(myTrack));
      trackMap.set(myTrack.id, myTrack);
      if (!myTrack.playable) {
        unplayableTracks.push(myTrack);
      }
      if (debugMode) {
        mkTmpDir();
        await fs.appendFile(
          path.join(tmpPath, 'savedTracks.txt'),
          savedTracks.map((i) => JSON.stringify(i)).join('\n'),
        );
      }
    }
  });
  await fs.writeFile(outputPath, lineList.join('\n'));
  logger.info(`${handleMySavedTracks.name} 耗时 ${Date.now() - start}ms`);
  return { trackMap, unplayableTracks };
}

/**
 * 读取上一次保存的全量 txt, 用于与本次对比
 */
export async function readLastFullTxt(filePath: string) {
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
    logger.info(`上一次全量 txt 不存在 ${filePath}`);
    return;
  }
}

export async function sendTrackNotifyMsg({
  statisticsMsg,
  tracksAdded,
  tracksDeleted,
}: {
  statisticsMsg: string;
  tracksAdded?: MyTrack[];
  tracksDeleted?: MyTrack[];
}) {
  if (!NOTIFY_URL) return;

  await sendNotifyMsg({ msgtype: 'text', text: { content: statisticsMsg } }, NOTIFY_URL);

  const sendTracksMsgs = async (tracks: MyTrack[], { title = '' } = {}) => {
    // 每次发的消息最长不超过4096个字节 分批发送
    const msgs = chunk(tracks, 50).map((i) => {
      const l = i.map(
        (track) =>
          `id: ${track.id}\n歌名: ${track.name}\n歌手名: ${track.artists.map((artist) => artist.name)}\n专辑名: ${track.album.name}\n可播放: ${track.playable}\n\n`,
      );
      if (title) {
        l.unshift(`## ${title}`);
      }
      return l.join('\n');
    });

    for (const msg of msgs) {
      console.log(msg);
      await sendNotifyMsg({ msgtype: 'markdown', markdown: { content: msg } }, NOTIFY_URL);
    }
  };

  if (tracksDeleted?.length) {
    await sendTracksMsgs(tracksDeleted, { title: '已删' });
  }
  if (tracksAdded?.length) {
    await sendTracksMsgs(tracksAdded, { title: '已增' });
  }
}

export async function exportTracks() {
  const fullTxt = `spotifyTracks-full.txt`; // 本次全量
  const addTxt = `spotifyTracks-add.txt`; // 本次新增
  const delTxt = `spotifyTracks-del.txt`; // 本次减少
  const unplayableTxt = `spotifyTracks-unplayable.txt`; // 本次不能播放
  const statisticsTxt = `spotifyTracks-statistics.txt`; // 统计信息

  mkTmpDir();
  mkDataDir();
  const fullTxtPath = path.join(tmpPath, fullTxt);
  const lastFullTxtPath = path.join(dataPath, fullTxt);
  const addTxtPath = path.join(dataPath, addTxt);
  const delTxtPath = path.join(dataPath, delTxt);
  const unplayableTxtPath = path.join(dataPath, unplayableTxt);
  const statisticsTxtPath = path.join(dataPath, statisticsTxt);

  const { trackMap, unplayableTracks } = await handleMySavedTracks(fullTxtPath);
  const lastTrackMap = await readLastFullTxt(lastFullTxtPath);

  await Promise.all([
    fs.unlink(addTxtPath).catch(() => ''),
    fs.unlink(delTxtPath).catch(() => ''),
    fs.unlink(statisticsTxtPath).catch(() => ''),
    fs.unlink(unplayableTxtPath).catch(() => ''),
  ]);

  const tracksAdded = [] as MyTrack[];
  const tracksDeleted = [] as MyTrack[];
  if (lastTrackMap) {
    for (const [trackId, track] of trackMap.entries()) {
      if (!lastTrackMap.has(trackId)) {
        tracksAdded.push(track);
      } else {
        // 删掉共有的, 剩下的全是上次独有的, 即本次减少的
        lastTrackMap.delete(trackId);
      }
    }

    if (tracksAdded.length > 0) {
      await fs.writeFile(addTxtPath, tracksAdded.map((i) => JSON.stringify(i)).join('\n'));
    }

    if (lastTrackMap.size > 0) {
      tracksDeleted.push(...lastTrackMap.values());
      await fs.writeFile(delTxtPath, tracksDeleted.map((i) => JSON.stringify(i)).join('\n'));
    }
  }

  if (unplayableTracks.length > 0) {
    await fs.writeFile(unplayableTxtPath, unplayableTracks.map((i) => JSON.stringify(i)).join('\n'));
  }

  const msg = `本次总共 ${trackMap.size}, 新增 ${tracksAdded.length}, 减少 ${tracksDeleted.length}, 不能播放 ${unplayableTracks.length}`;
  await fs.writeFile(statisticsTxtPath, msg);

  if (lastTrackMap) {
    await fs.unlink(lastFullTxtPath);
  }
  await fs.rename(fullTxtPath, lastFullTxtPath);

  await sendTrackNotifyMsg({ statisticsMsg: msg, tracksAdded, tracksDeleted });
}
