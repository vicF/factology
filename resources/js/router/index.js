import { createWebHistory, createWebHashHistory, createRouter } from 'vue-router'

// Use hash history for Capacitor builds (no server), web history for browser SPA
const history = import.meta.env.VITE_TARGET === 'capacitor'
  ? createWebHashHistory()
  : createWebHistory()

/* Guest Component */
const Login = () => import('@/components/Login.vue')
const Register = () => import('@/components/Register.vue')
/* Guest Component */

/* Layouts */
const DahboardLayout = () => import('@/components/layouts/Default.vue')
/* Layouts */

/* Authenticated Component */
const Search = () => import('@/components/Search.vue')
/* Authenticated Component */

const Object = () => import('@/components/Object.vue')
const Identity = () => import('@/components/Identity.vue')
const WelcomeGate = () => import('@/components/WelcomeGate.vue')

const Tools = () => import('@/components/Tools.vue')
const Logs = () => import('@/components/Logs.vue')


const routes = [

    {
        path: "/",
        component: DahboardLayout,
        meta: {
            //middleware: "guest"
            //middleware: "auth"
        },
        children: [
            {
                name: "dashboard",
                path: '/',
                component: Search,
                meta: {
                    title: `Dashboard`
                }
            },
            {
                name: "login",
                path: "/login",
                component: Login,
                meta: {
                    title: `Login`
                }
            },
            {
                name: "register",
                path: "/register",
                component: Register,
                meta: {
                    title: `Register`
                }
            },
            {
                name: "object",
                path: "/object/:uid",
                component: Object,
                meta: {
                    title: `Object`
                }
            },
            {
                name: "identity",
                path: "/identity",
                component: Identity,
                meta: {
                    title: `Identity`,
                    isIdentityFlow: true
                }
            },
            {
                name: "welcome",
                path: "/welcome",
                component: WelcomeGate,
                meta: {
                    title: `Welcome`,
                    isIdentityFlow: true
                }
            },
            {
                name: "tools",
                path: "/tools",
                component: Tools,
                meta: {
                    title: `Tools`
                }
            },
            {
                name: "logs",
                path: "/logs",
                component: Logs,
                meta: {
                    title: `Logs`
                }
            }
        ]
    }
]

const router = createRouter({
    history,
    routes, // short for `routes: routes`
    scrollBehavior() {
        // Always scroll to top on route change
        return { top: 0, behavior: 'smooth' }
    }
})

// Solution: Reset body overflow after every route change
router.afterEach(() => {
    // Force the body to be scrollable again
    document.body.style.overflow = 'auto';
    // Remove any inline styles that might have been left on HTML
    document.documentElement.style.overflow = 'auto';
});

// Identity gate — offline (standalone) builds only. Web/server mode keeps its
// server-account flow untouched.
const IS_STANDALONE = import.meta.env.VITE_TARGET === 'capacitor' && !import.meta.env.VITE_API_URL;

// Navigation guard: show loading bar on route change
router.beforeEach(async (to, from, next) => {
    document.body.classList.add('page-loading');

    if (IS_STANDALONE) {
        const { useIdentityStore } = await import('../stores/identity');
        const identityStore = useIdentityStore();
        await identityStore.restore();

        // No identity stored yet:
        //   - a deliberate guest (guestMode) goes straight in,
        //   - identity-flow pages (/welcome, /identity) stay reachable,
        //   - otherwise first run lands on the Welcome gate.
        if (identityStore.items.length === 0) {
            if (!identityStore.guestMode && !to.meta?.isIdentityFlow) {
                return next({ name: 'welcome' });
            }
            return next();
        }

        // An identity is stored: keep the Welcome page out of reach and, when a
        // passphrase-protected identity must be unlocked before the app is
        // usable, park the user on the Identity manager (reopen = unlock).
        if (to.name === 'welcome') {
            return next({ name: 'dashboard' });
        }
        const primary = identityStore.primaryItem;
        const primaryLocked = primary
            && primary.requirePassphraseOnOpen
            && !identityStore.unlockedSet.has(primary.thingId);
        const needsUnlock = !identityStore.unlocked || primaryLocked;
        if (needsUnlock && !to.meta?.isIdentityFlow) {
            return next({ path: '/identity', query: { reopen: '1' } });
        }
    }

    if (to.name === 'register') {
        const { useAuthStore } = await import('../stores/auth');
        const authStore = useAuthStore();
        if (!authStore.registrationEnabled) {
            return next({ name: 'login' });
        }
    }
    next();
});

router.afterEach(() => {
    document.body.classList.remove('page-loading');
});

export default router
