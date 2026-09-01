import Game from './components/Game.tsx';

import { ToastContainer } from 'react-toastify';
import starImg from '../assets/star.svg';
import helpImg from '../assets/help.svg';
// import { UserButton } from '@clerk/clerk-react';
// import { Authenticated, Unauthenticated } from 'convex/react';
// import LoginButton from './components/buttons/LoginButton.tsx';
import { useCallback, useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import ReactModal from 'react-modal';
import Timeline from './components/Timeline.tsx';
import EventBanner from './components/EventBanner.tsx';
import EventTitleCard from './components/EventTitleCard.tsx';
import StorytellerIntro, {
  INTRO_SEEN_KEY,
  readIntroSeenAt,
} from './components/StorytellerIntro.tsx';
import MusicButton from './components/buttons/MusicButton.tsx';
import Button from './components/buttons/Button.tsx';
import InteractButton from './components/buttons/InteractButton.tsx';
import FreezeButton from './components/FreezeButton.tsx';
import { MAX_HUMAN_PLAYERS } from '../convex/constants.ts';

// 配置信息
const CONFIG = {
  githubUrl: 'https://github.com/toby-bridges/wulin-town',
  twitter: 'https://x.com/li9292',
};

// 「大事记」最后一次被打开的时间戳（毫秒）。用来判断有没有未读内容。
const TIMELINE_SEEN_KEY = 'wulin:timelineSeenAt';

// localStorage 在隐私模式 / 禁用站点数据的浏览器里访问就会抛错（有的甚至
// 连读属性都抛），所以读写全部兜住：读失败一律当作"从没看过"，最差结果只是
// 红点常亮；写失败就当这次已读没持久化，本次会话内红点仍由 state 熄灭。
function readTimelineSeenAt(): number {
  try {
    const parsed = Number(localStorage.getItem(TIMELINE_SEEN_KEY));
    // 必须 clamp 到 ≥ 0：这个值是用户可手改的。负数会让「空世界」也满足
    // latestActivityTime(0) > seenAt(负)，红点在没有任何内容时常亮；
    // Infinity（如手填 '1e400'）则反过来让红点永远点不亮，是无声失效。
    // 两个方向都由这一条兜掉，NaN / null / 空串也走同一条。
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export default function Home() {
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  // 说书人开场是否已经演完（看完点走、或压根没得演都算）。章回题卡要等它变
  // true 才挂载：开场遮罩和题卡叠在一起会互相抢戏，而且开场那几秒弹出来的
  // 题卡用户根本看不见，白白消耗掉一次「只弹一次」的额度。
  const [introDone, setIntroDone] = useState(false);
  // 已读水位线放进 state，这样点开大事记能立刻熄灭红点，不用等刷新。
  const [timelineSeenAt, setTimelineSeenAt] = useState(readTimelineSeenAt);
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  // 整个首页只订阅这一次：横幅拿 latestEvent，红点拿两个时间戳。
  const latestActivity = useQuery(api.director.latestActivity, worldId ? { worldId } : 'skip');

  // 单独拎出来一份：下面的 effect 要用它推进说书人开场的水位线。那条水位线
  // 只认回顾，不能用 latestActivityTime——后者被最新事件拉高后会把「还没读过
  // 的回顾」一起判成已读，开场从此静默跳过。
  const latestRecapTime = latestActivity?.latestRecapTime ?? 0;
  const latestActivityTime = Math.max(latestActivity?.latestEventTime ?? 0, latestRecapTime);
  // 模态框开着时一律视作「正在看」，不亮红点；关掉时水位线已由下面的 effect
  // 推到最新，所以也不会回弹。
  const hasUnread = latestActivityTime > timelineSeenAt && !historyModalOpen;

  // 两条已读水位线都只在这一处写入：大事记红点的 timelineSeenAt
  // （state + localStorage），和说书人开场的 introSeenAt（只 localStorage）。
  // 它们同源同时机——「模态框开着 = 用户正看着大事记」——所以合在一个 effect
  // 里，各自守各自的条件。
  //
  // 推进时机是「模态框开着期间持续推进」，而不是「点开的那一瞬间推进一次」：
  // 后者留了个窗口——latestActivity 还没返回时点开，那一刻 latestActivityTime
  // 还是 0，水位线纹丝不动；等数据到达时用户其实正盯着大事记看，关掉后红点却
  // 错亮，要再点开一次才补上。挂成 effect 后，数据什么时候到都算已读。
  //
  // 水位线刻意不用 Date.now()：被比较的两个时间戳都来自服务端
  // （startTime / _creationTime），掺进本地墙钟两个方向都会坏事——
  // 客户端时钟偏慢，红点点开也灭不掉；偏快（快过一个生成周期），
  // 之后的新事件永远点不亮红点，(C) 直接失效。
  // 所以水位线只在服务端时间轴上、且只单调前进。
  //
  // 下面把原来的 `if (!historyModalOpen || 没新内容) return` 拆成了「先判模态
  // 框、再各判各的水位线」。对红点那半是等价改写（`if (!A || B) return; X`
  // 与 `if (!A) return; if (!B) X` 同义），只是让开场那半能独立推进：读过的
  // 回顾要算数，不该被「红点已经是最新」这个无关条件挡住。
  useEffect(() => {
    if (!historyModalOpen) return;

    // (1) 大事记红点水位线。
    if (latestActivityTime > timelineSeenAt) {
      setTimelineSeenAt(latestActivityTime);
      try {
        localStorage.setItem(TIMELINE_SEEN_KEY, String(latestActivityTime));
      } catch {
        // 存不进去就算了，不影响本次会话。
      }
    }

    // (2) 说书人开场水位线。补的是这条缝：长驻访客在大事记里把最新一回回顾
    // 读完了，下次进站说书人却还要把同一回从头演一遍。回顾在大事记列表里就
    // 是完整正文，读过就该算听过。
    //
    // 存的是 latestRecapTime，即那条回顾的服务端 _creationTime——与
    // StorytellerIntro 关闭时写进去的、以及它拿来比较的
    // `recaps[0]._creationTime` 是同一个数（两处都取 episodeRecaps 的
    // worldDay 倒序第一条），所以两边的水位线在同一根时间轴上，语义一致。
    //
    // 这里只写 localStorage、不设 state，是刻意的：introSeenAt 没有对应的
    // React state——开场只在 StorytellerIntro 挂载时读一次（那个 useState
    // 初始值），本次会话里再改也不会、也不该让正在演的开场中途消失。这次写
    // 入是给「下次进站」看的。
    //
    // 必须留在 historyModalOpen 里面：脱离这个条件就变成「只要有新回顾就算
    // 已读」，开场功能等于被永久关掉。
    if (latestRecapTime > readIntroSeenAt()) {
      try {
        localStorage.setItem(INTRO_SEEN_KEY, String(latestRecapTime));
      } catch {
        // 同上，存不进去顶多下次进店再听一遍开场。
      }
    }
  }, [historyModalOpen, latestActivityTime, timelineSeenAt, latestRecapTime]);

  // 打开大事记的所有路径（按钮、横幅）都走这里。红点的熄灭交给上面的
  // hasUnread / effect，这里只负责开框。
  const openTimeline = useCallback(() => setHistoryModalOpen(true), []);

  // 必须是稳定引用：StorytellerIntro 把它放进了 effect 依赖里，每次渲染换一个
  // 新函数会让那个 effect 白跑。
  const finishIntro = useCallback(() => setIntroDone(true), []);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between font-body game-background">
      {/* 关于/联系 模态框 */}
      <ReactModal
        isOpen={helpModalOpen}
        onRequestClose={() => setHelpModalOpen(false)}
        style={modalStyles}
        contentLabel="关于"
        ariaHideApp={false}
      >
        <div className="font-body">
          <h1 className="text-center text-6xl font-bold font-display game-title">关于</h1>

          <h2 className="text-4xl mt-6">武林小镇</h2>
          <p className="mt-2">
            这是一个基于 AI Town 的《武林外传》主题项目，让同福客栈的角色在 AI 时代重新相聚。
          </p>
          <p className="mt-2">
            观看佟掌柜、老白、小郭他们在客栈里聊天，或者点击「互动」加入他们！
          </p>

          <h2 className="text-4xl mt-6">操作说明</h2>
          <p className="mt-2">• 拖拽移动视角，滚轮缩放</p>
          <p className="mt-2">• 点击角色查看聊天记录</p>
          <p className="mt-2">• 点击「互动」加入游戏，与角色对话</p>

          <h2 className="text-4xl mt-6">联系作者</h2>
          <p className="mt-4">
            <a
              href={CONFIG.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Twitter/X: @li9292
            </a>
          </p>
        </div>
      </ReactModal>

      {/* 大事记 模态框 */}
      <ReactModal
        isOpen={historyModalOpen}
        onRequestClose={() => setHistoryModalOpen(false)}
        style={modalStyles}
        contentLabel="大事记"
        ariaHideApp={false}
      >
        <div className="font-body">
          <h1 className="text-center text-6xl font-bold font-display game-title">大事记</h1>
          {historyModalOpen && <Timeline worldId={worldStatus?.worldId} />}
        </div>
      </ReactModal>
      {/*<div className="p-3 absolute top-0 right-0 z-10 text-2xl">
        <Authenticated>
          <UserButton afterSignOutUrl="/wulin-town" />
        </Authenticated>

        <Unauthenticated>
          <LoginButton />
        </Unauthenticated>
      </div> */}

      <div className="w-full lg:h-screen min-h-screen relative isolate overflow-hidden lg:p-8 shadow-2xl flex flex-col justify-start">
        <h1 className="mx-auto text-4xl p-3 sm:text-8xl lg:text-9xl font-bold font-display leading-none tracking-wide game-title w-full text-left sm:text-center sm:w-auto">
          同福客栈
        </h1>

        <div className="max-w-xs md:max-w-xl lg:max-w-none mx-auto my-2 text-center text-base sm:text-xl md:text-2xl text-white leading-tight shadow-solid">
          《武林外传》AI小镇 - 看佟掌柜、老白、小郭他们在客栈里聊天吧！
        </div>

        {/* 按钮栏 - 地图上方居中 */}
        <div className="flex justify-center items-center gap-2 sm:gap-4 py-3 flex-wrap">
          <FreezeButton />
          <MusicButton />
          <Button imgUrl={starImg} onClick={() => window.open(CONFIG.githubUrl, '_blank', 'noopener,noreferrer')}>
            源码
          </Button>
          <InteractButton />
          {/* 未读红点挂在按钮右上角：wrapper 只负责定位，不影响按钮本身的像素风外框。 */}
          <div className="relative inline-flex">
            <Button
              imgUrl={starImg}
              onClick={openTimeline}
              title={hasUnread ? '大事记（有新内容）' : '大事记'}
            >
              大事记
              {/* 红点是纯视觉的（aria-hidden），读屏用户靠这段 sr-only 文本
                  拿到未读态：按钮的可访问名变成「大事记（有新内容）」。
                  sr-only 是 position:absolute，按 flex 规范不构成 flex item，
                  所以不会吃掉父级 gap-4 多撑出一格。 */}
              {hasUnread && <span className="sr-only">（有新内容）</span>}
            </Button>
            {hasUnread && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-1 -right-1 h-3 w-3 animate-pulse rounded-full bg-red-500"
              />
            )}
          </div>
          <Button imgUrl={helpImg} onClick={() => setHelpModalOpen(true)}>
            关于
          </Button>
        </div>

        <EventBanner event={latestActivity?.latestEvent} onOpenTimeline={openTimeline} />

        {/* 题卡要绝对定位在画布上，所以给 Game 套一层定位祖先。
            两个 grow 都是必须的：外层 wrapper 顶替 Game 原来在这列 flex 里的
            位置（lg 下撑满剩余高度），Game 自己的 lg:grow 则在 wrapper 内部
            继续生效——所以 wrapper 得是 flex-col。刻意不加 min-h-0：默认的
            min-height:auto 正是今天「不被压到 Game 的 min-h-[480px] 以下」的
            那道保险。 */}
        <div className="relative flex flex-col lg:grow">
          <Game />
          {/* 开场没演完不挂题卡（挂载时机同时也是题卡记基线的时机）。 */}
          {introDone && (
            <EventTitleCard
              worldId={worldId}
              latestEventTime={latestActivity?.latestEventTime}
              latestEvent={latestActivity?.latestEvent}
            />
          )}
        </div>

        {/* 全屏 fixed 遮罩，不占布局；演完后 App 直接把它卸载。 */}
        {!introDone && <StorytellerIntro worldId={worldId} onClose={finishIntro} />}

        <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
      </div>
    </main>
  );
}

const modalStyles = {
  overlay: {
    backgroundColor: 'rgb(0, 0, 0, 75%)',
    zIndex: 12,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '50%',

    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};
