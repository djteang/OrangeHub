import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import packageInfo from "../package.json";
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpRight,
  Bot,
  Boxes,
  BookmarkPlus,
  Cable,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Code2,
  Command,
  Copy,
  CornerDownLeft,
  Cpu,
  Database,
  Download,
  Eye,
  EyeOff,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileKey2,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  Folder,
  FolderOpen,
  FolderUp,
  HardDrive,
  History,
  KeyRound,
  LayoutGrid,
  Link2,
  LockKeyhole,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Minus,
  MemoryStick,
  Music,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Sparkles,
  Settings2,
  ShieldCheck,
  Sun,
  Moon,
  TerminalSquare,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { check as checkForNativeUpdate } from "@tauri-apps/plugin-updater";
import orangeHubIcon from "./assets/orangehub-icon.png";
import mysqlIcon from "./assets/database/mysql.svg";
import mariadbIcon from "./assets/database/mariadb.svg";
import tidbIcon from "./assets/database/tidb.svg";
import postgresqlIcon from "./assets/database/postgresql.svg";
import cockroachIcon from "./assets/database/cockroachlabs.svg";
import sqliteIcon from "./assets/database/sqlite.svg";
import redisIcon from "./assets/database/redis.svg";
import mongoIcon from "./assets/database/mongodb.svg";
import dorisIcon from "./assets/database/apachedoris.svg";
import neonIcon from "./assets/database/neon.svg";
import clickhouseIcon from "./assets/database/clickhouse.svg";
import oceanbaseIcon from "./assets/database/oceanbase.svg";
import starrocksIcon from "./assets/database/starrocks.svg";
import sqlServerIcon from "./assets/database/microsoftsqlserver.svg";
import oracleIcon from "./assets/database/oracle.svg";
import aiOpenAiIcon from "./assets/ai/openai.svg";
import aiAnthropicIcon from "./assets/ai/anthropic.svg";
import aiGoogleIcon from "./assets/ai/google-gemini.svg";
import aiDeepSeekIcon from "./assets/ai/deepseek.svg";
import aiQwenIcon from "./assets/ai/qwen.svg";
import aiZhipuIcon from "./assets/ai/zhipu.png";
import aiKimiIcon from "./assets/ai/kimi.svg";
import aiBaiduIcon from "./assets/ai/baidu.svg";
import aiSiliconFlowIcon from "./assets/ai/siliconflow-mark.svg";
import aiNewApiIcon from "./assets/ai/newapi.png";
import aiSub2ApiIcon from "./assets/ai/sub2api.svg";
import aiCustomIcon from "./assets/ai/custom.svg";
import {
  deleteConnection,
  deleteHistoryEntry,
  deleteSqlSnippet,
  configureDataDirectory,
  createSqlDatabase,
  deleteSqlDatabase,
  deleteSqlTable,
  dumpSqlTable,
  dumpSqlDatabase,
  renameSqlDatabase,
  runSqlFile,
  deleteMongoDocument,
  deleteRedisKey,
  clearHistory,
  chooseDownloadPath,
  chooseDownloadDirectory,
  chooseLocalFile,
  chooseSqlFile,
  choosePrivateKey,
  executeRedis,
  executeSsh,
  executeSql,
  deleteSqlRow,
  getSqlTableData,
  getMongoDocuments,
  getRedisKeyDetail,
  getConnections,
  getAiProviders,
  invokeAiStream,
  defaultAiPrompts,
  normalizeAiProviderConfig,
  getDataDirectory,
  getVaultStatus,
  executeMongo,
  getSshMonitor,
  listSshMonitorHistory,
  getHistory,
  listSqlSnippets,
  openSshTerminal,
  closeSshTerminal,
  resizeSshTerminal,
  writeSshTerminal,
  remoteDelete,
  remoteRename,
  remoteDownload,
  remoteDownloadDirectory,
  remoteList,
  remoteReadText,
  remoteUpload,
  remoteWriteText,
  chooseDataDirectory,
  saveSshMonitorHistoryPoint,
  saveCsvFile,
  saveTextFile,
  restartApplication,
  initializeVault,
  insertSqlRow,
  insertMongoDocument,
  isNative,
  listRedisDatabases,
  listSqlDatabases,
  listSqlTables,
  listMongoCollections,
  listMongoDatabases,
  scanRedisKeys,
  lockVault,
  saveConnection,
  setTrayVaultState,
  saveAiProviders,
  saveSqlTableStructure,
  saveSqlSnippet,
  testConnection,
  testConnectionConfig,
  truncateSqlTable,
  trustSshHost,
  trustSshHostConfig,
  updateSqlCell,
  replaceMongoDocument,
  setRedisString,
  unlockVault,
  type Connection,
  type ConnectionKind,
  type AiPromptKey,
  type Cell,
  type FileEntry,
  type HistoryEntry,
  type SqlSnippet,
  type QueryResult,
  type SqlParameter,
  type RedisKeyDetail,
  type RedisKeyInfo,
  type MongoDocumentRow,
  type SqlTableData,
  type SqlColumn,
  type SqlTable as SqlTableInfo,
  type SshTerminalEvent,
  type SshMonitorHistoryPoint,
  type SshMonitorSnapshot,
  type TransferProgressEvent,
} from "./api";
import { DockerWorkspace } from "./DockerWorkspace";
import { DropdownSelect } from "./DropdownSelect";
import { ScrollArea } from "./ScrollArea";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";

const appVersion = packageInfo.version;

type Page = "overview" | "connections" | "snippets" | "history" | "aiHistory" | "settings";
type Theme = "light" | "dark";
type Toast = { kind: "success" | "error"; message: string };
type AiChatMessage = { role: "user" | "assistant" | "execution"; content: string; complete?: boolean; executionStatus?: "success" | "failed"; queryResult?: QueryResult };
type AiConversation = {
  id: string;
  title: string;
  mode: AiPromptKey;
  context: string;
  connectionId: string;
  sessionId?: string;
  connectionName: string;
  createdAt: string;
  updatedAt: string;
  messages: AiChatMessage[];
};
const aiConversationStorageKey = "orangehub-ai-conversations-v1";
const aiConversationsChangedEvent = "orangehub-ai-conversations-changed";

function readAiConversations(): AiConversation[] {
  try {
    const raw = window.localStorage.getItem(aiConversationStorageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AiConversation => {
      if (!item || typeof item !== "object") return false;
      const value = item as Partial<AiConversation>;
      return typeof value.id === "string" && typeof value.title === "string" && typeof value.mode === "string"
        && typeof value.context === "string" && typeof value.connectionId === "string" && typeof value.connectionName === "string"
        && typeof value.createdAt === "string" && typeof value.updatedAt === "string" && Array.isArray(value.messages);
    });
  } catch {
    return [];
  }
}

function writeAiConversations(conversations: AiConversation[]) {
  try {
    window.localStorage.setItem(aiConversationStorageKey, JSON.stringify(conversations.slice(0, 100)));
    window.dispatchEvent(new Event(aiConversationsChangedEvent));
  } catch {
    // Conversation history remains available for the current session if storage is unavailable.
  }
}

function aiConversationTitle(messages: AiChatMessage[], fallback: string) {
  const firstUser = messages.find((message) => message.role === "user")?.content.trim();
  return (firstUser || fallback || "新建 AI 对话").replace(/\s+/g, " ").slice(0, 64);
}

function AiQueryResultTable({ result }: { result: QueryResult }) {
  if (result.is_exec) return null;
  if (!result.columns.length) {
    return (
      <div className="ai-query-result-empty">
        <Check size={15} />
        <span>{result.rows.length ? "查询已完成，没有可展示的列信息" : "查询成功，没有返回数据行"}</span>
      </div>
    );
  }

  return (
    <div className="ai-query-result" role="region" aria-label="数据库查询结果">
      <div className="ai-query-result-heading">
        <span><Database size={13} />查询结果</span>
        <span>{result.rows.length.toLocaleString()} 行</span>
      </div>
      <div className="ai-query-result-wrap">
        <table className="ai-query-result-table">
          <thead>
            <tr>
              <th className="ai-query-result-index"><span>#</span><small>行号</small></th>
              {result.columns.map((column) => (
                <th key={column.name}>
                  <span>{column.name}</span>
                  <small>{column.data_type || "未知类型"}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="ai-query-result-index ai-query-result-row-number">{String(rowIndex + 1).padStart(2, "0")}</td>
                {result.columns.map((column, cellIndex) => {
                  const cell = row[cellIndex] ?? null;
                  const value = toCell(cell);
                  return (
                    <td key={`${rowIndex}-${column.name}-${cellIndex}`} className={cell === null ? "ai-query-result-null" : ""} title={value}>
                      {cell === null ? <span className="ai-query-result-null-value">NULL</span> : <span className="ai-query-result-cell">{value}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!result.rows.length && <tr><td className="ai-query-result-no-rows" colSpan={result.columns.length + 1}>没有匹配的数据行</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatAiQueryResultForCopy(result: QueryResult): string {
  const lines = [result.columns.map((column) => column.name).join("\t")];
  for (const row of result.rows) {
    lines.push(result.columns.map((_, index) => toCell(row[index] ?? null)).join("\t"));
  }
  return lines.join("\r\n");
}

function AiConversationOutline({
  messages,
  onSelect,
}: {
  messages: AiChatMessage[];
  onSelect: (messageIndex: number) => void;
}) {
  const userMessages = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === "user");
  if (!userMessages.length) return null;
  return (
    <nav className="ai-conversation-outline" aria-label="本次对话导航">
      <div className="ai-conversation-outline-list">
        {userMessages.map(({ message, index }) => (
          <button key={`${index}-${message.content.slice(0, 16)}`} type="button" className="ai-conversation-outline-item" onClick={(event) => { if (event.detail > 0) event.currentTarget.blur(); onSelect(index); }}>
            <span className="ai-conversation-outline-line" aria-hidden="true" />
            <span className="ai-conversation-outline-text">{message.content.replace(/\s+/g, " ").trim()}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function extractAiCode(text: string, mode: AiPromptKey): string {
  const blocks = [...text.matchAll(/```([\w+-]*)\s*\n?([\s\S]*?)```/g)];
  const accepted = mode === "serverControl"
    ? /^(bash|sh|shell|zsh|powershell|ps1|cmd|bat)?$/i
    : /^(sql|mysql|postgresql|postgres|sqlite|mssql|oracle|redis|json|javascript|mongodb|mongo)?$/i;
  const block = blocks.find((match) => accepted.test(match[1] || ""));
  return (block?.[2] || "").trim();
}

/**
 * AI SQL 建议中的参数通常会放在 SQL 代码块后面的“参数”代码块中。
 * 将常见的列表、JSON 数组和“?1: value”写法转换成 SQL 参数面板使用的结构，
 * 这样确认执行时不会丢掉问号占位符对应的值。
 */
function extractAiSqlParameters(text: string, expected: number): SqlParameter[] | null {
  if (expected <= 0) return [];
  const marker = text.match(/(?:^|\n)\s*(?:查询参数|绑定参数|参数(?:绑定|列表|值)?|parameters?(?:\s+bindings?)?)\s*[:：]?/im);
  if (!marker || marker.index === undefined) return null;
  const section = text.slice(marker.index + marker[0].length);
  const block = section.match(/```(?:[\w+-]+)?\s*\r?\n?([\s\S]*?)```/);
  let raw = block?.[1]?.trim() || "";

  const normalizeItems = (items: unknown[]): SqlParameter[] => items.slice(0, expected).map((item) => {
    let value = typeof item === "string" ? item.trim() : item == null ? "" : String(item);
    value = value.replace(/`+/g, "").trim();
    value = value.replace(/^[-*•]\s+/, "").trim();
    value = value.replace(/^\?\s*\d*\s*(?:=|:|->)\s*/, "");
    value = value.replace(/^(?:\?\s*)?\d+\s*[.)、]\s*/, "");
    value = value.replace(/^(?:参数|param(?:eter)?)\s*\d+\s*[:：=]\s*/i, "");
    let explicitKind: SqlParameter["kind"] | undefined;
    const suffixType = value.match(/\s*[（(]\s*(文本|数字|数值|布尔|布尔值|boolean|number|text|null)\s*[)）]\s*$/i);
    if (suffixType) {
      const type = suffixType[1].toLowerCase();
      explicitKind = type === "null" ? "null" : type === "boolean" || type === "布尔" || type === "布尔值" ? "boolean" : type === "number" || type === "数字" || type === "数值" ? "number" : "text";
      value = value.slice(0, suffixType.index).trim();
    }
    const typed = value.match(/^\s*(?:\?\s*)?\d+\s*[:=|]\s*(.*?)\s*(?:[（(]\s*(文本|数字|数值|布尔|布尔值|boolean|number|text|null)\s*[)）])?\s*$/i);
    if (typed) {
      value = typed[1].trim();
      const type = (typed[2] || "").toLowerCase();
      explicitKind = type === "null" ? "null" : type === "boolean" || type === "布尔" || type === "布尔值" ? "boolean" : type === "number" || type === "数字" || type === "数值" ? "number" : type === "text" || type === "文本" ? "text" : explicitKind;
    }
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (explicitKind) return { kind: explicitKind, value, configured: true };
    if (/^(null|none|nil)$/i.test(value)) return { kind: "null", value: "", configured: true };
    if (/^(true|false)$/i.test(value)) return { kind: "boolean", value: value.toLowerCase(), configured: true };
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return { kind: "number", value, configured: true };
    return { kind: "text", value, configured: true };
  });

  if (!raw) {
    const inline = section.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    raw = inline || "";
  }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeItems(parsed);
    if (parsed && typeof parsed === "object") {
      const values = Object.entries(parsed as Record<string, unknown>)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([, value]) => value);
      if (values.length) return normalizeItems(values);
    }
  } catch {
    // The prompt normally uses a plain text code block; continue with line parsing.
  }
  const sourceLines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lines: string[] = [];
  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = sourceLines[index].replace(/^[-*•]\s+/, "").trim();
    const next = sourceLines[index + 1]?.trim();
    if (/^(?:\?\s*\d*|\d+)\s*$/.test(line) && next && /^(?:=|:|->)\s*\S/.test(next)) {
      lines.push(`${line} ${next}`);
      index += 1;
    } else {
      lines.push(line);
    }
  }
  return lines.length ? normalizeItems(lines) : null;
}

type AiApiFormat =
  | "openai-chat-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-gemini";
type AiProviderConfig = {
  id: string;
  name: string;
  vendor: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  format: AiApiFormat;
  enabled: boolean;
  prompts: {
    serverControl: string;
    sqlPolish: string;
    databaseControl: string;
  };
};
const aiProviderStorageKey = "orangehub-ai-providers-v1";
const aiApiFormatOptions = [
  { value: "openai-chat-completions", label: "OpenAI Chat Completions" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "google-gemini", label: "Google Gemini" },
] satisfies { value: AiApiFormat; label: string }[];
const aiProviderPresets: Omit<AiProviderConfig, "id" | "apiKey" | "enabled" | "prompts">[] = [
  { name: "OpenAI", vendor: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1", format: "openai-responses" },
  { name: "Anthropic", vendor: "Anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5", format: "anthropic-messages" },
  { name: "Google Gemini", vendor: "Google", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", format: "google-gemini" },
  { name: "DeepSeek", vendor: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", format: "openai-chat-completions" },
  { name: "通义千问", vendor: "阿里云", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", format: "openai-chat-completions" },
  { name: "智谱 AI", vendor: "智谱", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.5", format: "openai-chat-completions" },
  { name: "Kimi", vendor: "月之暗面", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2-0711-preview", format: "openai-chat-completions" },
  { name: "百度千帆", vendor: "百度", baseUrl: "https://qianfan.baidubce.com/v2", model: "ernie-4.5-turbo-32k", format: "openai-chat-completions" },
  { name: "SiliconFlow", vendor: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen3-235B-A22B", format: "openai-chat-completions" },
  { name: "NewAPI", vendor: "NewAPI", baseUrl: "http://127.0.0.1:3000/v1", model: "gpt-4o-mini", format: "openai-chat-completions" },
  { name: "Sub2API", vendor: "Sub2API", baseUrl: "http://127.0.0.1:3000/v1", model: "gpt-4o-mini", format: "openai-chat-completions" },
  { name: "自定义服务", vendor: "Custom", baseUrl: "", model: "", format: "openai-chat-completions" },
];

function createAiProvider(preset: Omit<AiProviderConfig, "id" | "apiKey" | "enabled" | "prompts">, id: string = crypto.randomUUID()): AiProviderConfig {
  return { ...preset, id, apiKey: "", enabled: true, prompts: { ...defaultAiPrompts } };
}

function getAiProviderIcon(provider: Pick<AiProviderConfig, "name" | "vendor">): string {
  const name = provider.name.toLocaleLowerCase();
  const vendor = provider.vendor.toLocaleLowerCase();
  if (name.includes("openai") || vendor.includes("openai")) return aiOpenAiIcon;
  if (name.includes("anthropic") || vendor.includes("anthropic")) return aiAnthropicIcon;
  if (name.includes("gemini") || vendor.includes("google")) return aiGoogleIcon;
  if (name.includes("deepseek") || vendor.includes("deepseek")) return aiDeepSeekIcon;
  if (name.includes("qwen") || name.includes("通义") || vendor.includes("阿里") || vendor.includes("alibaba")) return aiQwenIcon;
  if (name.includes("智谱") || vendor.includes("智谱") || vendor.includes("zhipu")) return aiZhipuIcon;
  if (name.includes("kimi") || name.includes("moonshot") || vendor.includes("月之暗面") || vendor.includes("moonshot")) return aiKimiIcon;
  if (name.includes("百度") || name.includes("baidu") || vendor.includes("百度") || vendor.includes("baidu")) return aiBaiduIcon;
  if (name.includes("siliconflow") || vendor.includes("siliconflow")) return aiSiliconFlowIcon;
  if (name.includes("newapi") || vendor.includes("newapi")) return aiNewApiIcon;
  if (name.includes("sub2api") || vendor.includes("sub2api")) return aiSub2ApiIcon;
  return aiCustomIcon;
}

function readAiProviders(): AiProviderConfig[] {
  try {
    const stored = window.localStorage.getItem(aiProviderStorageKey);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((item): item is AiProviderConfig => {
          if (!item || typeof item !== "object") return false;
          const value = item as Partial<AiProviderConfig>;
          return typeof value.id === "string"
            && typeof value.name === "string"
            && typeof value.vendor === "string"
            && typeof value.baseUrl === "string"
            && typeof value.apiKey === "string"
            && typeof value.model === "string"
            && aiApiFormatOptions.some((option) => option.value === value.format)
            && typeof value.enabled === "boolean";
        });
        if (valid.length) return valid.map((provider) => normalizeAiProviderConfig(provider));
      }
    }
  } catch {
    // Use the built-in presets when local storage is unavailable or corrupt.
  }
  return aiProviderPresets.map((preset) => createAiProvider(preset, `preset-${preset.vendor.toLowerCase()}-${preset.name}`));
}

function AiAssistantDialog({
  mode,
  connection,
  sessionId,
  context,
  initialMessage,
  initialConversationId,
  initialMessages,
  onClose,
  onApply,
  onExecuteCommand,
}: {
  mode: AiPromptKey;
  connection: Connection;
  sessionId?: string;
  context: string;
  initialMessage?: string;
  initialConversationId?: string;
  initialMessages?: AiChatMessage[];
  onClose: () => void;
  onApply?: (value: string) => void;
  onExecuteCommand?: (command: string, assistantText?: string, onExecutionStart?: () => void, onQueryResult?: (result: QueryResult) => void) => Promise<string>;
}) {
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [providerId, setProviderId] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>(initialMessages || []);
  const [conversationId] = useState(() => initialConversationId || crypto.randomUUID());
  const [conversationSessionId] = useState(() => sessionId);
  const [input, setInput] = useState(initialMessage || "");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<"stream" | "confirm" | "execute" | null>(null);
  const [error, setError] = useState("");
  const [errorCanRetry, setErrorCanRetry] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const retryConversationRef = useRef<AiChatMessage[] | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const persistConversationRef = useRef<() => void>(() => undefined);
  const configuredProviders = providers.filter((provider) => provider.enabled && provider.baseUrl.trim() && provider.apiKey.trim() && provider.model.trim());
  const selectedProvider = configuredProviders.find((provider) => provider.id === providerId) || configuredProviders[0];
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content || "";
  const codeResult = lastAssistant ? extractAiCode(lastAssistant, mode) : "";
  const modeLabel = mode === "serverControl" ? "服务器接管" : mode === "sqlPolish" ? "SQL 润色" : "数据库助手";
  const modeHint = mode === "serverControl" ? "分析服务器状态、生成可审核命令" : mode === "sqlPolish" ? "检查 SQL 语义并给出可直接使用的版本" : "理解数据库对象并给出安全操作方案";
  const suggestions = mode === "serverControl"
    ? ["检查服务器的 CPU、内存和磁盘空间", "查看最近的系统错误日志", "分析当前目录下占用最大的文件"]
    : mode === "sqlPolish"
      ? ["检查查询性能并给出优化建议", "整理格式并解释每个查询步骤", "检查边界条件和潜在风险"]
      : ["解释当前对象结构和用途", "给出安全的备份与变更方案", "检查字段设计和索引建议"];

  useEffect(() => {
    let cancelled = false;
    void getAiProviders().then((items) => {
      if (cancelled) return;
      setProviders(items);
      const first = items.find((provider) => provider.enabled && provider.baseUrl.trim() && provider.apiKey.trim() && provider.model.trim());
      if (first) setProviderId(first.id);
    }).catch((reason) => {
      if (!cancelled) setError(String(reason));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: busy ? "auto" : "smooth", block: "end" });
  }, [messages, busy]);

  persistConversationRef.current = () => {
    if (!messages.length) return;
    const now = new Date().toISOString();
    const existing = readAiConversations();
    const previous = existing.find((conversation) => conversation.id === conversationId);
    const conversation: AiConversation = {
      id: conversationId,
      title: previous?.title || aiConversationTitle(messages, modeLabel),
      mode,
      context,
      connectionId: connection.id,
      sessionId: conversationSessionId,
      connectionName: connection.name,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      messages,
    };
    writeAiConversations([conversation, ...existing.filter((item) => item.id !== conversationId)]);
  };

  useEffect(() => {
    if (!messages.length) return;
    const timer = window.setTimeout(() => persistConversationRef.current(), 320);
    return () => window.clearTimeout(timer);
  }, [messages]);

  useEffect(() => () => persistConversationRef.current(), []);

  function selectConversationMessage(index: number) {
    document.querySelector<HTMLElement>(`[data-ai-message-index="${index}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function completeConversation(conversation: AiChatMessage[]) {
    if (!selectedProvider || busy) return;
    const visibleConversation = conversation.slice(-19);
    const assistantIndex = visibleConversation.length;
    const nextMessages = [...visibleConversation, { role: "assistant" as const, content: "", complete: false }];
    retryConversationRef.current = visibleConversation;
    setMessages(nextMessages);
    setBusy(true);
    setBusyMode("stream");
    setError("");
    setErrorCanRetry(false);
    let answer = "";
    const transcript = visibleConversation.map((message) => {
      const label = message.role === "user" ? "用户" : message.role === "execution" ? "命令执行结果" : "助手";
      return `【${label}】\n${message.content.slice(0, 8000)}`;
    }).join("\n\n");
    const userPrompt = `当前连接：${connection.name}（${connection.kind.toUpperCase()}）\n${context}\n\n对话记录：\n${transcript}\n\n请根据最新一条用户消息继续处理。`;
    try {
      await invokeAiStream(selectedProvider.id, selectedProvider.prompts[mode], userPrompt, (event) => {
        if (event.type === "chunk") {
          answer += event.text;
          setMessages((current) => current.map((message, index) => index === assistantIndex ? { ...message, content: answer } : message));
        }
      });
      if (!answer.trim()) throw new Error("AI 没有返回可显示的内容");
      setMessages((current) => current.map((message, index) => index === assistantIndex ? { ...message, content: answer, complete: true } : message));
    } catch (reason) {
      setMessages((current) => current.filter((message, index) => index !== assistantIndex || message.content.trim()));
      setError(reason instanceof Error ? reason.message : String(reason));
      setErrorCanRetry(true);
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || !selectedProvider || busy) return;
    const conversation = [...messages, { role: "user" as const, content }];
    setInput("");
    await completeConversation(conversation);
  }

  async function retryMessage(index?: number) {
    if (busy || !selectedProvider) return;
    const conversation = index === undefined
      ? retryConversationRef.current
      : messages[index]?.role === "user" ? messages.slice(0, index + 1)
        : messages[index]?.role === "assistant" ? messages.slice(0, index) : null;
    if (!conversation?.length || !conversation.some((message) => message.role === "user")) return;
    await completeConversation(conversation);
  }

  async function copyMessage(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex((current) => current === index ? null : current), 1400);
    } catch {
      setError("复制失败，请检查系统剪贴板权限");
      setErrorCanRetry(false);
    }
  }

  async function executeSuggestedCommand() {
    if (!codeResult || !onExecuteCommand || busy) return;
    setBusy(true);
    setBusyMode("confirm");
    setError("");
    setErrorCanRetry(false);
    let timeoutId: number | null = null;
    let rejectTimeout: ((reason: Error) => void) | null = null;
    let executionStarted = false;
    let queryResult: QueryResult | undefined;
    const timeoutResult = new Promise<never>((_, reject) => { rejectTimeout = reject; });
    try {
      // 从用户通过确认开始计时，避免把确认弹窗的等待时间算作命令执行时间。
      const operation = onExecuteCommand(codeResult, lastAssistant, () => {
        if (executionStarted) return;
        executionStarted = true;
        setBusyMode("execute");
        timeoutId = window.setTimeout(() => {
          rejectTimeout?.(new Error(mode === "serverControl"
            ? "SSH 命令执行超时（30 秒），请检查服务器连接或命令是否仍在运行"
            : "数据库操作执行超时（30 秒），请检查查询条件、参数或服务器状态"));
        }, 30_000);
      }, (result) => {
        queryResult = result;
      });
      const output = await Promise.race([operation, timeoutResult]);
      setMessages((current) => [...current, {
        role: "execution" as const,
        content: output || "执行成功，但没有返回内容。",
        executionStatus: "success" as const,
        queryResult,
      }].slice(-20));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      // 失败也写入对话记录，避免只在底部错误条显示后用户无法追溯结果。
      setMessages((current) => [...current, {
        role: "execution" as const,
        content: `执行失败\n${message}`,
        executionStatus: "failed" as const,
      }].slice(-20));
      setError(message);
      setErrorCanRetry(false);
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      setBusy(false);
      setBusyMode(null);
    }
  }

  return createPortal(
    <div className="ai-assistant-backdrop" role="presentation">
      <section className="ai-assistant-dialog" role="dialog" aria-modal="true" aria-label={modeLabel}>
        <header className="ai-assistant-header">
          <span className="ai-assistant-mark"><Sparkles size={17} /></span>
          <div><b>{modeLabel}</b><small>{modeHint} · {connection.name}</small></div>
          <button type="button" className="icon-button small" title="关闭" onClick={onClose}><X size={15} /></button>
        </header>
        <div className="ai-assistant-messages">
          {!messages.length && <div className="ai-assistant-empty"><span className="ai-assistant-empty-icon"><Sparkles size={22} /></span><b>{mode === "serverControl" ? "描述你要在服务器上完成的工作" : mode === "sqlPolish" ? "让 AI 检查并润色当前 SQL" : "描述你要检查或管理的数据库对象"}</b><span className="ai-assistant-empty-description">{mode === "serverControl" ? "助手会先给出建议命令；每条命令都需要你确认后才会执行。" : "AI 会使用当前数据库和对象结构作为上下文，生成内容供你检查。"}</span><div className="ai-assistant-suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => setInput(suggestion)}>{suggestion}</button>)}</div></div>}
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} data-ai-message-index={index} className={`ai-chat-message ${message.role} ${message.executionStatus || ""} ${message.queryResult ? "has-query-result" : ""}`}>
              <div className="ai-chat-message-head"><span className="ai-chat-avatar">{message.role === "user" ? "你" : message.role === "execution" ? (message.executionStatus === "failed" ? <AlertCircle size={13} /> : <Check size={13} />) : <Sparkles size={13} />}</span><b>{message.role === "user" ? "你" : message.role === "execution" ? (mode === "serverControl" ? "服务器命令结果" : "数据库执行结果") : selectedProvider?.name || "AI"}</b><span className="ai-chat-role">{message.role === "assistant" ? "助手" : message.role === "execution" ? (message.executionStatus === "failed" ? "执行失败" : "执行成功") : ""}</span></div>
              {!!message.content && <pre>{message.content}{busy && message.role === "assistant" && index === messages.length - 1 ? <span className="ai-typing-cursor" /> : null}</pre>}
              {message.queryResult && <AiQueryResultTable result={message.queryResult} />}
              {!!message.content && <div className="ai-chat-message-actions"><button type="button" onClick={() => void copyMessage(message.queryResult && !message.queryResult.is_exec ? formatAiQueryResultForCopy(message.queryResult) : message.content, index)} title={message.queryResult && !message.queryResult.is_exec ? "复制查询结果" : "复制内容"}><Copy size={12} />{copiedIndex === index ? "已复制" : "复制"}</button>{message.role === "user" && <button type="button" onClick={() => void retryMessage(index)} disabled={busy} title="重新发送并生成回复"><RotateCcw size={12} />重试</button>}</div>}
            </article>
          ))}
          {busyMode === "confirm" && <div className="ai-chat-thinking"><span className="mini-spinner" />等待确认执行建议操作…</div>}
          {busyMode === "execute" && <div className="ai-chat-thinking"><span className="mini-spinner" />{mode === "serverControl" ? "正在执行 SSH 命令…" : connection.kind === "sql" ? "正在执行 SQL…（最长 30 秒）" : connection.kind === "redis" ? "正在执行 Redis 命令…（最长 30 秒）" : "正在执行 MongoDB 命令…（最长 30 秒）"}</div>}
          <div ref={endRef} />
        </div>
        <AiConversationOutline messages={messages} onSelect={selectConversationMessage} />
        {error && <div className="ai-assistant-error"><AlertCircle size={13} /><span>{error}</span>{errorCanRetry && <button type="button" onClick={() => void retryMessage()} disabled={busy}><RotateCcw size={12} />重试</button>}</div>}
        <div className="ai-assistant-actions">
          {!busy && messages.at(-1)?.role === "assistant" && messages.at(-1)?.complete && mode !== "serverControl" && codeResult && onApply && <button type="button" className="secondary-button" onClick={() => { onApply(codeResult); onClose(); }}><Check size={13} />{mode === "sqlPolish" ? "采用润色 SQL" : connection.kind === "redis" ? "放入 Redis 命令行" : connection.kind === "mongo" ? "放入 MongoDB 命令" : "在 SQL 查询中打开"}</button>}
          {!busy && messages.at(-1)?.role === "assistant" && messages.at(-1)?.complete && (mode === "serverControl" || mode === "databaseControl") && codeResult && onExecuteCommand && <button type="button" className="primary-button ai-run-command" onClick={() => void executeSuggestedCommand()}><Play size={13} fill="currentColor" />确认后执行建议操作</button>}
        </div>
        <form className="ai-assistant-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
          <textarea maxLength={12000} autoFocus value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={mode === "serverControl" ? "例如：检查磁盘空间，并找出占用最大的目录…" : mode === "sqlPolish" ? "补充优化要求或说明 SQL 目标…" : "描述要检查、设计或修改的数据库内容…"} />
          <div className="ai-assistant-composer-toolbar">
            {configuredProviders.length ? <DropdownSelect
              className="ai-assistant-composer-provider"
              menuClassName="ai-assistant-provider-menu"
              value={selectedProvider?.id || ""}
              ariaLabel="AI 服务"
              options={configuredProviders.map((provider) => ({ value: provider.id, label: `${provider.name} · ${provider.model}` }))}
              onChange={setProviderId}
            /> : <small className="ai-assistant-composer-provider-hint">{loading ? "正在读取 AI 配置…" : "请先配置 AI 服务"}</small>}
            <button type="submit" className="primary-button" aria-label="发送" title="发送" disabled={!selectedProvider || !input.trim() || busy}>{busy ? <span className="mini-spinner" /> : <ArrowUp size={15} strokeWidth={2.2} />}</button>
          </div>
        </form>
        <footer className="ai-assistant-privacy"><ShieldCheck size={12} />请求内容会发送到当前选择的 AI 服务；命令和 SQL 都由你检查后再执行。</footer>
      </section>
    </div>,
    document.body,
  );
}

type ContextMenuItem = {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  onSelect: () => void;
  children?: ContextMenuItem[];
};
type RemoteTransfer = {
  direction: "upload" | "download";
  name: string;
  transferred: number;
  total: number | null;
  status: "running" | "done" | "failed";
  error?: string;
};
type SshMonitorRange = "30m" | "1h" | "3h" | "24h" | "7d" | "30d";
const sshMonitorRanges: { value: SshMonitorRange; label: string; durationMs: number }[] = [
  { value: "30m", label: "30 分钟", durationMs: 30 * 60 * 1000 },
  { value: "1h", label: "1 小时", durationMs: 60 * 60 * 1000 },
  { value: "3h", label: "3 小时", durationMs: 3 * 60 * 60 * 1000 },
  { value: "24h", label: "24 小时", durationMs: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "7 天", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "30 天", durationMs: 30 * 24 * 60 * 60 * 1000 },
];
type ActionDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
};

const protocolOptions: {
  kind: ConnectionKind;
  driver?: string;
  label: string;
  description: string;
}[] = [
  { kind: "ssh", label: "SSH", description: "终端会话" },
  { kind: "sftp", label: "SFTP", description: "安全文件传输" },
  { kind: "ftp", label: "FTP / FTPS", description: "文件传输" },
  { kind: "sql", driver: "mysql", label: "MySQL", description: "关系型数据库" },
  { kind: "sql", driver: "mariadb", label: "MariaDB", description: "MySQL 兼容数据库" },
  { kind: "sql", driver: "tidb", label: "TiDB", description: "分布式 SQL" },
  { kind: "sql", driver: "oceanbase", label: "OceanBase", description: "MySQL 模式" },
  { kind: "sql", driver: "doris", label: "Apache Doris", description: "MySQL 兼容协议" },
  { kind: "sql", driver: "starrocks", label: "StarRocks", description: "MySQL 兼容协议" },
  { kind: "sql", driver: "clickhouse", label: "ClickHouse", description: "MySQL 接口（需启用 9004）" },
  { kind: "sql", driver: "mssql", label: "Microsoft SQL Server", description: "企业级关系型数据库" },
  { kind: "sql", driver: "oracle", label: "Oracle Database", description: "企业级关系型数据库" },
  {
    kind: "sql",
    driver: "postgres",
    label: "PostgreSQL",
    description: "关系型数据库",
  },
  {
    kind: "sql",
    driver: "cockroachdb",
    label: "CockroachDB",
    description: "PostgreSQL 兼容协议",
  },
  {
    kind: "sql",
    driver: "neon",
    label: "Neon",
    description: "PostgreSQL 兼容协议",
  },
  {
    kind: "sql",
    driver: "sqlite",
    label: "SQLite",
    description: "本地数据库文件",
  },
  { kind: "redis", label: "Redis", description: "键值数据库" },
  { kind: "mongo", label: "MongoDB", description: "文档数据库" },
  { kind: "docker", label: "Docker", description: "容器、镜像、网络和卷管理" },
];

type ConnectionTypeFilter = "all" | ConnectionKind | `sql:${string}`;

const connectionTypeFilterOptions = [
  { value: "all", label: "全部类型" },
  { value: "ssh", label: "SSH" },
  { value: "sftp", label: "SFTP" },
  { value: "ftp", label: "FTP / FTPS" },
  { value: "sql", label: "SQL 数据库" },
  ...protocolOptions
    .filter((option) => option.kind === "sql" && option.driver)
    .map((option) => ({ value: `sql:${option.driver}`, label: option.label })),
  { value: "redis", label: "Redis" },
  { value: "mongo", label: "MongoDB" },
  { value: "docker", label: "Docker" },
];

const themeStorageKey = "orangehub-theme";
const onboardingStorageKey = "orangehub.onboarding.completed.v1";

const terminalExtendedAnsi = (() => {
  const levels = [0, 95, 135, 175, 215, 255];
  const colors: string[] = [];
  for (const red of levels) {
    for (const green of levels) {
      for (const blue of levels) {
        colors.push(`#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`);
      }
    }
  }
  for (let index = 0; index < 24; index += 1) {
    const value = 8 + index * 10;
    colors.push(`#${[value, value, value].map((item) => item.toString(16).padStart(2, "0")).join("")}`);
  }
  return colors;
})();

function getTerminalTheme(theme: Theme) {
  const darkTheme = {
    background: "#101614",
    foreground: "#dce6e2",
    cursor: "#f49a5b",
    selectionBackground: "#466451",
    black: "#18211e",
    red: "#ff6b68",
    green: "#6fdb9a",
    yellow: "#ffd166",
    blue: "#76a9ff",
    magenta: "#e08cff",
    cyan: "#54d9df",
    white: "#dce6e2",
    brightBlack: "#65736b",
    brightRed: "#ff8b85",
    brightGreen: "#8df0ac",
    brightYellow: "#ffe08a",
    brightBlue: "#93bdff",
    brightMagenta: "#f0a7ff",
    brightCyan: "#83edf0",
    brightWhite: "#ffffff",
    extendedAnsi: terminalExtendedAnsi,
  };
  if (theme === "dark") return darkTheme;
  return {
    ...darkTheme,
    background: "#ffffff",
    foreground: "#25282b",
    cursor: "#111111",
    selectionBackground: "#cbd0d5",
    white: "#4b5563",
    brightBlack: "#667085",
    brightWhite: "#202124",
  };
}

function protocolName(connection: Connection) {
  if (connection.kind === "sql")
    return (
      protocolOptions.find(
        (option) => option.driver === (connection.sqlDriver || "mysql"),
      )?.label || "SQL"
    );
  return (
    protocolOptions.find((option) => option.kind === connection.kind)?.label ||
    connection.kind.toUpperCase()
  );
}

function formatConnectionTime(value?: string) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const databaseIconSources: Record<string, string> = {
  mysql: mysqlIcon,
  mariadb: mariadbIcon,
  tidb: tidbIcon,
  oceanbase: oceanbaseIcon,
  doris: dorisIcon,
  starrocks: starrocksIcon,
  clickhouse: clickhouseIcon,
  mssql: sqlServerIcon,
  oracle: oracleIcon,
  postgres: postgresqlIcon,
  cockroachdb: cockroachIcon,
  neon: neonIcon,
  sqlite: sqliteIcon,
  redis: redisIcon,
  mongo: mongoIcon,
};

function DatabaseBrandIcon({ driver, size }: { driver: string; size: number }) {
  const source = databaseIconSources[driver] || databaseIconSources.mysql;
  return <img className="database-brand-icon" src={source} alt="" width={size} height={size} aria-hidden="true" />;
}

function sqlDriverFamily(driver: string) {
  if (["mariadb", "tidb", "oceanbase", "doris", "starrocks", "clickhouse"].includes(driver)) return "mysql";
  if (["cockroachdb", "neon"].includes(driver)) return "postgres";
  return driver;
}

function ProtocolIcon({
  connection,
  size = 16,
}: {
  connection: Connection;
  size?: number;
}) {
  if (connection.kind === "ssh") return <TerminalSquare size={size} />;
  if (connection.kind === "docker") return <Boxes size={size} />;
  if (connection.kind === "ftp" || connection.kind === "sftp")
    return <Folder size={size} />;
  if (connection.kind === "redis") return <DatabaseBrandIcon driver="redis" size={size} />;
  if (connection.kind === "mongo") return <DatabaseBrandIcon driver="mongo" size={size} />;
  return <DatabaseBrandIcon driver={connection.sqlDriver || "mysql"} size={size} />;
}

function RemoteEntryIcon({ entry, size = 14 }: { entry: FileEntry; size?: number }) {
  const iconProps = { size, "aria-hidden": true as const };
  if (entry.isSymlink) return <Link2 {...iconProps} className="remote-entry-icon remote-entry-icon--symlink" />;
  if (entry.isDir) return <Folder {...iconProps} className="remote-entry-icon remote-entry-icon--directory" />;

  const extension = entry.name.toLowerCase().split(".").pop() || "";
  if (["pem", "key", "pub", "crt", "cer", "p12", "pfx"].includes(extension))
    return <FileKey2 {...iconProps} className="remote-entry-icon remote-entry-icon--key" />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tif", "tiff"].includes(extension))
    return <FileImage {...iconProps} className="remote-entry-icon remote-entry-icon--image" />;
  if (["xls", "xlsx", "ods", "csv", "tsv"].includes(extension))
    return <FileSpreadsheet {...iconProps} className="remote-entry-icon remote-entry-icon--spreadsheet" />;
  if (["zip", "gz", "bz2", "xz", "tar", "tgz", "7z", "rar", "zst"].includes(extension))
    return <FileArchive {...iconProps} className="remote-entry-icon remote-entry-icon--archive" />;
  if (["mp4", "mkv", "mov", "avi", "webm", "mp3", "wav", "flac", "ogg", "m4a"].includes(extension))
    return extension === "mp3" || extension === "wav" || extension === "flac" || extension === "ogg" || extension === "m4a"
      ? <Music {...iconProps} className="remote-entry-icon remote-entry-icon--media" />
      : <FileVideoCamera {...iconProps} className="remote-entry-icon remote-entry-icon--media" />;
  if (["json", "jsonc", "yaml", "yml", "toml", "xml", "ini", "conf", "env"].includes(extension))
    return <Code2 {...iconProps} className="remote-entry-icon remote-entry-icon--config" />;
  if (["rs", "ts", "tsx", "js", "jsx", "mjs", "c", "h", "cpp", "hpp", "java", "py", "go", "php", "rb", "sh", "bash", "zsh", "css", "scss", "html", "vue", "sql"].includes(extension))
    return <FileCode2 {...iconProps} className="remote-entry-icon remote-entry-icon--code" />;
  if (["txt", "md", "log", "pdf", "doc", "docx", "rtf", "odt"].includes(extension))
    return <FileText {...iconProps} className="remote-entry-icon remote-entry-icon--document" />;
  return <File {...iconProps} className="remote-entry-icon remote-entry-icon--default" />;
}

function initialConnection(
  kind: ConnectionKind = "sql",
  driver = "mysql",
): Connection {
  const label =
    kind === "sql"
      ? protocolOptions.find((option) => option.driver === driver)?.label
      : protocolOptions.find((option) => option.kind === kind)?.label;
  const defaults: Record<string, number> = {
    ssh: 22,
    sftp: 22,
    ftp: 21,
    mysql: 3306,
    mariadb: 3306,
    tidb: 4000,
    oceanbase: 2881,
    doris: 9030,
    starrocks: 9030,
    clickhouse: 9004,
    mssql: 1433,
    oracle: 1521,
    postgres: 5432,
    cockroachdb: 26257,
    neon: 5432,
    sqlite: 0,
    redis: 6379,
    mongo: 27017,
    docker: 2375,
  };
  return {
    id: crypto.randomUUID(),
    name: `${label || "新建连接"}`,
    kind,
    sqlDriver: kind === "sql" ? driver : undefined,
    host: kind === "sql" && driver === "sqlite"
      ? ""
      : kind === "docker"
        ? navigator.userAgent.includes("Windows") ? "npipe:////./pipe/docker_engine" : "unix:///var/run/docker.sock"
        : "127.0.0.1",
    port: defaults[kind === "sql" ? driver : kind] ?? 3306,
    username: "",
    password: "",
    database: "",
    redisDb: kind === "redis" ? 0 : undefined,
    authMethod: "password",
    ftpSecure: false,
    ftpAnonymous: false,
    mongoAuthDb: "admin",
    useTls: false,
  };
}

function toCell(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const sqlTypeOptions: Record<string, string[]> = {
  mysql: [
    "TINYINT", "SMALLINT", "MEDIUMINT", "INT", "INTEGER", "BIGINT", "DECIMAL", "DEC", "NUMERIC", "FIXED",
    "FLOAT", "DOUBLE", "REAL", "BIT", "BOOLEAN", "BOOL", "DATE", "TIME", "DATETIME", "TIMESTAMP", "YEAR",
    "CHAR", "VARCHAR", "NCHAR", "NVARCHAR", "BINARY", "VARBINARY", "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB",
    "TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT", "ENUM", "SET", "SERIAL", "JSON", "GEOMETRY", "POINT", "LINESTRING",
    "POLYGON", "MULTIPOINT", "MULTILINESTRING", "MULTIPOLYGON", "GEOMETRYCOLLECTION", "VECTOR",
  ],
  tidb: [
    "TINYINT", "SMALLINT", "MEDIUMINT", "INT", "INTEGER", "BIGINT", "DECIMAL", "DEC", "NUMERIC", "FIXED",
    "FLOAT", "DOUBLE", "REAL", "BIT", "BOOLEAN", "BOOL", "DATE", "TIME", "DATETIME", "TIMESTAMP", "YEAR",
    "CHAR", "VARCHAR", "NCHAR", "NVARCHAR", "BINARY", "VARBINARY", "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB",
    "TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT", "ENUM", "SET", "JSON", "GEOMETRY", "POINT", "LINESTRING",
    "POLYGON", "MULTIPOINT", "MULTILINESTRING", "MULTIPOLYGON", "GEOMETRYCOLLECTION",
  ],
  postgres: [
    "SMALLINT", "INT2", "INTEGER", "INT", "INT4", "BIGINT", "INT8", "SMALLSERIAL", "SERIAL", "BIGSERIAL",
    "DECIMAL", "NUMERIC", "REAL", "FLOAT4", "DOUBLE PRECISION", "FLOAT8", "MONEY", "BIT", "BIT VARYING", "VARBIT",
    "BOOLEAN", "BOOL", "CHARACTER", "CHAR", "CHARACTER VARYING", "VARCHAR", "TEXT", "BYTEA", "DATE", "TIME",
    "TIME WITHOUT TIME ZONE", "TIME WITH TIME ZONE", "TIMETZ", "TIMESTAMP", "TIMESTAMP WITHOUT TIME ZONE",
    "TIMESTAMP WITH TIME ZONE", "TIMESTAMPTZ", "INTERVAL", "UUID", "JSON", "JSONB", "XML", "OID", "REGCLASS",
    "REGTYPE", "REGPROC", "REGPROCEDURE", "REGOPER", "REGOPERATOR", "REGCOLLATION", "REGROLE", "REGNAMESPACE", "TID",
    "BOX", "CIDR", "CIRCLE", "INET", "LINE", "LSEG", "MACADDR", "MACADDR8", "PATH", "PG_LSN", "POINT",
    "POLYGON", "TSQUERY", "TSVECTOR", "TXID_SNAPSHOT", "PG_SNAPSHOT", "INT4RANGE", "INT8RANGE", "NUMRANGE", "TSRANGE",
    "TSTZRANGE", "DATERANGE", "INT4MULTIRANGE", "INT8MULTIRANGE", "NUMMULTIRANGE", "TSMULTIRANGE", "TSTZMULTIRANGE",
    "DATEMULTIRANGE", "SMALLINT[]", "INTEGER[]", "BIGINT[]", "TEXT[]", "BOOLEAN[]", "UUID[]", "JSONB[]",
  ],
  sqlite: [
    "INTEGER", "INT", "TINYINT", "SMALLINT", "MEDIUMINT", "BIGINT", "UNSIGNED BIG INT", "INT2", "INT8",
    "CHARACTER", "CHAR", "NCHAR", "VARCHAR", "VARYING CHARACTER", "NATIVE CHARACTER", "NVARCHAR", "TEXT", "CLOB",
    "BLOB", "REAL", "DOUBLE", "DOUBLE PRECISION", "FLOAT", "NUMERIC", "DECIMAL", "BOOLEAN", "DATE", "DATETIME",
  ],
  mssql: [
    "BIT", "TINYINT", "SMALLINT", "INT", "BIGINT", "DECIMAL", "NUMERIC", "MONEY", "SMALLMONEY", "FLOAT", "REAL",
    "DATE", "TIME", "DATETIME", "DATETIME2", "SMALLDATETIME", "DATETIMEOFFSET", "CHAR", "VARCHAR", "NCHAR", "NVARCHAR",
    "TEXT", "NTEXT", "BINARY", "VARBINARY", "IMAGE", "UNIQUEIDENTIFIER", "XML", "SQL_VARIANT",
  ],
  oracle: [
    "NUMBER", "BINARY_FLOAT", "BINARY_DOUBLE", "CHAR", "NCHAR", "VARCHAR2", "NVARCHAR2", "CLOB", "NCLOB", "BLOB",
    "DATE", "TIMESTAMP", "TIMESTAMP WITH TIME ZONE", "INTERVAL YEAR TO MONTH", "INTERVAL DAY TO SECOND", "RAW", "LONG RAW",
    "XMLTYPE", "JSON", "BFILE", "ROWID", "UROWID",
  ],
};

type ParsedSqlType = { type: string; length: string; suffix: string };

function splitSqlType(dataType: string): ParsedSqlType {
  const opening = dataType.indexOf("(");
  if (opening < 0) return { type: dataType.trim().toUpperCase(), length: "", suffix: "" };

  let depth = 0;
  let quote = "";
  let closing = -1;
  for (let index = opening; index < dataType.length; index += 1) {
    const character = dataType[index];
    if (quote) {
      if (character === quote && dataType[index + 1] === quote) index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        closing = index;
        break;
      }
    }
  }
  if (closing < 0) return { type: dataType.trim().toUpperCase(), length: "", suffix: "" };

  const prefix = dataType.slice(0, opening).trim().toUpperCase();
  const length = dataType.slice(opening + 1, closing).trim();
  const suffix = dataType.slice(closing + 1).trim().toUpperCase();
  if (/^(TIME|TIMESTAMP)$/.test(prefix) && /^(WITH|WITHOUT) TIME ZONE$/.test(suffix)) {
    return { type: `${prefix} ${suffix}`, length, suffix: "" };
  }
  return { type: prefix, length, suffix };
}

function sqlTypeLengthKind(driver: string, type: string): string | null {
  driver = sqlDriverFamily(driver);
  const normalized = type.trim().toUpperCase();
  if (["CHAR", "CHARACTER", "VARCHAR", "VARCHAR2", "CHARACTER VARYING", "NCHAR", "NVARCHAR", "NVARCHAR2", "BINARY", "VARBINARY", "VARYING CHARACTER", "NATIVE CHARACTER"].includes(normalized)) return "character";
  if (driver === "postgres" && normalized === "FLOAT") return "float-precision";
  if (driver === "postgres" && ["DOUBLE PRECISION", "REAL", "FLOAT4", "FLOAT8"].includes(normalized)) return null;
  const numericTypes = ["DECIMAL", "DEC", "NUMERIC", "FIXED", "FLOAT", "DOUBLE", "DOUBLE PRECISION", "REAL", "FLOAT4", "FLOAT8"];
  if (["mysql", "tidb", "mssql"].includes(driver) && numericTypes.includes(normalized)) return "numeric";
  if (driver === "postgres" && ["DECIMAL", "NUMERIC"].includes(normalized)) return "numeric";
  if (driver === "sqlite" && ["DECIMAL", "NUMERIC"].includes(normalized)) return "numeric";
  if (driver !== "sqlite" && ["BIT", "BIT VARYING", "VARBIT"].includes(normalized)) return "bit";
  if (["ENUM", "SET"].includes(normalized) && ["mysql", "tidb"].includes(driver)) return "enum";
  if (normalized === "INTERVAL" && driver === "postgres") return "precision";
  if (["mysql", "tidb", "postgres"].includes(driver) && ["TIME", "TIME WITHOUT TIME ZONE", "TIME WITH TIME ZONE", "TIMETZ", "TIMESTAMP", "TIMESTAMP WITHOUT TIME ZONE", "TIMESTAMP WITH TIME ZONE", "TIMESTAMPTZ", "DATETIME"].includes(normalized)) return "precision";
  if (["mysql", "tidb", "mssql"].includes(driver) && ["TINYINT", "SMALLINT", "MEDIUMINT", "INT", "INTEGER", "BIGINT"].includes(normalized)) return "integer";
  if (driver === "mysql" && normalized === "VECTOR") return "vector";
  return null;
}

function formatSqlType(type: string, length: string, suffix = "") {
  const normalizedLength = length.trim();
  let formattedType = type.trim().toUpperCase();
  const zoneSuffix = formattedType.match(/^(TIME|TIMESTAMP) ((?:WITH|WITHOUT) TIME ZONE)$/);
  if (normalizedLength) {
    formattedType = zoneSuffix
      ? `${zoneSuffix[1]}(${normalizedLength}) ${zoneSuffix[2]}`
      : `${formattedType}(${normalizedLength})`;
  }
  return [formattedType, suffix.trim().toUpperCase()].filter(Boolean).join(" ");
}

function initialSqlTypeLength(driver: string, type: string) {
  switch (sqlTypeLengthKind(driver, type)) {
    case "character": return "255";
    case "numeric": return "10,2";
    case "bit": return "1";
    case "precision": return "6";
    case "integer": return "11";
    case "float-precision": return "24";
    default: return "";
  }
}

function sqlTypeChoices(driver: string, currentType: string) {
  const types = sqlTypeOptions[sqlDriverFamily(driver)] || sqlTypeOptions.mysql;
  const choices = types.map((type) => ({ value: type, label: type }));
  if (currentType && !types.some((type) => type.toUpperCase() === currentType.toUpperCase())) {
    choices.unshift({ value: currentType, label: `${currentType}（自定义）` });
  }
  return choices;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error: unknown) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function formatAiQueryResult(response: QueryResult): string {
  if (response.is_exec) {
    return `执行成功 · ${response.rows_affected} 行受影响 · ${response.elapsed_ms} ms`;
  }
  const summary = `查询成功 · 返回 ${response.rows.length} 行 · ${response.elapsed_ms} ms`;
  return response.message ? `${summary}\n${response.message}` : summary;
}

function countMysqlParameters(sql: string) {
  let count = 0;
  let index = 0;
  let quote = "";
  while (index < sql.length) {
    const char = sql[index];
    if (quote) {
      if (char === quote) {
        if (sql[index + 1] === quote) { index += 2; continue; }
        quote = "";
      } else if (char === "\\" && quote !== "`") index += 1;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") { quote = char; index += 1; continue; }
    if (char === "-" && sql[index + 1] === "-" && (sql.charCodeAt(index + 2) <= 32 || index + 2 >= sql.length)) {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }
    if (char === "#") {
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && sql[index + 1] === "*") {
      index += 2;
      while (index + 1 < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) index += 1;
      index = Math.min(sql.length, index + 2);
      continue;
    }
    if (char === "?") count += 1;
    index += 1;
  }
  return count;
}

function parentRemotePath(path: string) {
  const normalized = path.replace(/\/+$/, "");
  if (!normalized) return "/";
  if (normalized === ".") return "..";
  if (normalized === "..") return "../..";
  const separator = normalized.lastIndexOf("/");
  if (separator < 0) return ".";
  return separator === 0 ? "/" : normalized.slice(0, separator);
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return window.localStorage.getItem(themeStorageKey) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    const suppressNativeMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", suppressNativeMenu, true);
    return () => document.removeEventListener("contextmenu", suppressNativeMenu, true);
  }, []);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [page, setPage] = useState<Page>("overview");
  const [aiConversations, setAiConversations] = useState<AiConversation[]>(() => readAiConversations());
  const [pendingAiConversation, setPendingAiConversation] = useState<AiConversation | null>(null);
  const [connectionSessions, setConnectionSessions] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [redisCommand, setRedisCommand] = useState("PING");
  const [redisOutput, setRedisOutput] = useState<string | null>(null);
  const [vault, setVault] = useState<{ mode: string; locked: boolean } | null>(
    null,
  );
  const [lockingVault, setLockingVault] = useState(false);
  const lockInProgressRef = useRef(false);
  const [gatePassword, setGatePassword] = useState("");
  const [gateError, setGateError] = useState("");
  const [gateBusy, setGateBusy] = useState(false);
  const [dialog, setDialog] = useState<"new" | "edit" | null>(null);
  const [draft, setDraft] = useState<Connection>(initialConnection());
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchDialogInputRef = useRef<HTMLInputElement | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [reachable, setReachable] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const updateBusyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [bootAnimationDone, setBootAnimationDone] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 820);
  const [remoteGroupOpen, setRemoteGroupOpen] = useState(true);
  const [databaseGroupOpen, setDatabaseGroupOpen] = useState(true);
  const [dockerGroupOpen, setDockerGroupOpen] = useState(true);
  const [collapsedConnectionFlyout, setCollapsedConnectionFlyout] = useState<{
    kind: "remote" | "database" | "docker";
    top: number;
    left: number;
  } | null>(null);
  const collapsedConnectionCloseTimerRef = useRef<number | null>(null);
  const nativeWindow = useMemo(() => (isNative ? getCurrentWindow() : null), []);
  const [windowMaximized, setWindowMaximized] = useState(false);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const actionDialogResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "success" | "failed">("all");
  const [historyKind, setHistoryKind] = useState<ConnectionKind | "all">("all");
  const [historyConnectionId, setHistoryConnectionId] = useState<string | null>(null);
  const [sqlSnippets, setSqlSnippets] = useState<SqlSnippet[]>([]);
  const [snippetDialog, setSnippetDialog] = useState<{ name: string; sqlText: string } | null>(null);
  const [pendingSqlSnippet, setPendingSqlSnippet] = useState<SqlSnippet | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingDataDirectory, setOnboardingDataDirectory] = useState("");
  const [onboardingDataBusy, setOnboardingDataBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const searchAllowed = !loading && !onboardingOpen && (!isNative || Boolean(vault && vault.mode !== "unset" && !vault.locked));
  const searchAllowedRef = useRef(searchAllowed);
  searchAllowedRef.current = searchAllowed;

  useEffect(() => {
    const refreshAiConversations = () => setAiConversations(readAiConversations());
    window.addEventListener(aiConversationsChangedEvent, refreshAiConversations);
    window.addEventListener("storage", refreshAiConversations);
    return () => {
      window.removeEventListener(aiConversationsChangedEvent, refreshAiConversations);
      window.removeEventListener("storage", refreshAiConversations);
    };
  }, []);

  useEffect(() => {
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1450;
    const timer = window.setTimeout(() => setBootAnimationDone(true), duration);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch {
      // Theme still applies for this session when storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        if (searchAllowedRef.current) setSearchOpen(true);
        return;
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handleGlobalShortcut, true);
    return () => window.removeEventListener("keydown", handleGlobalShortcut, true);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const timer = window.setTimeout(() => searchDialogInputRef.current?.focus(), 0);
    void getHistory().then(setHistoryEntries).catch(() => undefined);
    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  useEffect(() => {
    if (!nativeWindow) return;
    let mounted = true;
    void nativeWindow.isMaximized().then((maximized) => {
      if (mounted) setWindowMaximized(maximized);
    }).catch(() => undefined);
    const unlisten = nativeWindow.onResized(() => {
      void nativeWindow.isMaximized().then((maximized) => {
        if (mounted) setWindowMaximized(maximized);
      }).catch(() => undefined);
    });
    return () => {
      mounted = false;
      void unlisten.then((dispose) => dispose());
    };
  }, [nativeWindow]);

  useEffect(() => {
    let mounted = true;
    Promise.all([getVaultStatus(), getConnections()])
      .then(([vaultState, items]) => {
        if (!mounted) return;
        setVault(vaultState);
        setConnections(items);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setLoading(false);
        notify("error", String(error));
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    let completed = false;
    try {
      completed = window.localStorage.getItem(onboardingStorageKey) === "1";
    } catch {
      completed = false;
    }
    if (completed) return;
    setOnboardingOpen(true);
    void getDataDirectory().then(setOnboardingDataDirectory).catch(() => undefined);
  }, [loading]);

  useEffect(() => {
    if (!isNative) return;
    let disposed = false;
    let unlisteners: (() => void)[] = [];
    void Promise.all([
      listen("tray-new-connection", () => {
        if (nativeLockedRef.current) return;
        setPage("connections");
        setActiveId(null);
        startNew();
      }),
      listen("tray-check-update", () => { void checkForUpdates(); }),
      listen("tray-lock-vault", () => {
        if (!nativeLockedRef.current) void handleLock();
      }),
    ]).then((cleanups) => {
      if (disposed) cleanups.forEach((cleanup) => cleanup());
      else unlisteners = cleanups;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlisteners.forEach((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeConnection =
    connections.find((connection) => connection.id === activeId) || null;
  const filteredConnections = useMemo(
    () =>
      connections.filter((connection) => {
        const haystack =
          `${connection.name} ${connection.host} ${connection.database || ""} ${protocolName(connection)}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      }),
    [connections, search],
  );
  const sqlCount = connections.filter(
    (connection) => connection.kind === "sql",
  ).length;
  const remoteCount = connections.filter((connection) =>
    ["ssh", "sftp", "ftp"].includes(connection.kind),
  ).length;
  const dockerCount = connections.filter((connection) => connection.kind === "docker").length;
  const databaseCount = connections.length - remoteCount - dockerCount;
  const collapsedFlyoutConnections = filteredConnections.filter((connection) =>
    collapsedConnectionFlyout?.kind === "remote"
      ? ["ssh", "sftp", "ftp"].includes(connection.kind)
      : collapsedConnectionFlyout?.kind === "docker"
        ? connection.kind === "docker"
        : !["ssh", "sftp", "ftp", "docker"].includes(connection.kind),
  );
  const nativeLocked =
    isNative && (!vault || vault.mode === "unset" || vault.locked);
  const nativeLockedRef = useRef(nativeLocked);
  nativeLockedRef.current = nativeLocked;

  useEffect(() => {
    if (!isNative) return;
    void setTrayVaultState(nativeLocked).catch(() => undefined);
  }, [nativeLocked]);

  function notify(kind: Toast["kind"], message: string) {
    setToast({ kind, message });
  }

  async function checkForUpdates() {
    if (!isNative) {
      notify("success", "浏览器预览不提供桌面端更新检查");
      return;
    }
    if (updateBusyRef.current) return;
    updateBusyRef.current = true;
    setUpdateBusy(true);
    notify("success", "正在检查更新…");
    let pendingUpdate: Awaited<ReturnType<typeof checkForNativeUpdate>> = null;
    try {
      pendingUpdate = await checkForNativeUpdate();
      if (!pendingUpdate) {
        notify("success", "当前版本已是最新");
        return;
      }
      const accepted = await confirmInApp(
        "发现新版本",
        `OrangeHub ${pendingUpdate.version} 已发布，是否现在下载并安装？${pendingUpdate.body ? `\n\n${pendingUpdate.body}` : ""}`,
        "立即更新",
      );
      if (!accepted) {
        await pendingUpdate.close();
        pendingUpdate = null;
        return;
      }
      notify("success", `正在下载 OrangeHub ${pendingUpdate.version}…`);
      let downloaded = 0;
      let contentLength: number | undefined;
      let lastProgress = 0;
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") contentLength = event.data.contentLength;
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (contentLength) {
            const progress = Math.floor((downloaded / contentLength) * 100);
            if (progress >= lastProgress + 20) {
              lastProgress = progress;
              notify("success", `正在下载更新… ${progress}%`);
            }
          }
        }
      });
      if (!/windows/i.test(navigator.userAgent)) {
        await pendingUpdate.close();
        pendingUpdate = null;
        await restartApplication();
      }
    } catch (error) {
      if (pendingUpdate) await pendingUpdate.close().catch(() => undefined);
      notify("error", `检查更新失败：${String(error)}`);
    } finally {
      updateBusyRef.current = false;
      setUpdateBusy(false);
    }
  }

  function showCollapsedConnections(kind: "remote" | "database" | "docker", anchor: HTMLButtonElement) {
    if (sidebarOpen) return;
    if (collapsedConnectionCloseTimerRef.current !== null) {
      window.clearTimeout(collapsedConnectionCloseTimerRef.current);
      collapsedConnectionCloseTimerRef.current = null;
    }
    const rect = anchor.getBoundingClientRect();
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 430));
    setCollapsedConnectionFlyout({ kind, top, left: rect.right });
  }

  function scheduleCloseCollapsedConnections() {
    if (collapsedConnectionCloseTimerRef.current !== null) {
      window.clearTimeout(collapsedConnectionCloseTimerRef.current);
    }
    collapsedConnectionCloseTimerRef.current = window.setTimeout(() => {
      setCollapsedConnectionFlyout(null);
      collapsedConnectionCloseTimerRef.current = null;
    }, 140);
  }

  function keepCollapsedConnectionsOpen() {
    if (collapsedConnectionCloseTimerRef.current !== null) {
      window.clearTimeout(collapsedConnectionCloseTimerRef.current);
      collapsedConnectionCloseTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (sidebarOpen) setCollapsedConnectionFlyout(null);
  }, [sidebarOpen]);

  useEffect(() => () => {
    if (collapsedConnectionCloseTimerRef.current !== null) {
      window.clearTimeout(collapsedConnectionCloseTimerRef.current);
    }
  }, []);

  function confirmInApp(
    title: string,
    message: string,
    confirmLabel = "确认",
    destructive = false,
  ) {
    return new Promise<boolean>((resolve) => {
      const previousResolver = actionDialogResolverRef.current;
      actionDialogResolverRef.current = resolve;
      setActionDialog({ title, message, confirmLabel, destructive });
      previousResolver?.(false);
    });
  }

  function resolveActionDialog(accepted: boolean) {
    const resolve = actionDialogResolverRef.current;
    if (!resolve) return;
    actionDialogResolverRef.current = null;
    setActionDialog(null);
    resolve(accepted);
  }

  async function refreshHistory() {
    setHistoryLoading(true);
    try {
      setHistoryEntries(await getHistory());
    } catch (error) {
      notify("error", String(error));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshSqlSnippets() {
    try {
      setSqlSnippets(await listSqlSnippets());
    } catch (error) {
      notify("error", `读取 SQL 收藏失败：${String(error)}`);
    }
  }

  function openSqlSnippetDialog(sqlText = query) {
    const firstLine = sqlText.trim().split("\n").find((line) => line.trim())?.trim() || "";
    setSnippetDialog({
      name: firstLine.replace(/\s+/g, " ").slice(0, 48) || "SQL 收藏",
      sqlText,
    });
  }

  async function handleSaveSqlSnippet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snippetDialog) return;
    const name = snippetDialog.name.trim();
    const sqlText = snippetDialog.sqlText.trim();
    if (!name || !sqlText) return notify("error", "请填写收藏名称和 SQL 内容");
    try {
      await saveSqlSnippet({
        id: crypto.randomUUID(),
        connectionId: activeConnection?.kind === "sql" ? activeConnection.id : null,
        name,
        sqlText,
        tags: null,
        createdAt: new Date().toISOString(),
      });
      await refreshSqlSnippets();
      setSnippetDialog(null);
      notify("success", "SQL 已保存到收藏");
    } catch (error) {
      notify("error", `保存 SQL 收藏失败：${String(error)}`);
    }
  }

  async function handleDeleteSqlSnippet(snippet: SqlSnippet) {
    const accepted = await confirmInApp("删除 SQL 收藏", `确定删除“${snippet.name}”吗？`, "删除收藏", true);
    if (!accepted) return;
    try {
      await deleteSqlSnippet(snippet.id);
      setSqlSnippets((items) => items.filter((item) => item.id !== snippet.id));
      notify("success", "SQL 收藏已删除");
    } catch (error) {
      notify("error", `删除 SQL 收藏失败：${String(error)}`);
    }
  }

  function openSavedSqlSnippet(snippet: SqlSnippet) {
    const target = (activeConnection?.kind === "sql" ? activeConnection : null)
      || connections.find((item) => item.id === snippet.connectionId && item.kind === "sql")
      || connections.find((item) => item.kind === "sql");
    if (!target) {
      notify("error", "请先创建或打开一个 SQL 连接，再从收藏中打开查询");
      return;
    }
    setPendingSqlSnippet({ ...snippet, connectionId: target.id });
    openConnection(target);
  }

  function openConnectionHistory(id: string) {
    const connection = connections.find((item) => item.id === id);
    setHistoryConnectionId(id);
    setHistoryKind(connection?.kind || "all");
    setHistoryFilter("all");
    setActiveId(null);
    if (page === "history") void refreshHistory();
    else setPage("history");
  }

  async function handleDeleteHistoryEntry(entry: HistoryEntry) {
    const accepted = await confirmInApp(
      "删除会话记录",
      "确定删除这条会话历史吗？",
      "删除记录",
      true,
    );
    if (!accepted) return;
    try {
      await deleteHistoryEntry(entry.id);
      setHistoryEntries((items) => items.filter((item) => item.id !== entry.id));
      notify("success", "会话记录已删除");
    } catch (error) {
      notify("error", String(error));
    }
  }

  useEffect(() => {
    if (page === "history") void refreshHistory();
  }, [page]);

  useEffect(() => {
    if (page === "snippets") void refreshSqlSnippets();
  }, [page]);

  function openConnection(connection: Connection) {
    setPage("connections");
    setActiveId(connection.id);
    setOpenTabs((tabs) =>
      tabs.includes(connection.id) ? tabs : [...tabs, connection.id],
    );
    setResult(null);
    setRedisOutput(null);
  }

  function closeTab(id: string) {
    const next = openTabs.filter((tab) => tab !== id);
    setOpenTabs(next);
    setReachable((current) => {
      const nextReachable = { ...current };
      delete nextReachable[id];
      return nextReachable;
    });
    setConnectionSessions((current) => {
      const nextSessions = { ...current };
      delete nextSessions[id];
      return nextSessions;
    });
    if (activeId === id) setActiveId(next.at(-1) || null);
  }

  function startNew(kind: ConnectionKind = "sql", driver = "mysql") {
    setDraft(initialConnection(kind, driver));
    setDialog("new");
  }

  function editConnection(connection: Connection) {
    setDraft({ ...connection, password: "" });
    setDialog("edit");
  }

  async function refreshConnections() {
    setConnections(await getConnections());
  }

  async function handleGate(event: FormEvent) {
    event.preventDefault();
    setGateError("");
    setGateBusy(true);
    try {
      if (vault?.mode === "unset") await initializeVault(gatePassword);
      else await unlockVault(gatePassword);
      setVault({ mode: "master", locked: false });
      setGatePassword("");
      await refreshConnections();
    } catch (error) {
      setGateError(String(error));
    } finally {
      setGateBusy(false);
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const connection = {
      ...draft,
      name: draft.name.trim(),
      host: draft.host.trim(),
      username: draft.username.trim(),
    };
    if (!connection.name) return notify("error", "请填写连接名称");
    if (
      !(connection.kind === "sql" && connection.sqlDriver === "sqlite") &&
      !connection.host
    )
      return notify("error", "请填写主机地址");
    if (isNative && !vault?.locked && !vault)
      return notify("error", "保险库尚未初始化");
    try {
      await saveConnection(connection);
      await refreshConnections();
      setDialog(null);
      notify("success", "连接配置已保存");
    } catch (error) {
      notify("error", String(error));
    }
  }

  async function handleDelete(connection: Connection) {
    const accepted = await confirmInApp(
      "删除连接",
      `确定删除“${connection.name}”吗？此操作不会删除服务器或数据库中的数据。`,
      "删除连接",
      true,
    );
    if (!accepted) return;
    try {
      await deleteConnection(connection.id);
      await refreshConnections();
      closeTab(connection.id);
      if (activeId === connection.id) setActiveId(null);
      notify("success", "连接已删除");
    } catch (error) {
      notify("error", String(error));
    }
  }

  async function handleConnect(connection: Connection) {
    const wasConnected = reachable[connection.id] !== undefined;
    setConnectingId(connection.id);
    try {
      let response = await testConnection(connection.id);
      if (response.needsTrust && response.keyType && response.fingerprint) {
        const accepted = await confirmInApp(
          "确认 SSH 主机指纹",
          `${connection.host}:${connection.port}\n${response.keyType}\n${response.fingerprint}\n\n首次连接此主机前，请核对服务器指纹。信任后将保存在本机。`,
          "信任并连接",
        );
        if (!accepted) throw new Error("已取消 SSH 主机信任");
        await trustSshHost(
          connection.id,
          response.keyType,
          response.fingerprint,
        );
        response = await testConnection(connection.id);
      }
      setReachable((current) => ({
        ...current,
        [connection.id]: response.latencyMs,
      }));
      setConnectionSessions((current) => wasConnected
        ? { ...current, [connection.id]: crypto.randomUUID() }
        : current[connection.id]
          ? current
          : { ...current, [connection.id]: crypto.randomUUID() });
      openConnection(connection);
      notify("success", `${response.detail} · ${response.latencyMs} ms`);
    } catch (error) {
      setReachable((current) => {
        const next = { ...current };
        delete next[connection.id];
        return next;
      });
      setConnectionSessions((current) => {
        const next = { ...current };
        delete next[connection.id];
        return next;
      });
      notify("error", String(error));
    } finally {
      setConnectingId(null);
    }
  }

  async function runQuery(database?: string, parameters: SqlParameter[] = []) {
    if (!activeConnection || !query.trim()) return;
    if (reachable[activeConnection.id] === undefined) {
      notify("error", "请先点击连接按钮连接数据库");
      return;
    }
    try {
      setResult(null);
      const response = await executeSql(activeConnection.id, query, database, parameters);
      setResult(response);
      notify(
        "success",
        response.is_exec
          ? "语句执行完成"
          : `查询完成 · ${response.rows.length} 行`,
      );
    } catch (error) {
      setResult({
        columns: [],
        rows: [],
        rows_affected: 0,
        elapsed_ms: 0,
        is_exec: false,
        message: String(error),
      });
      notify("error", String(error));
    }
  }

  async function runRedis(database?: number) {
    if (!activeConnection || !redisCommand.trim()) return;
    if (reachable[activeConnection.id] === undefined) {
      notify("error", "请先点击连接按钮连接数据库");
      return;
    }
    try {
      const output = await executeRedis(activeConnection.id, redisCommand, database);
      setRedisOutput(
        typeof output === "string" ? output : JSON.stringify(output, null, 2),
      );
    } catch (error) {
      setRedisOutput(String(error));
    }
  }

  async function handleLock() {
    if (lockInProgressRef.current) return;
    lockInProgressRef.current = true;
    setLockingVault(true);
    try {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        await new Promise((resolve) => window.setTimeout(resolve, 480));
      }
      await lockVault();
      setVault((current) => (current ? { ...current, locked: true } : current));
      setReachable({});
      setConnectionSessions({});
      setGatePassword("");
    } catch (error) {
      notify("error", String(error));
    } finally {
      lockInProgressRef.current = false;
      setLockingVault(false);
    }
  }

  async function chooseOnboardingDataDirectory() {
    try {
      const selected = await chooseDataDirectory(onboardingDataDirectory || undefined);
      if (selected) setOnboardingDataDirectory(selected);
    } catch (error) {
      setOnboardingError(String(error));
    }
  }

  async function completeOnboarding() {
    setOnboardingError("");
    setOnboardingDataBusy(true);
    try {
      if (onboardingDataDirectory && isNative && vault?.mode === "unset") {
        const changed = await configureDataDirectory(onboardingDataDirectory);
        try {
          window.localStorage.setItem(onboardingStorageKey, "1");
        } catch {
          // The onboarding can still finish when browser storage is unavailable.
        }
        setOnboardingOpen(false);
        if (changed) {
          await restartApplication();
          return;
        }
      } else {
        try {
          window.localStorage.setItem(onboardingStorageKey, "1");
        } catch {
          // The onboarding can still finish when browser storage is unavailable.
        }
        setOnboardingOpen(false);
      }
    } catch (error) {
      setOnboardingError(String(error));
    } finally {
      setOnboardingDataBusy(false);
    }
  }

  if (loading || !bootAnimationDone)
    return (
      <div className="window-shell">
        <WindowTitlebar theme={theme} search={search} onSearchChange={setSearch} onSearchOpen={() => { if (searchAllowed) setSearchOpen(true); }} onThemeToggle={() => setTheme((current) => current === "dark" ? "light" : "dark")} nativeWindow={nativeWindow} maximized={windowMaximized} onMaximizedChange={setWindowMaximized} />
        <div className="window-screen-content">
          <div className="boot-screen">
            <div className="boot-backdrop" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
            <div className="boot-scene" aria-label="正在启动 OrangeHub" role="status">
              <div className="boot-orbit boot-orbit-one" />
              <div className="boot-orbit boot-orbit-two" />
              <div className="boot-logo-wrap"><img src={orangeHubIcon} alt="" /><span /></div>
              <div className="boot-scanline" />
            </div>
            <div className="boot-wordmark"><strong>ORANGE<span>HUB</span></strong><small>SECURE WORKSPACE</small></div>
            <div className="boot-progress"><span /><i /></div>
            <span className="boot-label">正在准备工作区<span className="boot-dots"><i>.</i><i>.</i><i>.</i></span></span>
          </div>
        </div>
      </div>
    );

  if (onboardingOpen)
    return (
      <div className="window-shell">
        <WindowTitlebar theme={theme} search={search} onSearchChange={setSearch} onSearchOpen={() => { if (searchAllowed) setSearchOpen(true); }} onThemeToggle={() => setTheme((current) => current === "dark" ? "light" : "dark")} nativeWindow={nativeWindow} maximized={windowMaximized} onMaximizedChange={setWindowMaximized} />
        <div className="window-screen-content">
          <OnboardingDialog
            step={onboardingStep}
            dataDirectory={onboardingDataDirectory}
            dataDirectoryBusy={onboardingDataBusy}
            dataDirectoryEditable={isNative && vault?.mode === "unset"}
            error={onboardingError}
            onBack={() => { setOnboardingError(""); setOnboardingStep((current) => Math.max(0, current - 1)); }}
            onNext={() => { setOnboardingError(""); setOnboardingStep((current) => Math.min(3, current + 1)); }}
            onChooseDataDirectory={() => void chooseOnboardingDataDirectory()}
            onFinish={() => void completeOnboarding()}
          />
        </div>
      </div>
    );

  if (nativeLocked) {
    const isSetup = vault?.mode === "unset";
    return (
      <div className="window-shell">
        <WindowTitlebar theme={theme} search={search} onSearchChange={setSearch} onSearchOpen={() => { if (searchAllowed) setSearchOpen(true); }} onThemeToggle={() => setTheme((current) => current === "dark" ? "light" : "dark")} nativeWindow={nativeWindow} maximized={windowMaximized} onMaximizedChange={setWindowMaximized} />
        <div className="window-screen-content">
          <div className="gate-screen">
            <div className="gate-panel">
              <div className="gate-icon"><LockKeyhole size={19} /></div>
              <h1>{isSetup ? "创建主密码" : "解锁保险库"}</h1>
              <p>{isSetup ? "主密码用于加密本机保存的连接凭据，OrangeHub 不会上传你的密码。" : "输入主密码以解密连接凭据。"}</p>
              <form onSubmit={handleGate}>
                <label className="field-label">主密码</label>
                <input autoFocus type="password" autoComplete={isSetup ? "new-password" : "current-password"} minLength={8} value={gatePassword} onChange={(event) => setGatePassword(event.target.value)} placeholder="至少 8 个字符" />
                {gateError && <div className="form-error"><AlertCircle size={14} />{gateError}</div>}
                <button className="primary-button gate-submit" disabled={gateBusy || gatePassword.length < 8} type="submit">{gateBusy ? "请稍候…" : isSetup ? "创建并进入" : "解锁工作区"}</button>
              </form>
              <div className="gate-foot"><ShieldCheck size={14} />本地 AES-256-GCM 加密</div>
            </div>
            <div className="gate-version">ORANGEHUB DESKTOP · {appVersion}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="window-shell">
      {lockingVault && <div className="vault-lock-transition" role="status" aria-live="polite"><span className="vault-lock-transition-mark"><LockKeyhole size={24} /></span><b>正在锁定保险库</b><small>正在安全关闭工作区</small></div>}
      <WindowTitlebar theme={theme} search={search} onSearchChange={setSearch} onSearchOpen={() => { if (activeConnection?.kind === "docker") return; if (searchAllowed) setSearchOpen(true); }} onThemeToggle={() => setTheme((current) => current === "dark" ? "light" : "dark")} nativeWindow={nativeWindow} maximized={windowMaximized} onMaximizedChange={setWindowMaximized} />
      <div className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className="sidebar">
        <ScrollArea className="side-scroll">
          <div className="nav-label">工作台</div>
          <button
            title="概览"
            className={`nav-item ${page === "overview" ? "active" : ""}`}
            onClick={() => {
              setPage("overview");
              setActiveId(null);
            }}
          >
            <LayoutGrid size={16} />
            <span>概览</span>
          </button>
          <button
            title="连接"
            className={`nav-item ${page === "connections" && !activeId ? "active" : ""}`}
            onClick={() => {
              setPage("connections");
              setActiveId(null);
            }}
          >
            <Server size={16} />
            <span>连接</span>
            <span className="nav-count">{connections.length}</span>
          </button>
          <button
            title="SQL 收藏"
            className={`nav-item ${page === "snippets" ? "active" : ""}`}
            onClick={() => {
              setPage("snippets");
              setActiveId(null);
            }}
          >
            <FileCode2 size={16} />
            <span>SQL 收藏</span>
          </button>
          <button
            title="最近活动"
            className={`nav-item ${page === "history" ? "active" : ""}`}
            onClick={() => {
              setHistoryConnectionId(null);
              setHistoryKind("all");
              setHistoryFilter("all");
              setPage("history");
              setActiveId(null);
            }}
          >
            <History size={16} />
            <span>最近活动</span>
          </button>
          <button
            title="AI 对话"
            className={`nav-item ${page === "aiHistory" ? "active" : ""}`}
            onClick={() => {
              setPage("aiHistory");
              setActiveId(null);
            }}
          >
            <MessageSquareText size={16} />
            <span>AI 对话</span>
            <span className="nav-count">{aiConversations.length}</span>
          </button>

          <div className="connection-section-head">
            <span className="nav-label">连接列表</span>
          </div>
          <div className="sidebar-collapsed-connections" aria-label="连接列表">
            <div
              className="collapsed-group-flyout-anchor"
              onMouseEnter={(event) => showCollapsedConnections("remote", event.currentTarget.querySelector<HTMLButtonElement>("button")!)}
              onMouseLeave={scheduleCloseCollapsedConnections}
            >
              <button
                type="button"
                className={`nav-item collapsed-group-button ${remoteGroupOpen ? "active" : ""}`}
                aria-label={`服务器连接（${remoteCount}）`}
                onClick={() => {
                  setSidebarOpen(true);
                  setRemoteGroupOpen(true);
                }}
              >
                <Server size={16} />
                <span>服务器</span>
                <span className="nav-count">{remoteCount}</span>
              </button>
            </div>
            <div
              className="collapsed-group-flyout-anchor"
              onMouseEnter={(event) => showCollapsedConnections("database", event.currentTarget.querySelector<HTMLButtonElement>("button")!)}
              onMouseLeave={scheduleCloseCollapsedConnections}
            >
              <button
                type="button"
                className={`nav-item collapsed-group-button ${databaseGroupOpen ? "active" : ""}`}
                aria-label={`数据库连接（${databaseCount}）`}
                onClick={() => {
                  setSidebarOpen(true);
                  setDatabaseGroupOpen(true);
                }}
              >
                <Database size={16} />
                <span>数据库</span>
                <span className="nav-count">{databaseCount}</span>
              </button>
            </div>
            <div
              className="collapsed-group-flyout-anchor"
              onMouseEnter={(event) => showCollapsedConnections("docker", event.currentTarget.querySelector<HTMLButtonElement>("button")!)}
              onMouseLeave={scheduleCloseCollapsedConnections}
            >
              <button
                type="button"
                className={`nav-item collapsed-group-button ${dockerGroupOpen ? "active" : ""}`}
                aria-label={`Docker 连接（${dockerCount}）`}
                onClick={() => {
                  setSidebarOpen(true);
                  setDockerGroupOpen(true);
                }}
              >
                <Boxes size={16} />
                <span>Docker</span>
                <span className="nav-count">{dockerCount}</span>
              </button>
            </div>
          </div>
          {!sidebarOpen && collapsedConnectionFlyout && <div
            className="collapsed-connection-flyout"
            style={{ top: collapsedConnectionFlyout.top, left: collapsedConnectionFlyout.left + 8 }}
            onMouseEnter={keepCollapsedConnectionsOpen}
            onMouseLeave={scheduleCloseCollapsedConnections}
            role="menu"
            aria-label={collapsedConnectionFlyout.kind === "remote" ? "服务器连接" : collapsedConnectionFlyout.kind === "docker" ? "Docker 连接" : "数据库连接"}
          >
            <div className="collapsed-connection-flyout-heading">
              {collapsedConnectionFlyout.kind === "remote" ? <Server size={14} /> : collapsedConnectionFlyout.kind === "docker" ? <Boxes size={14} /> : <Database size={14} />}
              <b>{collapsedConnectionFlyout.kind === "remote" ? "服务器" : collapsedConnectionFlyout.kind === "docker" ? "Docker" : "数据库"}</b>
              <span>{collapsedFlyoutConnections.length}</span>
            </div>
            <ScrollArea className="collapsed-connection-flyout-list">
              {collapsedFlyoutConnections.map((connection) => <ConnectionListItem
                key={connection.id}
                connection={connection}
                active={activeId === connection.id}
                reachable={reachable[connection.id] !== undefined}
                onClick={() => { openConnection(connection); setCollapsedConnectionFlyout(null); }}
              />)}
              {!collapsedFlyoutConnections.length && <div className="collapsed-connection-flyout-empty">暂无连接</div>}
            </ScrollArea>
          </div>}
          <button
            type="button"
            className={`connection-group-label ${remoteGroupOpen ? "expanded" : "collapsed"}`}
            aria-expanded={remoteGroupOpen}
            onClick={() => setRemoteGroupOpen((open) => !open)}
          >
            {remoteGroupOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span>服务器</span>
            <span className="group-count">{remoteCount}</span>
          </button>
          {remoteGroupOpen && filteredConnections
            .filter((item) => ["ssh", "sftp", "ftp"].includes(item.kind))
            .map((connection) => (
              <ConnectionListItem
                key={connection.id}
                connection={connection}
                active={activeId === connection.id}
                reachable={reachable[connection.id] !== undefined}
                onClick={() => openConnection(connection)}
              />
            ))}
          <button
            type="button"
            className={`connection-group-label database-group ${databaseGroupOpen ? "expanded" : "collapsed"}`}
            aria-expanded={databaseGroupOpen}
            onClick={() => setDatabaseGroupOpen((open) => !open)}
          >
            {databaseGroupOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span>数据库</span>
            <span className="group-count">
              {databaseCount}
            </span>
          </button>
          {databaseGroupOpen && filteredConnections
            .filter((item) => !["ssh", "sftp", "ftp", "docker"].includes(item.kind))
            .map((connection) => (
              <ConnectionListItem
                key={connection.id}
                connection={connection}
                active={activeId === connection.id}
                reachable={reachable[connection.id] !== undefined}
                onClick={() => openConnection(connection)}
              />
            ))}
          <button
            type="button"
            className={`connection-group-label docker-group ${dockerGroupOpen ? "expanded" : "collapsed"}`}
            aria-expanded={dockerGroupOpen}
            onClick={() => setDockerGroupOpen((open) => !open)}
          >
            {dockerGroupOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span>Docker</span>
            <span className="group-count">{dockerCount}</span>
          </button>
          {dockerGroupOpen && filteredConnections
            .filter((item) => item.kind === "docker")
            .map((connection) => (
              <ConnectionListItem
                key={connection.id}
                connection={connection}
                active={activeId === connection.id}
                reachable={reachable[connection.id] !== undefined}
                onClick={() => openConnection(connection)}
              />
            ))}
          {filteredConnections.length === 0 && (
            <div className="empty-filter">没有匹配的连接</div>
          )}
        </ScrollArea>
        <div className="sidebar-bottom">
          <button
            title="设置"
            className={`nav-item sidebar-bottom-control ${page === "settings" ? "active" : ""}`}
            onClick={() => {
              setPage("settings");
              setActiveId(null);
            }}
          >
            <Settings2 size={16} />
            <span>设置</span>
          </button>
          <button
            className="nav-item sidebar-bottom-control"
            title="检查更新"
            onClick={() => { void checkForUpdates(); }}
          >
            <RefreshCw size={16} className={updateBusy ? "spin" : ""} />
            <span>{updateBusy ? "检查中…" : "检查更新"}</span>
          </button>
          <button
            className="nav-item sidebar-bottom-control"
            title={isNative ? "锁定" : "浏览器预览无需锁定"}
            aria-label={isNative ? "锁定" : "浏览器预览无需锁定"}
            onClick={
              isNative ? handleLock : () => notify("success", "浏览器预览无需锁定")
            }
            disabled={lockingVault}
          >
            <LockKeyhole size={16} />
            <span>锁定</span>
          </button>
          <button
            className="nav-item sidebar-bottom-control sidebar-collapse-control"
            type="button"
            title={sidebarOpen ? "收起侧栏" : "展开侧栏"}
            aria-label={sidebarOpen ? "收起侧栏" : "展开侧栏"}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            <span>{sidebarOpen ? "收起侧栏" : "展开侧栏"}</span>
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>个人工作区</span>
            <ChevronRight size={14} />
            <b>{activeConnection?.name || pageTitle(page)}</b>
          </div>
          <div className="topbar-actions">
            <button className="new-button" onClick={() => startNew()}>
              <Plus size={15} />
              <span>新建连接</span>
            </button>
          </div>
        </header>

        {openTabs.length > 0 && (
          <div className="session-tabs">
            <button
              className={`home-tab ${!activeId ? "selected" : ""}`}
              title="工作台"
              onClick={() => {
                setActiveId(null);
                setPage("overview");
              }}
            >
              <LayoutGrid size={14} />
            </button>
            {openTabs.map((id) => {
              const connection = connections.find((item) => item.id === id);
              if (!connection) return null;
              return (
                <button
                  key={id}
                  className={`session-tab ${activeId === id ? "selected" : ""}`}
                  onClick={() => {
                    setActiveId(id);
                    setPage("connections");
                  }}
                >
                  <span className={`tab-protocol ${connection.kind}`}>
                    <ProtocolIcon connection={connection} size={13} />
                  </span>
                  <span>{connection.name}</span>
                  <span
                    className="tab-close"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(id);
                    }}
                  >
                    <X size={12} />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <ScrollArea className={`page-scroll ${page === "settings" ? "settings-page-scroll" : ""} ${activeConnection?.kind === "ssh" ? "terminal-page-scroll" : ""} ${activeConnection?.kind === "sql" ? "sql-page-scroll" : ""} ${activeConnection?.kind === "redis" ? "redis-page-scroll" : ""}`}>
          {activeConnection ? (
            <ConnectionWorkspace
              connection={activeConnection}
              theme={theme}
              search={search}
              reachable={reachable[activeConnection.id]}
              connecting={connectingId === activeConnection.id}
              query={query}
              setQuery={setQuery}
              result={result}
              setResult={setResult}
              runQuery={runQuery}
              redisCommand={redisCommand}
              setRedisCommand={setRedisCommand}
              redisOutput={redisOutput}
              setRedisOutput={setRedisOutput}
              runRedis={runRedis}
              onConnect={() => handleConnect(activeConnection)}
              onEdit={() => editConnection(activeConnection)}
              onDelete={() => handleDelete(activeConnection)}
              notify={notify}
              confirmInApp={confirmInApp}
              onAiAssistantClose={() => resolveActionDialog(false)}
              aiSessionId={connectionSessions[activeConnection.id]}
              onAiSessionReset={() => setConnectionSessions((current) => ({ ...current, [activeConnection.id]: crypto.randomUUID() }))}
              aiConversationToOpen={pendingAiConversation?.connectionId === activeConnection.id ? pendingAiConversation : null}
              onAiConversationOpened={() => setPendingAiConversation(null)}
              pendingSqlSnippet={pendingSqlSnippet}
              onSqlSnippetOpened={() => setPendingSqlSnippet(null)}
              onSaveSqlSnippet={openSqlSnippetDialog}
            />
          ) : page === "overview" ? (
            <Overview
              connections={connections}
              reachable={reachable}
              onOpen={openConnection}
              onViewAll={() => {
                setPage("connections");
                setActiveId(null);
              }}
              onConnect={handleConnect}
              connectingId={connectingId}
            />
          ) : page === "connections" ? (
            <ConnectionsPage
              connections={filteredConnections}
              reachable={reachable}
              onOpen={openConnection}
              onCreate={startNew}
              onEdit={editConnection}
              onDelete={handleDelete}
              onConnect={handleConnect}
              connectingId={connectingId}
            />
          ) : page === "snippets" ? (
            <SqlSnippetsPage
              snippets={sqlSnippets}
              connections={connections}
              search={search}
              onCreate={() => openSqlSnippetDialog("")}
              onOpen={openSavedSqlSnippet}
              onDelete={(snippet) => void handleDeleteSqlSnippet(snippet)}
            />
          ) : page === "settings" ? (
            <SettingsPage notify={notify} />
          ) : page === "aiHistory" ? (
            <AiConversationHistoryPage
              search={search}
              conversations={aiConversations}
              onOpen={(conversation) => {
                const target = connections.find((item) => item.id === conversation.connectionId);
                if (!target) {
                  notify("error", "该对话关联的连接已不存在");
                  return;
                }
                setPendingAiConversation(conversation);
                openConnection(target);
              }}
              onDelete={(conversation) => {
                writeAiConversations(readAiConversations().filter((item) => item.id !== conversation.id));
                setAiConversations((items) => items.filter((item) => item.id !== conversation.id));
                notify("success", "AI 对话已删除");
              }}
              onRename={(conversation, title) => {
                const nextTitle = title.trim();
                if (!nextTitle) return;
                const next = readAiConversations().map((item) => item.id === conversation.id ? { ...item, title: nextTitle, updatedAt: new Date().toISOString() } : item);
                writeAiConversations(next);
                setAiConversations(next);
              }}
            />
          ) : (
            <HistoryPage
              entries={historyEntries}
              connections={connections}
              loading={historyLoading}
              search={search}
              filter={historyFilter}
              setFilter={setHistoryFilter}
              kind={historyKind}
              setKind={setHistoryKind}
              connectionId={historyConnectionId}
              onClearConnectionFilter={() => {
                setHistoryConnectionId(null);
                setHistoryKind("all");
              }}
              onRefresh={refreshHistory}
              onOpenConnection={(id) => {
                const connection = connections.find((item) => item.id === id);
                if (connection) openConnection(connection);
              }}
              onDelete={handleDeleteHistoryEntry}
              onClear={async () => {
                if (historyEntries.length === 0) return;
                const accepted = await confirmInApp(
                  "清空会话历史",
                  "将删除本机保存的连接测试、SQL、数据库命令、文件操作和远程终端记录。此操作无法撤销。",
                  "清空历史",
                  true,
                );
                if (!accepted) return;
                try {
                  await clearHistory();
                  setHistoryEntries([]);
                  notify("success", "会话历史已清空");
                } catch (error) {
                  notify("error", String(error));
                }
              }}
            />
          )}
        </ScrollArea>
      </main>

      {dialog && (
        <ConnectionDialog
          draft={draft}
          setDraft={setDraft}
          mode={dialog}
          onClose={() => setDialog(null)}
          onSubmit={handleSave}
          notify={notify}
          confirmInApp={confirmInApp}
        />
      )}
      {snippetDialog && (
        <SqlSnippetDialog
          value={snippetDialog}
          onChange={setSnippetDialog}
          onClose={() => setSnippetDialog(null)}
          onSubmit={handleSaveSqlSnippet}
        />
      )}
      {actionDialog && (
        <ActionDialog
          title={actionDialog.title}
          message={actionDialog.message}
          confirmLabel={actionDialog.confirmLabel}
          destructive={actionDialog.destructive}
          onCancel={() => resolveActionDialog(false)}
          onConfirm={() => resolveActionDialog(true)}
        />
      )}
      {toast && (
        <div className={`toast ${toast.kind}`}>
          <span className="toast-icon">
            {toast.kind === "success" ? (
              <Check size={15} />
            ) : (
              <AlertCircle size={15} />
            )}
          </span>
          {toast.message}
          <button onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      {searchOpen && (
        <SearchPalette
          inputRef={searchDialogInputRef}
          query={search}
          connections={connections}
          conversations={aiConversations}
          historyEntries={historyEntries}
          onQueryChange={setSearch}
          onClose={() => setSearchOpen(false)}
          onNavigate={(targetPage) => {
            setSearchOpen(false);
            if (targetPage === "history") {
              setHistoryConnectionId(null);
              setHistoryKind("all");
              setHistoryFilter("all");
            }
            setPage(targetPage);
            setActiveId(null);
          }}
          onOpenConnection={(connection) => {
            setSearchOpen(false);
            openConnection(connection);
          }}
          onOpenConversation={(conversation) => {
            setSearch("");
            setSearchOpen(false);
            const target = connections.find((item) => item.id === conversation.connectionId);
            if (!target) {
              notify("error", "该对话关联的连接已不存在");
              return;
            }
            setPendingAiConversation(conversation);
            openConnection(target);
          }}
          onOpenHistory={() => {
            setSearchOpen(false);
            setHistoryConnectionId(null);
            setHistoryKind("all");
            setHistoryFilter("all");
            setPage("history");
            setActiveId(null);
          }}
          onNewConnection={() => {
            setSearchOpen(false);
            startNew();
          }}
        />
      )}
      </div>
    </div>
  );
}

function pageTitle(page: Page) {
  return {
    overview: "概览",
    connections: "连接",
    snippets: "SQL 收藏",
    history: "最近活动",
    aiHistory: "AI 对话",
    settings: "设置",
  }[page];
}

function SearchPalette({
  inputRef,
  query,
  connections,
  conversations,
  historyEntries,
  onQueryChange,
  onClose,
  onNavigate,
  onOpenConnection,
  onOpenConversation,
  onOpenHistory,
  onNewConnection,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  connections: Connection[];
  conversations: AiConversation[];
  historyEntries: HistoryEntry[];
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onNavigate: (page: Page) => void;
  onOpenConnection: (connection: Connection) => void;
  onOpenConversation: (conversation: AiConversation) => void;
  onOpenHistory: () => void;
  onNewConnection: () => void;
}) {
  const lowerQuery = query.trim().toLowerCase();
  const pages: { title: string; page: Page; icon: ReactNode }[] = [
    { title: "概览", page: "overview", icon: <LayoutGrid size={15} /> },
    { title: "连接", page: "connections", icon: <Server size={15} /> },
    { title: "SQL 收藏", page: "snippets", icon: <FileCode2 size={15} /> },
    { title: "最近活动", page: "history", icon: <History size={15} /> },
    { title: "AI 对话", page: "aiHistory", icon: <MessageSquareText size={15} /> },
    { title: "设置", page: "settings", icon: <Settings2 size={15} /> },
  ];
  const matchingPages = pages.filter((item) => !lowerQuery || item.title.toLowerCase().includes(lowerQuery));
  const matchingConnections = connections.filter((connection) =>
    `${connection.name} ${connection.host} ${connection.database || ""} ${protocolName(connection)}`.toLowerCase().includes(lowerQuery),
  );
  const matchingConversations = conversations
    .filter((conversation) => lowerQuery && `${conversation.title} ${conversation.connectionName} ${conversation.messages.map((message) => message.content).join(" ")}`.toLowerCase().includes(lowerQuery))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const matchingHistoryEntries = lowerQuery ? historyEntries.filter((entry) => {
    const connection = connections.find((item) => item.id === entry.connectionId);
    return `${historyLabel(entry.sqlText)} ${connection?.name || ""} ${connection?.host || ""} ${entry.error || ""}`.toLowerCase().includes(lowerQuery);
  }) : [];
  const hasResults = matchingPages.length > 0 || matchingConnections.length > 0 || matchingConversations.length > 0 || matchingHistoryEntries.length > 0 || !lowerQuery;

  return createPortal(
    <div className="search-palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="search-palette" role="dialog" aria-modal="true" aria-label="搜索 OrangeHub">
        <label className="search-palette-input">
          <Search size={18} />
          <input ref={inputRef} value={query} onChange={(event) => onQueryChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onClose(); if (event.key === "Enter") { if (matchingConversations[0]) onOpenConversation(matchingConversations[0]); else if (matchingHistoryEntries.length) onOpenHistory(); else if (matchingConnections[0]) onOpenConnection(matchingConnections[0]); else if (matchingPages[0]) onNavigate(matchingPages[0].page); else if (!lowerQuery) onNewConnection(); } }} placeholder="搜索连接、页面、AI 对话和历史记录…" />
          <kbd>Esc</kbd>
        </label>
        <div className="search-palette-results">
          {matchingPages.length > 0 && <div className="search-palette-section"><span>工作区</span>{matchingPages.map((item) => <button key={item.page} type="button" onClick={() => onNavigate(item.page)}><i>{item.icon}</i><span>{item.title}</span><small>打开页面</small></button>)}</div>}
          {matchingConnections.length > 0 && <div className="search-palette-section"><span>连接</span>{matchingConnections.slice(0, 8).map((connection) => <button key={connection.id} type="button" onClick={() => onOpenConnection(connection)}><i className={`connection-icon ${connection.kind}`}><ProtocolIcon connection={connection} size={14} /></i><span>{connection.name}<small>{connection.host || connection.sqlitePath || protocolName(connection)}</small></span><small>{protocolName(connection)}</small></button>)}</div>}
          {matchingConversations.length > 0 && <div className="search-palette-section"><span>AI 对话</span>{matchingConversations.slice(0, 8).map((conversation) => <button key={conversation.id} type="button" onClick={() => onOpenConversation(conversation)}><i><MessageSquareText size={15} /></i><span>{conversation.title}<small>{conversation.connectionName} · {new Date(conversation.updatedAt).toLocaleString()}</small></span><small>打开对话</small></button>)}</div>}
          {matchingHistoryEntries.length > 0 && <div className="search-palette-section"><span>会话历史</span>{matchingHistoryEntries.slice(0, 8).map((entry) => { const connection = connections.find((item) => item.id === entry.connectionId); return <button key={entry.id} type="button" onClick={onOpenHistory}><i><History size={15} /></i><span>{historyLabel(entry.sqlText)}<small>{connection?.name || "已删除连接"} · {new Date(entry.createdAt).toLocaleString()}</small></span><small>打开记录</small></button>; })}</div>}
          {lowerQuery && !hasResults && <div className="search-palette-empty">没有匹配的页面、连接或历史记录</div>}
          {!lowerQuery && <div className="search-palette-section search-palette-actions"><span>快捷操作</span><button type="button" onClick={onNewConnection}><i><Plus size={15} /></i><span>新建连接</span><small>创建服务器或数据库连接</small></button></div>}
        </div>
        <footer className="search-palette-footer"><span><kbd>Enter</kbd> 打开首个结果</span><span><kbd>Esc</kbd> 关闭</span></footer>
      </section>
    </div>,
    document.body,
  );
}

function WindowTitlebar({
  theme,
  search,
  onSearchChange,
  onSearchOpen,
  onThemeToggle,
  nativeWindow,
  maximized,
  onMaximizedChange,
}: {
  theme: Theme;
  search: string;
  onSearchChange: (value: string) => void;
  onSearchOpen: () => void;
  onThemeToggle: () => void;
  nativeWindow: ReturnType<typeof getCurrentWindow> | null;
  maximized: boolean;
  onMaximizedChange: (maximized: boolean) => void;
}) {
  const runWindowAction = (action: () => Promise<void>) => {
    if (!nativeWindow) return;
    void action().catch(() => undefined);
  };

  return (
    <header className="custom-titlebar" data-tauri-drag-region="deep">
      <div className="custom-titlebar-brand">
        <img className="custom-titlebar-mark" src={orangeHubIcon} alt="OrangeHub" />
        <span className="custom-titlebar-name">OrangeHub</span>
      </div>
      <label className="search-box custom-titlebar-search">
        <Search size={14} />
        <input value={search} onFocus={onSearchOpen} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索连接、页面、历史…" />
        <kbd>Ctrl K</kbd>
      </label>
      <div className="custom-titlebar-actions">
        <button className="icon-button theme-toggle" type="button" title={theme === "dark" ? "切换到明亮主题" : "切换到暗黑主题"} aria-label={theme === "dark" ? "切换到明亮主题" : "切换到暗黑主题"} onClick={onThemeToggle}>
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <span className="custom-titlebar-divider" />
        <button className="window-control" type="button" title="最小化" aria-label="最小化" onClick={() => runWindowAction(() => nativeWindow!.minimize())}><Minus size={15} /></button>
        <button className="window-control" type="button" title={maximized ? "还原" : "最大化"} aria-label={maximized ? "还原" : "最大化"} onClick={() => runWindowAction(async () => { await nativeWindow!.toggleMaximize(); onMaximizedChange(await nativeWindow!.isMaximized()); })}>{maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
        <button className="window-control close" type="button" title="关闭" aria-label="关闭" onClick={() => runWindowAction(() => nativeWindow!.close())}><X size={15} /></button>
      </div>
      <CustomTooltip />
    </header>
  );
}

function CustomTooltip() {
  const [tooltip, setTooltip] = useState<{ text: string; cursorX: number; cursorY: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!tooltip) return;
    const node = tooltipRef.current;
    if (!node) return;

    const positionTooltip = () => {
      const rect = node.getBoundingClientRect();
      const gap = 12;
      const edge = 8;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      let left = tooltip.cursorX + gap;
      let top = tooltip.cursorY + gap + 2;

      if (left + rect.width > viewportWidth - edge) {
        left = tooltip.cursorX - rect.width - gap;
      }
      if (top + rect.height > viewportHeight - edge) {
        top = tooltip.cursorY - rect.height - gap;
      }

      left = Math.max(edge, Math.min(left, viewportWidth - rect.width - edge));
      top = Math.max(edge, Math.min(top, viewportHeight - rect.height - edge));
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
    };

    positionTooltip();
    window.addEventListener("resize", positionTooltip);
    return () => window.removeEventListener("resize", positionTooltip);
  }, [tooltip]);

  useEffect(() => {
    let active: HTMLElement | null = null;
    const normalizeTitles = () => {
      document.querySelectorAll<HTMLElement>("[title]").forEach((element) => {
        const text = element.getAttribute("title")?.trim();
        if (!text) return;
        element.dataset.customTooltip = text;
        if (!element.hasAttribute("aria-label") && !element.hasAttribute("aria-description")) {
          element.setAttribute("aria-description", text);
        }
        element.removeAttribute("title");
      });
    };
    const pointTooltip = (event: MouseEvent, element: HTMLElement) => {
      const text = element.dataset.customTooltip?.trim();
      if (!text) return;
      active = element;
      setTooltip({ text, cursorX: event.clientX, cursorY: event.clientY });
    };
    const handleOver = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const element = target.closest<HTMLElement>("[data-custom-tooltip]");
      if (element) pointTooltip(event, element);
    };
    const handleMove = (event: MouseEvent) => {
      if (!active) return;
      const target = event.target;
      if (target instanceof Node && active.contains(target)) pointTooltip(event, active);
    };
    const handleOut = (event: MouseEvent) => {
      if (!active) return;
      const related = event.relatedTarget;
      if (related instanceof Node && active.contains(related)) return;
      active = null;
      setTooltip(null);
    };
    normalizeTitles();
    const observer = new MutationObserver(normalizeTitles);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });
    document.addEventListener("mouseover", handleOver, true);
    document.addEventListener("mousemove", handleMove, true);
    document.addEventListener("mouseout", handleOut, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("mouseover", handleOver, true);
      document.removeEventListener("mousemove", handleMove, true);
      document.removeEventListener("mouseout", handleOut, true);
    };
  }, []);

  if (!tooltip) return null;
  return createPortal(
    <div
      ref={tooltipRef}
      className="custom-tooltip"
      role="tooltip"
      style={{ left: tooltip.cursorX + 12, top: tooltip.cursorY + 14 }}
    >
      {tooltip.text}
    </div>,
    document.body,
  );
}

function OnboardingDialog({
  step,
  dataDirectory,
  dataDirectoryBusy,
  dataDirectoryEditable,
  error,
  onBack,
  onNext,
  onChooseDataDirectory,
  onFinish,
}: {
  step: number;
  dataDirectory: string;
  dataDirectoryBusy: boolean;
  dataDirectoryEditable: boolean;
  error: string;
  onBack: () => void;
  onNext: () => void;
  onChooseDataDirectory: () => void;
  onFinish: () => void;
}) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const canAdvance = step !== 1 || (termsAccepted && privacyAccepted);
  const stepContent = [
    {
      icon: <Server size={22} />,
      eyebrow: "WELCOME TO ORANGEHUB",
      title: "一个工作区，连接所有服务器和数据库",
      body: "OrangeHub 将 SSH 终端、文件管理、数据库操作和 Docker 容器资源管理放在同一个桌面工作区。",
    },
    {
      icon: <ShieldCheck size={22} />,
      eyebrow: "安全使用协议",
      title: "先确认安全与隐私说明",
      body: "连接凭据会使用本地保险库加密保存。远程连接只会在你点击连接按钮后发起，应用不会把连接信息上传到 OrangeHub 服务。",
    },
    {
      icon: <HardDrive size={22} />,
      eyebrow: "LOCAL DATA",
      title: "选择本地数据保存位置",
      body: "连接配置、加密凭据、会话历史和监控记录保存在本地 SQLite 数据库中。建议选择只有当前用户有权限访问的目录。",
    },
    {
      icon: <Activity size={22} />,
      eyebrow: "QUICK TOUR",
      title: "这样开始使用 OrangeHub",
      body: "先新建连接并填写协议参数，再打开连接 Tab，最后手动点击连接。连接成功后即可使用终端、文件、数据库浏览器、SQL 查询和命令行。",
    },
  ][step];

  return (
    <div className="onboarding-screen">
      <div className="onboarding-panel">
        <div className="onboarding-progress">{[0, 1, 2, 3].map((item) => <i key={item} className={item <= step ? "active" : ""} />)}</div>
        <div className="onboarding-content">
          <div className="onboarding-icon">{stepContent.icon}</div>
          <span className="onboarding-eyebrow">{stepContent.eyebrow}</span>
          <h1>{stepContent.title}</h1>
          <p>{stepContent.body}</p>
          {step === 1 && <div className="onboarding-consents">
            <label><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><span>我已阅读并同意 OrangeHub 的使用协议。</span><button type="button" onClick={() => setShowTerms((shown) => !shown)}>{showTerms ? "收起" : "查看协议"}</button></label>
            {showTerms && <p className="onboarding-consent-detail">OrangeHub 用于管理你主动配置的服务器和数据库连接。请仅连接你有权访问的资源；执行远程命令、SQL 和文件操作前，请确认目标和操作内容。</p>}
            <label><input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} /><span>我了解数据默认保存在本机，并由主密码保护。</span><button type="button" onClick={() => setShowPrivacy((shown) => !shown)}>{showPrivacy ? "收起" : "查看说明"}</button></label>
            {showPrivacy && <p className="onboarding-consent-detail">连接配置、加密凭据、历史记录和服务器监控数据保存在你选择的本地目录中。主密码用于保护连接凭据，请妥善保管并定期备份本地数据。</p>}
          </div>}
          {step === 2 && <div className="onboarding-data-picker">
            <label>本地数据目录</label>
            <div><input value={dataDirectory} readOnly placeholder="正在读取默认目录…" /><button type="button" className="secondary-button" disabled={!dataDirectoryEditable || dataDirectoryBusy} onClick={onChooseDataDirectory}><FolderOpen size={14} />选择目录</button></div>
            {!dataDirectoryEditable && <small>当前保险库已经初始化，数据目录设置由已有配置决定。</small>}
            {dataDirectoryEditable && <small>选择后会复制初始数据库并重启客户端，使新目录立即生效。</small>}
          </div>}
          {step === 3 && <div className="onboarding-flow"><div><Server size={15} /><span>新建连接并填写 SSH、文件传输、数据库或 Docker 参数</span></div><div><Cable size={15} /><span>打开连接 Tab，手动点击“连接”验证并建立会话</span></div><div><Database size={15} /><span>在数据库浏览器中管理表、键、集合和查询结果</span></div><div><Boxes size={15} /><span>在 Docker 工作区中管理容器、镜像、网络和卷</span></div></div>}
          {error && <div className="onboarding-error"><AlertCircle size={14} />{error}</div>}
        </div>
        <div className="onboarding-footer">
          {step > 0 ? <button type="button" className="secondary-button" onClick={onBack}>上一步</button> : <span />}
          {step < 3 ? <button type="button" className="primary-button" disabled={!canAdvance || dataDirectoryBusy || (step === 2 && dataDirectoryEditable && !dataDirectory)} onClick={onNext}>继续 <ChevronRight size={14} /></button> : <button type="button" className="primary-button" disabled={dataDirectoryBusy} onClick={onFinish}>{dataDirectoryBusy ? "正在保存…" : "开始使用"} <Check size={14} /></button>}
        </div>
      </div>
      <span className="onboarding-version">ORANGEHUB DESKTOP · {appVersion}</span>
    </div>
  );
}

function ConnectionListItem({
  connection,
  active,
  reachable,
  onClick,
}: {
  connection: Connection;
  active: boolean;
  reachable: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`connection-list-item ${active ? "selected" : ""}`}
      onClick={onClick}
    >
      <span className={`connection-icon ${connection.kind}`}>
        <ProtocolIcon connection={connection} size={14} />
      </span>
      <span className="connection-copy">
        <b>{connection.name}</b>
        <small>{connection.host || connection.sqlitePath || "本地文件"}</small>
      </span>
      {reachable && <i className="connection-status" />}
    </button>
  );
}

function Overview({
  connections,
  reachable,
  onOpen,
  onViewAll,
  onConnect,
  connectingId,
}: {
  connections: Connection[];
  reachable: Record<string, number>;
  onOpen: (item: Connection) => void;
  onViewAll: () => void;
  onConnect: (item: Connection) => void;
  connectingId: string | null;
}) {
  const recent = [...connections].slice(0, 5);
  const databases = connections.filter((item) =>
    ["sql", "redis", "mongo"].includes(item.kind),
  ).length;
  const docker = connections.filter((item) => item.kind === "docker").length;
  const servers = connections.length - databases - docker;
  return (
    <div className="overview-page">
      <div className="page-heading">
        <div>
          <h1>工作台</h1>
        </div>
      </div>
      <div className="metric-row">
        <Metric
          icon={<Server size={16} />}
          label="服务器"
          value={servers}
          accent="mint"
        />
        <Metric
          icon={<Database size={16} />}
          label="数据库"
          value={databases}
          accent="orange"
        />
        <Metric
          icon={<Activity size={16} />}
          label="已探测"
          value={Object.keys(reachable).length}
          accent="blue"
        />
        {docker > 0 && <Metric icon={<Boxes size={16} />} label="Docker" value={docker} accent="mint" />}
      </div>

      <div className="section-heading">
        <div>
            <h2>连接列表</h2>
        </div>
        <button className="text-button" onClick={onViewAll}>
          全部连接
          <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="recent-table-wrap">
        <table className="recent-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>地址</th>
              <th>连通性</th>
              <th>
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {recent.map((connection) => (
              <tr key={connection.id} onClick={() => onOpen(connection)}>
                <td>
                  <span
                    className={`connection-icon table-icon ${connection.kind}`}
                  >
                    <ProtocolIcon connection={connection} size={15} />
                  </span>
                  <span className="table-name">
                    <b>{connection.name}</b>
                    <small>
                      {connection.database || connection.username || "连接配置"}
                    </small>
                  </span>
                </td>
                <td>
                  <span className={`type-pill ${connection.kind}`}>
                    {protocolName(connection)}
                  </span>
                </td>
                <td className="host-cell">
                  {connection.kind === "sql" &&
                  connection.sqlDriver === "sqlite"
                    ? connection.sqlitePath || "本地 SQLite"
                    : `${connection.host}:${connection.port}`}
                </td>
                <td>
                  {reachable[connection.id] !== undefined ? (
                    <span className="reachable-label">
                      <i />
                      可达 · {reachable[connection.id]} ms
                    </span>
                  ) : (
                    <span className="never-label">未连接</span>
                  )}
                </td>
                <td className="row-actions">
                  <button
                    className="icon-button small"
                    title="连接并打开"
                    disabled={connectingId === connection.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onConnect(connection);
                    }}
                  >
                    {connectingId === connection.id ? (
                      <span className="mini-spinner" />
                    ) : (
                      <ArrowUpRight size={15} />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {recent.length === 0 && (
          <div className="empty-state compact">
            <Server size={20} />
            <b>还没有连接</b>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="metric">
      <span className={`metric-icon ${accent}`}>{icon}</span>
      <div className="metric-main">
        <span>{label}</span>
        <b>{value}</b>
      </div>
    </div>
  );
}

function ConnectionsPage({
  connections,
  reachable,
  onOpen,
  onCreate,
  onEdit,
  onDelete,
  onConnect,
  connectingId,
}: {
  connections: Connection[];
  reachable: Record<string, number>;
  onOpen: (item: Connection) => void;
  onCreate: () => void;
  onEdit: (item: Connection) => void;
  onDelete: (item: Connection) => void;
  onConnect: (item: Connection) => void;
  connectingId: string | null;
}) {
  const [typeFilter, setTypeFilter] = useState<ConnectionTypeFilter>("all");
  const [sortOrder, setSortOrder] = useState<"name-asc" | "name-desc" | "created-desc">("name-asc");

  const displayedConnections = useMemo(() => {
    const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
    const filtered = connections.filter((connection) => {
      if (typeFilter === "all") return true;
      if (typeFilter.startsWith("sql:")) {
        return connection.kind === "sql" && (connection.sqlDriver || "mysql") === typeFilter.slice(4);
      }
      return connection.kind === typeFilter;
    });

    return [...filtered].sort((left, right) => {
      if (sortOrder === "created-desc") {
        const rightCreated = right.createdAt ? Date.parse(right.createdAt) : 0;
        const leftCreated = left.createdAt ? Date.parse(left.createdAt) : 0;
        const createdDifference = rightCreated - leftCreated;
        if (createdDifference !== 0) return createdDifference;
      } else {
        const nameDifference = collator.compare(left.name, right.name);
        if (nameDifference !== 0) return sortOrder === "name-asc" ? nameDifference : -nameDifference;
      }
      return collator.compare(left.name, right.name);
    });
  }, [connections, sortOrder, typeFilter]);

  return (
    <div className="connections-page">
      <div className="page-heading">
        <div>
          <h1>所有连接</h1>
        </div>
        <button className="primary-button" onClick={onCreate}>
          <Plus size={16} />
          新建连接
        </button>
      </div>
      <div className="connection-toolbar">
        <span>{displayedConnections.length} 个连接</span>
        <div className="toolbar-filter">
          <DropdownSelect
            className="connection-filter-dropdown"
            value={typeFilter}
            ariaLabel="连接类型筛选"
            options={connectionTypeFilterOptions}
            onChange={(value) => setTypeFilter(value as ConnectionTypeFilter)}
          />
          <DropdownSelect
            className="connection-filter-dropdown connection-sort-dropdown"
            value={sortOrder}
            ariaLabel="连接排序方式"
            options={[
              { value: "name-asc", label: "名称排序" },
              { value: "name-desc", label: "名称倒序" },
              { value: "created-desc", label: "最近创建" },
            ]}
            onChange={(value) => setSortOrder(value as "name-asc" | "name-desc" | "created-desc")}
          />
        </div>
      </div>
      <div className="connection-cards">
        {displayedConnections.map((connection) => (
          <article key={connection.id} className="connection-card">
            <button
              className="connection-card-main"
              onClick={() => onOpen(connection)}
            >
              <span className={`connection-icon card-icon ${connection.kind}`}>
                <ProtocolIcon connection={connection} size={17} />
              </span>
              <span className="card-title">
                <b>{connection.name}</b>
                <span className={`type-pill ${connection.kind}`}>
                  {protocolName(connection)}
                </span>
              </span>
              <small className="card-address">
                {connection.host || connection.sqlitePath || "本地文件"}
                {connection.port ? `:${connection.port}` : ""}
              </small>
              <small className="card-database">
                {connection.database ||
                  connection.username ||
                  "未设置默认数据库"}
              </small>
              <span className="card-timestamps">
                <span><small>创建时间</small><time dateTime={connection.createdAt}>{formatConnectionTime(connection.createdAt)}</time></span>
                <span><small>编辑时间</small><time dateTime={connection.updatedAt}>{formatConnectionTime(connection.updatedAt)}</time></span>
              </span>
            </button>
            <div className="card-footer">
              <span
                className={
                  reachable[connection.id] !== undefined
                    ? "reachable-label"
                    : "never-label"
                }
              >
                {reachable[connection.id] !== undefined ? (
                  <>
                    <i />
                    可达 · {reachable[connection.id]} ms
                  </>
                ) : (
                  "未连接"
                )}
              </span>
              <div>
                <button
                  className="icon-button small"
                  title="连接"
                  disabled={connectingId === connection.id}
                  onClick={() => onConnect(connection)}
                >
                  {connectingId === connection.id ? (
                    <span className="mini-spinner" />
                  ) : (
                    <Cable size={15} />
                  )}
                </button>
                <button
                  className="icon-button small"
                  title="编辑"
                  onClick={() => onEdit(connection)}
                >
                  <Settings2 size={15} />
                </button>
                <button
                  className="icon-button small danger-icon"
                  title="删除"
                  onClick={() => onDelete(connection)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </article>
        ))}
        {displayedConnections.length === 0 && (
          <div className="empty-state">
            <Server size={22} />
            <b>{connections.length === 0 ? "没有找到连接" : "没有匹配的连接"}</b>
            <span>{connections.length === 0 ? "创建一个 SSH、文件传输或数据库连接。" : "请调整类型筛选条件后重试。"}</span>
            {connections.length === 0 && (
              <button className="primary-button" onClick={onCreate}>
                <Plus size={15} />
                新建连接
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPage({ notify }: { notify: (kind: Toast["kind"], message: string) => void }) {
  const [providers, setProviders] = useState<AiProviderConfig[]>(() => isNative
    ? aiProviderPresets.map((preset) => createAiProvider(preset, `preset-${preset.vendor.toLowerCase()}-${preset.name}`))
    : readAiProviders());
  const [selectedId, setSelectedId] = useState(() => providers[0]?.id || "");
  const [draft, setDraft] = useState<AiProviderConfig | null>(() => providers[0] ? { ...providers[0] } : null);
  const [showKey, setShowKey] = useState(false);
  const [promptTab, setPromptTab] = useState<keyof AiProviderConfig["prompts"]>("serverControl");
  const [loading, setLoading] = useState(isNative);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const selected = providers.find((provider) => provider.id === selectedId);
  const promptTabs = [
    { key: "serverControl", label: "服务器运维", description: "服务器接管与命令执行规范", icon: <Server size={14} /> },
    { key: "sqlPolish", label: "SQL 润色", description: "SQL 编写、校验与优化规范", icon: <Code2 size={14} /> },
    { key: "databaseControl", label: "数据库操作", description: "数据库及数据表管理规范", icon: <Database size={14} /> },
  ] as const;
  const activePromptTab = promptTabs.find((tab) => tab.key === promptTab) || promptTabs[0];

  useEffect(() => {
    let cancelled = false;
    void getAiProviders()
      .then((stored) => {
        if (cancelled || !stored.length) return;
        setProviders(stored);
        const next = stored.find((provider) => provider.id === selectedId) || stored[0];
        setSelectedId(next.id);
        setDraft({ ...next });
      })
      .catch((error) => {
        if (!cancelled && isNative) notifyRef.current("error", `读取 AI 配置失败：${String(error)}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selected) {
      const first = providers[0];
      if (first) {
        setSelectedId(first.id);
        setDraft({ ...first });
      }
    }
  }, [providers, selected, selectedId]);

  function selectProvider(provider: AiProviderConfig) {
    setSelectedId(provider.id);
    setDraft({ ...provider });
    setShowKey(false);
    setPromptTab("serverControl");
  }

  function updateDraft(patch: Partial<AiProviderConfig>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  function updatePrompt(value: string) {
    setDraft((current) => current ? {
      ...current,
      prompts: { ...current.prompts, [promptTab]: value },
    } : current);
  }

  async function saveDraft() {
    if (!draft) return;
    const nextDraft = {
      ...draft,
      name: draft.name.trim(),
      vendor: draft.vendor.trim(),
      baseUrl: draft.baseUrl.trim().replace(/\/$/, ""),
      model: draft.model.trim(),
    };
    if (!nextDraft.name) {
      notify("error", "请填写服务名称");
      return;
    }
    if (!nextDraft.baseUrl) {
      notify("error", "请填写服务 URL");
      return;
    }
    if (!nextDraft.model) {
      notify("error", "请填写模型名称");
      return;
    }
    const next = providers.some((provider) => provider.id === nextDraft.id)
      ? providers.map((provider) => provider.id === nextDraft.id ? nextDraft : provider)
      : [nextDraft, ...providers];
    try {
      await saveAiProviders(next);
      setProviders(next);
      setDraft(nextDraft);
      notify("success", `${nextDraft.name} 配置已保存`);
    } catch (error) {
      notify("error", `保存 AI 配置失败：${String(error)}`);
    }
  }

  function addCustomProvider() {
    const custom = createAiProvider({ ...aiProviderPresets.at(-1)! }, `custom-${crypto.randomUUID()}`);
    setProviders((current) => [custom, ...current]);
    setSelectedId(custom.id);
    setDraft(custom);
    setShowKey(false);
  }

  function resetDraft() {
    if (!draft) return;
    const preset = aiProviderPresets.find((item) => item.name === draft.name && item.vendor === draft.vendor);
    const reset = createAiProvider(preset || { ...aiProviderPresets.at(-1)! }, draft.id);
    setDraft(reset);
    setPromptTab("serverControl");
  }

  return (
    <div className="settings-page">
      <div className="page-heading settings-page-heading">
        <div>
          <h1>设置</h1>
          <p>管理 AI 服务、请求格式，以及服务器、SQL 与数据库助手的内置提示词。</p>
        </div>
      </div>
      <div className="settings-layout">
        <aside className="settings-provider-panel">
          <div className="settings-panel-heading">
            <div><Bot size={15} /><b>AI 服务</b></div>
            <span>{providers.length}</span>
          </div>
          <p className="settings-panel-description">支持主流厂商、NewAPI、Sub2API 及兼容 OpenAI 接口的自定义服务。</p>
          <div className="settings-provider-list">
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={`settings-provider-item ${provider.id === selectedId ? "active" : ""}`}
                onClick={() => selectProvider(provider)}
              >
                <span className="settings-provider-logo">
                  <img src={getAiProviderIcon(provider)} alt={`${provider.vendor || provider.name} 图标`} />
                </span>
                <span className="settings-provider-copy">
                  <b>{provider.name}</b>
                  <small>{provider.vendor}</small>
                </span>
                <i className={provider.enabled ? "configured" : "disabled"} />
              </button>
            ))}
          </div>
          <button type="button" className="settings-add-provider" onClick={addCustomProvider}>
            <Plus size={14} />新增自定义服务
          </button>
        </aside>
        <section className="settings-editor-panel">
          {loading && <div className="settings-loading"><span className="mini-spinner" />正在读取配置…</div>}
          {!loading && draft && (
            <>
              <div className="settings-editor-heading">
                <div className="settings-editor-title">
                  <span className="settings-editor-icon">
                    <img src={getAiProviderIcon(draft)} alt={`${draft.vendor || draft.name} 图标`} />
                  </span>
                  <span><h2>{draft.name}</h2><small>{draft.vendor || "自定义服务"}</small></span>
                </div>
                <span className={`settings-status ${draft.enabled ? "enabled" : "disabled"}`}>
                  <i />{draft.enabled ? "已启用" : "已停用"}
                </span>
              </div>
              <div className="settings-form-grid">
                <label className="form-field">
                  <span>服务名称</span>
                  <input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="例如：生产环境 AI" />
                </label>
                <label className="form-field">
                  <span>厂商</span>
                  <input value={draft.vendor} onChange={(event) => updateDraft({ vendor: event.target.value })} placeholder="例如：OpenAI" />
                </label>
                <label className="form-field full-field">
                  <span>服务 URL</span>
                  <input type="url" value={draft.baseUrl} onChange={(event) => updateDraft({ baseUrl: event.target.value })} placeholder="https://api.example.com/v1" />
                  <small className="settings-field-hint">
                    {draft.vendor.toLowerCase().includes("sub2api")
                      ? "填写 Sub2API 的 API 基础地址（通常以 /v1 结尾），不要填写管理页面地址。"
                      : "填写服务的基础地址，系统会根据传递格式拼接请求路径。"}
                  </small>
                </label>
                <label className="form-field">
                  <span>API Key</span>
                  <span className="settings-secret-input">
                    <input type={showKey ? "text" : "password"} value={draft.apiKey} onChange={(event) => updateDraft({ apiKey: event.target.value })} placeholder="sk-…" autoComplete="off" />
                    <button type="button" className="icon-button small" title={showKey ? "隐藏 Key" : "显示 Key"} aria-label={showKey ? "隐藏 Key" : "显示 Key"} onClick={() => setShowKey((value) => !value)}>
                      {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </span>
                </label>
                <label className="form-field">
                  <span>默认模型</span>
                  <input value={draft.model} onChange={(event) => updateDraft({ model: event.target.value })} placeholder="模型名称" />
                </label>
                <label className="form-field full-field">
                  <span>传递格式</span>
                  <DropdownSelect
                    className="settings-format-select"
                    value={draft.format}
                    ariaLabel="AI 请求传递格式"
                    options={aiApiFormatOptions}
                    onChange={(value) => updateDraft({ format: value as AiApiFormat })}
                  />
                </label>
              </div>
              <section className="settings-prompts" aria-label="内置提示词">
                <div className="settings-prompts-heading">
                  <div><b>内置提示词</b><small>为此 AI 服务分别配置不同工作场景的行为规则</small></div>
                  <span className="settings-prompt-count">{draft.prompts[promptTab].length.toLocaleString()} 字</span>
                </div>
                <div className="settings-prompt-tabs" role="tablist" aria-label="提示词类型">
                  {promptTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={promptTab === tab.key}
                      className={`settings-prompt-tab ${promptTab === tab.key ? "active" : ""}`}
                      onClick={() => setPromptTab(tab.key)}
                    >
                      {tab.icon}<span>{tab.label}</span>
                    </button>
                  ))}
                </div>
                <div className="settings-prompt-editor-heading">
                  <span>{activePromptTab.description}</span>
                  <button
                    type="button"
                    className="settings-prompt-reset"
                    onClick={() => updateDraft({ prompts: { ...draft.prompts, [promptTab]: defaultAiPrompts[promptTab] } })}
                  ><RotateCcw size={12} />恢复当前默认</button>
                </div>
                <textarea
                  className="settings-prompt-textarea"
                  aria-label={`${activePromptTab.label}内置提示词`}
                  value={draft.prompts[promptTab]}
                  onChange={(event) => updatePrompt(event.target.value)}
                  spellCheck={false}
                  placeholder="为此 AI 服务编写该场景下的行为要求…"
                />
                <small className="settings-prompt-footnote">提示词会随当前 AI 服务配置保存在本机，并在对应 AI 功能调用时作为系统指令使用。</small>
              </section>
              <div className="settings-security-note"><KeyRound size={14} /><span>API Key 仅保存在本机配置中。桌面版会使用已解锁的保险库加密保存。</span></div>
              <div className="settings-editor-footer">
                <button type="button" className={`settings-toggle ${draft.enabled ? "active" : ""}`} onClick={() => updateDraft({ enabled: !draft.enabled })}>
                  <span /><b>{draft.enabled ? "服务已启用" : "服务已停用"}</b>
                </button>
                <div>
                  <button type="button" className="secondary-button" onClick={resetDraft}><RotateCcw size={14} />恢复模板</button>
                  <button type="button" className="primary-button" onClick={() => void saveDraft()}><Check size={14} />保存配置</button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function parseSqlEditorValue(value: string, dataType: string): Cell {
  if (value === "") return null;
  const type = dataType.toUpperCase();
  if (type.includes("BOOL")) {
    if (/^(true|1)$/i.test(value)) return true;
    if (/^(false|0)$/i.test(value)) return false;
    throw new Error("布尔值请输入 true 或 false");
  }
  if (type.includes("INT")) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new Error("请输入有效整数");
    return parsed;
  }
  if (["REAL", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC"].some((part) => type.includes(part))) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error("请输入有效数字");
    return value;
  }
  return value;
}

function SqlDataBrowser({
  connection,
  initialDatabase,
  notify,
  confirmInApp,
  onDatabaseChange,
  onOpenCommandLine,
  onNewQuery,
  onRunSqlFile,
  onDumpSqlDatabase,
  onAiTableControl,
}: {
  connection: Connection;
  initialDatabase: string;
  notify: (kind: Toast["kind"], message: string) => void;
  confirmInApp: (title: string, message: string, confirmLabel?: string, destructive?: boolean) => Promise<boolean>;
  onDatabaseChange: (database: string) => void;
  onOpenCommandLine: () => void;
  onNewQuery: () => void;
  onRunSqlFile: (database: string) => void;
  onDumpSqlDatabase: (database: string, includeData: boolean) => void;
  onAiTableControl: (context: string) => void;
}) {
  const [databases, setDatabases] = useState<{ name: string }[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState(initialDatabase || connection.database || "");
  const [tables, setTables] = useState<SqlTableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableData, setTableData] = useState<SqlTableData | null>(null);
  const [page, setPage] = useState(1);
  const [tableView, setTableView] = useState<"data" | "structure">("data");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [objectRefreshKey, setObjectRefreshKey] = useState(0);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; column: number; value: string } | null>(null);
  const [newRowOpen, setNewRowOpen] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({});
  const [structureDraft, setStructureDraft] = useState<SqlColumn[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: "database" | "table";
    database?: string;
    table?: SqlTableInfo;
  } | null>(null);
  const [createDatabaseOpen, setCreateDatabaseOpen] = useState(false);
  const [editingDatabase, setEditingDatabase] = useState<string | null>(null);
  const [databaseBusy, setDatabaseBusy] = useState(false);
  const sqlDriver = connection.sqlDriver || "mysql";

  useEffect(() => {
    let cancelled = false;
    setDatabases([]);
    setTables([]);
    setSelectedTable("");
    setTableData(null);
    setSelectedDatabase(initialDatabase || connection.database || "");
    setError(null);
    setBusy(true);
    void listSqlDatabases(connection.id).then((items) => {
      if (cancelled) return;
      setDatabases(items);
      const configured = initialDatabase || connection.database || "";
      const selected = items.some((item) => item.name === selectedDatabase)
        ? selectedDatabase
        : items.some((item) => item.name === configured) ? configured : items[0]?.name || "";
      setSelectedDatabase(selected);
      onDatabaseChange(selected);
    }).catch((reason) => {
      if (!cancelled) setError(String(reason));
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => { cancelled = true; };
  }, [connection.id, objectRefreshKey, onDatabaseChange]);

  useEffect(() => {
    if (!selectedDatabase) return;
    let cancelled = false;
    setTables([]);
    setSelectedTable("");
    setTableData(null);
    setError(null);
    setBusy(true);
    void listSqlTables(connection.id, selectedDatabase).then((items) => {
      if (cancelled) return;
      setTables(items);
      setSelectedTable((current) => items.some((item) => item.name === current) ? current : items[0]?.name || "");
    }).catch((reason) => {
      if (!cancelled) setError(String(reason));
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => { cancelled = true; };
  }, [connection.id, selectedDatabase, objectRefreshKey]);

  useEffect(() => {
    if (!selectedDatabase || !selectedTable) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    setEditingCell(null);
    setSelectedRow(null);
    void getSqlTableData(connection.id, selectedDatabase, selectedTable, page, 50).then((data) => {
      if (!cancelled) {
        const lastPage = Math.max(1, Math.ceil(data.total_rows / data.page_size));
        if (page > lastPage) setPage(lastPage);
        else setTableData(data);
      }
    }).catch((reason) => {
      if (!cancelled) {
        setTableData(null);
        setError(String(reason));
      }
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => { cancelled = true; };
  }, [connection.id, selectedDatabase, selectedTable, page, refreshKey]);

  useEffect(() => {
    setStructureDraft(tableData?.columns.map((column) => ({ ...column })) || []);
  }, [tableData]);

  async function saveCell() {
    if (!editingCell || !tableData || !selectedDatabase || !selectedTable) return;
    try {
      const column = tableData.columns[editingCell.column];
      const value = parseSqlEditorValue(editingCell.value, column.data_type);
      const row = tableData.rows[editingCell.row];
      const keyValues = tableData.primary_key.map((key) => row[tableData.columns.findIndex((item) => item.name === key)]);
      await updateSqlCell(connection.id, selectedDatabase, selectedTable, tableData.primary_key, keyValues, column.name, value);
      setEditingCell(null);
      setRefreshKey((current) => current + 1);
      notify("success", "数据已更新");
    } catch (reason) {
      notify("error", String(reason));
    }
  }

  async function removeSelectedRow() {
    if (!tableData || selectedRow === null || !tableData.primary_key.length || !selectedDatabase || !selectedTable) return;
    const accepted = await confirmInApp("删除数据行", "确定删除选中的数据行吗？此操作无法撤销。", "删除行", true);
    if (!accepted) return;
    try {
      const row = tableData.rows[selectedRow];
      const keyValues = tableData.primary_key.map((key) => row[tableData.columns.findIndex((item) => item.name === key)]);
      await deleteSqlRow(connection.id, selectedDatabase, selectedTable, tableData.primary_key, keyValues);
      setSelectedRow(null);
      setRefreshKey((current) => current + 1);
      notify("success", "数据行已删除");
    } catch (reason) {
      notify("error", String(reason));
    }
  }

  async function submitNewRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tableData || !selectedDatabase || !selectedTable) return;
    try {
      const entries = tableData.columns
        .filter((column) => newRowValues[column.name] !== undefined && newRowValues[column.name] !== "")
        .map((column) => [column.name, parseSqlEditorValue(newRowValues[column.name], column.data_type)] as const);
      await insertSqlRow(connection.id, selectedDatabase, selectedTable, entries.map(([name]) => name), entries.map(([, value]) => value));
      setNewRowOpen(false);
      setNewRowValues({});
      setPage(1);
      setRefreshKey((current) => current + 1);
      notify("success", "数据行已新增");
    } catch (reason) {
      notify("error", String(reason));
    }
  }

  function updateStructureColumn(index: number, patch: Partial<SqlColumn>) {
    setStructureDraft((current) => current.map((column, columnIndex) => {
      if (columnIndex !== index) return column;
      const updated = { ...column, ...patch };
      if (patch.primary_key) updated.nullable = false;
      return updated;
    }));
  }

  function addStructureColumn() {
    let suffix = structureDraft.length + 1;
    while (structureDraft.some((column) => column.name === `column_${suffix}`)) suffix += 1;
    setStructureDraft((current) => [...current, {
      name: `column_${suffix}`,
      data_type: sqlDriver === "sqlite" ? "TEXT" : "VARCHAR(255)",
      nullable: true,
      primary_key: false,
      comment: "",
    }]);
  }

  function changeStructureType(index: number, column: SqlColumn, nextType: string) {
    const current = splitSqlType(column.data_type);
    const currentKind = sqlTypeLengthKind(sqlDriver, current.type) || (current.length ? "custom" : null);
    const nextKind = sqlTypeLengthKind(sqlDriver, nextType);
    const preservedLength = currentKind && currentKind === nextKind ? current.length : "";
    const length = preservedLength || initialSqlTypeLength(sqlDriver, nextType);
    const suffix = sqlDriverFamily(sqlDriver) === "mysql" && ["integer", "numeric"].includes(nextKind || "")
      && /^(?:UNSIGNED|ZEROFILL|UNSIGNED ZEROFILL)$/i.test(current.suffix)
      ? current.suffix
      : "";
    updateStructureColumn(index, { data_type: formatSqlType(nextType, length, suffix) });
  }

  function changeStructureLength(index: number, column: SqlColumn, length: string) {
    const current = splitSqlType(column.data_type);
    updateStructureColumn(index, { data_type: formatSqlType(current.type, length, current.suffix) });
  }

  async function removeStructureColumn(index: number) {
    const column = structureDraft[index];
    if (!column) return;
    if (column.original_name) {
      const accepted = await confirmInApp(
        "删除数据列",
        `确定删除列“${column.original_name}”吗？此操作会删除该列中的数据，无法撤销。`,
        "删除列",
        true,
      );
      if (!accepted) return;
    }
    setStructureDraft((current) => current.filter((_, columnIndex) => columnIndex !== index));
  }

  async function saveStructure() {
    if (!tableData || !selectedDatabase || !selectedTable || busy) return;
    const accepted = await confirmInApp(
      "保存表结构",
      "确认应用列名、数据类型、长度、可空、主键和注释的更改？删除列会丢失该列数据，修改数据类型也可能造成转换失败或精度变化。",
      "保存结构",
    );
    if (!accepted) return;
    setBusy(true);
    try {
      await saveSqlTableStructure(connection.id, selectedDatabase, selectedTable, structureDraft);
      setRefreshKey((current) => current + 1);
      notify("success", "表结构已保存");
    } catch (reason) {
      notify("error", String(reason));
    } finally {
      setBusy(false);
    }
  }

  function showDatabaseContextMenu(event: ReactMouseEvent, database = selectedDatabase) {
    event.preventDefault();
    event.stopPropagation();
    if (database) {
      setSelectedDatabase(database);
      onDatabaseChange(database);
    }
    setContextMenu({ x: event.clientX, y: event.clientY, target: "database", database });
  }

  async function saveDatabaseName(target: string) {
    if (!editingDatabase) return;
    await renameSqlDatabase(connection.id, editingDatabase, target);
    setSelectedDatabase(target);
    onDatabaseChange(target);
    setEditingDatabase(null);
    setObjectRefreshKey((current) => current + 1);
    notify("success", `数据库已重命名为 ${target}`);
  }

  function showTableContextMenu(event: ReactMouseEvent, table: SqlTableInfo) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, target: "table", table });
  }

  async function createDatabase(name: string) {
    setDatabaseBusy(true);
    try {
      await createSqlDatabase(connection.id, name.trim());
      setCreateDatabaseOpen(false);
      setSelectedDatabase(name.trim());
      onDatabaseChange(name.trim());
      setObjectRefreshKey((current) => current + 1);
      notify("success", `数据库 ${name.trim()} 已创建`);
    } catch (reason) {
      throw reason;
    } finally {
      setDatabaseBusy(false);
    }
  }

  async function removeDatabase(database = selectedDatabase) {
    if (!database) return;
    const accepted = await confirmInApp(
      "删除数据库",
      `确定永久删除数据库“${database}”及其中的所有表和数据吗？此操作无法撤销。`,
      "删除数据库",
      true,
    );
    if (!accepted) return;
    try {
      await deleteSqlDatabase(connection.id, database);
      setSelectedDatabase("");
      onDatabaseChange("");
      setObjectRefreshKey((current) => current + 1);
      notify("success", `数据库 ${database} 已删除`);
    } catch (reason) {
      notify("error", String(reason));
    }
  }

  async function emptyTable(table: SqlTableInfo) {
    const accepted = await confirmInApp(
      "清空数据表",
      `确定删除表“${table.name}”中的所有记录吗？表结构将保留，此操作无法撤销。`,
      "清空数据",
      true,
    );
    if (!accepted) return;
    try {
      await truncateSqlTable(connection.id, selectedDatabase, table.name);
      setPage(1);
      setRefreshKey((current) => current + 1);
      notify("success", `表 ${table.name} 已清空`);
    } catch (reason) {
      notify("error", String(reason));
    }
  }

  async function removeTable(table: SqlTableInfo) {
    const isView = table.kind.toLowerCase().includes("view");
    const accepted = await confirmInApp(
      isView ? "删除视图" : "删除数据表",
      `确定永久删除“${table.name}”${isView ? "视图" : "及其全部数据"}吗？此操作无法撤销。`,
      isView ? "删除视图" : "删除数据表",
      true,
    );
    if (!accepted) return;
    try {
      await deleteSqlTable(connection.id, selectedDatabase, table.name, isView);
      if (selectedTable === table.name) {
        setSelectedTable("");
        setTableData(null);
      }
      setObjectRefreshKey((current) => current + 1);
      notify("success", `${isView ? "视图" : "数据表"} ${table.name} 已删除`);
    } catch (reason) {
      notify("error", String(reason));
    }
  }

  async function exportTableSql(table: SqlTableInfo, includeData: boolean) {
    try {
      const contents = await dumpSqlTable(connection.id, selectedDatabase, table.name, includeData);
      const filename = `${selectedDatabase}_${table.name}`.replace(/[\\/:*?"<>|]+/g, "_");
      const saved = await saveTextFile(`${filename}.sql`, "sql", contents);
      if (saved) notify("success", `已导出 ${table.name}.sql（${includeData ? "结构和数据" : "仅结构"}）`);
    } catch (reason) {
      notify("error", String(reason));
    }
  }

  const pageCount = Math.max(1, Math.ceil((tableData?.total_rows || 0) / (tableData?.page_size || 50)));
  const selectedTableKind = tables.find((table) => table.name === selectedTable)?.kind || "TABLE";
  const readOnlySqlDriver = ["mssql", "oracle"].includes(sqlDriver);
  const canEditRows = !readOnlySqlDriver && Boolean(tableData?.primary_key.length) && !selectedTableKind.toLowerCase().includes("view");
  const canEditStructure = !readOnlySqlDriver && Boolean(tableData) && !selectedTableKind.toLowerCase().includes("view");
  const structureDirty = Boolean(tableData) && (
    structureDraft.length !== tableData!.columns.length || structureDraft.some((column, index) => {
      const original = tableData!.columns[index];
      return !original || column.original_name !== original.name || column.name !== original.name ||
        column.data_type !== original.data_type || column.nullable !== original.nullable ||
        column.primary_key !== original.primary_key || (column.comment || "") !== (original.comment || "");
    })
  );

  return (
    <div className="sql-browser">
      <aside className="sql-object-sidebar">
        <div className="sql-object-toolbar">
          <span><Database size={14} />对象浏览</span>
          <button className="icon-button small" title="刷新对象" onClick={() => setObjectRefreshKey((current) => current + 1)}><RefreshCw size={13} /></button>
        </div>
        <label className="sql-database-select" onContextMenu={(event) => showDatabaseContextMenu(event)}>
          <span onContextMenu={showDatabaseContextMenu}>数据库</span>
          <DropdownSelect
            className="sql-object-dropdown"
            value={selectedDatabase}
            ariaLabel="数据库"
            placeholder={busy ? "正在读取…" : "无可用数据库"}
            disabled={!databases.length}
            options={databases.map((database) => ({ value: database.name, label: database.name }))}
            onContextMenu={(event, option) => showDatabaseContextMenu(event, option?.value)}
            onChange={(value) => { setSelectedDatabase(value); onDatabaseChange(value); setPage(1); }}
          />
        </label>
        <div className="sql-object-list-heading">表和视图 <span>{tables.length}</span></div>
        <div className="sql-object-list">
          {tables.map((table) => (
            <button key={table.name} className={selectedTable === table.name ? "active" : ""} onClick={() => { setSelectedTable(table.name); setTableData(null); setPage(1); setTableView("data"); }} onContextMenu={(event) => showTableContextMenu(event, table)}>
              <ChevronRight size={13} />
              <span>{table.name}</span>
              <small>{table.kind.toLowerCase().includes("view") ? "视图" : "表"}</small>
            </button>
          ))}
          {!tables.length && <div className="sql-object-empty">{busy ? "读取对象中…" : error || "当前数据库没有表"}</div>}
        </div>
      </aside>
      <section className="sql-table-panel">
        <div className="sql-table-toolbar">
          <div className="sql-table-title">
            <b>{selectedTable || "选择数据表"}</b>
            {tableData && <span>{tableData.total_rows.toLocaleString()} 行</span>}
            {tableData && selectedTableKind.toLowerCase().includes("view") && <small>只读视图</small>}
            {tableData && !canEditRows && !selectedTableKind.toLowerCase().includes("view") && <small>无主键 · 行只读</small>}
          </div>
          <div className="sql-table-actions">
            <button className="secondary-button ai-entry-button" title="让 AI 根据当前表结构协助检查或生成 SQL" disabled={!selectedTable || !tableData || busy} onClick={() => onAiTableControl(`数据库：${selectedDatabase}\n数据表：${selectedTable}（${selectedTableKind}）\n字段结构：\n${tableData?.columns.map((column) => `- ${column.name} ${column.data_type}${column.nullable ? " NULL" : " NOT NULL"}${column.primary_key ? " PRIMARY KEY" : ""}${column.comment ? ` COMMENT ${column.comment}` : ""}`).join("\n") || "结构尚未读取"}\n\n不要假设或发送表中记录值。`)}><Bot size={13} />AI 助手</button>
            <button className="icon-button small" title="刷新数据" disabled={!selectedTable || busy} onClick={() => setRefreshKey((current) => current + 1)}><RefreshCw size={14} /></button>
            <span className="toolbar-divider" />
            {tableView === "structure" && <button className="icon-button small" title="保存结构" disabled={!canEditStructure || !structureDirty || busy} onClick={() => void saveStructure()}><Check size={14} /></button>}
            <button className="icon-button small" title={tableView === "structure" ? "新增列" : "新增行"} disabled={tableView === "structure" ? !canEditStructure || busy : !tableData || busy || readOnlySqlDriver || selectedTableKind.toLowerCase().includes("view")} onClick={() => { if (tableView === "structure") addStructureColumn(); else { setNewRowValues({}); setNewRowOpen(true); } }}><Plus size={15} /></button>
            <button className="icon-button small danger-button" title="删除选中行" disabled={!canEditRows || selectedRow === null || busy} onClick={() => void removeSelectedRow()}><Trash2 size={14} /></button>
          </div>
        </div>
        {readOnlySqlDriver && <div className="sql-capability-note"><AlertCircle size={13} />{sqlDriver === "mssql" ? "SQL Server 当前支持连接、查询、对象浏览和只读分页；结构编辑、行编辑和转储功能暂不可用。" : "Oracle 当前支持连接、查询、对象浏览和只读分页；结构编辑、行编辑和转储功能暂不可用。"}</div>}
        {selectedTable && <div className="sql-table-tabs">
          <button className={tableView === "data" ? "active" : ""} onClick={() => setTableView("data")}><LayoutGrid size={13} />数据</button>
          <button className={tableView === "structure" ? "active" : ""} onClick={() => setTableView("structure")}><FileText size={13} />结构</button>
        </div>}
        <div className="sql-table-content">
          {error ? <div className="sql-browser-message error"><AlertCircle size={15} />{error}</div> : busy && !tableData ? <div className="sql-browser-message"><span className="mini-spinner" />正在读取数据表…</div> : !selectedTable ? <div className="sql-browser-message">从左侧选择一个数据表</div> : tableView === "structure" && tableData ? (
            <div className="result-grid-wrap"><table className="result-grid sql-structure-grid"><thead><tr><th>列名</th><th>类型</th><th>长度</th><th>可空</th><th>键</th><th>注释</th><th /></tr></thead><tbody>{structureDraft.map((column, index) => {
              const parsedType = splitSqlType(column.data_type);
              const lengthKind = sqlTypeLengthKind(sqlDriver, parsedType.type) || (parsedType.length ? "custom" : null);
              return <tr key={`${column.original_name || "new"}-${index}`}>
              <td><input className="sql-structure-input" aria-label={`${column.name} 列名`} value={column.name} disabled={!canEditStructure || busy} onChange={(event) => updateStructureColumn(index, { name: event.target.value })} /></td>
              <td><DropdownSelect className="sql-structure-type-select" value={parsedType.type} ariaLabel={`${column.name} 数据类型`} disabled={!canEditStructure || busy} options={sqlTypeChoices(sqlDriver, parsedType.type)} onChange={(value) => changeStructureType(index, column, value)} /></td>
              <td>{lengthKind ? <input className="sql-structure-input sql-structure-length" aria-label={`${column.name} 长度或精度`} value={parsedType.length} disabled={!canEditStructure || busy} spellCheck={false} placeholder={lengthKind === "enum" ? "'a','b'" : lengthKind === "vector" ? "维度" : "长度或精度"} onChange={(event) => changeStructureLength(index, column, event.target.value)} /> : <span className="sql-structure-no-length">—</span>}</td>
              <td><label className="sql-nullable-toggle"><input type="checkbox" checked={column.nullable} disabled={!canEditStructure || busy || column.primary_key} onChange={(event) => updateStructureColumn(index, { nullable: event.target.checked })} /><span>{column.nullable ? "允许" : "禁止"}</span></label></td>
              <td><DropdownSelect className="sql-structure-key-select" value={column.primary_key ? "primary" : "none"} ariaLabel={`${column.name} 键类型`} disabled={!canEditStructure || busy} options={[{ value: "none", label: "无键" }, { value: "primary", label: "主键" }]} onChange={(value) => updateStructureColumn(index, { primary_key: value === "primary" })} /></td>
              <td><input className="sql-structure-input sql-structure-comment" aria-label={`${column.name} 注释`} value={column.comment || ""} disabled={!canEditStructure || busy || sqlDriver === "sqlite"} title={sqlDriver === "sqlite" ? "SQLite 不支持列注释" : undefined} onChange={(event) => updateStructureColumn(index, { comment: event.target.value })} /></td>
              <td><button className="icon-button small danger-button" title={`删除列 ${column.name}`} disabled={!canEditStructure || busy || structureDraft.length <= 1} onClick={() => void removeStructureColumn(index)}><Trash2 size={13} /></button></td>
            </tr>;
            })}
              {!structureDraft.length && <tr><td colSpan={7} className="sql-no-rows">至少保留一列</td></tr>}
            </tbody></table></div>
          ) : tableData ? (
            <div className="result-grid-wrap"><table className="result-grid sql-data-grid"><thead><tr><th className="index-col">#</th>{tableData.columns.map((column) => <th key={column.name}><span>{column.name}{column.primary_key ? "  ◆" : ""}</span><small>{column.data_type || ""}</small></th>)}</tr></thead><tbody>
              {tableData.rows.map((row, rowIndex) => <tr key={rowIndex} className={selectedRow === rowIndex ? "selected" : ""} onClick={() => setSelectedRow(rowIndex)}>
                <td className="row-number">{String((page - 1) * tableData.page_size + rowIndex + 1).padStart(2, "0")}</td>
                {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} className={`${cell === null ? "null-cell" : ""} ${canEditRows && !busy && !String(cell).startsWith("blob:") ? "editable" : ""}`} title={toCell(cell)} onDoubleClick={() => canEditRows && !busy && !String(cell).startsWith("blob:") && setEditingCell({ row: rowIndex, column: cellIndex, value: cell === null ? "" : String(cell) })}>
                  {editingCell?.row === rowIndex && editingCell.column === cellIndex ? <span className="sql-cell-editor"><input autoFocus value={editingCell.value} onChange={(event) => setEditingCell({ ...editingCell, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void saveCell(); if (event.key === "Escape") setEditingCell(null); }} /><button className="icon-button small" title="保存" onClick={(event) => { event.stopPropagation(); void saveCell(); }}><Check size={13} /></button><button className="icon-button small" title="取消" onClick={(event) => { event.stopPropagation(); setEditingCell(null); }}><X size={13} /></button></span> : toCell(cell)}
                </td>)}
              </tr>)}
              {!tableData.rows.length && <tr><td colSpan={tableData.columns.length + 1} className="sql-no-rows">此数据表没有记录</td></tr>}
            </tbody></table></div>
          ) : <div className="sql-browser-message">没有可显示的数据</div>}
        </div>
        <div className="sql-table-footer">
          <span>{tableData ? `${tableData.total_rows.toLocaleString()} 行 · 第 ${page} / ${pageCount} 页` : "就绪"}</span>
          <div><button className="icon-button small" title="上一页" disabled={page <= 1 || busy} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={14} /></button><button className="icon-button small" title="下一页" disabled={page >= pageCount || busy} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><ChevronRight size={14} /></button></div>
        </div>
      </section>
      {contextMenu && <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={() => setContextMenu(null)}
        items={contextMenu.target === "database" ? [
          { label: "命令列界面", icon: <TerminalSquare size={14} />, onSelect: onOpenCommandLine },
          { label: "新建查询", icon: <FileText size={14} />, onSelect: onNewQuery },
          { label: "编辑数据库", icon: <Settings2 size={14} />, disabled: sqlDriverFamily(sqlDriver) !== "postgres" || !(contextMenu.database || selectedDatabase), title: sqlDriverFamily(sqlDriver) !== "postgres" ? "当前数据库类型不支持重命名数据库" : undefined, onSelect: () => setEditingDatabase(contextMenu.database || selectedDatabase) },
          { label: "运行 SQL 文件", icon: <Play size={14} />, disabled: !(contextMenu.database || selectedDatabase), onSelect: () => onRunSqlFile(contextMenu.database || selectedDatabase) },
          { label: "转储 SQL 文件", icon: <FileCode2 size={14} />, disabled: readOnlySqlDriver || !(contextMenu.database || selectedDatabase), children: [
            { label: "结构和数据", icon: <Database size={14} />, disabled: readOnlySqlDriver, onSelect: () => onDumpSqlDatabase(contextMenu.database || selectedDatabase, true) },
            { label: "仅结构", icon: <FileText size={14} />, disabled: readOnlySqlDriver, onSelect: () => onDumpSqlDatabase(contextMenu.database || selectedDatabase, false) },
          ], onSelect: () => undefined },
          { label: "刷新数据库对象", icon: <RefreshCw size={14} />, onSelect: () => setObjectRefreshKey((current) => current + 1) },
          { label: "新建数据库", icon: <Plus size={14} />, disabled: sqlDriver === "sqlite" || readOnlySqlDriver, onSelect: () => setCreateDatabaseOpen(true) },
          { label: `删除数据库 ${contextMenu.database || ""}`.trim(), icon: <Trash2 size={14} />, danger: true, disabled: sqlDriver === "sqlite" || readOnlySqlDriver || !contextMenu.database || ["mysql", "information_schema", "performance_schema", "sys", "postgres", "template0", "template1"].includes(contextMenu.database.toLowerCase()), onSelect: () => void removeDatabase(contextMenu.database) },
        ] : contextMenu.table ? (() => {
          const table = contextMenu.table!;
          const isView = table.kind.toLowerCase().includes("view");
          return [
            { label: "打开数据", icon: <LayoutGrid size={14} />, onSelect: () => { setSelectedTable(table.name); setTableData(null); setPage(1); setTableView("data"); } },
            { label: "设计表", icon: <Settings2 size={14} />, disabled: readOnlySqlDriver, onSelect: () => { setSelectedTable(table.name); setTableData(null); setPage(1); setTableView("structure"); } },
            { label: "刷新", icon: <RefreshCw size={14} />, onSelect: () => { setSelectedTable(table.name); setRefreshKey((current) => current + 1); } },
            ...(!isView ? [
              { label: "清空表", icon: <Trash2 size={14} />, danger: true, disabled: readOnlySqlDriver, onSelect: () => void emptyTable(table) },
              { label: "转储 SQL（结构和数据）", icon: <FileCode2 size={14} />, disabled: readOnlySqlDriver, onSelect: () => void exportTableSql(table, true) },
              { label: "转储 SQL（仅结构）", icon: <FileText size={14} />, disabled: readOnlySqlDriver, onSelect: () => void exportTableSql(table, false) },
            ] : []),
            { label: isView ? "删除视图" : "删除表", icon: <Trash2 size={14} />, danger: true, disabled: readOnlySqlDriver, onSelect: () => void removeTable(table) },
          ];
        })() : []}
      />}
      {createDatabaseOpen && <TextPromptDialog
        title="新建数据库"
        label="数据库名称"
        onCancel={() => setCreateDatabaseOpen(false)}
        onSubmit={createDatabase}
        busy={databaseBusy}
      />}
      {editingDatabase && <TextPromptDialog
        title="编辑数据库"
        label="数据库名称"
        initialValue={editingDatabase}
        onCancel={() => setEditingDatabase(null)}
        onSubmit={saveDatabaseName}
      />}
      {newRowOpen && tableData && <div className="sql-row-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewRowOpen(false); }}>
        <form className="sql-row-dialog" onSubmit={(event) => void submitNewRow(event)}>
          <div className="sql-row-dialog-heading"><div><b>新增数据行</b><span>{selectedTable}</span></div><button type="button" className="icon-button small" title="关闭" onClick={() => setNewRowOpen(false)}><X size={15} /></button></div>
          <div className="sql-row-fields">{tableData.columns.map((column) => <label key={column.name}><span>{column.name}{!column.nullable && !column.primary_key ? <i> · 必填</i> : null}<small>{column.data_type}{column.primary_key ? " · 主键" : ""}</small></span><input value={newRowValues[column.name] ?? ""} placeholder={column.primary_key ? "留空则使用数据库生成值" : column.nullable ? "留空则使用默认值或 NULL" : "输入值"} onChange={(event) => setNewRowValues((current) => ({ ...current, [column.name]: event.target.value }))} /></label>)}</div>
          <div className="sql-row-dialog-footer"><button type="button" className="secondary-button" onClick={() => setNewRowOpen(false)}>取消</button><button type="submit" className="primary-button"><Plus size={14} />新增</button></div>
        </form>
      </div>}
    </div>
  );
}

function RedisDataBrowser({
  connection,
  database,
  databaseOptions,
  onDatabaseChange,
  notify,
  confirmInApp,
  onAiKeyControl,
}: {
  connection: Connection;
  database: number;
  databaseOptions: number[];
  onDatabaseChange: (database: number) => void;
  notify: (kind: Toast["kind"], message: string) => void;
  confirmInApp: (title: string, message: string, confirmLabel?: string, destructive?: boolean) => Promise<boolean>;
  onAiKeyControl: (context: string) => void;
}) {
  const [keys, setKeys] = useState<RedisKeyInfo[]>([]);
  const [selected, setSelected] = useState<RedisKeyDetail | null>(null);
  const [pattern, setPattern] = useState("*");
  const [scanCursor, setScanCursor] = useState(0);
  const [currentCursor, setCurrentCursor] = useState(0);
  const [previousCursors, setPreviousCursors] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKey, setEditorKey] = useState("");
  const [editorKeyToken, setEditorKeyToken] = useState<string | undefined>();
  const [editorValue, setEditorValue] = useState("");
  const [editorTtl, setEditorTtl] = useState("");
  const scanRequestRef = useRef(0);
  async function loadKeys(cursor = 0, reset = true) {
    const requestId = ++scanRequestRef.current;
    setBusy(true);
    setError(null);
    try {
      let result = await scanRedisKeys(connection.id, pattern || "*", cursor, 200, database);
      let loaded = result.keys;
      if (reset) {
        const seen = new Set<number>([cursor]);
        while (result.cursor !== 0 && !seen.has(result.cursor)) {
          if (requestId !== scanRequestRef.current) return;
          seen.add(result.cursor);
          result = await scanRedisKeys(connection.id, pattern || "*", result.cursor, 200, database);
          loaded = [...loaded, ...result.keys];
        }
      }
      if (requestId !== scanRequestRef.current) return;
      const uniqueKeys = [...new Map(loaded.map((item) => [item.keyToken, item])).values()];
      setKeys(uniqueKeys);
      setScanCursor(reset ? 0 : result.cursor);
      setCurrentCursor(cursor);
      if (reset) setPreviousCursors([]);
      if (selected && !uniqueKeys.some((item) => item.keyToken === selected.keyToken)) setSelected(null);
    } catch (reason) {
      if (requestId !== scanRequestRef.current) return;
      setKeys([]);
      setError(String(reason));
    } finally {
      if (requestId === scanRequestRef.current) setBusy(false);
    }
  }

  useEffect(() => {
    void loadKeys();
    return () => { scanRequestRef.current += 1; };
  }, [connection.id, database]);

  async function openKey(key: string, keyToken?: string) {
    try {
      setSelected(await getRedisKeyDetail(connection.id, key, database, keyToken));
    } catch (reason) {
      notify("error", String(reason));
    }
  }

  function openEditor(item?: RedisKeyDetail) {
    setEditorKey(item?.key || "");
    setEditorKeyToken(item?.keyToken);
    setEditorValue(item?.kind === "string" ? item.value : "");
    setEditorTtl(item && item.ttl > 0 ? String(item.ttl) : "");
    setEditorOpen(true);
  }

  async function saveString(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const ttl = editorTtl.trim() ? Number(editorTtl) : undefined;
      if (ttl !== undefined && (!Number.isSafeInteger(ttl) || ttl < 1)) throw new Error("过期时间必须是正整数秒");
      await setRedisString(connection.id, editorKey.trim(), editorValue, ttl, database, editorKeyToken);
      setEditorOpen(false);
      await loadKeys();
      await openKey(editorKey.trim(), editorKeyToken);
      notify("success", "Redis 字符串已保存");
    } catch (reason) {
      notify("error", String(reason));
    }
  }

  async function removeKey() {
    if (!selected) return;
    const accepted = await confirmInApp("删除 Redis 键", `确定删除键“${selected.key}”吗？此操作无法撤销。`, "删除键", true);
    if (!accepted) return;
    try {
      await deleteRedisKey(connection.id, selected.key, database, selected.keyToken);
      setSelected(null);
      await loadKeys();
      notify("success", "Redis 键已删除");
    } catch (reason) {
      notify("error", String(reason));
    }
  }

  return (
    <div className="redis-browser">
      <aside className="redis-key-sidebar">
        <div className="redis-browser-toolbar"><b>键</b><DropdownSelect className="redis-database-select" value={String(database)} ariaLabel="Redis 数据库" options={databaseOptions.map((item) => ({ value: String(item), label: `DB ${item}` }))} onChange={(value) => { setSelected(null); setEditorOpen(false); setPreviousCursors([]); onDatabaseChange(Number(value)); }} /><button className="icon-button small" title="刷新键" onClick={() => void loadKeys()}><RefreshCw size={13} /></button></div>
        <form className="redis-pattern-form" onSubmit={(event) => { event.preventDefault(); void loadKeys(); }}><input aria-label="键名模式" value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="键名模式，例如 cache:*" /><button className="icon-button small" title="搜索键"><Search size={13} /></button></form>
        <div className="redis-key-list">
          {keys.map((item) => <button key={item.keyToken} className={selected?.keyToken === item.keyToken ? "active" : ""} onClick={() => void openKey(item.key, item.keyToken)}><span className="redis-key-type">{item.kind.slice(0, 1).toUpperCase()}</span><span className="redis-key-name">{item.key}</span><small>{item.kind}</small></button>)}
          {!keys.length && <div className="sql-object-empty">{busy ? "扫描键中…" : error || "没有匹配的键"}</div>}
        </div>
        <div className="redis-scan-footer"><button className="secondary-button" disabled={!previousCursors.length || busy} onClick={() => { const history = [...previousCursors]; const cursor = history.pop() ?? 0; setPreviousCursors(history); void loadKeys(cursor, false); }}>上一批</button><button className="secondary-button" disabled={!scanCursor || busy} onClick={() => { setPreviousCursors((history) => [...history, currentCursor]); void loadKeys(scanCursor, false); }}>下一批</button></div>
      </aside>
      <section className="redis-value-panel">
        <div className="redis-browser-toolbar"><div>{selected ? <><b>{selected.key}</b><span className="redis-type-badge">{selected.kind}</span></> : <b>选择 Redis 键</b>}</div><div className="redis-key-actions"><button className="secondary-button ai-entry-button" title="让 AI 协助管理当前 Redis 键" disabled={!selected} onClick={() => selected && onAiKeyControl(`Redis 数据库：DB ${database}\n键名：${selected.key}\n类型：${selected.kind}\nTTL：${selected.ttl === -1 ? "永不过期" : selected.ttl === -2 ? "键不存在" : `${selected.ttl} 秒`}\n\n不要发送键值内容。`)}><Bot size={13} />AI 助手</button><button className="icon-button small" title="新增字符串键" onClick={() => openEditor()}><Plus size={15} /></button><button className="icon-button small" title="编辑字符串键" disabled={selected?.kind !== "string"} onClick={() => selected && openEditor(selected)}><Settings2 size={14} /></button><button className="icon-button small danger-button" title="删除键" disabled={!selected} onClick={() => void removeKey()}><Trash2 size={14} /></button></div></div>
        {selected ? <><div className="redis-key-metadata"><span>类型 <b>{selected.kind}</b></span><span>TTL <b>{selected.ttl === -1 ? "永不过期" : selected.ttl === -2 ? "键不存在" : `${selected.ttl} 秒`}</b></span></div><pre className="redis-value-content">{selected.value}</pre></> : <div className="sql-browser-message">从左侧选择一个键以查看值</div>}
      </section>
      {editorOpen && <div className="sql-row-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}><form className="sql-row-dialog redis-value-dialog" onSubmit={(event) => void saveString(event)}><div className="sql-row-dialog-heading"><div><b>{editorKey ? "编辑字符串" : "新增字符串键"}</b><span>Redis String</span></div><button type="button" className="icon-button small" title="关闭" onClick={() => setEditorOpen(false)}><X size={15} /></button></div><div className="redis-value-fields"><label>键名<input required value={editorKey} onChange={(event) => setEditorKey(event.target.value)} /></label><label>过期时间（秒）<input inputMode="numeric" value={editorTtl} onChange={(event) => setEditorTtl(event.target.value)} placeholder="留空表示永不过期" /></label><label>值<textarea required value={editorValue} onChange={(event) => setEditorValue(event.target.value)} /></label></div><div className="sql-row-dialog-footer"><button type="button" className="secondary-button" onClick={() => setEditorOpen(false)}>取消</button><button type="submit" className="primary-button"><Check size={14} />保存</button></div></form></div>}
    </div>
  );
}

function MongoDataBrowser({
  connection,
  notify,
  confirmInApp,
  onAiCollectionControl,
}: {
  connection: Connection;
  notify: (kind: Toast["kind"], message: string) => void;
  confirmInApp: (title: string, message: string, confirmLabel?: string, destructive?: boolean) => Promise<boolean>;
  onAiCollectionControl: (context: string) => void;
}) {
  const [databases, setDatabases] = useState<{ name: string }[]>([]);
  const [database, setDatabase] = useState(connection.database || "");
  const [collections, setCollections] = useState<{ name: string }[]>([]);
  const [collection, setCollection] = useState("");
  const [documents, setDocuments] = useState<MongoDocumentRow[]>([]);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [selected, setSelected] = useState<MongoDocumentRow | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editorMode, setEditorMode] = useState<"insert" | "replace" | null>(null);
  const [editorValue, setEditorValue] = useState("{\n  \n}");

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    void listMongoDatabases(connection.id).then((items) => {
      if (cancelled) return;
      setDatabases(items);
      const configured = connection.database || "";
      setDatabase((current) => items.some((item) => item.name === current) ? current : items.some((item) => item.name === configured) ? configured : items[0]?.name || "");
    }).catch((reason) => { if (!cancelled) setError(String(reason)); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [connection.id]);

  useEffect(() => {
    if (!database) return;
    let cancelled = false;
    setCollections([]);
    setCollection("");
    setDocuments([]);
    setDocumentTotal(0);
    setSelected(null);
    setBusy(true);
    setError(null);
    void listMongoCollections(connection.id, database).then((items) => {
      if (!cancelled) {
        setCollections(items);
        setCollection((current) => items.some((item) => item.name === current) ? current : items[0]?.name || "");
      }
    }).catch((reason) => { if (!cancelled) setError(String(reason)); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [connection.id, database]);

  useEffect(() => {
    if (!database || !collection) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void getMongoDocuments(connection.id, database, collection, page, 50).then((result) => {
      if (cancelled) return;
      setDocuments(result.documents);
      setDocumentTotal(result.total);
      const lastPage = Math.max(1, Math.ceil(result.total / result.page_size));
      if (page > lastPage) setPage(lastPage);
      if (selected) setSelected(result.documents.find((item) => item.id === selected.id) || null);
    }).catch((reason) => { if (!cancelled) { setDocuments([]); setSelected(null); setError(String(reason)); } }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [connection.id, database, collection, page, refreshKey]);

  function openInsert() {
    setEditorValue("{\n  \n}");
    setEditorMode("insert");
  }

  function openReplace() {
    if (!selected) return;
    setEditorValue(selected.document);
    setEditorMode("replace");
  }

  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const parsed = JSON.parse(editorValue) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("文档内容必须是 JSON 对象");
      if (editorMode === "insert") {
        await insertMongoDocument(connection.id, database, collection, editorValue);
        setPage(1);
      } else if (selected) {
        await replaceMongoDocument(connection.id, database, collection, selected.id, editorValue);
      }
      setEditorMode(null);
      setRefreshKey((current) => current + 1);
      notify("success", editorMode === "insert" ? "MongoDB 文档已新增" : "MongoDB 文档已更新");
    } catch (reason) {
      notify("error", String(reason));
    }
  }

  async function removeDocument() {
    if (!selected) return;
    const accepted = await confirmInApp("删除 MongoDB 文档", "确定删除选中的文档吗？此操作无法撤销。", "删除文档", true);
    if (!accepted) return;
    try {
      await deleteMongoDocument(connection.id, database, collection, selected.id);
      setSelected(null);
      setRefreshKey((current) => current + 1);
      notify("success", "MongoDB 文档已删除");
    } catch (reason) {
      notify("error", String(reason));
    }
  }

  const selectedDocumentShape = (() => {
    try {
      const document = documents[0] ? JSON.parse(documents[0].document) as Record<string, unknown> : null;
      return document ? Object.entries(document).map(([key, value]) => `- ${key}: ${Array.isArray(value) ? "array" : value === null ? "null" : typeof value}`).join("\n") : "未读取文档样本";
    } catch {
      return "未读取文档样本";
    }
  })();

  return (
    <div className="mongo-browser">
      <aside className="mongo-object-sidebar">
        <div className="sql-object-toolbar"><span><Database size={14} />数据库对象</span><button className="icon-button small" title="刷新对象" onClick={() => setRefreshKey((current) => current + 1)}><RefreshCw size={13} /></button></div>
        <label className="sql-database-select"><span>数据库</span><DropdownSelect className="sql-object-dropdown" value={database} ariaLabel="数据库" placeholder={busy ? "正在读取…" : "无可用数据库"} disabled={!databases.length} options={databases.map((item) => ({ value: item.name, label: item.name }))} onChange={(value) => { setDatabase(value); setPage(1); }} /></label>
        <div className="sql-object-list-heading">集合 <span>{collections.length}</span></div>
        <div className="sql-object-list">{collections.map((item) => <button key={item.name} className={collection === item.name ? "active" : ""} onClick={() => { setCollection(item.name); setDocuments([]); setSelected(null); setDocumentTotal(0); setPage(1); }}><ChevronRight size={13} /><span>{item.name}</span><small>集合</small></button>)}{!collections.length && <div className="sql-object-empty">{busy ? "读取集合中…" : error || "当前数据库没有集合"}</div>}</div>
      </aside>
      <section className="mongo-document-panel">
        <div className="sql-table-toolbar"><div className="sql-table-title"><b>{collection || "选择集合"}</b><span>{documentTotal.toLocaleString()} 文档</span></div><div className="sql-table-actions"><button className="secondary-button ai-entry-button" title="让 AI 协助管理当前集合" disabled={!collection || busy} onClick={() => onAiCollectionControl(`MongoDB 数据库：${database}\n集合：${collection}\n字段结构（仅字段名和类型，不含记录值）：\n${selectedDocumentShape}\n\n请按 MongoDB JSON 命令格式提出可审核的操作。`)}><Bot size={13} />AI 助手</button><button className="icon-button small" title="刷新文档" disabled={!collection || busy} onClick={() => setRefreshKey((current) => current + 1)}><RefreshCw size={14} /></button><span className="toolbar-divider" /><button className="icon-button small" title="新增文档" disabled={!collection || busy} onClick={openInsert}><Plus size={15} /></button><button className="icon-button small" title="编辑文档" disabled={!selected || busy} onClick={openReplace}><Settings2 size={14} /></button><button className="icon-button small danger-button" title="删除文档" disabled={!selected || busy} onClick={() => void removeDocument()}><Trash2 size={14} /></button></div></div>
        <div className="mongo-document-content"><div className="mongo-document-list">{documents.map((document, index) => <button key={document.id} className={selected?.id === document.id ? "active" : ""} onClick={() => setSelected(document)}><span>{String((page - 1) * 50 + index + 1).padStart(2, "0")}</span><code>{document.id}</code><small>{document.document.slice(0, 180).replace(/\s+/g, " ")}</small></button>)}{!documents.length && <div className="sql-browser-message">{busy ? "读取文档中…" : error || "当前集合没有文档"}</div>}</div>{selected ? <pre className="mongo-document-json">{selected.document}</pre> : <div className="sql-browser-message">选择文档以查看 JSON 内容</div>}</div>
        <div className="sql-table-footer"><span>{documentTotal.toLocaleString()} 文档 · 第 {page} 页</span><div><button className="icon-button small" title="上一页" disabled={page <= 1 || busy} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={14} /></button><button className="icon-button small" title="下一页" disabled={page * 50 >= documentTotal || busy} onClick={() => setPage((current) => current + 1)}><ChevronRight size={14} /></button></div></div>
      </section>
      {editorMode && <div className="sql-row-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorMode(null); }}><form className="sql-row-dialog mongo-document-dialog" onSubmit={(event) => void saveDocument(event)}><div className="sql-row-dialog-heading"><div><b>{editorMode === "insert" ? "新增 MongoDB 文档" : "编辑 MongoDB 文档"}</b><span>{database}.{collection}</span></div><button type="button" className="icon-button small" title="关闭" onClick={() => setEditorMode(null)}><X size={15} /></button></div><textarea spellCheck={false} value={editorValue} onChange={(event) => setEditorValue(event.target.value)} aria-label="MongoDB JSON 文档" /><div className="sql-row-dialog-footer"><button type="button" className="secondary-button" onClick={() => setEditorMode(null)}>取消</button><button type="submit" className="primary-button"><Check size={14} />保存</button></div></form></div>}
    </div>
  );
}

function ConnectionWorkspace({
  connection,
  theme,
  search,
  aiSessionId,
  reachable,
  connecting,
  query,
  setQuery,
  result,
  setResult,
  runQuery,
  redisCommand,
  setRedisCommand,
  redisOutput,
  setRedisOutput,
  runRedis,
  onConnect,
  onEdit,
  onDelete,
  notify,
  confirmInApp,
  onAiAssistantClose,
  onAiSessionReset,
  aiConversationToOpen,
  onAiConversationOpened,
  pendingSqlSnippet,
  onSqlSnippetOpened,
  onSaveSqlSnippet,
}: {
  connection: Connection;
  theme: Theme;
  search: string;
  aiSessionId?: string;
  reachable?: number;
  connecting: boolean;
  query: string;
  setQuery: (value: string) => void;
  result: QueryResult | null;
  setResult: (value: QueryResult | null) => void;
  runQuery: (database?: string, parameters?: SqlParameter[]) => void;
  redisCommand: string;
  setRedisCommand: (value: string) => void;
  redisOutput: string | null;
  setRedisOutput: (value: string | null) => void;
  runRedis: (database?: number) => void;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  notify: (kind: Toast["kind"], message: string) => void;
  confirmInApp: (title: string, message: string, confirmLabel?: string, destructive?: boolean) => Promise<boolean>;
  onAiAssistantClose: () => void;
  onAiSessionReset: () => void;
  aiConversationToOpen: AiConversation | null;
  onAiConversationOpened: () => void;
  pendingSqlSnippet: SqlSnippet | null;
  onSqlSnippetOpened: () => void;
  onSaveSqlSnippet: (sqlText?: string) => void;
}) {
  const isSql = connection.kind === "sql";
  const isRedis = connection.kind === "redis";
  const isMongo = connection.kind === "mongo";
  const isDocker = connection.kind === "docker";
  const isFile = connection.kind === "ftp" || connection.kind === "sftp";
  const isRemoteFile = isFile || connection.kind === "ssh";
  const [sqlView, setSqlView] = useState<"browse" | "query">("browse");
  const [aiAssistantMode, setAiAssistantMode] = useState<AiPromptKey | null>(null);
  const [aiAssistantContext, setAiAssistantContext] = useState("");
  const [aiAssistantInitialMessage, setAiAssistantInitialMessage] = useState("");
  const [restoredAiConversation, setRestoredAiConversation] = useState<AiConversation | null>(null);
  const [sqlDatabase, setSqlDatabase] = useState(connection.database || "");
  const [sqlDatabases, setSqlDatabases] = useState<{ name: string }[]>([]);
  const [sqlResultTab, setSqlResultTab] = useState<"results" | "messages">("results");
  const mysqlPlaceholderCount = isSql && sqlDriverFamily(connection.sqlDriver || "mysql") === "mysql" ? countMysqlParameters(query) : 0;
  const [sqlParameters, setSqlParameters] = useState<SqlParameter[]>(() => Array.from({ length: mysqlPlaceholderCount }, () => ({ kind: "text", value: "", configured: false })));
  useEffect(() => {
    setSqlParameters((current) => Array.from({ length: mysqlPlaceholderCount }, (_, index) => current[index] || { kind: "text", value: "", configured: false }));
  }, [mysqlPlaceholderCount]);
  useEffect(() => {
    setSqlParameters(Array.from({ length: mysqlPlaceholderCount }, () => ({ kind: "text", value: "", configured: false })));
  }, [connection.id]);
  const [redisView, setRedisView] = useState<"browse" | "command">("browse");
  const [redisDatabase, setRedisDatabase] = useState(connection.redisDb ?? 0);
  const [redisDatabases, setRedisDatabases] = useState<number[]>(Array.from({ length: 16 }, (_, index) => index));
  const [mongoView, setMongoView] = useState<"browse" | "command">("browse");
  const [jsonCommand, setJsonCommand] = useState('{\n  "ping": 1\n}');
  const [mongoOutput, setMongoOutput] = useState<string | null>(null);
  const terminalHostRef = useRef<HTMLDivElement>(null);
  const sshManagerRef = useRef<HTMLDivElement>(null);
  const sshFilesPanelRef = useRef<HTMLElement>(null);
  const sshResizePointerRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [sshFilesWidth, setSshFilesWidth] = useState<number | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const terminalSearchRef = useRef<SearchAddon | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const terminalCloseRequestedRef = useRef(false);
  const [terminalStatus, setTerminalStatus] = useState<"disconnected" | "connecting" | "connected" | "closed">("disconnected");
  const [terminalGeneration, setTerminalGeneration] = useState(0);
  const [terminalSearchOpen, setTerminalSearchOpen] = useState(false);
  const [terminalSearch, setTerminalSearch] = useState("");
  const [remotePath, setRemotePath] = useState("/");
  const [remotePathDraft, setRemotePathDraft] = useState("/");
  const [remotePathHistory, setRemotePathHistory] = useState<string[]>([]);
  const remotePathHistoryRef = useRef<string[]>([]);
  const [remoteEntries, setRemoteEntries] = useState<FileEntry[]>([]);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteTransfer, setRemoteTransfer] = useState<RemoteTransfer | null>(null);
  const [remoteEditorEntry, setRemoteEditorEntry] = useState<FileEntry | null>(null);
  const [remoteEditorText, setRemoteEditorText] = useState<string | null>(null);
  const [remoteEditorOriginal, setRemoteEditorOriginal] = useState<string | null>(null);
  const [remoteEditorBusy, setRemoteEditorBusy] = useState(false);
  const [remoteEditorSaving, setRemoteEditorSaving] = useState(false);
  const [remoteEditorError, setRemoteEditorError] = useState<string | null>(null);
  const remoteEditorRequestRef = useRef(0);
  const [sshMonitorError, setSshMonitorError] = useState<string | null>(null);
  const [sshMonitorDrawerOpen, setSshMonitorDrawerOpen] = useState(false);
  const [sshMonitorRange, setSshMonitorRange] = useState<SshMonitorRange>("30m");
  const [sshMonitorHistory, setSshMonitorHistory] = useState<SshMonitorHistoryPoint[]>([]);
  const [sshMonitorHistoryBusy, setSshMonitorHistoryBusy] = useState(false);
  const [sshMonitorHistoryError, setSshMonitorHistoryError] = useState<string | null>(null);
  const [sshMonitorLivePoints, setSshMonitorLivePoints] = useState<SshMonitorHistoryPoint[]>([]);
  const [sshMonitorDiskSelection, setSshMonitorDiskSelection] = useState("*");
  const [sshMonitorNetworkSelection, setSshMonitorNetworkSelection] = useState("*");
  const sshMonitorLivePointsRef = useRef<SshMonitorHistoryPoint[]>([]);
  const sshMonitorLastPersistedRef = useRef(0);
  const sshMonitorPreviousRef = useRef<{ snapshot: SshMonitorSnapshot; sampledAt: number } | null>(null);

  useEffect(() => {
    if (!aiConversationToOpen) return;
    setRestoredAiConversation(aiConversationToOpen);
    setAiAssistantMode(aiConversationToOpen.mode);
    setAiAssistantContext(aiConversationToOpen.context);
    setAiAssistantInitialMessage("");
    onAiConversationOpened();
  }, [aiConversationToOpen?.id]);

  function openAiAssistant(mode: AiPromptKey, context: string, initialMessage = "") {
    const existing = aiSessionId
      ? readAiConversations()
        .filter((conversation) => conversation.connectionId === connection.id && conversation.sessionId === aiSessionId && conversation.mode === mode)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
      : undefined;
    setRestoredAiConversation(existing || null);
    setAiAssistantContext(context);
    setAiAssistantInitialMessage(existing ? "" : initialMessage);
    setAiAssistantMode(mode);
  }

  function closeAiAssistant() {
    onAiAssistantClose();
    setAiAssistantMode(null);
    setRestoredAiConversation(null);
  }

  async function executeAiSuggestedSshCommand(command: string, _assistantText = "", onExecutionStart?: () => void) {
    const destructive = /\b(rm|mkfs|dd|shutdown|reboot|poweroff|userdel|iptables|ufw|chmod|chown)\b|\bDROP\s+(DATABASE|TABLE)|\bTRUNCATE\b/i.test(command);
    const accepted = await confirmInApp(
      "执行 AI 建议的服务器命令",
      `目标：${connection.username ? `${connection.username}@` : ""}${connection.host}:${connection.port || 22}\n\n命令：\n${command}\n\n此命令将通过 SSH 在远端执行，请先核对命令和目标。`,
      "确认执行",
      destructive,
    );
    if (!accepted) return "用户取消了命令执行。";
    onExecutionStart?.();
    const result = await withTimeout(
      executeSsh(connection.id, command),
      30_000,
      "SSH 命令执行超时（30 秒），请检查服务器连接或命令是否仍在运行",
    );
    return result.output || "（命令没有输出）";
  }

  async function executeAiSuggestedDatabaseCommand(command: string, assistantText = "", onExecutionStart?: () => void, onQueryResult?: (result: QueryResult) => void) {
    const driver = isSql ? sqlDriverFamily(connection.sqlDriver || "mysql") : "";
    const placeholderCount = isSql && driver === "mysql" ? countMysqlParameters(command) : 0;
    const parameters = placeholderCount > 0 ? extractAiSqlParameters(assistantText, placeholderCount) : [];
    if (placeholderCount > 0 && (!parameters || parameters.length !== placeholderCount)) {
      throw new Error(`AI 建议 SQL 包含 ${placeholderCount} 个 ? 参数，但未能完整识别参数值。请在 SQL 查询页的参数面板中填写后再执行。`);
    }
    const parameterSummary = parameters?.length
      ? `\n绑定参数：\n${parameters.map((parameter, index) => `?${index + 1} · ${parameter.kind === "null" ? "NULL" : parameter.kind === "boolean" ? "布尔值" : parameter.kind === "number" ? "数字" : "文本"} · ${parameter.kind === "null" ? "NULL" : parameter.value}`).join("\n")}`
      : "";
    const dangerous = /\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT|ALTER|FLUSH|CONFIG|DEL|UNLINK|EVAL|REMOVE|REPLACE|DELETEONE|DELETEMANY|UPDATEONE|UPDATEMANY|DROPCOLLECTION|DROPDATABASE|FLUSHDB|FLUSHALL)\b/i.test(command);
    const accepted = await confirmInApp(
      "执行 AI 建议的数据库操作",
      `目标：${connection.name}\n数据库：${isSql ? sqlDatabase || "未选择" : isRedis ? `Redis DB ${redisDatabase}` : connection.database || "admin"}\n\n操作内容：\n${command}${parameterSummary}\n\n请确认目标和内容后再执行。`,
      "确认执行",
      dangerous,
    );
    if (!accepted) return "用户取消了数据库操作。";
    onExecutionStart?.();
    if (reachable === undefined) throw new Error("请先连接当前数据库");
    if (isSql) {
      const response = await withTimeout(
        executeSql(connection.id, command, sqlDatabase || undefined, parameters || []),
        30_000,
        "SQL 执行超时（30 秒），请检查查询条件、参数或服务器状态",
      );
      setResult(response);
      setSqlView("query");
      onQueryResult?.(response);
      return formatAiQueryResult(response);
    }
    if (isRedis) {
      const response = await withTimeout(
        executeRedis(connection.id, command, redisDatabase),
        30_000,
        "Redis 命令执行超时（30 秒），请检查服务器状态",
      );
      setRedisOutput(typeof response === "string" ? response : JSON.stringify(response, null, 2));
      setRedisView("command");
      return typeof response === "string" ? response : JSON.stringify(response, null, 2);
    }
    const response = await withTimeout(
      executeMongo(connection.id, command),
      30_000,
      "MongoDB 命令执行超时（30 秒），请检查服务器状态",
    );
    setMongoOutput(JSON.stringify(response, null, 2));
    setMongoView("command");
    return JSON.stringify(response, null, 2);
  }

  function startSshResize(event: ReactPointerEvent<HTMLDivElement>) {
    const width = sshFilesPanelRef.current?.getBoundingClientRect().width;
    if (!width) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sshResizePointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
    };
  }

  function moveSshResize(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = sshResizePointerRef.current;
    const bounds = sshManagerRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !bounds) return;
    const maxWidth = Math.max(190, bounds.width - 228);
    const nextWidth = Math.min(maxWidth, Math.max(190, drag.startWidth + event.clientX - drag.startX));
    setSshFilesWidth(nextWidth);
  }

  function endSshResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (sshResizePointerRef.current?.pointerId !== event.pointerId) return;
    sshResizePointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resizeSshWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const bounds = sshManagerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const currentWidth = sshFilesPanelRef.current?.getBoundingClientRect().width ?? bounds.width * 0.34;
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    setSshFilesWidth(Math.min(bounds.width - 228, Math.max(190, currentWidth + direction * 16)));
  }

  useEffect(() => {
    setSshMonitorDrawerOpen(false);
    setSshMonitorRange("30m");
    setSshMonitorHistory([]);
    setSshMonitorHistoryBusy(false);
    setSshMonitorHistoryError(null);
    setSshMonitorError(null);
    setSshMonitorDiskSelection("*");
    setSshMonitorNetworkSelection("*");
  }, [connection.id]);

  useEffect(() => {
    setSqlView("browse");
    setRedisView("browse");
    setRedisDatabase(connection.redisDb ?? 0);
    setMongoView("browse");
    setSqlDatabase(connection.database || "");
    setQuery("");
    setResult(null);
    setSqlResultTab("results");
    remoteEditorRequestRef.current += 1;
    setRemoteEditorEntry(null);
    setRemoteEditorText(null);
    setRemoteEditorOriginal(null);
    setRemoteEditorError(null);
    setRemoteEditorBusy(false);
    setRemoteEditorSaving(false);
  }, [connection.id]);

  useEffect(() => {
    if (!pendingSqlSnippet || connection.kind !== "sql" || pendingSqlSnippet.connectionId !== connection.id) return;
    setQuery(pendingSqlSnippet.sqlText);
    setResult(null);
    setSqlView("query");
    setSqlResultTab("results");
    onSqlSnippetOpened();
  }, [pendingSqlSnippet?.id, connection.id]);

  useEffect(() => {
    if (!isRedis || reachable === undefined) {
      setRedisDatabases(Array.from({ length: 16 }, (_, index) => index));
      return;
    }
    let cancelled = false;
    void listRedisDatabases(connection.id).then((items) => {
      if (cancelled || !items.length) return;
      setRedisDatabases(items);
      if (!items.includes(redisDatabase)) setRedisDatabase(items[0]);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [connection.id, isRedis, reachable]);

  useEffect(() => {
    if (!isSql || reachable === undefined) {
      setSqlDatabases([]);
      return;
    }
    let cancelled = false;
    void listSqlDatabases(connection.id).then((items) => {
      if (cancelled) return;
      setSqlDatabases(items);
      setSqlDatabase((current) => items.some((item) => item.name === current)
        ? current
        : items.some((item) => item.name === connection.database)
          ? connection.database || ""
          : items[0]?.name || "");
    }).catch(() => {
      if (!cancelled) setSqlDatabases([]);
    });
    return () => { cancelled = true; };
  }, [connection.id, isSql, reachable]);

  const remotePathHistoryKey = `orangehub.remote-path-history.${connection.id}`;

  function rememberRemotePath(path: string) {
    const normalized = path.trim();
    if (!normalized) return;
    const next = [normalized, ...remotePathHistoryRef.current.filter((item) => item !== normalized)].slice(0, 20);
    remotePathHistoryRef.current = next;
    setRemotePathHistory(next);
    try {
      window.localStorage.setItem(remotePathHistoryKey, JSON.stringify(next));
    } catch {
      // Path history remains available for the current workspace session.
    }
  }

  async function refreshRemoteDirectory(path = remotePath) {
    if (!isRemoteFile) return false;
    const requestedPath = path.trim() || (connection.kind === "ftp" ? "/" : ".");
    setRemoteBusy(true);
    setRemoteError(null);
    try {
      setRemoteEntries(await remoteList(connection.id, requestedPath));
      setRemotePath(requestedPath);
      setRemotePathDraft(requestedPath);
      rememberRemotePath(requestedPath);
      return true;
    } catch (error) {
      setRemoteError(String(error));
      return false;
    } finally {
      setRemoteBusy(false);
    }
  }

  useEffect(() => {
    setRemoteEntries([]);
    setRemoteError(null);
    const initialPath = connection.kind === "ftp" ? "/" : ".";
    setRemotePath(initialPath);
    setRemotePathDraft(initialPath);
    try {
      const storedHistory = window.localStorage.getItem(remotePathHistoryKey);
      const parsedHistory: unknown = storedHistory ? JSON.parse(storedHistory) : [];
      const history = Array.isArray(parsedHistory)
        ? parsedHistory.filter((item): item is string => typeof item === "string").slice(0, 20)
        : [];
      remotePathHistoryRef.current = history;
      setRemotePathHistory(history);
    } catch {
      remotePathHistoryRef.current = [];
      setRemotePathHistory([]);
    }
    if (isRemoteFile && reachable !== undefined) {
      void refreshRemoteDirectory(initialPath);
    }
  }, [connection.id, connection.kind, reachable]);

  useEffect(() => {
    sshMonitorPreviousRef.current = null;
    sshMonitorLastPersistedRef.current = 0;
    sshMonitorLivePointsRef.current = [];
    setSshMonitorLivePoints([]);
    if (connection.kind !== "ssh" || reachable === undefined || !isNative) {
      setSshMonitorError(null);
      return;
    }
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const snapshot = await getSshMonitor(connection.id);
        if (cancelled) return;
        const sampledAt = Date.now();
        const previous = sshMonitorPreviousRef.current;
        const elapsedSeconds = previous ? Math.max((sampledAt - previous.sampledAt) / 1000, 0.1) : 0;
        const rate = (current: number | null | undefined, old: number | null | undefined) =>
          previous && current != null && old != null && current >= old
            ? (current - old) / elapsedSeconds
            : null;
        let cpuPercent: number | null = null;
        if (previous && snapshot.cpuTotal !== null && snapshot.cpuIdle !== null
          && previous.snapshot.cpuTotal !== null && previous.snapshot.cpuIdle !== null) {
          const totalDelta = snapshot.cpuTotal - previous.snapshot.cpuTotal;
          const idleDelta = snapshot.cpuIdle - previous.snapshot.cpuIdle;
          if (totalDelta > 0) cpuPercent = Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
        }
        const previousDisks = new Map((previous?.snapshot.diskDevices ?? []).map((device) => [device.name, device]));
        const previousNetworks = new Map((previous?.snapshot.networkDevices ?? []).map((device) => [device.name, device]));
        const memoryTotalBytes = snapshot.memoryTotalBytes;
        const memoryUsedBytes = memoryTotalBytes !== null && snapshot.memoryAvailableBytes !== null
          ? Math.max(0, memoryTotalBytes - snapshot.memoryAvailableBytes)
          : null;
        const point: SshMonitorHistoryPoint = {
          sampledAt,
          cpuPercent,
          memoryUsedBytes,
          memoryTotalBytes,
          diskRates: snapshot.diskDevices.map((device) => {
            const old = previousDisks.get(device.name);
            return {
              name: device.name,
              readBytesPerSecond: rate(device.readBytes, old?.readBytes),
              writeBytesPerSecond: rate(device.writeBytes, old?.writeBytes),
            };
          }),
          networkRates: snapshot.networkDevices.map((device) => {
            const old = previousNetworks.get(device.name);
            return {
              name: device.name,
              rxBytesPerSecond: rate(device.rxBytes, old?.rxBytes),
              txBytesPerSecond: rate(device.txBytes, old?.txBytes),
            };
          }),
        };
        const livePoints = [...sshMonitorLivePointsRef.current, point].slice(-12_000);
        sshMonitorLivePointsRef.current = livePoints;
        setSshMonitorLivePoints(livePoints);
        if (sampledAt - sshMonitorLastPersistedRef.current >= 30_000) {
          sshMonitorLastPersistedRef.current = sampledAt;
          void saveSshMonitorHistoryPoint(connection.id, point).catch((error) => {
            if (!cancelled) setSshMonitorHistoryError(String(error));
          });
        }
        sshMonitorPreviousRef.current = { snapshot, sampledAt };
        setSshMonitorError(null);
      } catch (error) {
        if (!cancelled) setSshMonitorError(String(error));
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [connection.id, connection.kind, reachable]);

  useEffect(() => {
    if (!sshMonitorDrawerOpen) return;
    if (!isNative) {
      setSshMonitorHistory([]);
      setSshMonitorHistoryError("监控历史仅在 Tauri 桌面应用中可用");
      return;
    }
    let cancelled = false;
    const duration = sshMonitorRanges.find((item) => item.value === sshMonitorRange)?.durationMs ?? sshMonitorRanges[0].durationMs;
    setSshMonitorHistoryBusy(true);
    setSshMonitorHistoryError(null);
    setSshMonitorHistory([]);
    void listSshMonitorHistory(connection.id, Date.now() - duration)
      .then((points) => {
        if (!cancelled) setSshMonitorHistory(points);
      })
      .catch((error) => {
        if (!cancelled) setSshMonitorHistoryError(String(error));
      })
      .finally(() => {
        if (!cancelled) setSshMonitorHistoryBusy(false);
      });
    return () => { cancelled = true; };
  }, [connection.id, sshMonitorDrawerOpen, sshMonitorRange, isNative]);

  const sshMonitorChartPoints = useMemo(() => {
    const duration = sshMonitorRanges.find((item) => item.value === sshMonitorRange)?.durationMs ?? sshMonitorRanges[0].durationMs;
    const cutoff = Date.now() - duration;
    const points = new Map<number, SshMonitorHistoryPoint>();
    for (const point of sshMonitorHistory) if (point.sampledAt >= cutoff) points.set(point.sampledAt, point);
    for (const point of sshMonitorLivePoints) if (point.sampledAt >= cutoff) points.set(point.sampledAt, point);
    const sorted = [...points.values()].sort((a, b) => a.sampledAt - b.sampledAt);
    const maxChartPoints = 1800;
    if (sorted.length <= maxChartPoints) return sorted;
    const lastIndex = sorted.length - 1;
    return Array.from({ length: maxChartPoints }, (_, index) =>
      sorted[Math.round(index * lastIndex / (maxChartPoints - 1))],
    );
  }, [sshMonitorHistory, sshMonitorLivePoints, sshMonitorRange]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = getTerminalTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (connection.kind !== "ssh" || reachable === undefined || !isNative) {
      setTerminalStatus("disconnected");
      return;
    }
    const host = terminalHostRef.current;
    if (!host) return;
    terminalCloseRequestedRef.current = false;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      disableStdin: true,
      rightClickSelectsWord: false,
      scrollback: 5000,
      fontSize: 12,
      fontFamily: "Cascadia Code, Consolas, monospace",
      theme: getTerminalTheme(theme),
    });
    const fit = new FitAddon();
    const searchAddon = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(searchAddon);
    terminal.open(host);
    const pasteFromContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!sessionId || terminal.options.disableStdin) return;
      const clipboard = navigator.clipboard;
      if (!clipboard?.readText) {
        notify("error", "当前环境无法读取系统剪贴板");
        return;
      }
      void clipboard.readText().then((text) => {
        if (text) terminal.paste(text);
      }).catch((error: unknown) => notify("error", `读取剪贴板失败：${String(error)}`));
    };
    host.addEventListener("contextmenu", pasteFromContextMenu);
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === "keydown" && (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") {
        setTerminalSearchOpen(true);
        return false;
      }
      return true;
    });
    terminalRef.current = terminal;
    terminalSearchRef.current = searchAddon;
    fit.fit();
    let disposed = false;
    let sessionEnded = false;
    let sessionId: string | null = null;
    const stopTerminal = (message?: string, tone: "error" | "muted" = "error") => {
      if (sessionEnded) return;
      sessionEnded = true;
      if (!terminalCloseRequestedRef.current) onAiSessionReset();
      setTerminalStatus("closed");
      terminal.options.disableStdin = true;
      if (terminalIdRef.current === sessionId) terminalIdRef.current = null;
      terminal.writeln(message
        ? `\r\n\x1b[${tone === "error" ? "31" : "90"}m[${message}]\x1b[0m`
        : "\r\n\x1b[90m[SSH 会话已断开]\x1b[0m");
    };
    setTerminalStatus("connecting");
    terminal.writeln("\x1b[90m正在建立 SSH PTY 会话…\x1b[0m");

    const resizeObserver = new ResizeObserver(() => {
      if (!disposed) fit.fit();
    });
    resizeObserver.observe(host);

    const inputSubscription = terminal.onData((data) => {
      if (sessionId) void writeSshTerminal(sessionId, data).catch((error) => stopTerminal(String(error)));
    });
    const resizeSubscription = terminal.onResize(({ cols, rows }) => {
      if (sessionId) void resizeSshTerminal(sessionId, cols, rows).catch((error) => stopTerminal(String(error)));
    });

    void openSshTerminal(connection.id, terminal.cols, terminal.rows, (event: SshTerminalEvent) => {
      if (disposed) return;
      if (event.type === "output") terminal.write(new Uint8Array(event.data));
      if (event.type === "error") stopTerminal(event.message);
      if (event.type === "closed") {
        if (terminalCloseRequestedRef.current) {
          stopTerminal("本地已关闭 SSH PTY 会话", "muted");
        } else if (typeof event.exitCode !== "number") {
          stopTerminal("SSH 通道已由远端关闭，未收到退出码", "muted");
        } else {
          const tone = event.exitCode === 0 ? "muted" : "error";
          stopTerminal(`远端 shell 已退出（退出码 ${event.exitCode}）`, tone);
        }
      }
    }).then((id) => {
      sessionId = id;
      terminalIdRef.current = id;
      if (disposed || sessionEnded) {
        if (terminalIdRef.current === id) terminalIdRef.current = null;
        if (!disposed) {
          setTerminalStatus("closed");
          terminal.options.disableStdin = true;
        }
        void closeSshTerminal(id).catch(() => undefined);
        return;
      }
      setTerminalStatus("connected");
      terminal.options.disableStdin = false;
      fit.fit();
    }).catch((error: unknown) => {
      if (disposed) return;
      stopTerminal(String(error));
    });

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      host.removeEventListener("contextmenu", pasteFromContextMenu);
      inputSubscription.dispose();
      resizeSubscription.dispose();
      if (sessionId) void closeSshTerminal(sessionId).catch(() => undefined);
      if (terminalIdRef.current === sessionId) terminalIdRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
      terminalSearchRef.current = null;
    };
  }, [connection.id, connection.kind, reachable, isNative, terminalGeneration]);

  async function uploadRemoteFile() {
    if (remoteTransfer?.status === "running") return;
    let name = "upload";
    try {
      const localPath = await chooseLocalFile();
      if (!localPath) return;
      name = localPath.split(/[\\/]/).at(-1) || "upload";
      const base = remotePath.replace(/\/+$/, "");
      const targetPath = `${base}/${name}` || `/${name}`;
      setRemoteError(null);
      setRemoteTransfer({ direction: "upload", name, transferred: 0, total: null, status: "running" });
      const bytes = await remoteUpload(connection.id, localPath, targetPath, (event) => updateRemoteTransfer("upload", name, event));
      await refreshRemoteDirectory();
      notify("success", `上传完成 · ${formatBytes(bytes)}`);
    } catch (error) {
      const message = String(error);
      setRemoteTransfer((current) => ({ direction: "upload", name: current?.name || name, transferred: current?.transferred || 0, total: current?.total ?? null, status: "failed", error: message }));
      setRemoteError(message);
      notify("error", `上传失败 · ${message}`);
    }
  }

  function updateRemoteTransfer(direction: RemoteTransfer["direction"], fallbackName: string, event: TransferProgressEvent) {
    setRemoteTransfer((current) => {
      const name = event.type === "started" ? event.name : current?.name || fallbackName;
      const transferred = event.type === "progress" ? event.transferred : event.type === "done" ? event.bytes : current?.transferred || 0;
      const total = event.type === "started" || event.type === "progress" ? event.total ?? current?.total ?? null : event.type === "done" ? event.bytes : current?.total ?? null;
      if (event.type === "failed") return { direction, name, transferred, total, status: "failed", error: event.message };
      if (event.type === "done") return { direction, name, transferred, total, status: "done" };
      return { direction, name, transferred, total, status: "running" };
    });
  }

  async function navigateRemoteDirectory(path = remotePathDraft) {
    const requestedPath = path.trim() || (connection.kind === "ftp" ? "/" : ".");
    setRemotePathDraft(requestedPath);
    rememberRemotePath(requestedPath);
    await refreshRemoteDirectory(requestedPath);
  }

  async function openRemoteFileEditor(entry: FileEntry) {
    const requestId = remoteEditorRequestRef.current + 1;
    remoteEditorRequestRef.current = requestId;
    setRemoteEditorEntry(entry);
    setRemoteEditorText(null);
    setRemoteEditorOriginal(null);
    setRemoteEditorError(null);
    setRemoteEditorBusy(true);
    try {
      const contents = await remoteReadText(connection.id, entry.path);
      if (remoteEditorRequestRef.current !== requestId) return;
      setRemoteEditorText(contents);
      setRemoteEditorOriginal(contents);
    } catch (error) {
      if (remoteEditorRequestRef.current === requestId) setRemoteEditorError(String(error));
    } finally {
      if (remoteEditorRequestRef.current === requestId) setRemoteEditorBusy(false);
    }
  }

  async function closeRemoteFileEditor() {
    if (remoteEditorText !== null && remoteEditorOriginal !== null && remoteEditorText !== remoteEditorOriginal) {
      const accepted = await confirmInApp("放弃文件修改", "当前文件有未保存的修改，确定关闭吗？", "放弃修改");
      if (!accepted) return;
    }
    remoteEditorRequestRef.current += 1;
    setRemoteEditorEntry(null);
    setRemoteEditorText(null);
    setRemoteEditorOriginal(null);
    setRemoteEditorError(null);
    setRemoteEditorBusy(false);
  }

  async function saveRemoteFileEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!remoteEditorEntry || remoteEditorText === null || remoteEditorSaving) return;
    setRemoteEditorSaving(true);
    setRemoteEditorError(null);
    try {
      await remoteWriteText(connection.id, remoteEditorEntry.path, remoteEditorText);
      setRemoteEditorOriginal(remoteEditorText);
      setRemoteEditorEntry(null);
      setRemoteEditorText(null);
      notify("success", `已保存 ${remoteEditorEntry.name}`);
      void refreshRemoteDirectory();
    } catch (error) {
      setRemoteEditorError(String(error));
    } finally {
      setRemoteEditorSaving(false);
    }
  }

  async function downloadRemoteFile(entry: FileEntry) {
    if (remoteTransfer?.status === "running") return;
    try {
      if (entry.isDir) {
        const localParentPath = await chooseDownloadDirectory();
        if (!localParentPath) return;
        setRemoteError(null);
        setRemoteTransfer({ direction: "download", name: entry.name, transferred: 0, total: null, status: "running" });
        const bytes = await remoteDownloadDirectory(connection.id, entry.path, localParentPath, (event) => updateRemoteTransfer("download", entry.name, event));
        notify("success", `目录下载完成 · ${formatBytes(bytes)}`);
        return;
      }
      const localPath = await chooseDownloadPath(entry.name);
      if (!localPath) return;
      setRemoteError(null);
      setRemoteTransfer({ direction: "download", name: entry.name, transferred: 0, total: null, status: "running" });
      const bytes = await remoteDownload(connection.id, entry.path, localPath, (event) => updateRemoteTransfer("download", entry.name, event));
      notify("success", `下载完成 · ${formatBytes(bytes)}`);
    } catch (error) {
      const message = String(error);
      setRemoteTransfer((current) => ({ direction: "download", name: current?.name || entry.name, transferred: current?.transferred || 0, total: current?.total ?? null, status: "failed", error: message }));
      setRemoteError(message);
      notify("error", `下载失败 · ${message}`);
    }
  }

  async function deleteRemoteFile(entry: FileEntry) {
    const accepted = await confirmInApp(
      entry.isDir ? "删除远程目录" : "删除远程文件",
      `确定从服务器永久删除“${entry.name}”${entry.isDir ? "及目录中的全部内容" : ""}吗？此操作无法撤销。`,
      entry.isDir ? "删除目录" : "删除文件",
      true,
    );
    if (!accepted) return;
    try {
      await remoteDelete(connection.id, entry.path, entry.isDir && !entry.isSymlink);
      await refreshRemoteDirectory();
      notify("success", entry.isDir ? "远程目录已删除" : "远程文件已删除");
    } catch (error) {
      setRemoteError(String(error));
    }
  }

  async function renameRemoteEntry(entry: FileEntry, newName: string) {
    const name = newName.trim();
    if (!name || name === "." || name === ".." || /[\\/\0]/.test(name)) {
      throw new Error("名称不能为空，也不能包含路径分隔符");
    }
    const separator = entry.path.lastIndexOf("/");
    const parent = separator < 0 ? "" : entry.path.slice(0, separator + 1);
    const targetPath = `${parent}${name}`;
    try {
      await remoteRename(connection.id, entry.path, targetPath);
      await refreshRemoteDirectory();
      notify("success", `已重命名为 ${name}`);
    } catch (error) {
      throw error;
    }
  }

  async function exportQueryResult() {
    if (!result || result.columns.length === 0) return;
    const csvValue = (value: Cell) => {
      const text = value === null ? "" : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [
      result.columns.map((column) => column.name),
      ...result.rows,
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvValue).join(",")).join("\r\n")}`;
    const connectionName = connection.name.replace(/[\\/:*?"<>|]+/g, "_");
    const defaultPath = `${connectionName}-query-result.csv`;
    try {
      const saved = await saveCsvFile(defaultPath, csv);
      if (saved) notify("success", `已导出 ${result.rows.length} 行 CSV`);
    } catch (error) {
      notify("error", String(error));
    }
  }

  function focusSqlEditor() {
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(".sql-workspace .editor-surface textarea")?.focus(), 0);
  }

  function openSqlCommandLine() {
    setSqlView("query");
    focusSqlEditor();
  }

  function startNewSqlQuery() {
    setQuery("");
    setResult(null);
    setSqlResultTab("results");
    setSqlView("query");
    focusSqlEditor();
  }

  function runCurrentSqlQuery(database?: string) {
    setSqlResultTab("results");
    const incomplete = sqlParameters.slice(0, mysqlPlaceholderCount).findIndex((parameter) => !parameter.configured || (parameter.kind === "number" && !parameter.value.trim()));
    if (incomplete >= 0) {
      const message = `请先填写第 ${incomplete + 1} 个 SQL 参数，或为它选择 NULL、布尔值等类型。`;
      setResult({ columns: [], rows: [], rows_affected: 0, elapsed_ms: 0, is_exec: false, message });
      setSqlResultTab("messages");
      notify("error", message);
      return;
    }
    runQuery(database, sqlParameters.slice(0, mysqlPlaceholderCount));
  }

  function updateSqlQuery(nextQuery: string) {
    setQuery(nextQuery);
    const nextCount = isSql && sqlDriverFamily(connection.sqlDriver || "mysql") === "mysql" ? countMysqlParameters(nextQuery) : 0;
    setSqlParameters((current) => Array.from({ length: nextCount }, (_, index) => current[index] || { kind: "text", value: "", configured: false }));
  }

  async function runDatabaseSqlFile(database: string) {
    try {
      const path = await chooseSqlFile();
      if (!path) return;
      setSqlView("query");
      setSqlResultTab("messages");
      setResult(null);
      const response = await runSqlFile(connection.id, database || null, path);
      setResult(response);
      notify("success", response.message || "SQL 文件执行完成");
    } catch (error) {
      const message = String(error);
      setResult({ columns: [], rows: [], rows_affected: 0, elapsed_ms: 0, is_exec: false, message });
      setSqlView("query");
      setSqlResultTab("messages");
      notify("error", message);
    }
  }

  async function exportSqlDatabase(database: string, includeData: boolean) {
    try {
      const contents = await dumpSqlDatabase(connection.id, database, includeData);
      const filename = `${database}`.replace(/[\\/:*?"<>|]+/g, "_");
      const saved = await saveTextFile(`${filename}.sql`, "sql", contents);
      if (saved) notify("success", `已导出数据库 ${database}（${includeData ? "结构和数据" : "仅结构"}）`);
    } catch (error) {
      notify("error", String(error));
    }
  }

  return (
    <div className={`workspace-page ${connection.kind === "ssh" ? "remote-terminal-page" : ""} ${connection.kind === "sql" ? "sql-workspace-page" : ""} ${connection.kind === "redis" ? "redis-workspace-page" : ""} ${isDocker ? "docker-workspace-page" : ""}`}>
      {connection.kind !== "ssh" && <>
      <div className="workspace-header">
        <div>
          <div className="workspace-title-line">
            <span className={`connection-icon title-icon ${connection.kind}`}>
              <ProtocolIcon connection={connection} size={17} />
            </span>
            <h1>{connection.name}</h1>
            <span className={`type-pill ${connection.kind}`}>
              {protocolName(connection)}
            </span>
          </div>
          <div className="workspace-meta">
            <span>
              {connection.host || connection.sqlitePath || "本地文件"}
              {connection.port ? `:${connection.port}` : ""}
            </span>
            <span className="meta-dot">·</span>
            <span>
              {connection.database || connection.username || "默认配置"}
            </span>
            {connection.notes && (
              <>
                <span className="meta-dot">·</span>
                <span>{connection.notes}</span>
              </>
            )}
          </div>
        </div>
        <div className="workspace-actions">
          {(isSql || isRedis || isMongo) && <button className="secondary-button ai-entry-button" title="打开数据库 AI 助手" disabled={reachable === undefined} onClick={() => openAiAssistant("databaseControl", `数据库类型：${isSql ? connection.sqlDriver || "SQL" : isRedis ? "Redis" : "MongoDB"}\n当前数据库：${isSql ? sqlDatabase || "未选择" : isRedis ? `DB ${redisDatabase}` : connection.database || "admin"}\n当前工作内容：${isSql ? query || "未编写 SQL" : isRedis ? redisCommand || "未编写命令" : jsonCommand || "未编写命令"}\n请依据上下文帮助用户检查或管理数据库对象；涉及修改时只提出可审核的计划和命令。`, isSql && query.trim() ? "请基于当前 SQL 和数据库上下文，检查并协助完成我的数据库操作。" : "请先帮助我检查当前数据库对象，并根据我的后续要求生成安全的操作方案。")}><Bot size={14} />AI 助手</button>}
          <button className="secondary-button" onClick={onEdit}>
            <Settings2 size={15} />
            编辑
          </button>
          {!isRemoteFile && (
            <button className="secondary-button danger-button" onClick={onDelete}>
              <Trash2 size={15} />
            </button>
          )}
          <button
            className="primary-button"
            disabled={connecting}
            onClick={onConnect}
          >
            {connecting ? (
              <span className="mini-spinner" />
            ) : (
              <Cable size={15} />
            )}
            {reachable !== undefined ? "重新连接" : "连接"}
          </button>
          {isFile && (
            <button
              className="primary-button"
              disabled={remoteBusy || remoteTransfer?.status === "running" || reachable === undefined}
              onClick={() => void uploadRemoteFile()}
            >
              <Upload size={14} />
              上传文件
            </button>
          )}
        </div>
      </div>
      <div className="workspace-subnav">
        <button className={(isSql ? sqlView === "browse" : isRedis ? redisView === "browse" : isMongo ? mongoView === "browse" : true) ? "active" : ""} onClick={() => { if (isSql) setSqlView("browse"); if (isRedis) setRedisView("browse"); if (isMongo) setMongoView("browse"); }}>
          <Activity size={14} />
          {isDocker
            ? "资源管理"
            : isSql
            ? "数据浏览"
            : isRedis
              ? "键浏览"
              : isMongo
                ? "集合浏览"
                : isFile
                  ? "文件"
                  : "终端"}
        </button>
        {isSql ? <button className={sqlView === "query" ? "active" : ""} onClick={() => setSqlView("query")}><Code2 size={14} />SQL 查询</button> : isRedis ? <button className={redisView === "command" ? "active" : ""} onClick={() => setRedisView("command")}><TerminalSquare size={14} />命令行</button> : isMongo ? <button className={mongoView === "command" ? "active" : ""} onClick={() => setMongoView("command")}><Code2 size={14} />命令</button> : isDocker || isFile ? null : <button onClick={() => notify("success", "会话历史将在后续版本中提供")}><Clock3 size={14} />历史</button>}
        <span className="subnav-spacer" />
        <span
          className={`inline-status ${reachable !== undefined ? "online" : "idle"}`}
        >
          <i />
          {reachable !== undefined ? `已连接 · ${reachable} ms` : "未连接"}
        </span>
      </div>
      </>}
      {isRemoteFile && remoteTransfer && <RemoteTransferBanner transfer={remoteTransfer} onDismiss={() => setRemoteTransfer(null)} />}
      {isDocker ? (
        <DockerWorkspace connection={connection} reachable={reachable} search={search} notify={notify} confirmInApp={confirmInApp} />
      ) : (isSql || isRedis || isMongo) && reachable === undefined ? (
        <div className="database-connect-gate">
          <span className={`database-connect-icon ${connection.kind}`}>
            <Cable size={21} />
          </span>
          <b>数据库尚未连接</b>
          <span>点击右上角“连接”按钮后，才能浏览数据库对象和执行操作。</span>
        </div>
      ) : isSql ? sqlView === "browse" ? (
        <SqlDataBrowser key={connection.id} connection={connection} initialDatabase={sqlDatabase} notify={notify} confirmInApp={confirmInApp} onDatabaseChange={setSqlDatabase} onOpenCommandLine={openSqlCommandLine} onNewQuery={startNewSqlQuery} onRunSqlFile={(database) => { void runDatabaseSqlFile(database); }} onDumpSqlDatabase={(database, includeData) => { void exportSqlDatabase(database, includeData); }} onAiTableControl={(context) => openAiAssistant("databaseControl", context, "请检查当前数据表结构，并给出安全的管理建议或 SQL。涉及变更时先说明影响，不要直接执行。")} />
      ) : (
        <div className="sql-workspace">
          <div className="editor-toolbar">
              <div className="editor-context">
              <span className="context-dot" />
              <DropdownSelect
                className="editor-database-select"
                value={sqlDatabase}
                ariaLabel="查询数据库"
                placeholder={sqlDatabase || protocolName(connection)}
                disabled={!sqlDatabases.length}
                options={sqlDatabases.map((database) => ({ value: database.name, label: database.name }))}
                onChange={setSqlDatabase}
              />
              <span className="editor-separator" />
              <span className="muted-label">SQL Console</span>
            </div>
            <div className="editor-tools">
              <button className="secondary-button ai-entry-button sql-ai-entry" title="使用当前服务的 SQL 润色提示词检查并修改查询" disabled={!query.trim()} onClick={() => openAiAssistant("sqlPolish", `数据库类型：${connection.sqlDriver || "MySQL"}\n当前数据库：${sqlDatabase || "未选择"}\n请优先保持原 SQL 的查询语义。`, `请润色并检查下面的 SQL，保持原有业务语义：\n\n\`\`\`sql\n${query}\n\`\`\``)}><Bot size={13} />AI 润色</button>
              <button className="secondary-button save-query-button" title="将当前 SQL 保存到 SQL 收藏" disabled={!query.trim()} onClick={() => onSaveSqlSnippet(query)}><BookmarkPlus size={13} />保存收藏</button>
              <button
                className="icon-button small"
                title="格式化 SQL"
                onClick={() =>
                  setQuery(
                    query
                      .trim()
                      .replace(/\s+/g, " ")
                      .replace(
                        /\b(FROM|WHERE|ORDER BY|GROUP BY|LIMIT|JOIN|LEFT JOIN)\b/gi,
                        "\n$1",
                      ),
                  )
                }
              >
                <Code2 size={15} />
              </button>
              <button className="run-button" disabled={!query.trim()} onClick={() => runCurrentSqlQuery(sqlDatabase || undefined)}>
                <Play size={13} fill="currentColor" />
                运行查询<span className="run-shortcut">Ctrl ↵</span>
              </button>
            </div>
          </div>
          <div className="editor-surface">
            <div className="line-numbers">
              {query.split("\n").map((_, index) => (
                <span key={index}>{String(index + 1).padStart(2, "0")}</span>
              ))}
            </div>
            <textarea
              spellCheck={false}
              value={query}
              onChange={(event) => updateSqlQuery(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  runCurrentSqlQuery(sqlDatabase || undefined);
                }
              }}
              aria-label="SQL 查询编辑器"
            />
          </div>
          {mysqlPlaceholderCount > 0 && <div className="sql-parameters-panel">
            <div className="sql-parameters-heading"><b>查询参数</b><span>按 SQL 中问号占位符的出现顺序绑定，共 {mysqlPlaceholderCount} 项</span></div>
            <div className="sql-parameters-list">
              {sqlParameters.slice(0, mysqlPlaceholderCount).map((parameter, index) => <div className="sql-parameter-row" key={index}>
                <span className="sql-parameter-index">?{index + 1}</span>
                <DropdownSelect
                  className="sql-parameter-type"
                  value={parameter.kind}
                  ariaLabel={`参数 ${index + 1} 类型`}
                  options={[
                    { value: "text", label: "文本" },
                    { value: "number", label: "数字" },
                    { value: "boolean", label: "布尔值" },
                    { value: "null", label: "NULL" },
                  ]}
                  onChange={(kind) => setSqlParameters((current) => current.map((value, itemIndex) => itemIndex === index ? { kind: kind as SqlParameter["kind"], value: kind === "boolean" ? "true" : value.value, configured: true } : value))}
                />
                {parameter.kind === "boolean" ? <DropdownSelect
                  className="sql-parameter-value sql-parameter-boolean"
                  value={parameter.value || "true"}
                  ariaLabel={`参数 ${index + 1} 值`}
                  options={[{ value: "true", label: "true" }, { value: "false", label: "false" }]}
                  onChange={(value) => setSqlParameters((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value, configured: true } : item))}
                /> : parameter.kind === "null" ? <span className="sql-parameter-null">将绑定为 SQL NULL</span> : <input
                  className="sql-parameter-value"
                  inputMode={parameter.kind === "number" ? "decimal" : "text"}
                  aria-label={`参数 ${index + 1} 值`}
                  placeholder={parameter.kind === "number" ? "输入数字" : "输入参数值"}
                  value={parameter.value}
                  onChange={(event) => setSqlParameters((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value, configured: true } : item))}
                />}
              </div>)}
            </div>
          </div>}
          <div className="result-toolbar">
            <div className="result-tabs">
              <button className={sqlResultTab === "results" ? "active" : ""} onClick={() => setSqlResultTab("results")}>
                <LayoutGrid size={14} />
                结果
              </button>
              <button className={sqlResultTab === "messages" ? "active" : ""} onClick={() => setSqlResultTab("messages")}>
                <FileText size={14} />
                消息
              </button>
            </div>
            <div className="result-tools">
              {result && (
                <>
                  <span>{result.rows.length} 行</span>
                  <span className="toolbar-dot">·</span>
                  <span>{result.elapsed_ms} ms</span>
                  <span className="toolbar-dot">·</span>
                </>
              )}
              <button
                className="icon-button small"
                title="导出结果"
                disabled={!result || result.columns.length === 0}
                onClick={() => void exportQueryResult()}
              >
                <ArrowDownToLine size={14} />
              </button>
            </div>
          </div>
          <div className="result-content">
            {sqlResultTab === "messages" ? result ? (
              result.message && !result.is_exec ? (
                <div className="query-error"><AlertCircle size={16} /><span>{result.message}</span></div>
              ) : (
                <div className="query-message"><Check size={16} /><div><b>{result.message || (result.is_exec ? "SQL 已执行完成" : "查询已完成")}</b><span>{result.is_exec ? `${result.rows_affected.toLocaleString()} 行受影响 · ${result.elapsed_ms} ms` : `${result.rows.length.toLocaleString()} 行 · ${result.elapsed_ms} ms`}</span></div></div>
              )
            ) : (
              <div className="result-placeholder"><div className="result-placeholder-icon"><FileText size={19} /></div><b>暂无执行消息</b><span>执行查询或 SQL 文件后，状态会显示在这里。</span></div>
            ) : result ? (
              result.message && !result.is_exec ? (
                <div className="query-error">
                  <AlertCircle size={15} />
                  {result.message}
                </div>
              ) : result.message && result.is_exec ? (
                <div className="query-message">
                  <Check size={16} />
                  {result.message}
                </div>
              ) : result.columns.length ? (
                <div className="result-grid-wrap">
                  <table className="result-grid">
                    <thead>
                      <tr>
                        <th className="index-col">#</th>
                        {result.columns.map((column) => (
                          <th key={column.name}>
                            <span>{column.name}</span>
                            <small>{column.data_type}</small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          <td className="row-number">
                            {String(rowIndex + 1).padStart(2, "0")}
                          </td>
                          {row.map((cell, cellIndex) => (
                            <td
                              key={`${rowIndex}-${cellIndex}`}
                              className={cell === null ? "null-cell" : ""}
                            >
                              {toCell(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="query-message">
                  <Check size={16} />
                  查询执行完成，没有返回行。
                </div>
              )
            ) : (
              <div className="result-placeholder">
                <div className="result-placeholder-icon"><Database size={19} /></div>
                <b>{query.trim() ? "查询结果将显示在这里" : "SQL 查询为空"}</b>
                <span>{query.trim() ? "运行上方 SQL 语句以查看数据。" : "输入 SQL 语句后运行查询。"}</span>
              </div>
            )}
          </div>
          <div className="query-status">
            <span>
              {result ? (
                <>
                  <span className={`status-dot ${result.message && !result.is_exec ? "failed" : "live"}`} />
                  {result.message && !result.is_exec ? "执行失败" : "执行完成"}
                </>
              ) : (
                "就绪"
              )}
            </span>
            <span>
              {result
                ? `${result.rows.length} 行 · ${result.elapsed_ms} ms`
                : "UTF-8 · SQL"}
            </span>
          </div>
        </div>
      ) : isRedis ? redisView === "browse" ? (
        <RedisDataBrowser connection={connection} database={redisDatabase} databaseOptions={redisDatabases} onDatabaseChange={setRedisDatabase} notify={notify} confirmInApp={confirmInApp} onAiKeyControl={(context) => openAiAssistant("databaseControl", context, "请根据 Redis 键的类型和 TTL，帮助我检查或管理这个键。修改或删除操作需要解释影响。")} />
      ) : (
        <div className="command-workspace">
          <div className="command-heading">
            <div>
              <h2>Redis 命令</h2>
              <p>以 RESP 协议向当前实例发送命令。</p>
            </div>
            <span className="command-db">
              <Database size={13} />
              <DropdownSelect className="redis-command-database-select" value={String(redisDatabase)} ariaLabel="Redis 命令数据库" options={redisDatabases.map((item) => ({ value: String(item), label: `DB ${item}` }))} onChange={(value) => { setRedisDatabase(Number(value)); setRedisOutput(null); }} />
            </span>
          </div>
          <div className="command-shell">
            <div className="shell-top">
              <span className="shell-lights">
                <i />
                <i />
                <i />
              </span>
              <span>
                redis-cli · {connection.host}:{connection.port}
              </span>
              <button
                className="icon-button small"
                title="清除输出"
                onClick={() => setRedisOutput(null)}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="shell-output">
              {redisOutput ? (
                <>
                  <div className="shell-prompt">
                    <span>127.0.0.1:{connection.port}&gt;</span> {redisCommand}
                  </div>
                  <pre>{redisOutput}</pre>
                </>
              ) : (
                <div className="shell-welcome">
                  <span>已连接到命令控制台</span>
                  <span>输入 Redis 命令以开始操作。</span>
                </div>
              )}
            </div>
            <form
              className="shell-input-row"
              onSubmit={(event) => {
                event.preventDefault();
                runRedis(redisDatabase);
              }}
            >
              <span>&gt;</span>
              <input
                autoComplete="off"
                spellCheck={false}
                value={redisCommand}
                onChange={(event) => setRedisCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp")
                    setRedisCommand(redisCommand || "PING");
                }}
              />
              <button type="submit" title="执行命令">
                <Play size={14} fill="currentColor" />
              </button>
            </form>
          </div>
          <div className="command-hint">
            <span>
              <Command size={13} />
              支持 Redis 原生命令
            </span>
            <button onClick={() => setRedisCommand("INFO server")}>
              INFO server
            </button>
            <button onClick={() => setRedisCommand("DBSIZE")}>DBSIZE</button>
            <button onClick={() => setRedisCommand("SCAN 0 MATCH * COUNT 50")}>
              SCAN
            </button>
          </div>
        </div>
      ) : isMongo ? mongoView === "browse" ? (
        <MongoDataBrowser connection={connection} notify={notify} confirmInApp={confirmInApp} onAiCollectionControl={(context) => openAiAssistant("databaseControl", context, "请先检查当前 MongoDB 集合结构，再按我的要求给出安全的 JSON 命令。运行写入操作前说明具体影响。")} />
      ) : (
        <div className="command-workspace mongo-workspace">
          <div className="command-heading">
            <div>
              <h2>MongoDB 文档浏览</h2>
              <p>运行数据库命令并查看 JSON 响应。</p>
            </div>
            <span className="command-db">
              <Database size={13} />
              {connection.database || "admin"}
            </span>
          </div>
          <div className="mongo-command">
            <div className="mongo-editor-head">
              <span>
                <Code2 size={14} />
                命令文档
              </span>
              <button
                className="run-button"
                onClick={async () => {
                  try {
                    const result = await executeMongo(
                      connection.id,
                      jsonCommand,
                    );
                    setMongoOutput(JSON.stringify(result, null, 2));
                  } catch (error) {
                    setMongoOutput(String(error));
                  }
                }}
              >
                <Play size={13} fill="currentColor" />
                运行
              </button>
            </div>
            <textarea
              spellCheck={false}
              value={jsonCommand}
              onChange={(event) => setJsonCommand(event.target.value)}
            />
          </div>
          <div className="mongo-response">
            <div className="response-head">
              <span>响应</span>
              {mongoOutput && <span>JSON</span>}
            </div>
            <pre>{mongoOutput || "运行命令后，MongoDB 响应会显示在这里。"}</pre>
          </div>
          <div className="command-hint">
            <span>
              <Command size={13} />
              MongoDB command
            </span>
            <button
              onClick={() => setJsonCommand('{\n  "listCollections": 1\n}')}
            >
              listCollections
            </button>
            <button onClick={() => setJsonCommand('{\n  "serverStatus": 1\n}')}>
              serverStatus
            </button>
          </div>
        </div>
      ) : (
        <div className={`remote-workspace ${connection.kind === "ssh" ? "terminal-workspace" : "file-workspace"}`}>
          {isFile ? (
            <RemoteFilesPanel
              remotePath={remotePath}
              remotePathDraft={remotePathDraft}
              remotePathHistory={remotePathHistory}
              remoteEntries={remoteEntries}
              remoteBusy={remoteBusy}
              transferBusy={remoteTransfer?.status === "running"}
              remoteError={remoteError}
              connected={reachable !== undefined}
              onPathDraftChange={setRemotePathDraft}
              onNavigate={(path) => { void navigateRemoteDirectory(path); }}
              onRefresh={() => { void refreshRemoteDirectory(); }}
              onDownload={(entry) => { void downloadRemoteFile(entry); }}
              onDelete={(entry) => { void deleteRemoteFile(entry); }}
              onEdit={(entry) => { void openRemoteFileEditor(entry); }}
                onRename={renameRemoteEntry}
            />
          ) : (
            <div className="ssh-manager">
              <div
                className="ssh-manager-split"
                ref={sshManagerRef}
                style={{
                  "--ssh-files-width": sshFilesWidth === null ? "34%" : `${sshFilesWidth}px`,
                } as CSSProperties}
              >
                <section className="ssh-files-panel" ref={sshFilesPanelRef}>
                  <div className="ssh-files-heading">
                    <div><FolderOpen size={15} /><b>服务器文件</b></div>
                    <button className="primary-button" disabled={remoteBusy || remoteTransfer?.status === "running" || reachable === undefined} onClick={() => void uploadRemoteFile()}>
                      <Upload size={14} />上传
                    </button>
                  </div>
                  <RemoteFilesPanel
                    remotePath={remotePath}
                    remotePathDraft={remotePathDraft}
                    remotePathHistory={remotePathHistory}
                    remoteEntries={remoteEntries}
                    remoteBusy={remoteBusy}
                    transferBusy={remoteTransfer?.status === "running"}
                    remoteError={remoteError}
                    connected={reachable !== undefined}
                    onPathDraftChange={setRemotePathDraft}
                    onNavigate={(path) => { void navigateRemoteDirectory(path); }}
                    onRefresh={() => { void refreshRemoteDirectory(); }}
                    onDownload={(entry) => { void downloadRemoteFile(entry); }}
                    onDelete={(entry) => { void deleteRemoteFile(entry); }}
                    onEdit={(entry) => { void openRemoteFileEditor(entry); }}
                    onRename={renameRemoteEntry}
                  />
                </section>
                <div
                  className="ssh-splitter"
                  role="separator"
                  aria-label="调整服务器文件与终端宽度"
                  aria-orientation="vertical"
                  aria-valuenow={Math.round(sshFilesPanelRef.current?.getBoundingClientRect().width ?? sshFilesWidth ?? 34)}
                  tabIndex={0}
                  onPointerDown={startSshResize}
                  onPointerMove={moveSshResize}
                  onPointerUp={endSshResize}
                  onPointerCancel={endSshResize}
                  onKeyDown={resizeSshWithKeyboard}
                >
                  <span />
                </div>
                <div className="ssh-terminal-pane">
            <div className="terminal-shell">
              <div className="terminal-toolbar">
                <div className="terminal-session-label">
                  <TerminalSquare size={15} />
                  <span>
                    <b title={connection.name}>{connection.name}</b>
                    <small title={`${connection.username ? `${connection.username}@` : ""}${connection.host}:${connection.port || 22}`}>
                      {connection.username ? `${connection.username}@` : ""}{connection.host}:{connection.port || 22}
                    </small>
                  </span>
                </div>
                <span className={`terminal-state ${terminalStatus}`}>
                  <i />
                  {terminalStatus === "connected" ? "已连接" : terminalStatus === "connecting" ? "连接中" : terminalStatus === "closed" ? "会话已关闭" : "未连接"}
                </span>
                <div className="terminal-controls">
                  <button className="icon-button small" title={reachable === undefined ? "连接 SSH 终端" : "重新连接 SSH 终端"} disabled={connecting || terminalStatus === "connecting"} onClick={() => {
                    if (reachable === undefined) {
                      onConnect();
                      return;
                    }
                    onAiSessionReset();
                    setTerminalStatus("connecting");
                    setTerminalGeneration((value) => value + 1);
                  }}>
                    {connecting ? <span className="mini-spinner" /> : reachable === undefined ? <Cable size={13} /> : <RotateCcw size={13} />}
                  </button>
                  <button className="icon-button small" title="编辑连接" onClick={onEdit}>
                    <Settings2 size={13} />
                  </button>
                  <span className="terminal-controls-divider" />
                  <button className={`icon-button small ${sshMonitorDrawerOpen ? "selected" : ""}`} title="服务器监控图表" aria-label="服务器监控图表" onClick={() => setSshMonitorDrawerOpen(true)}>
                    <Activity size={14} />
                  </button>
                  <button className={`icon-button small ${aiAssistantMode === "serverControl" ? "selected" : ""}`} title="AI 服务器助手" aria-label="AI 服务器助手" disabled={reachable === undefined || terminalStatus !== "connected"} onClick={() => openAiAssistant("serverControl", `远程服务器：${connection.username ? `${connection.username}@` : ""}${connection.host}:${connection.port || 22}\n当前 SSH 终端状态：${terminalStatus}\n只提供并通过专用 SSH 命令会话执行建议命令，不假设交互终端中的未提供信息。`)}>
                    <Bot size={14} />
                  </button>
                  <button className={`icon-button small ${terminalSearchOpen ? "selected" : ""}`} title="搜索终端内容" onClick={() => setTerminalSearchOpen((value) => !value)}>
                    <Search size={13} />
                  </button>
                  <button className="icon-button small" title="清屏" disabled={!terminalRef.current} onClick={() => terminalRef.current?.clear()}>
                    <Trash2 size={13} />
                  </button>
                  <button className="icon-button small danger-icon" title="断开会话" disabled={terminalStatus !== "connected" || !terminalIdRef.current} onClick={() => {
                    const terminalId = terminalIdRef.current;
                    terminalCloseRequestedRef.current = true;
                    onAiSessionReset();
                    if (terminalId) void closeSshTerminal(terminalId).catch((error) => notify("error", String(error)));
                    terminalIdRef.current = null;
                    if (terminalRef.current) terminalRef.current.options.disableStdin = true;
                    setTerminalStatus("closed");
                  }}>
                    <X size={14} />
                  </button>
                </div>
              </div>
              {terminalSearchOpen && (
                <form className="terminal-search-row" onSubmit={(event) => {
                  event.preventDefault();
                  terminalSearchRef.current?.findNext(terminalSearch);
                }}>
                  <Search size={13} />
                  <input autoFocus value={terminalSearch} onChange={(event) => setTerminalSearch(event.target.value)} onKeyDown={(event) => {
                    if (event.key === "Escape") setTerminalSearchOpen(false);
                  }} placeholder="搜索终端内容" />
                  <button type="button" className="icon-button small" title="上一个匹配" disabled={!terminalSearch} onClick={() => terminalSearchRef.current?.findPrevious(terminalSearch)}><ChevronUp size={13} /></button>
                  <button type="submit" className="icon-button small" title="下一个匹配" disabled={!terminalSearch}><ChevronDown size={13} /></button>
                </form>
              )}
              <div className="xterm-frame">
                {reachable === undefined && isNative && (
                  <div className="terminal-overlay">
                    <TerminalSquare size={20} />
                    <b>尚未建立 SSH 连接</b>
                    <span>先连接并确认主机指纹以打开交互式终端。</span>
                  </div>
                )}
                {!isNative && (
                  <div className="terminal-overlay preview-overlay">
                    <TerminalSquare size={20} />
                    <b>浏览器预览不建立 SSH 会话</b>
                    <span>请在 Tauri 桌面应用中使用交互式终端。</span>
                  </div>
                )}
                <div className="xterm-host" ref={terminalHostRef} />
              </div>
            </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {remoteEditorEntry && (
        <RemoteFileEditor
          entry={remoteEditorEntry}
          contents={remoteEditorText}
          busy={remoteEditorBusy}
          saving={remoteEditorSaving}
          error={remoteEditorError}
          onContentsChange={setRemoteEditorText}
          onClose={() => { void closeRemoteFileEditor(); }}
          onSave={(event) => { void saveRemoteFileEditor(event); }}
        />
      )}
      {aiAssistantMode && <AiAssistantDialog
        mode={aiAssistantMode}
        connection={connection}
        sessionId={restoredAiConversation?.sessionId || aiSessionId}
        context={aiAssistantContext}
        initialMessage={aiAssistantInitialMessage}
        initialConversationId={restoredAiConversation?.id}
        initialMessages={restoredAiConversation?.messages}
        onClose={closeAiAssistant}
        onApply={(value) => {
          if (connection.kind === "redis") {
            setRedisCommand(value);
            setRedisView("command");
          } else if (connection.kind === "mongo") {
            setJsonCommand(value);
            setMongoView("command");
          } else {
            setQuery(value);
            setSqlView("query");
            window.setTimeout(focusSqlEditor, 0);
          }
        }}
        onExecuteCommand={aiAssistantMode === "serverControl" ? executeAiSuggestedSshCommand : aiAssistantMode === "databaseControl" ? executeAiSuggestedDatabaseCommand : undefined}
      />}
      {connection.kind === "ssh" && sshMonitorDrawerOpen && (
        <SshMonitorDrawer
          connectionName={connection.name}
          connected={reachable !== undefined}
          points={sshMonitorChartPoints}
          loading={sshMonitorHistoryBusy}
          error={sshMonitorError || sshMonitorHistoryError}
          range={sshMonitorRange}
          diskSelection={sshMonitorDiskSelection}
          networkSelection={sshMonitorNetworkSelection}
          onRangeChange={setSshMonitorRange}
          onDiskSelectionChange={setSshMonitorDiskSelection}
          onNetworkSelectionChange={setSshMonitorNetworkSelection}
          onClose={() => setSshMonitorDrawerOpen(false)}
        />
      )}
    </div>
  );
}

function RemoteFilesPanel({
  remotePath,
  remotePathDraft,
  remotePathHistory,
  remoteEntries,
  remoteBusy,
  transferBusy,
  remoteError,
  connected,
  onPathDraftChange,
  onNavigate,
  onRefresh,
  onDownload,
  onDelete,
  onEdit,
  onRename,
}: {
  remotePath: string;
  remotePathDraft: string;
  remotePathHistory: string[];
  remoteEntries: FileEntry[];
  remoteBusy: boolean;
  transferBusy: boolean;
  remoteError: string | null;
  connected: boolean;
  onPathDraftChange: (path: string) => void;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  onDownload: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onEdit: (entry: FileEntry) => void;
  onRename: (entry: FileEntry, name: string) => Promise<void>;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
  const [renameEntry, setRenameEntry] = useState<FileEntry | null>(null);
  const [renaming, setRenaming] = useState(false);
  const atRoot = remotePath === "/" || remotePath.replace(/\/+$/, "") === "";
  return (
    <div className="ftp-browser">
      <form
        className="remote-pathbar"
        onSubmit={(event) => {
          event.preventDefault();
          onNavigate(remotePathDraft);
        }}
      >
        <label className="remote-path-input-wrap">
          <span className="sr-only">远程目录路径</span>
          <input
            value={remotePathDraft}
            aria-label="远程目录路径"
            placeholder="输入远程目录路径"
            disabled={remoteBusy || !connected}
            onChange={(event) => onPathDraftChange(event.target.value)}
          />
        </label>
        <DropdownSelect
          className="remote-path-history"
          value=""
          ariaLabel="路径历史"
          placeholder="历史路径"
          disabled={remotePathHistory.length === 0 || remoteBusy || !connected}
          options={remotePathHistory.map((path) => ({ value: path, label: path }))}
          onChange={onNavigate}
        />
        <button
          className="icon-button small"
          type="submit"
          title="跳转到路径"
          aria-label="跳转到路径"
          disabled={remoteBusy || !connected}
        >
          <CornerDownLeft size={14} />
        </button>
        <button
          className="icon-button small"
          type="button"
          title="刷新目录"
          aria-label="刷新目录"
          disabled={remoteBusy || !connected}
          onClick={onRefresh}
        >
          <RefreshCw size={14} />
        </button>
      </form>
      {remoteError && (
        <div className="ftp-error">
          <AlertCircle size={14} />
          <span>{remoteError}</span>
        </div>
      )}
      <div className="ftp-table-wrap">
        {remoteBusy ? (
          <div className="ftp-placeholder">
            <span className="mini-spinner" />
            正在读取目录…
          </div>
        ) : remoteEntries.length === 0 && (!connected || atRoot) ? (
          <div className="ftp-placeholder">
            <FolderOpen size={18} />
            {!connected
              ? "连接后浏览远程目录。"
              : remoteError
                ? "目录读取失败。"
                : "此目录为空。"}
          </div>
        ) : (
          <table className="ftp-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>修改时间</th>
                <th>大小</th>
                <th>权限</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {!atRoot && (
                <tr>
                  <td>
                    <button
                      className="ftp-entry-name directory-entry"
                      type="button"
                      disabled={remoteBusy || !connected}
                      title="返回上一级目录"
                      onClick={() => onNavigate(parentRemotePath(remotePath))}
                    >
                      <FolderUp size={14} className="remote-entry-icon remote-entry-icon--directory" />
                      <span>..</span>
                    </button>
                  </td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td />
                </tr>
              )}
              {remoteEntries.map((entry) => (
                <tr key={entry.path} onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setContextMenu({ x: event.clientX, y: event.clientY, entry });
                }}>
                  <td>
                    <button
                      className={`ftp-entry-name ${entry.isDir ? "directory-entry" : "file-entry"}`}
                      type="button"
                      disabled={remoteBusy}
                      title={entry.isDir ? "打开目录" : "双击编辑"}
                      onClick={() => { if (entry.isDir) onNavigate(entry.path); }}
                      onDoubleClick={() => { if (!entry.isDir) onEdit(entry); }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setContextMenu({ x: event.clientX, y: event.clientY, entry });
                      }}
                    >
                      <RemoteEntryIcon entry={entry} />
                      <span>{entry.name}</span>
                      {entry.isSymlink && <small>链接</small>}
                    </button>
                  </td>
                  <td>{entry.modified ? new Date(entry.modified * 1000).toLocaleString() : "—"}</td>
                  <td>{entry.isDir ? "—" : formatBytes(entry.size)}</td>
                  <td>{entry.permissions || "—"}</td>
                  <td>
                    {!entry.isDir && (
                      <div className="ftp-row-actions">
                        <button type="button" className="icon-button small" title="下载文件" disabled={transferBusy} onClick={() => onDownload(entry)}>
                          <Download size={14} />
                        </button>
                        <button type="button" className="icon-button small danger-icon" title="删除远程文件" onClick={() => onDelete(entry)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {contextMenu && <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={() => setContextMenu(null)}
        items={[
          { label: entryOpenLabel(contextMenu.entry), icon: contextMenu.entry.isDir ? <FolderOpen size={14} /> : <FileText size={14} />, onSelect: () => contextMenu.entry.isDir ? onNavigate(contextMenu.entry.path) : onEdit(contextMenu.entry) },
          { label: contextMenu.entry.isDir ? "下载目录" : "下载文件", icon: <Download size={14} />, disabled: transferBusy, onSelect: () => onDownload(contextMenu.entry) },
          { label: "重命名", icon: <Settings2 size={14} />, onSelect: () => setRenameEntry(contextMenu.entry) },
          { label: contextMenu.entry.isDir ? "删除目录" : "删除文件", icon: <Trash2 size={14} />, danger: true, onSelect: () => onDelete(contextMenu.entry) },
        ]}
      />}
      {renameEntry && <TextPromptDialog
        title={renameEntry.isDir ? "重命名目录" : "重命名文件"}
        label="新名称"
        initialValue={renameEntry.name}
        onCancel={() => setRenameEntry(null)}
        onSubmit={async (name) => {
          setRenaming(true);
          try {
            await onRename(renameEntry, name);
            setRenameEntry(null);
          } catch {
          } finally {
            setRenaming(false);
          }
        }}
        busy={renaming}
      />}
    </div>
  );
}

function entryOpenLabel(entry: FileEntry) {
  return entry.isDir ? "打开目录" : "打开编辑器";
}

function SshMonitorDrawer({
  connectionName,
  connected,
  points,
  loading,
  error,
  range,
  diskSelection,
  networkSelection,
  onRangeChange,
  onDiskSelectionChange,
  onNetworkSelectionChange,
  onClose,
}: {
  connectionName: string;
  connected: boolean;
  points: SshMonitorHistoryPoint[];
  loading: boolean;
  error: string | null;
  range: SshMonitorRange;
  diskSelection: string;
  networkSelection: string;
  onRangeChange: (range: SshMonitorRange) => void;
  onDiskSelectionChange: (device: string) => void;
  onNetworkSelectionChange: (device: string) => void;
  onClose: () => void;
}) {
  const diskNames = [...new Set(points.flatMap((point) => point.diskRates.map((device) => device.name)))].sort();
  const networkNames = [...new Set(points.flatMap((point) => point.networkRates.map((device) => device.name)))].sort();
  const diskOptions = [{ value: "*", label: "所有系统盘" }, ...diskNames.map((name) => ({ value: name, label: name }))];
  const networkOptions = [{ value: "*", label: "所有网卡" }, ...networkNames.map((name) => ({ value: name, label: name }))];
  const activeDisk = diskOptions.some((option) => option.value === diskSelection) ? diskSelection : "*";
  const activeNetwork = networkOptions.some((option) => option.value === networkSelection) ? networkSelection : "*";
  const cpuSeries = points.map((point) => point.cpuPercent);
  const memorySeries = points.map((point) => {
    if (!point.memoryTotalBytes || point.memoryUsedBytes === null) return null;
    return Math.max(0, Math.min(100, point.memoryUsedBytes / point.memoryTotalBytes * 100));
  });
  const diskRead = points.map((point) => sumMonitorRates(point.diskRates
    .filter((device) => activeDisk === "*" || device.name === activeDisk)
    .map((device) => device.readBytesPerSecond)));
  const diskWrite = points.map((point) => sumMonitorRates(point.diskRates
    .filter((device) => activeDisk === "*" || device.name === activeDisk)
    .map((device) => device.writeBytesPerSecond)));
  const networkRx = points.map((point) => sumMonitorRates(point.networkRates
    .filter((device) => activeNetwork === "*" || device.name === activeNetwork)
    .map((device) => device.rxBytesPerSecond)));
  const networkTx = points.map((point) => sumMonitorRates(point.networkRates
    .filter((device) => activeNetwork === "*" || device.name === activeNetwork)
    .map((device) => device.txBytesPerSecond)));

  return (
    <div className="ssh-monitor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="ssh-monitor-drawer" role="dialog" aria-modal="true" aria-label="服务器监控图表">
        <header className="ssh-monitor-drawer-header">
          <div><Activity size={16} /><span><b>服务器监控</b><small title={connectionName}>{connectionName}</small></span></div>
          <span className={`ssh-monitor-live-state ${connected ? "connected" : ""}`}><i />{connected ? "实时采样 · 5 秒" : "离线 · 历史数据"}</span>
          <button className="icon-button small" type="button" title="关闭监控" aria-label="关闭监控" onClick={onClose}><X size={15} /></button>
        </header>
        <div className="ssh-monitor-drawer-toolbar">
          <div className="ssh-monitor-range" role="group" aria-label="监控时间范围">
            {sshMonitorRanges.map((option) => (
              <button key={option.value} type="button" className={range === option.value ? "active" : ""} aria-pressed={range === option.value} onClick={() => onRangeChange(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          <div className="ssh-monitor-device-filters">
            <label><span>系统盘</span><DropdownSelect className="ssh-monitor-device-select" value={activeDisk} options={diskOptions} ariaLabel="选择系统盘" disabled={diskNames.length === 0} onChange={onDiskSelectionChange} /></label>
            <label><span>网卡</span><DropdownSelect className="ssh-monitor-device-select" value={activeNetwork} options={networkOptions} ariaLabel="选择网卡" disabled={networkNames.length === 0} onChange={onNetworkSelectionChange} /></label>
          </div>
        </div>
        {error && <div className="ssh-monitor-drawer-error"><AlertCircle size={13} /><span>{error}</span></div>}
        <div className="ssh-monitor-charts">
          {loading && points.length === 0 ? (
            <div className="ssh-monitor-empty"><span className="mini-spinner" />正在读取监控历史…</div>
          ) : points.length === 0 ? (
            <div className="ssh-monitor-empty"><Activity size={20} /><b>暂无监控数据</b><span>SSH 连接后开始采集，历史数据保留 30 天。</span></div>
          ) : (
            <>
              <MonitorLineChart title="CPU 用量" unit="%" points={points} range={range} fixedMax={100} series={[{ name: "使用率", color: "#e69a61", values: cpuSeries }]} />
              <MonitorLineChart title="内存用量" unit="%" points={points} range={range} fixedMax={100} series={[{ name: "已用内存", color: "#66b4e4", values: memorySeries }]} />
              <MonitorLineChart title="硬盘 I/O" unit="rate" points={points} range={range} series={[
                { name: "读取", color: "#51bd91", values: diskRead },
                { name: "写入", color: "#dc876d", values: diskWrite },
              ]} />
              <MonitorLineChart title="网卡流量" unit="rate" points={points} range={range} series={[
                { name: "接收", color: "#66b4e4", values: networkRx },
                { name: "发送", color: "#bc8ce0", values: networkTx },
              ]} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function sumMonitorRates(values: (number | null)[]) {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0);
}

function MonitorLineChart({
  title,
  unit,
  points,
  range,
  series,
  fixedMax,
}: {
  title: string;
  unit: "%" | "rate";
  points: SshMonitorHistoryPoint[];
  range: SshMonitorRange;
  series: { name: string; color: string; values: (number | null)[] }[];
  fixedMax?: number;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const values = series.flatMap((item) => item.values.filter((value): value is number => value !== null && Number.isFinite(value)));
  const maxValue = fixedMax ?? Math.max(1, ...values) * 1.1;
  const duration = sshMonitorRanges.find((item) => item.value === range)?.durationMs ?? sshMonitorRanges[0].durationMs;
  const timeEnd = Date.now();
  const timeStart = timeEnd - duration;
  const width = 640;
  const height = 186;
  const left = 55;
  const right = 12;
  const top = 13;
  const bottom = 29;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const y = (value: number) => top + (1 - Math.max(0, Math.min(maxValue, value)) / maxValue) * plotHeight;
  const x = (timestamp: number) => left + Math.max(0, Math.min(1, (timestamp - timeStart) / duration)) * plotWidth;
  const formatAxis = (value: number) => unit === "%" ? `${value.toFixed(0)}%` : `${formatBytes(value)}/s`;
  const useCalendarDate = range === "7d" || range === "30d"
    || new Date(timeStart).toDateString() !== new Date(timeEnd).toDateString();
  const formatPointTime = (timestamp: number) => new Date(timestamp).toLocaleString([], useCalendarDate
    ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" });
  const hoveredPoint = hoveredIndex === null ? null : points[hoveredIndex] ?? null;
  const hoveredX = hoveredPoint ? x(hoveredPoint.sampledAt) : null;

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (points.length === 0) return;
    const svg = event.currentTarget.querySelector("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = (event.clientX - rect.left) / rect.width * width;
    const svgY = (event.clientY - rect.top) / rect.height * height;
    if (svgX < left || svgX > width - right || svgY < top || svgY > height - bottom) {
      setHoveredIndex(null);
      return;
    }
    const targetTime = timeStart + (svgX - left) / plotWidth * duration;
    let low = 0;
    let high = points.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (points[middle].sampledAt < targetTime) low = middle + 1;
      else high = middle;
    }
    const previous = Math.max(0, low - 1);
    const nearest = Math.abs(points[previous].sampledAt - targetTime) <= Math.abs(points[low].sampledAt - targetTime)
      ? previous
      : low;
    setHoveredIndex(nearest);
  }

  return (
    <section className="ssh-monitor-chart-card">
      <div className="ssh-monitor-chart-heading"><b>{title}</b><span>{unit === "%" ? "百分比" : "每秒"}</span></div>
      <div className="ssh-monitor-chart" onPointerMove={handlePointerMove} onPointerLeave={() => setHoveredIndex(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}趋势图，鼠标悬停查看采样时间及数值`} preserveAspectRatio="none">
          {[0, 0.5, 1].map((fraction) => {
            const value = maxValue * (1 - fraction);
            const lineY = top + fraction * plotHeight;
            return <g key={fraction}><line x1={left} x2={width - right} y1={lineY} y2={lineY} className="ssh-chart-gridline" /><text x={left - 8} y={lineY + 3} textAnchor="end" className="ssh-chart-axis-label">{formatAxis(value)}</text></g>;
          })}
          <text x={left} y={height - 6} textAnchor="start" className="ssh-chart-axis-label">{formatPointTime(timeStart)}</text>
          <text x={width - right} y={height - 6} textAnchor="end" className="ssh-chart-axis-label">{formatPointTime(timeEnd)}</text>
          {series.map((item) => {
            let active = false;
            let path = "";
            item.values.forEach((value, index) => {
              if (value === null || !Number.isFinite(value)) {
                active = false;
                return;
              }
              const plotX = x(points[index].sampledAt);
              path += `${active ? "L" : "M"}${plotX.toFixed(1)} ${y(value).toFixed(1)} `;
              active = true;
            });
            return <path key={item.name} d={path} stroke={item.color} className="ssh-chart-line"><title>{item.name}</title></path>;
          })}
          {hoveredPoint && hoveredX !== null && <>
            <line x1={hoveredX} x2={hoveredX} y1={top} y2={height - bottom} className="ssh-chart-hover-line" />
            {series.map((item) => {
              const value = item.values[hoveredIndex!];
              if (value === null || !Number.isFinite(value)) return null;
              return <circle key={item.name} cx={hoveredX} cy={y(value)} r="3.5" fill={item.color} className="ssh-chart-marker" />;
            })}
          </>}
        </svg>
        {hoveredPoint && <div className="ssh-chart-tooltip">
          <b>{new Date(hoveredPoint.sampledAt).toLocaleString([], { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</b>
          {series.map((item) => {
            const value = item.values[hoveredIndex!];
            return <span key={item.name}><i style={{ backgroundColor: item.color }} />{item.name}<strong>{value === null || !Number.isFinite(value) ? "暂无数据" : formatAxis(value)}</strong></span>;
          })}
        </div>}
      </div>
      <div className="ssh-monitor-chart-legend">
        {series.map((item) => <span key={item.name}><i style={{ backgroundColor: item.color }} />{item.name}</span>)}
      </div>
    </section>
  );
}

function RemoteFileEditor({
  entry,
  contents,
  busy,
  saving,
  error,
  onContentsChange,
  onClose,
  onSave,
}: {
  entry: FileEntry;
  contents: string | null;
  busy: boolean;
  saving: boolean;
  error: string | null;
  onContentsChange: (contents: string) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="sql-row-dialog-backdrop remote-file-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="sql-row-dialog remote-file-editor" onSubmit={onSave}>
        <div className="sql-row-dialog-heading">
          <div><b>{entry.name}</b><span title={entry.path}>{entry.path}</span></div>
          <button type="button" className="icon-button small" title="关闭" onClick={onClose}><X size={14} /></button>
        </div>
        {error && <div className="ftp-error remote-editor-error"><AlertCircle size={14} /><span>{error}</span></div>}
        <textarea
          autoFocus
          spellCheck={false}
          aria-label={`编辑 ${entry.name}`}
          value={contents ?? ""}
          disabled={busy || saving || contents === null}
          placeholder={busy ? "正在读取远程文件…" : "文件内容"}
          onChange={(event) => onContentsChange(event.target.value)}
        />
        <div className="sql-row-dialog-footer">
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="submit" className="primary-button" disabled={busy || saving || contents === null}>
            {saving ? <span className="mini-spinner" /> : <Check size={14} />}
            {saving ? "保存中" : "保存到服务器"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<{
    parentIndex: number;
    items: ContextMenuItem[];
    x: number;
    y: number;
    side: "left" | "right";
  } | null>(null);
  const [position, setPosition] = useState({ x, y });

  function cancelSubmenuClose() {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function scheduleSubmenuClose() {
    cancelSubmenuClose();
    closeTimerRef.current = window.setTimeout(() => setOpenSubmenu(null), 120);
  }

  function showSubmenu(parentIndex: number, event: ReactMouseEvent<HTMLButtonElement>, children: ContextMenuItem[]) {
    cancelSubmenuClose();
    const bounds = event.currentTarget.getBoundingClientRect();
    const submenuWidth = 208;
    const side = bounds.right + submenuWidth <= window.innerWidth - 8 ? "right" : "left";
    const height = Math.min(window.innerHeight - 16, children.length * 31 + 8);
    setOpenSubmenu({
      parentIndex,
      items: children,
      x: side === "right" ? bounds.right - 2 : bounds.left - submenuWidth + 2,
      y: Math.max(8, Math.min(bounds.top, window.innerHeight - height - 8)),
      side,
    });
  }

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)),
    });
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y, items.length]);
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !submenuRef.current?.contains(target)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (openSubmenu) setOpenSubmenu(null);
        else onClose();
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", onClose);
      cancelSubmenuClose();
    };
  }, [onClose, openSubmenu]);
  return (
    <div
      className="context-menu"
      role="menu"
      ref={menuRef}
      style={{ left: position.x, top: position.y }}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="context-menu-item-wrap">
          <button
            type="button"
            role="menuitem"
            aria-haspopup={item.children ? "menu" : undefined}
            aria-expanded={item.children ? openSubmenu?.parentIndex === index : undefined}
            title={item.title}
            disabled={item.disabled}
            className={`${item.danger ? "danger" : ""} ${item.children ? "has-submenu" : ""}`}
            onMouseEnter={(event) => item.children && showSubmenu(index, event, item.children)}
            onMouseLeave={item.children ? scheduleSubmenuClose : undefined}
            onClick={(event) => {
              event.stopPropagation();
              if (item.children) {
                showSubmenu(index, event, item.children);
                return;
              }
              onClose();
              if (!item.disabled) item.onSelect();
            }}
          >
            <span className="context-menu-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.children && <ChevronRight className="context-menu-chevron" size={13} />}
          </button>
        </div>
      ))}
      {openSubmenu && createPortal(
        <div
          ref={submenuRef}
          className={`context-menu context-submenu ${openSubmenu.side}`}
          role="menu"
          style={{ left: openSubmenu.x, top: openSubmenu.y }}
          onMouseEnter={cancelSubmenuClose}
          onMouseLeave={scheduleSubmenuClose}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {openSubmenu.items.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={item.danger ? "danger" : ""}
              onClick={(event) => {
                event.stopPropagation();
                onClose();
                if (!item.disabled) item.onSelect();
              }}
            >
              <span className="context-menu-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

function RemoteTransferBanner({ transfer, onDismiss }: { transfer: RemoteTransfer; onDismiss: () => void }) {
  const percent = transfer.status === "done"
    ? 100
    : transfer.total && transfer.total > 0
      ? Math.min(100, Math.round((transfer.transferred / transfer.total) * 100))
      : null;
  const Icon = transfer.direction === "upload" ? Upload : Download;
  const statusLabel = transfer.status === "running" ? "传输中" : transfer.status === "done" ? "已完成" : "失败";
  return (
    <div className={`remote-transfer-banner ${transfer.status}`} role="status" aria-live="polite">
      <span className="remote-transfer-icon">{transfer.status === "failed" ? <AlertCircle size={14} /> : transfer.status === "done" ? <Check size={14} /> : <Icon size={14} />}</span>
      <div className="remote-transfer-main">
        <div className="remote-transfer-copy"><b>{transfer.direction === "upload" ? "上传" : "下载"} · {transfer.name}</b><span>{transfer.status === "failed" ? transfer.error : `${statusLabel} · ${formatBytes(transfer.transferred)}${transfer.total !== null ? ` / ${formatBytes(transfer.total)}` : ""}${percent !== null ? ` · ${percent}%` : ""}`}</span></div>
        <div className="remote-transfer-track" role="progressbar" aria-label={`${statusLabel} ${transfer.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
          <span className={percent === null && transfer.status === "running" ? "indeterminate" : ""} style={percent === null ? undefined : { width: `${percent}%` }} />
        </div>
      </div>
      <button className="icon-button small" title="关闭传输状态" onClick={onDismiss}><X size={13} /></button>
    </div>
  );
}

function TextPromptDialog({
  title,
  label,
  initialValue = "",
  busy = false,
  onCancel,
  onSubmit,
}: {
  title: string;
  label: string;
  initialValue?: string;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitting) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setError(`${label}不能为空`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="modal-backdrop app-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy && !submitting) onCancel();
    }}>
      <form className="connection-dialog text-prompt-dialog" onSubmit={(event) => void submit(event)}>
        <header className="dialog-header">
          <div><div className="dialog-kicker">ORANGEHUB · 对象操作</div><h2>{title}</h2></div>
          <button type="button" className="icon-button" title="关闭" onClick={onCancel}><X size={17} /></button>
        </header>
        <label className="form-field full-field">
          <span>{label}</span>
          <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        {error && <div className="text-prompt-error"><AlertCircle size={14} />{error}</div>}
        <footer className="dialog-footer">
          <button type="button" className="secondary-button" disabled={busy || submitting} onClick={onCancel}>取消</button>
          <button type="submit" className="primary-button" disabled={busy || submitting}>
            {busy || submitting ? <span className="mini-spinner" /> : <Check size={14} />}
            确定
          </button>
        </footer>
      </form>
    </div>
  );
}

function ActionDialog({
  title,
  message,
  confirmLabel,
  destructive,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div className="modal-backdrop app-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className={`connection-dialog action-dialog ${destructive ? "is-danger" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="action-dialog-title" aria-describedby="action-dialog-message">
        <header className="dialog-header action-dialog-header">
          <div className="action-dialog-heading">
            <span className="action-dialog-icon">
              {destructive ? <AlertCircle size={18} /> : <ShieldCheck size={18} />}
            </span>
            <div>
              <h2 id="action-dialog-title">{title}</h2>
            </div>
          </div>
          <button type="button" className="icon-button" title="关闭" onClick={onCancel}>
            <X size={17} />
          </button>
        </header>
        <div className="action-dialog-content">
          <p id="action-dialog-message">{message}</p>
        </div>
        <footer className="dialog-footer action-dialog-footer">
          <div className="action-dialog-buttons">
            <button type="button" className="secondary-button" onClick={onCancel}>取消</button>
            <button type="button" className={`primary-button ${destructive ? "danger-confirm" : ""}`} onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function historyLabel(sqlText: string) {
  if (/^(SSH|SFTP|FTP|Redis|MongoDB) ·/.test(sqlText)) return sqlText;
  return sqlText.trim().replace(/\s+/g, " ");
}

function AiConversationHistoryPage({
  conversations,
  search,
  onOpen,
  onDelete,
  onRename,
}: {
  conversations: AiConversation[];
  search: string;
  onOpen: (conversation: AiConversation) => void;
  onDelete: (conversation: AiConversation) => void;
  onRename: (conversation: AiConversation, title: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const filtered = [...conversations]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .filter((conversation) => `${conversation.title} ${conversation.connectionName} ${conversation.messages[0]?.content || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const modeLabel = (mode: AiPromptKey) => mode === "serverControl" ? "服务器助手" : mode === "sqlPolish" ? "SQL 润色" : "数据库助手";
  const beginRename = (conversation: AiConversation) => {
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
  };
  const finishRename = (conversation: AiConversation) => {
    onRename(conversation, editingTitle);
    setEditingId(null);
  };

  return (
    <div className="secondary-page ai-conversations-page">
      <div className="page-heading">
        <div>
          <h1>AI 对话</h1>
        </div>
      </div>
      <div className="ai-conversations-list">
        {!filtered.length ? (
          <div className="history-empty">
            <MessageSquareText size={22} />
            <b>{conversations.length ? "没有匹配的对话" : "暂无 AI 对话"}</b>
            <span>{conversations.length ? "换一个关键词试试。" : "在 AI 助手中发送消息后，对话会自动保存在这里。"}</span>
          </div>
        ) : filtered.map((conversation) => {
          const firstUser = conversation.messages.find((message) => message.role === "user")?.content || "暂无用户消息";
          const isEditing = editingId === conversation.id;
          return (
            <article className="ai-conversation-card" key={conversation.id}>
              <div className="ai-conversation-card-main">
                <span className="ai-conversation-card-icon"><MessageSquareText size={16} /></span>
                <div className="ai-conversation-card-copy">
                  {isEditing ? <input className="ai-conversation-title-input" autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") finishRename(conversation); if (event.key === "Escape") setEditingId(null); }} onBlur={() => finishRename(conversation)} /> : <button type="button" className="ai-conversation-card-title" onClick={() => onOpen(conversation)}>{conversation.title}</button>}
                  <span className="ai-conversation-card-meta">{modeLabel(conversation.mode)} · {conversation.connectionName} · {new Date(conversation.updatedAt).toLocaleString()}</span>
                  <span className="ai-conversation-card-preview">{firstUser.replace(/\s+/g, " ")}</span>
                </div>
              </div>
              <div className="ai-conversation-card-actions">
                <button type="button" className="icon-button small" title="打开对话" onClick={() => onOpen(conversation)}><ArrowUpRight size={14} /></button>
                <button type="button" className="icon-button small" title="重命名" onClick={() => beginRename(conversation)}><Settings2 size={13} /></button>
                <button type="button" className="icon-button small danger-button" title="删除对话" onClick={() => onDelete(conversation)}><Trash2 size={13} /></button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SqlSnippetsPage({
  snippets,
  connections,
  search,
  onCreate,
  onOpen,
  onDelete,
}: {
  snippets: SqlSnippet[];
  connections: Connection[];
  search: string;
  onCreate: () => void;
  onOpen: (snippet: SqlSnippet) => void;
  onDelete: (snippet: SqlSnippet) => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = snippets.filter((snippet) => {
    const connection = connections.find((item) => item.id === snippet.connectionId);
    return `${snippet.name} ${snippet.sqlText} ${connection?.name || ""}`.toLowerCase().includes(normalizedSearch);
  });

  return (
    <div className="secondary-page sql-snippets-page">
      <div className="page-heading">
        <div><h1>SQL 收藏</h1><p>保存常用查询，之后可以直接载入 SQL 编辑器。</p></div>
        <button className="primary-button" type="button" onClick={onCreate}><Plus size={14} />新建收藏</button>
      </div>
      <div className="sql-snippet-list">
        {filtered.length === 0 ? (
          <div className="history-empty sql-snippet-empty">
            <FileCode2 size={22} />
            <b>{snippets.length ? "没有匹配的收藏" : "暂无 SQL 收藏"}</b>
            <span>{snippets.length ? "调整搜索词，或新建一条收藏。" : "在 SQL 查询编辑器中点击“保存收藏”，即可在这里管理常用语句。"}</span>
          </div>
        ) : filtered.map((snippet) => {
          const connection = connections.find((item) => item.id === snippet.connectionId);
          return (
            <article className="sql-snippet-card" key={snippet.id}>
              <div className="sql-snippet-card-heading">
                <span className="sql-snippet-icon"><FileCode2 size={15} /></span>
                <div><b>{snippet.name}</b><small>{connection ? `${connection.name} · ${protocolName(connection)}` : "通用 SQL"}</small></div>
                <div className="sql-snippet-actions">
                  <button className="secondary-button" type="button" onClick={() => onOpen(snippet)}><Code2 size={13} />在查询中打开</button>
                  <button className="icon-button small danger-button" type="button" title="删除收藏" aria-label={`删除收藏 ${snippet.name}`} onClick={() => onDelete(snippet)}><Trash2 size={13} /></button>
                </div>
              </div>
              <pre>{snippet.sqlText}</pre>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SqlSnippetDialog({
  value,
  onChange,
  onClose,
  onSubmit,
}: {
  value: { name: string; sqlText: string };
  onChange: (value: { name: string; sqlText: string }) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="connection-dialog" role="dialog" aria-modal="true" aria-labelledby="sql-snippet-dialog-title">
        <header className="dialog-header">
          <div>
            <h2 id="sql-snippet-dialog-title">新建收藏</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <form className="connection-form" onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="form-field full-field">
              <span>收藏名称</span>
              <input autoFocus maxLength={80} value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="例如：近 7 天订单" />
            </label>
            <label className="form-field full-field">
              <span>SQL 语句</span>
              <textarea className="sql-snippet-textarea" spellCheck={false} value={value.sqlText} onChange={(event) => onChange({ ...value, sqlText: event.target.value })} placeholder="输入要保存的 SQL" />
            </label>
          </div>
          <footer className="dialog-footer">
            <div className="connection-test-result" aria-hidden="true" />
            <button type="button" className="secondary-button" onClick={onClose}>取消</button>
            <button type="submit" className="primary-button"><Check size={14} />保存收藏</button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function HistoryPage({
  entries,
  connections,
  loading,
  search,
  filter,
  setFilter,
  kind,
  setKind,
  connectionId,
  onClearConnectionFilter,
  onRefresh,
  onClear,
  onOpenConnection,
  onDelete,
}: {
  entries: HistoryEntry[];
  connections: Connection[];
  loading: boolean;
  search: string;
  filter: "all" | "success" | "failed";
  setFilter: (value: "all" | "success" | "failed") => void;
  kind: ConnectionKind | "all";
  setKind: (value: ConnectionKind | "all") => void;
  connectionId: string | null;
  onClearConnectionFilter: () => void;
  onRefresh: () => void;
  onClear: () => void;
  onOpenConnection: (id: string) => void;
  onDelete: (entry: HistoryEntry) => void;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const filtered = entries.filter((entry) => {
    if (filter === "success" && !entry.succeeded) return false;
    if (filter === "failed" && entry.succeeded) return false;
    if (connectionId && entry.connectionId !== connectionId) return false;
    const connection = connections.find((item) => item.id === entry.connectionId);
    if (kind !== "all" && connection?.kind !== kind) return false;
    const haystack = `${historyLabel(entry.sqlText)} ${connection?.name || ""} ${connection?.host || ""} ${entry.error || ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  return (
    <div className="secondary-page history-page">
      <div className="page-heading">
        <div>
          <h1>会话历史</h1>
        </div>
        <div className="history-heading-actions">
          {connectionId && <span className="history-scope">{connections.find((item) => item.id === connectionId)?.name || "当前连接"}<button type="button" onClick={onClearConnectionFilter}>显示全部</button></span>}
          <button className="icon-button" title="刷新历史" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={15} />
          </button>
          <button className="icon-button danger-button history-clear-button" title="清空会话历史" aria-label="清空会话历史" onClick={onClear} disabled={!entries.length || loading}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="history-toolbar">
        <div className="segmented-control" aria-label="筛选历史记录">
          {(["all", "success", "failed"] as const).map((value) => (
            <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
              {value === "all" ? "全部" : value === "success" ? "成功" : "失败"}
            </button>
          ))}
        </div>
        <label className="history-kind-filter">
          <span className="sr-only">连接类型</span>
          <DropdownSelect
            className="history-filter-dropdown"
            value={kind}
            ariaLabel="连接类型"
            options={[
              { value: "all", label: "所有类型" },
              { value: "sql", label: "SQL 数据库" },
              { value: "redis", label: "Redis" },
              { value: "mongo", label: "MongoDB" },
              { value: "ssh", label: "SSH" },
              { value: "sftp", label: "SFTP" },
              { value: "ftp", label: "FTP" },
            ]}
            onChange={(value) => setKind(value as ConnectionKind | "all")}
          />
        </label>
      </div>
      <div className="history-table-wrap">
        {loading ? (
          <div className="history-empty"><span className="mini-spinner" />读取历史记录…</div>
        ) : filtered.length === 0 ? (
          <div className="history-empty">
            <Clock3 size={20} />
            <b>{entries.length ? "没有匹配的记录" : "暂无会话历史"}</b>
            <span>{entries.length ? "调整搜索词、状态或连接类型筛选。" : "成功和失败的操作会保存在本机。"}</span>
          </div>
        ) : (
          <table className="history-table">
            <thead><tr><th>操作</th><th>连接</th><th>结果</th><th>耗时</th><th>时间</th><th /></tr></thead>
            <tbody>
              {filtered.map((entry) => {
                const connection = connections.find((item) => item.id === entry.connectionId);
                const expanded = expandedId === entry.id;
                return (
                  <Fragment key={entry.id}>
                  <tr className={expanded ? "history-row expanded" : "history-row"}>
                    <td title={entry.sqlText}>
                      <span className={`history-result-icon ${entry.succeeded ? "success" : "failed"}`}>
                        {entry.succeeded ? <Check size={13} /> : <AlertCircle size={13} />}
                      </span>
                      <button className="history-operation" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : entry.id)}>
                        <b>{historyLabel(entry.sqlText)}</b>
                        {entry.error && <small title={entry.error}>{entry.error}</small>}
                      </button>
                    </td>
                    <td>
                      {connection ? (
                        <button className="history-connection" onClick={() => onOpenConnection(connection.id)}>
                          <span className={`connection-icon ${connection.kind}`}><ProtocolIcon connection={connection} size={12} /></span>
                          <span>{connection.name}</span>
                        </button>
                      ) : <span className="history-muted">已删除连接</span>}
                    </td>
                    <td><span className={`history-status ${entry.succeeded ? "success" : "failed"}`}>{entry.succeeded ? "成功" : "失败"}</span></td>
                    <td className="history-mono">{entry.elapsedMs} ms</td>
                    <td className="history-time">{new Date(entry.createdAt).toLocaleString()}</td>
                    <td className="history-row-actions">
                      {connection && <button className="icon-button small" title="打开连接" onClick={() => onOpenConnection(connection.id)}><ArrowUpRight size={13} /></button>}
                      <button className="icon-button small danger-button" title="删除记录" aria-label="删除记录" onClick={() => onDelete(entry)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="history-detail-row">
                      <td colSpan={6}>
                        <div className="history-detail">
                          <div><span>完整操作</span><pre>{entry.sqlText}</pre></div>
                          {entry.error && <div className="history-detail-error"><span>错误信息</span><pre>{entry.error}</pre></div>}
                          <span className="history-detail-meta">影响行数 {entry.rowsAffected} · 耗时 {entry.elapsedMs} ms</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EmptySection({
  title,
  description,
  icon,
  action,
  onAction,
}: {
  title: string;
  description?: string;
  icon: ReactNode;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="secondary-page">
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        <button className="secondary-button" onClick={onAction}>
          {action}
          <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="empty-state section-empty">
        <span className="section-empty-icon">{icon}</span>
        <b>暂无记录</b>
        <span>这里会显示你最近使用的内容。</span>
      </div>
    </div>
  );
}

function ConnectionDialog({
  draft,
  setDraft,
  mode,
  onClose,
  onSubmit,
  notify,
  confirmInApp,
}: {
  draft: Connection;
  setDraft: (draft: Connection) => void;
  mode: "new" | "edit";
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  notify: (kind: Toast["kind"], message: string) => void;
  confirmInApp: (title: string, message: string, confirmLabel?: string, destructive?: boolean) => Promise<boolean>;
}) {
  const [step, setStep] = useState(mode === "edit" ? 1 : 0);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTest, setConnectionTest] = useState<{
    kind: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const typeOption = protocolOptions.find(
    (option) =>
      option.kind === draft.kind &&
      (!option.driver || option.driver === draft.sqlDriver),
  );
  const update = (changes: Partial<Connection>) => {
    setConnectionTest(null);
    setDraft({ ...draft, ...changes });
  };
  const sshConnection = draft.kind === "ssh" || draft.kind === "sftp";
  const ftpConnection = draft.kind === "ftp";
  const dockerConnection = draft.kind === "docker";
  const selectProtocol = (option: (typeof protocolOptions)[number]) => {
    const next = initialConnection(option.kind, option.driver);
    setConnectionTest(null);
    setDraft({ ...next, id: draft.id, name: draft.name || next.name });
    setStep(1);
  };
  const handleTestConnection = async () => {
    if (testingConnection) return;
    setTestingConnection(true);
    setConnectionTest({ kind: "info", message: "正在测试连接…" });
    try {
      let response = await testConnectionConfig(draft, mode === "edit");
      if (response.needsTrust && response.keyType && response.fingerprint) {
        const accepted = await confirmInApp(
          "确认 SSH 主机指纹",
          `${draft.host}:${draft.port}\n${response.keyType}\n${response.fingerprint}\n\n首次连接此主机前，请核对服务器指纹。信任后将保存在本机。`,
          "信任并继续测试",
        );
        if (!accepted) {
          setConnectionTest({ kind: "info", message: "未确认主机指纹，连接测试已取消。" });
          return;
        }
        await trustSshHostConfig(draft, response.keyType, response.fingerprint);
        response = await testConnectionConfig(draft, mode === "edit");
      }
      setConnectionTest({
        kind: "success",
        message: `${response.detail} · ${response.latencyMs} ms`,
      });
    } catch (error) {
      setConnectionTest({ kind: "error", message: String(error) });
    } finally {
      setTestingConnection(false);
    }
  };
  const sqlite = draft.kind === "sql" && draft.sqlDriver === "sqlite";
  const databaseType = ["sql", "redis", "mongo"].includes(draft.kind);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="connection-dialog">
        <header className="dialog-header">
          <div>
            <div className="dialog-kicker">
              {mode === "edit" ? "连接配置" : "新建资源"}
            </div>
            <h2>
              {mode === "edit"
                ? "编辑连接"
                : step === 0
                  ? "选择连接类型"
                  : "配置连接"}
            </h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        {step === 0 ? (
          <div className="protocol-picker">
            {[
              { title: "远程服务器", items: protocolOptions.slice(0, 3) },
              { title: "数据库", items: protocolOptions.filter((option) => ["sql", "redis", "mongo"].includes(option.kind)) },
              { title: "容器平台", items: protocolOptions.filter((option) => option.kind === "docker") },
            ].map((group) => (
              <section key={group.title}>
                <h3>{group.title}</h3>
                <div className="protocol-grid">
                  {group.items.map((option) => (
                    <button
                      key={`${option.kind}-${option.driver || ""}`}
                      className="protocol-option"
                      onClick={() => selectProtocol(option)}
                    >
                      <span
                        className={`connection-icon protocol-choice ${option.kind}`}
                      >
                        <ProtocolIcon
                          connection={initialConnection(
                            option.kind,
                            option.driver,
                          )}
                          size={16}
                        />
                      </span>
                      <span>
                        <b>{option.label}</b>
                        <small>{option.description}</small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <form className="connection-form" onSubmit={onSubmit}>
            <div className="selected-protocol">
              <span className={`connection-icon ${draft.kind}`}>
                <ProtocolIcon connection={draft} size={16} />
              </span>
              <span>
                <b>{typeOption?.label || protocolName(draft)}</b>
                <small>{typeOption?.description}</small>
              </span>
              {mode === "new" && (
                <button
                  type="button"
                  className="change-protocol"
                  onClick={() => setStep(0)}
                >
                  更改类型
                </button>
              )}
            </div>
            <div className="form-grid">
              <label className="form-field full-field">
                <span>
                  连接名称 <i>*</i>
                </span>
                <input
                  autoFocus
                  value={draft.name}
                  onChange={(event) => update({ name: event.target.value })}
                  placeholder="例如：生产数据库"
                />
              </label>
              {sqlite ? (
                <label className="form-field full-field">
                  <span>
                    数据库文件路径 <i>*</i>
                  </span>
                  <input
                    value={draft.sqlitePath || ""}
                    onChange={(event) =>
                      update({ sqlitePath: event.target.value })
                    }
                    placeholder="C:\data\app.db"
                  />
                </label>
              ) : (
                <>
                  <label className="form-field">
                    <span>
                      主机地址 <i>*</i>
                    </span>
                    <input
                      value={draft.host}
                      onChange={(event) => update({ host: event.target.value })}
                      placeholder={dockerConnection ? "tcp://host:2375、unix:///var/run/docker.sock 或 npipe://…" : "hostname 或 IP"}
                    />
                  </label>
                  {!(dockerConnection && /^(unix|npipe):\/\//i.test(draft.host.trim())) && <label className="form-field">
                    <span>端口</span>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={draft.port || ""}
                      onChange={(event) => {
                        const rawPort = event.target.value;
                        update({ port: rawPort === "" ? 0 : Number(rawPort) });
                      }}
                    />
                  </label>}
                </>
              )}
              {!sqlite && !dockerConnection && !(ftpConnection && draft.ftpAnonymous) && (
                <label className="form-field">
                  <span>用户名</span>
                  <input
                    value={draft.username}
                    onChange={(event) =>
                      update({ username: event.target.value })
                    }
                    placeholder="用户名"
                  />
                </label>
              )}
              {!sqlite && !dockerConnection && (
                <label className="form-field">
                  <span>
                    {sshConnection && draft.authMethod === "private-key"
                      ? "私钥密码（可选）"
                      : "密码"}
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={
                      sshConnection && draft.authMethod === "private-key"
                        ? draft.keyPassphrase || ""
                        : draft.password || ""
                    }
                    onChange={(event) => {
                      if (sshConnection && draft.authMethod === "private-key") {
                        update({ keyPassphrase: event.target.value });
                      } else {
                        update({ password: event.target.value });
                      }
                    }}
                    placeholder={mode === "edit" ? "留空以保留原密码" : "密码"}
                  />
                </label>
              )}
              {sshConnection && (
                <>
                  <label className="form-field">
                    <span>SSH 认证</span>
                    <DropdownSelect
                      className="connection-dropdown"
                      value={draft.authMethod || "password"}
                      ariaLabel="SSH 认证"
                      options={[{ value: "password", label: "密码" }, { value: "private-key", label: "私钥文件" }]}
                      onChange={(value) => update({ authMethod: value as Connection["authMethod"] })}
                    />
                  </label>
                  {draft.authMethod === "private-key" && (
                    <label className="form-field full-field">
                      <span>私钥文件</span>
                      <div className="key-path-field">
                        <input
                          value={draft.keyPath || ""}
                          onChange={(event) =>
                            update({ keyPath: event.target.value })
                          }
                          placeholder="选择或输入私钥路径"
                        />
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={async () => {
                            try {
                              const path = await choosePrivateKey();
                              if (path) update({ keyPath: path });
                            } catch (error) {
                              notify("error", String(error));
                            }
                          }}
                        >
                          <FileKey2 size={14} />
                          浏览
                        </button>
                      </div>
                    </label>
                  )}
                </>
              )}
              {databaseType && !sqlite && (
                <label className="form-field">
                  <span>
                    {draft.kind === "redis"
                      ? "逻辑数据库"
                      : draft.sqlDriver === "oracle"
                        ? "Oracle 服务名"
                        : "默认数据库"}
                  </span>
                  <input
                    type={draft.kind === "redis" ? "number" : "text"}
                    min={draft.kind === "redis" ? 0 : undefined}
                    value={
                      draft.kind === "redis"
                        ? (draft.redisDb ?? 0).toString()
                        : draft.database || ""
                    }
                    onChange={(event) => {
                      if (draft.kind === "redis") {
                        update({ redisDb: Math.max(0, Number(event.target.value)) });
                      } else {
                        update({ database: event.target.value });
                      }
                    }}
                    placeholder={draft.kind === "redis" ? "0" : draft.sqlDriver === "oracle" ? "例如 FREEPDB1" : "数据库名称"}
                  />
                </label>
              )}
              {draft.kind === "mongo" && (
                <label className="form-field">
                  <span>认证数据库</span>
                  <input
                    value={draft.mongoAuthDb || "admin"}
                    onChange={(event) =>
                      update({ mongoAuthDb: event.target.value })
                    }
                    placeholder="admin"
                  />
                </label>
              )}
              {(databaseType || (dockerConnection && !/^(unix|npipe):\/\//i.test(draft.host.trim()))) && !sqlite && (
                <label className="form-field">
                  <span>加密连接</span>
                  <DropdownSelect
                    className="connection-dropdown"
                    value={draft.useTls ? "on" : "off"}
                    ariaLabel="加密连接"
                    options={[{ value: "off", label: dockerConnection ? "HTTP / TCP" : "关闭 TLS" }, { value: "on", label: "HTTPS / TLS" }]}
                    onChange={(value) => update({ useTls: value === "on" })}
                  />
                </label>
              )}
              {dockerConnection && draft.useTls && (
                <>
                  {([
                    ["dockerTlsCa", "CA 证书", "ca.pem"],
                    ["dockerTlsCert", "客户端证书", "cert.pem"],
                    ["dockerTlsKey", "客户端私钥", "key.pem"],
                  ] as const).map(([field, label, placeholder]) => (
                    <label className="form-field full-field" key={field}>
                      <span>{label}</span>
                      <div className="key-path-field">
                        <input value={draft[field] || ""} onChange={(event) => update({ [field]: event.target.value })} placeholder={placeholder} />
                        <button type="button" className="secondary-button" onClick={async () => { try { const path = await chooseLocalFile(); if (path) update({ [field]: path }); } catch (error) { notify("error", String(error)); } }}><FolderOpen size={14} />浏览</button>
                      </div>
                    </label>
                  ))}
                  <div className="form-note full-field"><ShieldCheck size={13} />Docker TLS 连接需要 CA 证书、客户端证书和客户端私钥。</div>
                </>
              )}
              {ftpConnection && (
                <>
                  <label className="form-field">
                    <span>传输安全</span>
                    <DropdownSelect
                      className="connection-dropdown"
                      value={draft.ftpSecure ? "ftps" : "ftp"}
                      ariaLabel="传输安全"
                      options={[{ value: "ftp", label: "FTP" }, { value: "ftps", label: "显式 FTPS" }]}
                      onChange={(value) => update({ ftpSecure: value === "ftps" })}
                    />
                  </label>
                  <label className="form-field">
                    <span>匿名登录</span>
                    <DropdownSelect
                      className="connection-dropdown"
                      value={draft.ftpAnonymous ? "yes" : "no"}
                      ariaLabel="匿名登录"
                      options={[{ value: "no", label: "关闭" }, { value: "yes", label: "开启" }]}
                      onChange={(value) => update({ ftpAnonymous: value === "yes" })}
                    />
                  </label>
                </>
              )}
              <label className="form-field full-field">
                <span>备注</span>
                <input
                  value={draft.notes || ""}
                  onChange={(event) => update({ notes: event.target.value })}
                  placeholder="可选"
                />
              </label>
            </div>
            <div className="dialog-security">
              <ShieldCheck size={14} />
              <span>凭据保存在本机加密保险库中。</span>
            </div>
            <footer className="dialog-footer">
              <div className={`connection-test-result ${connectionTest?.kind || ""}`} aria-live="polite">
                {testingConnection ? <span className="mini-spinner" /> : connectionTest?.kind === "success" ? <Check size={13} /> : connectionTest?.kind === "error" ? <AlertCircle size={13} /> : null}
                {connectionTest?.message}
              </div>
              <button
                type="button"
                className="secondary-button test-connection-button"
                disabled={testingConnection}
                onClick={() => void handleTestConnection()}
              >
                {testingConnection ? <span className="mini-spinner" /> : <Cable size={14} />}
                测试连接
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
              >
                取消
              </button>
              <button type="submit" className="primary-button" disabled={testingConnection}>
                <Check size={15} />
                {mode === "edit" ? "保存更改" : "保存连接"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
