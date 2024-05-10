import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { toSimplified as _toSimplified, customT2SPhrases } from 'chinese-simple2traditional';
import { setupEnhance } from 'chinese-simple2traditional/enhance';

export const currentModuleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRootPath = path.resolve(currentModuleDir, '..');
config({ path: path.join(projectRootPath, '.env') });

export const dataPath = path.join(projectRootPath, 'data');
export const mkDataDir = () => fs.mkdirSync(dataPath, { recursive: true });

export const tmpPath = path.join(projectRootPath, 'tmp');
export const mkTmpDir = () => fs.mkdirSync(tmpPath, { recursive: true });

let toSimplifiedInstance: typeof _toSimplified;
export const toSimplified = (str: string) => {
  if (!toSimplifiedInstance) {
    setupEnhance();

    const { T2S_PHRASES = '' } = process.env;

    /**
     * 繁转简的自定义短语集合
     * 如果在 Github actions secrets 设置了环境变量 T2S_PHRASES, 则会用环境变量的值
     */
    const t2sPhrases: (readonly [string, string])[] = T2S_PHRASES
      ? new Function('return ' + T2S_PHRASES)()
      : [
          // ['繁体短语', '简体短语']
        ];

    customT2SPhrases(t2sPhrases);
    toSimplifiedInstance = (str: string) => _toSimplified(str, true);
  }
  return toSimplifiedInstance(str);
};

export const createLogger = ({ debugMode }: { debugMode: boolean } = { debugMode: false }) => {
  const dateTime = () =>
    new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
    });

  return {
    debug: (...data: any[]) => {
      if (debugMode) {
        console.debug(`${dateTime()} DEBUG`, ...data);
      }
    },
    info: (...data: any[]) => {
      console.info(`${dateTime()} INFO`, ...data);
    },
    error: (...data: any[]) => {
      console.error(`${dateTime()} ERROR`, ...data);
    },
  };
};

const logger = createLogger();

/**
 * 向指定地址推送信息 如企业微信群机器人
 * @see https://developer.work.weixin.qq.com/document/path/91770
 */
export async function sendNotifyMsg(data: any, url: string, identifier?: string) {
  if (!url) {
    return { success: false };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const { status, statusText } = response;
    const body = await response.json();
    logger.info(`${sendNotifyMsg.name} ${identifier} 推送信息结果 status ${status}`, body);
    return { success: true };
  } catch (e) {
    logger.error(`${sendNotifyMsg.name} ${identifier} 推送信息失败 `, e);
    return { success: false };
  }
}
