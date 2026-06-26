import JoyaNoKane from "@/components/pages/JoyaNoKane";
// import WasmTerminal from '@/components/pages/WasmTerminal'
// import Tetlis from '@/components/pages/Tetlis';
// import Insider from "@/components/pages/Insider";
import Chat from "@/components/pages/Chat";
import JiyuGacha from "@/components/pages/JiyuGacha";
import FreeHaiku from "@/components/pages/FreeHaiku";
import LeapToFreedom from "@/components/pages/LeapToFreedom";
import "@/App.css";

import { Link, Route, Switch } from "wouter";

// --- 1. 作品データの定義 ---
const PROJECTS = [
  {
    id: "joya",
    title: "除夜の鐘",
    description:
      "大晦日に作ったアプリ。ついてついてつきまくれ！目指せ108万回！",
    path: "/joya",
  },
  {
    id: "chat",
    title: "チャット",
    description: "Peer.jsで作ったP2Pのリアルタイムチャットアプリ",
    path: "/chat",
  },
  {
    id: "gacha",
    title: "JIYU GACHA（発想ガチャ）",
    description:
      "テーマ「自由」のハッカソン作品。領域×ターゲット×技術をガチャで引いて企画の種を出す。Rust→WASM製。",
    path: "/gacha",
  },
  {
    id: "haiku",
    title: "自由律俳句ジェネレーター",
    description:
      "テーマ「自由」を自由律で解釈。五・七・五に縛られず、語彙の組み合わせで一句を詠む。Rust→WASM製。",
    path: "/haiku",
  },
  {
    id: "leap",
    title: "LEAP TO FREEDOM（自由への跳躍）",
    description:
      "テーマ「自由」を重力からの解放で表現。ワンボタンで重力を反転し、迫る壁を避けて走り続けるランナー。Rust→WASM製。",
    path: "/leap",
  },
  // {
  //   id: 'insider',
  //   title: 'インサイダー',
  //   description: '好きなボドゲの一つ、インサイダーゲームをPeer.jsで実装しました。',
  //   path: '/insider'
  // },
  // {
  //   id: 'tetlis',
  //   title: 'テトリス',
  //   description: '大晦日といえば大掃除、大掃除といえば片付け、片付けといえばテトリス（？）ということで作りました。',
  //   path: '/tetlis'
  // },
  // 冷静に考えたらそんなに面白くなさそう
  // {
  //   id: 'wasm-terminal',
  //   title: 'Wasm Terminal',
  //   description: 'Web上でDockerコンテナを実行するためのターミナル。ぶっ壊してしまえ！！！',
  //   path: '/wasm-terminal'
  // },
  {
    id: "coming-soon",
    title: "次の作品を制作中...",
    description: "現在、新しいアイデアを形にしています。お楽しみに！",
    path: "#", // 未実装や準備中の作品
  },
];

// --- 2. 各コンポーネント ---

// 作品カード
const ProjectCard = ({ project }: { project: (typeof PROJECTS)[0] }) => (
  <div className="group overflow-hidden rounded-2xl bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl border border-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-white">
    <h3 className="mb-2 text-xl font-bold text-gray-800 dark:text-white">
      {project.title}
    </h3>
    <p className="mb-4 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
      {project.description}
    </p>
    <Link href={project.path}>
      {/* aタグを直接使用し、Tailwindのスタイルを適用 */}
      <a className="inline-flex items-center font-semibold text-indigo-600 transition-colors duration-300 group-hover:text-indigo-500 dark:text-indigo-400 dark:group-hover:text-indigo-300">
        作品を見る{" "}
        <span className="ml-1 transition-transform duration-300 group-hover:translate-x-1">
          →
        </span>
      </a>
    </Link>
  </div>
);

// トップページ（作品一覧）
const TopPage = () => (
  <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
    <div className="container mx-auto px-4 py-16">
      <header className="text-center mb-16">
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-6xl md:text-7xl">
          ナナオのあそびば
        </h1>
        <p className="mt-4 text-xl text-gray-600 dark:text-gray-400">
          個人的に作った作品を置いていきます。
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {PROJECTS.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </section>
    </div>
  </main>
);

// --- 3. メインアプリ (ルーティング) ---
export default function App() {
  return (
    <>
      <Switch>
        <Route path="/" component={TopPage} />
        <Route path="/joya" component={JoyaNoKane} />
        <Route path="/chat" component={Chat} />
        <Route path="/gacha" component={JiyuGacha} />
        <Route path="/haiku" component={FreeHaiku} />
        <Route path="/leap" component={LeapToFreedom} />
        {/*<Route path="/insider" component={Insider} />*/}
        {/* <Route path="/wasm-terminal" component={WasmTerminal} /> */}
        {/* <Route path="/tetlis" component={Tetlis} /> */}
        {/* 404ページ */}
        <Route>
          <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-2xl font-bold">
            404: ページが見つかりません
            <Link href="/">
              <a className="ml-4 text-indigo-600 dark:text-indigo-400 hover:underline">
                トップに戻る
              </a>
            </Link>
          </div>
        </Route>
      </Switch>
    </>
  );
}
