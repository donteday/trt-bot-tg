const { HttpsProxyAgent } = require('https-proxy-agent');

const proxyUrls = [
  process.env.PROXY_URL,
  process.env.PROXY_URL_2,
].filter(Boolean);

if (proxyUrls.length === 0) throw new Error('Не задан ни один PROXY_URL');

const agents = proxyUrls.map(url => new HttpsProxyAgent(url, { keepAlive: true }));
let currentIndex = 0;

function getAgent() {
  return agents[currentIndex];
}

function switchAgent() {
  if (agents.length < 2) return false;
  currentIndex = (currentIndex + 1) % agents.length;
  console.log(`🔄 Переключился на прокси ${currentIndex + 1} (${proxyUrls[currentIndex].replace(/:\/\/.*@/, '://***@')})`);
  return true;
}

module.exports = { getAgent, switchAgent };
