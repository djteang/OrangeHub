import { Channel, invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isNative = Boolean(window.__TAURI_INTERNALS__);

export type ConnectionKind = "ssh" | "sftp" | "ftp" | "sql" | "redis" | "mongo" | "docker";
export type AiApiFormat = "openai-chat-completions" | "openai-responses" | "anthropic-messages" | "google-gemini";
export type AiPromptKey = "serverControl" | "sqlPolish" | "databaseControl";
export type AiPromptConfig = Record<AiPromptKey, string>;
export type AiStreamEvent = { type: "chunk"; text: string } | { type: "done" };

export const defaultAiPrompts: AiPromptConfig = {
  serverControl: `你是 OrangeHub 中的服务器运维助手。请使用简体中文与用户沟通，先确认目标、服务器环境和执行影响，再给出清晰、可复核的操作步骤。\n\n执行原则：\n1. 优先提供只读检查命令；解释命令用途、预期结果和必要前提。\n2. 根据当前操作系统、Shell 和已知环境生成兼容命令；信息不足时先询问，不要猜测主机、路径或服务名。\n3. 修改配置、重启服务、安装软件、批量操作等变更需先说明影响、备份/回滚方式，并等待用户明确确认后再执行。\n4. 删除数据、格式化磁盘、修改防火墙/账户/权限等高风险操作必须逐项说明对象与后果，不得擅自执行。\n5. 不要索取、输出或写入密码、私钥、令牌等凭据；发现凭据时避免复述。\n6. 若要执行命令，每次只提供一条非交互、可独立审核的命令，放入标注 bash、sh 或 powershell 的代码块；不生成多命令脚本，不调用编辑器、tail -f、top 等持续运行程序，不要求交互式密码输入。解释影响后等待用户通过 OrangeHub 的确认操作执行。执行失败时分析结果并提出最小风险的下一步，不要连续盲目重试。`,
  sqlPolish: `你是 OrangeHub 的 SQL 编写与润色助手。使用简体中文说明，重点保证 SQL 正确、安全、易读，并保留用户表达的业务语义。\n\n工作要求：\n1. 先识别数据库类型和方言（如 MySQL、TiDB、PostgreSQL、SQLite、SQL Server、Oracle）；未提供时指出假设或询问，不要混用方言。\n2. 输出可直接使用的格式化 SQL，并简要列出优化点、索引或执行计划方面的建议；不要虚构表、列、索引或数据。将最终 SQL 单独放入 sql 代码块。\n3. 优先使用参数化查询。涉及用户输入时提示绑定参数，避免拼接造成注入。当前 SQL 编辑器支持 MySQL/TiDB 的有序 ? 占位符；使用时请同时清楚列出每个占位符对应的参数值和类型。其他数据库按其驱动支持的占位符格式说明，不要把问号当作通用占位符。\n4. 涉及 UPDATE、DELETE、DROP、TRUNCATE、权限变更或大范围写入时，先给出影响范围检查语句和事务/备份建议，不把危险语句作为默认直接执行方案。\n5. 不擅自改变筛选条件、排序、NULL 处理、精度或事务语义；发现歧义先说明。\n6. SQL 与解释分开输出；如需修改原 SQL，保留一份清晰的最终版本。`,
  databaseControl: `你是 OrangeHub 中的数据库与数据表管理助手。使用简体中文，依据当前连接的数据库协议、对象结构和用户授权协助检查与管理。

操作原则：
1. 操作前确认目标数据库、表、集合、键、字段和范围；优先读取结构，不臆造对象或数据，也不要要求或输出真实记录中的敏感值。
2. 按当前数据库协议输出内容：SQL 数据库使用当前方言的 SQL；Redis 使用 Redis 原生命令；MongoDB 使用 JSON 命令。最终可执行内容单独放入对应语言代码块，方便用户检查后使用。
3. 建表、改表、导入、更新、删除等变更先说明影响行数、锁表或兼容性风险。删除数据库/表、清空数据、批量改写、修改主键或权限属于高风险操作，必须再次核对目标并提示备份或回滚方案。
4. 查询和写入值使用参数绑定或安全的协议形式。MySQL/TiDB 使用 ? 占位符时，在 SQL 代码块后另起“参数绑定：”一节，按占位符顺序逐行写成“?1 = 值 (数字/文本/布尔/NULL)”，确保参数值清晰可提取。不要将敏感数据、连接凭据或密钥写入提示、日志或结果摘要。
5. 尽可能提供可回滚方案。OrangeHub 不会自动运行你生成的命令，用户会在编辑器中检查后决定是否执行。
6. 如果缺少权限、结构或上下文，先请求补充信息，不要通过猜测继续操作。`,
};

export type AiProviderConfig = {
  id: string;
  name: string;
  vendor: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  format: AiApiFormat;
  enabled: boolean;
  prompts: AiPromptConfig;
};

export function normalizeAiProviderConfig(provider: AiProviderConfig): AiProviderConfig {
  const prompts = (provider.prompts || {}) as Partial<AiPromptConfig>;
  return {
    ...provider,
    prompts: {
      serverControl: typeof prompts.serverControl === "string" ? prompts.serverControl : defaultAiPrompts.serverControl,
      sqlPolish: typeof prompts.sqlPolish === "string" ? prompts.sqlPolish : defaultAiPrompts.sqlPolish,
      databaseControl: typeof prompts.databaseControl === "string" ? prompts.databaseControl : defaultAiPrompts.databaseControl,
    },
  };
}
export type Connection = {
  id: string;
  name: string;
  kind: ConnectionKind;
  groupId?: string | null;
  host: string;
  port: number;
  username: string;
  password?: string;
  keyPassphrase?: string;
  authMethod?: "password" | "private-key" | "agent" | "keyboard-interactive";
  keyPath?: string;
  ftpSecure?: boolean;
  ftpAnonymous?: boolean;
  sqlDriver?: string;
  database?: string;
  sqlitePath?: string;
  mongoUri?: string;
  mongoAuthDb?: string;
  dockerTlsCa?: string;
  dockerTlsCert?: string;
  dockerTlsKey?: string;
  redisDb?: number;
  useTls?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DockerContainer = {
  Id?: string;
  Names?: string[];
  Image?: string;
  State?: string;
  Status?: string;
  Created?: number;
  Ports?: { PrivatePort: number; PublicPort?: number; Type?: string; IP?: string }[];
};
export type DockerImage = { Id: string; RepoTags?: string[]; Size: number; Created: number; Containers?: number };
export type DockerNetwork = { Id?: string; Name?: string; Driver?: string; Scope?: string; IPAM?: { Config?: { Subnet?: string }[] } };
export type DockerVolume = { Name: string; Driver?: string; Mountpoint?: string; Scope?: string; CreatedAt?: string };
export type DockerInspect = Record<string, unknown>;

export type ColumnDef = { name: string; data_type: string };
export type Cell = null | boolean | number | string;
export type SqlParameter = { kind: "text" | "number" | "boolean" | "null"; value: string; configured?: boolean };
export type QueryResult = {
  columns: ColumnDef[];
  rows: Cell[][];
  rows_affected: number;
  elapsed_ms: number;
  is_exec: boolean;
  message?: string | null;
};
export type SqlDatabase = { name: string };
export type SqlTable = { name: string; kind: string };
export type SqlColumn = {
  original_name?: string;
  name: string;
  data_type: string;
  nullable: boolean;
  primary_key: boolean;
  default_value?: string | null;
  extra?: string;
  comment?: string;
  character_set?: string;
  collation?: string;
};
export type SqlTableData = {
  columns: SqlColumn[];
  rows: Cell[][];
  primary_key: string[];
  total_rows: number;
  page: number;
  page_size: number;
};
export type RedisKeyInfo = { key: string; keyToken: string; kind: string; ttl: number };
export type RedisKeyPage = { cursor: number; keys: RedisKeyInfo[] };
export type RedisKeyDetail = RedisKeyInfo & { value: string };
export type MongoDatabaseInfo = { name: string };
export type MongoCollectionInfo = { name: string };
export type MongoDocumentRow = { id: string; document: string };
export type MongoDocumentPage = { documents: MongoDocumentRow[]; total: number; page: number; page_size: number };
export type HistoryEntry = {
  id: number;
  connectionId?: string | null;
  sqlText: string;
  succeeded: boolean;
  rowsAffected: number;
  elapsedMs: number;
  error?: string | null;
  createdAt: string;
};
export type SqlSnippet = {
  id: string;
  connectionId?: string | null;
  name: string;
  sqlText: string;
  tags?: string | null;
  createdAt?: string | null;
};
export type SshTerminalEvent =
  | { type: "output"; data: number[] }
  | { type: "closed"; exitCode: number | null }
  | { type: "error"; message: string };
export type TransferProgressEvent =
  | { type: "started"; name: string; total?: number | null }
  | { type: "progress"; transferred: number; total?: number | null }
  | { type: "done"; bytes: number }
  | { type: "failed"; message: string };
export type SshMonitorSnapshot = {
  cpuTotal: number | null;
  cpuIdle: number | null;
  memoryTotalBytes: number | null;
  memoryAvailableBytes: number | null;
  diskReadBytes: number | null;
  diskWriteBytes: number | null;
  networkRxBytes: number | null;
  networkTxBytes: number | null;
  diskTotalBytes: number | null;
  diskUsedBytes: number | null;
  diskDevices: SshMonitorDiskCounter[];
  networkDevices: SshMonitorNetworkCounter[];
};
export type SshMonitorDiskCounter = { name: string; readBytes: number; writeBytes: number };
export type SshMonitorNetworkCounter = { name: string; rxBytes: number; txBytes: number };
export type SshMonitorHistoryPoint = {
  sampledAt: number;
  cpuPercent: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  diskRates: { name: string; readBytesPerSecond: number | null; writeBytesPerSecond: number | null }[];
  networkRates: { name: string; rxBytesPerSecond: number | null; txBytesPerSecond: number | null }[];
};
export type FileEntry = {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  modified?: number | null;
  permissions?: string | null;
  owner?: string | null;
  group?: string | null;
};

const demoConnections: Connection[] = [
  {
    id: "demo-prod-mysql",
    name: "生产集群",
    kind: "sql",
    sqlDriver: "mysql",
    host: "db-prod.internal",
    port: 3306,
    username: "readonly",
    database: "commerce",
    notes: "只读账号 · 华东一区",
  },
  {
    id: "demo-tidb",
    name: "订单 TiDB",
    kind: "sql",
    sqlDriver: "tidb",
    host: "tidb.ops.internal",
    port: 4000,
    username: "app_reader",
    database: "orders",
  },
  {
    id: "demo-redis",
    name: "缓存节点 01",
    kind: "redis",
    host: "10.0.4.18",
    port: 6379,
    username: "default",
    database: "0",
  },
  {
    id: "demo-mongo",
    name: "日志 MongoDB",
    kind: "mongo",
    host: "mongo.ops.internal",
    port: 27017,
    username: "analyst",
    database: "observability",
  },
  {
    id: "demo-bastion",
    name: "运维跳板机",
    kind: "ssh",
    host: "jump.ops.internal",
    port: 22,
    username: "ops",
  },
  {
    id: "demo-assets",
    name: "静态资源",
    kind: "sftp",
    host: "10.0.2.45",
    port: 22,
    username: "deploy",
    database: "/srv/assets",
  },
  {
    id: "demo-backup",
    name: "备份 FTP",
    kind: "ftp",
    host: "ftp.backup.internal",
    port: 21,
    username: "backup",
    database: "/",
  },
];

function readDemoConnections(): Connection[] {
  const saved = localStorage.getItem("orangehub.connections");
  if (!saved) return demoConnections;
  try {
    return JSON.parse(saved) as Connection[];
  } catch {
    return demoConnections;
  }
}

function saveDemoConnections(connections: Connection[]) {
  localStorage.setItem("orangehub.connections", JSON.stringify(connections));
}

export async function getVaultStatus() {
  if (isNative)
    return invoke<{
      mode: "unset" | "master" | "convenience";
      locked: boolean;
    }>("vault_status");
  return { mode: "convenience" as const, locked: false };
}

export async function initializeVault(masterPassword: string) {
  if (isNative) return invoke("vault_initialize", { masterPassword });
}

export async function unlockVault(masterPassword: string) {
  if (isNative) return invoke("vault_unlock", { masterPassword });
}

export async function lockVault() {
  if (isNative) return invoke("vault_lock");
}

export async function getDataDirectory() {
  if (isNative) return invoke<string>("get_data_directory");
  return "浏览器本地存储（当前设备）";
}

export async function configureDataDirectory(dataDirectory: string) {
  if (isNative) {
    return invoke<boolean>("configure_data_directory", { dataDirectory });
  }
  return false;
}

export async function getConnections() {
  if (isNative) return invoke<Connection[]>("list_connections");
  return readDemoConnections();
}

export async function getAiProviders() {
  if (isNative) {
    const payload = await invoke<string>("get_ai_providers");
    const stored = JSON.parse(payload) as AiProviderConfig[];
    return stored.map(normalizeAiProviderConfig);
  }
  const stored = localStorage.getItem("orangehub-ai-providers-v1");
  return stored ? (JSON.parse(stored) as AiProviderConfig[]).map(normalizeAiProviderConfig) : [];
}

export async function saveAiProviders(providers: AiProviderConfig[]) {
  const payload = JSON.stringify(providers.map(normalizeAiProviderConfig));
  if (isNative) {
    await invoke("save_ai_providers", { payload });
    return;
  }
  localStorage.setItem("orangehub-ai-providers-v1", payload);
}

export async function invokeAiStream(
  providerId: string,
  systemPrompt: string,
  userPrompt: string,
  onEvent: (event: AiStreamEvent) => void,
) {
  if (!isNative) throw new Error("AI 助手仅在 OrangeHub 桌面客户端中可用");
  if (!providerId) throw new Error("请先在设置中添加并启用 AI 服务");
  const channel = new Channel<AiStreamEvent>();
  let resolveStream!: () => void;
  const streamFinished = new Promise<void>((resolve) => { resolveStream = resolve; });
  channel.onmessage = (event) => {
    onEvent(event);
    if (event.type === "done") resolveStream();
  };
  await invoke<void>("invoke_ai", { providerId, systemPrompt, userPrompt, onEvent: channel });
  await streamFinished;
}

export async function saveConnection(connection: Connection) {
  if (isNative) return invoke("save_connection", { connection });
  const connections = readDemoConnections();
  saveDemoConnections([
    connection,
    ...connections.filter((item) => item.id !== connection.id),
  ]);
}

export async function deleteConnection(id: string) {
  if (isNative) return invoke("delete_connection", { id });
  saveDemoConnections(readDemoConnections().filter((item) => item.id !== id));
}

export async function getHistory(limit = 2000) {
  if (isNative) return invoke<HistoryEntry[]>("list_history", { limit });
  return [];
}

export async function clearHistory() {
  if (isNative) return invoke("clear_history");
}

export async function setTrayVaultState(locked: boolean) {
  if (isNative) return invoke("set_tray_vault_state", { locked });
}

export async function deleteHistoryEntry(id: number) {
  if (isNative) return invoke("delete_history_entry", { id });
}

const demoSqlSnippetsKey = "orangehub.sql-snippets";

function readDemoSqlSnippets(): SqlSnippet[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(demoSqlSnippetsKey) || "[]");
    return Array.isArray(parsed) ? parsed as SqlSnippet[] : [];
  } catch {
    return [];
  }
}

export async function listSqlSnippets() {
  if (isNative) return invoke<SqlSnippet[]>("list_sql_snippets");
  return readDemoSqlSnippets();
}

export async function saveSqlSnippet(snippet: SqlSnippet) {
  if (isNative) return invoke("save_sql_snippet", { snippet });
  const snippets = readDemoSqlSnippets();
  window.localStorage.setItem(demoSqlSnippetsKey, JSON.stringify([
    { ...snippet, createdAt: snippet.createdAt || new Date().toISOString() },
    ...snippets.filter((item) => item.id !== snippet.id),
  ]));
}

export async function deleteSqlSnippet(id: string) {
  if (isNative) return invoke("delete_sql_snippet", { id });
  window.localStorage.setItem(demoSqlSnippetsKey, JSON.stringify(readDemoSqlSnippets().filter((item) => item.id !== id)));
}

export type ConnectionTest = {
  latencyMs: number;
  detail: string;
  needsTrust?: boolean;
  keyType?: string;
  fingerprint?: string;
};

export async function testConnection(id: string) {
  if (isNative) return invoke<ConnectionTest>("test_connection", { id });
  await new Promise((resolve) => window.setTimeout(resolve, 460));
  return { latencyMs: 18 + Math.floor(Math.random() * 35), detail: "演示环境" };
}

export async function testConnectionConfig(
  connection: Connection,
  useSavedSecrets: boolean,
) {
  if (isNative)
    return invoke<ConnectionTest>("test_connection_config", {
      connection,
      useSavedSecrets,
    });
  await new Promise((resolve) => window.setTimeout(resolve, 460));
  return {
    latencyMs: 18 + Math.floor(Math.random() * 35),
    detail: "浏览器演示环境，未连接远程服务",
  };
}

export async function dockerListContainers(id: string) {
  if (!isNative) throw new Error("Docker 管理仅在 OrangeHub 桌面客户端中可用");
  return invoke<DockerContainer[]>("docker_list_containers", { id });
}
export async function dockerDashboard(id: string) {
  if (!isNative) throw new Error("Docker 管理仅在 OrangeHub 桌面客户端中可用");
  return invoke<{ version?: { Version?: string; ApiVersion?: string }; info?: Record<string, unknown> }>("docker_dashboard", { id });
}
export async function dockerContainerAction(id: string, containerId: string, action: "start" | "stop" | "restart" | "pause" | "unpause" | "remove") {
  if (isNative) return invoke<void>("docker_container_action", { id, containerId, action });
}
export async function dockerContainerLogs(id: string, containerId: string, tail = 300) {
  if (!isNative) throw new Error("Docker 管理仅在桌面应用中可用");
  return invoke<string>("docker_container_logs", { id, containerId, tail });
}
export async function dockerInspectContainer(id: string, containerId: string) {
  if (!isNative) throw new Error("Docker 管理仅在桌面应用中可用");
  return invoke<DockerInspect>("docker_inspect_container", { id, containerId });
}
export async function dockerCreateContainer(id: string, name: string, image: string, ports: string[] = [], env: string[] = [], volumes: string[] = [], restartPolicy: "no" | "always" | "unless-stopped" | "on-failure" = "no") {
  if (!isNative) throw new Error("Docker 管理仅在桌面应用中可用");
  return invoke<string>("docker_create_container", { id, name, image, ports, env, volumes, restartPolicy });
}
export async function dockerListImages(id: string) {
  if (!isNative) throw new Error("Docker 管理仅在桌面应用中可用");
  return invoke<DockerImage[]>("docker_list_images", { id });
}
export async function dockerPullImage(id: string, image: string) {
  if (!isNative) throw new Error("Docker 管理仅在桌面应用中可用");
  return invoke<string>("docker_pull_image", { id, image });
}
export async function dockerRemoveImage(id: string, imageId: string) {
  if (isNative) return invoke<void>("docker_remove_image", { id, imageId });
}
export async function dockerListNetworks(id: string) {
  if (!isNative) throw new Error("Docker 管理仅在桌面应用中可用");
  return invoke<DockerNetwork[]>("docker_list_networks", { id });
}
export async function dockerRemoveNetwork(id: string, networkId: string) {
  if (isNative) return invoke<void>("docker_remove_network", { id, networkId });
}
export async function dockerInspectNetwork(id: string, networkId: string) {
  if (!isNative) throw new Error("Docker 管理仅在 OrangeHub 桌面应用中可用");
  return invoke<Record<string, unknown>>("docker_inspect_network", { id, networkId });
}
export async function dockerCreateNetwork(id: string, name: string, driver = "bridge") {
  if (!isNative) throw new Error("Docker 管理仅在 OrangeHub 桌面应用中可用");
  return invoke<string>("docker_create_network", { id, name, driver });
}
export async function dockerListVolumes(id: string) {
  if (!isNative) throw new Error("Docker 管理仅在桌面应用中可用");
  const response = await invoke<{ Volumes?: DockerVolume[] | null }>("docker_list_volumes", { id });
  return response.Volumes || [];
}
export async function dockerRemoveVolume(id: string, volumeName: string) {
  if (isNative) return invoke<void>("docker_remove_volume", { id, volumeName });
}
export async function dockerInspectVolume(id: string, volumeName: string) {
  if (!isNative) throw new Error("Docker 管理仅在 OrangeHub 桌面应用中可用");
  return invoke<Record<string, unknown>>("docker_inspect_volume", { id, volumeName });
}
export async function dockerCreateVolume(id: string, name: string, driver = "local") {
  if (!isNative) throw new Error("Docker 管理仅在 OrangeHub 桌面应用中可用");
  return invoke<string>("docker_create_volume", { id, name, driver });
}

export async function trustSshHost(
  id: string,
  keyType: string,
  fingerprint: string,
) {
  if (isNative) return invoke("trust_ssh_host", { id, keyType, fingerprint });
}

export async function trustSshHostConfig(
  connection: Connection,
  keyType: string,
  fingerprint: string,
) {
  if (isNative)
    return invoke("trust_ssh_host_config", {
      connection,
      keyType,
      fingerprint,
    });
}

export async function executeSsh(id: string, command: string) {
  if (isNative)
    return invoke<{ output: string; exitCode: number | null }>("execute_ssh", {
      id,
      command,
    });
  return { output: "浏览器预览不连接远程主机。", exitCode: 0 };
}

export async function getSshMonitor(id: string) {
  if (isNative) return invoke<SshMonitorSnapshot>("ssh_monitor", { id });
  throw new Error("服务器监控仅在桌面应用中可用");
}

export async function saveSshMonitorHistoryPoint(id: string, point: SshMonitorHistoryPoint) {
  if (isNative) return invoke("save_ssh_monitor_history_point", { id, point });
  throw new Error("服务器监控历史仅在桌面应用中可用");
}

export async function listSshMonitorHistory(id: string, since: number) {
  if (isNative)
    return invoke<SshMonitorHistoryPoint[]>("list_ssh_monitor_history", { id, since });
  throw new Error("服务器监控历史仅在桌面应用中可用");
}

export async function openSshTerminal(
  id: string,
  cols: number,
  rows: number,
  onEvent: (event: SshTerminalEvent) => void,
) {
  if (!isNative) throw new Error("交互式 SSH 终端仅在桌面应用中可用");
  const channel = new Channel<SshTerminalEvent>();
  channel.onmessage = onEvent;
  return invoke<string>("open_ssh_terminal", {
    id,
    cols,
    rows,
    onEvent: channel,
  });
}

export async function writeSshTerminal(terminalId: string, data: string) {
  if (isNative) return invoke("write_ssh_terminal", { terminalId, data });
}

export async function resizeSshTerminal(
  terminalId: string,
  cols: number,
  rows: number,
) {
  if (isNative)
    return invoke("resize_ssh_terminal", { terminalId, cols, rows });
}

export async function closeSshTerminal(terminalId: string) {
  if (isNative) return invoke("close_ssh_terminal", { terminalId });
}

export async function remoteList(id: string, path: string) {
  if (isNative) return invoke<FileEntry[]>("remote_list", { id, path });
  throw new Error("远程文件操作仅在桌面应用中可用");
}

export async function remoteUpload(
  id: string,
  localPath: string,
  remotePath: string,
  onProgress?: (event: TransferProgressEvent) => void,
) {
  if (isNative) {
    const channel = new Channel<TransferProgressEvent>();
    if (onProgress) channel.onmessage = onProgress;
    return invoke<number>("remote_upload", { id, localPath, remotePath, onEvent: channel });
  }
  throw new Error("远程文件操作仅在桌面应用中可用");
}

export async function remoteDownload(
  id: string,
  remotePath: string,
  localPath: string,
  onProgress?: (event: TransferProgressEvent) => void,
) {
  if (isNative) {
    const channel = new Channel<TransferProgressEvent>();
    if (onProgress) channel.onmessage = onProgress;
    return invoke<number>("remote_download", { id, remotePath, localPath, onEvent: channel });
  }
  throw new Error("远程文件操作仅在桌面应用中可用");
}

export async function remoteDownloadDirectory(
  id: string,
  remotePath: string,
  localParentPath: string,
  onProgress?: (event: TransferProgressEvent) => void,
) {
  if (isNative) {
    const channel = new Channel<TransferProgressEvent>();
    if (onProgress) channel.onmessage = onProgress;
    return invoke<number>("remote_download_directory", { id, remotePath, localParentPath, onEvent: channel });
  }
  throw new Error("远程文件操作仅在桌面应用中可用");
}

export async function remoteDelete(id: string, remotePath: string, isDirectory = false) {
  if (isNative) return invoke("remote_delete", { id, remotePath, isDirectory });
  throw new Error("远程文件操作仅在桌面应用中可用");
}

export async function remoteRename(id: string, sourcePath: string, targetPath: string) {
  if (isNative) return invoke("remote_rename", { id, sourcePath, targetPath });
  throw new Error("远程文件操作仅在桌面应用中可用");
}

export async function remoteReadText(id: string, remotePath: string) {
  if (isNative) return invoke<string>("remote_read_text", { id, remotePath });
  throw new Error("远程文件编辑仅在桌面应用中可用");
}

export async function remoteWriteText(id: string, remotePath: string, contents: string) {
  if (isNative)
    return invoke("remote_write_text", { id, remotePath, contents });
  throw new Error("远程文件编辑仅在桌面应用中可用");
}

export async function chooseLocalFile() {
  if (!isNative) throw new Error("请选择桌面应用中的本地文件");
  const selected = await openDialog({ multiple: false, directory: false });
  return typeof selected === "string" ? selected : null;
}

export async function chooseSqlFile() {
  if (!isNative) throw new Error("请选择桌面应用中的 SQL 文件");
  const selected = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: "SQL 文件", extensions: ["sql"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function choosePrivateKey() {
  if (!isNative) throw new Error("私钥文件选择仅在桌面应用中可用");
  const selected = await openDialog({
    multiple: false,
    directory: false,
    filters: [
      { name: "SSH private key", extensions: ["pem", "key", "pub", "ppk", "*" ] },
    ],
  });
  return typeof selected === "string" ? selected : null;
}

export async function chooseDownloadPath(defaultPath: string) {
  if (!isNative) throw new Error("请选择桌面应用中的下载位置");
  return saveDialog({ defaultPath });
}

export async function chooseDownloadDirectory() {
  if (!isNative) throw new Error("请选择桌面应用中的下载位置");
  const selected = await openDialog({ multiple: false, directory: true });
  return typeof selected === "string" ? selected : null;
}

export async function chooseDataDirectory(defaultPath?: string) {
  if (!isNative) throw new Error("数据目录选择仅在桌面应用中可用");
  const selected = await openDialog({
    title: "选择 OrangeHub 本地数据目录",
    defaultPath,
    multiple: false,
    directory: true,
  });
  return typeof selected === "string" ? selected : null;
}

export async function restartApplication() {
  if (isNative) await invoke("restart_application");
}

export async function saveCsvFile(defaultPath: string, contents: string) {
  if (isNative) {
    const path = await saveDialog({
      defaultPath,
      filters: [{ name: "CSV 文件", extensions: ["csv"] }],
    });
    if (!path) return false;
    await invoke("write_local_text_file", { path, contents });
    return true;
  }

  const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = defaultPath;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export async function saveTextFile(defaultPath: string, extension: string, contents: string) {
  if (isNative) {
    const path = await saveDialog({
      defaultPath,
      filters: [{ name: `${extension.toUpperCase()} 文件`, extensions: [extension] }],
    });
    if (!path) return false;
    await invoke("write_local_text_file", { path, contents });
    return true;
  }
  const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = defaultPath;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

const demoSqlTables: Record<string, { columns: SqlColumn[]; rows: Cell[][]; primary_key: string[] }> = {
  orders: {
    columns: [
      { name: "order_id", data_type: "VARCHAR", nullable: false, primary_key: true },
      { name: "customer", data_type: "VARCHAR", nullable: false, primary_key: false },
      { name: "amount", data_type: "DECIMAL", nullable: false, primary_key: false },
      { name: "status", data_type: "VARCHAR", nullable: false, primary_key: false },
    ],
    rows: [
      ["OD-20261017-0842", "林知夏", 1280.5, "paid"],
      ["OD-20261017-0841", "陈予安", 699, "shipped"],
      ["OD-20261017-0839", "周时雨", 2450, "paid"],
      ["OD-20261017-0836", "许明澈", 88, "refunded"],
    ],
    primary_key: ["order_id"],
  },
  customers: {
    columns: [
      { name: "customer_id", data_type: "INTEGER", nullable: false, primary_key: true },
      { name: "name", data_type: "VARCHAR", nullable: false, primary_key: false },
      { name: "email", data_type: "VARCHAR", nullable: true, primary_key: false },
      { name: "active", data_type: "BOOLEAN", nullable: false, primary_key: false },
    ],
    rows: [
      [101, "林知夏", "zhixia@example.com", true],
      [102, "陈予安", "yuan@example.com", true],
      [103, "周时雨", null, false],
    ],
    primary_key: ["customer_id"],
  },
  products: {
    columns: [
      { name: "sku", data_type: "VARCHAR", nullable: false, primary_key: true },
      { name: "name", data_type: "VARCHAR", nullable: false, primary_key: false },
      { name: "price", data_type: "DECIMAL", nullable: false, primary_key: false },
      { name: "stock", data_type: "INTEGER", nullable: false, primary_key: false },
    ],
    rows: [
      ["KB-104", "机械键盘", 699, 42],
      ["MN-220", "无线鼠标", 249, 87],
      ["HD-510", "移动硬盘", 899, 15],
    ],
    primary_key: ["sku"],
  },
};

const demoRedisValues: Record<string, { kind: string; value: string; ttl: number }> = {
  "session:8f3a": { kind: "string", value: "user=101;role=member", ttl: 3480 },
  "cache:product:KB-104": { kind: "string", value: "{\"sku\":\"KB-104\",\"stock\":42}", ttl: 820 },
  "user:101:profile": { kind: "hash", value: '[\n  ["name", "林知夏"],\n  ["plan", "pro"]\n]', ttl: -1 },
  "queue:orders": { kind: "list", value: '[\n  "OD-20261017-0842",\n  "OD-20261017-0841"\n]', ttl: -1 },
};
const demoRedisDatabases = new Map<number, Record<string, { kind: string; value: string; ttl: number }>>([
  [0, demoRedisValues],
]);

function getDemoRedisValues(database = 0) {
  let values = demoRedisDatabases.get(database);
  if (!values) {
    values = {};
    demoRedisDatabases.set(database, values);
  }
  return values;
}

const demoMongoDocuments: Record<string, MongoDocumentRow[]> = {
  orders: [
    { id: '"OD-20261017-0842"', document: '{\n  "_id": "OD-20261017-0842",\n  "customer": "林知夏",\n  "amount": 1280.5,\n  "status": "paid"\n}' },
    { id: '"OD-20261017-0841"', document: '{\n  "_id": "OD-20261017-0841",\n  "customer": "陈予安",\n  "amount": 699,\n  "status": "shipped"\n}' },
  ],
  customers: [
    { id: '"customer-101"', document: '{\n  "_id": "customer-101",\n  "name": "林知夏",\n  "active": true\n}' },
  ],
};

export async function executeSql(id: string, statement: string, database?: string, parameters: SqlParameter[] = []) {
  if (isNative) return invoke<QueryResult>("execute_sql", { id, statement, database: database ?? null, parameters });
  await new Promise((resolve) => window.setTimeout(resolve, 280));
  if (!/\bselect\b/i.test(statement)) {
    return {
      columns: [],
      rows: [],
      rows_affected: 1,
      elapsed_ms: 8,
      is_exec: true,
      message: "Query OK, 1 row affected",
    } satisfies QueryResult;
  }
  const orders = demoSqlTables.orders;
  return {
    columns: orders.columns.map(({ name, data_type }) => ({ name, data_type })),
    rows: orders.rows.map((row) => [...row]),
    rows_affected: orders.rows.length,
    elapsed_ms: 23,
    is_exec: false,
    message: null,
  } satisfies QueryResult;
}

export async function listSqlDatabases(id: string) {
  if (isNative) return invoke<SqlDatabase[]>("list_sql_databases", { id });
  await new Promise((resolve) => window.setTimeout(resolve, 140));
  return [{ name: "commerce" }, { name: "analytics" }];
}

export async function listSqlTables(id: string, database: string) {
  if (isNative) return invoke<SqlTable[]>("list_sql_tables", { id, database });
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  return [
    { name: "orders", kind: "TABLE" },
    { name: "customers", kind: "TABLE" },
    { name: "products", kind: "TABLE" },
  ];
}

export async function createSqlDatabase(id: string, database: string) {
  if (isNative) return invoke("create_sql_database", { id, database });
  throw new Error("数据库管理仅在桌面应用中可用");
}

export async function deleteSqlDatabase(id: string, database: string) {
  if (isNative) return invoke("delete_sql_database", { id, database });
  throw new Error("数据库管理仅在桌面应用中可用");
}

export async function deleteSqlTable(id: string, database: string, table: string, isView: boolean) {
  if (isNative) return invoke("delete_sql_table", { id, database, table, isView });
  throw new Error("数据库管理仅在桌面应用中可用");
}

export async function truncateSqlTable(id: string, database: string, table: string) {
  if (isNative) return invoke("truncate_sql_table", { id, database, table });
  throw new Error("数据库管理仅在桌面应用中可用");
}

export async function dumpSqlTable(id: string, database: string, table: string, includeData: boolean) {
  if (isNative) return invoke<string>("dump_sql_table", { id, database, table, includeData });
  throw new Error("SQL 转储仅在桌面应用中可用");
}

export async function runSqlFile(id: string, database: string | null, path: string) {
  if (isNative)
    return invoke<QueryResult>("run_sql_file", { id, database, path });
  throw new Error("SQL 文件执行仅在桌面应用中可用");
}

export async function dumpSqlDatabase(id: string, database: string, includeData: boolean) {
  if (isNative) return invoke<string>("dump_sql_database", { id, database, includeData });
  throw new Error("SQL 转储仅在桌面应用中可用");
}

export async function renameSqlDatabase(id: string, database: string, target: string) {
  if (isNative) return invoke("rename_sql_database", { id, database, target });
  throw new Error("数据库管理仅在桌面应用中可用");
}

export async function getSqlTableData(
  id: string,
  database: string,
  table: string,
  page: number,
  pageSize: number,
) {
  if (isNative)
    return invoke<SqlTableData>("get_sql_table_data", {
      id,
      database,
      table,
      page,
      pageSize,
    });
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  const data = demoSqlTables[table] || demoSqlTables.orders;
  const start = (Math.max(page, 1) - 1) * pageSize;
  return {
    columns: data.columns.map((column) => ({ ...column, original_name: column.original_name || column.name })),
    rows: data.rows.slice(start, start + pageSize).map((row) => [...row]),
    primary_key: [...data.primary_key],
    total_rows: data.rows.length,
    page,
    page_size: pageSize,
  } satisfies SqlTableData;
}

export async function saveSqlTableStructure(
  id: string,
  database: string,
  table: string,
  columns: SqlColumn[],
) {
  if (isNative)
    return invoke<void>("update_sql_table_structure", { id, database, table, columns });
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  const data = demoSqlTables[table];
  if (data) {
    const previousColumns = data.columns;
    const previousRows = data.rows;
    data.rows = previousRows.map((row) => columns.map((column) => {
      const sourceName = column.original_name;
      if (!sourceName) return null;
      const sourceIndex = previousColumns.findIndex((item) => item.name === sourceName);
      return sourceIndex >= 0 ? row[sourceIndex] : null;
    }));
    const nextColumns = columns.map((column) => ({ ...column, original_name: column.name }));
    data.columns = nextColumns;
    data.primary_key = nextColumns.filter((column) => column.primary_key).map((column) => column.name);
  }
  return undefined;
}

export async function insertSqlRow(
  id: string,
  database: string,
  table: string,
  columns: string[],
  values: Cell[],
) {
  if (isNative)
    return invoke<number>("insert_sql_row", { id, database, table, columns, values });
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  const data = demoSqlTables[table];
  if (data) {
    const row = data.columns.map(() => null as Cell);
    columns.forEach((column, index) => {
      const target = data.columns.findIndex((item) => item.name === column);
      if (target >= 0) row[target] = values[index];
    });
    for (const key of data.primary_key) {
      const index = data.columns.findIndex((item) => item.name === key);
      if (index >= 0 && row[index] === null) row[index] = `${key}-${Date.now()}`;
    }
    data.rows.unshift(row);
  }
  return 1;
}

export async function updateSqlCell(
  id: string,
  database: string,
  table: string,
  primaryKey: string[],
  keyValues: Cell[],
  column: string,
  value: Cell,
) {
  if (isNative)
    return invoke<number>("update_sql_cell", {
      id,
      database,
      table,
      primaryKey,
      keyValues,
      column,
      value,
    });
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  const data = demoSqlTables[table];
  if (data) {
    const row = data.rows.find((candidate) => primaryKey.every((key, index) => {
      const column = data.columns.findIndex((item) => item.name === key);
      return candidate[column] === keyValues[index];
    }));
    const target = data.columns.findIndex((item) => item.name === column);
    if (row && target >= 0) row[target] = value;
  }
  return 1;
}

export async function deleteSqlRow(
  id: string,
  database: string,
  table: string,
  primaryKey: string[],
  keyValues: Cell[],
) {
  if (isNative)
    return invoke<number>("delete_sql_row", {
      id,
      database,
      table,
      primaryKey,
      keyValues,
    });
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  const data = demoSqlTables[table];
  if (data) {
    const index = data.rows.findIndex((candidate) => primaryKey.every((key, keyIndex) => {
      const column = data.columns.findIndex((item) => item.name === key);
      return candidate[column] === keyValues[keyIndex];
    }));
    if (index >= 0) data.rows.splice(index, 1);
  }
  return 1;
}

export async function executeRedis(id: string, command: string, database?: number) {
  if (isNative) return invoke<unknown>("execute_redis", { id, command, database });
  await new Promise((resolve) => window.setTimeout(resolve, 220));
  return command.toUpperCase().startsWith("PING")
    ? "PONG"
    : "演示环境暂不执行命令";
}

export async function listRedisDatabases(id: string) {
  if (isNative) return invoke<number[]>("list_redis_databases", { id });
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  return Array.from({ length: 16 }, (_, index) => index);
}

export async function scanRedisKeys(id: string, pattern: string, cursor: number, count: number, database?: number) {
  if (isNative)
    return invoke<RedisKeyPage>("scan_redis_keys", { id, pattern, cursor, count, database });
  await new Promise((resolve) => window.setTimeout(resolve, 140));
  const values = getDemoRedisValues(database);
  const prefix = pattern.split("*")[0];
  const keys = Object.entries(values)
    .filter(([key]) => !prefix || key.startsWith(prefix))
    .slice(cursor, cursor + count)
    .map(([key, value]) => ({ key, keyToken: key, kind: value.kind, ttl: value.ttl }));
  const allMatches = Object.keys(values).filter((key) => !prefix || key.startsWith(prefix));
  const next = cursor + count >= allMatches.length ? 0 : cursor + count;
  return { cursor: next, keys } satisfies RedisKeyPage;
}

export async function getRedisKeyDetail(id: string, key: string, database?: number, keyToken?: string) {
  if (isNative) return invoke<RedisKeyDetail>("get_redis_key_detail", { id, key, database, keyToken });
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  const item = getDemoRedisValues(database)[key];
  if (!item) throw new Error("Redis 键不存在");
  return { key, keyToken: key, ...item } satisfies RedisKeyDetail;
}

export async function setRedisString(id: string, key: string, value: string, ttlSeconds?: number, database?: number, keyToken?: string) {
  if (isNative) return invoke<void>("set_redis_string", { id, key, value, ttlSeconds, database, keyToken });
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  getDemoRedisValues(database)[key] = { kind: "string", value, ttl: ttlSeconds && ttlSeconds > 0 ? ttlSeconds : -1 };
}

export async function deleteRedisKey(id: string, key: string, database?: number, keyToken?: string) {
  if (isNative) return invoke<number>("delete_redis_key", { id, key, database, keyToken });
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  delete getDemoRedisValues(database)[key];
  return 1;
}

export async function executeMongo(id: string, command: string) {
  if (isNative) return invoke<unknown>("execute_mongo", { id, command });
  await new Promise((resolve) => window.setTimeout(resolve, 220));
  return { ok: 1, note: "浏览器预览" };
}

export async function listMongoDatabases(id: string) {
  if (isNative) return invoke<MongoDatabaseInfo[]>("list_mongo_databases", { id });
  await new Promise((resolve) => window.setTimeout(resolve, 130));
  return [{ name: "commerce" }, { name: "admin" }];
}

export async function listMongoCollections(id: string, database: string) {
  if (isNative) return invoke<MongoCollectionInfo[]>("list_mongo_collections", { id, database });
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  return [{ name: "orders" }, { name: "customers" }];
}

export async function getMongoDocuments(id: string, database: string, collectionName: string, page: number, pageSize: number) {
  if (isNative)
    return invoke<MongoDocumentPage>("get_mongo_documents", { id, database, collectionName, page, pageSize });
  await new Promise((resolve) => window.setTimeout(resolve, 150));
  const documents = demoMongoDocuments[collectionName] || [];
  const start = (Math.max(1, page) - 1) * pageSize;
  return { documents: documents.slice(start, start + pageSize).map((item) => ({ ...item })), total: documents.length, page, page_size: pageSize } satisfies MongoDocumentPage;
}

export async function insertMongoDocument(id: string, database: string, collectionName: string, document: string) {
  if (isNative)
    return invoke<void>("insert_mongo_document", { id, database, collectionName, document });
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  const parsed = JSON.parse(document) as Record<string, unknown>;
  const docId = parsed._id ?? `demo-${Date.now()}`;
  parsed._id = docId;
  const docs = demoMongoDocuments[collectionName] || (demoMongoDocuments[collectionName] = []);
  docs.unshift({ id: JSON.stringify(docId), document: JSON.stringify(parsed, null, 2) });
}

export async function replaceMongoDocument(id: string, database: string, collectionName: string, documentId: string, document: string) {
  if (isNative)
    return invoke<number>("replace_mongo_document", { id, database, collectionName, documentId, document });
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  const docs = demoMongoDocuments[collectionName] || [];
  const index = docs.findIndex((item) => item.id === documentId);
  if (index >= 0) docs[index] = { id: documentId, document: JSON.stringify(JSON.parse(document), null, 2) };
  return index >= 0 ? 1 : 0;
}

export async function deleteMongoDocument(id: string, database: string, collectionName: string, documentId: string) {
  if (isNative)
    return invoke<number>("delete_mongo_document", { id, database, collectionName, documentId });
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  const docs = demoMongoDocuments[collectionName] || [];
  const index = docs.findIndex((item) => item.id === documentId);
  if (index >= 0) docs.splice(index, 1);
  return index >= 0 ? 1 : 0;
}
