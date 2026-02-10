import requests
import time
import os
import sys

# Configuration
# Ideally set via environment variable, or input at runtime
API_KEY = os.environ.get("ETHERSCAN_API_KEY")
BASE_URL = "https://api.etherscan.io/v2/api"
LARGE_TX_THRESHOLD = 100  # ETH threshold for "Whale" alert

def get_latest_block_number(api_key):
    """Get the latest block number."""
    params = {
        "chainid": "1",
        "module": "proxy",
        "action": "eth_blockNumber",
        "apikey": api_key
    }
    try:
        response = requests.get(BASE_URL, params=params, timeout=10)
        data = response.json()
        if "result" in data:
            if isinstance(data["result"], str) and data["result"].startswith("0x"):
                return int(data["result"], 16)
        elif data.get("message") == "NOTOK":
             return "RATE_LIMIT"
    except Exception as e:
        print(f"Error fetching block number: {e}")
    return None

def get_block_transactions(block_number, api_key):
    """Get all transactions in a specific block."""
    params = {
        "chainid": "1",
        "module": "proxy",
        "action": "eth_getBlockByNumber",
        "tag": hex(block_number),
        "boolean": "true",
        "apikey": api_key
    }
    try:
        response = requests.get(BASE_URL, params=params, timeout=10)
        data = response.json()
        if "result" in data and data["result"]:
            return data["result"]["transactions"]
    except Exception as e:
        print(f"Error fetching block transactions: {e}")
    return []

def main():
    global API_KEY
    
    # Simple CLI Prompt
    if not API_KEY:
        print("--- Etherscan Whale Tracker ---")
        print("To monitor transactions, we need an Etherscan API Key.")
        API_KEY = input("Enter your API Key: ").strip()
    
    if not API_KEY:
        print("Error: API Key is required to proceed.")
        return

    print(f"\n🚀 Starting Surveillance...")
    print(f"🎯 Threshold: > {LARGE_TX_THRESHOLD} ETH")
    print(f"📡 Connecting to Mainnet via Etherscan...")
    
    current_block = get_latest_block_number(API_KEY)
    if not current_block or current_block == "RATE_LIMIT":
        print("❌ Failed to connect or rate limited. Check your API Key.")
        return

    print(f"✅ Connected! Most recent block: {current_block}")
    print("Beginning scalable monitoring (Press Ctrl+C to stop)...\n")

    while True:
        try:
            # Check for new block
            latest = get_latest_block_number(API_KEY)
            
            if latest == "RATE_LIMIT":
                time.sleep(2)
                continue

            if latest and latest > current_block:
                print(f"📦 Block {latest} mined. Scanning transactions...")
                
                transactions = get_block_transactions(latest, API_KEY)
                
                count = 0
                for tx in transactions:
                    # Convert Hex Value to Ether
                    try:
                        value_wei = int(tx['value'], 16)
                        value_eth = value_wei / 10**18
                        
                        if value_eth >= LARGE_TX_THRESHOLD:
                            print(f"\n🚨 WHALE ALERT! {value_eth:.2f} ETH moved!")
                            print(f"   From: {tx['from']}")
                            print(f"   To:   {tx['to']}")
                            print(f"   Tx:   https://etherscan.io/tx/{tx['hash']}")
                            count += 1
                    except:
                        continue
                
                if count == 0:
                   print(f"   (No transactions > {LARGE_TX_THRESHOLD} ETH found in this block)")

                current_block = latest
            
            # Rate limit compliance (Free tier is 5 req/sec)
            time.sleep(4) 
            
        except KeyboardInterrupt:
            print("\n🛑 Surveillance stopped by user.")
            break
        except Exception as e:
            print(f"⚠️  Loop Error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()
