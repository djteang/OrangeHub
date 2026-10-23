import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  CircleStop,
  Code2,
  Container,
  Download,
  FileText,
  HardDrive,
  LoaderCircle,
  Network,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  dockerContainerAction,
  dockerContainerLogs,
  dockerCreateContainer,
  dockerCreateNetwork,
  dockerCreateVolume,
  dockerDashboard,
  dockerInspectContainer,
  dockerInspectNetwork,
  dockerInspectVolume,
  dockerListContainers,
  dockerListImages,
  dockerListNetworks,
  dockerListVolumes,
  dockerPullImage,
  dockerRemoveImage,
  dockerRemoveNetwork,
  dockerRemoveVolume,
  type Connection,
  type DockerContainer,
  type DockerImage,
  type DockerNetwork,
  type DockerVolume,
} from "./api";
import { DropdownSelect } from "./DropdownSelect";

type DockerTab = "containers" | "images" | "networks" | "volumes";
type Notify = (kind: "success" | "error", message: string) => void;

function formatBytes(value = 0) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDate(value?: number | string) {
  if (value === undefined || value === null || value === "") return "—";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

function containerName(container: DockerContainer) {
  return container.Names?.[0]?.replace(/^\//, "") || container.Id?.slice(0, 12) || "未命名容器";
}

type DockerRestartPolicy = "no" | "always" | "unless-stopped" | "on-failure";
type ContainerDraft = { name: string; image: string; ports: string; env: string; volumes: string; restartPolicy: DockerRestartPolicy };
type ContainerDraftKey = keyof ContainerDraft;
type DockerResourceDialog = "image" | "network" | "volume" | null;
type DockerLogs = { id: string; name: string; text: string };

const emptyContainerDraft: ContainerDraft = { name: "", image: "", ports: "", env: "", volumes: "", restartPolicy: "no" };

function shellQuote(value: string) {
  const text = value.trim();
  return text && /^[a-zA-Z0-9_./:@%+=,-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`;
}

function dockerRunCommand(draft: ContainerDraft) {
  const parts = ["docker", "run", "-d"];
  if (draft.name.trim()) parts.push("--name", shellQuote(draft.name));
  draft.ports.split(/[,\n]/).map((value) => value.trim()).filter(Boolean).forEach((value) => parts.push("-p", shellQuote(value)));
  draft.env.split(/[\n]/).map((value) => value.trim()).filter(Boolean).forEach((value) => parts.push("-e", shellQuote(value)));
  draft.volumes.split(/[,\n]/).map((value) => value.trim()).filter(Boolean).forEach((value) => parts.push("-v", shellQuote(value)));
  if (draft.restartPolicy !== "no") parts.push("--restart", shellQuote(draft.restartPolicy));
  if (draft.image.trim()) parts.push(shellQuote(draft.image));
  return parts.join(" ");
}

function commandTokens(command: string) {
  const tokens: string[] = [];
  let token = "";
  let quote = "";
  let escaped = false;
  for (const char of command.trim()) {
    if (escaped) { token += char; escaped = false; continue; }
    if (char === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) { if (char === quote) quote = ""; else token += char; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (/\s/.test(char)) { if (token) { tokens.push(token); token = ""; } continue; }
    token += char;
  }
  if (escaped) throw new Error("命令末尾包含未完成的转义符");
  if (quote) throw new Error("命令中的引号未闭合");
  if (token) tokens.push(token);
  return tokens;
}

function draftFromDockerRun(command: string): ContainerDraft {
  const tokens = commandTokens(command);
  const draft = { ...emptyContainerDraft };
  let index = 0;
  if (tokens[index] === "sudo") index += 1;
  if (tokens[index] !== "docker") throw new Error("命令需以 docker run 开始");
  index += 1;
  if (tokens[index] === "container") index += 1;
  if (tokens[index] !== "run") throw new Error("命令需以 docker run 开始");
  index += 1;
  const takeValue = (value: string, longOption: string, shortOption?: string) => {
    if (value === longOption || value === shortOption) {
      const next = tokens[index + 1];
      if (!next || next.startsWith("-") && !/^-[^\s]+:[^\s]+$/.test(next)) throw new Error(`${value} 后缺少参数`);
      index += 1;
      return next;
    }
    if (value.startsWith(`${longOption}=`)) return value.slice(longOption.length + 1);
    if (shortOption && value.startsWith(shortOption) && value.length > shortOption.length) return value.slice(shortOption.length);
    return "";
  };
  const append = (key: "ports" | "env" | "volumes", value: string) => {
    if (!value.trim()) throw new Error("Docker 参数值不能为空");
    draft[key] += `${draft[key] ? "\n" : ""}${value}`;
  };
  for (; index < tokens.length; index += 1) {
    const value = tokens[index];
    if (value === "-d" || value === "--detach") continue;
    if (value === "--restart" || value.startsWith("--restart=")) {
      const policy = takeValue(value, "--restart");
      if (!["no", "always", "unless-stopped", "on-failure"].includes(policy)) throw new Error(`不支持的重启策略：${policy}`);
      draft.restartPolicy = policy as DockerRestartPolicy;
      continue;
    }
    if (value === "--name" || value.startsWith("--name=")) { draft.name = takeValue(value, "--name"); continue; }
    if (value === "-p" || value === "--publish" || value.startsWith("--publish=") || value.startsWith("-p") && value.length > 2) { append("ports", takeValue(value, "--publish", "-p")); continue; }
    if (value === "-e" || value === "--env" || value.startsWith("--env=") || value.startsWith("-e") && value.length > 2) { append("env", takeValue(value, "--env", "-e")); continue; }
    if (value === "-v" || value === "--volume" || value.startsWith("--volume=") || value.startsWith("-v") && value.length > 2) { append("volumes", takeValue(value, "--volume", "-v")); continue; }
    if (value.startsWith("-")) throw new Error(`当前创建表单暂不支持参数 ${value}`);
    if (!draft.image) draft.image = value;
    else throw new Error("命令暂不支持镜像后的容器启动命令");
  }
  if (!draft.image) throw new Error("请在命令中填写镜像名称");
  return draft;
}

function dockerResourceCommand(kind: Exclude<DockerResourceDialog, null>, value: string, driver = "") {
  if (kind === "image") return value.trim() ? `docker pull ${shellQuote(value)}` : "docker pull";
  if (kind === "network") return `docker network create --driver ${shellQuote(driver || "bridge")}${value.trim() ? ` ${shellQuote(value)}` : ""}`;
  return `docker volume create --driver ${shellQuote(driver || "local")}${value.trim() ? ` ${shellQuote(value)}` : ""}`;
}

function parseDockerResourceCommand(kind: Exclude<DockerResourceDialog, null>, command: string) {
  const tokens = commandTokens(command);
  if (kind === "image") {
    if (tokens[0] !== "docker" || tokens[1] !== "pull" || !tokens[2] || tokens.length > 3) throw new Error("命令需使用 docker pull 镜像名称");
    return { value: tokens[2], driver: "" };
  }
  const resource = kind === "network" ? "network" : "volume";
  if (tokens[0] !== "docker" || tokens[1] !== resource || tokens[2] !== "create") throw new Error(`命令需使用 docker ${resource} create`);
  let driver = kind === "network" ? "bridge" : "local";
  let value = "";
  for (let index = 3; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--driver" || token === "-d") {
      driver = tokens[++index] || "";
      continue;
    }
    if (token.startsWith("--driver=")) {
      driver = token.slice("--driver=".length);
      continue;
    }
    if (token.startsWith("-")) throw new Error(`当前创建表单暂不支持参数 ${token}`);
    if (value) throw new Error("命令中只能指定一个名称");
    value = token;
  }
  if (!driver.trim()) throw new Error("驱动名称不能为空");
  return { value, driver };
}

export function DockerWorkspace({
  connection,
  reachable,
  search,
  notify,
  confirmInApp,
}: {
  connection: Connection;
  reachable?: number;
  search: string;
  notify: Notify;
  confirmInApp: (title: string, message: string, confirmLabel?: string, destructive?: boolean) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<DockerTab>("containers");
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [networks, setNetworks] = useState<DockerNetwork[]>([]);
  const [volumes, setVolumes] = useState<DockerVolume[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<DockerLogs | null>(null);
  const [logTail, setLogTail] = useState("300");
  const [inspect, setInspect] = useState<string | null>(null);
  const [pullImage, setPullImage] = useState("");
  const [newContainer, setNewContainer] = useState<ContainerDraft>(emptyContainerDraft);
  const [containerCommand, setContainerCommand] = useState(dockerRunCommand(emptyContainerDraft));
  const [containerCommandError, setContainerCommandError] = useState<string | null>(null);
  const [createContainerOpen, setCreateContainerOpen] = useState(false);
  const [newNetwork, setNewNetwork] = useState("");
  const [newNetworkDriver, setNewNetworkDriver] = useState("bridge");
  const [newVolume, setNewVolume] = useState("");
  const [newVolumeDriver, setNewVolumeDriver] = useState("local");
  const [resourceDialog, setResourceDialog] = useState<DockerResourceDialog>(null);
  const [resourceCommand, setResourceCommand] = useState("");
  const [resourceCommandError, setResourceCommandError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<{ version?: { Version?: string; ApiVersion?: string }; info?: Record<string, unknown> } | null>(null);

  const load = useCallback(async () => {
    if (reachable === undefined) return;
    setBusy(true); setError(null);
    try {
      const [nextContainers, nextImages, nextNetworks, nextVolumes] = await Promise.all([
        dockerListContainers(connection.id), dockerListImages(connection.id), dockerListNetworks(connection.id), dockerListVolumes(connection.id),
      ]);
      setContainers(nextContainers); setImages(nextImages); setNetworks(nextNetworks); setVolumes(nextVolumes);
      void dockerDashboard(connection.id).then(setDashboard).catch(() => setDashboard(null));
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }, [connection.id, reachable]);

  useEffect(() => { void load(); }, [load]);

  const visibleContainers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? containers.filter((item) => `${containerName(item)} ${item.Image || ""} ${item.Status || ""}`.toLowerCase().includes(query)) : containers;
  }, [containers, search]);
  const visibleImages = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? images.filter((item) => `${item.Id} ${(item.RepoTags || []).join(" ")}`.toLowerCase().includes(query)) : images;
  }, [images, search]);
  const visibleNetworks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? networks.filter((item) => `${item.Name || ""} ${item.Driver || ""}`.toLowerCase().includes(query)) : networks;
  }, [networks, search]);
  const visibleVolumes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? volumes.filter((item) => `${item.Name} ${item.Driver || ""}`.toLowerCase().includes(query)) : volumes;
  }, [volumes, search]);
  const availableImageTags = useMemo(() => Array.from(new Set(images.flatMap((image) => image.RepoTags?.length ? image.RepoTags : image.Id ? [image.Id] : []).filter(Boolean))).sort((left, right) => left.localeCompare(right)), [images]);

  function openResourceDialog(kind: Exclude<DockerResourceDialog, null>) {
    const value = kind === "image" ? pullImage : kind === "network" ? newNetwork : newVolume;
    const driver = kind === "network" ? newNetworkDriver : kind === "volume" ? newVolumeDriver : "";
    setResourceCommand(dockerResourceCommand(kind, value, driver));
    setResourceCommandError(null);
    setResourceDialog(kind);
  }

  function updateResourceDraft(kind: Exclude<DockerResourceDialog, null>, value: string, driver?: string) {
    if (kind === "image") setPullImage(value);
    if (kind === "network") { setNewNetwork(value); if (driver !== undefined) setNewNetworkDriver(driver); }
    if (kind === "volume") { setNewVolume(value); if (driver !== undefined) setNewVolumeDriver(driver); }
    setResourceCommand(dockerResourceCommand(kind, value, driver));
    setResourceCommandError(null);
  }

  function updateResourceCommand(value: string) {
    setResourceCommand(value);
    if (!resourceDialog) return;
    if (!value.trim()) {
      if (resourceDialog === "image") setPullImage("");
      if (resourceDialog === "network") setNewNetwork("");
      if (resourceDialog === "volume") setNewVolume("");
      setResourceCommandError(null);
      return;
    }
    try {
      const parsed = parseDockerResourceCommand(resourceDialog, value);
      if (resourceDialog === "image") setPullImage(parsed.value);
      if (resourceDialog === "network") { setNewNetwork(parsed.value); setNewNetworkDriver(parsed.driver); }
      if (resourceDialog === "volume") { setNewVolume(parsed.value); setNewVolumeDriver(parsed.driver); }
      setResourceCommandError(null);
    } catch (cause) {
      setResourceCommandError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function closeResourceDialog() {
    if (busy) return;
    setResourceDialog(null);
    setResourceCommandError(null);
  }

  function updateContainerDraft(field: ContainerDraftKey, value: string) {
    const next = { ...newContainer, [field]: value };
    setNewContainer(next);
    setContainerCommand(dockerRunCommand(next));
    setContainerCommandError(null);
  }

  function openCreateContainer() {
    setNewContainer(emptyContainerDraft);
    setContainerCommand(dockerRunCommand(emptyContainerDraft));
    setContainerCommandError(null);
    setCreateContainerOpen(true);
  }

  function updateContainerCommand(value: string) {
    setContainerCommand(value);
    if (!value.trim()) {
      setNewContainer(emptyContainerDraft);
      setContainerCommandError(null);
      return;
    }
    try {
      setNewContainer(draftFromDockerRun(value));
      setContainerCommandError(null);
    } catch (cause) {
      setContainerCommandError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function action(container: DockerContainer, value: "start" | "stop" | "restart" | "pause" | "unpause" | "remove") {
    const id = container.Id;
    if (!id) return;
    if (value === "remove" && !(await confirmInApp("删除容器", `确定删除容器“${containerName(container)}”吗？此操作无法撤销。`, "删除", true))) return;
    const key = `${id}:${value}`;
    if (actionKey) return;
    setActionKey(key);
    try { await dockerContainerAction(connection.id, id, value); notify("success", "容器操作已完成"); await load(); }
    catch (cause) { notify("error", String(cause)); }
    finally { setActionKey(null); }
  }

  async function showLogs(container: DockerContainer) {
    if (!container.Id) return;
    if (actionKey) return;
    const key = `${container.Id}:logs`;
    setActionKey(key);
    try { setLogTail("300"); setLogs({ id: container.Id, name: containerName(container), text: await dockerContainerLogs(connection.id, container.Id, 300) }); }
    catch (cause) { notify("error", String(cause)); }
    finally { setActionKey(null); }
  }

  async function refreshLogs() {
    if (!logs) return;
    const tail = Math.max(1, Math.min(5000, Number.parseInt(logTail, 10) || 300));
    setLogTail(String(tail));
    try { setLogs({ ...logs, text: await dockerContainerLogs(connection.id, logs.id, tail) }); }
    catch (cause) { notify("error", String(cause)); }
  }

  async function showInspect(container: DockerContainer) {
    if (!container.Id) return;
    if (actionKey) return;
    const key = `${container.Id}:inspect`;
    setActionKey(key);
    try { setInspect(JSON.stringify(await dockerInspectContainer(connection.id, container.Id), null, 2)); }
    catch (cause) { notify("error", String(cause)); }
    finally { setActionKey(null); }
  }

  async function removeImage(image: DockerImage) {
    if (!(await confirmInApp("删除镜像", `确定删除“${image.RepoTags?.join(", ") || image.Id.slice(0, 12)}”吗？`, "删除", true))) return;
    try { await dockerRemoveImage(connection.id, image.Id); notify("success", "镜像已删除"); await load(); }
    catch (cause) { notify("error", String(cause)); }
  }

  async function pull() {
    if (!pullImage.trim() || resourceCommandError) return;
    setBusy(true);
    try { await dockerPullImage(connection.id, pullImage.trim()); setPullImage(""); setResourceDialog(null); setResourceCommandError(null); notify("success", "镜像拉取完成"); await load(); }
    catch (cause) { notify("error", String(cause)); }
    finally { setBusy(false); }
  }

  async function createContainer() {
    if (!newContainer.image.trim() || containerCommandError) return;
    setBusy(true);
    try {
      const splitList = (value: string) => value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
      const splitLines = (value: string) => value.split(/\n/).map((item) => item.trim()).filter(Boolean);
      const id = await dockerCreateContainer(connection.id, newContainer.name.trim(), newContainer.image.trim(), splitList(newContainer.ports), splitLines(newContainer.env), splitList(newContainer.volumes), newContainer.restartPolicy);
      await dockerContainerAction(connection.id, id, "start");
      setNewContainer(emptyContainerDraft); setContainerCommand(dockerRunCommand(emptyContainerDraft)); setContainerCommandError(null); setCreateContainerOpen(false);
      notify("success", "容器已创建并启动"); await load();
    }
    catch (cause) { notify("error", String(cause)); }
    finally { setBusy(false); }
  }

  async function removeNetwork(network: DockerNetwork) {
    if (!network.Id || !(await confirmInApp("删除网络", `确定删除网络“${network.Name || network.Id}”吗？`, "删除", true))) return;
    try { await dockerRemoveNetwork(connection.id, network.Id); notify("success", "网络已删除"); await load(); }
    catch (cause) { notify("error", String(cause)); }
  }
  async function removeVolume(volume: DockerVolume) {
    if (!(await confirmInApp("删除卷", `确定删除卷“${volume.Name}”吗？其中的数据可能无法恢复。`, "删除", true))) return;
    try { await dockerRemoveVolume(connection.id, volume.Name); notify("success", "卷已删除"); await load(); }
    catch (cause) { notify("error", String(cause)); }
  }
  async function createNetwork() {
    if (!newNetwork.trim() || resourceCommandError) return;
    setBusy(true);
    try { await dockerCreateNetwork(connection.id, newNetwork.trim(), newNetworkDriver.trim() || "bridge"); setNewNetwork(""); setNewNetworkDriver("bridge"); setResourceDialog(null); setResourceCommandError(null); notify("success", "网络已创建"); await load(); }
    catch (cause) { notify("error", String(cause)); }
    finally { setBusy(false); }
  }
  async function createVolume() {
    if (!newVolume.trim() || resourceCommandError) return;
    setBusy(true);
    try { await dockerCreateVolume(connection.id, newVolume.trim(), newVolumeDriver.trim() || "local"); setNewVolume(""); setNewVolumeDriver("local"); setResourceDialog(null); setResourceCommandError(null); notify("success", "卷已创建"); await load(); }
    catch (cause) { notify("error", String(cause)); }
    finally { setBusy(false); }
  }
  async function showNetwork(network: DockerNetwork) {
    if (!network.Id) return;
    try { setInspect(JSON.stringify(await dockerInspectNetwork(connection.id, network.Id), null, 2)); }
    catch (cause) { notify("error", String(cause)); }
  }
  async function showVolume(volume: DockerVolume) {
    try { setInspect(JSON.stringify(await dockerInspectVolume(connection.id, volume.Name), null, 2)); }
    catch (cause) { notify("error", String(cause)); }
  }

  if (reachable === undefined) return <div className="docker-connect-gate"><Boxes size={34} /><b>Docker 尚未连接</b><span>点击右上角“连接”按钮后，才能查看容器和镜像资源。</span></div>;

  const info = dashboard?.info || {};
  const infoNumber = (key: string) => typeof info[key] === "number" ? Number(info[key]).toLocaleString() : "—";

  const tabs: { value: DockerTab; label: string; icon: typeof Container }[] = [
    { value: "containers", label: "容器", icon: Container }, { value: "images", label: "镜像", icon: Boxes }, { value: "networks", label: "网络", icon: Network }, { value: "volumes", label: "卷", icon: HardDrive },
  ];
  const resourceTitle = resourceDialog === "image" ? "拉取镜像" : resourceDialog === "network" ? "创建网络" : "创建卷";
  const resourceValue = resourceDialog === "image" ? pullImage : resourceDialog === "network" ? newNetwork : newVolume;
  const resourceDriver = resourceDialog === "network" ? newNetworkDriver : newVolumeDriver;
  const resourceDriverOptions = resourceDialog === "network"
    ? [{ value: "bridge", label: "bridge" }, { value: "overlay", label: "overlay" }, { value: "host", label: "host" }, { value: "macvlan", label: "macvlan" }]
    : [{ value: "local", label: "local" }, { value: "nfs", label: "nfs" }];
  const isActionPending = (container: DockerContainer, value: string) => actionKey === `${container.Id}:${value}`;
  const isContainerBusy = (container: DockerContainer) => Boolean(container.Id && actionKey?.startsWith(`${container.Id}:`));
  const actionIcon = (container: DockerContainer, value: string, Icon: typeof Pause) => isActionPending(container, value) ? <LoaderCircle size={14} className="spin" /> : <Icon size={14} />;
  return <div className="docker-manager">
    <div className="docker-toolbar">
      <div className="docker-tabs">{tabs.map(({ value, label, icon: Icon }) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}><Icon size={15} />{label}<small>{value === "containers" ? containers.length : value === "images" ? images.length : value === "networks" ? networks.length : volumes.length}</small></button>)}</div>
      <div className="docker-toolbar-actions"><button className="icon-button small" title="刷新" disabled={busy} onClick={() => void load()}><RefreshCw size={14} className={busy ? "spin" : ""} /></button></div>
    </div>
    {error && <div className="docker-error"><X size={14} />{error}</div>}
    <div className="docker-overview-strip"><div><span>引擎版本</span><b>{dashboard?.version?.Version || "—"}</b></div><div><span>容器</span><b>{infoNumber("Containers")}</b></div><div><span>镜像</span><b>{infoNumber("Images")}</b></div><div><span>CPU</span><b>{infoNumber("NCPU")}</b></div><div><span>内存</span><b>{typeof info.MemTotal === "number" ? formatBytes(info.MemTotal) : "—"}</b></div></div>
    {tab === "containers" && <section className="docker-resource-panel docker-container-panel">
      <div className="docker-panel-head">
        <div><b>容器</b><span>管理运行中的服务和应用</span></div>
        <button className="secondary-button" disabled={busy} onClick={openCreateContainer}><Container size={14} />创建容器</button>
      </div>
      <div className="docker-container-grid">
        {visibleContainers.map((item) => <article className="docker-container-card" key={item.Id}>
          <div className="docker-container-card-head">
            <div className="docker-card-icon"><Container size={17} /></div>
            <div className="docker-container-identity"><b>{containerName(item)}</b><code>{item.Id || "—"}</code></div>
            <span className={`docker-state ${item.State || ""}`}><i />{item.Status || item.State || "未知"}</span>
          </div>
          <div className="docker-container-details">
            <div className="docker-container-detail docker-container-image"><small>镜像</small><code>{item.Image || "—"}</code></div>
            <div className="docker-container-detail"><small>端口</small><div className="docker-container-ports">{item.Ports?.length ? item.Ports.map((port, index) => <code key={`${port.PrivatePort}-${port.PublicPort || "internal"}-${index}`}>{port.PublicPort ? `${port.PublicPort}:` : ""}{port.PrivatePort}/{port.Type || "tcp"}</code>) : <span>—</span>}</div></div>
            <div className="docker-container-detail"><small>创建时间</small><span>{formatDate(item.Created)}</span></div>
          </div>
          <div className="docker-container-actions"><div className="docker-row-actions">
            {item.State === "running" ? <><button className={isActionPending(item, "pause") ? "is-busy" : ""} disabled={isContainerBusy(item)} title="暂停" aria-label="暂停" onClick={() => void action(item, "pause")}>{actionIcon(item, "pause", Pause)}</button><button className={isActionPending(item, "stop") ? "is-busy" : ""} disabled={isContainerBusy(item)} title="停止" aria-label="停止" onClick={() => void action(item, "stop")}>{actionIcon(item, "stop", CircleStop)}</button></> : item.State === "paused" ? <button className={isActionPending(item, "unpause") ? "is-busy" : ""} disabled={isContainerBusy(item)} title="恢复" aria-label="恢复" onClick={() => void action(item, "unpause")}>{actionIcon(item, "unpause", Play)}</button> : <button className={isActionPending(item, "start") ? "is-busy" : ""} disabled={isContainerBusy(item)} title="启动" aria-label="启动" onClick={() => void action(item, "start")}>{actionIcon(item, "start", Play)}</button>}
            <button className={isActionPending(item, "restart") ? "is-busy" : ""} disabled={isContainerBusy(item)} title="重启" aria-label="重启" onClick={() => void action(item, "restart")}>{actionIcon(item, "restart", RotateCcw)}</button>
            <button className={isActionPending(item, "logs") ? "is-busy" : ""} disabled={isContainerBusy(item)} title="日志" aria-label="日志" onClick={() => void showLogs(item)}>{actionIcon(item, "logs", FileText)}</button>
            <button className={isActionPending(item, "inspect") ? "is-busy" : ""} disabled={isContainerBusy(item)} title="详情" aria-label="详情" onClick={() => void showInspect(item)}>{actionIcon(item, "inspect", Code2)}</button>
            <button className={`danger ${isActionPending(item, "remove") ? "is-busy" : ""}`} disabled={isContainerBusy(item)} title="删除" aria-label="删除" onClick={() => void action(item, "remove")}>{actionIcon(item, "remove", Trash2)}</button>
          </div></div>
        </article>)}
        {!visibleContainers.length && <div className="docker-empty">{busy ? "读取容器中…" : "暂无容器"}</div>}
      </div>
    </section>}
    {tab === "images" && <section className="docker-resource-panel"><div className="docker-panel-head"><div><b>镜像</b><span>拉取、查看和清理本地镜像</span></div><button className="secondary-button" disabled={busy} onClick={() => openResourceDialog("image")}><Download size={14} />拉取镜像</button></div><div className="docker-card-grid">{visibleImages.map((image) => <article className="docker-resource-card" key={image.Id}><div className="docker-card-icon"><Boxes size={18} /></div><div className="docker-card-main"><b>{image.RepoTags?.join(", ") || "未标记镜像"}</b><code>{image.Id.replace(/^sha256:/, "").slice(0, 16)}</code><span>{formatBytes(image.Size)} · {formatDate(image.Created)}</span></div><button className="icon-button small danger-button" title="删除镜像" onClick={() => void removeImage(image)}><Trash2 size={14} /></button></article>)}{!visibleImages.length && <div className="docker-empty">{busy ? "读取镜像中…" : "暂无镜像"}</div>}</div></section>}
    {tab === "networks" && <section className="docker-resource-panel"><div className="docker-panel-head"><div><b>网络</b><span>查看和创建 Docker 网络</span></div><button className="secondary-button" disabled={busy} onClick={() => openResourceDialog("network")}><Network size={14} />创建网络</button></div><div className="docker-card-grid">{visibleNetworks.map((network) => <article className="docker-resource-card" key={network.Id}><div className="docker-card-icon"><Network size={18} /></div><div className="docker-card-main"><b>{network.Name || "未命名网络"}</b><span>{network.Driver || "—"} · {network.Scope || "local"}</span><code>{network.Id?.slice(0, 16)}</code></div><button className="icon-button small" title="详情" onClick={() => void showNetwork(network)}><Code2 size={14} /></button><button className="icon-button small danger-button" title="删除网络" onClick={() => void removeNetwork(network)}><Trash2 size={14} /></button></article>)}{!visibleNetworks.length && <div className="docker-empty">暂无网络</div>}</div></section>}
    {tab === "volumes" && <section className="docker-resource-panel"><div className="docker-panel-head"><div><b>卷</b><span>查看和创建持久化数据卷</span></div><button className="secondary-button" disabled={busy} onClick={() => openResourceDialog("volume")}><HardDrive size={14} />创建卷</button></div><div className="docker-card-grid">{visibleVolumes.map((volume) => <article className="docker-resource-card" key={volume.Name}><div className="docker-card-icon"><HardDrive size={18} /></div><div className="docker-card-main"><b>{volume.Name}</b><span>{volume.Driver || "local"} · {volume.Scope || "local"}</span><code>{volume.Mountpoint || "—"}</code></div><button className="icon-button small" title="详情" onClick={() => void showVolume(volume)}><Code2 size={14} /></button><button className="icon-button small danger-button" title="删除卷" onClick={() => void removeVolume(volume)}><Trash2 size={14} /></button></article>)}{!visibleVolumes.length && <div className="docker-empty">暂无卷</div>}</div></section>}
    {resourceDialog && <div className="docker-overlay" onMouseDown={(event) => event.target === event.currentTarget && closeResourceDialog()}><div className="docker-modal docker-create-modal connection-dialog" onMouseDown={(event) => event.stopPropagation()}>
      <header className="dialog-header"><div><b>{resourceTitle}</b><span>填写参数或直接编辑 Docker 命令，两边会自动同步</span></div><button className="icon-button small" title="关闭" onClick={closeResourceDialog}><X size={15} /></button></header>
      <div className="docker-create-body">
        <div className="docker-create-fields">
          <div className="docker-create-section-title"><b>资源参数</b><span>修改参数后命令会立即更新</span></div>
          <label><span>{resourceDialog === "image" ? "镜像名称" : resourceDialog === "network" ? "网络名称" : "卷名称"} <i>*</i></span><input value={resourceValue} onChange={(event) => updateResourceDraft(resourceDialog, event.target.value, resourceDriver)} placeholder={resourceDialog === "image" ? "如 nginx:latest" : resourceDialog === "network" ? "如 app-network" : "如 app-data"} /></label>
          {resourceDialog !== "image" && <label><span>驱动</span><DropdownSelect className="docker-create-dropdown" value={resourceDriver} ariaLabel="选择驱动" options={resourceDriverOptions} onChange={(value) => updateResourceDraft(resourceDialog, resourceValue, value)} /></label>}
        </div>
        <div className="docker-create-command">
          <div className="docker-create-section-title"><b>Docker 命令</b><span>编辑命令会反向填充上面的参数</span></div>
          <textarea className={resourceCommandError ? "has-error" : ""} value={resourceCommand} onChange={(event) => updateResourceCommand(event.target.value)} spellCheck={false} aria-label="Docker 创建命令" />
          {resourceCommandError && <div className="docker-command-hint error">{resourceCommandError}</div>}
        </div>
      </div>
      <footer className="docker-create-footer dialog-footer"><button className="secondary-button" onClick={closeResourceDialog}>取消</button><button className="primary-button" disabled={!resourceValue.trim() || !!resourceCommandError || busy} onClick={() => void (resourceDialog === "image" ? pull() : resourceDialog === "network" ? createNetwork() : createVolume())}>{resourceDialog === "image" ? <Download size={14} /> : resourceDialog === "network" ? <Network size={14} /> : <HardDrive size={14} />}{busy ? "处理中…" : resourceTitle}</button></footer>
    </div></div>}
    {createContainerOpen && <div className="docker-overlay" onMouseDown={(event) => event.target === event.currentTarget && setCreateContainerOpen(false)}><div className="docker-modal docker-create-modal connection-dialog" onMouseDown={(event) => event.stopPropagation()}>
      <header className="dialog-header"><div><b>创建容器</b><span>填写参数或直接编辑 Docker 创建命令，两边会自动同步</span></div><button className="icon-button small" title="关闭" onClick={() => setCreateContainerOpen(false)}><X size={15} /></button></header>
      <div className="docker-create-body">
        <div className="docker-create-fields">
          <div className="docker-create-section-title"><b>容器参数</b><span>修改参数后命令会立即更新</span></div>
          <label><span>容器名称</span><input value={newContainer.name} onChange={(event) => updateContainerDraft("name", event.target.value)} placeholder="可选，如 web" /></label>
          <label><span>镜像 <i>*</i></span><DropdownSelect className="docker-create-dropdown" value={availableImageTags.includes(newContainer.image) ? newContainer.image : ""} ariaLabel="选择镜像" placeholder={availableImageTags.length ? "从本地镜像选择…" : "暂无本地镜像，可手动输入"} options={availableImageTags.map((tag) => ({ value: tag, label: tag }))} onChange={(value) => updateContainerDraft("image", value)} /><input value={newContainer.image} onChange={(event) => updateContainerDraft("image", event.target.value)} placeholder="也可以直接输入镜像，如 nginx:latest" /></label>
          <label><span>端口映射</span><textarea value={newContainer.ports} onChange={(event) => updateContainerDraft("ports", event.target.value)} placeholder="一行一个，如 8080:80" rows={2} /></label>
          <label><span>环境变量</span><textarea value={newContainer.env} onChange={(event) => updateContainerDraft("env", event.target.value)} placeholder="一行一个，如 NODE_ENV=production" rows={2} /></label>
          <label><span>目录挂载</span><textarea value={newContainer.volumes} onChange={(event) => updateContainerDraft("volumes", event.target.value)} placeholder="一行一个，如 /host:/container" rows={2} /></label>
          <label><span>Docker 重启策略</span><DropdownSelect className="docker-create-dropdown" value={newContainer.restartPolicy} ariaLabel="Docker 重启策略" options={[{ value: "no", label: "不自动重启" }, { value: "always", label: "始终重启" }, { value: "unless-stopped", label: "除非手动停止，否则重启" }, { value: "on-failure", label: "仅失败时重启" }]} onChange={(value) => updateContainerDraft("restartPolicy", value as DockerRestartPolicy)} /></label>
        </div>
        <div className="docker-create-command">
          <div className="docker-create-section-title"><b>Docker 创建命令</b><span>编辑命令会反向填充上面的参数</span></div>
          <textarea className={containerCommandError ? "has-error" : ""} value={containerCommand} onChange={(event) => updateContainerCommand(event.target.value)} spellCheck={false} aria-label="Docker 创建命令" />
          {containerCommandError && <div className="docker-command-hint error">{containerCommandError}</div>}
        </div>
      </div>
      <footer className="docker-create-footer dialog-footer"><button className="secondary-button" onClick={() => setCreateContainerOpen(false)}>取消</button><button className="primary-button" disabled={!newContainer.image.trim() || !!containerCommandError || busy} onClick={() => void createContainer()}><Container size={14} />{busy ? "创建中…" : "创建并启动"}</button></footer>
    </div></div>}
    {logs && <div className="docker-overlay" onMouseDown={(event) => event.target === event.currentTarget && setLogs(null)}><div className="docker-modal"><header><div><b>{logs.name}</b><span>容器日志</span></div><div className="docker-log-tools"><label><span>行数</span><input type="number" min="1" max="5000" value={logTail} onChange={(event) => setLogTail(event.target.value)} /></label><button className="secondary-button" disabled={busy} onClick={() => void refreshLogs()}>刷新</button><button className="icon-button small" onClick={() => setLogs(null)}><X size={15} /></button></div></header><pre>{logs.text || "暂无日志"}</pre></div></div>}
    {inspect && <div className="docker-overlay" onMouseDown={(event) => event.target === event.currentTarget && setInspect(null)}><div className="docker-modal"><header><div><b>容器详情</b><span>Docker inspect</span></div><button className="icon-button small" onClick={() => setInspect(null)}><X size={15} /></button></header><pre>{inspect}</pre></div></div>}
  </div>;
}
