<template>
    <div class="container py-5" style="max-width: 620px">
        <div class="card shadow-sm">
            <div class="card-body p-4 text-center">
                <h1 class="mb-2">Welcome to Factology</h1>
                <p class="text-muted mb-4">
                    Everything you store here is kept on this device. An <b>identity</b> is what makes
                    data yours — the same identity can be used on all your apps via an identity file.
                </p>

                <div class="d-grid gap-2 col-8 mx-auto mb-4">
                    <button class="btn btn-primary btn-lg" data-testid="welcome-create" @click="goToIdentity">
                        Create a new identity
                    </button>
                    <button class="btn btn-outline-primary btn-lg" data-testid="welcome-import" @click="goToIdentity">
                        Import an existing identity
                    </button>
                </div>

                <div class="small">
                    <a href="#" @click.prevent="continueAsGuest" data-testid="welcome-guest">
                        Continue as guest — browse shared data without an identity
                    </a>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useIdentityStore } from '../stores/identity';

const router = useRouter();
const identityStore = useIdentityStore();

onMounted(async () => {
    await identityStore.restore();
    // An identity appeared (or the user is already a guest) — no gate needed.
    if (identityStore.items.length > 0 || identityStore.guestMode) {
        router.replace({ name: 'dashboard' });
    }
});

function goToIdentity() {
    router.push('/identity');
}

async function continueAsGuest() {
    await identityStore.enterGuest();
    router.push({ name: 'dashboard' });
}
</script>
