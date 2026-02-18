<script lang="js">
/**
 * AddProfileModal - Add a profile to use in the app (extension or paste nsec).
 * Same structure and styling as GetStartedModal; "Add profile" language only.
 * nsec is stored in localStorage (as safe as in-browser gets).
 */
import Modal from "$lib/components/common/Modal.svelte";
import { Nostr } from "$lib/components/icons";
import { connect, connectWithNsec } from "$lib/stores/auth.svelte.js";

let { open = $bindable(false), onconnected } = $props();
let step = $state("choose"); // "choose" | "extension" | "nsec"
let nsecInput = $state("");
let isConnecting = $state(false);
let error = $state("");

$effect(() => {
    if (!open) {
        step = "choose";
        nsecInput = "";
        error = "";
    }
});

async function handleExtension() {
    isConnecting = true;
    error = "";
    try {
        const success = await connect();
        if (success) {
            open = false;
            onconnected?.();
        } else {
            error = "Failed to connect to Nostr extension";
        }
    } catch (err) {
        error = err instanceof Error ? err.message : "Failed to connect";
    } finally {
        isConnecting = false;
    }
}

async function handleNsecSubmit() {
    const input = nsecInput.trim();
    if (!input) {
        error = "Enter your secret key (nsec1... or hex)";
        return;
    }
    isConnecting = true;
    error = "";
    try {
        await connectWithNsec(input);
        open = false;
        onconnected?.();
    } catch (err) {
        error = err instanceof Error ? err.message : "Invalid key";
    } finally {
        isConnecting = false;
    }
}

function showNsecStep() {
    step = "nsec";
    error = "";
}
function showChoose() {
    step = "choose";
    nsecInput = "";
    error = "";
}
</script>

<Modal bind:open ariaLabel="Add profile to Chateau" maxWidth="max-w-md">
    <div class="modal-content">
        <h2 class="modal-title">Add profile</h2>

        {#if step === "choose"}
            <p class="description">Add a profile to use in the app. Choose how to add your Nostr key.</p>
            <div class="options">
                <button
                    type="button"
                    class="btn-secondary-large btn-secondary-modal w-full flex items-center justify-center gap-3"
                    disabled={isConnecting}
                    onclick={handleExtension}
                >
                    <Nostr variant="fill" color="hsl(var(--blurpleColor))" size={20} />
                    <span>Use browser extension</span>
                </button>
                <button
                    type="button"
                    class="btn-secondary-large btn-secondary-modal w-full flex items-center justify-center gap-3"
                    onclick={showNsecStep}
                >
                    <span class="option-icon">🔑</span>
                    <span>Paste secret key (nsec)</span>
                </button>
            </div>
            <p class="hint">Secret key is stored in this browser only. Use extension for better security.</p>
        {:else}
            <button type="button" class="back-link" onclick={showChoose}>← Back</button>
            <p class="description">Paste your nsec or 64-character hex private key. Stored locally in this browser.</p>
            <form class="nsec-form" onsubmit={(e) => { e.preventDefault(); handleNsecSubmit(); }}>
                <textarea
                    class="nsec-input"
                    placeholder="nsec1... or hex key"
                    bind:value={nsecInput}
                    rows="3"
                    disabled={isConnecting}
                    autocomplete="off"
                ></textarea>
                {#if error}
                    <p class="error-message">{error}</p>
                {/if}
                <button type="submit" class="btn-primary-large w-full" disabled={isConnecting || !nsecInput.trim()}>
                    {isConnecting ? "Adding…" : "Add profile"}
                </button>
            </form>
        {/if}
    </div>
</Modal>

<style>
    .modal-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 16px 16px 16px;
    }
    @media (min-width: 768px) {
        .modal-content {
            padding: 24px 24px 20px;
        }
    }
    .modal-title {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0 0 0.5rem;
    }
    .description {
        font-size: 1rem;
        color: hsl(var(--white66));
        margin: 0 0 1rem;
        text-align: center;
        line-height: 1.5;
    }
    .options {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 100%;
        margin-bottom: 0.75rem;
    }
    .option-icon {
        font-size: 1.25rem;
    }
    .hint {
        font-size: 0.8125rem;
        color: hsl(var(--white33));
        margin: 0;
    }
    .back-link {
        background: none;
        border: none;
        padding: 0;
        font-size: 0.875rem;
        color: hsl(var(--white66));
        cursor: pointer;
        margin-bottom: 0.5rem;
        align-self: flex-start;
    }
    .back-link:hover {
        color: hsl(var(--foreground));
    }
    .nsec-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        width: 100%;
    }
    .nsec-input {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border: 0.33px solid hsl(var(--white16));
        border-radius: 16px;
        background: hsl(var(--background));
        color: hsl(var(--foreground));
        font-size: 0.875rem;
        font-family: var(--font-mono);
        resize: vertical;
    }
    .error-message {
        font-size: 0.875rem;
        color: hsl(var(--destructive));
        margin: 0;
    }
</style>
