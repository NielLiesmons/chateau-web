/**
 * Authentication store
 *
 * Manages user's Nostr identity: NIP-07 extension or pasted nsec (stored in localStorage).
 * Local-first: pubkey and optionally nsec persisted across sessions.
 */
import { ExtensionSigner } from 'applesauce-signers/signers/extension-signer';
import { PrivateKeySigner } from 'applesauce-signers';

const STORAGE_KEY = 'chateau:pubkey';
const NSEC_KEY = 'chateau:nsec';

let pubkey = $state(null);
let connecting = $state(false);
let initialized = $state(false);
let extensionSigner = null;
let nsecSigner = null;

function getExtensionSigner() {
    if (!extensionSigner) {
        extensionSigner = new ExtensionSigner();
    }
    return extensionSigner;
}

/**
 * Get the active signer (nsec if stored, otherwise extension).
 * Throws if not signed in.
 */
function getSigner() {
    if (nsecSigner) return nsecSigner;
    return getExtensionSigner();
}

export function getCurrentPubkey() {
    return pubkey;
}

export function getIsConnecting() {
    return connecting;
}

export function getIsSignedIn() {
    return pubkey !== null;
}

/**
 * Initialize auth from localStorage (pubkey; if nsec present, create PrivateKeySigner).
 */
export function initAuth() {
    if (initialized) return;
    if (typeof localStorage === 'undefined') {
        initialized = true;
        return;
    }
    const storedPubkey = localStorage.getItem(STORAGE_KEY);
    const storedNsec = localStorage.getItem(NSEC_KEY);
    if (storedNsec) {
        try {
            nsecSigner = PrivateKeySigner.fromKey(storedNsec);
            pubkey = storedPubkey;
        } catch {
            localStorage.removeItem(NSEC_KEY);
            pubkey = storedPubkey;
            nsecSigner = null;
        }
    } else {
        pubkey = storedPubkey;
    }
    initialized = true;
}

export async function connect() {
    if (typeof window === 'undefined') {
        console.warn('[Auth] Window not available');
        return false;
    }
    connecting = true;
    try {
        nsecSigner = null;
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(NSEC_KEY);
        }
        const s = getExtensionSigner();
        const userPubkey = await s.getPublicKey();
        pubkey = userPubkey;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, userPubkey);
        }
        return true;
    } catch (err) {
        console.error('[Auth] Failed to connect:', err);
        return false;
    } finally {
        connecting = false;
    }
}

/**
 * Connect using pasted nsec (or hex secret). Stored in localStorage; as safe as in-browser gets.
 */
export async function connectWithNsec(nsecOrHex) {
    if (typeof window === 'undefined') return false;
    const input = (nsecOrHex || '').trim();
    if (!input) return false;
    connecting = true;
    try {
        const key = input.startsWith('nsec') ? input : input.length === 64 && /^[0-9a-fA-F]+$/.test(input) ? input : null;
        if (!key) {
            throw new Error('Invalid format. Use nsec1... or 64-character hex.');
        }
        const s = PrivateKeySigner.fromKey(key);
        const userPubkey = await s.getPublicKey();
        nsecSigner = s;
        pubkey = userPubkey;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, userPubkey);
            localStorage.setItem(NSEC_KEY, key);
        }
        return true;
    } catch (err) {
        console.error('[Auth] connectWithNsec failed:', err);
        throw err;
    } finally {
        connecting = false;
    }
}

export function signOut() {
    pubkey = null;
    nsecSigner = null;
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(NSEC_KEY);
    }
}

export async function signEvent(event) {
    const s = getSigner();
    return await s.signEvent(event);
}
/**
 * Encrypt a message using NIP-04
 */
export async function encrypt(pubkey, plaintext) {
    const s = getSigner();
    if (!s.nip04) {
        throw new Error('NIP-04 encryption not supported by this signer');
    }
    return await s.nip04.encrypt(pubkey, plaintext);
}
/**
 * Decrypt a message using NIP-04
 */
export async function decrypt(pubkey, ciphertext) {
    const s = getSigner();
    if (!s.nip04) {
        throw new Error('NIP-04 decryption not supported by this signer');
    }
    return await s.nip04.decrypt(pubkey, ciphertext);
}
/**
 * Encrypt a message using NIP-44 (required for community form responses)
 */
export async function encrypt44(recipientPubkey, plaintext) {
    const s = getSigner();
    if (!s.nip44) {
        throw new Error('NIP-44 encryption not supported by this signer. Use a key that supports NIP-44 (e.g. add profile with nsec).');
    }
    return await s.nip44.encrypt(recipientPubkey, plaintext);
}
/**
 * Decrypt a message using NIP-44
 */
export async function decrypt44(senderPubkey, ciphertext) {
    const s = getSigner();
    if (!s.nip44) {
        throw new Error('NIP-44 decryption not supported by this signer.');
    }
    return await s.nip44.decrypt(senderPubkey, ciphertext);
}
