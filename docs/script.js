// Configuration & State
const BASE_URL = "https://api.etherscan.io/v2/api";
let state = {
    apiKey: localStorage.getItem('eth_whale_api_key') || '',
    threshold: parseFloat(localStorage.getItem('eth_whale_threshold')) || 100,
    interval: parseInt(localStorage.getItem('eth_whale_interval')) || 10,
    aliases: JSON.parse(localStorage.getItem('eth_whale_aliases') || '{}'),
    chartVisible: localStorage.getItem('eth_whale_chart_visible') !== 'false',
    timeframe: 'hour', // minute, hour, day
    currentBlock: 0,
    whalesCount: 0,
    totalEthMoved: 0,
    isMonitoring: false,
    timer: null,
    chart: null,
    candleSeries: null
};

// DOM Elements
const elements = {
    apiKey: document.getElementById('api-key'),
    toggleChart: document.getElementById('toggle-chart'),
    chartSection: document.getElementById('chart-section'),
    timeframeBtns: document.querySelectorAll('.tf-btn'),
    threshold: document.getElementById('eth-threshold'),
    interval: document.getElementById('refresh-interval'),
    startBtn: document.getElementById('start-btn'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    currentBlock: document.getElementById('current-block'),
    whalesCount: document.getElementById('whales-count'),
    totalEthMoved: document.getElementById('total-eth-moved'),
    txFeed: document.getElementById('tx-feed'),
    clearBtn: document.getElementById('clear-feed'),
    aliasModal: document.getElementById('alias-modal'),
    modalAddress: document.getElementById('modal-address'),
    aliasInput: document.getElementById('alias-input'),
    saveAliasBtn: document.getElementById('save-alias'),
    closeModalBtn: document.getElementById('close-modal')
};

// Initial setup from localStorage
elements.apiKey.value = state.apiKey;
elements.threshold.value = state.threshold;
elements.interval.value = state.interval;
elements.toggleChart.checked = state.chartVisible;
elements.chartSection.style.display = state.chartVisible ? 'block' : 'none';

// Chart Initialization
async function initChart() {
    const chartOptions = {
        layout: {
            background: { color: 'transparent' },
            textColor: '#94a3b8',
        },
        grid: {
            vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
            horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: 'rgba(255, 255, 255, 0.1)',
        },
        timeScale: {
            borderColor: 'rgba(255, 255, 255, 0.1)',
            timeVisible: true,
        },
    };

    state.chart = LightweightCharts.createChart(document.getElementById('chart-container'), chartOptions);
    state.candleSeries = state.chart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
    });

    await fetchChartData();
}

async function fetchChartData() {
    try {
        // Fetch 200 items for the selected timeframe
        const limit = 200;
        const response = await fetch(`https://min-api.cryptocompare.com/data/v2/histo${state.timeframe}?fsym=ETH&tsym=USD&limit=${limit}`);
        const data = await response.json();

        if (data.Data && data.Data.Data) {
            const formattedData = data.Data.Data.map(d => ({
                time: d.time,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
            }));
            state.candleSeries.setData(formattedData);
            state.chart.timeScale().fitContent();
        }
    } catch (e) {
        console.error("Chart data fetch error:", e);
    }
}

function addChartMarker(valueEth, address) {
    if (!state.candleSeries) return;

    const time = Math.floor(Date.now() / 1000);
    const alias = state.aliases[address.toLowerCase()] || 'Whale';

    const markers = state.candleSeries.getMarkers() || [];
    markers.push({
        time: time,
        position: 'aboveBar',
        color: '#3b82f6',
        shape: 'circle',
        text: `${valueEth.toFixed(0)} ETH (${alias})`,
        size: 2
    });

    state.candleSeries.setMarkers(markers);
}

// Functions
async function fetchLatestBlock() {
    const params = new URLSearchParams({
        chainid: "1",
        module: "proxy",
        action: "eth_blockNumber",
        apikey: state.apiKey
    });
    try {
        const response = await fetch(`${BASE_URL}?${params}`);
        const data = await response.json();
        if (data.result && typeof data.result === 'string') {
            return parseInt(data.result, 16);
        }
    } catch (e) {
        console.error("Block fetch error:", e);
    }
    return null;
}

async function fetchBlockTransactions(blockNumber) {
    const params = new URLSearchParams({
        chainid: "1",
        module: "proxy",
        action: "eth_getBlockByNumber",
        tag: "0x" + blockNumber.toString(16),
        boolean: "true",
        apikey: state.apiKey
    });
    try {
        const response = await fetch(`${BASE_URL}?${params}`);
        const data = await response.json();
        if (data.result && data.result.transactions) {
            return data.result.transactions;
        }
    } catch (e) {
        console.error("Tx fetch error:", e);
    }
    return [];
}

function updateStats(valueEth) {
    state.whalesCount++;
    state.totalEthMoved += valueEth;
    elements.whalesCount.textContent = state.whalesCount;
    elements.totalEthMoved.textContent = `${state.totalEthMoved.toLocaleString()} ETH`;
}

function getDisplayAddress(address) {
    if (state.aliases[address.toLowerCase()]) {
        return `<span class="alias-name">${state.aliases[address.toLowerCase()]}</span>`;
    }
    return `<span class="mono-address">${address.slice(0, 6)}...${address.slice(-4)}</span>`;
}

function addTransactionToFeed(tx, valueEth) {
    const time = new Date().toLocaleTimeString();
    const item = document.createElement('div');
    item.className = 'tx-item';

    item.innerHTML = `
        <div class="tx-header">
            <span class="tx-value">🐋 ${valueEth.toFixed(2)} ETH</span>
            <span class="tx-time">${time}</span>
        </div>
        <div class="tx-details">
            <div class="tx-row">
                <strong>От:</strong> ${getDisplayAddress(tx.from)}
                <button class="btn-alias" onclick="openAliasModal('${tx.from}')">Имя</button>
            </div>
            <div class="tx-row">
                <strong>Кому:</strong> ${getDisplayAddress(tx.to || 'Unknown')}
                <button class="btn-alias" onclick="openAliasModal('${tx.to}')">Имя</button>
            </div>
            <a href="https://etherscan.io/tx/${tx.hash}" target="_blank" class="tx-link">🔗 View on Etherscan</a>
        </div>
    `;

    // Remove empty state message
    const empty = elements.txFeed.querySelector('.empty-feed');
    if (empty) empty.remove();

    elements.txFeed.prepend(item);
}

async function scanNewBlocks() {
    if (!state.isMonitoring) return;

    const latest = await fetchLatestBlock();
    if (latest && latest > state.currentBlock) {
        if (state.currentBlock === 0) {
            state.currentBlock = latest;
        } else {
            for (let b = state.currentBlock + 1; b <= latest; b++) {
                elements.currentBlock.textContent = b;
                const transactions = await fetchBlockTransactions(b);
                transactions.forEach(tx => {
                    const val = parseInt(tx.value, 16) / 1e18;
                    if (val >= state.threshold) {
                        addTransactionToFeed(tx, val);
                        updateStats(val);
                        // All transactions above threshold appear on chart as red arrows
                        addChartMarker(val, tx.from);
                    }
                });
            }
            state.currentBlock = latest;
        }
    }

    state.timer = setTimeout(scanNewBlocks, state.interval * 1000);
}

// Event Handlers
elements.toggleChart.addEventListener('change', (e) => {
    state.chartVisible = e.target.checked;
    localStorage.setItem('eth_whale_chart_visible', state.chartVisible);
    elements.chartSection.style.display = state.chartVisible ? 'block' : 'none';
    if (state.chartVisible && state.chart) {
        // Redraw or resize chart when shown
        state.chart.applyOptions({ width: elements.chartSection.clientWidth - 48 });
    }
});

// Timeframe Button Listeners
elements.timeframeBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        const tf = btn.dataset.tf;
        if (tf === state.timeframe) return;

        // Update UI
        elements.timeframeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update State & Fetch
        state.timeframe = tf;
        await fetchChartData();
    });
});

elements.startBtn.addEventListener('click', () => {
    if (state.isMonitoring) {
        state.isMonitoring = false;
        clearTimeout(state.timer);
        elements.startBtn.innerHTML = '<i data-lucide="play"></i> Запустить мониторинг';
        elements.statusDot.classList.remove('active');
        elements.statusText.textContent = 'Остановлено';
        lucide.createIcons();
    } else {
        // Save settings
        state.apiKey = elements.apiKey.value.trim();
        state.threshold = parseFloat(elements.threshold.value) || 100;
        state.interval = parseInt(elements.interval.value) || 10;

        if (!state.apiKey) {
            alert("Пожалуйста, введите API Key");
            return;
        }

        localStorage.setItem('eth_whale_api_key', state.apiKey);
        localStorage.setItem('eth_whale_threshold', state.threshold);
        localStorage.setItem('eth_whale_interval', state.interval);

        state.isMonitoring = true;
        state.currentBlock = 0; // Reset to catch next block
        elements.startBtn.innerHTML = '<i data-lucide="square"></i> Остановить';
        elements.statusDot.classList.add('active');
        elements.statusText.textContent = 'Работает';
        lucide.createIcons();
        scanNewBlocks();
    }
});

elements.clearBtn.addEventListener('click', () => {
    elements.txFeed.innerHTML = '<div class="empty-feed"><p>Лента очищена</p></div>';
    state.whalesCount = 0;
    state.totalEthMoved = 0;
    elements.whalesCount.textContent = '0';
    elements.totalEthMoved.textContent = '0 ETH';
});

// Alias Modal Logic
window.openAliasModal = function (address) {
    if (!address) return;
    state.pendingAddress = address.toLowerCase();
    elements.modalAddress.textContent = address;
    elements.aliasInput.value = state.aliases[state.pendingAddress] || '';
    elements.aliasModal.classList.add('active');
};

elements.saveAliasBtn.addEventListener('click', () => {
    const alias = elements.aliasInput.value.trim();
    if (alias) {
        state.aliases[state.pendingAddress] = alias;
    } else {
        delete state.aliases[state.pendingAddress];
    }
    localStorage.setItem('eth_whale_aliases', JSON.stringify(state.aliases));
    elements.aliasModal.classList.remove('active');
    // Refresh feed to show new names (optional)
});

elements.closeModalBtn.addEventListener('click', () => {
    elements.aliasModal.classList.remove('active');
});

// Pills interaction
document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
        const val = pill.dataset.val;
        const parentInput = pill.closest('.input-with-suggest').querySelector('input');
        parentInput.value = val;
    });
});

// Initialize Chart on load
initChart();
