const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

// 基础配置
const rootUrl = 'https://store.epicgames.com';
const locale = 'zh-CN';
const country = 'CN';
const apiUrl = `https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=${locale}&country=${country}&allowCountries=${country}`;
const contentBaseUrl = `https://store-content-ipv4.ak.epicgames.com/api/${locale}/content`;

async function fetchEpicData() {
    try {
        console.log("🚀 开始抓取 Epic 免费游戏数据...");
        const response = await axios.get(apiUrl);
        const now = dayjs();
        const elements = response.data.data.Catalog.searchStore.elements;

        // 1. 处理当前免费游戏
        const currentItems = await Promise.all(
            elements.filter(item => 
                item.promotions?.promotionalOffers?.length > 0 &&
                item.promotions.promotionalOffers[0].promotionalOffers[0].discountSetting.discountPercentage === 0 &&
                dayjs(item.promotions.promotionalOffers[0].promotionalOffers[0].startDate) <= now &&
                dayjs(item.promotions.promotionalOffers[0].promotionalOffers[0].endDate) > now
            ).map(item => processGameItem(item, true))
        );

        // 2. 处理未来预告游戏
        const upcomingItems = await Promise.all(
            elements.filter(item => 
                item.promotions?.upcomingPromotionalOffers?.length > 0 &&
                item.promotions.upcomingPromotionalOffers[0].promotionalOffers[0].discountSetting.discountPercentage === 0
            ).map(item => processGameItem(item, false))
        );

        generateHtml(currentItems, upcomingItems);
    } catch (error) {
        console.error("❌ 抓取失败:", error);
    }
}

// 核心解析逻辑：处理 Slug、链接和描述
async function processGameItem(item, isCurrent) {
    let link = `${rootUrl}/${locale}/p/`;
    let contentUrl = `${contentBaseUrl}/products/`;
    let isBundles = item.categories.some((category) => category.path === 'bundles');

    if (isBundles) {
        link = `${rootUrl}/${locale}/bundles/`;
        contentUrl = `${contentBaseUrl}/bundles/`;
    }

    // 严格遵循 index.ts 的 Slug 优先级逻辑
    let linkSlug = item.catalogNs.mappings?.[0]?.pageSlug || 
                   item.offerMappings?.[0]?.pageSlug || 
                   (item.productSlug ?? item.urlSlug);
    
    if (item.offerType === 'ADD_ON' && item.offerMappings?.length > 0) {
        linkSlug = item.offerMappings[0].pageSlug;
    }

    link += linkSlug;
    contentUrl += linkSlug;

    // 针对 Bundles 类型的描述抓取逻辑
    let description = item.description;
    if (isBundles) {
        try {
            const contentResp = await axios.get(contentUrl);
            description = contentResp.data.about?.shortDescription || item.description;
        } catch (e) {}
    }

    const wideImage = item.keyImages.find(img => img.type === 'OfferImageWide')?.url || item.keyImages[0]?.url;
    const promo = isCurrent ? item.promotions.promotionalOffers[0].promotionalOffers[0] 
                           : item.promotions.upcomingPromotionalOffers[0].promotionalOffers[0];

    return {
        title: item.title,
        description,
        imageUrl: wideImage,
        link,
        endTime: promo.endDate,
        startTime: promo.startDate
    };
}

function generateHtml(current, upcoming) {
    const gamesData = current.length > 0 ? current : [{ 
        title: "暂无活动", 
        description: "请稍后再来查看", 
        imageUrl: "", 
        link: "#",
        endTime: dayjs().add(7, 'day').toISOString() 
    }];
    const mainGame = gamesData[0];
    
    const upcomingHtml = upcoming.map(game => `
        <div class="bg-zinc-900/40 border border-white/5 rounded-3xl overflow-hidden group hover:border-blue-500/50 transition-all duration-500">
            <div class="relative h-44 overflow-hidden">
                <img src="${game.imageUrl}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700">
                <div class="absolute top-4 left-4">
                    <span class="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-widest text-blue-400 border border-blue-400/20">下周预告</span>
                </div>
            </div>
            <div class="p-6">
                <h3 class="font-bold text-lg mb-2 text-zinc-100">${game.title}</h3>
                <p class="text-zinc-500 text-xs line-clamp-2 mb-4 leading-relaxed">${game.description || ''}</p>
                <div class="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <span class="uppercase opacity-50">开启时间</span>
                    <span>${dayjs(game.startTime).format('YYYY年MM月DD日 HH:mm:ss')}  (UTC+8)</span>
                </div>
            </div>
        </div>
    `).join('');

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EPIC 每周免费游戏</title>
    <link rel="icon" href="favicon.png" type="image/x-icon">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700;900&display=swap');
        body { background: #050505; color: white; font-family: 'Noto Sans SC', sans-serif; }
        .hero-mask { background: linear-gradient(to top, #050505 0%, rgba(5,5,5,0.8) 40%, transparent 100%); }
        .glass-btn { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
        .slide-nav-btn { cursor: pointer; opacity: 0.6; transition: all 0.3s; }
        .slide-nav-btn:hover { opacity: 1; }
        .slide-nav-btn svg { transition: transform 0.3s; }
        .slide-nav-btn:hover svg { transform: scale(1.1); }
        .progress-bar { height: 100%; background: white; width: 0%; transition: width linear; }
        .indicator-track { height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; overflow: hidden; cursor: pointer; transition: all 0.3s; }
        .indicator-active { width: 60px; }
        .indicator-inactive { width: 16px; }
        html { scroll-behavior: smooth; }
        #upcoming { scroll-margin-top: 1rem; }
    </style>
</head>
<body>
    <section class="relative min-h-screen w-full flex items-center justify-center py-20 overflow-hidden">
        <div class="absolute inset-0 -z-10">
            <img id="bg-image" src="${mainGame.imageUrl}" class="w-full h-full object-cover opacity-90 scale-105 transition-opacity duration-700">
            <div class="absolute inset-0 hero-mask"></div>
        </div>

        <div class="text-center px-6 max-w-5xl relative z-10">
            <!-- Navigation Arrows -->
            ${gamesData.length > 1 ? `
            <button onclick="prevSlide()" class="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 md:-translate-x-20 p-4 slide-nav-btn text-white/50 hover:text-white hidden md:block">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-10 h-10 md:w-12 md:h-12">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
            </button>
            <button onclick="nextSlide()" class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 md:translate-x-20 p-4 slide-nav-btn text-white/50 hover:text-white hidden md:block">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-10 h-10 md:w-12 md:h-12">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
            </button>
            ` : ''}

            <!-- Indicators -->
            ${gamesData.length > 1 ? `
            <div class="flex justify-center gap-3 mb-8">
                ${gamesData.map((_, idx) => `
                    <div onclick="goToSlide(${idx})" class="indicator-track ${idx === 0 ? 'indicator-active' : 'indicator-inactive'}" id="indicator-${idx}">
                        <div class="progress-bar" id="progress-${idx}"></div>
                    </div>
                `).join('')}
            </div>
            ` : ''}

            <div class="flex flex-wrap justify-center gap-4 mb-8">
                <div class="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-600/20">
                    <span class="relative flex h-2 w-2">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-100 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                    </span>
                    现在免费
                </div>

                <div class="inline-flex items-center gap-2 px-4 py-1.5 bg-green-600 rounded-full text-[10px] font-black uppercase tracking-[0.1em] shadow-xl shadow-green-600/20">
                    <span class="relative flex h-2 w-2">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-100 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                    </span>
                    <span id="end-time-text">截止时间: ${dayjs(mainGame.endTime).format('YYYY年MM月DD日 HH:mm:ss')}</span>
                </div>
            </div>
            
            <h1 id="game-title" class="text-4xl md:text-8xl lg:text-9xl font-black mb-6 tracking-tighter uppercase leading-none transition-all duration-500">${mainGame.title}</h1>
            <p id="game-desc" class="text-zinc-400 text-sm md:text-xl mb-8 max-w-3xl mx-auto leading-relaxed font-light transition-all duration-500 line-clamp-3 md:line-clamp-none">${mainGame.description}</p>
            
            <div class="glass-btn rounded-3xl p-6 md:p-8 mb-10 inline-block">
                <p class="text-zinc-500 text-[10px] uppercase mb-4 tracking-[0.3em]">距离活动结束仅剩</p>
                <div id="timer" class="text-2xl md:text-6xl font-black text-blue-500 flex gap-4 md:gap-8 justify-center items-baseline">
                    <span>--<small class="text-xs md:text-xl ml-1 text-zinc-600">天</small></span>
                    <span>--<small class="text-xs md:text-xl ml-1 text-zinc-600">时</small></span>
                    <span>--<small class="text-xs md:text-xl ml-1 text-zinc-600">分</small></span>
                    <span>--<small class="text-xs md:text-xl ml-1 text-zinc-600">秒</small></span>
                </div>
            </div>

            <div class="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
                <a id="claim-btn" href="${mainGame.link}" target="_blank" class="w-full md:w-auto bg-blue-600 text-white px-12 py-5 md:px-16 md:py-6 rounded-2xl font-black text-base md:text-lg hover:bg-blue-500 transition-all shadow-2xl shadow-blue-600/40 hover:-translate-y-1">立即领取</a>
                <a href="#upcoming" class="w-full md:w-auto glass-btn text-white px-8 py-5 md:px-10 md:py-6 rounded-2xl font-bold text-sm md:text-base hover:bg-white/10 transition-all">查看预告</a>
            </div>
        </div>
    </section>

    <section id="upcoming" class="container mx-auto px-6 pt-12 pb-32">
        <div class="flex items-center gap-6 mb-16">
            <h2 class="text-4xl font-black italic uppercase tracking-tighter">未来预告 / Upcoming</h2>
            <div class="h-px flex-1 bg-gradient-to-r from-zinc-800 to-transparent"></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            ${upcomingHtml}
        </div>
    </section>

    <footer class="py-20 border-t border-white/5 text-center">
        <p class="text-zinc-400 text-sm font-bold tracking-widest mb-2">
            Github <a href="https://github.com/VarleyT" target="_blank" class="hover:text-blue-400 transition-colors underline decoration-blue-500/30 underline-offset-4">@VarleyT</a>
        </p>
        <p class="text-zinc-600 text-[10px] uppercase tracking-[0.2em] opacity-80">
            Powerd by github action & page
        </p>
    </footer>

    <script>
        const games = ${JSON.stringify(gamesData)};
        let currentIndex = 0;
        let timerInterval;
        let slideInterval;
        const SLIDE_DURATION = 8000;

        function updateSlide(index) {
            const game = games[index];
            
            // Update Text Content with fade effect simulation
            const titleEl = document.getElementById('game-title');
            const descEl = document.getElementById('game-desc');
            
            titleEl.style.opacity = '0';
            descEl.style.opacity = '0';
            
            setTimeout(() => {
                titleEl.innerText = game.title;
                descEl.innerText = game.description || '';
                titleEl.style.opacity = '1';
                descEl.style.opacity = '1';
            }, 200);

            document.getElementById('claim-btn').href = game.link;
            document.getElementById('end-time-text').innerText = '截止时间: ' + dayjs(game.endTime).format('YYYY年MM月DD日 HH:mm:ss');
            
            // Update Background
            const bgImg = document.getElementById('bg-image');
            bgImg.style.opacity = '0';
            setTimeout(() => {
                bgImg.src = game.imageUrl;
                bgImg.onload = () => { bgImg.style.opacity = '0.9'; };
            }, 300);

            // Update Indicators
            if (games.length > 1) {
                document.querySelectorAll('[id^="indicator-"]').forEach((el, i) => {
                    const isCurrent = i === index;
                    el.className = "indicator-track " + (isCurrent ? 'indicator-active' : 'indicator-inactive');
                    const progress = el.querySelector('.progress-bar');
                    progress.style.transition = 'none';
                    progress.style.width = '0%';
                    
                    if (isCurrent) {
                        // Force reflow
                        progress.offsetHeight;
                        progress.style.transition = "width " + SLIDE_DURATION + "ms linear";
                        progress.style.width = '100%';
                    }
                });
            }

            // Restart Timer
            startCountdown(game.endTime);
        }

        function nextSlide() {
            if (games.length <= 1) return;
            currentIndex = (currentIndex + 1) % games.length;
            updateSlide(currentIndex);
            resetSlideTimer();
        }

        function prevSlide() {
            if (games.length <= 1) return;
            currentIndex = (currentIndex - 1 + games.length) % games.length;
            updateSlide(currentIndex);
            resetSlideTimer();
        }

        function goToSlide(index) {
            currentIndex = index;
            updateSlide(currentIndex);
            resetSlideTimer();
        }

        function resetSlideTimer() {
            if (games.length > 1) {
                clearInterval(slideInterval);
                slideInterval = setInterval(nextSlide, SLIDE_DURATION);
            }
        }

        function startCountdown(endTime) {
            if (timerInterval) clearInterval(timerInterval);
            const target = dayjs(endTime);
            const timerEl = document.getElementById('timer');
            
            const update = () => {
                const now = dayjs();
                const diff = target.diff(now);
                if (diff <= 0) {
                    timerEl.innerHTML = "<span class='text-zinc-500 uppercase'>活动已结束</span>";
                    return;
                }
                const d = Math.floor(diff / 86400000);
                const h = Math.floor((diff % 86400000) / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                
                timerEl.innerHTML = \`
                    <span>\${String(d).padStart(2,'0')}<small class="text-sm md:text-xl ml-1 text-zinc-600">天</small></span>
                    <span>\${String(h).padStart(2,'0')}<small class="text-sm md:text-xl ml-1 text-zinc-600">时</small></span>
                    <span>\${String(m).padStart(2,'0')}<small class="text-sm md:text-xl ml-1 text-zinc-600">分</small></span>
                    <span>\${String(s).padStart(2,'0')}<small class="text-sm md:text-xl ml-1 text-zinc-600">秒</small></span>
                \`;
            };
            timerInterval = setInterval(update, 1000);
            update();
        }
        
        // Initial setup
        updateSlide(0);
        if (games.length > 1) {
            resetSlideTimer();
        }
    </script>
</body>
</html>`;

    const distDir = path.join(__dirname, 'public');
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
    fs.writeFileSync(path.join(distDir, 'index.html'), htmlContent);
    const faviconFile = 'favicon.png';
    if (fs.existsSync(faviconFile)) {
        fs.copyFileSync(faviconFile, path.join(distDir, 'favicon.png'));
    }
    console.log("✅ index.html 已生成，倒计时和文案已更新。");
}

fetchEpicData();