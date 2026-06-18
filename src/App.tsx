import Game from './components/Game.tsx';

import { ToastContainer } from 'react-toastify';
import starImg from '../assets/star.svg';
import helpImg from '../assets/help.svg';
// import { UserButton } from '@clerk/clerk-react';
// import { Authenticated, Unauthenticated } from 'convex/react';
// import LoginButton from './components/buttons/LoginButton.tsx';
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import ReactModal from 'react-modal';
import Timeline from './components/Timeline.tsx';
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

export default function Home() {
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const worldStatus = useQuery(api.world.defaultWorldStatus);
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
          <Button imgUrl={starImg} onClick={() => setHistoryModalOpen(true)}>
            大事记
          </Button>
          <Button imgUrl={helpImg} onClick={() => setHelpModalOpen(true)}>
            关于
          </Button>
        </div>

        <Game />

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
