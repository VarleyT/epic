const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const generateHtmlTemplate = require('./template');

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
    // 默认数据兜底
    const mainGame = current[0] || { 
        title: "暂无活动", 
        description: "目前没有正在进行的免费活动，请稍后再来。", 
        imageUrl: "", 
        link: "#",
        endTime: new Date() 
    };

    // 直接调用合并后的模板函数，传入原始数组数据
    const htmlContent = generateHtmlTemplate(mainGame, upcoming);

    const distDir = path.join(__dirname, 'public');
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);   
    fs.writeFileSync(path.join(distDir, 'index.html'), htmlContent);
    
    const faviconFile = 'favicon.png';
    if (fs.existsSync(faviconFile)) {
        fs.copyFileSync(faviconFile, path.join(distDir, 'favicon.png'));
    }
    console.log("✅ 响应式页面已生成，数据已同步。");
}

fetchEpicData();