import { useCallback, useEffect, useRef, useState } from "react";
import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { Mic, MicOff, Sparkles, Trash2 } from "lucide-react";

import BackLink from "@/components/atoms/BackLink";

const MODEL_ID = "gemma-2-2b-jpn-it-q4f16_1-MLC";
const SILENCE_MS = 5_000;
const SUGGESTION_HISTORY_SIZE = 5;
const DB_NAME = "voice-action";
const STORE_NAME = "utterances";

export type Utterance = {
  id: string;
  text: string;
  at: number;
};

type SpeechResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<SpeechResult>;
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readUtterances() {
  const db = await openDatabase();
  return new Promise<Utterance[]>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();
    request.onsuccess = () =>
      resolve((request.result as Utterance[]).sort((a, b) => a.at - b.at));
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

async function writeUtterance(utterance: Utterance) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(utterance);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function clearUtterances() {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

// eslint-disable-next-line react-refresh/only-export-components
export function conversationForPrompt(utterances: Utterance[]) {
  return utterances
    .slice(-8)
    .map(({ text }) => text)
    .join("\n");
}

// eslint-disable-next-line react-refresh/only-export-components
export function suggestionHistoryForPrompt(suggestions: string[]) {
  return suggestions
    .slice(-SUGGESTION_HISTORY_SIZE)
    .map((text) => `- ${text}`)
    .join("\n");
}

function errorMessage(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "マイクの使用が許可されていません。ブラウザの設定を確認してください。";
  }
  if (error === "no-speech") return "音声が聞き取れませんでした。";
  return `音声認識でエラーが発生しました（${error}）。`;
}

export default function VoiceAction() {
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [interimText, setInterimText] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [modelStatus, setModelStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [modelProgress, setModelProgress] = useState(0);
  const [notice, setNotice] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const utterancesRef = useRef<Utterance[]>([]);
  const suggestionHistoryRef = useRef<string[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engineRef = useRef<MLCEngineInterface | null>(null);
  const enginePromiseRef = useRef<Promise<MLCEngineInterface> | null>(null);
  const pendingSuggestionRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    void readUtterances()
      .then((stored) => {
        utterancesRef.current = stored;
        setUtterances(stored);
      })
      .catch(() => setNotice("保存済みの会話を読み込めませんでした。"));

    return () => {
      listeningRef.current = false;
      recognitionRef.current?.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const suggestNextTopic = useCallback(async () => {
    const engine = engineRef.current;
    const transcript = conversationForPrompt(utterancesRef.current);
    const previousSuggestions = suggestionHistoryForPrompt(
      suggestionHistoryRef.current,
    );
    if (!transcript) return;
    if (!engine) {
      pendingSuggestionRef.current = true;
      return;
    }

    const generation = ++generationRef.current;
    setIsSuggesting(true);
    setSuggestion("");
    try {
      const response = await engine.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              `あなたは、会話が楽しく自然に続くように次の話題を提案するアシスタントです。入力には音声認識の誤変換が含まれる可能性があります。

              会話の流れに応じて、次のいずれかを選んでください。
              ・今の話題を少しだけ深める
              ・関連する別の話題へ横に広げる
              ・一区切りついた話題から、身近で答えやすい新しい話題へ切り替える

              同じ話題への質問が続いている場合は、深掘りせず話題を広げるか切り替えてください。「なぜ」「理由」「具体的には」と繰り返し尋ねないでください。相手の考えや個人的な事情を追及する質問よりも、気軽に話せる体験、好み、最近の出来事、周辺の話題を優先してください。

              直近の提案が入力に含まれる場合は、それらと同じ内容や言い換えを避け、別の観点または別の話題を提案してください。

              会話にない人物・出来事・固有名詞は作らないでください。ただし、一般的な話題を新しく提案することはできます。内容が多少不明瞭でも、聞き取れた範囲から自然に話題を提案してください。意味を判断できない場合に限り、短い確認質問をしてください。

              次に話せる内容を、日本語で自然な一文として1つだけ返してください。前置きや箇条書きは不要です。`
          },
          {
            role: "user",
            content: previousSuggestions
              ? `会話ログ:\n${transcript}\n\n直近の提案（重複禁止）:\n${previousSuggestions}`
              : transcript,
          },
        ],
        max_tokens: 80,
        temperature: 0.2,
      });
      if (generation === generationRef.current) {
        const nextSuggestion =
          response.choices[0]?.message.content?.trim() ||
          "最近、気になっていることはありますか？";
        suggestionHistoryRef.current = [
          ...suggestionHistoryRef.current,
          nextSuggestion,
        ].slice(-SUGGESTION_HISTORY_SIZE);
        setSuggestion(nextSuggestion);
      }
    } catch {
      setNotice("話題を生成できませんでした。モデルを再準備してください。");
      setModelStatus("error");
      enginePromiseRef.current = null;
      engineRef.current = null;
    } finally {
      if (generation === generationRef.current) setIsSuggesting(false);
    }
  }, []);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (utterancesRef.current.length > 0) void suggestNextTopic();
    }, SILENCE_MS);
  }, [suggestNextTopic]);

  const prepareModel = useCallback(async () => {
    if (engineRef.current) return engineRef.current;
    if (enginePromiseRef.current) return enginePromiseRef.current;
    if (!("gpu" in navigator)) {
      setModelStatus("error");
      setNotice("このブラウザはWebGPUに対応していないため、WebLLMを実行できません。");
      throw new Error("WebGPU is not available");
    }

    setNotice("");
    setModelStatus("loading");
    enginePromiseRef.current = import("@mlc-ai/web-llm")
      .then(({ CreateMLCEngine, prebuiltAppConfig }) =>
        CreateMLCEngine(MODEL_ID, {
          appConfig: { ...prebuiltAppConfig, cacheBackend: "indexeddb" },
          initProgressCallback: ({ progress }) =>
            setModelProgress(Math.round(progress * 100)),
        }),
      )
      .then((engine) => {
        engineRef.current = engine;
        setModelStatus("ready");
        if (pendingSuggestionRef.current) {
          pendingSuggestionRef.current = false;
          void suggestNextTopic();
        }
        return engine;
      })
      .catch((error: unknown) => {
        enginePromiseRef.current = null;
        setModelStatus("error");
        setNotice(
          error instanceof Error
            ? `モデルを準備できませんでした: ${error.message}`
            : "モデルを準備できませんでした。",
        );
        throw error;
      });
    return enginePromiseRef.current;
  }, [suggestNextTopic]);

  const appendUtterance = useCallback((text: string) => {
    const utterance = {
      id: crypto.randomUUID(),
      text,
      at: Date.now(),
    };
    utterancesRef.current = [...utterancesRef.current, utterance];
    setUtterances(utterancesRef.current);
    void writeUtterance(utterance).catch(() =>
      setNotice("会話を端末へ保存できませんでした。"),
    );
  }, []);

  const startListening = useCallback(() => {
    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setNotice("このブラウザはWeb Speech APIの音声認識に対応していません。");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "ja-JP";
    recognition.onresult = ({ resultIndex, results }) => {
      generationRef.current += 1;
      setIsSuggesting(false);
      let interim = "";
      for (let index = resultIndex; index < results.length; index += 1) {
        const result = results[index];
        const text = result?.[0]?.transcript.trim();
        if (!text) continue;
        if (result.isFinal) appendUtterance(text);
        else interim += text;
      }
      setInterimText(interim);
      resetSilenceTimer();
    };
    recognition.onerror = ({ error }) => {
      if (error !== "aborted") setNotice(errorMessage(error));
    };
    recognition.onend = () => {
      if (!listeningRef.current) return;
      try {
        recognition.start();
      } catch {
        setNotice(
          "音声認識を再開できませんでした。録音を開始し直してください。",
        );
        listeningRef.current = false;
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    setIsListening(true);
    setNotice("");
    try {
      recognition.start();
    } catch {
      listeningRef.current = false;
      setIsListening(false);
      setNotice(
        "録音を開始できませんでした。マイクの設定を確認してください。",
      );
      return;
    }
    void prepareModel().catch(() => undefined);
  }, [appendUtterance, prepareModel, resetSilenceTimer]);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setInterimText("");
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  }, []);

  const clearConversation = useCallback(() => {
    generationRef.current += 1;
    utterancesRef.current = [];
    suggestionHistoryRef.current = [];
    setUtterances([]);
    setSuggestion("");
    setInterimText("");
    void clearUtterances().catch(() =>
      setNotice("保存済みの会話を削除できませんでした。"),
    );
  }, []);

  const modelLabel = {
    idle: "録音開始時に準備します",
    loading: `モデルを準備中 ${modelProgress}%`,
    ready: "話題提案の準備完了",
    error: "モデルの準備が必要です",
  }[modelStatus];

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-stone-900">
      <header className="mx-auto max-w-5xl px-5 pb-8 pt-5">
        <BackLink className="text-sm text-stone-500 hover:text-stone-900" />
        <div className="mt-10 max-w-3xl">
          <p className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.25em] text-orange-700">
            Local conversation companion
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
            VoiceAction
          </h1>
          <p className="mt-5 text-lg leading-8 text-stone-600">
            会話を記録し、5秒の沈黙をきっかけに次の話題を提案します。
            会話履歴とAI処理はこの端末内に留まります。
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-5 px-5 pb-16 lg:grid-cols-[1fr_320px]">
        <section className="overflow-hidden rounded-3xl border border-stone-300 bg-white shadow-[0_20px_60px_rgba(68,57,43,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 px-6 py-5">
            <div>
              <h2 className="text-lg font-bold">会話ログ</h2>
              <p className="mt-1 text-sm text-stone-500">
                {isListening ? "音声を聞いています" : "録音は停止中です"}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
                isListening
                  ? "bg-red-50 text-red-700"
                  : "bg-stone-100 text-stone-500"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isListening ? "animate-pulse bg-red-500" : "bg-stone-400"
                }`}
              />
              {isListening ? "REC" : "OFF"}
            </span>
          </div>

          <div
            className="min-h-[360px] max-h-[55vh] space-y-4 overflow-y-auto p-6"
            aria-live="polite"
          >
            {utterances.length === 0 && !interimText ? (
              <div className="grid min-h-[300px] place-items-center text-center text-stone-400">
                <div>
                  <Mic className="mx-auto mb-4 h-10 w-10" aria-hidden="true" />
                  <p>録音を始めると、ここに会話が表示されます。</p>
                </div>
              </div>
            ) : (
              utterances.map(({ id, text, at }) => (
                <article key={id} className="flex gap-4">
                  <time className="shrink-0 pt-1 font-mono text-xs text-stone-400">
                    {new Date(at).toLocaleTimeString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <p className="m-0 leading-7 text-stone-700">{text}</p>
                </article>
              ))
            )}
            {interimText && (
              <p className="ml-14 italic text-stone-400">{interimText}</p>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-3xl bg-stone-900 p-6 text-stone-50">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">
              Controls
            </p>
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              className={`mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 font-bold text-white transition ${
                isListening
                  ? "bg-stone-700 hover:bg-stone-600"
                  : "bg-orange-600 hover:bg-orange-500"
              }`}
            >
              {isListening ? (
                <MicOff className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Mic className="h-5 w-5" aria-hidden="true" />
              )}
              {isListening ? "録音を停止" : "録音を開始"}
            </button>
            <p className="mt-4 text-center text-xs text-stone-400">
              {modelLabel}
            </p>
            {modelStatus === "error" && (
              <button
                type="button"
                onClick={() => void prepareModel().catch(() => undefined)}
                className="mt-3 w-full rounded-xl border border-stone-600 bg-transparent px-4 py-2 text-sm text-stone-200 hover:border-stone-400"
              >
                モデルを再準備
              </button>
            )}
          </section>

          <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6">
            <div className="flex items-center gap-2 text-orange-800">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              <h2 className="font-bold">次の話題</h2>
            </div>
            <div className="mt-4 min-h-24 text-sm leading-7 text-stone-700">
              {isSuggesting
                ? "会話をもとに考えています…"
                : suggestion ||
                  "会話が5秒止まると、ここに話題を提案します。"}
            </div>
          </section>

          {notice && (
            <p
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800"
            >
              {notice}
            </p>
          )}

          <button
            type="button"
            onClick={clearConversation}
            disabled={utterances.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-transparent px-4 py-3 text-sm text-stone-600 hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            会話を削除
          </button>

          <p className="text-xs leading-5 text-stone-500">
            会話テキストはIndexedDB、AIモデルはブラウザのキャッシュに保存されます。
            Web Speech
            APIの音声処理方法はブラウザにより異なり、外部の音声認識サービスを使う場合があります。
          </p>
        </aside>
      </main>
    </div>
  );
}
