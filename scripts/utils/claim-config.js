/**
 * SPDX-License-Identifier: CC0-1.0
 *
 * Configuration of the beneficiary tools, from environment variables (or .env):
 *
 *   INHERITOR_ENVIRONMENT       production (default) or test. Selects the registry and the key provider.
 *   INHERITOR_ETHEREUM_RPCS     Ethereum providers, comma-separated "Operator name=https://url" or bare URLs.
 *   INHERITOR_ARBITRUM_RPCS     Arbitrum providers, same format.
 *   INHERITOR_KEY_PROVIDER_URL  Key provider base URL (default: the environment's).
 *   INHERITOR_ARWEAVE_GATEWAYS  Arweave gateways, comma-separated, tried in order.
 *
 * At least two providers of different operators must answer for every chain read; more are used as replacements.
 * The registry is not configurable: it is the trust anchor that names the Inheritor contract.
 *
 * This work has been dedicated to the public domain under the CC0 1.0 Universal Public Domain Dedication.
 */

const { TwoProviderReader, httpTransport, parseProviderList } = require('./chain-reader');
const { DEFAULT_ARWEAVE_GATEWAYS } = require('./arweave');

// The V2.1.0 address registries on Ethereum; at the v3 cutover they name the v3 contracts.
const ENVIRONMENT_SETTINGS = {
    production: {
        registry: '0xe33AB05Eef0d1803ca564C9a1DFaC6797853D3d2',
        keyProviderUrl: 'https://keyprovider-prod.inheritor.workers.dev'
    },
    test: {
        registry: '0x8743E613486Df310cC549cd57860c28c8438892E',
        keyProviderUrl: 'https://keyprovider-test.inheritor.workers.dev'
    }
};

// Keyless public providers, as in the iOS app (checked 2026-10-23). Each operator counts once.
const DEFAULT_PROVIDERS = {
    ethereum: [
        { operator: 'Allnodes (publicnode)', url: 'https://ethereum-rpc.publicnode.com' },
        { operator: 'Tenderly', url: 'https://mainnet.gateway.tenderly.co' },
        { operator: 'dRPC', url: 'https://eth.drpc.org' },
        { operator: 'bloXroute', url: 'https://eth.rpc.blxrbdn.com' }
    ],
    arbitrum: [
        { operator: 'Offchain Labs', url: 'https://arb1.arbitrum.io/rpc' },
        { operator: 'Tenderly', url: 'https://arbitrum.gateway.tenderly.co' },
        { operator: 'Bware Labs (Blast)', url: 'https://arbitrum-one.public.blastapi.io' },
        { operator: 'Nodies', url: 'https://arb-pokt.nodies.app' }
    ]
};

function requireServiceUrl(name, value) {
    const url = new URL(value);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
        throw new Error(`${name} must use https`);
    }
    return value.replace(/\/+$/, '');
}

const list = (text) => text.split(',').map((s) => s.trim()).filter(Boolean);

function loadClaimConfig(env = process.env) {
    const environment = env.INHERITOR_ENVIRONMENT || 'production';
    const settings = ENVIRONMENT_SETTINGS[environment];
    if (!settings) throw new Error(`INHERITOR_ENVIRONMENT must be "production" or "test", not "${environment}"`);

    return {
        environment,
        registry: settings.registry,
        keyProviderUrl: requireServiceUrl('INHERITOR_KEY_PROVIDER_URL', env.INHERITOR_KEY_PROVIDER_URL || settings.keyProviderUrl),
        arweaveGateways: (env.INHERITOR_ARWEAVE_GATEWAYS ? list(env.INHERITOR_ARWEAVE_GATEWAYS) : DEFAULT_ARWEAVE_GATEWAYS)
            .map((gateway) => requireServiceUrl('INHERITOR_ARWEAVE_GATEWAYS', gateway)),
        providers: {
            ethereum: env.INHERITOR_ETHEREUM_RPCS ? parseProviderList(env.INHERITOR_ETHEREUM_RPCS) : DEFAULT_PROVIDERS.ethereum,
            arbitrum: env.INHERITOR_ARBITRUM_RPCS ? parseProviderList(env.INHERITOR_ARBITRUM_RPCS) : DEFAULT_PROVIDERS.arbitrum
        }
    };
}

/** Two-provider readers for both chains. The registry is on Ethereum, so every claim needs Ethereum providers. */
function buildReaders(config, { fetch = globalThis.fetch, policy } = {}) {
    const reader = (chainId, providers) => new TwoProviderReader({
        chainId,
        providers: providers.map(({ operator, url }) => httpTransport({ operator, url, fetch })),
        policy
    });
    return {
        ethereum: reader(1, config.providers.ethereum),
        arbitrum: reader(42161, config.providers.arbitrum)
    };
}

/** Provider hosts for display; full URLs may hold API keys and are never printed. */
function describeProviders(providers) {
    return providers.map(({ operator, url }) => `${operator} (${new URL(url).host})`).join(', ');
}

module.exports = { ENVIRONMENT_SETTINGS, DEFAULT_PROVIDERS, loadClaimConfig, buildReaders, describeProviders };
