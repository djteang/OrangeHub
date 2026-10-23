<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

const authorBlog = "https://czdgg.top/";
const githubRepo = import.meta.env.VITE_GITHUB_REPO || "djteang/OrangeHub";
const githubBase = `https://github.com/${githubRepo}`;
const releasesUrl = `${githubBase}/releases/latest`;

const windowsDownloadUrl = import.meta.env.VITE_WINDOWS_DOWNLOAD_URL || `${releasesUrl}/download/OrangeHub-Setup.exe`;
const downloads = [
  { key: "windows", name: "Windows", detail: "Windows 10 / 11 · x64", icon: "windows", file: windowsDownloadUrl, available: true },
  { key: "macos", name: "macOS", detail: "敬请期待", icon: "apple", file: "", available: false },
  { key: "linux", name: "Linux", detail: "敬请期待", icon: "linux", file: "", available: false },
];

const mobileMenuOpen = ref(false);
const activeSection = ref("features");
const isLight = ref(false);
const contactOpen = ref(false);
const navItems = [
  { id: "features", label: "功能" },
  { id: "download", label: "下载" },
  { id: "about", label: "作者" },
];
const themeLabel = computed(() => isLight.value ? "切换深色模式" : "切换浅色模式");

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  activeSection.value = id;
  mobileMenuOpen.value = false;
}
function toggleTheme() {
  isLight.value = !isLight.value;
  document.documentElement.dataset.productTheme = isLight.value ? "light" : "dark";
}
function handleScroll() {
  const offset = window.scrollY + 180;
  const current = [...navItems].reverse().find(({ id }) => {
    const section = document.getElementById(id);
    return section && section.offsetTop <= offset;
  });
  if (current) activeSection.value = current.id;
}
onMounted(() => window.addEventListener("scroll", handleScroll, { passive: true }));
onUnmounted(() => window.removeEventListener("scroll", handleScroll));
</script>

<template>
  <div class="product-site" @click="contactOpen = false">
    <header class="site-header">
      <a class="brand" href="#top" aria-label="OrangeHub 首页" @click="mobileMenuOpen = false"><span class="brand-mark"><img src="/orangehub-icon.png" alt="" /></span><span class="brand-name">Orange<span>Hub</span></span></a>
      <nav class="desktop-nav" aria-label="主导航"><button v-for="item in navItems" :key="item.id" type="button" :class="{ active: activeSection === item.id }" @click="scrollToSection(item.id)">{{ item.label }}</button></nav>
      <div class="header-actions">
        <button class="icon-action" type="button" :aria-label="themeLabel" :title="themeLabel" @click="toggleTheme"><svg v-if="!isLight" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg><svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"/></svg></button>
        <button class="menu-toggle" type="button" aria-label="打开菜单" :aria-expanded="mobileMenuOpen" @click="mobileMenuOpen = !mobileMenuOpen"><span></span><span></span></button>
      </div>
      <nav v-if="mobileMenuOpen" class="mobile-nav" aria-label="移动端导航"><button v-for="item in navItems" :key="item.id" type="button" @click="scrollToSection(item.id)">{{ item.label }}</button></nav>
    </header>

    <main id="top">
      <section class="hero section-wrap">
        <div class="hero-copy"><h1>连接你的<br /><em>整个工作台。</em></h1><p>SSH、文件、数据库与 Docker，放进一个轻量、专注的桌面工作区。</p><div class="hero-actions"><button class="primary-cta" type="button" @click="scrollToSection('download')">下载 <span>↓</span></button><a class="quiet-cta" :href="githubBase" target="_blank" rel="noreferrer">查看 GitHub <span>↗</span></a></div></div>
        <div class="hero-visual" aria-label="OrangeHub 工作区预览"><div class="visual-orbit orbit-one"></div><div class="visual-orbit orbit-two"></div><div class="workspace-window"><div class="window-bar"><span class="window-dots"><i></i><i></i><i></i></span><span class="window-title">OrangeHub <small>/ 工作台</small></span><span class="window-live"><i></i> LIVE</span></div><div class="window-body"><aside class="window-sidebar"><div class="mini-logo"><img src="/orangehub-icon.png" alt="" /></div><div class="mini-nav active"><b>▦</b><span>概览</span></div><div class="mini-nav"><b>⌁</b><span>连接</span><small>8</small></div><div class="mini-nav"><b>◷</b><span>活动</span></div><div class="mini-nav"><b>◫</b><span>容器</span><small>12</small></div><div class="mini-label">连接</div><div class="mini-connection"><i class="protocol ssh">S</i><span><b>生产服务器</b><small>192.168.1.12</small></span><em></em></div><div class="mini-connection"><i class="protocol db">DB</i><span><b>业务数据库</b><small>mysql · 3306</small></span><em></em></div><div class="mini-connection"><i class="protocol cache">R</i><span><b>缓存集群</b><small>redis · 6379</small></span><em></em></div><div class="mini-connection"><i class="protocol docker">D</i><span><b>Docker Engine</b><small>12 个容器运行中</small></span><em></em></div></aside><div class="window-main"><div class="mini-breadcrumb">个人工作区 <span>/</span> <b>概览</b></div><div class="mini-heading"><div><strong>工作台</strong><small>一眼掌握连接状态</small></div><button>＋ 新建连接</button></div><div class="mini-metrics"><div><small>服务器</small><strong>05</strong><span>全部正常</span></div><div><small>数据库</small><strong>03</strong><span>全部正常</span></div><div><small>容器</small><strong>12</strong><span>运行中</span></div></div><div class="mini-table"><div class="mini-table-head"><span>连接名称</span><span>类型</span><span>状态</span></div><div class="mini-table-row"><span><i class="protocol ssh">S</i><b>生产服务器</b></span><span class="tag green">SSH</span><span class="online"><i></i> 可达 · 12ms</span></div><div class="mini-table-row"><span><i class="protocol db">DB</i><b>业务数据库</b></span><span class="tag orange">MySQL</span><span class="online"><i></i> 可达 · 18ms</span></div><div class="mini-table-row"><span><i class="protocol cache">R</i><b>缓存集群</b></span><span class="tag purple">Redis</span><span class="offline">未连接</span></div><div class="mini-table-row"><span><i class="protocol docker">D</i><b>应用容器</b></span><span class="tag blue">Docker</span><span class="online"><i></i> 运行中 · 12</span></div></div></div></div></div><div class="float-card"><span class="float-icon">✦</span><div><b>AI 助手</b><small>用自然语言写 SQL</small></div></div></div>
      </section>

      <section id="features" class="features-section section-wrap"><div class="section-heading"><div><h2>少一点切换，<br /><em>多一点掌控。</em></h2></div><p>把日常运维需要的工具放在同一个上下文里。</p></div><div class="feature-grid"><article class="feature-card"><div class="feature-icon terminal-icon">⌘</div><span class="feature-index">01</span><h3>终端与文件</h3><p>SSH、SFTP / FTP 和主机操作，随时在手边。</p><div class="feature-line terminal-line"><span>$</span> docker ps <i>↵</i></div></article><article class="feature-card"><div class="feature-icon database-icon">◈</div><span class="feature-index">02</span><h3>数据库操作</h3><p>浏览表、键、集合，写 SQL，查看清晰结果。</p><div class="feature-line database-line"><span>SELECT</span> * FROM <b>orders</b></div></article><article class="feature-card"><div class="feature-icon shield-icon">✦</div><span class="feature-index">03</span><h3>本地优先</h3><p>凭据由主密码保护，数据留在你的设备上。</p><div class="feature-line security-line"><span>LOCAL VAULT</span><b> AES-256-GCM</b></div></article><article class="feature-card"><div class="feature-icon docker-icon">◫</div><span class="feature-index">04</span><h3>Docker 管理</h3><p>连接 Docker Engine，查看容器、镜像与服务，像 Portainer 一样完成日常管理。</p><div class="feature-line docker-line"><span>CONTAINERS</span> 12 running <i>●</i></div></article></div></section>

      <section id="download" class="download-section section-wrap"><div class="download-head"><div><h2>选择你的平台，<br /><em>立即开始。</em></h2></div><a class="release-link" :href="releasesUrl" target="_blank" rel="noreferrer">查看全部版本 <span>↗</span></a></div><div class="download-grid"><template v-for="item in downloads" :key="item.key"><a v-if="item.available" class="download-card" :href="item.file" target="_blank" rel="noreferrer"><span class="os-icon windows"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5 11 4.4v7.1H3V5.5Zm10-1.4L21 3v8.5h-8V4.1ZM3 13h8v7.1L3 19V13Zm10 0h8v8l-8-1.1V13Z"/></svg></span><span class="download-copy"><strong>{{ item.name }}</strong><small>{{ item.detail }}</small></span><span class="download-arrow">↓</span></a><div v-else class="download-card download-card-disabled" aria-disabled="true"><span class="os-icon" :class="item.icon"><svg v-if="item.icon === 'apple'" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.2 5.2c.7-.8 1.1-1.8 1-2.7-1 .1-2.1.7-2.8 1.5-.6.7-1.1 1.8-1 2.7 1 .1 2-.5 2.8-1.5ZM19.8 16.9c-.5 1.1-.8 1.6-1.5 2.5-1 1.4-2.5 3.2-4.4 3.2-1.6 0-2.1-1-3.9-1s-2.4 1-3.9 1c-1.9 0-3.3-1.7-4.3-3.1-2.9-4.2-3.2-9.1-1.4-11.7 1.3-1.9 3.4-3 5.3-3 1.9 0 3.1 1 4.7 1 1.5 0 2.4-1 4.5-1 1.6 0 3.3.7 4.5 2-.1.1-2.7 1.6-2.7 4.9 0 3.9 3.4 5.2 3.5 5.2-.1.3-.2.7-.4 1Z"/></svg><svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3 8v8l9 5 9-5V8l-9-5Z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg></span><span class="download-copy"><strong>{{ item.name }}</strong><small>{{ item.detail }}</small></span><span class="download-arrow">—</span></div></template></div></section>
    </main>

    <footer id="about" class="site-footer"><div class="section-wrap footer-inner"><div><a class="brand" href="#top"><span class="brand-mark"><img src="/orangehub-icon.png" alt="" /></span><span class="brand-name">Orange<span>Hub</span></span></a><p>为开发者打造的本地优先工作区。</p></div><div class="footer-links"><a :href="authorBlog" target="_blank" rel="noreferrer">作者博客 <span>↗</span></a><a :href="githubBase" target="_blank" rel="noreferrer">GitHub <span>↗</span></a><span class="contact-popover-wrap"><button class="footer-contact" type="button" aria-haspopup="dialog" :aria-expanded="contactOpen" @click.stop="contactOpen = !contactOpen">联系作者 <span>↗</span></button><span v-if="contactOpen" class="contact-popover" role="dialog" aria-label="联系作者" @click.stop><img src="/weixin.jpg" alt="作者微信二维码" /><small>扫码联系作者</small></span></span></div></div><div class="section-wrap footer-bottom"><span>© 2026 OrangeHub</span><span>Built by <a :href="authorBlog" target="_blank" rel="noreferrer">程序员橙子</a></span></div></footer>
  </div>
</template>


