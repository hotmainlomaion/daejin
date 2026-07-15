/**
 * 워커 진입점.
 *
 * ⚠️ 이 프로세스는 상시 구동되어야 한다 (Railway/Fly.io/VM).
 * serverless function에 올리지 않는다 — 봇은 브라우저 종료와 무관하게 24시간 돌아야 한다
 * (CLAUDE.md 가드레일 9, README 아키텍처 핵심 제약).
 *
 * 웹앱과는 DB로만 통신한다. bots.status를 폴링해서 러너를 띄우고 내린다.
 */
import { loadConfig } from './config.ts';
import { createDb, fetchRunningBots } from './db.ts';
import { BotRunner } from './bot-runner.ts';
import { log } from './logger.ts';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config);

  log.info('FuturesLab 워커 시작 — 테스트넷 전용 (교육·검증 시뮬레이터)');
  log.info(`REST: ${config.binanceRestBase}`);
  log.info(`WS:   ${config.binanceWsBase}`);

  /** 현재 돌고 있는 러너. key = bot.id */
  const runners = new Map<string, BotRunner>();

  const tick = async (): Promise<void> => {
    let running;
    try {
      running = await fetchRunningBots(db);
    } catch (err) {
      log.error('봇 목록 폴링 실패 — 다음 주기에 재시도', err);
      return;
    }

    const runningIds = new Set(running.map((b) => b.id));

    // 정지된(또는 삭제된) 봇의 러너를 내린다.
    for (const [botId, runner] of runners) {
      if (!runningIds.has(botId)) {
        runner.stop();
        runners.delete(botId);
      }
    }

    // 새로 시작된 봇의 러너를 띄운다.
    for (const bot of running) {
      if (runners.has(bot.id)) continue;
      const runner = new BotRunner(bot, db, config);
      runners.set(bot.id, runner);
      // start()는 내부에서 실패를 bots.status='error'로 기록하므로 await하지 않는다.
      void runner.start();
    }
  };

  await tick();
  const timer = setInterval(() => void tick(), config.pollIntervalMs);

  // 종료 시 WS를 정리한다. 정리하지 않으면 재배포 때 연결이 새어나간다.
  const shutdown = (signal: string): void => {
    log.info(`${signal} 수신 — 종료 중`);
    clearInterval(timer);
    for (const runner of runners.values()) runner.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  // loadConfig가 메인넷 URL을 막는 경우 여기로 온다 — 기동 자체를 실패시킨다.
  log.error('워커 기동 실패', err);
  process.exit(1);
});
