// Configuration & State
const BASE_URL = "https://api.etherscan.io/v2/api";
let state = {
    apiKey: localStorage.getItem('eth_whale_api_key') || '',
    threshold: parseFloat(localStorage.getItem('eth_whale_threshold')) || 100,
    interval: parseInt(localStorage.getItem('eth_whale_interval')) || 10,
    aliases: JSON.parse(localStorage.getItem('eth_whale_aliases') || '{}'),
    currentBlock: 0,
    whalesCount: 0,
    totalEthMoved: 0,
    isMonitoring: false,
    timer: null
};

// DOM Elements
const elements = {
    apiKey: document.getElementById('api-key'),
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
                    }
                });
            }
            state.currentBlock = latest;
        }
    }

    state.timer = setTimeout(scanNewBlocks, state.interval * 1000);
}

// Event Handlers
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
